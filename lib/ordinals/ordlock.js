'use strict'
/**
 * OrdLock — a trustless "list an ordinal for sale" covenant for 1Sat Ordinals.
 *
 * A seller locks the 1-sat ordinal UTXO behind a script with two spend paths:
 *
 *   PURCHASE  anyone may take the ordinal, but ONLY by paying the seller. The buyer
 *             builds the spend, the covenant authenticates its BIP-143 preimage with
 *             OP_PUSH_TX and requires that the transaction's outputs are exactly
 *             `buyerOutputs || payBlob || trailingOutputs` — where `payBlob` (the
 *             required payment output(s)) is hard-baked into the locking script. The
 *             buyer is free to choose where the ordinal goes and to add funding inputs
 *             / change (SIGHASH_ALL|ANYONECANPAY): the ONE thing they cannot do is take
 *             the ordinal without recreating the required payment(s) byte-for-byte.
 *
 *   CANCEL    the seller reclaims the listing at any time with an ordinary ECDSA
 *             signature over their own public key (a P2PKH gate inside the covenant).
 *
 * `payBlob` may pin MORE THAN ONE output — the concatenation of a seller payment plus
 * any royalty / marketplace-fee outputs — so a purchase atomically pays every party or
 * fails. This is the widely-deployed 1Sat Ordinals OrdinalLock pattern, generalized and
 * built on the audited configurable-SIGHASH OP_PUSH_TX core (SmartContract.PushTx).
 * Every script this module emits is exercised through the consensus interpreter.
 *
 * The listing is self-describing: `parseOrdLock(script)` recovers the seller, the pinned
 * payment output(s), the total price, and any inline inscription — so an indexer, wallet,
 * or marketplace UI can read a listing straight off-chain, and `buildPurchaseTx` can
 * assemble a complete, signed purchase knowing only the listing UTXO and the buyer's coins.
 *
 * Layout (locking script):
 *   OP_IF
 *     <sellerPKH> ...        // CANCEL: OP_DUP OP_HASH160 <pkh> OP_EQUALVERIFY OP_CHECKSIG
 *   OP_ELSE
 *     ...OP_PUSH_TX core...  // PURCHASE: authenticate preimage, bind outputs to payBlob
 *   OP_ENDIF
 *   [OP_FALSE OP_IF "ord" … OP_ENDIF]   // optional inert inscription envelope
 *
 * Requires post-Genesis limits: call SmartContract.enableGenesis() before verifying.
 */
var bsv = require('../..')
var P = require('../smart_contract/pushtx')
var H = require('../smart_contract/covenant_helpers')
var inscription = require('./inscription')

var Script = bsv.Script
var Opcode = bsv.Opcode
var BufferReader = bsv.encoding.BufferReader

// OrdLock commits to the FULL output set (so payments can be pinned) but leaves the
// input set open for the buyer's funding — SIGHASH_ALL|ANYONECANPAY|FORKID (0xc1).
var ORDLOCK_SIGHASH = P.SIGHASH_ALL_ANYONECANPAY_FORKID

/** Push a possibly-empty buffer MINIMALDATA-cleanly (empty => OP_0, i.e. empty vector). */
function pushData (s, buf) { return (buf && buf.length) ? s.add(Buffer.from(buf)) : s.add(Opcode.OP_0) }

/** Serialize a Transaction.Output to its on-wire bytes (8-byte value || varint || script). */
function serializeOutput (out) { return out.toBufferWriter().toBuffer() }

/** Assert a value is a non-negative integer satoshi amount; return it. */
function assertSats (v, label) {
  if (typeof v !== 'number' || !isFinite(v) || v < 0 || Math.floor(v) !== v) {
    throw new Error(label + ' must be a non-negative integer number of satoshis (got ' + v + ')')
  }
  return v
}

/** Coerce a Script, Buffer, or hex string to a Script. */
function coerceScript (v) {
  if (v instanceof Script) return v
  if (Buffer.isBuffer(v)) return Script.fromBuffer(v)
  return Script.fromHex(v)
}

/** Coerce an Address, PublicKey, PrivateKey, or address string to an Address. */
function toAddress (v) {
  if (v instanceof bsv.Address) return v
  if (v && typeof v.toAddress === 'function') return v.toAddress() // PublicKey / PrivateKey
  return bsv.Address.fromString(String(v))
}

