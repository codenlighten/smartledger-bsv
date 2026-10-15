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
| 2026-10-15 | `lib/` at v9.38.0 — the 9.38.0 release: `Message#verify()` accepts the high-s twin of any signature it produced, so two different base64 strings verify for one key and one message and the bytes are not a unique name for a statement — anything keyed on them (a deduplication key, a nonce, a replay marker, an audit identity, a Merkle leaf) has a forgeable twin. Measured present at every published version back to 1.5.6-fix1, and two projects in this estate had assumed otherwise. `verify(address, sig, { lowS: true })` now refuses it at both the instance and static layers; the option is opt-in because the signatures refused are valid ECDSA and `sign()` has only ever emitted low-s (measured over 40 fresh keys), so refusing by default is a compatibility change rather than a bug fix and 10.0.0 flips it. Also `docs/RELEASE-10.0.0.md`, which collects every breaking change the library has promised — nine registered deprecations dating from 9.1.0, five decisions with no call site to attach a notice to, and two candidates — with `test/properties/release_10_plan.js` asserting that every `removeIn: '10.0.0'` in `lib/` appears in the plan and every path it cites exists, sabotage-tested in both directions | software, published to npm as [`@smartledger/bsv@9.38.0`](https://www.npmjs.com/package/@smartledger/bsv/v/9.38.0) (shasum `45e25d1e…67e3`) | [`abf72fe3…5374`](https://iptrust.org/v/abf72fe31c2b165366186fac5546606ab2560e797e100fb9b7cf8eb4eece5374) | Gregory J. Ward | `ip-2026-10-15-2` |
| 2026-10-15 | `lib/` at v9.37.0 — the 9.37.0 release: a consensus divergence in the ORIGINAL transaction digest algorithm. Where a scriptCode ends in a push the node cannot decode, the node writes the bytes only as far as its own script walk reached — the opcode and whatever length field it read — and drops the partial operand, while the length prefix still counts it; this library serialized the script in full and so computed a different digest, so a signature valid on the network did not verify here and one made here did not verify there. Against a compiled bitcoin-sv v1.2.3, 45 of 55 reference rows agreed before and all 55 agree after, preimage and digest. Reachable for any non-FORKID hash type and for 0x61, FORKID|CHRONICLE, which is current; BIP-143 never walks the script and is untouched. Also: `toString` wrote a cut-off length prefix as raw bytes that its own `fromString` then refused, so the text forms were write-only for a script that is on livenet — 69,448 throws to zero over the 382,540 short scripts that carry an undecodable push, with no byte drift and no predicate change, and the new token rule accepts only tokens that previously threw | software, published to npm as [`@smartledger/bsv@9.37.0`](https://www.npmjs.com/package/@smartledger/bsv/v/9.37.0) (shasum `4ce37deb…f8b0`) | [`ca759886…dffe`](https://iptrust.org/v/ca7598868296297634b658aea4b046db193d3965f63b04cb9c3bb9e905fadffe) | Gregory J. Ward | `ip-2026-10-15` |
| 2026-10-14 | `lib/` at v9.36.0 — the 9.36.0 release: `GDAF#generateAgeProof` and the top-level `bsv.generateAgeProof` discarded their first argument and committed to a hardcoded `new Date('1995-06-15')`, so a proof that a subject meets an age threshold passed for a subject who does not — on published 9.35.0 a credential for a subject born 2015-03-01 verified true at every minimum age from 1 to 31, and ten input shapes including `undefined` and `null` returned one commitment between them. It was a constant function of its first argument. The argument is now the birth date, strictly parsed, and a credential is refused, because `createAgeCredential` stores only `birthDateHash` and no date is recoverable from it. Also: the 9.23.0 wrapper guard inspected 7 of 8 delegating methods and silently skipped this one, and now fails on any it cannot read; the top-level `bsv.*` forwarders, which 9.23.0 left behind, are covered too | software, published to npm as [`@smartledger/bsv@9.36.0`](https://www.npmjs.com/package/@smartledger/bsv/v/9.36.0) (shasum `866aa1dd…1d59`) | [`b7911dd1…2b9e`](https://iptrust.org/v/b7911dd13bc7ba9c5fc4cae0cbf079990feb0fc38dcd141bb9bf34747e882b9e) | Gregory J. Ward | `ip-2026-10-14-3` |
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

### Verification log, 2026-10-15

All three 2026-10-14 records re-verified at their tags, each in its own worktree:

| tag | record | verdict | content |
|---|---|---|---|
| `ip-2026-10-14` | `ca49d2e2…3905` | `valid` | `matched`, no reasons |
| `ip-2026-10-14-2` | `f232c9cc…2a92` | `valid` | `matched`, no reasons |
| `ip-2026-10-14-3` | `b7911dd1…2b9e` | `valid` | `matched`, two reasons below |

Two observations on the third record, neither about its content:

1. `iptrust2 status` reports `needsAttention: true` with **no `lastError` on either chain**.
   `bitcoin` reads `anchored` at height 971477; `bsv` is still `included` at 971100 and the
   verifier says *"bsv: 5 confirmations; 6 required"*, unchanged over an interval in which the
   chain advanced well past that block. That looks like the BSV side not progressing rather than
   anything about the registered tree, which verifies `matched`.
2. The verifier also notes *"bitcoin: operator key is not authorized by a pinned root; the anchor
   still dates the record, but the operator's receipt claim is unattributed"*. By construction
   (`reference/verify-core.mjs:272`) that check runs only for a chain already `anchored`, which
   is why it appears here and not on the two older records, whose reasons are empty. It is a
   statement about attribution of the operator's receipt, not about the timestamp or the content.

Both are iptrust-side conditions, raised for that project rather than acted on here.
`--fetch-headers` could not be used in this round: `blockstream.info/api` returns **429** to this
egress (mempool.space returns 200), which per the procedure is not a verdict — content matching
is local and needs no headers.
