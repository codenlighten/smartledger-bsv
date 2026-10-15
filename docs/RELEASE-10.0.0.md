# 10.0.0 — the planned major

**Not before 2027-09-01.** [STABILITY.md](../STABILITY.md) commits this package to patch and minor
releases until then, after six majors in 82 days taught us what a major costs a consumer. Nothing
here ships early.

This file exists because the commitments were scattered across nine source files and three docs,
which is how a major gets assembled instead of planned. Every breaking change the library has
promised is listed here, and `test/properties/release_10_plan.js` asserts that **every
`removeIn: '10.0.0'` registered in `lib/` appears below** — so a new deprecation cannot be added
without landing in this plan, and a row cannot be invented that the code does not back.

Each item states what breaks, what a caller does instead, and how long the notice has been in
their logs.

---

## Registered deprecations — these warn today and throw or change in 10.0.0

Nine, listed by the file that registers them. `since` is the version whose logs first carried the
notice; `lib/util/deprecate.js` warns once per API per process, respects
`BSV_NO_DEPRECATION_WARNINGS=1` and **never throws**, because a deprecation that throws is a
breaking change wearing a warning's name.

| since | what stops working | what to write instead |
|---|---|---|
| 9.1.0 | `MerkleBlock#filterdTxsHash` — the typo spelling | `MerkleBlock#filteredTxsHash` |
| 9.1.0 | `SmartContract.Builder({ allowNonEnforcing: true })` | `SmartContract.policy()`, or `SmartContract.PushTx` / `Token` / `valueCovenant` |
| 9.2.0 | an LTP claim call **without a canonicalization argument** — the default stays LEGACY through 9.x | `bsv.LTP.Claim.hash(claim, bsv.LTP.Claim.CANONICALIZATION.JCS)` |
| 9.9.0 | `NotaryHash.Certificate.build()` **without a format** — 9.x writes the 9.8.0 format | pass `format: 'reference'`; it becomes the default, and `Certificate.REFERENCE_VERSION` moves with it |
| 9.13.0 | `NotaryHash.verify()` with a `header` but no `minWork` or `blockHashAtHeight` | `verify(cert, { header, blockHashAtHeight })` with a block hash from your own source |
| 9.17.0 | `Script.fromHex()` on a string that is **not whole hex** | round-trip first: `Script.fromHex(h).toHex() === h.toLowerCase()` |
| 9.32.0 | a **credential** field name containing `.` | field names without `.` |
| 9.32.0 | an **LTP token** field name containing `.`, `[` or `]` | field names without path syntax |
| 9.38.0 | `Message#verify()` **accepting a non-canonical (high-s) signature** | `verify(address, sig, { lowS: true })` |
| 9.39.0 | **mutating a parsed output script in place** and expecting it to serialize | `output.setScript(output.script)` after mutating, or build the script before setting it |

### Why the last one is here rather than fixed

A Message signature has a second encoding that verifies identically: flip the recovery id and
replace `s` with `n − s`. So the bytes are not a unique name for a statement, and anything keyed
on them has a forgeable twin — see
[RELIED-UPON-PROPERTIES.md](RELIED-UPON-PROPERTIES.md). Two projects in this estate had assumed
otherwise.

Refusing the twin is nonetheless a **compatibility change, not a bug fix**: the signatures being
refused are valid ECDSA, and while `sign()` has only ever emitted low-s (measured over 40 fresh
keys), other implementations may legitimately emit high-s. So 9.38.0 ships the refusal as
`{ lowS: true }`, warns on the accept, and 10.0.0 makes it the default.

### Why the output-mutation item is a notice and not a fix

`Output#toBufferWriter` writes `_scriptBuffer`, the bytes the output was set from, while the
`script` getter hands out the live `Script` object. Mutating that object therefore changes what
`getSize()` measures and nothing about what serializes — the mutation is dropped and the fee is
computed for a transaction that will not be sent.

Serialising the object instead would make the two agree, and it is not a fix to make inside 9.x:
it would change the bytes of every output whose script was mutated — including, silently, outputs a
caller mutated by accident — and an output's bytes are its identity.

