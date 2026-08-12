# SV Node consensus vectors

Consensus test vectors copied verbatim from the reference node implementation.
These are the specification this library is measured against — do not hand-edit
them. To update, re-copy from a node tag and record the new provenance here.

| field | value |
| --- | --- |
| source | [`bitcoin-sv/bitcoin-sv`](https://github.com/bitcoin-sv/bitcoin-sv) `src/test/data` |
| tag | `v1.2.0` (Chronicle); byte-identical in `v1.2.2`, the current release |
| commit | `60dc6a3f2547eeaaa3a605e5a69a9fc8686b0a25` |
| retrieved | 2026-08-11 |
| licence | MIT (same as this library) |

Genesis activated at block **620,538** on **2020-02-04**; Chronicle at block
**943,816** on **2026-04-07**.

## Files

| file | rows run | covers | gate |
| --- | --- | --- | --- |
| `script_tests.json` | 1483 | script evaluation, including Genesis and Chronicle rules | `test/consensus/sv-script-vectors.js` |
| `sighash.json` | 1000 | transaction digest algorithm | `test/consensus/sv-sighash-vectors.js` |
| `tx_valid.json` | 93 | transactions that must validate | `test/consensus/sv-tx-vectors.js` |
| `tx_invalid.json` | 68 | transactions that must be rejected | `test/consensus/sv-tx-vectors.js` |
| `base58_keys_valid.json` | 50 | address and WIF encoding | `test/consensus/base58-vectors.js` |
| `base58_keys_invalid.json` | 50 | malformed address rejection | `test/consensus/base58-vectors.js` |
| `base58_encode_decode.json` | 12 | raw base58 round-trips | `test/consensus/base58-vectors.js` |

Every one of these is exercised, and every one passes completely. There is no
known-failure list and nothing is exempted, so any list added later should read
as a decision someone made rather than as inherited debt.

These supersede the older pre-Genesis vectors in `test/data/bitcoind`, which are
inherited from the upstream fork and encode consensus rules the network
abandoned in 2020. Those are retained for now so the two can be diffed, but
they are **not** a valid consensus reference. Where they disagree with these,
these win.

## Measuring the gap

    npm run vectors:sv                  # script vectors
    npm run vectors:sv-tx               # transaction vectors
    npm run vectors:sv-sighash          # transaction digest vectors

Each takes `-- --verbose` for the full failing list. Every report shares its
harness with the corresponding gate under `test/consensus`, so the progress
figure and the regression gate cannot disagree about what passes.

The script and transaction reports separate the two directions of failure. A
**false accept** — accepting a script the node rejects — is the direction that
can cost money, and is held at zero outright. A false reject only costs a
transaction. The digest report makes no such distinction: a wrong digest is
equally bad either way, since it both makes valid signatures unverifiable and
signs something other than what the caller was shown.

## Row layout, and two columns that are easy to get wrong

Defined by `script_json_test` in the node's `src/test/script_tests.cpp`:

    [ [nValue]?, txnVersion, scriptSig, scriptPubKey, flags, expected, comment? ]

- **`nValue`** is present only when a row needs an input amount, and it is
  wrapped in an **array**. It states whole coins; the transaction carries
  satoshis, so multiply by 1e8 (the node's `AmountFromValue`).
- **`txnVersion`** is the *spending* transaction's version, and is present on
  every row. Chronicle gates its malleability relaxations on version > 1, so
  this column is consensus-relevant — it is not padding, and it is not an
  amount. Mistaking it for one changes the crediting transaction's value, which
  changes its txid, which changes the sighash, which silently breaks every
  signature-checking vector in the corpus.

The crediting transaction is always version 1; only the spending transaction
carries the version under test. Both use locktime 0 and a final sequence, and
the crediting input's scriptSig is `OP_0 OP_0`.

## Flags, and one place this fork differs

Flags are mapped by **name**, never by value. This library assigns
`MONOLITH_OPCODES` and `MAGNETIC_OPCODES` to bits `1<<18` and `1<<19`, which
are the bits the node uses for `SCRIPT_GENESIS` and `SCRIPT_UTXO_AFTER_GENESIS`
— mapping by value would quietly run vectors under the wrong rules while
appearing to pass.

The corpus never names `MONOLITH` or `MAGNETIC`, because the node has no such
flags: those opcodes were restored on BSV in 2018 and are simply enabled. This
library still gates them, so the harness enables them for every row; otherwise
the report would be dominated by that one difference rather than by consensus.
The gating is itself a divergence from BSV and is worth removing. It is
compensated for here rather than hidden, so that the figures mean what they
say.

## Transaction vectors

`tx_valid.json` and `tx_invalid.json` go a level above the script corpus: a
whole transaction is deserialised, each input resolved against the output it
claims to spend, and every one required to verify — with locktimes, sequence
numbers and multiple inputs in play.

That level is worth having. It found a Genesis rule the script corpus cannot
reach: `OP_CHECKLOCKTIMEVERIFY` and `OP_CHECKSEQUENCEVERIFY` revert to
upgradable NOPs after Genesis, and without that, four transactions the network
accepts were being rejected. The behaviour only appears once a real nLockTime
and sequence exist, so no single-script vector exercises it.

## Digest vectors

Each row of `sighash.json` carries **two** expected digests for the same inputs
— one with forkid enabled and one without — which pins the routing in
`SignatureHash()` rather than one branch of it.

That second column earned its keep. It found 260 rows where this library
honoured `SIGHASH_CHRONICLE` only when `SCRIPT_ENABLE_CHRONICLE` was also set,
where the node routes on the bit alone and instead rejects a signature carrying
that bit outside Chronicle in `CheckSignatureEncoding`, as
`SCRIPT_ERR_ILLEGAL_CHRONICLE`. Rejected, not reinterpreted.

For a row whose hash type sets `0x20`, both columns are identical — the
original algorithm is taken either way. 511 of the 1000 rows are of that kind,
so a gate checking only one column would be blind to half the corpus.

## Base58

The key vectors are content-identical to the bitcoind copies already used by
`test/address.js` and `test/privatekey.js` — same 50 rows, different whitespace
— but `base58_encode_decode.json` has no counterpart there, and nothing else
pins the raw codec against the node in both directions.

Note what the invalid-key vectors actually claim: that a string is neither a
valid address nor a valid WIF. Several carry a perfectly good checksum and are
simply the wrong length or version, so `Base58Check` accepts them and the layer
above is what refuses. A test asserting the checksum layer rejects them would
be asserting something the corpus does not say.

## What is not measured yet

Matching the node's accept/reject outcome is not the same as failing for the
node's *reason*, and the gap between the two hides real bugs — a div-by-zero
guard that never fired, a stack guard that set an error without returning and
then crashed on the next line. Both left the script failing, just not in the
way the node fails it, so an outcome-only check stays green.

The script gate compares outcomes only. Comparing the result code of every
vector the node rejects is the next thing worth adding here.
