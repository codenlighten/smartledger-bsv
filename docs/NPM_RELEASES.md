# What is published, and what state it is in

A complete inventory of every package and version this project has put on the public npm
registry, what is still wrong with each, and a recommended disposition. Facts read from the
registry on 2026-10-13; re-run `npm run check:npm-inventory` before acting on any of it, and
the suite fails if the package table below drifts from the registry.

**The deprecation counts below are the state AFTER the run described at the end of this page.**
Everything between here and there is written as it was decided — "71 live", "none deprecated" —
because the reasoning only makes sense against the state it was reasoning about. The pre-run
state of every version is in `docs/npm-deprecations/snapshot-2026-10-13.json`.

**A published version is immutable.** It cannot be edited or replaced. The levers are:

| lever | effect | limits |
|---|---|---|
| `npm deprecate` | install prints a warning; the version stays installable | reversible, but does not un-show a warning already seen |
| `npm unpublish` | removes it | 72 hours only, and only with no dependents; afterwards needs npm support |
| `npm dist-tag` | moves `latest` and friends | no effect on an explicit `pkg@x.y.z` install |
| publish a new version | fixes it going forward | does nothing for anyone pinned to an old one |
| security advisory | shows up in `npm audit` | separate from deprecation; deprecation is NOT an advisory |

So "fixing a previous release" means deprecating it with an accurate message and shipping the
fix in a new version. Deprecation is the main tool, and it is reversible — but a warning
already printed into someone's CI log is not.

## Packages

| package | versions | deprecated | live | `latest` | first | last |
|---|---|---|---|---|---|---|
| `@smartledger/bsv` | 129 | 128 | 1 | 9.35.0 | 2025-10-18 | 2026-10-14 |
| `@smartledger/bsv-core` | 13 | 0 | 13 | 1.5.2 | 2026-09-30 | 2026-10-13 |
| `@smartledger/keys` | 23 | 0 | 23 | 4.0.0 | 2025-11-28 | 2026-10-07 |
| `@smartledger/notaryhash` | 16 | 0 | 16 | 2.4.2 | 2026-06-27 | 2026-10-10 |
| `@smartledger/crypto` | 14 | 0 | 14 | 3.2.0 | 2025-11-28 | 2026-10-07 |
| `@smartledger/envelope` | 5 | 0 | 5 | 3.0.0 | 2025-12-03 | 2026-10-07 |
| `smartledger-bsv` (unscoped) | 22 | 22 | 0 | **4.4.0** | 2025-10-18 | 2026-06-08 |
| `@smartledger/sdk` | 0 installable | - | - | none | 2025-03-04 | 2025-03-04 |

`@smartledger/sdk` holds the name only: 1.2.0 was published on 2025-03-04 and unpublished two
minutes later. Nothing installs from it; there is nothing to fix.

## `@smartledger/bsv`: what is still wrong with each live version

The 56 already-deprecated versions carry the public advisory GHSA-gw63-x79h-mhjc (a private
key published in an OP_RETURN, recoverable from chain data) and two non-reproducible-bundle
notices. The other 71 install with no warning at all.

**This table is NOT a complete list, and the recommendation below is built so that it does
not need to be.** It was first assembled by grepping CHANGELOG.md for false-accept and
forgery language, which missed five defects that a second session found by reading the
changelog independently (9.12.0, 9.25.0, 9.26.1, 9.27.0, and four `Fixed (security)` sections
in 7.5.1-7.5.5). A keyword enumeration afterwards finds 28 security-relevant section headings
across 26 versions — and still misses 9.25.0, 9.27.0 and 9.29.0, whose headings use other
words. **The changelog's heading vocabulary is not an index of its security content**, so a
complete table would mean reading all 129 version entries, which has not been done.

Known defects and the version that fixed each. A live version is affected when its number is
below the fix:

| fixed in | class | defect |
|---|---|---|
| 7.5.2 | key handling | `StatusList.getCredentialStatusEntry` was declared sync but is async, so `=== 'revoked'` compared a Promise and **every revoked credential passed**. Reachable by a caller trusting the `.d.ts` |
| 7.5.3 | key handling | the 7.5.1 anchor key-material guard matched field NAMES only, so a WIF in `note`, an xprv in `ref` or a mnemonic in `memo` was still published to chain |
| 7.5.5 | **fund loss** | `PrivateKey.fromObject` returned a valid ~40-bit key from the `'[REDACTED]'` marker. `fromObject(JSON.parse(JSON.stringify(key)))` — the natural persist/restore — silently yielded a different, deterministic key anyone can derive. **Funds sent to the resulting address are loseable, with no attacker involved** |
| 8.2.0 | forgery | `verifyAgeProof` / `verifyRangeProof` accept a forged proof |
| 9.12.0 | forgery | **a forged block header passed SPV verification.** A header was believed about the difficulty it declared, so a forgery cost one attempt to mine; `verifyHeaderChain` accepted whole chains |
| 9.20.0 | forgery | `verifyMembershipProof` accepts a forgery needing no key, no salt and no set |
| 9.22.0 | forgery | GDAF `zk-prover` forgeable field commitment |
| 9.25.0 | forgery | a certificate's `anchor.seal` verified `valid` with the seal unchecked; a false `anchor.blockHeight` verified when `spv.blockHeight` was null |
| 9.26.1 | forgery | relabelling a sealed certificate as `version: 1` bypassed the 9.25.0 seal refusal, so a forged seal verified `valid` again |
| 9.27.0 | forgery | the selective-disclosure leaf committed over a non-injective encoding — `valid: true` for a value the issuer never committed to |
| 9.29.0 | consensus | scriptnum operand size — a false accept in the interpreter |
| 9.30.0 | consensus | Chronicle era axis — 487 false accepts against the node |
| 9.32.0 | forgery | LTP `proof.js` forgeable field commitment: a verified disclosure of a value the issuer never committed to |
| 9.33.0 | consensus | `OP_RSHIFTNUM` shift count above INT32_MAX — a false accept |
| 9.33.1 | divergence | `isPushOnly` treats a truncated push as a push. **Not a false accept** — measured: both this library and the node reject, the node as `SIG_PUSHONLY` above evaluation, this library as `BAD_OPCODE` from running the script |
| 9.33.2 | robustness | null-script dereferences — an untyped TypeError on a transaction read from a valid block |

**Every live version contains the affected code.** Checked rather than assumed: all four
affected verifiers and both proof modules appear in the repository's first commit (5.4.0,
2026-06-15), and the oldest live version is 7.5.1.

**The certificate verifier was not fixed once.** An earlier draft of this page said it was
fixed in 9.20.0. It was still forgeable after that — through 9.25.0 (seal unchecked), 9.26.1
(the `version: 1` relabel bypassing 9.25.0's refusal) and 9.27.0 (the non-injective
disclosure leaf). A consumer on 9.21.0-9.24.0 told "upgrade past 9.20.0" would have remained
exposed. This is why the disposition below recommends one message naming the current version
rather than per-defect messages.

**A second defect class, in four live versions only.** The 7.5.x security sections are not
verifier defects at all — they are key handling, and one of them loses money without an
attacker. 7.5.1 introduced the `toJSON` redaction marker, and 7.5.5 fixed the parser that
misread it, so the exposed window for the fund-loss defect is **exactly 7.5.1 - 7.5.4**, all
four of which are live. 7.5.1 is additionally exposed to the StatusList bug, and 7.5.1-7.5.2
to the field-name-only key-material guard. The original OP_RETURN private-key leak (the public
advisory GHSA-gw63-x79h-mhjc) was itself fixed *in* 7.5.1 — confirmed by execution against the
published 7.5.0 and 7.5.1 artifacts, not from the changelog — so no live version of **this**
package carries it. It is live in fourteen versions of the unscoped package; see the
disposition below.

