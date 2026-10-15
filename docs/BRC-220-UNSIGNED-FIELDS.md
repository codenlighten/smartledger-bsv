# BRC-220: proposed amendment — the unsigned region of a certificate

**Status:** branch prepared and revised, **not pushed and not filed**. The push to the fork was
blocked locally, so filing is the one step outstanding.

Re-verified 2026-10-14 against `apps/0220.md` at `bsv-blockchain/BRCs@master` (662d25e, 219
lines). The two editorial words that differ from the version this was drafted against
("specification" → "proposal", in the Abstract and Motivation) are **not** a relabelling by the
maintainers: "proposal" is the original wording of this BRC's own first commit (ac0ffa5), an
unrelated PR (#307) swapped it to "specification" across many BRCs in a wording sweep, and the
maintainer reverted that sweep wholesale in #316 — 81 files, 12 such restorations. The repo's
own `AGENTS.md` calls every BRC a "proposal" throughout. An earlier note here read the revert's
diff direction as maintainer intent; it was collateral from a revert, and nothing about BRC-220's
status changed. `AGENTS.md` carries no AI-disclosure policy and its numbering rules say an
amendment keeps its number.

Branch `brc-220-unsigned-region`, one commit (`693575b`), `apps/0220.md` only, +7 lines (4 content),
219 → 226. Cut from `upstream/master`, not the fork's master, which is 511 behind. Two rounds of
outside review changed the text substantially — see the corrections marked below.

The PR body is in `docs/BRC-220-UNSIGNED-FIELDS.pr.md` and follows the repo's pull-request
template. Precedent for an amendment carrying normative text: PR #247 (`bbe8137`), merged, added
two MUSTs and two MAYs to this same BRC.

## What is missing from the spec

BRC-220 fixes the signature's scope precisely, in §Canonical proof bytes:

```
lp("NotaryHash/1.0") || u8(version=1) ||
lp(algorithm) || lp(hashAlgorithm) ||
lp(payloadHash) || lp(publicKey) || lp(signature) ||
u64be(createdAtUnix)
```

Eight components — but **two of them are constants, not fields**: `"NotaryHash/1.0"` is a domain
separator and `u8(version=1)` is the format version, neither read from the document. So the bytes
cover **six** of the certificate's twelve fields. Measured rather than counted by eye, by
tampering each field and recomputing `proofHash`:

| moves `proofHash` | does not |
|---|---|
| `algorithm`, `hashAlgorithm`, `payloadHash`, `publicKey`, `signature`, `createdAt` | `protocol`, `version`, `mode`, `encoding`, `proofHash`, `anchor`, `merkle`, `spv` |

The first draft of this document said the unsigned region was `anchor`, `merkle` and `spv`. **It
is larger than that**: `protocol` and `mode` are outside the signature too. Three of the
right-hand fields are nonetheless bound by other means — `proofHash` is recomputed and compared
in step 2 of §Verification; `version` by the constant plus the spec's existing *"A verifier MUST
reject a certificate whose `version` it does not implement"*; and `encoding` only partly —
**corrected 2026-10-14 after an outside review**: `encoding` is not committed to at all.
Verification operates on the decoded bytes, so a label rewritten *together with* the two values it
governs (`"hex"` → `"base64"`, both re-encoded) changes nothing a verifier checks. What the
spec does catch is a label *inconsistent* with its values, by §Certificate's existing
MUST-reject rule for a value that is not valid in its encoding, or by the signature check.

What is left outside the signed bytes is `protocol`, `mode`, every member of `anchor`, and the
additive `merkle` and `spv`. Several of those are still checkable — just not by the signature:
`protocol` and `version` have a single permitted value each; `anchor.txid` is recomputed from
`rawTx`; the `OP_RETURN` pushes must match the certificate's fields; `merkle.root` and `leafCount`
must equal the batch record on chain and `path` must fold to `root`; and `mode` must equal the
on-chain mode byte in a *direct* certificate. Each of those is a check a verifier performs, and
some members — `anchor.network`, `spv.format`, `mode` in a batch — have no such check at
all.

A party who re-serialises a certificate with any of those changed produces a document with the
same `proofHash` and the same valid signature.

The spec states this twice, locally, where it happened to matter:

> `network` — "The field is descriptive: which chain the anchor is on is established by the
> block header the verifier obtains, not by this value."

> "The SPV envelope is **not** part of the canonical proof bytes, so adding it never changes
> `proofHash` and never invalidates a previously issued certificate."

Both are correct. Neither generalises, and the general rule is the one implementers need,
because the consequence is not "these two fields are advisory" — it is **that a `valid`
result must not silently leave a member of that region unchecked**, and that a caller cannot
tell which members were checked unless the verifier says.

## Why this is worth a paragraph in the spec

This is not hypothetical. Every instance below was a real false `valid` in a shipped
implementation of this spec, found by independent verifiers written from the spec rather than
from the code, and each one is a member of the unsigned region:

| field | what a certificate could claim unchecked | fixed in |
|---|---|---|
| `spv.format` | a format the proof was not checked as | `@smartledger/bsv` 9.24.0 |
| `anchor.seal` | being the one successor of another record | 9.25.0 |
| `anchor.blockHeight` | a height bound to nothing | 9.25.0 |
| `anchor.network` | the wrong chain entirely | 9.27.0 |

Each of those four shipped through a release gate that runs the full test suite, the
NotaryHash certificate tests included, and each was found afterwards by comparing against an
independent verifier rather than by a test. (An earlier draft of this document cited "a
1,483-case conformance corpus" here, corrected 2026-10-14: those 1,483 vectors are the node's
`script_tests.json` script-evaluation corpus, which has nothing to do with certificate
verification, so its passing was never evidence about these four.) What they had in common
was not a coding error; it was reading `valid` as a verdict about the document when it is a
verdict about the signature and the anchor the verifier actually resolved. A reader who has
the signature's field list in front of them still has to derive that, and the four cases above
are evidence that implementers do not.

## Proposed text

Reproduced from the prepared branch (`apps/0220.md` on `brc-220-unsigned-region`), so this
section and the commit cannot drift apart. Added to **§What a certificate proves**, after the
existing paragraph:

> The canonical proof bytes are built from six of the certificate's fields — `algorithm`,
> `hashAlgorithm`, `payloadHash`, `publicKey`, `signature` and `createdAt` — together with the
> literal domain separator `"NotaryHash/1.0"` and `u8(version=1)`, which are constants of the
> format rather than values read from the document. Changing the decoded value of any of those
> six changes the canonical bytes, so the recomputed `proofHash` no longer equals
> `certificate.proofHash`: step 2 of §Verification catches every one of them, and a certificate
> whose `proofHash` field is rewritten to agree with the alteration no longer matches the record
> on chain, which step 3 catches. Step 1 catches only those it reads — `payloadHash`,
> `publicKey`, `signature`, and `algorithm`, which selects the verification algorithm — so
> `hashAlgorithm` and `createdAt` are bound by the integrity root alone and not by the
> signature. Two further fields are bound without entering the bytes as values: `proofHash`, to
> the canonical bytes by step 2 and to the anchor by the record step 3 reads; and `version`, by
> its single permitted value in §Certificate together with the requirement there that a verifier
> reject a `version` it does not implement — the `u8(version=1)` literal is a constant of the
> format, not a check on the field. `encoding` is a third case: it is not committed to at all.
> Verification operates on the decoded bytes, so a label rewritten together with the two values
> it governs is indistinguishable, while a label inconsistent with them is caught by
> §Certificate's rule that a reader reject a value that is not valid in its encoding, or by step
> 1.
>
> **Everything else is outside the signed bytes.** `protocol`, `mode`, every member of `anchor`,
> and the additive `merkle` object and `spv` envelope are absent from the canonical proof bytes,
> so re-serialising a certificate with any of them altered leaves the signature, the recomputed
> `proofHash` and the on-chain record untouched: nothing in steps 1–2 of §Verification can
> detect the change. What binds them instead is step 3 and the field definitions in §Certificate
> — `anchor.txid` against `reverse(SHA256(SHA256(rawTx)))`; the pushes of the `OP_RETURN` read
> from `rawTx` against the certificate's fields; `merkle.root` and `leafCount` against the batch
> record on chain, and `merkle.path` by folding from the leaf to `root`; `mode` against the
> on-chain mode byte in a direct certificate; `protocol` and `version` against their single
> permitted values. Each of those is a check the verifier performs against evidence it
> authenticates itself, not a property the signature carries, and some members have no such
> check at all. That `network` is descriptive, and that the SPV envelope is outside the
> canonical bytes, are instances of this rather than exceptions to it.
>
> A verifier MUST NOT report a certificate as valid while leaving a member that this document
> defines in that region both unexamined and unreported. For each of them it either performs the
> applicable check, refuses the certificate, or states in its result that the member was not
> checked; a verifier that silently ignores `spv.format`, `anchor.network` or `anchor.type`
> reports a verdict its caller will reasonably read as covering them. A result MAY still be
> valid while naming members it did not check — what it may not do is stay silent about them.
> The obligation is to the members defined here, which leaves intact §Certificate's rule that
> verifiers ignore members they do not recognise, and is what lets a later revision add a member
> without invalidating a certificate already issued. §Certificate already follows this practice
> once, for `mode`, by saying plainly that in a batched certificate it is not checked against
> the chain — that is the pattern, applied to the rest of the region. Where a claim cannot be
> checked because the verifier lacks the means — no header, no chain source, no mode byte on
> chain — the result for that member is *indeterminate*, which is distinct from both valid and
> invalid: "I could not look" is not "the answer is no".

Added to **§Security considerations**:

> - A certificate is two documents in one: a signed proof, and an unsigned description of where
>   that proof is anchored. Only the first is tamper-evident, and not by the signature alone: the
>   signature authenticates the signer's claim about `payloadHash`, and the canonical bytes
>   together with the record on chain cover the rest of it. The second holds only as far as the
>   verifier checked it. Implementations SHOULD enumerate, in their result, which members of the
>   unsigned region they checked.

## What this does not change

No wire format, no canonical bytes, no on-chain record, no field definition, no existing
certificate. Two of the three paragraphs are an accounting of what the document already says.
The third is a genuinely new requirement, and the PR body says so rather than calling the whole
thing a clarification: it constrains what a verifier may **report**. A verifier that today
returns `valid` while silently skipping `spv.format` becomes non-conformant — which is the
point, and is why it is stated as its own paragraph and not slipped in.

Two things keep it an amendment rather than a new standard. It is scoped to the members **this
document defines**, so §Certificate's rule that "verifiers ignore members they do not
recognise" survives intact — that rule is how the SPV envelope was attached to certificates
already issued, and an obligation over unrecognised members would have contradicted it (an
outside review caught that; the first draft of the paragraph said "a member of this unsigned
region" without limit). And a result MAY still be valid while naming members it did not check,
so no verifier is forced to refuse anything it accepts today; what changes is that it must say
what it looked at.

## The reference implementation already behaves this way

Checked, because the withdrawn `encoding` amendment failed precisely by contradicting the
reference. Against a real mainnet batch certificate the reference refuses **four**
unsigned-region tampers — T27 `anchor.network`, T28 `spv.format`, T29 `anchor.type`, T30
`merkle` removed from a batch certificate — reporting `signatureValid: true` *and*
`proofHashValid: true` in every one, the refusal coming from `anchorStatus` alone. So this
codifies existing reference behaviour rather than asking any implementation to change, which is
the opposite footing from the withdrawn proposal.

**Corrected 2026-10-14:** this section and the PR body said "all five" and counted T31
`createdAt` among the unsigned-region tampers. It is not one — `createdAt` is one of the six
fields that enter the canonical proof bytes. T31 is a range check (a timestamp before 1970, which
the unsigned `u64be(createdAtUnix)` cannot encode), and the reference refuses it with
`signatureValid: true` but `proofHashValid: **false**`: caught by the integrity root, not by the
signature. That is a measured instance of the field accounting the amendment adds, so it belongs
in the evidence — just not in this list. An outside review caught the miscount.

T27 and T28 are marked `policyDependent` in the corpus, for exactly the reason the added
paragraph gives: a verifier that treats `anchor.network` or `spv.format` as an unchecked label
may accept them, and should then not present those fields as verified.

§Certificate also already follows the reporting pattern once, for `mode`: *"In a batched
certificate `mode` is not checked against the chain."* The amendment generalises a practice the
spec has.

## Evidence available on request

- `test/data/notaryhash-tamper-cases.json` — the NotaryHash service's 32 single-field tampers
  of one real mainnet batch certificate, with the reference verifier's verdict for each. Cases
  T27–T30 are the unsigned-region claims (`anchor.network`, `spv.format`, `anchor.type`,
  `merkle` removed from a batch certificate); T31 (`createdAt` before 1970) is a signed-field
  range check — see the correction above.
- `test/notaryhash/tamper_corpus.js` — all 32 run against our verifier: 31/32 by default and
  32/32 once the caller names the chain, the single divergence being the one case where a
  library legitimately differs from a service that knows its own chain.
