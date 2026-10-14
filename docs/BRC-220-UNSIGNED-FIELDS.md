# BRC-220: proposed amendment — the unsigned region of a certificate

**Status:** branch prepared, **not pushed and not filed**. Re-verified on 2026-10-14 against
`apps/0220.md` at `bsv-blockchain/BRCs@master` (662d25e, 219 lines) — still byte-identical to the
version this was drafted against apart from two editorial words ("This specification defines" →
"This proposal defines", in the Abstract and Motivation). The branch
`brc-220-unsigned-region` sits on upstream master, one commit, `apps/0220.md` only.

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
reject a certificate whose `version` it does not implement"*; and `encoding` because it governs
how `publicKey` and `signature` are decoded, both of which are inside the bytes. What is left
genuinely unsigned and not self-checking is `protocol`, `mode`, every member of `anchor`, and the
additive `merkle` and `spv`.

A party who re-serialises a certificate with any of those changed produces a document with the
same `proofHash` and the same valid signature.

The spec states this twice, locally, where it happened to matter:

> `network` — "The field is descriptive: which chain the anchor is on is established by the
> block header the verifier obtains, not by this value."

> "The SPV envelope is **not** part of the canonical proof bytes, so adding it never changes
> `proofHash` and never invalidates a previously issued certificate."

Both are correct. Neither generalises, and the general rule is the one implementers need,
because the consequence is not "these two fields are advisory" — it is **that a verifier's
`valid` cannot be read as covering any member of these two objects unless that verifier says
it checked it.**

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

A 1,483-case conformance corpus and 5,000+ tests passed throughout. What they had in common
was not a coding error; it was reading `valid` as a verdict about the document when it is a
verdict about the signature and the anchor the verifier actually resolved. A reader who has
the signature's field list in front of them still has to derive that, and the four cases above
are evidence that implementers do not.

## Proposed text

Add to **§What a certificate proves**, after the existing paragraph:

> The signature covers the eight fields of §Canonical proof bytes and nothing else. Every
> member of `anchor`, `merkle` and `spv` is outside it: a party may re-serialise a certificate
> with any of them altered and the signature, `proofHash` and on-chain record remain valid.
> These members are therefore claims *about* where the proof is anchored, not attested facts,
> and a verifier establishes each one only by resolving it against a block header and a
> transaction it obtained itself.
>
> A verifier MUST NOT report a certificate as valid while leaving a member of this unsigned
> region unexamined and unreported. For each such member it either (a) checks the claim, (b)
> refuses the certificate, or (c) states in its result that the member was not checked. A
> verifier that silently ignores `spv.format`, `anchor.network` or `anchor.type` reports a
> verdict its caller will reasonably read as covering them. Where a claim cannot be checked
> because the verifier lacks the means — no header, no chain source — the correct answer is
> *indeterminate*, which is distinct from both valid and invalid: "I could not look" is not
> "the answer is no".

Add to **§Security considerations**:

> - A certificate is two documents in one: a signed proof, and an unsigned description of
>   where that proof is anchored. Tamper-evidence applies only to the first. Implementations
>   SHOULD enumerate, in their result, which members of the unsigned region they checked.

## What this does not change

No wire format, no canonical bytes, no on-chain record, no existing certificate. It is a
constraint on what an implementation may report, and it makes explicit a property the format
already has. Implementations that already check these members are already conformant.

## The reference implementation already behaves this way

Checked, because the withdrawn `encoding` amendment failed precisely by contradicting the
reference. Against a real mainnet batch certificate, the reference refuses **all five**
unsigned-region tampers — T27 `anchor.network`, T28 `spv.format`, T29 `anchor.type`, T30
`merkle`-present-iff-batch, T31 `createdAt` — while reporting `signatureValid: true` in every
one. So this codifies existing reference behaviour rather than asking any implementation to
change, which is the opposite footing from the withdrawn proposal.

§Certificate also already follows the reporting pattern once, for `mode`: *"In a batched
certificate `mode` is not checked against the chain."* The amendment generalises a practice the
spec has.

## Evidence available on request

- `test/data/notaryhash-tamper-cases.json` — the NotaryHash service's 32 single-field tampers
  of one real mainnet batch certificate, with the reference verifier's verdict for each. Cases
  T27–T31 are exactly the unsigned-region claims (`anchor.network`, `spv.format`,
  `anchor.type`, `merkle`-present-iff-batch, `createdAt`).
- `test/notaryhash/tamper_corpus.js` — all 32 run against our verifier: 31/32 by default and
  32/32 once the caller names the chain, the single divergence being the one case where a
  library legitimately differs from a service that knows its own chain.
