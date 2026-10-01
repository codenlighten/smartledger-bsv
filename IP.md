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
git worktree add /tmp/at-tag ip-2026-09-30 && cp -r .iptrust /tmp/at-tag/
(cd /tmp/at-tag && iptrust2 verify 8aecf47ff500fbd316e965b8292ef12426d9fa55c276b7d0f21c889732030179 --fetch-headers)
git worktree remove --force /tmp/at-tag
```

Expect `verdict: valid` and `content: matched`. Block headers can come from any source, so the
check does not depend on iptrust being reachable.

Anchoring completes after the record is accepted — BSV in about an hour, Bitcoin in a few
hours — so `iptrust2 status <recordHash>` may show `certified` / `stamp-pending` for a while
before both chains read `anchored`.
