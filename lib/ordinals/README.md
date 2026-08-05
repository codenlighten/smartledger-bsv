# `bsv.Ordinals` — 1Sat Ordinals inscriptions + trustless marketplace

Build and parse [1Sat Ordinals](https://docs.1satordinals.com/) inscriptions, and list,
buy, or cancel them behind a trustless **OrdLock** "pay the seller or cancel" covenant —
built on the audited configurable-SIGHASH `OP_PUSH_TX` core (`bsv.SmartContract.PushTx`).

Every locking/unlocking script this module emits is exercised through the consensus
interpreter in `test/ordinals/`, including adversarial spends asserted to be **rejected**.

> Covenant scripts need post-Genesis limits. Call `bsv.SmartContract.enableGenesis()`
> once before building/verifying OrdLock scripts.

## Inscriptions

An inscription is content (a content-type + a body) carried on a 1-satoshi output behind
an inert `OP_FALSE OP_IF "ord" … OP_ENDIF` envelope, appended to a normal locking script
(P2PKH by default). The envelope never executes, so spending is controlled entirely by the
base lock while the inscription rides on the satoshi.

```js
var bsv = require('@smartledger/bsv')
var Ord = bsv.Ordinals

// Build an inscription locking script (P2PKH owner) and the 1-sat output.
var script = Ord.buildInscription({
  address: ownerAddress,
  contentType: 'text/plain',
  content: 'hello ordinals'
})
var output = Ord.createInscriptionOutput({ address: ownerAddress, contentType: 'image/png', content: pngBuffer })

// Parse it back. `lock` is the whole script minus the envelope: the 1Sat spec allows the
// locking script to be prepended OR appended, and both are recovered.
var insc = Ord.parseInscription(script)      // { contentType, content, contentText, lock }
Ord.isInscription(script)                    // true

// Batch many inscriptions into one transaction.
var outs = Ord.batchInscriptionOutputs([
  { address: a, contentType: 'text/plain', content: 'a' },
  { address: b, contentType: 'text/plain', content: 'b' }
])
```

### Arguments are checked, because an inscription is permanent

`content` may be any data — a string or a `Buffer` of arbitrary bytes, under any MIME
type. What the builder will not do is guess, because every guess it used to make wrote
something other than what the caller asked for onto a permanent record:

| Call | Before | Now |
| --- | --- | --- |
| `content` omitted | built a valid-looking script inscribing **nothing** | throws, and names the field you passed instead (`data`, `body`, `payload`, …) |
| `content: {…}` or a number | inscribed `[object Object]` / `"42"` | throws; encode it yourself (`JSON.stringify`, `Buffer.from`) |
| `Buffer` content, no `contentType` | labelled it `text/plain` | throws — bytes carry no hint about what they are |
| empty `lock` | emitted an **anyone-can-spend** ordinal | throws unless you pass `allowEmptyLock: true` |
| both `lock` and `address` | silently used `lock` | throws — they name different owners |
| `satoshis: 0` | built a 0-sat output carrying no ordinal | throws; must be a positive integer |

Deliberate cases are still expressible: pass `content: ''` for an empty payload, and
`allowEmptyLock: true` when you are appending the envelope to a lock you supply yourself
(this is how the OrdLock listing carries its inline inscription).

The default `contentType` of `text/plain` still applies to **string** content, which is
the common case and is truthfully described by it.

## Marketplace: the OrdLock covenant

A listing locks the 1-sat ordinal behind a script with two spend paths:

- **PURCHASE** — anyone may take the ordinal, but only by recreating the required payment
  output(s) byte-for-byte. Under `SIGHASH_ALL|ANYONECANPAY` the buyer supplies the
  surrounding outputs and adds funding inputs / change freely; the one thing they cannot do
  is take the ordinal without paying.
- **CANCEL** — the seller reclaims the listing any time with an ECDSA signature over their key.

Payments can be **multi-output** — a seller payment plus royalty and marketplace-fee
outputs — so a purchase atomically pays every party or fails.

### List (sell side)

```js
bsv.SmartContract.enableGenesis()

// Move a P2PKH ordinal into a listing, fee paid from a separate funding coin.
var listed = Ord.buildListingTx({
  ordinal: { txid: ordTxid, outputIndex: 0, script: ownerP2PKH, satoshis: 1, privateKey: ownerKey },
  seller: ownerAddress,
  price: 100000,                                             // paid to the seller
  royalties: [{ address: creatorAddress, satoshis: 5000 }], // + optional royalty / fee outputs
  funding: [{ txid: feeTxid, outputIndex: 0, script: feeP2PKH, satoshis: 20000, privateKey: feeKey }],
  fee: 500
})
// listed.tx            -> the fully-signed listing transaction (broadcast it)
// listed.listingScript -> the OrdLock locking script
// listed.listingOutpoint = { txid, outputIndex }  -> where the listing now lives
```

Prefer the raw pieces? `Ord.buildOrdLock({ seller, price, royalties })` returns just the
locking script and `Ord.listInscriptionOutput({...})` the 1-sat output.

### Read a listing (indexer / wallet / UI)

Listings are self-describing — recover their terms straight off-chain:

```js
Ord.isOrdLock(script)          // true for an OrdLock listing
var terms = Ord.parseOrdLock(script)
// {
//   seller:      { pubKeyHash, address },
//   payOutputs:  [ { satoshis, script, address }, ... ],   // seller, royalty, fee, ...
//   totalPrice:  105000,
//   inscription: { contentType, content, contentText } | null
// }
```

**`parseOrdLock` verifies, it does not pattern-match.** The terms are recovered from the
script's shape and then checked by reconstruction: the listing is rebuilt from the recovered
seller / payments / inscription and must match the input byte-for-byte. A script that merely
wears the same arrangement of opcodes — without the `OP_PUSH_TX` covenant that actually binds
the payment into `hashOutputs` — is rejected. So a non-null result means the purchase branch
really does enforce payment, and a UI can display the price without inventing a listing that
does not exist.

> **Interoperability.** This is *this library's* OrdLock. Semantically it is the widely
> deployed ordinal-lock pattern — `hash256(destOutput ‖ payOutput ‖ trailingOutputs) ==
> hashOutputs` under `SIGHASH_ALL|ANYONECANPAY` — generalized to multiple payment outputs.
> But it is built on our audited `OP_PUSH_TX` core rather than compiled from the sCrypt
> `OrdinalLock` contract, so **the script bytes differ and listings are not interchangeable
> with that template**: `parseOrdLock` reads listings this library built, not arbitrary
> marketplace listings.

### Buy (purchase side)

```js
// The buyer needs only the listing UTXO — the required payments are read off its script.
var buyTx = Ord.buildPurchaseTx({
  listing: { txid: listed.listingOutpoint.txid, outputIndex: 0, script: listed.listingScript, satoshis: 1 },
  ordinalDestination: buyerAddress,
  funding: [{ txid: coinTxid, outputIndex: 0, script: buyerP2PKH, satoshis: 200000, privateKey: buyerKey }],
  fee: 500
})
// Output layout: [ ordinal -> buyer, <pinned payments>, change -> buyer ].
// buyTx is fully signed (covenant input + funding inputs). Broadcast it.
```

### Cancel

```js
var reclaim = new bsv.Transaction()
reclaim.addInput(new bsv.Transaction.Input({
  prevTxId: listed.listingOutpoint.txid, outputIndex: 0, script: bsv.Script.empty()
}), listed.listingScript, 1)
reclaim.addOutput(new bsv.Transaction.Output({ script: sellerP2PKH, satoshis: 1 }))
Ord.cancelOrdLock({ privateKey: ownerKey, spend: reclaim, lockingScript: listed.listingScript, satoshis: 1 })
```

## Lower-level unlock builders

`Ord.purchaseOrdLock({ spend, lockingScript })` and `Ord.cancelOrdLock({ privateKey, spend, lockingScript })`
build (and assign) the unlocking script when you are assembling the spend transaction
yourself. `purchaseOrdLock` grinds the OP_PUSH_TX signature into `nLockTime`, so call it
**before** signing any funding inputs the buyer adds.

## BSV-20 / BSV-21 fungible tokens

Fungible tokens are a JSON payload (`application/bsv-20`) inside an inscription on a 1-sat
output. Two eras: **v1** is ticker-based (`tick`, 1–4 bytes); **v2 / BSV-21** is id-based
(`deploy+mint`, then transfer by `id` = the deploy `<txid>_<vout>`). Amounts are **integer
strings** — they routinely exceed 2^53, so they are never coerced to JS numbers.

```js
var B = bsv.Ordinals.BSV20

// v1: deploy a ticker, mint, transfer.
B.buildDeploy({ address: owner, tick: 'ORDI', max: '21000000', lim: '1000', dec: 18 })
B.buildMint({ address: owner, tick: 'ORDI', amt: '1000' })
B.buildTransfer({ address: newOwner, tick: 'ORDI', amt: '250' })

// v2 / BSV-21, fixed supply: deploy+mint, then transfer by id.
B.buildDeployMint({ address: owner, amt: '1000000', dec: 8, sym: 'XYZ' })
B.buildTransfer({ address: newOwner, id: deployTxid + '_0', amt: '5' })

// v2 / BSV-21, authority model: no supply at deploy; an auth output carries the right
// to mint, and minting names the token by id (and needs an auth input on chain).
B.buildDeployAuth({ address: owner, sym: 'STABLE', dec: 6 })
B.buildAuth({ address: minter, id: deployTxid + '_0' })       // delegate mint authority
B.buildMint({ address: holder, id: deployTxid + '_0', amt: '1000000' })
B.buildBurn({ address: holder, id: deployTxid + '_0', amt: '400' })

// 1-sat outputs and parsing.
var out = B.createMintOutput({ address: owner, tick: 'ORDI', amt: '1' })
B.isBsv20(out.script)                 // true
B.parseBsv20(script)                  // { p:'bsv-20', op:'mint', tick:'ORDI', amt:'1000' } | null
B.parseBsv20('{"p":"bsv-20","op":"mint","tick":"ORDI","amt":"1"}')  // also accepts JSON / objects
```

Builders validate their inputs against the specification and throw on bad data: ticker ≤ 4
bytes, `dec` 0–18, well-formed BSV-21 `id`, and amounts that are non-negative integers
**within uint64** (`amt`/`max`/`lim` are "strings representing uint64" — a larger value is
valid JSON that indexers discard, burning the tokens). A numeric amount past
`Number.MAX_SAFE_INTEGER` is rejected rather than silently rounded; pass a string. `sym` and
`icon` must be strings — `icon` an outpoint reference (`<txid>_<vout>`), as the spec defines
it — so a stray object can no longer be written as the literal text `[object Object]`.

`lim: 0` is accepted and means *unlimited*, per the spec ("0 or omitted = unlimited"); only
`max`/`amt` must be greater than zero.

**`parseBsv20` / `isBsv20` enforce validity rather than assuming it.** The operation must be
one the spec defines and must carry the fields that operation requires — a `transfer` with no
amount and no token, an `auth` carrying `amt` (which the spec forbids), an over-uint64 amount,
or an unknown `op` all return `null`. Every operation the spec defines is both built and
read. Non-canonical amounts (leading zeros) are tolerated when reading other people's
payloads, though our builders always emit canonical ones.

An operation names its token by `tick` (v1) **or** `id` (BSV-21), never both — passing both
throws rather than silently picking one, since they are different tokens.

Balance tracking is an indexer concern — this module builds and reads the on-chain payloads.

## API

| Function | Purpose |
| --- | --- |
| `buildInscription`, `createInscriptionOutput`, `batchInscriptionOutputs` | build inscription scripts / outputs |
| `parseInscription`, `isInscription` | read an inscription back |
| `buildOrdLock`, `listInscriptionOutput` | build an OrdLock listing script / 1-sat output |
| `parseOrdLock`, `isOrdLock` | recover a listing's seller, payments, price, inscription — **verified**, see below |
| `buildListingTx` | assemble a signed listing tx (P2PKH ordinal → OrdLock) |
| `buildPurchaseTx` | assemble a signed purchase tx from a listing UTXO + buyer coins |
| `purchaseOrdLock`, `cancelOrdLock` | build unlock scripts for a spend you assemble |
| `payOutputFor` | build a P2PKH payment output |
| `ORDLOCK_SIGHASH` | `SIGHASH_ALL\|ANYONECANPAY\|FORKID` (0xc1) |
| `BSV20.buildDeploy` / `buildMint` / `buildTransfer` / `buildDeployMint` | build BSV-20/21 token inscriptions |
| `BSV20.buildDeployAuth` / `buildAuth` / `buildBurn` | BSV-21 authority model: deploy without supply, delegate mint rights, burn |
| `BSV20.create*Output` | 1-sat token outputs |
| `BSV20.parseBsv20`, `BSV20.isBsv20` | read a token payload back |
