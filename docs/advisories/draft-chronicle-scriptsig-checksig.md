# DRAFT advisory — post-Chronicle, a signature check in the unlocking script did not sign the locking script

**NOT FILED. Drafted 2026-10-20; filing and publishing are Greg's decision.**

This file is the source a payload would be built from. Two things make the disclosure
decision his rather than a formality: the same gap exists in an **independent Rust
implementation**, found by the same run, so timing is a coordination question and not only
ours; and the affected pattern is narrow enough that a loud disclosure may do less good than
a quiet upgrade note. Both arguments are laid out under **Disclosure considerations** below.

---

**Summary**
Post-Chronicle, a signature check executing inside an unlocking script signed only that
script, where the network also requires the locking script — so verdicts disagree with
consensus in both directions

**CWE** CWE-436 (Interpretation Conflict), CWE-347 (Improper Verification of Cryptographic
Signature)

**Affected**

| ecosystem | package | vulnerable | patched |
|---|---|---|---|
| npm | `@smartledger/bsv` | `< 9.44.0` | `9.44.0` |
| npm | `@smartledger/bsv-core` | `< 1.11.0` | `1.11.0` |

**The ranges are measured, and an earlier draft of this file had the bsv bound wrong.** It said
`>= 9.15.0` on the reasoning that 9.15.0 introduced Chronicle flag handling. That was asserted
from the changelog and is false by about seventy releases: `SCRIPT_CHRONICLE` has existed since
**v8.0.0**, and no version before 9.44.0 ever appended the locking script.

Measured by running the 40 reference-judged vectors against published artifacts, reporting
agreement per group so this defect is distinguishable from any other cause — the signature of
*this* defect alone is `chronicle-off 8/8, output-era-only 8/8, chronicle-on 0/8,
block-era-only 0/8`:

| version | off | out-era | chr-on | chr+spo | blk-era |
|---|---|---|---|---|---|
| bsv 8.0.0, 9.0.0, 9.11.0 | 8/8 | 8/8 | 0/8 | **4/8** | 0/8 |
| bsv 9.15.0, 9.20.0, 9.30.0, 9.37.0, 9.43.0 | 8/8 | 8/8 | 0/8 | 0/8 | 0/8 |
| core 1.0.0, 1.3.0, 1.6.0, 1.10.0 | 8/8 | 8/8 | 0/8 | 0/8 | 0/8 |

Two things that table says and prose would hide. The `chronicle-on-sigpushonly` group scores
4/8 below 9.15.0 and 0/8 from 9.15.0, so SIGPUSHONLY handling changed there and that group is
not a clean probe of this defect at older versions — the other four groups are. And core shows
the identical signature at **every version from 1.0.0**, with every flag name present, so its
`< 1.11.0` is exact.

**Below bsv 8.0.0 the comparison is NOT equivalent and is deliberately not claimed as
measured.** At 3.3.2, 5.4.0, 7.5.5 and 7.8.1, four flag constants do not exist at all —
`SCRIPT_GENESIS`, `SCRIPT_UTXO_AFTER_GENESIS`, `SCRIPT_CHRONICLE`,
`SCRIPT_UTXO_AFTER_CHRONICLE` — so asking those versions by name sets four fewer bits than the
reference was given. Their numbers happen to look the same, and that is a coincidence of a
different question, not evidence. The append is absent there too, so a caller passing the raw
flag integer would still diverge; that is reasoning rather than measurement and the range stays
`< 9.44.0` on the strength of the append being absent, not on those rows.

`smartledger-bsv` (unscoped) is not listed: it predates all of this and is already deprecated
in full.

**Severity** `AV:N/AC:H/PR:N/UI:N/S:U/C:N/I:H/A:N` — 5.9, medium, pending review. `AC:H` is
deliberate: it needs a signature check inside an *unlocking* script, and post-Chronicle it also
needs a transaction version above 1 to clear the SIGPUSHONLY rule. Neither is what wallet code
does. What is lost where it applies is integrity, in both directions.

