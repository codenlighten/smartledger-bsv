# Proposed BRC-220 amendment: define the batch Merkle leaf

§On-chain record specifies *which* Merkle tree batch mode uses, but never says what goes
in a leaf. This proposes the definition, with the reasoning that led to it.

Prepared 2026-08-17 while implementing BRC-220 in `@smartledger/bsv`. The second gap of
this kind, after `encoding` — see [BRC220_ENCODING_AMENDMENT.md](BRC220_ENCODING_AMENDMENT.md).

---

## What the spec currently says

§On-chain record, batch (`kind = 2`):

> One transaction anchors many proofs under an RFC 6962 Merkle root, domain-separated
> (`leaf = SHA256(0x00 ‖ d)`, `node = SHA256(0x01 ‖ l ‖ r)`, split at the largest power of
> two `< n`, last leaf never duplicated).

That parenthetical identifies the **tree construction**: domain separation, the split
rule, and the no-duplication rule that separate RFC 6962 from Bitcoin's tree. `d`, `l` and
`r` are RFC 6962's own generic symbols — §2.1 of that RFC writes
`MTH({d(0)}) = SHA-256(0x00 || d(0))` — so the sentence is naming the tree, not defining
its contents.

**`d` is never bound to a value.** The word `canonicalBytes` occurs once in the entire
document, in the `proofHash` definition in §Canonical proof bytes; it does not appear in
the batch text. Neither does `proofHash`.

So this is an ambiguity, not a disagreement between spec and implementation. Two
good-faith implementers reading the same sentence can and did reach different answers:

| reading | leaf hash |
| --- | --- |
| `d` = the canonical proof bytes | `SHA-256(0x00 ‖ canonicalBytes)` |
| `d` = the proof's identifier | `SHA-256(0x00 ‖ proofHash)` = `SHA-256(0x00 ‖ SHA-256(canonicalBytes))` |

Both are second-preimage resistant, and the domain separation that gives RFC 6962 that
property is unaffected by which one is chosen. **They are equal in strength and produce
different roots.** A certificate built under one reading fails inclusion under the other,
with no error that points at the cause — the fold simply does not reach the root.

The published test vectors do not settle it: they cover a certificate-with-SPV-envelope
golden vector, `txidFromRawTx` against the Bitcoin genesis coinbase, and the SPV Merkle
fold against block 170. **None of them is a batch-mode vector**, so there is nothing to
conform to by example.

---

## Proposed text

Insert into **§On-chain record**, replacing the batch bullet's parenthetical.

> - **batch** (`kind = 2`): `"NOTARYHASH" | u8(1) | u8(2) | merkleRoot(32) | u32be(leafCount)`.
>   One transaction anchors many proofs under an RFC 6962 Merkle root.
>
>   The leaf datum `d` for a proof is its **`proofHash`** — the 32 bytes defined in
>   §Canonical proof bytes — so a leaf is `SHA-256(0x00 ‖ proofHash)` and an internal node
>   is `SHA-256(0x01 ‖ l ‖ r)`. Leaves are ordered as the batch was assembled, and
>   `leafIndex` in the certificate's `merkle` object is that position. The tree splits at
>   the largest power of two `< n` and the last leaf is never duplicated, per RFC 6962
>   §2.1.
>
>   Note that `d` is the **hash**, not the canonical bytes: a leaf is therefore
>   `SHA-256(0x00 ‖ SHA-256(canonicalBytes))`. The two readings are equally sound
>   cryptographically but produce different roots, so this is stated explicitly rather
>   than left to RFC 6962's generic `d`.

---

## Why `proofHash` rather than the canonical bytes

Both are sound. The choice is on other grounds.

**A verifier already holds it.** `proofHash` is a required certificate field. A verifier
checking batch inclusion reads it directly and folds. Under the other reading it must
first reconstruct `canonicalBytes` — re-serialising `publicKey`, `signature`,
`createdAtUnix` and the rest with the exact length-prefix framing — before it can begin.
That is the whole `proofHash` computation, performed again, as a precondition for a check
that is supposed to be independent of it. The spec advertises a "dependency-light
standalone verifier"; this keeps the batch path genuinely light.

**It is what a batch anchors.** §On-chain record says a batch transaction "anchors many
proofs". `proofHash` *is* the proof's identity — it is the integrity root, the value the
full and hybrid records place on-chain, and the value §Verification checks a certificate
against. Batching identifiers rather than re-serialised bodies keeps batch mode
consistent with the other two modes rather than introducing a second notion of what
represents a proof.

**It matches the mode it exists alongside.** Hybrid mode already establishes that BRC-220
puts hashes on-chain where blobs would be large. Fixed 32-byte leaves keep batch memory
and proof sizes independent of signature scheme — which matters precisely for the
post-quantum algorithms §Motivation names, where `canonicalBytes` runs to kilobytes per
proof.

**The extra hash costs nothing.** One SHA-256 over 32 bytes per leaf, against a
re-serialisation per leaf under the alternative.

---

## Compatibility

`@smartledger/bsv` implements the `proofHash` reading as of 8.3.0, and from this change
states it in `lib/notaryhash/index.js` and enforces it in
`test/notaryhash/batch_leaf.js` — including a test that a tree built over `canonicalBytes`
is rejected, so the choice is checked rather than merely intended.

No deployed batch certificates are known to use the other reading. If any exist, they were
built against an ambiguous sentence and would need reissuing; batch mode is the least-used
of the three and this is the moment to fix it, before that stops being true.

---

## Recommended alongside

Publish a **batch-mode golden vector** with the other test vectors: a small tree — four
proofs, say — with the four `proofHash` values, the resulting root, and the inclusion path
for one leaf. One such vector removes this entire class of ambiguity for every future
implementer, in a way that no amount of prose reliably does. Its absence is why this
document is necessary.
