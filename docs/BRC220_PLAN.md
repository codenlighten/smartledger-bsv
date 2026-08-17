# BRC-220 (NotaryHash) — implementation plan

Plan for implementing [BRC-220](https://github.com/bitcoin-sv/BRCs/blob/master/apps/0220.md),
*NotaryHash: Privacy-Preserving Signed-Hash Notarization with SPV-Verifiable Certificates*,
in `@smartledger/bsv`.

Drafted against the spec on 2026-08-16, at v8.2.0. Nothing here is implemented yet.

## 1. Why this library

BRC-220 is a notarization protocol, not a signature scheme. It needs a signer, an
`OP_FALSE OP_RETURN` output, a canonical JSON certificate, an SPV proof, and a Merkle
tree. Four of those five already exist here:

| BRC-220 needs | Already present |
| --- | --- |
| RFC 8785 canonical certificate | `AttestationSigner._canonicalizeJCS` (8.2.0) |
| SPV inclusion proof, TSC format | `lib/spv/merkleproof.js`, `lib/spv/headerchain.js` |
| Independent block headers, never the provider's word | `verifyHeaderChain`, already the documented stance |
| `OP_FALSE OP_RETURN` safe data output | `lib/transaction`, `lib/custom-script-helper.js` |
| Length-prefixed binary | `lib/encoding/bufferwriter.js` |
| ECDSA-secp256k1 signing | `lib/crypto/ecdsa.js` |

The JCS work landed in 8.2.0 for an unrelated reason — GDAF signatures had to be
verifiable by other implementations — and BRC-220 requires exactly that encoding for its
certificates. That is the single strongest argument that this belongs here rather than in
a separate package.

## 2. Post-quantum stays OUT of the dependency tree

The spec names ML-DSA (3 parameter sets) and SLH-DSA (12), but `ECDSA-secp256k1` is a
first-class algorithm alongside them. A conformant implementation can support ECDSA only.

`@noble/post-quantum` should NOT become a dependency of this library:

- **It is the one unaudited Noble package.** Its README states plainly: *"The library has
  not been independently audited yet"* — a self-audit at 0.6.1 only. `@noble/curves`,
  `@noble/hashes` and `@noble/ciphers` carry a published Cure53 audit, which is why
  `docs/AUDIT_SCOPE.md` can tell a vendor not to price the primitive layer. Adding an
  unaudited implementation trades that away and has to be disclosed.
- It is **0.x**, so the API is not stable.
- It does **not claim constant-time execution**, which its README calls out as mattering
  most when an attacker can measure signing.
- 669 KB unpacked, against bundles this project cut 20% in 8.0.0.

**Instead: a suite registry.** `algorithm` is a string in both the certificate and the
on-chain record, so it maps naturally onto a lookup:

```js
NotaryHash.registerSuite('ML-DSA-65', {
  verify: function (payloadHash, signature, publicKey) { /* … */ },
  sign: function (payloadHash, privateKey) { /* … */ }
})
```

`ECDSA-secp256k1` is registered by default and needs nothing new. Everything else is
supplied by the caller — most obviously from **`@smartledger/keys`**, which already wraps
`@noble/post-quantum` for ML-DSA-44/65/87. That keeps one PQ dependency in the ecosystem
rather than two, and callers who do not need it pay nothing in bundle size or audit
surface.

Note `@smartledger/keys@2.0.0` is currently 8 months stale and behind on all three of its
crypto dependencies, including a full major on `@noble/hashes` (1.8.0 against 2.3.0).
Refreshing it is a prerequisite for recommending it as the PQ path, and is separate work.

## 3. The trap: three different Merkle trees

BRC-220 batch mode uses **RFC 6962** trees. This library already contains two Merkle
implementations, and **neither is RFC 6962**:

| Tree | Leaf | Internal | Odd node |
| --- | --- | --- | --- |
| Bitcoin (`lib/spv/merkleproof.js`) | txid | `sha256d(L‖R)` | rightmost **duplicated** |
| `lib/gdaf/zk-prover.js` | salted field hash | `sha256(L‖R)` | duplicated |
| **RFC 6962 (BRC-220 needs)** | `sha256(0x00‖d)` | `sha256(0x01‖L‖R)` | **never duplicated** |

Domain separation and the no-duplication rule are what make RFC 6962 resistant to the
second-preimage attack Bitcoin's tree is famously vulnerable to. Reusing either existing
implementation would be silently wrong: it would produce a root that no other BRC-220
implementation computes, and the failure would only appear when someone else verified a
batch certificate.

RFC 6962 splits at the **largest power of two less than the leaf count**, not the middle.
That must be tested against published RFC 6962 vectors, not against our own output.

## 4. Module layout

```
lib/notaryhash/
  index.js        NotaryHash.create / verify / registerSuite
  encoding.js     lp(), canonical bytes, proofHash
  script.js       OP_FALSE OP_RETURN builder + parser, all three modes
  certificate.js  build, JCS-canonicalize, validate shape
  merkle.js       RFC 6962 — NOT the Bitcoin or zk-prover trees
  suites.js       registry; ECDSA-secp256k1 registered by default
```

Exposed as `bsv.NotaryHash`, with a `notaryhash-entry.js` and its own bundle, matching how
`gdaf`, `ltp` and `didweb` are already packaged.

## 5. What gets built, in order

**Phase 1 — encoding and proofHash.** `lp(x) = u32be(len(x)) || x`, and the canonical byte
string:

```
lp("NotaryHash/1.0") || u8(version) || lp(algorithm) || lp(hashAlgorithm) ||
lp(payloadHash) || lp(publicKey) || lp(signature) || u64be(createdAtUnix)
```

The protocol prefix, version and timestamp are in `proofHash` but never on chain — so the
on-chain record alone cannot reconstruct it, and a verifier needs the certificate. Worth a
test that states this, because it looks like an omission otherwise.

**Phase 2 — the OP_RETURN record**, all three modes, builder and parser, round-tripping.
Full mode carries the key and signature; hybrid carries `sha256` of each, which is what
makes PQ signatures affordable on chain; batch carries only a 32-byte root and a `u32be`
leaf count.

**Phase 3 — certificate**, built on the existing `_canonicalizeJCS`. The SPV envelope is
additive and must not change `proofHash` — a test should add an envelope to a finished
certificate and assert the hash is unchanged.

**Phase 4 — verification**, the three checks the spec requires, each returning a strict
boolean and failing closed:

1. signature verifies over `payloadHash` under the registered suite — offline;
2. `proofHash` recomputes from canonical bytes and matches — offline;
3. anchor confirmed, SPV preferred: `txid = reverse(sha256d(rawTx))`, the `OP_RETURN`
   fields match the certificate, and the TSC Merkle proof folds to a root matching a
   block header **obtained independently**.

**Phase 5 — batch mode** and RFC 6962, last because it is the piece most likely to be got
wrong and benefits from everything else being settled.

## 6. Testing stance

Given what the last two reviews found in `zk-prover.js` — a range proof that verified
nothing and a selective-disclosure scheme that leaked every withheld field, under 4,469
passing tests — this module starts with adversarial tests rather than acquiring them
later:

- Every `verify` returns a **strict boolean** or throws. Never a truthy result object.
  This is the defect class that has recurred most in this codebase.
- Each of the three validity checks has a test that **defeats it in isolation**: a valid
  signature with a tampered `proofHash`; a correct `proofHash` with a forged signature; a
  well-formed certificate anchored to a transaction that is not in the block it claims.
- An unregistered `algorithm` must **fail**, not fall through to a default suite.
- RFC 6962 vectors from the RFC, not from our own implementation, and a test that a
  Bitcoin-style tree over the same leaves produces a *different* root — that failure is
  the one that would otherwise ship silently.
- Round-trip the on-chain record for all three modes, and assert hybrid's pushes are
  32 bytes where full's are variable.

## 7. Questions, settled against the full text

The spec is 8,514 bytes. These were resolved by reading all of it rather than querying it
piecemeal — which is also how the first of them turned out to be an artifact of my own
summarising rather than anything in the document.

- **Push 0 is `"NOTARYHASH"`, 10 ASCII bytes** (`4e4f5441525948415348`). The spec states no
  byte count for it anywhere; the "9 bytes" this section previously flagged came from a
  summarisation step, not the normative text. Verified by fetching the raw file and
  grepping it directly.
- **`hashAlgorithm` is SHA-256** for every algorithm the spec lists — the Algorithms table
  gives one hash for all three families. It is not stated to be closed, so the field stays
  a string rather than an enum, but SHA-256 is the only conformant value in v1.
- **The signer signs the 32-byte `payloadHash` directly** (§Algorithms): "post-quantum
  schemes apply their own internal hashing". So ECDSA signs the digest as-is, with no
  second hash. Getting this wrong produces signatures nothing else verifies.
- **Batch certificates carry BOTH `anchor` and `merkle`** — the spec says a batched
  certificate "additionally carries" the inclusion proof.
- **The service is a role, not a requirement.** §What a certificate proves: "any party
  holding a valid (hash, signature, publicKey) triple may re-anchor it; the attestation
  remains valid". A self-notarizing caller producing its own certificate is conformant.
- **The batch Merkle leaf is NOT settled by the spec — it is a choice this
  implementation made.** §On-chain record writes `leaf = SHA256(0x00 ‖ d)`, but that is
  RFC 6962's own generic notation for the construction and `d` is never bound to a value.
  `canonicalBytes` appears once in the whole document, in the `proofHash` definition, and
  nowhere in the batch text. We read `d` as `proofHash`; reading it as `canonicalBytes` is
  equally sound and produces a different root, so the two do not interoperate. Recorded as
  an ambiguity rather than a settled question, with proposed spec text in
  [BRC220_BATCH_LEAF_AMENDMENT.md](BRC220_BATCH_LEAF_AMENDMENT.md) and enforcement in
  `test/notaryhash/batch_leaf.js`. This is the second gap of the kind, after `encoding`.
- **`createdAt` is advisory for trust but load-bearing for the hash.** §Verification calls
  it "an advisory client field only" — meaning proof-of-existence time comes from the
  block, not from this field. It is still inside the canonical bytes as `createdAtUnix`,
  so it cannot be altered after issuance.

Decided, and proposed back to the spec:

- **`encoding` is `"raw"`.** The field is required by the spec but its values were never
  enumerated, so this library defines them and proposes the definition upstream — see
  `docs/BRC220_ENCODING_AMENDMENT.md`.

  For `ECDSA-secp256k1` that is 64 bytes, `r ‖ s`, each a 32-byte big-endian integer, with
  a 33-byte compressed public key. NOT DER, and not the 65-byte `toCompact` form, which
  carries a recovery byte the certificate does not need because it already has the key.

  The deciding argument is that `proofHash` covers `lp(signature)`, and **DER is not
  canonical**. Measured over 200 signatures from one key: DER came out at 69, 70 and 71
  bytes depending on leading-zero handling, all of it legal. Raw was 64 bytes every time.
  The same signing act producing different `proofHash` values is precisely the failure the
  binary encoding exists to prevent — it is why the spec already refuses `JSON.stringify`.

  Two supporting reasons: ML-DSA and SLH-DSA have no DER form, so raw makes `encoding`
  uniform across all sixteen algorithm identifiers instead of forcing per-algorithm
  branching in every verifier; and the signature is detached over a digest rather than a
  Bitcoin script signature, which is the ES256K/WebCrypto case, and both use `r ‖ s`.

  **Low-S is required and must be rejected, not normalised.** `s` and `n − s` both verify
  and hash differently, so without the rule two valid certificates exist for one signing
  act. Normalising on receipt would change the signature bytes, which are inside
  `proofHash`. This library already emits low-S and has `Signature.toCanonical()`.

### The reference implementation

§Implementations describes a reference service, client SDK and standalone verifier, with
**published test vectors**: a complete certificate-with-SPV-envelope golden vector,
`txidFromRawTx` against the Bitcoin genesis coinbase, and the Merkle fold against the real
block-170 two-transaction proof.

Those vectors are worth more than anything in §6, and should be wired in as gates before
Phase 2 goes far. This module's characteristic failure is being self-consistent and wrong
— every local test green, no other implementation agreeing — and a golden vector from a
second implementation is the only thing that actually rules it out. Our own tests cannot.

## 8. Not in scope

- Post-quantum suites themselves — supplied by the caller, see §2.
- The notary *service*. This library builds and verifies records and certificates; it does
  not run the submission endpoint the spec describes.
- Broadcasting. Existing transaction plumbing covers it.