**What the 56 existing deprecations cover.** 54 of them are versions below 7.5.1 — the
pre-advisory era. The other two are 7.7.0 and 7.8.0, deprecated for non-reproducible browser
bundles, not for a security defect — and 7.6.2 has that same mismatch without a deprecation,
which was found by reading the published bundles rather than the changelog. So nothing from 7.5.1 onward carries a security
deprecation today, including the four fund-loss versions.

Grouping the 71 live versions by the worst thing still outstanding in each:

| still outstanding | count | versions | what a consumer is exposed to |
|---|---|---|---|
| a forgery | **67** | 7.5.1 .. 9.31.0 | a third party can forge something a verifier accepts |
| a consensus false accept | 1 | 9.32.0 | the library calls a script valid that the network rejects |
| an error-name divergence | 1 | 9.33.0 | both reject, but with a different error than the node reports |
| an untyped crash only | 2 | 9.33.0, 9.33.1 | a `TypeError` on some data read from a valid block |
| no known forgery or consensus defect | 1 | 9.33.2 | documented limits remain — see below |

9.33.0 appears twice: it carries both the error-name divergence and the crash. The earlier
version of this table put 9.32.0 and 9.33.0 together as "consensus only", which was **wrong
for 9.33.0** — measured, its outstanding items are the error-name divergence (fixed 9.33.1)
and the crash (fixed 9.33.2), and neither accepts a script the network rejects. That is the
same error the review of this page caught for 9.33.1, made again one version along.

## Recommended disposition

**1. The unscoped `smartledger-bsv` — do this one first, and the reason is not what this page
first said.** (State as this plan was written; all 22 were deprecated on 2026-10-13 — see
“Applied” below. A deprecated version still installs, with a warning.) 22 live versions at the
time, none deprecated, `latest` = 4.4.0 from 2026-06-08, and **429
downloads in the last month** against 6,512 for the scoped package. So it is genuinely in use
by someone, at the name a reader would try first, with no indication that it is not the
maintained package.

The first draft of this section proposed a "no longer maintained" message and flagged that
clause as Greg's to confirm, because it asserted a maintenance decision in his name. That
turned out to be the wrong message, because nobody had opened the tarballs. **Fourteen of
these versions carry the public advisory GHSA-gw63-x79h-mhjc — the defect for which the
scoped versions of the same version numbers are already deprecated.** Measured, not inferred;
see "What was measured against the published artifacts" below:

| unscoped versions | measured | what a consumer is exposed to |
|---|---|---|
| 3.3.1, 3.3.2, 3.3.3, 3.3.4, 3.3.5, 3.4.0, 3.4.4, 3.4.5, 4.0.0, 4.0.1, 4.1.0, 4.2.0, 4.2.1, **4.4.0** (`latest`) | 14/14 | `GDAF.anchorCredential` **and** `anchorBatch` return a signed, broadcast-ready transaction whose OP_RETURN contains the caller's private key, recoverable to the same WIF. Plus the `JSON.stringify` leak below |
| 3.0.0, 3.0.1, 3.0.2, 3.1.0, 3.1.1, 3.2.0, 3.2.1, 3.2.2 | 8/8 | `JSON.stringify(privateKey)` emits the secret scalar. These versions have no `lib/gdaf/smartledger-anchor`, so the anchor path does not exist in them |

So the message states a verified code defect and cites the already-public advisory, and the
clause that needed Greg's confirmation is gone — replaced by something measured rather than
asserted. It also stops short of what the advisory says: the library builds and *signs* the
transaction but does not broadcast it, so the key reaches the chain when the caller broadcasts
— which is the point of calling an anchor method, but it is the caller's action and the
message says so.

```
Critical (GHSA-gw63-x79h-mhjc): GDAF.anchorCredential and anchorBatch return a signed transaction whose OP_RETURN contains the caller's private key, measured in this version and recoverable to the same WIF, so broadcasting it exposes the key in chain data. JSON.stringify(privateKey) also emits the secret scalar. No currently published smartledger-bsv version fixes either; migrate to @smartledger/bsv@9.35.0 or later - review migration requirements before switching - and ROTATE any key passed to those methods. https://github.com/codenlighten/smartledger-bsv/security/advisories/GHSA-gw63-x79h-mhjc
```

and for the eight without the anchor module:

```
Critical: JSON.stringify(privateKey) includes the secret scalar, measured in this version, so any log, error report or request body built from that output carries the key to whoever can read it. No currently published smartledger-bsv version fixes this; migrate to @smartledger/bsv@9.35.0 or later - review migration requirements before switching - and rotate any key that may have been stringified.
```

Deliberately *not* said: that migrating is drop-in. "Migrate", not "upgrade", across a
package-name change, and "review migration requirements before switching" is kept rather than
dropped for brevity — a reviewing session's point, and a fair one, since "migrate" alone reads
as drop-in.

What the surfaces actually show, since the clause should be backed either way: **one** top-level
export is removed between unscoped 4.4.0 and scoped 9.33.2 — `SmartUTXO` — against four added,
and `PrivateKey`, `Transaction` and `Script` each have the same number of statics with none
removed. The anchor call shape also still works: 9.33.2 accepts a bare UTXO array as the third
argument, which is what a 4.4.0 caller passes, and the probe above exercises exactly that. So
the move is *narrower* than "not drop-in" suggests — which is the reason the message says
"review migration requirements" rather than asserting either breakage or compatibility. Nobody
has run a 4.4.0 consumer's code against 9.33.2.

And "no **currently published** version fixes either", not "no fixed release exists", because
the first phrasing is a claim about the 22 versions actually tested and the second is also a
claim about every future release.

**This is the one finding on this page that may deserve a security advisory rather than a
deprecation.** GHSA-gw63-x79h-mhjc exists and is public; it names the scoped package. Adding
the unscoped package's affected range to it is what would make `npm audit` report this to the
429 downloads a month, which a deprecation message does not do. That is a louder, outward
mechanism than deprecation and it is Greg's call, so it has not been touched.

**Correction to an earlier draft of this page**, which called the unscoped package "a separate
lineage whose version never appears in this repository's history". That was wrong. The git
history begins at 5.4.0, but `CHANGELOG.md` documents releases back to 3.0.1 — including
`## [4.4.0] - 2026-06-07` — so the project predates this repository and the unscoped 3.x/4.x
versions are **the same lineage**. 4.4.0 is also the release that added `OP_SUBSTR` /
`OP_LEFT` / `OP_RIGHT` to the interpreter, and 9.29.0 fixed an operand-size false accept in
exactly those opcodes, so an earlier draft said 4.4.0 "plausibly shares at least that defect".

**It does not, and that was checked rather than left as a guess.** `<data> <operand> OP_RIGHT`
was run against the installed 4.4.0 at both the 10-byte and 600-byte operand widths. The
artifact has **none** of `SCRIPT_UTXO_AFTER_GENESIS`, `SCRIPT_UTXO_AFTER_CHRONICLE` or
`SCRIPT_ENABLE_CHRONICLE` — it predates the era flags entirely — so it never reaches the
relaxed `maxScriptNumLength` that produced the divergence, and falls back to the stricter
four-byte script-number limit: 600 bytes is refused as `PUSH_SIZE`, 10 bytes as a script-number
overflow. The same probe returns `EVAL_FALSE_IN_STACK` on 9.28.1 and `SCRIPTNUM_OVERFLOW` on
9.29.0 and 9.33.2, so it does distinguish the two sides of that fix.