### Impact

`bitcoin-sv` v1.2.3, `src/script/interpreter.cpp` 1475-1480, and the same block at 1571-1576
for `OP_CHECKMULTISIG`:

```cpp
// checksigData contains scriptPubKey if we are executing within a scriptSig
if(checksigData && IsChronicle(flags))
{
    // Post-Chronicle, a CHECKSIG in the scriptSig signs everything
    // from the most recent codeseparator to the end of this
    // scriptSig + scriptPubKey
    scriptCode += *checksigData;
}
```

`VerifyScript` supplies it at 2338, passing `&scriptPubKey` while the unlocking script is
evaluated, and `nullptr` at 2358 (the locking script) and 2402 (a P2SH redeem script). These
libraries appended nothing, in any era.

Consequences, both of which were measured rather than reasoned about:

- **A spend this library accepts, the network rejects.** A signature made over the unlocking
  region alone verified here and does not verify on a post-Chronicle node. Anyone who builds or
  accepts such a transaction on this library's verdict is holding something that will not
  confirm.
- **A spend the network accepts, this library rejects.** The correctly-signed form — over the
  region plus the lock — failed here. A validator would refuse a legitimate payment.

### Measurement

40 vectors judged by a compiled `bitcoin-sv` v1.2.3 and an independent Rust node. Both
libraries scored **16 agree / 24 differ** before the fix and **40 / 0** after. The identical
split in two implementations is what established a single shared defect rather than two.

The 16 that already agreed are the groups where the rule does not apply — Chronicle off, and
the output-era bit set alone — which is the right shape for a defect of this kind and is also
why a smaller vector set would have missed it.

### The bit that decides it

The gate is `SCRIPT_CHRONICLE` (bit 20) **alone**. `script_flags.h` 117-120 defines
`IsChronicle(flags)` as that bit; the output-era bit `SCRIPT_UTXO_AFTER_CHRONICLE` (bit 21) has
its own accessor and is not consulted.

This is worth stating in an advisory because it is where a reimplementation goes wrong: the
Chronicle **relaxations** gate on the output era alone, which is what took 571 of 24,568
disagreements to zero in `bsv` 9.30.0. Two Chronicle questions, two different bits, opposite
answers. A fix that reuses the relaxation helper passes a 24-row conformance set built without
the era distinction and still disagrees on 16 of 40 — a post-Chronicle block spending a
pre-Chronicle output.

### Who is affected

Only code that puts `OP_CHECKSIG` or `OP_CHECKMULTISIG` in an **unlocking** script. A
locking-script signature check is passed `nullptr` and does not diverge at all, so ordinary
P2PKH and P2SH spending — which is to say nearly all wallet traffic — is unaffected.

**Measured, rather than argued: no feature this library ships was affected.** The interpreter
was instrumented to record every signature check that executes while an unlocking script is
being evaluated, and the whole suite was run. Excluding the new conformance test, the entire
corpus reaches that shape **8 times**, and **0 of them are post-Chronicle**:

    4x  bitcoind transaction evaluation fixtures, tx_valid vectors 33-36   pre-Chronicle
    4x  SV Node sighash vectors, "still exercises both algorithms"         pre-Chronicle

All eight are inherited fixtures. Our own covenant surfaces put their checks on the other side:
`SmartContract.Authorizers.singleKey().emit()` writes `OP_CHECKSIGVERIFY` into the **locking**
script and `unlockArgs()` returns signatures and keys as data, not a check; `lib/ordinals/ordlock.js`
puts its `OP_CHECKSIG` in the cancel branch of the lock. P2SH is doubly unaffected — the node
passes `nullptr` for the redeem-script evaluation, and P2SH does not apply post-Genesis at all.