/** Resolve a 20-byte HASH160 owner commitment from an Address/PublicKey/key or 20-byte Buffer. */
function resolvePubKeyHash (owner) {
  if (Buffer.isBuffer(owner)) {
    if (owner.length !== 20) throw new Error('seller pubkeyhash buffer must be 20 bytes (HASH160)')
    return owner
  }
  if (owner instanceof bsv.PublicKey) return bsv.crypto.Hash.sha256ripemd160(owner.toBuffer())
  return toAddress(owner).hashBuffer
}

/**
 * Build the seller's payment Output (P2PKH) from an address/pubkey/key and a price in sats.
 * A pre-built Transaction.Output is NOT accepted here — use it directly (or pass it as a
 * `payOutputs`/`payTo` spec) — so that `price` is never silently ignored.
 */
function payOutputFor (payTo, price) {
  assertSats(price, 'payment price')
  return new bsv.Transaction.Output({
    script: Script.buildPublicKeyHashOut(toAddress(payTo)), satoshis: price
  })
}

/** Coerce one payment spec to a Transaction.Output. */
function outputFromSpec (spec) {
  if (spec instanceof bsv.Transaction.Output) return spec
  if (Buffer.isBuffer(spec)) return bsv.Transaction.Output.fromBufferReader(new BufferReader(spec))
  var to = spec.payTo != null ? spec.payTo : spec.address
  var amt = spec.satoshis != null ? spec.satoshis : spec.price
  if (to == null || amt == null) throw new Error('payment spec needs {address|payTo, satoshis|price}')
  return payOutputFor(to, amt)
}

/**
 * Resolve the required payment output(s) for a listing, in the order they must be
 * recreated. Accepts (in priority order): `payOutputs` (array of Output/spec/Buffer),
 * a single `payOutput`, or `price`+`payTo` (defaulting the recipient to `seller`) with
 * optional `royalties` appended.
 */
function resolvePayOutputs (params) {
  if (params.payOutputs) {
    if (!params.payOutputs.length) throw new Error('payOutputs must be a non-empty array')
    return params.payOutputs.map(outputFromSpec)
  }
  if (params.payOutput != null) return [outputFromSpec(params.payOutput)]
  if (params.price != null) {
    var payTo = params.payTo != null ? params.payTo : params.seller
    // A pre-built Output as payTo is used verbatim (its own value); otherwise build P2PKH(price).
    var first = (payTo instanceof bsv.Transaction.Output) ? payTo : payOutputFor(payTo, params.price)
    var arr = [first]
    if (params.royalties) params.royalties.forEach(function (r) { arr.push(outputFromSpec(r)) })
    return arr
  }
  throw new Error('buildOrdLock requires a price, a payOutput, or payOutputs')
}

/** The pinned payment bytes = concatenation of every required output's serialization. */
function payBlobFrom (outputs) { return Buffer.concat(outputs.map(serializeOutput)) }

/**
 * Build an OrdLock listing (locking) script.
 *
 * @param {object} params
 * @param {Address|PublicKey|string|Buffer} params.seller  who may CANCEL the listing
 *   (an address, public key, or 20-byte HASH160). Also the default payment recipient.
 * @param {number} [params.price]     asking price in satoshis (simple single-payment form).
 * @param {Address|PublicKey|string|Transaction.Output} [params.payTo]  payment recipient
 *   for `price` (default: `seller`).
 * @param {Array} [params.royalties]  extra payment specs appended after the `price` output
 *   (each: Transaction.Output, {address,satoshis}, or a serialized-output Buffer).
 * @param {Array} [params.payOutputs] pin an explicit ordered list of payment outputs,
 *   overriding price/payTo/royalties (seller + royalty + marketplace-fee, etc.).
 * @param {Transaction.Output|Buffer} [params.payOutput]  pin a single explicit output.
 * @param {object} [params.inscription]  if given ({contentType, content}), an inscription
 *   envelope is appended so a fresh inscribe+list share one output.
 * @returns {Script} the OrdLock locking script.
 */