The deprecation message still claims nothing about the operand rule — it does not need to,
because the key disclosure is both worse and measured.

**2a. 7.5.1 - 7.5.4 — the fund-loss window, strongest wording.** These four get their own
message, and the reason is NOT a reopening of the per-defect plan withdrawn below. That plan
failed because defect-to-range mapping was unreliable; this range is *verified* and bounded at
both ends (7.5.1 introduced the redaction marker, 7.5.5 fixed the parser that misread it), and
the harm differs in kind — money lost through an honest round-trip, no attacker. Where a range
is established and the severity is categorically different, a distinct message is warranted;
where it is inferred from an incomplete table, it is not.

```
Critical: PrivateKey.fromObject on a JSON round-trip can silently return a different private key that anyone can derive, so funds sent to its address can be taken. Fixed in 7.5.5, which does not address later security fixes; upgrade to @smartledger/bsv@9.35.0 or later.
```

"Can be taken", not "may be unrecoverable": the substituted key is deterministic and derivable
by anyone who knows the marker, so the funds are not merely stranded — a stranger can sweep
them. A different and worse claim, and the accurate one.

**Reproduced against the published artifacts, and it is worse than the wording suggests.** The
round trip yields `bn = 768491671261` — a 40-bit key — in 7.5.1, 7.5.2, 7.5.3 and 7.5.4, with
no error. 7.5.0 round-trips *correctly* (the redaction marker did not exist yet) and 7.5.5
throws, naming the marker, so the window is exactly these four. The substituted value does not
depend on the victim's key, so **every** affected round trip lands on the *same* address:
`1JGwrQuvMBkEt3SgYko5M2Vuncfi7JRyze` on livenet, compressed.

That makes the exposure checkable, so it was checked. All four derivable addresses (livenet and
testnet, compressed and uncompressed) have **zero transactions and zero balance** on BSV
mainnet and testnet (WhatsOnChain) and on BTC (Blockstream). The defect is live; as far as two
independent providers show, nobody has funded it. The address is not put in the deprecation
message — it is derivable by anyone from public code in seconds, but a deprecation message is
not the place to publish a watch-list entry.

**2b. The 67 versions with an outstanding forgery — ONE message, naming 9.33.2.** Of those 67,
four are in the fund-loss tier above and 7.6.2 is in the bundle tier below, whose message
carries the forgery too; the remaining 62 get this message. An earlier
draft of this page called for four distinct messages, one per defect, "because the fixed-in
version differs per defect". That plan is withdrawn, and the reason is the useful part:

Per-defect messages require a COMPLETE defect table. This one is not complete, and the
incompleteness is not random — it is concentrated in exactly the certificate-verifier
defects, where the four-message plan would have told a consumer on 9.21.0-9.24.0 that their
verifier was fixed in 9.20.0 when it stayed forgeable through 9.26.1. **Precision resting on
an incomplete enumeration is worse than deliberate imprecision**, because it is believed.

A single message naming the current version is correct whether or not the table is complete:

```
Security: this version predates a verification-forgery fix in 9.32.0 (a verifier can accept a disclosed value the issuer never committed to); other fixes were made earlier. Upgrade to @smartledger/bsv@9.35.0 or later.
```

This names a defect without needing the table to be complete, because **one forgery is
verified present in every version of the range**: the `lib/ltp/proof.js` field commitment,
fixed in 9.32.0. Checked rather than assumed — the module and its vulnerable `_hashField`
encoding are present in all **63** live versions from 7.5.5 to 9.31.0. The earlier defects are
deliberately not named, because which of them a given version carries cannot be established
from the table as it stands.

**3. The three newest affected versions — 9.32.0, 9.33.0 and 9.33.1 — and a text that was
wrong for the second of them.** The first draft gave 9.32.0 and 9.33.0 the same message, "may
accept scripts that network consensus rejects". That is right for 9.32.0 and **wrong for
9.33.0**: measured against both published artifacts, 9.32.0 verifies
`<5> <2^32+1> OP_RSHIFTNUM OP_DROP OP_1` where the node aborts with `SCRIPT_ERR_BIG_INT`, and
9.33.0 rejects it exactly as the node does. 9.33.0's outstanding items are an error-NAME
divergence on a truncated push, where **both sides reject**, and the untyped crash. Telling
its users they may accept scripts the network rejects would have been a false statement — the
same mistake the review caught for 9.33.1, repeated one version along, which is why each of
these three is now measured rather than derived from the changelog.

9.32.0:

```
May accept scripts that network consensus rejects, and may throw an untyped error when reading some chain transactions. An undisclosed field in an LTP selective-disclosure proof can also be recovered from the proof alone, because each field salt is derived from the nonce the proof carries; fixed in 9.34.0. Upgrade to @smartledger/bsv@9.35.0 or later.
```

9.33.0:

```
Security: an undisclosed field in an LTP selective-disclosure proof can be recovered from the proof alone; fixed in 9.34.0. Also reports a different script error than the reference node for some invalid scripts (both reject), and may throw an untyped error when reading some chain transactions. Upgrade to @smartledger/bsv@9.35.0 or later.
```

9.33.1:

```
Security: an undisclosed field in an LTP selective-disclosure proof can be recovered from the proof alone, because each field salt is derived from the nonce the proof carries; fixed in 9.34.0. May also throw an untyped error when reading some chain transactions. Upgrade to @smartledger/bsv@9.35.0 or later.
```

9.33.2:

```
Security: an undisclosed field in an LTP selective-disclosure proof can be recovered from the proof alone, because each field salt is derived from the nonce the proof carries - measured on this version, a date of birth in under 100,000 hashes. Fixed in 9.34.0. Upgrade to @smartledger/bsv@9.35.0 or later.
```

9.34.0:

```
Cannot parse three output scripts the reference node accepts and mines (an OP_RETURN followed by a push whose length field is cut off), so a transaction carrying one has no script verdict here. This is a false reject: no script is accepted that the node refuses. Fixed in 9.35.0.
```

9.33.2 and 9.34.0 were added on the second run. 9.33.2 had been the one live version with no
message at all, deliberately, because until 9.34.0 existed there was nowhere to send anyone.
9.34.0's text leads with what it cannot do rather than with "Security", because a false reject
is not a false accept and a reader who confuses the two will over-react: nothing it accepts is
refused by the node.

"Some chain transactions", not "valid transactions": the measured trigger is an output script
this library cannot decode, and nothing establishes that nothing else reaches the same
dereference. "(both reject)" is in the 9.33.0 text on purpose — a reader who takes "a
different script error" for a false accept would over-react, and the whole point of this tier
is that the three versions are not equivalent.

**4. The 56 versions that are ALREADY deprecated need their messages corrected.** This is the
part the first draft of this page missed entirely, and it is the clearest answer to "fix any
previous releases on npm": every existing deprecation message directs the reader to a version
that is now known to be defective.

* **54 of them** (everything at or below 7.5.0) carry the GHSA-gw63-x79h-mhjc advisory text
  ending "Upgrade to >=7.5.3 and ROTATE any key passed to those methods." But **7.5.3 is
  inside the fund-loss window measured above.** The lowest version satisfying the existing
  advice carries a defect that silently substitutes a derivable private key. The existing
  message is not merely stale; it points at harm.
