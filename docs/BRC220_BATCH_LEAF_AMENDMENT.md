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

## The golden vector, ready to publish

Prose does not reliably close this: two implementers read the same sentence and chose
differently. A vector does. This one is generated by
`tools/gen-brc220-batch-vector.js`, lives at `test/data/brc220-batch-vector.json`, and is
checked by `test/notaryhash/batch_vector.js`.

**Five leaves, not four.** RFC 6962 splits at the largest power of two *below* `n`, so
`n = 5` splits 4/1 — a midpoint split would give 2/3 and a different root — and an odd
count exercises the rule that the last leaf is never duplicated. Those are the two places
implementations of this tree go wrong, and a power-of-two vector catches neither. It shows
up in the audit-path lengths: `[3, 3, 3, 3, 1]`.

Every input is derived from a labelled preimage rather than chosen, so the file
regenerates byte-identically and any implementation can rebuild it from scratch:

- private key `i` = `SHA-256("BRC-220/batch-vector/key/" + i)`
- `payloadHash` `i` = `SHA-256("BRC-220/batch-vector/payload/" + i)`
- `createdAt` `i` = `2026-01-0(i+1)T00:00:00.000Z`
- `algorithm` = `ECDSA-secp256k1`, `hashAlgorithm` = `SHA-256`, `encoding` = `"raw"`

**Signing.** The signer signs the 32-byte `payloadHash` directly — the digest *is* the
scalar, big-endian. RFC 6979 makes the nonce deterministic, so the signatures, and every
hash derived from them, reproduce exactly.

This matters more than it looks. The signature is inside `canonicalBytes`, which is inside
`proofHash`, which is the leaf — so the signing convention determines the root. An earlier
draft of this vector was generated against the byte-reversed convention that
`@smartledger/bsv` 8.3.0 used when verifying, and produced five signatures that no
conformant implementation could check (0/5 under `@noble/curves`), together with a root
nobody else would compute. It was never published. The values below were generated at
**8.3.1**, and `test/notaryhash/batch_vector.js` now verifies every signature under
`@noble/curves` as well as under this library, because a generator and a checker that
share a signer agree with each other whether or not they are right.

The five `proofHash` values that result:

| leafIndex | proofHash |
| ---: | --- |
| 0 | `83f3f73ebc5146b96cce1ee0b6ed4fd251a933a5332fbe5e5ab80da7920fe2c9` |
| 1 | `29fca10808a3653efbe38abd5f0b926aa09f13bff7847475139a422869729e77` |
| 2 | `3c44828bea3ca01dfcd5305a839ce02cc1e855f5a7c7028bb4931d42dea3aa2b` |
| 3 | `0692e22da9b68634e5384bb012324c140c676d2301e078a67f17e335661a9565` |
| 4 | `1a9c6bc1a6cf8319344ca8c30ca9e9eef8ab3df732748f6be2c824bb84ec0ca9` |

**Merkle root (`d = proofHash`, this amendment):**

```
abb53eb3b2e3530d51685c6813bb85c85892d2f214c2dc504029d071434ac074
```

The on-chain record tail is therefore `merkleRoot` above followed by
`u32be(5) = 00000005`. The audit path for leaf 4 — the lone right-hand leaf, and the
cheapest single value to check a split rule against — is one node:

```
060ca4e4bbcb647ab0162bb027cd8f08c1577aaa7069166dd629a3df7e57befd
```

**Merkle root under the rejected reading (`d = canonicalBytes`):**

```
4a59ade74941e4d6ca4b7c9f610e0a01a0c3f24cfa94efe816e53ef85f99e324
```

That second root is published deliberately. An implementation computing it has made the
other reading of `d` — which is a sound choice against an ambiguous sentence, not a bug in
their code — and printing both turns a silent non-interoperability into a one-line
diagnosis.

The stored vector records `canonicalBytes`, `proofHash` and the leaf hash under *both*
readings for every proof, so an implementer can find which step diverges rather than only
that the roots differ.

### What this vector is not

It is a conformance target produced by `@smartledger/bsv`, not external validation, and it
does not prove this reading is the one originally intended — the spec does not say. What
makes it load-bearing is that the tree beneath it is independently anchored: the RFC 6962
construction is verified against the published Certificate Transparency roots in
`test/notaryhash/merkle.js`. Given a tree that provably matches RFC 6962, the vector fixes
the single thing left open.
