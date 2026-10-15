### This pull request:

Amends or corrects an existing standard, without the need for creating a new one

It adds three paragraphs to §What a certificate proves and one bullet to §Security considerations,
and changes nothing else: no wire format, no canonical proof bytes, no on-chain record, no field
definition, no existing certificate. Two of the three paragraphs are an accounting of what the
document already says. The third places one new requirement on what a verifier may *report* — the
only normative addition here, and stated plainly rather than buried, so that it can be judged on
its own. The reference implementation already satisfies it for every member a 32-case tamper corpus
exercises (measured below; that is four of the region's members, not all of them), and
§Certificate already states the same rule once, for one field.

### Summary

BRC-220 specifies the canonical proof bytes exactly. Taking that section at its word and asking
which of the certificate's fields it actually covers gives six — `algorithm`, `hashAlgorithm`,
`payloadHash`, `publicKey`, `signature`, `createdAt` — plus two literals that are constants of the
format rather than values read from the document. Three more fields are bound indirectly:
`proofHash` to the canonical bytes by step 2 of §Verification and to the anchor by the record
step 3 reads, and `version` by its single permitted value together with the existing rule that a
verifier reject a `version` it does not implement. `encoding` is a third case: not committed to at
all — verification works on the decoded bytes, so a label rewritten together with the two
values it governs is indistinguishable, while an inconsistent one is caught by §Certificate's
existing MUST-reject rule or by step 1.

Everything else is outside the signed bytes: `protocol`, `mode`, every member of `anchor`, and the
additive `merkle` object and `spv` envelope. Re-serialising a certificate with any of them altered
leaves the signature, the recomputed `proofHash` and the on-chain record untouched, so nothing in
steps 1–2 of §Verification can detect it. What binds them instead is step 3 and the field
definitions in §Certificate — the txid recomputed from `rawTx`, the `OP_RETURN` pushes against the
certificate's fields, the batch root and leaf count against the record on chain, `mode` against the
on-chain mode byte in a direct certificate, `protocol` and `version` against their single permitted
values — each a check the verifier performs against evidence it authenticates itself, and some
members have no such check at all.

The spec says this twice already, locally, where it happened to matter — that `network` is
descriptive, and that the SPV envelope is outside the canonical bytes. Both are correct; neither
generalises. The consequence an implementer needs is the general one: **a `valid` result must not silently
leave a member of that region unchecked** — and a caller cannot tell which members were
checked unless the verifier says.

#### What is added

1. the field accounting above: which fields the canonical bytes cover, which of those steps 1 and 2
   each catch, which are bound indirectly, and which are outside entirely;
2. that everything else is a claim *about* where the proof is anchored rather than a property the
   signature carries, together with the checks the document already provides for them;
3. a reporting requirement: for each member of that region **that this document defines**, a
   verifier either performs the applicable check, refuses the certificate, or states in its result
   that the member was not checked. A result may still be valid while naming members it did not
   check; what it may not do is stay silent about them. Where it lacks the means to check, the
   honest result for that member is *indeterminate* — distinct from both valid and invalid.

Point 3 is deliberately limited to members this document defines, which leaves §Certificate's rule
that "verifiers ignore members they do not recognise" intact — that rule is how the SPV envelope
was added to certificates already issued, and a reporting obligation over unrecognised members
would contradict it. §Certificate already follows the practice point 3 generalises, once, for
`mode` in a batched certificate, where it says plainly that the value is not checked against the
chain because the batch record carries neither the proof nor a mode byte.

#### Why it is worth spec text

Four separate false-`valid` results in a shipped implementation of this spec, each one a member of
the unsigned region — three of them members this document defines, one an extension member, which
is unsigned for the same reason and so makes the same point:

| field | what a certificate could claim unchecked | fixed in |
|---|---|---|
| `spv.format` | a format the proof was not checked as | `@smartledger/bsv` 9.24.0 |
| `anchor.seal` (an extension member, not defined here) | being the one successor of another record | 9.25.0 |
| `anchor.blockHeight` | a height bound to nothing, once `spv.blockHeight` was null | 9.25.0 |
| `anchor.network` | the expected-chain check defeated by deleting the label | 9.27.0 |

Each of those four shipped through a release gate that runs the library's full test suite, its
NotaryHash certificate tests included, and each was found afterwards by comparing against an
independent verifier rather than by a test. The common thread was not a coding error — it was
reading `valid` as a verdict about the document when it is a verdict about the signature plus
whatever the verifier actually resolved. A reader with the signature's field list in front of them
still has to derive that, and four separate cases are evidence that implementers do not.

**The reference implementation already behaves this way.** Against a real mainnet batch certificate
it refuses all four unsigned-region tampers — `anchor.network`, `spv.format`, `anchor.type`, and
`merkle` removed from a batch certificate — reporting `signatureValid: true` *and*
`proofHashValid: true` in every one, with the refusal coming from the anchor alone. So the added
text codifies behaviour the reference already has in every case the corpus tests. It is not a
full per-member audit of the reference's reporting, and is not offered as one. Two of
those four are marked policy-dependent in the corpus, for exactly the reason the added paragraph
gives: a verifier that treats `anchor.network` or `spv.format` as an unchecked label may accept
them, and must then not present those fields as verified.

The same corpus also shows the field accounting is right where it is easiest to get wrong: a
`createdAt` moved before 1970 is refused with `signatureValid: true` but `proofHashValid: **false**`
— caught by the integrity root, not by the signature, which is what the added paragraph says about
`hashAlgorithm` and `createdAt`.

#### Evidence available on request

- 32 single-field tampers of one real mainnet batch certificate (tx `d0dfc328…`, block 954784),
  each with the reference verifier's full result — cases T27–T30 are the unsigned-region claims;
- those 32 run against a second independent implementation: 31/32 agreeing by default and 32/32
  once the caller names the chain, the single divergence being the one case where a library
  legitimately differs from a service that knows its own chain.