function buildOrdLock (params) {
  params = params || {}
  if (params.seller == null) throw new Error('buildOrdLock requires a seller')
  var sellerPKH = resolvePubKeyHash(params.seller)
  var payBlob = payBlobFrom(resolvePayOutputs(params))

  var s = new Script()
  s.add(Opcode.OP_IF)
  // CANCEL: seller signs with their key; standard P2PKH gate.
  s.add(Opcode.OP_DUP).add(Opcode.OP_HASH160)
  s.add(Buffer.from(sellerPKH)).add(Opcode.OP_EQUALVERIFY).add(Opcode.OP_CHECKSIG)
  s.add(Opcode.OP_ELSE)
  // PURCHASE: stack (after OP_IF pops the false marker) = [.., trailing, buyerOuts, preimage]
  s.add(Opcode.OP_DUP)
  P.pushTxCore(s, { sighashType: ORDLOCK_SIGHASH }) // authenticate the preimage
  s.add(Opcode.OP_VERIFY)
  P.assertSighashType(s, ORDLOCK_SIGHASH) // pin the flag (defense-in-depth); leaves preimage
  P.extractHashOutputs(s) // preimage -> committed hashOutputs
  s.add(Opcode.OP_TOALTSTACK) // park committedHO; main: [trailing, buyerOuts]
  s.add(Buffer.from(payBlob)).add(Opcode.OP_CAT) // buyerOuts || payBlob
  s.add(Opcode.OP_SWAP).add(Opcode.OP_CAT) // (buyerOuts || payBlob) || trailing
  s.add(Opcode.OP_HASH256)
  s.add(Opcode.OP_FROMALTSTACK).add(Opcode.OP_EQUAL) // == committed hashOutputs ?
  s.add(Opcode.OP_ENDIF)

  if (params.inscription) {
    var env = inscription.buildInscription({
      lock: new Script(), // envelope only; the covenant above is the real lock
      allowEmptyLock: true, // ...which is why the empty-lock guard does not apply here
      contentType: params.inscription.contentType,
      content: params.inscription.content
    })
    env.chunks.forEach(function (c) { s.chunks.push(c) })
  }
  return s
}

function chunkIsOp (chunk, opcodenum) {
  return chunk && chunk.opcodenum === opcodenum && (chunk.buf == null)
}

/** Split a pinned payBlob back into its constituent Transaction.Outputs. */
function splitPayBlob (blob) {
  var br = new BufferReader(blob)
  var outs = []
  while (!br.eof()) outs.push(bsv.Transaction.Output.fromBufferReader(br))
  return outs
}

/**
 * Parse an OrdLock listing script into its economic terms. Returns null if `script`
 * is not a recognizable OrdLock (so it doubles as a detector).
 *
 * @param {Script|Buffer|string} script
 * @param {object} [opts]  { network }  network for the returned address strings
 *   ('livenet' | 'testnet' | a bsv.Networks.Network); defaults to livenet. The
 *   pubKeyHash / output scripts are network-agnostic and always exact.
 * @returns {null|{
 *   seller: { pubKeyHash: Buffer, address: string },
 *   payOutputs: Array<{ satoshis: number, script: Script, address: string|null }>,
 *   payBlob: Buffer,
 *   totalPrice: number,
 *   inscription: null|{ contentType: string, content: Buffer, contentText: string }
 * }}
 */