**A measurement corrected the argument here.** The first version of this section said the object
could not be authoritative because a script parsed from non-canonical bytes does not re-encode to
those bytes. That is false in this library: `Script.fromBuffer(b).toBuffer()` equals `b` over every
script of three bytes or fewer (16,843,009, exhaustive) plus 400,000 push-biased random ones, with
0 divergences. So **txid churn does not rule the flip out**, and the real objection is narrower:
serialization would then depend on the parser's fidelity, which is a measured property rather than
an enforced one. `test/transaction/output_inplace_mutation.js` now enforces it, which is what makes
the flip decidable rather than merely attractive.

The 10.0.0 choice is therefore between three shapes: re-sync on mutation (the object wins), refuse
to hand out a mutable script from a parsed output, or add an explicit pre-broadcast check that pays
one serialization and reports every input and output whose object and bytes disagree. The third is
the only one that closes the input side too, and it is additive rather than breaking.

Until then the coverage is honest and partial: the comparison sits in `getSize()`, where both byte
strings have just been computed, so a caller who mutates and serializes without asking for a size
is not warned. `Input` has the same drop with no free place to see it, and
[RELIED-UPON-PROPERTIES.md](RELIED-UPON-PROPERTIES.md) §5 says so.

### Why the three dotted-key items are here rather than fixed

`.` is the path separator in credential and LTP field names, so a field actually named `a.b`
collides with the path to `b` inside `a`. Changing the encoding moves **every Merkle root already
published**, which is why it waits for a major rather than silently invalidating proofs in the
world.

---

## Decided for 10.0.0 but not registered as deprecations

These have no single call site to attach a notice to, so they live here and nowhere else. That
makes this list the only record — treat it accordingly.

- **`NotaryHash.Certificate.VERSION` becomes `'1.0'`**, with `format: 'reference'` as the default.
  9.x writes the 9.8.0 format byte for byte and warns once. (`lib/notaryhash/certificate.js`)
- **The LTP proof field encoding becomes length-prefixed.** The current separator-joined form is
  ambiguous for names containing the separator; length-prefixing is the real fix and it moves
  every Merkle root. (`lib/ltp/proof.js`)
- **`Script.fromHex()` throws** on a string that is not whole hex, rather than warning.
  (`lib/script/script.js`)
- **LTP canonicalization defaults to JCS.** The current default is not RFC 8785, so other
  implementations compute a different claim hash from the same claim. (`lib/ltp/claim.js`)
- **The field-commit encoding changes.** (`lib/util/field-commit.js`)

## Candidates — not decided, recorded so the decision is deliberate

- **Make the verification functions share a return convention.** Today `verifyAgeProof` returns a
  boolean while `verifyCredential` returns a Promise of `{valid, errors}` and `validateCredential`
  and `verifyLegalToken` return that object directly — so `if (result)` is correct for one and a
  silent accept for the other three, and awaiting does not help because `{valid:false}` is truthy.
  Measured identical from 4.0.0 through 9.37.0, so this is original rather than a regression.
  `verifyLegalToken` additionally names its error field `error` (a string) on four input shapes and
  `errors` (an array) on three, **within the one function**, so the obvious way to display a
  failure reason crashes on the commonest input.

  A major is the only place this can be made uniform, and it is the single change most likely to
  prevent a consumer shipping a silent accept. It is listed as a candidate rather than decided
  because uniformity breaks anyone currently reading `.error`.
- **NotaryHash certificate 2.0 support.** The library refuses it today
  (`REFERENCE_VERSION === '1.0'`), and two projects in this estate need it. Adding it is not
  itself breaking, so it does not have to wait for a major — but the default-format flip above
  touches the same code and the two should be decided together.

---

## What "solid" means for this release

1. **No item lands without a notice already in consumers' logs.** Everything in the first table
   has had one since the `since` column. Nothing may be added to 10.0.0 that has not shipped a
   warning in a minor first — that is the whole point of the policy, and the reason this file is
   test-enforced rather than hand-maintained.
2. **Every behaviour change must be measurable before and after.** Each item above either has a
   test pinning the current behaviour (so the flip is visible in a diff) or is named here as
   needing one.
3. **The migration path is in the warning, not only in the docs.** `use:` is mandatory on every
   registered deprecation, so a caller who reads nothing but their logs still knows what to write.