* **7.7.0 and 7.8.0** say "Use 7.7.1, or upgrade to >=7.9.0". Both of those carry the
  outstanding 9.32.0 forgery.

All 54 share one byte-identical message, which was checked rather than assumed — grouping the
56 by exact message gives 54 + 1 + 1, so no version-specific warning is lost by replacing the
54 together. The pre-run state of all 149 published versions is snapshotted before anything is
sent, so any old text is recoverable.

```
SECURITY (GHSA-gw63-x79h-mhjc): GDAF.anchorCredential/anchorBatch put the caller's private key into the OP_RETURN of the signed transaction they return, so broadcasting it exposes the key in chain data, recoverable to the same WIF. ROTATE any key passed to those methods. Upgrade to @smartledger/bsv@9.35.0 or later - the minimum previously recommended here, 7.5.3, has a separate private-key round-trip defect. https://github.com/codenlighten/smartledger-bsv/security/advisories/GHSA-gw63-x79h-mhjc
```

The advisory id, the link and the rotation instruction are all preserved; the upgrade target
changes and one clause says why, so a reader who saw the old message is not left guessing.
"The minimum previously recommended here" rather than "upgrading to 7.5.3 loses funds" —
`>=7.5.3` is a floor, and a reader who took it and went to 9.x was never exposed.

For the bundle versions the fact is kept, the pointer at 7.7.1/7.9.0 dropped, and the forgery
put first — and the set turned out to be **three** versions, not the two that are currently
deprecated. See "the bundle claim was inherited rather than checked" below: 7.6.2 shipped the
same mismatch and was never flagged for it.

```
Security: this version predates a verification-forgery fix in 9.32.0 (a verifier can accept a disclosed value the issuer never committed to). Its browser bundle was also built from bn.js 4.12.3 while package.json pins 4.12.5, confirmed in the published bundle; the 7.6.2 release reports no behaviour difference between those builds across 11,071 differential checks. Upgrade to @smartledger/bsv@9.35.0 or later.
```

"differential testing ... found none in behaviour" replaces the original's flat "No source,
API or behaviour difference". The behavioural claim is supported — CHANGELOG 7.6.2 records
11,071 differential checks across ECDSA DER bytes, WIF, addresses, script numbers and HD
derivation with zero differences — but it is a test result, not a proof, and the message now
says which it is.

**5. Two of these tiers are separate decisions, not part of one "run the set".** Raised by the
reviewing session and correct on both counts:

* **`S_ghsa54` overwrites 54 messages Greg wrote**, under a public advisory, and the
  replacement also silently corrects that advisory's own description (the methods return a
  signed transaction; they do not broadcast). Replacing hazardous upgrade advice is a good
  reason to touch them, but it is a different kind of decision from adding a warning to a
  version that has none, and it should get its own yes or no.
* **`S_errname` and `S_crash` are the mild end.** 9.33.0 and 9.33.1 have an error-name
  divergence where both sides reject, and a crash. Leaving those two undeprecated to keep
  warnings meaningful is a defensible choice, and it is Greg's to make rather than one to fold
  into a batch. The texts are drafted either way.

A third, for the record: once the unscoped package is deprecated across all 22 versions, 4.4.0
remains `latest` and every `npm install smartledger-bsv` prints the Critical text. That is the
intent. A final unscoped release, or a dist-tag change, would be a separate publish decision
and is not part of this set.

**6. What executing this costs.** Deprecation warnings print on every affected install,
including pinned builds and CI that may treat them as failures, and they generate support
questions. 148 of the 149 published versions across the two packages end up deprecated; only
`@smartledger/bsv@9.33.2` is left clean, which means "not deprecated under this plan", not
"proven free of defects" — see the section below on what is still open in it.

The count of packages depending on the unscoped one could not be established: npm's
`depends:` search returns 398 results, but the first several are text matches on "bsv"
(`@bsv/sdk`, `@bitgo/sdk-coin-bsv`, `@bsv/wallet-toolbox`) and none of the ones checked
actually lists it as a dependency. Treat that number as unknown rather than large.

## What was measured against the published artifacts

Everything above this line in the defect table was originally read out of `CHANGELOG.md`. A
changelog is a record of intent; it is not the artifact a consumer installs. So each claim that
a deprecation message now makes was re-established by installing the published version from the
registry — as a consumer would, `npm install <pkg>@<version>` — and running it.

This mattered: it is what found the unscoped package's key disclosure, corrected the 9.33.0
text, bounded the fund-loss window at 7.5.0 rather than assuming it, and revealed that the 56
existing deprecation messages point at defective versions.

**Every probe was confirmed to return the negative verdict somewhere.** A probe that answers
"vulnerable" everywhere it is pointed is not measuring anything, and two of these did exactly
that on their first run — one from a padded-hex comparison that failed once in sixteen keys,
one from a hand-assembled flag word missing the gate's era condition. Both were instrument
bugs, found only because a known-fixed version was in the sweep.

| probe | what it does | result |
|---|---|---|
| `JSON.stringify` key recovery | stringify a fresh key, pull `bn` back out, rebuild a key, compare WIFs | leaks in 22/22 unscoped versions; **not** in `@smartledger/bsv` 7.5.1 or 9.33.2 |
| anchor payload, end to end | call `GDAF#anchorCredential` and `#anchorBatch` through the public API with a funding UTXO, serialise the returned transaction, recover a key from its bytes | both methods leak in 14/14 affected unscoped versions and in scoped 7.5.0; **refused** in 7.5.1 and 9.33.2 ("Refusing to anchor: metadata is a PrivateKey"), where the transaction also shrinks from ~380 to ~270 bytes |
| JSON round trip | `PrivateKey.fromObject(JSON.parse(JSON.stringify(key)))` | silent wrong key in 7.5.1-7.5.4; correct in 7.5.0; throws in 7.5.5 and 9.33.2 |
| LTP disclosure forgery | build an honest disclosure of `null`, substitute `NaN` and `Infinity`, re-verify | forged value **accepted in all 63** live versions 7.5.5 - 9.31.0, with the honest proof also verifying in all 63; refused in 9.32.0 and 9.33.2 |
| three interpreter divergences | `OP_RSHIFTNUM` count above `INT32_MAX`; a truncated push under `mainnetFlags()`; an output whose script cannot be decoded | see the table below |

Nothing was broadcast. The anchor probe serialises the signed transaction locally and inspects
its bytes; the fund-loss probe only derives addresses. The only network calls were the registry
installs and four read-only address lookups.

The interpreter row, per version:

| version | `OP_RSHIFTNUM` count > `INT32_MAX` | truncated push | undecodable output script |
|---|---|---|---|
| 9.31.0 | **verifies** (node: `BIG_INT`) | `BAD_OPCODE` (node: `SIG_PUSHONLY`) | `TypeError` |
| 9.32.0 | **verifies** | `BAD_OPCODE` | `TypeError` |
| 9.33.0 | `BIG_INT` ✓ | `BAD_OPCODE` | `TypeError` |
| 9.33.1 | `BIG_INT` ✓ | `SIG_PUSHONLY` ✓ | `TypeError` |
| 9.33.2 | `BIG_INT` ✓ | `SIG_PUSHONLY` ✓ | handled ✓ |

The crash is in every version through 9.33.1, so it is true of all 70 live affected versions —
it is named only in the three newest messages, because for the other 67 the forgery is worse
and the upgrade target is the same.