function parseOrdLock (script, opts) {
  var network = opts && opts.network
  try {
    var s = coerceScript(script)
    var chunks = s.chunks
    // Locate the top-level OP_IF … OP_ELSE … OP_ENDIF of the covenant.
    var depth = 0
    var ifIdx = -1
    var elseIdx = -1
    var endIdx = -1
    for (var i = 0; i < chunks.length; i++) {
      if (chunkIsOp(chunks[i], Opcode.OP_IF)) { if (depth === 0) ifIdx = i; depth++ } else if (chunkIsOp(chunks[i], Opcode.OP_ELSE) && depth === 1) { elseIdx = i } else if (chunkIsOp(chunks[i], Opcode.OP_ENDIF)) { depth--; if (depth === 0) { endIdx = i; break } }
    }
    if (ifIdx === -1 || elseIdx === -1 || endIdx === -1) return null

    // sellerPKH: the sole 20-byte push in the CANCEL branch (after OP_HASH160).
    var sellerPKH = null
    for (var c = ifIdx + 1; c < elseIdx; c++) {
      if (chunks[c].buf && chunks[c].buf.length === 20) { sellerPKH = chunks[c].buf; break }
    }
    if (!sellerPKH) return null

    // payBlob: the constant pushed after the LAST OP_TOALTSTACK in the PURCHASE branch
    // (an earlier OP_TOALTSTACK inside pushTxCore parks the pubkey; ours parks the
    // committed hashOutputs and is immediately followed by the payBlob push, then
    // OP_CAT OP_SWAP OP_CAT OP_HASH256).
    var payBlob = null
    for (var d = elseIdx + 1; d < endIdx; d++) {
      if (chunkIsOp(chunks[d], Opcode.OP_TOALTSTACK) &&
          chunks[d + 1] && chunks[d + 1].buf &&
          chunkIsOp(chunks[d + 2], Opcode.OP_CAT) &&
          chunkIsOp(chunks[d + 3], Opcode.OP_SWAP)) {
        payBlob = chunks[d + 1].buf // keep scanning is unnecessary — this tail is unique
      }
    }
    if (!payBlob) return null

    var payOutputs = splitPayBlob(payBlob).map(function (o) {
      var addr = null
      try { if (o.script.isPublicKeyHashOut()) addr = o.script.toAddress(network).toString() } catch (e) {}
      return { satoshis: o.satoshis, script: o.script, address: addr }
    })
    var totalPrice = payOutputs.reduce(function (a, o) { return a + o.satoshis }, 0)

    var insc = null
    var parsedInsc = inscription.parseInscription(s)
    if (parsedInsc) {
      insc = { contentType: parsedInsc.contentType, content: parsedInsc.content, contentText: parsedInsc.contentText }
    }

    return {
      seller: { pubKeyHash: sellerPKH, address: bsv.Address.fromPublicKeyHash(sellerPKH, network).toString() },
      payOutputs: payOutputs,
      payBlob: payBlob,
      totalPrice: totalPrice,
      inscription: insc
    }
  } catch (e) {
    return null
  }
}

/** True if `script` is a recognizable OrdLock listing. */
function isOrdLock (script, opts) { return parseOrdLock(script, opts) !== null }

/**
 * Build the 1-sat Transaction.Output that lists an ordinal for sale under an OrdLock.
 * @returns {Transaction.Output}
 */
function listInscriptionOutput (params) {
  params = params || {}
  var satoshis = params.satoshis != null ? params.satoshis : 1
  return new bsv.Transaction.Output({ script: buildOrdLock(params), satoshis: satoshis })
}

/**
 * Build the unlocking script that PURCHASES a listed ordinal.
 *
 * The caller must first build `spend` with the ordinal's OrdLock input at
 * `inputIndex`, and its OUTPUTS arranged as:
 *     [ ...buyerOutputs, <pinned payment output(s)>, ...trailingOutputs ]
 * where the pinned block (starting at `payoutIndex`, `payoutCount` outputs long) is the
 * required payment(s) recreated EXACTLY as the listing pinned them. `payoutCount` is
 * auto-derived from the listing script when omitted. Everything before the block
 * (typically the 1-sat ordinal sent to the buyer) and everything after it (change, data)
 * is unconstrained by the covenant.
 *
 * IMPORTANT ORDERING: this grinds the spend's nLockTime to a valid OP_PUSH_TX
 * signature, which changes the sighash of EVERY input. Call `purchase()` BEFORE
 * signing any funding inputs the buyer adds.
 *
 * @param {object} params
 * @param {Transaction} params.spend         the spend tx (outputs already set).
 * @param {Script}      params.lockingScript the OrdLock script being spent.
 * @param {number}      [params.satoshis=1]  satoshis on the listing UTXO.
 * @param {number}      [params.inputIndex=0] the OrdLock input's index.
 * @param {number}      [params.payoutIndex=1] index of the first pinned payment output.
 * @param {number}      [params.payoutCount]  number of pinned outputs (auto-derived if omitted).
 * @param {boolean}     [params.validate=true] assert the pinned block matches the listing.
 * @param {object}      [params.grind]        options forwarded to PushTx.grind.
 * @returns {Script} the unlocking script (also assigned onto the input).
 */
