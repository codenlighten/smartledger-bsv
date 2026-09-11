# Proposed BRC-220 amendment: define the certificate's field values

§Certificate names the twelve fields a certificate must carry and says it is JSON. It
defines none of their values. This proposes the values the BRC-220 reference
implementation writes, so that any implementation can produce a certificate the reference
verifies.

Prepared 2026-09-11. **Status: draft, not filed.** It is meant to be a separate pull
request from [bsv-blockchain/BRCs#246](https://github.com/bsv-blockchain/BRCs/pull/246),
which is under review and deliberately narrow; this text builds on it for the batch leaf
datum.

---

## Why it matters

Two implementations of BRC-220 filled the gap differently. `@smartledger/bsv` 8.3.0–9.8.0
and the reference implementation computed identical `proofHash` values, signature digests,
Merkle trees and on-chain records, and **could not verify a single one of each other's
certificates**:

| field | `@smartledger/bsv` 8.3.0–9.8.0 | reference implementation |
| --- | --- | --- |
| `version` | `1` | `"1.0"` |
| `mode` | `0` / `1` / `2` | `"full"` / `"hybrid"` |
| a batch | `mode: 2` | `anchor.type: "batch"` |
| `encoding` | `"raw"` / `"der"` — the signature's byte form | `"hex"` / `"base64"` — how two fields are written |
| `anchor` | `{ txid, blockHeight }` | `{ type, network, txid, vout, blockHeight, blockTime }` |
| `merkle.path` | bare hashes | `{ hash, side }` |

Every reading on the left is defensible from the current text. None of it is defined there.
The cryptography is fully specified and the object carrying it is not, so two conformant
implementations fail each other silently, on the field names a verifier reads first.

## Where the values come from

Every value below is what the reference implementation writes, read from its source at
commit `b926e3b`: the certificate assembly, the batcher, the confirmation poller that adds
the SPV envelope, and its request schema. They agree with the reference's own protocol
document, whose §5 carries the same example shapes. Where the reference's *verifier* is more
lenient than its *writer*, the proposed text describes the writer, and the difference is
listed under [Open points](#open-points-for-the-author) rather than decided here.

The two examples are certificates the reference's own code produced, reproduced in
`test/data/notaryhash-reference-certs.json`, where each was accepted by the reference's
schema and verifier. `test/notaryhash/fields_amendment.js` reads them out of this document
and checks them against that fixture, so the examples cannot drift from what the reference
actually wrote.

---

## What the spec currently says

§Certificate, in full:

> A self-contained JSON object, canonicalised via RFC 8785 (JCS) for hashing and transport.
> Required fields: `protocol`, `version`, `mode`, `algorithm`, `hashAlgorithm`,
> `payloadHash`, `publicKey`, `signature`, `encoding`, `proofHash`, `createdAt`, `anchor`.
> A batched certificate additionally carries a `merkle` inclusion proof
> `{root, leafIndex, leafCount, path[]}` whose folding (leaf → root) must equal the
> on-chain batch root.

That leaves undefined:

- `version`: a string or a number, and which one. The canonical bytes carry `u8(version=1)`
  and the domain separator `"NotaryHash/1.0"`, which invite both.
- `mode`: the on-chain byte (`0`/`1`/`2`) or a name. The on-chain record also has a `kind = 2`
  for batches, which invites treating batch as a third mode.
- `encoding`: whether it names the bytes' format (raw, DER) or their spelling in JSON.
- how `payloadHash`, `proofHash`, `publicKey` and `signature` are written.
- the format of `createdAt`, and how it relates to `createdAtUnix` in the canonical bytes.
- every member of `anchor`. The spec never lists them.
- the elements of `merkle.path`. With bare hashes a verifier needs `leafIndex` and
  `leafCount` to fold; with sides it does not.
- the byte order of `txid`, `spv.blockHash` and `spv.merkleProof.nodes`.

---

## Proposed text

### 1. §Certificate — replace the paragraph

> ### Certificate
>
> A self-contained JSON object, canonicalised via [RFC 8785 (JCS)](https://www.rfc-editor.org/rfc/rfc8785)
> for hashing and transport. Hex is **lowercase, without a `0x` prefix**; numbers are JSON
> integers. Verifiers ignore members they do not recognise, which is how the SPV envelope
> is added to a certificate already issued.
>
> | field | value |
> | --- | --- |
> | `protocol` | the string `"NotaryHash"` |
> | `version` | the string `"1.0"`: the certificate format version. It corresponds to `u8(version=1)` in the canonical proof bytes and the on-chain record, and to the domain separator `"NotaryHash/1.0"`, but is written as a string. |
> | `mode` | `"full"` or `"hybrid"`: how the proof is recorded on chain, corresponding to the on-chain `mode` byte `0` or `1`. Batching is marked by `anchor.type`, not by `mode`. |
> | `algorithm` | an identifier from §Algorithms, e.g. `"ECDSA-secp256k1"` |
> | `hashAlgorithm` | `"SHA-256"` |
> | `payloadHash` | the 32-byte payload hash, hex |
> | `publicKey` | the **full** public key in every mode (hybrid puts only its SHA-256 on chain), written per `encoding` |
> | `signature` | the **full** signature, as the signer produced it, in every mode, written per `encoding` |
> | `encoding` | how `publicKey` and `signature` are written: `"hex"`, or `"base64"` (RFC 4648 §4: standard alphabet, padded). It applies to those two fields only, and says nothing about the format of the bytes themselves. |
> | `proofHash` | the 32-byte `SHA-256(canonicalBytes)`, hex |
> | `createdAt` | `createdAtUnix` as an ISO 8601 UTC timestamp with milliseconds, e.g. `"2026-01-01T00:00:00.000Z"`. The milliseconds are always `000`, because only whole seconds enter the canonical bytes; a verifier recovers `createdAtUnix` as the whole seconds the timestamp denotes. Advisory only — see §Verification. |
> | `anchor` | the object below |
>
> `anchor` locates the on-chain record:
>
> | member | value |
> | --- | --- |
> | `type` | `"direct"` if the record carries this proof (`mode` `0` or `1`); `"batch"` if it carries a Merkle root (`kind = 2`) |
> | `network` | the chain the record is on: `"bsv-mainnet"` for BSV mainnet |
> | `txid` | the anchoring transaction's id, hex, in display order: `reverse(SHA256(SHA256(rawTx)))` |
> | `vout` | the index of the `OP_RETURN` output within that transaction |
> | `blockHeight` | the height of the block that mined the transaction, or `null` until it is mined |
> | `blockTime` | that block's timestamp in Unix seconds, or `null` until it is mined |
>
> A batched certificate (`anchor.type` `"batch"`) additionally carries `merkle`, the
> proof that this proof is one of the batch's leaves:
>
> | member | value |
> | --- | --- |
> | `root` | the 32-byte batch root, hex; equal to `merkleRoot` in the on-chain batch record |
> | `leafIndex` | this proof's position in the batch, from `0` |
> | `leafCount` | the number of proofs in the batch; equal to `leafCount` in the on-chain batch record |
> | `path` | the audit path, leaf → root, as an array of `{ "hash": <32-byte hex>, "side": "left" or "right" }`. `side` is the sibling's position relative to the running hash. Starting from `SHA256(0x00 ‖ proofHash)`, a `"left"` sibling folds as `SHA256(0x01 ‖ hash ‖ running)` and a `"right"` one as `SHA256(0x01 ‖ running ‖ hash)`. The result must equal `root`. |
>
> In a batched certificate `mode` is not checked against the chain: the batch record
> carries neither the proof nor a mode byte.
>
> A direct-anchored ECDSA certificate, before its SPV envelope is attached:
>
> <!-- fixture: certificates.fullHex -->
> ```json
> {
>   "protocol": "NotaryHash",
>   "version": "1.0",
>   "mode": "full",
>   "algorithm": "ECDSA-secp256k1",
>   "hashAlgorithm": "SHA-256",
>   "payloadHash": "97ef50e782e55cfbfbfb0c6199b96837836b7f7b0fcae76f79a65e2466dc596b",
>   "publicKey": "02375ac16df62a74475844721d6a180927f29314c3455eaa699f7dcf5237c36e52",
>   "signature": "e65171edb82a702a8390fb90f005ba3d4e174ab945ab0bcaf5f1f8d18c3547426ca419ea252b142e863d2eeebdfc787a624bed5a06d23a671959b07b5cb12ba3",
>   "encoding": "hex",
>   "proofHash": "1b34fbeb640e63b366751a279aa749e4f279cfb7e1add1a96150d7fd7c2ff05d",
>   "createdAt": "2026-01-01T00:00:00.000Z",
>   "anchor": {
>     "type": "direct",
>     "network": "bsv-mainnet",
>     "txid": "460d19b875036e41d6dea392bfcb84508120e7b573080c45869eedbae39dec6a",
>     "vout": 0,
>     "blockHeight": 900000,
>     "blockTime": 1767225600
>   }
> }
> ```
>
> The `merkle` member of leaf 4 of the five-proof batch in §On-chain record:
>
> <!-- fixture: batch.certificates[4].merkle -->
> ```json
> {
>   "root": "abb53eb3b2e3530d51685c6813bb85c85892d2f214c2dc504029d071434ac074",
>   "leafIndex": 4,
>   "leafCount": 5,
>   "path": [
>     { "hash": "060ca4e4bbcb647ab0162bb027cd8f08c1577aaa7069166dd629a3df7e57befd", "side": "left" }
>   ]
> }
> ```
>
> The anchoring transactions and blocks in these examples are test fixtures, not mainnet
> data. Everything else in them verifies: the signature, `proofHash`, the on-chain record
> in the transaction, and the batch inclusion.

### 2. §SPV envelope — add after the JSON block

> `rawTx` is hex. `blockHash` and the entries of `merkleProof.nodes` are hex in display
> order, like `txid`; a `nodes` entry of `"*"` means "duplicate the working hash", the TSC
> convention for a missing right sibling. The verifier checks that the header it obtained
> has hash `spv.blockHash` and height `spv.blockHeight`.

### 3. §Algorithms — add after the table

> For `ECDSA-secp256k1`, `publicKey` is 33 bytes (compressed) or 65 (uncompressed), and
> `signature` is 64 bytes (`r ‖ s`, each a 32-byte big-endian integer) or DER. A verifier
> tells them apart by the bytes: DER begins with `0x30` and is not 64 bytes long. `S` is not
> normalised. The certificate commits, through `proofHash`, to the exact bytes the signer
> produced, so the malleated form of a signature is a different certificate rather than a
> forgery of this one.

---

## What this does not change

The canonical proof bytes, `proofHash`, the on-chain record and the verification steps are
untouched. **Every certificate the reference implementation has issued already conforms.**
The text makes explicit what it writes, so that other implementations can write the same.

---

## Open points for the author

These are places where the reference's verifier is more lenient than its writer, or where
the text needs a decision the reference does not make. None of them is in the proposed text.
Each lists what the reference does and what `@smartledger/bsv` 9.9.0 does.

1. **Whether a verifier checks `version`.** The reference writes `"1.0"`, but neither its
   request schema nor either of its verifiers checks the value. A certificate carrying
   `"version": "2.0"` is verified as v1. `@smartledger/bsv` rejects anything but `"1.0"`. The
   proposal: verifiers MUST reject a `version` they do not implement, so that a future
   format cannot be silently misread as this one.
2. **How strictly base64 is read.** The reference decodes with Node's `Buffer.from(value,
   'base64')`, which accepts the URL-safe alphabet and missing padding, and silently skips
   any other character. A corrupted field then decodes to different bytes rather than
   failing. `@smartledger/bsv` accepts the URL-safe alphabet and missing padding, and rejects
   everything else. The proposal: writers MUST use the padded standard alphabet, and readers
   MUST reject characters outside it.
3. **Uppercase hex and a `0x` prefix on read.** The reference accepts both; writers never
   emit either. The proposal: readers MAY accept them.
4. **`network` identifiers.** The reference writes `"bsv-mainnet"`, plus `"mock"` for its
   non-broadcasting test adapter, and accepts any string on read. No identifier exists for
   testnet. Decide whether to name one, e.g. `"bsv-testnet"`, and whether the set is
   closed — and if it is, whether a verifier rejects an identifier it does not know.
5. **Certificates already issued in other shapes.** `@smartledger/bsv` 8.3.0–9.8.0 wrote the
   format in the table above. It still reads those, and verifies them as legacy. Whether the
   spec should acknowledge them is the author's call. As proposed, the text says nothing
   about them, and they do not conform.
6. **High-S ECDSA.** The §Algorithms insertion states the reference's behaviour. Requiring
   low-S instead would reject certificates the reference has already issued.

---

## Checking the claims

```
npx mocha test/notaryhash/fields_amendment.js test/notaryhash/reference_certs.js
```

The first reads the examples out of this document and checks them against the reference's
own certificates. The second verifies all ten reference certificates and rebuilds each one
byte for byte from its proof fields, using the values defined here.