The probes are committed under `scripts/published-version-probes/`. They install from the
network, so they are not in the test suite; the README there says how to re-run them.

## The deprecation set, as it will be sent

Generated from the registry snapshot by `scripts/npm-deprecations.js`, which refuses to emit a
manifest unless every published version is covered exactly once and `@smartledger/bsv@9.35.0`
is covered by nothing. Each tier is one `npm deprecate` call whose range is an explicit `||`
union of exact versions — never a comparator range, so an already-deprecated version cannot be
swept up by accident. Each union was checked locally with npm's own `semver` and
`npm-package-arg` to parse as a range and select exactly its own list.

| tier | package | versions | message |
|---|---|---|---|
| `S_crash` | `@smartledger/bsv` | 1 | 9.33.1, the salt defect + the untyped crash |
| `S_salt` | `@smartledger/bsv` | 1 | 9.33.2, the salt defect |
| `S_parser` | `@smartledger/bsv` | 1 | 9.34.0, the parser false reject |
| `U_anchor` | `smartledger-bsv` | 14 | key in the anchor OP_RETURN + stringify leak |
| `U_stringify` | `smartledger-bsv` | 8 | stringify leak |
| `S_fundloss` | `@smartledger/bsv` | 4 | 7.5.1-7.5.4, derivable key |
| `S_forgery` | `@smartledger/bsv` | 62 | predates the 9.32.0 commitment fix |
| `S_falseaccept` | `@smartledger/bsv` | 1 | 9.32.0, consensus false accept + the salt defect |
| `S_errname` | `@smartledger/bsv` | 1 | 9.33.0, the salt defect + error-name divergence |
| `S_ghsa54` | `@smartledger/bsv` | 54 | existing advisory text, upgrade target corrected |
| `S_bundle` | `@smartledger/bsv` | 3 | 7.6.2, 7.7.0, 7.8.0 — forgery + the bundle mismatch |

148 versions, 9 calls. After each one,
`node scripts/npm-deprecations.js verify <tier ...>` re-reads both packuments and asserts that
every version in an applied tier carries byte-exactly the intended message and that **no other
version has changed** from the pre-run snapshot — so an accidental range match is caught rather
than assumed away.

The pre-run state of all 149 versions is committed at
`docs/npm-deprecations/snapshot-2026-10-13.json`. That file is the only record of the 56
messages this plan overwrites; a published deprecation is not versioned by the registry, so
without it the old text would be gone. `npm deprecate <pkg>@<range> ""` clears a message, and
the snapshot is what makes restoring the previous one possible rather than just clearing it.

The script does not write to the registry. `plan` emits the commands and an operator runs them
with credentials, which deliberately do not live in this repository.


### The second run, 2026-10-14: every message's upgrade target moved

All 150 were re-sent. The reason is the one this set was built to correct: every message said
*"upgrade to @smartledger/bsv@9.33.2 or later"*, and 9.33.2 turned out to carry a live
confidentiality defect of its own. A recommendation naming a defective minimum is exactly what
made the 54 GHSA messages wrong — they pointed at 7.5.3 from inside the fund-loss window — so
leaving it would have been the same error knowingly. The target is now 9.35.0.

Three tiers also gained the salt clause, because every scoped version from 3.3.2 has
`lib/ltp/proof` and therefore has the defect: `S_falseaccept` (9.32.0), `S_errname` (9.33.0)
and `S_crash` (9.33.1) each named only what they were first deprecated for. Two tiers are new:
`S_salt` for 9.33.2 and `S_parser` for 9.34.0.

**One invariant failure, and it was a real defect in the runner.** The first run derived
`S_ghsa54` from *the text a version currently carried* (`/^SECURITY \(GHSA-gw63/`) and
`S_forgery` from *having no message yet*. Both worked exactly once: before the first run those
predicates partitioned the set, and after it they selected almost nothing, so the second run
covered 29 versions and the manifest check refused to emit. A tier list has to be a function of
measured facts about a version — here, version ranges — never of what its message says now.
Both are range-derived, and the check that caught it is the one that refuses a manifest unless
every published version is covered exactly once.

Verified as before: `node scripts/npm-deprecations.js verify all` reads the registry back and
compares byte for byte. **151 versions checked, 150 changed since the snapshot, 0 mismatches**,
with 9.35.0 the one left clean. Confirmed consumer-side too: installing 9.33.2 or 9.34.0 prints
the warning and installing 9.35.0 prints nothing.

## What the second review changed, and the one point I pushed back on

The revised set went back out for review, because it had changed materially since the first
pass. Four of its five points were taken, and each was settled by measuring rather than by
hedging the wording:

**The 54 existing messages repeat an overstatement, and so did my replacement.** Their text
says the anchor methods "published the caller's private key in the OP_RETURN". Read at 7.5.0,
the module builds and **signs** a transaction and returns it — `_createAnchorTransaction` has
no broadcast and the module makes no network call at all. The key reached the chain when the
caller broadcast it, which is what calling an anchor method is for, but it is the caller's
action. The replacement now says the methods "put the caller's private key into the OP_RETURN
of the signed transaction they return, so broadcasting it exposes the key in chain data".

**This is also a discrepancy with the published advisory**, whose own description says
"published". GHSA-gw63-x79h-mhjc is public and its wording is Greg's, so it has not been
touched — but a deprecation message that contradicts the advisory it cites would be worse than
either, and the conditional version is the accurate one. Worth a decision.

**"A verifier can accept forged proofs" was broader than the measurement.** The review's point
was that `JSON.stringify` does not emit `NaN`, so a forgery that needs a `NaN` to reach the
verifier may be unreachable over the wire. That is right, and measuring it split the defect in
two:

| direction | reachable over plain JSON? | 9.31.0 | 9.32.0 |
|---|---|---|---|
| issuer commits `null`, attacker presents `NaN` | **no** — `NaN` does not survive `JSON.stringify`; reachable in-process, where a consumer calls `verify` with an object it built | accepted | refused |
| issuer commits `NaN`, holder presents `null` | **yes** — `null` survives, and the proof needs no tampering at all | accepted | the commitment is refused at generation |

The second direction needs an issuer whose claim holds a JS `NaN` or `Infinity`, which cannot
come from `JSON.parse` but arrives easily from arithmetic — `Number(undefined)` is `NaN`. So
the honest statement, and the one now in the message, is that **a verifier can accept a
disclosed value the issuer never committed to**. Three distinct values share one commitment;
which party can exploit that depends on the transport, and the message no longer implies
attacker-chosen forgery in every deployment.

That measurement also produced the session's third instrument bug, and the most instructive
one: a probe that serialised the tampered proof through JSON reported the forgery as *still
accepted in 9.33.2*. It was not — `JSON.stringify` had turned the planted `NaN` back into
`null`, so the probe was re-verifying the honest proof and calling it a forgery. A "defect
still present in the fixed version" result is the shape an instrument bug takes when it is
flattering, and it would have been easy to report.

**The bundle claim was inherited rather than checked, so it got checked.** `4.12.5` rewrote
`divRound` to use `dm.mod.abs()` where `4.12.3` used `dm.mod.isub(num)`, and that survives
bundling, so the published `bsv.bundle.js` can be read directly:

