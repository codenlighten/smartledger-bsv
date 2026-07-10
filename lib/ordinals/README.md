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

// Parse it back.
var insc = Ord.parseInscription(script)      // { contentType, content, contentText, lock }
Ord.isInscription(script)                    // true

// Batch many inscriptions into one transaction.
var outs = Ord.batchInscriptionOutputs([
  { address: a, contentType: 'text/plain', content: 'a' },
  { address: b, contentType: 'text/plain', content: 'b' }
])
```

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

## API

| Function | Purpose |
| --- | --- |
| `buildInscription`, `createInscriptionOutput`, `batchInscriptionOutputs` | build inscription scripts / outputs |
| `parseInscription`, `isInscription` | read an inscription back |
| `buildOrdLock`, `listInscriptionOutput` | build an OrdLock listing script / 1-sat output |
| `parseOrdLock`, `isOrdLock` | recover a listing's seller, payments, price, inscription |
| `buildListingTx` | assemble a signed listing tx (P2PKH ordinal → OrdLock) |
| `buildPurchaseTx` | assemble a signed purchase tx from a listing UTXO + buyer coins |
| `purchaseOrdLock`, `cancelOrdLock` | build unlock scripts for a spend you assemble |
| `payOutputFor` | build a P2PKH payment output |
| `ORDLOCK_SIGHASH` | `SIGHASH_ALL\|ANYONECANPAY\|FORKID` (0xc1) |