function purchase (params) {
  params = params || {}
  var spend = params.spend
  var lockingScript = params.lockingScript
  if (!spend || !lockingScript) throw new Error('purchase requires { spend, lockingScript }')
  var inputIndex = params.inputIndex || 0
  var payoutIndex = params.payoutIndex != null ? params.payoutIndex : 1
  var satoshis = params.satoshis != null ? params.satoshis : 1
  var outs = spend.outputs || []

  // Reuse a caller-supplied parse of the SAME lockingScript when given (avoids re-parsing).
  var parsed = params.parsed || parseOrdLock(lockingScript)
  var payoutCount = params.payoutCount != null ? params.payoutCount
    : (parsed ? parsed.payOutputs.length : 1)
  if (payoutIndex + payoutCount > outs.length) {
    throw new Error('purchase: spend has fewer outputs than the pinned block requires ' +
      '(need ' + (payoutIndex + payoutCount) + ', have ' + outs.length + ')')
  }

  // Fail-fast: the pinned block must recreate the listing's required payment(s) exactly.
  if (params.validate !== false && parsed) {
    var pinned = Buffer.concat(outs.slice(payoutIndex, payoutIndex + payoutCount).map(serializeOutput))
    if (!pinned.equals(parsed.payBlob)) {
      throw new Error('purchase: outputs [' + payoutIndex + '..' + (payoutIndex + payoutCount - 1) +
        '] do not match the listing payment — the seller (or a royalty/fee payee) would not be paid')
    }
  }

  var buyerOuts = Buffer.concat(outs.slice(0, payoutIndex).map(serializeOutput))
  var trailing = Buffer.concat(outs.slice(payoutIndex + payoutCount).map(serializeOutput))

  var grindOpts = Object.assign({ sighashType: ORDLOCK_SIGHASH }, params.grind || {})
  var g = P.grind(spend, inputIndex, lockingScript, satoshis, grindOpts)

  var us = new Script()
  pushData(us, trailing)
  pushData(us, buyerOuts)
  us.add(Buffer.from(g.preimage))
  us.add(Opcode.OP_FALSE) // select the OP_ELSE (purchase) branch
  spend.inputs[inputIndex].setScript(us)
  return us
}

/**
 * Build the unlocking script that CANCELS a listing (seller reclaims the ordinal).
 * The seller signs the spend over the OrdLock locking script with their own key.
 *
 * @param {object} params
 * @param {PrivateKey} params.privateKey     the seller's key (must hash to sellerPKH).
 * @param {Transaction} params.spend         the reclaim tx (outputs already set).
 * @param {Script}      params.lockingScript the OrdLock script being spent.
 * @param {number}      [params.satoshis=1]  satoshis on the listing UTXO.
 * @param {number}      [params.inputIndex=0] the OrdLock input's index.
 * @param {number}      [params.sighashType] signature flag (default SIGHASH_ALL|FORKID).
 * @returns {Script} the unlocking script (also assigned onto the input).
 */
function cancel (params) {
  params = params || {}
  var privateKey = params.privateKey
  var spend = params.spend
  var lockingScript = params.lockingScript
  if (!privateKey || !spend || !lockingScript) {
    throw new Error('cancel requires { privateKey, spend, lockingScript }')
  }
  var inputIndex = params.inputIndex || 0
  var satoshis = params.satoshis != null ? params.satoshis : 1
  var sighashType = params.sighashType != null ? params.sighashType : H.SIGHASH

  var sig = H.signInput(spend, privateKey, inputIndex, lockingScript, satoshis, sighashType)
  var us = new Script()
  us.add(Buffer.from(sig))
  us.add(privateKey.toPublicKey().toBuffer())
  us.add(Opcode.OP_TRUE) // select the OP_IF (cancel) branch
  spend.inputs[inputIndex].setScript(us)
  return us
}

/** Add an input spending `outpoint` under `script` worth `satoshis`, script-sig empty. */
function addSpendInput (tx, outpoint, script, satoshis) {
  tx.addInput(new bsv.Transaction.Input({
    prevTxId: outpoint.txid || outpoint.prevTxId,
    outputIndex: outpoint.outputIndex != null ? outpoint.outputIndex : outpoint.vout,
    script: Script.empty()
  }), coerceScript(script), satoshis)
}