| version | declared pin | 4.12.5 copies in the bundle | 4.12.3 copies |
|---|---|---|---|
| 7.5.8, 7.6.0, 7.6.1 | `=4.12.3` | 0 | 2 — consistent |
| **7.6.2** | `=4.12.5` | **0** | **2 — disagrees with the pin** |
| **7.7.0** | `=4.12.5` | **0** | **2 — disagrees** |
| 7.7.1 | `=4.12.5` | 1 | 1 — the expected deduplication shape |
| **7.8.0** | `=4.12.5` | **0** | **2 — disagrees** |
| 7.8.1, 7.9.0, 7.10.0 | `=4.12.5` | 1 | 1 — consistent |

So the existing deprecation of 7.7.0 and 7.8.0 is confirmed by direct observation rather than
carried forward on trust — **and it missed 7.6.2**, the very release that moved the pin, whose
bundle was still built from the old one. 7.8.0 also regressed after 7.7.1 had fixed it. All
three now share one message, which leads with the forgery (the item that calls for action) and
states the mismatch as measured. The "no behaviour difference" claim is attributed rather than
asserted: the 7.6.2 release reports 11,071 differential checks with zero differences across
ECDSA DER bytes, WIF, addresses, script numbers and HD derivation — a test result, not a proof,
and the message now says whose result it is.

**The one point I did not take** is the suggestion to say "rejected by the tested node" instead
of "rejected by network consensus" for 9.32.0. The verdict comes from a compiled
`bitcoin-sv v1.2.3` under mainnet flags `0x3d586f`, and on BSV that implementation *is* the
consensus implementation — there is not a second one to disagree with it. "The tested node"
would read to a consumer as "some node somewhere", which understates a lock that no miner will
accept. The basis is recorded here so the claim can be checked rather than taken on the
wording. For 9.33.0 the same objection *does* hold and was taken: a network does not prescribe
an error *name*, a node does, so that message now says "than the reference node".

Two further suggestions were already the plan and are unchanged: the derivable address stays
out of the deprecation messages and in this page, and nothing here claims that zero observed
transactions proves any particular consumer is safe.

## 9.33.2 — corrected 2026-10-14: it has a known defect after all

This section used to be headed *"9.33.2 has no known forgery or consensus defect"*. That was
true as written and useless as reassurance, which is the lesson in it: the heading named the
two classes that had been looked for.

**An undisclosed field can be recovered from an LTP selective-disclosure proof.** The salt was
derived as `sha256(nonce + path + index)`, and the nonce ships inside the proof, so every
salt in the credential — including those of fields never disclosed — was recomputable by
whoever held it. Measured on the 9.33.2 artifact installed from the registry: an undisclosed
date of birth came back from the proof alone inside 100,000 hashes, under a second
(`scripts/published-version-probes/ltp-salt-brute.js`).

Every published version that has `lib/ltp/proof` carries it — scoped `>= 3.3.2`, unscoped
`>= 3.3.1` — so this is not a recent regression. Sixteen of them were executed; the salt line in
all 134 was read and is byte-identical
(`docs/npm-deprecations/ltp-salt-line-by-version.txt`). The module-presence boundary agrees
across three independent methods, one of them a second session's. `lib/gdaf/zk-prover.js` in the same library
already had it right and says why in its comments; this module kept its own copy of the
commitment code and so kept the hazard, exactly as it kept the `JSON.stringify` ambiguity
until 9.32.0.

Fixed in **9.34.0** (built, not yet published): a fresh random master salt per disclosure that
never travels in a proof, with `options.saltSeed` for a caller that needs a stable root.

It was found while checking the wording of an advisory, not by the test suite.

Two further documented limits remain open and are recorded in the changelog rather than fixed:

* **`OP_DIV` / `OP_MOD` are quadratic in operand length.** Not a consensus divergence — the
  node agrees — but the node bounds it with policy this package does not copy, so quadratic
  CPU exhaustion remains a risk with attacker-supplied scripts: 320 KB of operand takes about
  18 seconds (CHANGELOG 9.16.1).
* The 9.22.0 entry's own **"Still open"** list: a null deletes a claim rather than editing it,
  the proof shows consistency rather than authenticity, and a TSC index bound.

One claim this page had softened is now measured, and measuring it corrected two others.

The 9.23.0 GDAF wrapper drift was described here and in the changelog as fail-closed rather than
a hole. The changelog showed that directly for three of the four wrappers —
`generateMembershipProof` threw, and `verifyMembershipProof` and `verifyRangeProof` returned
`false` for every proof — while the fourth row said only that `verifyAgeProof` "received an
issuer DID as the opening", without stating the verdict. The aggregate sentence covered it
("three returned `false` and one threw"), but no row did, so it was listed below as unchecked.

It was then run against the **published** artifacts — 9.16.1, 9.19.0, 9.20.0, 9.22.0 and 9.22.1,
each installed from the registry into its own directory, resolved by absolute path, with the
loaded name and version asserted before any call. On every one of them the class path returns
`false` for a genuine age proof passed an issuer DID, `false` for a forged proof, `false` for a
fabricated one and `false` with the argument omitted, while the module path returns `true` for
the same genuine proof and its opening. **Fail-closed, confirmed for the fourth wrapper across
the whole span by measurement, with a positive control at each version.**

The same runs contradicted two claims in the 9.23.0 entry's description of the mechanism, and
that entry now carries a dated correction:

* **`verifyRangeProof` did not gain its `opening` in 9.20.0.** The module signature has been
  `(proof, min, max, opening)` since **8.2.0** — the release that fixed its forgery — and the
  wrapper has forwarded only three arguments all along, so the class-path range verifier
  answered `false` for every proof from 8.2.0 onward, not from 9.20.0. A correction in the
  more-severe direction: a longer window, though still fail-closed. Only `verifyMembershipProof`
  changed in 9.20.0, `(proof)` → `(proof, opening, set)`.
* **Two of the four were naming drifts, not argument drifts.** `verifyMembershipProof` and
  `verifyRangeProof` *drop* their last argument, so no caller can supply it and the class path
  is inert whatever is passed — a property of the wrapper source, not of a sample of inputs.
  But `generateMembershipProof` and `verifyAgeProof` forward every argument **positionally and
  intact**; only the parameter names and the `bsv.d.ts` types were wrong.
  `g.generateMembershipProof(set, value)` returns a real `MembershipProof` at 9.20.0 through
  9.22.1, so "no proof could be generated through the class at any version since 5.4.0" is
  false — it was false for the *documented* call. Equally, `g.verifyAgeProof(proof, age,
  opening)` returns a correct `true`.

So the fail-closed property splits by kind. For the dropped-argument pair it is structural. For
the misnamed pair it rests on the module refusing the wrong-typed value the documentation told
callers to pass — for `verifyAgeProof`, a string where an object is required. Nothing in the
suite asserted that refusal: the existing tests omit the opening or pass a wrong object. It is
now asserted on both the class and module paths with a positive control, and the assertion was
checked against a mutant that restores the pre-8.2.0 "trust `meetsRequirement`" shape, which it
fails as it should.

## The other packages

`bsv-core`, `keys`, `crypto`, `envelope` and `notaryhash` have **no deprecated versions and
no known forgery or consensus defect** in any published version. `bsv-core` shares the
interpreter lineage, so its pre-1.5.2 versions carry the ported equivalents of the consensus
items above; its own CHANGELOG maps them. Two caveats, neither a defect:

* `notaryhash` 2.4.2 introduced certificate v2.0, which our verifier deliberately refuses.
  Whether to accept it is an open product decision.
* **No version of any package carries npm provenance attestations**, because the Release
  workflow has never run a publish. A Trusted Publisher would add them to future releases; it
  cannot retrofit past ones.

