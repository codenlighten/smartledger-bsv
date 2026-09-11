# Proposed BRC-220 amendment: define the certificate's field values

§Certificate names the twelve fields a certificate must carry and says it is JSON. It
defines none of their values. This proposes the values the BRC-220 reference
implementation writes, and two rules for reading them. With both, any implementation
produces certificates the reference verifies, and reads certificates the way the reference
does.

Prepared 2026-09-11. **Status: ready to file**, with the open points decided
[below](#decisions). It is meant to be a separate pull request from
[bsv-blockchain/BRCs#246](https://github.com/bsv-blockchain/BRCs/pull/246), which is under
review and deliberately narrow; this text builds on it for the batch leaf datum.

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
document, whose §5 carries the same example shapes.

The two reader rules go further than the reference's verifier did at `b926e3b`. It accepted
a certificate of any `version`, and decoded base64 by skipping whatever it did not
recognise. The reference implementation adopts both rules, and `@smartledger/bsv` applies
both, so the spec does not state a rule its own reference breaks.

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
- what a verifier does with a `version` it does not know, or a field that does not decode.

---

## Proposed text

Generated from the text as committed for filing, so the two cannot differ. The ECDSA
byte forms sit in §Certificate, under the fields they describe, rather than in
§Algorithms, which #246 edits; a trial merge of #246 on top of this change is clean.

### 1. §Certificate — replace the paragraph

> ### Certificate
>
> A self-contained JSON object, canonicalised via [RFC 8785 (JCS)](https://www.rfc-editor.org/rfc/rfc8785) for hashing and transport, carrying the twelve required fields below. Hex is written **lowercase, without a `0x` prefix**; a reader MAY accept upper case and the prefix. Numbers are JSON integers. Verifiers ignore members they do not recognise, which is how the SPV envelope is added to a certificate already issued.
>
> | field | value |
> |-------|-------|
> | `protocol` | the string `"NotaryHash"` |
> | `version` | the string `"1.0"`: the certificate format version. It corresponds to `u8(version=1)` in the canonical proof bytes and the on-chain record, and to the domain separator `"NotaryHash/1.0"`, but is written as a string. A verifier MUST reject a certificate whose `version` it does not implement. |
> | `mode` | `"full"` or `"hybrid"`: how the proof is recorded on chain, corresponding to the on-chain `mode` byte `0` or `1`. Batching is marked by `anchor.type`, not by `mode`. |
> | `algorithm` | an identifier from §Algorithms, e.g. `"ECDSA-secp256k1"` |
> | `hashAlgorithm` | `"SHA-256"` |
> | `payloadHash` | the 32-byte payload hash, hex |
> | `publicKey` | the **full** public key in every mode (hybrid puts only its SHA-256 on chain), written per `encoding` |
> | `signature` | the **full** signature, as the signer produced it, in every mode, written per `encoding` |
> | `encoding` | how `publicKey` and `signature` are written: `"hex"`, or `"base64"` (RFC 4648 §4: standard alphabet, padded). It applies to those two fields only, and says nothing about the format of the bytes themselves. A reader MUST reject a value that is not valid in its encoding rather than decode what remains of it — for base64, a character outside the RFC 4648 §4 and §5 alphabets, padding anywhere but the end, or a length no byte string encodes. A reader MAY accept the §5 (URL-safe) alphabet and missing padding. |
> | `proofHash` | the 32-byte `SHA-256(canonicalBytes)`, hex |
> | `createdAt` | `createdAtUnix` as an ISO 8601 UTC timestamp with milliseconds, e.g. `"2026-01-01T00:00:00.000Z"`. The milliseconds are always `000`, because only whole seconds enter the canonical bytes; a verifier recovers `createdAtUnix` as the whole seconds the timestamp denotes. Advisory only — see §Verification. |
> | `anchor` | the object below |
>
> For `ECDSA-secp256k1`, `publicKey` is 33 bytes (compressed) or 65 (uncompressed), and `signature` is 64 bytes (`r ‖ s`, each a 32-byte big-endian integer) or DER. A verifier tells them apart by the bytes: DER begins with `0x30` and is not 64 bytes long. `S` is not normalised: the certificate commits, through `proofHash`, to the exact bytes the signer produced, so the malleated form of a signature is a different certificate rather than a forgery of this one.
>
> `anchor` locates the on-chain record:
>
> | member | value |
> |--------|-------|
> | `type` | `"direct"` if the record carries this proof (`mode` `0` or `1`); `"batch"` if it carries a Merkle root (`kind = 2`) |
> | `network` | the chain the anchoring transaction is on: `"bsv-mainnet"` for BSV mainnet, `"bsv-testnet"` for BSV testnet. Other values are not interoperable. The field is descriptive: which chain the anchor is on is established by the block header the verifier obtains, not by this value. |
> | `txid` | the anchoring transaction's id, hex, in display order: `reverse(SHA256(SHA256(rawTx)))` |
> | `vout` | the index of the `OP_RETURN` output within that transaction |
> | `blockHeight` | the height of the block that mined the transaction, or `null` until it is mined |
> | `blockTime` | that block's timestamp in Unix seconds, or `null` until it is mined |
>
> A batched certificate (`anchor.type` `"batch"`) additionally carries `merkle`, the proof that this proof is one of the batch's leaves:
>
> | member | value |
> |--------|-------|
> | `root` | the 32-byte batch root, hex; equal to `merkleRoot` in the on-chain batch record |
> | `leafIndex` | this proof's position in the batch, from `0` |
> | `leafCount` | the number of proofs in the batch; equal to `leafCount` in the on-chain batch record |
> | `path` | the audit path, leaf → root, as an array of `{ "hash": <32-byte hex>, "side": "left" or "right" }`. `side` is the sibling's position relative to the running hash. Starting from `SHA256(0x00 ‖ proofHash)`, a `"left"` sibling folds as `SHA256(0x01 ‖ hash ‖ running)` and a `"right"` one as `SHA256(0x01 ‖ running ‖ hash)`. The result must equal `root`. |
>
> In a batched certificate `mode` is not checked against the chain: the batch record carries neither the proof nor a mode byte.
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
> The `merkle` member of the last certificate in a five-proof batch:
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
> The anchoring transactions and blocks in these examples are test fixtures, not mainnet data. Everything else in them verifies: the signature, `proofHash`, the on-chain record in the transaction, and the batch inclusion.

### 2. §SPV envelope — add at the end of the section

> `rawTx` is hex, and `blockHash` is hex in display order, like `txid`. In the `"TSC"` format the entries of `merkleProof.nodes` are hex in display order too, and an entry of `"*"` means "duplicate the working hash", the TSC convention for a missing right sibling. The verifier checks that the header it obtained has hash `spv.blockHash` and height `spv.blockHeight`.

---

## What this changes

**For writers, nothing.** Every certificate the reference implementation has issued already
conforms. The text makes explicit what it writes, so that other implementations can write
the same.

**For readers, two rules tighten.** A verifier that accepted a certificate of another
version, or decoded base64 by skipping what it did not recognise, refuses instead. Neither
rule refuses anything a conformant writer produces.

The canonical proof bytes, `proofHash`, the on-chain record and the verification steps are
untouched.

---

## Decisions

The first draft left six points to the author. Each is decided here, with the reason.

1. **A verifier refuses a `version` it does not implement.** This is in the proposed text.
   The reference wrote `"1.0"` and read anything: a certificate saying `"2.0"` passed its
   schema, its offline verifier, its SPV check and its anchor match. Reading a future
   format with v1 rules gives a verdict about the wrong thing, and a spec that says nothing
   lets every verifier do that. The reference implementation adopts the rule;
   `@smartledger/bsv` has applied it since 9.9.0.
2. **A reader refuses base64 that is not base64.** This is in the proposed text. The
   reference decoded with Node's `Buffer.from`, which skips characters outside the alphabet
   and truncates an impossible length, so a corrupted field became different bytes rather
   than an error. That happened at the reference's own request intake too: a notarize
   request with junk spliced into its base64 key was anchored with the junk dropped. The
   URL-safe alphabet and missing padding stay acceptable, because both are unambiguous and
   refusing them would gain nothing. The reference implementation adopts the rule;
   `@smartledger/bsv` has refused bad characters since 9.9.0, and impossible lengths since
   9.10.0.
3. **Hex is written lowercase and unprefixed; upper case and `0x` MAY be read.** This is in
   the proposed text. Both forms are unambiguous, and the reference already reads them.
4. **`network` has two defined names and is descriptive.** This is in the proposed text.
   `"bsv-mainnet"` is what the reference writes. `"bsv-testnet"` is reserved, so that
   testnet certificates do not acquire ad-hoc names. It is not a closed set a verifier must
   enforce. The block header the verifier obtains already fixes which chain the anchor is
   on, so a mislabelled `network` cannot make a certificate verify anywhere it is not
   anchored.
5. **Certificates already issued in other shapes stay out of the spec.** The table above
   is one implementation's history. That implementation's readers handle it:
   `@smartledger/bsv` reads those certificates and reports them as legacy. A clause in the
   spec would bind every other implementation to the same history.
6. **High-S ECDSA is accepted.** This is in the proposed text, as the reference behaves.
   Requiring low-S would reject certificates the reference has already issued, and
   `proofHash` already stops the malleated form from being passed off as the same
   certificate.

---

## Checking the claims

```
npx mocha test/notaryhash/fields_amendment.js test/notaryhash/reference_certs.js
```

The first reads the examples out of this document and checks them against the reference's
own certificates. It also checks that `@smartledger/bsv` applies the reader rules the text
states. The second verifies all ten reference certificates and rebuilds each one byte for
byte from its proof fields, using the values defined here.