**What that does and does not establish.** It establishes that nothing we ship constructs the
affected shape, so a consumer using the documented covenant APIs was never exposed. It does
**not** establish that no consumer is exposed: a consumer hand-building an unlocking script
containing a signature check, and validating post-Chronicle, was. That population is
identifiable by one grep on their side — a signature-check opcode in a script assigned to an
input — rather than by a version number, which is how it was put to them.

**Both identifiable consumers checked and are clear**, each with evidence rather than a reply
of "probably fine":

- The covenant consumer most likely to be affected reports every `CHECKSIG`, `CHECKSIGVERIFY`
  and `CHECKMULTISIG` in its **locking** scripts, with unlocking scripts push-only by
  construction — data and number pushes only. Its current protocol does not depend on this
  library at all; the earlier prototype pins 9.39.1 and contains no signature opcode in any
  script.
- The wallet consumer searched its server, web, test and compatibility trees for the opcodes
  *and* for `input.script`, `setScript`, `Transaction`, `Interpreter` and `Script.fromASM`:
  **0 hits**. It builds no transactions and evaluates no scripts.

Worth recording the distinction the second one drew, because it is the better way to hold this:
what protects them is *"no scripts at all"*, not their pinned version. A pin that is safe for
the wrong reason stops being safe when the reason changes. Both have the upgrade written into
their notes against the day a transfer or spending path is added.

Chronicle activated at height 943,816 and mainnet is well past it, so this is live rather than
prospective.

### Remediation

Upgrade to `@smartledger/bsv@9.44.0` or `@smartledger/bsv-core@1.11.0`. No API changes; the fix
is internal and the public surface is unchanged. No working call breaks: a caller relying on the
old acceptance was relying on a verdict the network already refuses.

### Disclosure considerations

Three facts the filing decision should turn on, recorded so the decision is made on them
rather than on momentum:

1. **An independent Rust implementation has the same gap**, found by the same run, and its
   maintainers were notified through the session that holds the node. Filing a public advisory
   that names the mechanism tells everyone how to construct the divergence, including against
   an implementation that has not shipped a fix. That argues for coordinating rather than
   filing immediately.
2. **The mechanism is already public.** It is nine lines of the node's own source with an
   explanatory comment. An advisory would not be disclosing a secret, which weakens the first
   argument, though it does not eliminate the difference between "readable" and "pointed at".
3. **Our published advisories do not reach `npm audit`.** Measured repeatedly: a repository
   advisory is not in the global database, so filing produces disclosure for people who read
   our repository and nothing automatic for anyone else. The practical reach of filing is
   smaller than it looks, and the changelog entry in 9.44.0 may already carry most of it.

4. **Filing implies a deprecation decision about seven live versions, by our own gate.**
   `checkLiveAgainstAdvisories` in `scripts/npm-deprecations.js` refuses a manifest where a
   version left undeprecated sits inside a published advisory's range *and* that advisory names
   a patched version. This draft's range is `>= 9.15.0, < 9.44.0` with `9.44.0` patched, so the
   moment a payload is built from it, **9.37.0 through 9.43.0 — every live version but the
   newest — become a hard error** until they are either deprecated or given a written
   exception. That is the gate working as designed, and it is a real cost: deprecating seven
   versions is 7 irreversible registry writes plus a re-point of the upgrade minimum, which
   went stale three times in the last fortnight. It should be a deliberate choice made at
   filing time, not discovered by a failing check afterwards.

My recommendation: coordinate with the Rust implementation first and file once they have a
release, since the practical gain from filing today is small and the courtesy is not. When it
is filed, decide the seven-version question in the same sitting — my own inclination is a
written exception rather than deprecation, because the affected pattern is narrow and
deprecating a version warns every consumer of it regardless of whether they use unlocking-script
signature checks.

### Credit

Oracle vectors in the BSV opcode lab repo, with reference verdicts from a compiled
bitcoin-sv v1.2.3 oracle and an independent Rust node.