## Live `@smartledger/bsv` versions, by outstanding class

> **One defect found 2026-10-14 is not in the table above and affects EVERY live version,
> including `9.35.0`.** `GDAF#generateAgeProof` and `bsv.generateAgeProof` ignored their first
> argument and committed to a hardcoded `new Date('1995-06-15')`, so a proof that a subject meets
> an age threshold could be obtained for a subject who does not — measured on published 9.35.0, a
> credential for a subject born 2015-03-01 verified `true` at every `minimumAge` from 1 to 31. It
> is fixed in **9.36.0**. It is a minor and not a major because `generateAgeProof` was a constant
> function of its first argument — ten input shapes against published 9.35.0 returned one
> commitment and zero proofs matching what was asked, `undefined` and `null` included — so there
> is no working call for the fix to break, which is the same ground 9.23.0 stood on. The harm
> requires a relying party that treats a `true` from this API as credential-backed evidence about
> the credential's subject; that is what our own developer documentation showed it doing, and that
> documentation is corrected. The table above gains its row once 9.36.0 is on the registry.


### Outstanding forgery (67)
  7.5.1, 7.5.2, 7.5.3, 7.5.4, 7.5.5, 7.5.6, 7.5.7, 7.5.8, 7.6.0, 7.6.1, 7.6.2, 7.7.1
  7.8.1, 7.9.0, 7.10.0, 7.10.1, 7.11.0, 7.12.0, 7.13.0, 8.0.0, 8.0.1, 8.1.0, 8.2.0
  8.3.0, 8.3.1, 9.0.0, 9.1.0, 9.1.1, 9.2.0, 9.3.0, 9.4.0, 9.5.0, 9.6.0, 9.7.0, 9.8.0
  9.9.0, 9.10.0, 9.10.1, 9.11.0, 9.11.1, 9.11.2, 9.12.0, 9.13.0, 9.14.0, 9.15.0, 9.16.0
  9.16.1, 9.18.0, 9.19.0, 9.20.0, 9.21.0, 9.22.0, 9.22.1, 9.23.0, 9.24.0, 9.25.0, 9.26.0
  9.26.1, 9.26.2, 9.27.0, 9.28.0, 9.28.1, 9.29.0, 9.29.1, 9.29.2, 9.30.0, 9.31.0

### Outstanding consensus false accept (1)
  9.32.0

### Outstanding error-name divergence, plus the crash (1)
  9.33.0

### Outstanding crash only (1)
  9.33.1

## Release tags

Every published version present in this repository's history now carries a `v*` tag whose
commit is the **published tree**, verified by reproducing the registry shasum from a worktree
at that commit rather than by assuming the version-bump commit — 3 of 18 backfilled tags were
not the bump commit. `bsv` is 119/129 tagged; the 10 gaps (`1.5.6-fix1`, `3.0.2`-`3.3.5`) were
published before this repository's first commit, whose `package.json` history begins at 5.4.0,
so there is no commit to tag. `bsv-core` is 13/13.

## How this page was checked, and what is still unchecked

The version counts, dates and deprecation states come from the registry and are re-verified by
`npm run check:npm-inventory`, which fails the suite if the package table drifts.

The defect table was cross-checked by a second session reading `CHANGELOG.md` independently.
That check confirmed the fix versions in the first draft and found five defects it had missed,
the certificate-verifier error, the overstated "nothing known", and the wrong lineage claim
about the unscoped package. Every one of its findings was verified against the changelog here
before being written down.

Then an outside review of the deprecation plan pointed out that none of it had been checked
against the **artifacts**, only against the changelog. That review is why the section above
exists, and it was right to insist: running the published versions moved the 9.33.0 text from
wrong to right, bounded the fund-loss window at 7.5.0 by measurement, found the unscoped
package's key disclosure, and resolved the 4.4.0 operand question in the opposite direction
from the guess. Its remaining points — that a constructed payload is not a broadcast, that
stringifying is not yet disclosure, and that a claim about "no fixed release" is a claim about
the future — were all taken into the wording.

Still unchecked, and deliberately stated rather than glossed:

* the defect table's **completeness** — see the note above its rows. This is why the 63-version
  message names one forgery verified present in all 63 rather than enumerating defects;
* whether any version entry outside the sections already read contains a further defect;
* whether anything **other** than an undecodable output script reaches the same null dereference
  — hence "some chain transactions" in the three newest messages;
* the other five `@smartledger/*` packages were not probed this way. They have no deprecated
  versions and no known forgery or consensus defect, but that rests on their changelogs, which
  is exactly the standard this round found insufficient for `bsv`.

## Applied, 2026-10-13

All nine tiers are **sent and verified**: 148 of the 149 published versions across the two
package names now carry the message recorded above, re-read from the registry byte for byte,
with `@smartledger/bsv@9.33.2` the one version carrying none.

    node scripts/npm-deprecations.js verify all
    149 versions checked, 148 changed since the snapshot, 0 mismatches

Applied most severe first: the 14 unscoped key-disclosure versions, then the 8 stringify-leak
ones, then the 4 fund-loss versions, then the 54 corrected advisory messages, then the 62
forgery versions, then the 3 bundle versions and the three newest one at a time.

Confirmed from the consumer side as well as from the metadata, because the metadata is not what
a user sees:

* `npm install smartledger-bsv` — prints the Critical key-disclosure text for 4.4.0;
* `npm install @smartledger/bsv@7.5.3` — prints the Critical fund-loss text;
* `npm install @smartledger/bsv` — prints **no** deprecation warning.

### Two npm behaviours worth writing down, both found the hard way

**`--userconfig` must come AFTER the two positional arguments.** Placed between the subcommand
and the arguments —

    npm deprecate --userconfig <path> <pkg@range> "<message>"     # WRONG

— npm 10.9.9 sends an **empty** message and **exits 0**. The first call of this run did exactly
that, and 9.33.1 briefly carried `deprecated: ""`, which npm treats as not deprecated. A silent
no-op reported as success is the worst possible failure mode for a registry write, and only the
read-back caught it.

**A write that landed can still report `E422`.** The corrected call for 9.33.1 returned
`422 Unprocessable Entity` on the `PUT` — and the message was stored correctly. So the exit code
is advisory and the registry read is the authority. Every tier here was confirmed by re-reading
the packument, never by npm's exit status.

A third, smaller one: the registry is fronted by a CDN that can serve a packument a few seconds
stale, so a verify taken immediately after a write may still show the old message. That
direction is a false *alarm* rather than a false pass — the new text cannot appear unless it was
stored — but it made one tier look like it had failed when it had not.
`scripts/npm-deprecations.js verify` now sends a cache-busting read and retries up to four
times before reporting a mismatch.

### What is reversible, and how

`npm deprecate <pkg>@<range> ""` clears a message. Restoring a *previous* message, rather than
just clearing it, needs `docs/npm-deprecations/snapshot-2026-10-13.json` — the pre-run state of
all 149 versions, committed before anything was sent. It is the only record of the 56 messages
this run overwrote.

### 9.34.0 and 9.35.0 published 2026-10-14, and what the earlier block was

Both were refused earlier the same day by this session's **permission classifier**, not by npm —
a failure that is not on the 404/403/401 ladder at all, because the registry was never reached.
Recorded because the distinction cost a diagnosis: a classifier refusal names itself in the tool
error and nothing leaves the machine; the ladder is about the registry's own answer.

