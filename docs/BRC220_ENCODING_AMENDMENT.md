# Withdrawn: proposed BRC-220 `encoding` amendment

**This proposal was wrong and has been withdrawn. It was never filed.**

It proposed defining the certificate's `encoding` field as `"raw"` or `"der"` — the
signature's byte format — and requiring ECDSA signatures to be low-S, with a 33-byte
compressed public key. It was written from this library's implementation alone.

Checked against the BRC-220 reference implementation before filing, it contradicted
it on every point:

| | this proposal | reference implementation |
| --- | --- | --- |
| `encoding` means | the signature's byte format | how `publicKey` and `signature` are written into the JSON |
| `encoding` values | `"raw"`, `"der"` | `"hex"`, `"base64"` |
| signature bytes | 64-byte `r ‖ s` only, DER discouraged | 64-byte `r ‖ s` or DER, told apart by the bytes |
| high-S signatures | rejected | accepted, deliberately |
| public keys | 33-byte compressed | 33-byte compressed or 65-byte uncompressed |

Every certificate the reference service has issued uses `"hex"` or `"base64"`. Filing
this would have proposed a spec change incompatible with all of them.

It also exposed that `@smartledger/bsv` 8.3.0–9.8.0 could not verify a single
certificate the reference issued: its `version`, `mode`, `encoding`, `anchor` and batch
`path` fields all differed. The library now reads both formats, and
writes the reference one given `format: 'reference'` — the default from 10.0.0. See
`lib/notaryhash/certificate.js`.

## What is still true

The gap this draft set out to close is real: BRC-220 lists `encoding` as a required field
and never enumerates its values, and says nothing about the JSON form of `version`,
`mode`, `anchor` or the batch `path`. A clarification defining those fields **as the
reference writes them** is a separate, later proposal.

The batch-leaf clarification written alongside this one was correct, and was confirmed
against the reference implementation: it was filed as
[bsv-blockchain/BRCs#246](https://github.com/bsv-blockchain/BRCs/pull/246). See
[BRC220_BATCH_LEAF_AMENDMENT.md](BRC220_BATCH_LEAF_AMENDMENT.md).
