# IP records

Evidence of authorship, registered through [iptrust.org](https://iptrust.org) with the
`iptrust2` CLI. Each record is signed on this machine with the author's own key and anchored
on BSV (through NotaryHash) and on Bitcoin (through OpenTimestamps).

A record is **evidence** that the committed content existed by the time of the block, and that
the signer made the statement it carries. It does not create or register any right, and formal
registration is a separate thing.

Registrations are **hash-only**: the content and its blinding value are committed to by hash.
Nothing about the work itself is sent to the service.

| date | covers | type | record | signer | tag |
| --- | --- | --- | --- | --- | --- |
| 2026-10-14 | `lib/` at v9.35.0 — the 9.35.0 release: `Script.fromBuffer` threw on a push whose LENGTH PREFIX was cut off, so the valid locking scripts `6a4c`, `6a4d01` and `6a4e0100` could not be parsed in either era — one of them is on livenet in `ebc9fa11…b767`. The chunk now carries a `lenPrefix` and the parser is total over all byte strings (282,400 sequences fuzzed, no throws and no round-trip mismatches), with the interpreter untouched | software, published to npm as [`@smartledger/bsv@9.35.0`](https://www.npmjs.com/package/@smartledger/bsv/v/9.35.0) (shasum `fbfa8dcc…5a65`) | [`f232c9cc…2a92`](https://iptrust.org/v/f232c9ccc5530dc192be4ae8ee9606168c5544840c4817c59447734c4b492a92) | Gregory J. Ward | `ip-2026-10-14-2` |
| 2026-10-14 | `lib/` at v9.34.0 — the 9.34.0 release: a credential disclosure defect. Each field salt in a Lightweight Trust Protocol proof was `sha256(nonce ‖ path ‖ index)`, and the nonce ships inside the proof, so anyone holding one could recompute the salt of every field including those never disclosed — an undisclosed date of birth was recovered from the published 9.33.2 artifact in under 100,000 hashes. Salts now come from `HMAC-SHA256` under a 32-byte per-disclosure master that never enters a proof | software, published to npm as [`@smartledger/bsv@9.34.0`](https://www.npmjs.com/package/@smartledger/bsv/v/9.34.0) (shasum `440c41ee…4aaf`) | [`ca49d2e2…3905`](https://iptrust.org/v/ca49d2e22dbf3d0efabba11ed96b38e49f47ab5907d57754210b0f8ff7373905) | Gregory J. Ward | `ip-2026-10-14` |
| 2026-10-11 | `lib/` at v9.30.0 — the 9.30.0 release: a consensus false accept. `isAfterChronicle()` accepted the BLOCK-era bit where the node gates the restored Chronicle opcodes and the per-era limits on the OUTPUT's era alone, so those opcodes ran when spending a pre-Chronicle output in a post-Chronicle block. 571 of 24,568 node-validated corpus rows disagreed before; none after | software, published to npm as [`@smartledger/bsv@9.30.0`](https://www.npmjs.com/package/@smartledger/bsv/v/9.30.0) (shasum `6408a509…23be`) | [`b781888b…9125`](https://iptrust.org/v/b781888b7cfde20343def8c40bc860f93ca4a6e1a02555bb1751f0e2004a9125) | Gregory J. Ward | `ip-2026-10-11-3` |
| 2026-10-11 | `lib/` at v9.29.0 — the 9.29.0 release: a consensus false accept. `OP_LEFT`/`OP_RIGHT`/`OP_SUBSTR` bounded their operand only by `maxScriptNumLength()` (32,000,000 post-Chronicle) where the node requires it to deserialize as an int64, so a 600-byte operand was accepted and the network refuses it | software, published to npm as [`@smartledger/bsv@9.29.0`](https://www.npmjs.com/package/@smartledger/bsv/v/9.29.0) (shasum `bedb2237…1d30`) | [`40166228…45dbc`](https://iptrust.org/v/401662284e496e1c51fb99d17ea95ddce2399dcabf68e048111ce6b4e4645dbc) | Gregory J. Ward | `ip-2026-10-11-2` |
| 2026-10-11 | `lib/` at v9.28.1 — the 9.28.1 release: three guards in `PushTx` that were inert (an ignored buffer size making its own check tautological, a mask test admitting sighash words that build a dud lock, and a one-method duck type), plus the Chronicle malleability version gate confirmed against a reference node across 28,512 judgments | software, unpublished at registration; published to npm 2026-10-11 as [`@smartledger/bsv@9.28.1`](https://www.npmjs.com/package/@smartledger/bsv/v/9.28.1) (shasum `02d23aef…683b`) | [`457c5a03…22825`](https://iptrust.org/v/457c5a034c26933175c174869378f1dede87f7f4833b53d886ae8c762b022825) | Gregory J. Ward | `ip-2026-10-11` |
| 2026-10-01 | `lib/` at v9.16.1 — the 9.16.1 release: the shift opcodes' cost and count validation, and `OP_NUM2BIN`'s `INT32_MAX` bound | software, published | [`0bd4ddcb…88a4c`](https://iptrust.org/v/0bd4ddcb2e391911a31495cff3e74593e7d31ed19fb5975ef1691ca105e88a4c) | Gregory J. Ward | `ip-2026-10-01` |
| 2026-09-30 | `lib/` at v9.15.0 — the 9.15.0 release: the signature check that never ran, and Chronicle's malleability relaxations | software, published | [`8aecf47f…30179`](https://iptrust.org/v/8aecf47ff500fbd316e965b8292ef12426d9fa55c276b7d0f21c889732030179) | Gregory J. Ward | `ip-2026-09-30` |

Authors on every record for this project: Gregory J. Ward, Bryan W. Daugherty, Shawn M. Ryan.

## Why the records cover `lib/` rather than the whole tree

`test/data/bitcoin-sv/` and `test/data/bitcoind/` are the reference implementations' own test
vectors, copied verbatim and MIT licensed. They are not ours to register, so the records are
scoped to `lib/`, which is this project's own source. The git tag fixes the state of the whole
tree at the same commit, so nothing is lost by the narrower scope.

## Verifying a record

The evidence lives in `.iptrust/v2/<recordHash>/`. `opening.json` and `manifest.json` are the
private half: **a registration cannot be proven without them**, so they are never deleted, and
neither is an `ip-*` tag.

Verification runs in a separate worktree, so the working copy is never touched:

```sh
git worktree add /tmp/at-tag-smartledger-bsv ip-2026-09-30 && cp -r .iptrust /tmp/at-tag-smartledger-bsv/
(cd /tmp/at-tag-smartledger-bsv && iptrust2 verify 8aecf47ff500fbd316e965b8292ef12426d9fa55c276b7d0f21c889732030179 --fetch-headers)
git worktree remove --force /tmp/at-tag-smartledger-bsv
```

Expect `verdict: valid` and `content: matched`. Block headers can come from any source, so the
check does not depend on iptrust being reachable.

Anchoring completes after the record is accepted — BSV in about an hour, Bitcoin in a few
hours — so `iptrust2 status <recordHash>` may show `certified` / `stamp-pending` for a while
before both chains read `anchored`.