/** Sign input `idx` as P2PKH with `coin.privateKey` over the finalized tx (ALL|FORKID). */
function signP2PKHInput (tx, idx, coin) {
  // The satoshi amount is part of the BIP-143 preimage — a missing/NaN value silently
  // produces a signature over the wrong amount that fails on-chain, so require it explicitly.
  assertSats(coin.satoshis, 'input ' + idx + ' satoshis')
  var sc = coerceScript(coin.script)
  var sig = H.signInput(tx, coin.privateKey, idx, sc, coin.satoshis, P.SIGHASH_ALL_FORKID)
  var us = new Script()
  us.add(Buffer.from(sig))
  us.add(coin.privateKey.toPublicKey().toBuffer())
  tx.inputs[idx].setScript(us)
}

/**
 * Assemble a COMPLETE, signed LISTING transaction: move a 1-sat ordinal held under a
 * P2PKH (its `privateKey`) into an OrdLock listing output, paying the fee from separate
 * funding coins. The ordinal's satoshi (input 0's first sat) maps to output 0 (the
 * listing) under ordinal FIFO, so the inscribed sat is preserved into the listing.
 *
 * Accepts all the OrdLock term params of `buildOrdLock` (seller, price, royalties,
 * payOutputs, inscription) plus:
 * @param {object} params.ordinal  the ordinal UTXO: { txid|prevTxId, outputIndex|vout,
 *                                  script (P2PKH), satoshis=1, privateKey }.
 * @param {Array}  [params.funding] P2PKH fee coins: { ...outpoint, script, satoshis, privateKey }.
 * @param {number} [params.fee=500] miner fee (paid from funding).
 * @param {Address|PublicKey|string} [params.changeAddress]  change recipient
 *                                  (default: the ordinal owner's address).
 * @returns {{ tx: Transaction, listingScript: Script, listingOutpoint: {txid,outputIndex} }}
 */
function buildListingTx (params) {
  params = params || {}
  var ordinal = params.ordinal
  if (!ordinal || !ordinal.script || !ordinal.privateKey) {
    throw new Error('buildListingTx requires ordinal { script, privateKey, txid, outputIndex }')
  }
  var ordSats = assertSats(ordinal.satoshis != null ? ordinal.satoshis : 1, 'ordinal satoshis')
  var lock = buildOrdLock(params)

  var funding = params.funding || []
  var fee = params.fee != null ? params.fee : 500
  var fundingTotal = funding.reduce(function (a, f) { return a + assertSats(f.satoshis, 'funding satoshis') }, 0)
  var change = fundingTotal - fee
  if (change < 0) {
    throw new Error('buildListingTx: insufficient funding — need ' + fee + ' sat fee, funded ' + fundingTotal)
  }

  var tx = new bsv.Transaction()
  addSpendInput(tx, ordinal, ordinal.script, ordSats) // input 0 = the ordinal (P2PKH)
  funding.forEach(function (f) { addSpendInput(tx, f, f.script, f.satoshis) })

  tx.addOutput(new bsv.Transaction.Output({ script: lock, satoshis: ordSats })) // output 0 = listing
  if (change > 0) {
    tx.addOutput(payOutputFor(params.changeAddress || ordinal.privateKey.toAddress(), change))
  }

  // Sign the ordinal input with the RESOLVED value (ordSats), not the raw (maybe-omitted)
  // ordinal.satoshis — else the signature commits to the wrong amount and fails on-chain.
  signP2PKHInput(tx, 0, { script: ordinal.script, privateKey: ordinal.privateKey, satoshis: ordSats })
  funding.forEach(function (f, i) { signP2PKHInput(tx, 1 + i, f) })

  return { tx: tx, listingScript: lock, listingOutpoint: { txid: tx.hash, outputIndex: 0 } }
}

