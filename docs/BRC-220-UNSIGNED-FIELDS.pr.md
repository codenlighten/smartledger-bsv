## What this changes

BRC-220 specifies the canonical proof bytes exactly. Nothing under `anchor`, `merkle` or `spv`
appears in them, so every member of those objects is unsigned by construction: a party can
re-serialise a certificate with any of them altered and the signature, `proofHash` and on-chain
record all stay valid.

The spec says this twice already, locally, where it happened to matter — that `network` is
descriptive, and that the SPV envelope is outside the canonical bytes. Both are correct; neither
generalises. The consequence an implementer needs is the general one: **a verifier's `valid`
cannot be read as covering any member of that region unless the verifier says it checked it.**

This adds three paragraphs to §What a certificate proves and one bullet to §Security
considerations:

1. which of the certificate's fields the canonical bytes cover (six), which are bound by other
   means (`proofHash` by step 2 of §Verification, `version` by the `u8(version=1)` constant and
   the existing MUST-reject rule, `encoding` because it governs two values that are inside the
   bytes), and which are outside entirely;
2. that everything else — `protocol`, `mode`, all of `anchor`, and the additive `merkle` and
   `spv` — is unsigned, and is a claim *about* where the proof is anchored rather than an
   attested fact;
3. a reporting obligation: for each member of the unsigned region a verifier either checks the
   claim, refuses the certificate, or states in its result that the member was not checked. Where
   it lacks the means to check, the honest result is *indeterminate* — distinct from both valid
   and invalid.

§Certificate already follows exactly that pattern once, for `mode` in a batched certificate,
where it says plainly that the value is not checked against the chain. This generalises the
practice the spec already has.

## Why it is worth spec text

Four separate false-`valid` results in a shipped implementation of this spec, each one a member
of the unsigned region, each found by verifiers written from the spec rather than from the code:

| field | what a certificate could claim unchecked | fixed in |
|---|---|---|
| `spv.format` | a format the proof was not checked as | `@smartledger/bsv` 9.24.0 |
| `anchor.seal` | being the one successor of another record | 9.25.0 |
| `anchor.blockHeight` | a height bound to nothing, once `spv.blockHeight` was null | 9.25.0 |
| `anchor.network` | the expected-chain check defeated by deleting the label | 9.27.0 |

A 1,483-case conformance corpus and 5,000+ tests passed throughout. The common thread was not a
coding error — it was reading `valid` as a verdict about the document when it is a verdict about
the signature plus whatever the verifier actually resolved. A reader with the signature's field
list in front of them still has to derive that, and four separate cases are evidence that
implementers do not.

**The reference implementation already behaves this way.** Against a real mainnet batch
certificate, it refuses all five unsigned-region tampers — `anchor.network`, `spv.format`,
`anchor.type`, `merkle`-present-iff-batch and `createdAt` — while reporting `signatureValid:
true` in every case. So this codifies existing reference behaviour rather than asking any
implementation to change.

## What it does not change

No wire format, no canonical proof bytes, no on-chain record, no existing certificate. It
constrains what an implementation may *report*, and makes explicit a property the format already
has. Implementations that already check these members are already conformant.

## Evidence available on request

- the service's 32 single-field tampers of one real mainnet batch certificate (tx `d0dfc328…`,
  block 954784), with the reference verifier's verdict for each — cases T27–T31 are the
  unsigned-region claims;
- those 32 run against a second independent verifier: 31/32 by default and 32/32 once the caller
  names the chain, the single divergence being the one case where a library legitimately differs
  from a service that knows its own chain.
