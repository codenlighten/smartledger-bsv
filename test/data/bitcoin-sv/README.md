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

Chronicle activated on mainnet at block **943,816** on **2026-04-07**.

## Files

| file | entries | covers |
| --- | --- | --- |
| `script_tests.json` | 1549 | script evaluation, including Genesis and Chronicle rules |
| `sighash.json` | 1001 | transaction digest algorithm |
| `tx_valid.json` | 93 | transactions that must validate |
| `tx_invalid.json` | 68 | transactions that must be rejected |
| `base58_keys_valid.json` | 50 | address and WIF encoding |
| `base58_keys_invalid.json` | 50 | malformed address rejection |
| `base58_encode_decode.json` | 12 | raw base58 round-trips |

Every one of these is exercised. That was not true for a long time: only
`script_tests` and `sighash` ran, while the inherited bitcoind copies of the
rest were what the tests used. Wiring up the transaction vectors found a
Genesis rule this interpreter had missed, so the ones left unused are worth
treating as unfinished work rather than as spare.

These supersede the older pre-Genesis vectors in `test/data/bitcoind`, which are
inherited from the upstream fork and encode consensus rules the network
abandoned in 2020. Those are retained for now so the two can be diffed, but
they are **not** a valid consensus reference.

## Row layout

Defined by `script_json_test` in the node's `src/test/script_tests.cpp`:

    [ [nValue]?, txnVersion, scriptSig, scriptPubKey, flags, expected, comment? ]

Two columns are easy to get wrong:

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

## Measuring the gap

    npm run vectors:gap          # summary
    npm run vectors:gap -- --verbose   # every failing vector

The harness passes each vector exactly the flags the row names, and nothing
else. It used to add the `MONOLITH`/`MAGNETIC` opcode groups to every vector to
compensate for this fork gating opcodes the SV node does not gate; that gating
is gone, and so is the compensation. The figures below are what the corpus
produces on the flags it actually specifies.

## Transaction vectors

`tx_valid.json` and `tx_invalid.json` go a level above the script corpus: a
whole transaction is deserialised, each input resolved against the output it
claims to spend, and every one required to verify — with locktimes, sequence
numbers and multiple inputs in play.

That level is worth having. It found a Genesis rule the script corpus cannot
reach: `OP_CHECKLOCKTIMEVERIFY` and `OP_CHECKSEQUENCEVERIFY` revert to
upgradable NOPs after Genesis, and without that four transactions the network
accepts were being rejected. The behaviour only appears once a real nLockTime
and sequence exist, so no single-script vector exercises it.

`test/consensus/tx-vectors.js` holds these at zero failures in **both**
directions, with no allowlist.

## Base58

The key vectors are byte-identical to the bitcoind copies, but
`base58_encode_decode.json` has no counterpart there and nothing else pins the
raw codec against the node. `test/consensus/base58-vectors.js` runs all three.

Note what the invalid-key vectors actually claim: that a string is neither a
valid address nor a valid WIF. Several carry a perfectly good checksum and are
simply the wrong length or version, so `Base58Check` accepts them and the layer
above is what refuses. A test asserting the checksum layer rejects them would
be asserting something the corpus does not say.

## The ratchet

`test/consensus/script-vectors.js` runs this corpus on every `npm test` and
compares the failures against `test/consensus/known-failures.json`. That list
may only ever shrink:

- a vector that fails without being listed is a **regression**
- a vector that is listed but now passes means the list is **stale**

Both fail the build, so consensus behaviour cannot drift in either direction
without someone recording the decision. False accepts — where we accept a
script the node rejects — are held at zero outright rather than via the list,
because that is the direction that can cost money.

After deliberately changing interpreter behaviour:

    npm run vectors:accept

then review the diff. Every removed line is progress; every added line is a
regression that needs justifying.

## Result codes

Matching the node's accept/reject outcome is not the same as failing for the
node's reason, and the gap between the two has hidden real bugs — a
div-by-zero guard that never fired, a stack guard that set an error without
returning and then crashed. Both left the script failing, just not in the way
the node fails it, so the outcome check stayed green.

So the ratchet also compares the result code of every vector the node rejects.
Where this library deliberately reports a narrower name than the node —
`EVAL_FALSE_IN_STACK` for `EVAL_FALSE`, `SIG_DER_INVALID_FORMAT` for
`SIG_DER` — the accepted set is `ERROR_CODE_ALIASES` in
`tools/vector-harness.js`. It is a short statement of intent rather than a
list of exempted vectors, and it ratchets both ways: an unlisted mismatch
fails, and so does an alias no vector produces any more.

`tools/vector-harness.js` is shared by the report and the gate, so the two
cannot disagree about what passes.
