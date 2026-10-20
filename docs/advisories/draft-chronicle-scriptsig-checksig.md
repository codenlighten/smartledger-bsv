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
| npm | `@smartledger/bsv` | `>= 9.15.0, < 9.44.0` | `9.44.0` |
| npm | `@smartledger/bsv-core` | `< 1.11.0` | `1.11.0` |

The lower bound on `@smartledger/bsv` is the release that introduced Chronicle flag handling;
before it there was no era in which the rule could apply. **This bound is asserted from the
changelog and has NOT been measured version by version** — it must be measured before filing,
because a range stated loosely is the one thing an advisory cannot be loose about.
`smartledger-bsv` (unscoped) predates Chronicle entirely and is not listed.

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
P2PKH and P2SH spending — which is to say nearly all wallet traffic — is unaffected. The
pattern that is affected is a covenant or contract one.

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