/**
 * Assemble a COMPLETE, signed purchase transaction from a listing UTXO and the buyer's
 * P2PKH funding coins. The required payment(s) are read straight off the listing script
 * (or overridden via `payOutputs`), so the buyer needs only the listing outpoint.
 *
 * Output layout: [ ordinal -> buyer, <pinned payment output(s)>, change -> buyer ].
 * The ordinal's satoshi (input 0's first sat) maps to output 0 under ordinal FIFO, so it
 * lands with the buyer; every pinned payee is paid; the fee comes from the funding coins.
 *
 * @param {object} params
 * @param {object} params.listing   { txid|prevTxId, outputIndex|vout, script, satoshis=1 }.
 * @param {Address|PublicKey|string} params.ordinalDestination  where the ordinal goes.
 * @param {Array} params.funding    buyer coins: { txid|prevTxId, outputIndex|vout, script,
 *                                   satoshis, privateKey } (P2PKH).
 * @param {Array} [params.payOutputs] override the pinned payment(s) (must still match the
 *                                   listing byte-for-byte, else the covenant rejects).
 * @param {number} [params.fee=500] miner fee in satoshis (paid from funding).
 * @param {Address|PublicKey|string} [params.changeAddress]  change recipient
 *                                   (default: ordinalDestination). Change omitted if zero.
 * @param {object} [params.grind]   options forwarded to PushTx.grind.
 * @returns {Transaction} the fully-built, signed purchase transaction.
 */
function buildPurchaseTx (params) {
  params = params || {}
  var listing = params.listing
  if (!listing || !listing.script) throw new Error('buildPurchaseTx requires listing.script')
  if (!params.ordinalDestination) throw new Error('buildPurchaseTx requires ordinalDestination')
  if (!params.funding || !params.funding.length) throw new Error('buildPurchaseTx requires funding coins')

  var lockingScript = coerceScript(listing.script)
  var parsed = parseOrdLock(lockingScript)
  if (!parsed) throw new Error('buildPurchaseTx: listing.script is not a parseable OrdLock')
  var ordSats = assertSats(listing.satoshis != null ? listing.satoshis : 1, 'listing satoshis')

  var payOuts = params.payOutputs
    ? params.payOutputs.map(outputFromSpec)
    : parsed.payOutputs.map(function (p) {
      return new bsv.Transaction.Output({ script: p.script, satoshis: p.satoshis })
    })
  var paidTotal = payOuts.reduce(function (a, o) { return a + o.satoshis }, 0)

  var fee = params.fee != null ? params.fee : 500
  var fundingTotal = params.funding.reduce(function (a, f) { return a + assertSats(f.satoshis, 'funding satoshis') }, 0)
  var change = fundingTotal - paidTotal - fee
  if (change < 0) {
    throw new Error('buildPurchaseTx: insufficient funding — need ' + (paidTotal + fee) +
      ' sat (payments ' + paidTotal + ' + fee ' + fee + '), funded ' + fundingTotal)
  }

  var tx = new bsv.Transaction()
  addSpendInput(tx, listing, lockingScript, ordSats) // input 0 = the listing (covenant)
  params.funding.forEach(function (f) { addSpendInput(tx, f, f.script, f.satoshis) })

  tx.addOutput(payOutputFor(params.ordinalDestination, ordSats)) // output 0 = ordinal -> buyer
  payOuts.forEach(function (o) { tx.addOutput(o) }) // pinned payment(s)
  if (change > 0) {
    tx.addOutput(payOutputFor(params.changeAddress || params.ordinalDestination, change))
  }

  // Grind + covenant unlock on input 0 (fixes nLockTime for ALL inputs).
  purchase({
    spend: tx,
    lockingScript: lockingScript,
    parsed: parsed, // reuse the parse above — don't re-parse inside purchase()
    satoshis: ordSats,
    inputIndex: 0,
    payoutIndex: 1,
    payoutCount: payOuts.length,
    grind: params.grind
  })

  // Now sign the P2PKH funding inputs over the finalized transaction.
  params.funding.forEach(function (f, i) { signP2PKHInput(tx, 1 + i, f) })

  return tx
}

module.exports = {
  ORDLOCK_SIGHASH: ORDLOCK_SIGHASH,
  buildOrdLock: buildOrdLock,
  parseOrdLock: parseOrdLock,
  isOrdLock: isOrdLock,
  listInscriptionOutput: listInscriptionOutput,
  payOutputFor: payOutputFor,
  purchase: purchase,
  cancel: cancel,
  buildListingTx: buildListingTx,
  buildPurchaseTx: buildPurchaseTx
}