Published once authorized, each from a fresh `--depth 1` clone of the pushed commit with
`npm ci` and `npm run build-all`, `git status` empty in the clone afterwards, and the tarball
reproduced against the working tree before the publish:

| version | commit | shasum | files | registry |
|---|---|---|---|---|
| 9.34.0 | `6bf25b9` | `440c41ee98738fb95b75fe01437fc63ea9544aaf` | 283 | confirmed by direct read |
| 9.35.0 | `5e57819` | `fbfa8dcca5e1d903337d8fb4ed7fb40d03d95a65` | 284 | confirmed, `latest` |

`NPM_TOKEN3` is the credential that authenticates from this machine; the other two returned a
**stable** 403 across three reads each, and stable means the credential rather than the
transport. Egress was a cellular address (`172.56.32.181`) and an anonymous registry read
returned 200 before anything was attempted.

**The `v9.35.0` tag was moved before publishing**, from `d26b74b` to `5e57819`. `d26b74b`
carried a CHANGELOG claim that two implementations' flag words had been checked against each
other; they are not comparable, and the correction is in the later commit. `lib/`, the bundles
and `bsv.d.ts` are byte-identical between the two, so no published code changed — but the
CHANGELOG ships inside the tarball, and a tag pointing at a tree that is not the published one
is a failure this project has already paid for.

Verified from the installed artifact rather than the tree: `npm install @smartledger/bsv@9.35.0`
parses `6a4c` and no longer derives a field salt from the proof nonce.

### Correction: `npm audit` does not flag these versions, and I guessed at why

This page has said throughout that a deprecation warning never reaches `npm audit` and that an
advisory is the mechanism that does. The first half is right. The second does not hold, and the
first attempt to explain it overreached — both corrections belong here.

**Measured.** `GHSA-gw63-x79h-mhjc` has been published since 2026-08-07. In a fresh project with
a lockfile on npm 10.9.9, `npm install @smartledger/bsv@7.0.0` — **inside** that advisory's
`< 7.5.1` range — then `npm audit` exits 0 with "found 0 vulnerabilities", every total zero and
no error field. The instrument works: `minimist@1.2.0` in the same session exits 1 and reports
both its advisories. The advisory is also absent from the public global API (404 by id, zero by
ecosystem query).

The first run of that test used 9.31.0, which is **outside** the `< 7.5.1` range, so it measured
nothing about the old advisory at all and only showed that two advisories published ten minutes
earlier had not propagated. A review caught it. Testing a version outside the range you are
asking about is a wasted measurement that reads like a result.

**And the cause is NOT established.** The first version of this section said a CVE request was
"most likely" the missing step. That was a guess dressed as a finding: a CVE id and GitHub's
decision to review a package advisory are different processes, and GitHub documents the CVE
request as optional rather than as a promotion mechanism. What is documented is that repository
advisories are a *source* for the database, that **reviewed** advisories are the ones mapped to
ecosystems, and that Dependabot does not alert on unreviewed ones.

So the next step is to ask GitHub how to get these reviewed, then retest. A CVE is a separate
decision on its own merits, not a presumed fix. See `docs/advisories/README.md`.

### The published advisory was amended the same day

`GHSA-gw63-x79h-mhjc` now lists **two** affected products — it gained
`npm smartledger-bsv <= 4.4.0` with `patched_versions: null`, since no release on that name
fixes it and the fix is changing package. It also stops recommending `>= 7.5.3`, which is inside
the 7.5.1 – 7.5.4 fund-loss window.

The write was read back from the API and the description is **byte-identical** to what was
sent, which is the only check worth trusting: an exit code is advisory in both directions here
as it is for `npm deprecate`.

All three remaining advisories were created and published the same day, each read back from the
API with a byte-identical description and matching affected products:

| advisory | severity | affected |
|---|---|---|
| `GHSA-9r95-pq7h-p78g` | critical, CVSS 9.1 | `@smartledger/bsv >= 7.5.1, < 7.5.5` |
| `GHSA-xc2p-cffw-qm3j` | high, CVSS 7.5 | scoped `>= 3.3.2, < 9.32.0`; unscoped `>= 3.3.1, <= 4.4.0` |
| `GHSA-5f36-cmq3-37xg` | high, CVSS 7.5 | scoped `>= 3.3.2, < 9.34.0`; unscoped `>= 3.3.1, <= 4.4.0` |

Each carries a CVSS vector rather than a bare label, so the severity follows from a stated model
a reader can disagree with. None has a CVE. What that does and does not achieve is in the
correction above.

### Pending — what is still not done

Steps 1 and the amendment are done. What remains, in order:

1. **Deprecate 9.33.2 and 9.34.0.** 9.33.2 carries the salt defect and 9.34.0 the parser false
   reject; three versions are now live and two of them should not be. This was the step that had
   to wait for a published successor, and it no longer does.
2. **Extend the deprecation text on 9.32.0, 9.33.0 and 9.33.1**, whose messages name only the
   defect each was deprecated for and now understate what is outstanding in them.
3. **Create and then publish the three new advisories** in `docs/advisories/`. Creating is
   private to maintainers; publishing is what reaches `npm audit`. Their payloads are built and
   `npm run check:advisories` holds them to the markdown.

None of the three is authorized yet. Deprecating is explicitly outside the standing publish
authority, because it changes what existing installs resolve.

### Still not done, and deliberately

**No security advisory was created or amended.** This is the gap that matters, because
**a deprecation warning prints at install time and never reaches `npm audit`.** An advisory is
what puts an entry in the GitHub Advisory Database, which is what `npm audit`, Dependabot and
every scanner downstream of it read. So everything above tells a human watching their install
output; only an advisory tells the tooling.

Three pieces of advisory work are **prepared and not sent**, in `docs/advisories/`: an amendment
adding the unscoped package to GHSA-gw63-x79h-mhjc, and new advisories for the fund-loss defect
and the disclosure-commitment forgery. `node scripts/build-advisories.js` turns them into the
exact API payloads. Each is one call, and a created advisory is a private draft until published.

**The structural point, which cost a draft to learn.** The first amendment tried to warn, in the
published advisory's *prose*, that its recommended `>= 7.5.3` is unsafe. That is useless where it
matters: the advisory's machine-readable part says `@smartledger/bsv` is patched at 7.5.1, so a
scanner treats 7.5.1 – 7.5.4 as **not affected by that advisory** whatever the text says.
**Prose cannot change audit results.** Hence the split — the published advisory keeps its scope
and gains the package it was missing, and the other two defects get their own ranges.

**A correction to what this page said earlier.** It claimed the advisory's description overstates
the defect by saying the key was "published". Reading the whole advisory, its body already
conditions on broadcast — "any call ... that supplied a private key and *produced a broadcast
transaction*". Only the one-line summary is loose. The amendment leaves that wording alone.

**And a range I would have drawn wrongly.** The disclosure-commitment advisory's obvious range
was `>= 7.5.5, < 9.32.0`, the 63 live versions the forgery was executed against. But that tells
a 7.0.0 user they are unaffected, so the earlier versions were measured: 4.4.0, 5.4.0, 6.0.0,
7.0.0, 7.4.0 and 7.5.0 all accept the forged disclosure. The honest range is `< 9.32.0`. That is
the same mistake as the 9.33.0 text — a boundary drawn around whatever happened to be in the
sweep — made again in a different place on the same day.
* No `npm unpublish`, and no `dist-tag` changes. 4.4.0 remains `latest` on the unscoped name, so
  every bare install of it prints the Critical text — which is the intent. A final unscoped
  release would be a separate publish decision.
