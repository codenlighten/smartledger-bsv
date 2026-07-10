'use strict'
/**
 * OrdLock — a trustless "list an ordinal for sale" covenant for 1Sat Ordinals.
 *
 * A seller locks the 1-sat ordinal UTXO behind a script with two spend paths:
 *
 *   PURCHASE  anyone may take the ordinal, but ONLY by paying the seller. The buyer
 *             builds the spend, the covenant authenticates its BIP-143 preimage with
 *             OP_PUSH_TX and requires that the transaction's outputs are exactly
 *             `buyerOutputs || payOutput || trailingOutputs` — where `payOutput`
 *             (the seller's payment) is hard-baked into the locking script. The buyer
 *             is free to choose where the ordinal goes and to add funding inputs /
 *             change (SIGHASH_ALL|ANYONECANPAY): the ONE thing they cannot do is take
 *             the ordinal without recreating the seller's payment output byte-for-byte.
 *
 *   CANCEL    the seller reclaims the listing at any time with an ordinary ECDSA
 *             signature over their own public key (a P2PKH gate inside the covenant).
 *
 * This is the widely-deployed 1Sat Ordinals OrdinalLock pattern, built on the audited
 * configurable-SIGHASH OP_PUSH_TX core (SmartContract.PushTx). Every script this
 * module emits is exercised through the consensus interpreter in the test-suite.
 *
 * Layout (locking script):
 *   OP_IF
 *     <sellerPKH> ...        // CANCEL: OP_DUP OP_HASH160 <pkh> OP_EQUALVERIFY OP_CHECKSIG
 *   OP_ELSE
 *     ...OP_PUSH_TX core...  // PURCHASE: authenticate preimage, bind outputs to payOutput
 *   OP_ENDIF
 *
 * Requires post-Genesis limits: call SmartContract.enableGenesis() before verifying.
 */
var bsv = require('../..')
var P = require('../smart_contract/pushtx')
var H = require('../smart_contract/covenant_helpers')
var inscription = require('./inscription')

var Script = bsv.Script
var Opcode = bsv.Opcode

// OrdLock commits to the FULL output set (so payOutput can be pinned) but leaves the
// input set open for the buyer's funding — SIGHASH_ALL|ANYONECANPAY|FORKID (0xc1).
var ORDLOCK_SIGHASH = P.SIGHASH_ALL_ANYONECANPAY_FORKID

/** Push a possibly-empty buffer MINIMALDATA-cleanly (empty => OP_0, i.e. empty vector). */
function pushData (s, buf) { return (buf && buf.length) ? s.add(Buffer.from(buf)) : s.add(Opcode.OP_0) }

/** Serialize a Transaction.Output to its on-wire bytes (8-byte value || varint || script). */
function serializeOutput (out) { return out.toBufferWriter().toBuffer() }

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

/** Build the seller's payment Output (P2PKH) from an address/pubkey/key and a price in sats. */
function payOutputFor (payTo, price) {
  if (payTo instanceof bsv.Transaction.Output) return payTo
  return new bsv.Transaction.Output({
    script: Script.buildPublicKeyHashOut(toAddress(payTo)), satoshis: price
  })
}

/**
 * Build an OrdLock listing (locking) script.
 *
 * @param {object} params
 * @param {Address|PublicKey|string|Buffer} params.seller  who may CANCEL the listing
 *   (an address, public key, or 20-byte HASH160). Also the default payment recipient.
 * @param {number} [params.price]        asking price in satoshis (required unless
 *                                        `payOutput`/`payTo`+price fully specify it).
 * @param {Address|PublicKey|string|Transaction.Output} [params.payTo]  who receives
 *   the payment (default: `seller`). Ignored if `payOutput` is given.
 * @param {Transaction.Output|Buffer} [params.payOutput]  the exact payment output to
 *   pin, overriding price/payTo (advanced: e.g. a non-P2PKH payment script).
 * @param {object} [params.inscription]  if given, an inscription envelope
 *   ({contentType, content}) is appended so a fresh inscribe+list share one output.
 * @returns {Script} the OrdLock locking script.
 */
function buildOrdLock (params) {
  params = params || {}
  if (params.seller == null) throw new Error('buildOrdLock requires a seller')
  var sellerPKH = resolvePubKeyHash(params.seller)

  var payOut
  if (params.payOutput != null) {
    payOut = Buffer.isBuffer(params.payOutput) ? params.payOutput : serializeOutput(params.payOutput)
  } else {
    if (params.price == null) throw new Error('buildOrdLock requires a price (or an explicit payOutput)')
    payOut = serializeOutput(payOutputFor(params.payTo != null ? params.payTo : params.seller, params.price))
  }

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
  s.add(Buffer.from(payOut)).add(Opcode.OP_CAT) // buyerOuts || payOutput
  s.add(Opcode.OP_SWAP).add(Opcode.OP_CAT) // (buyerOuts || payOutput) || trailing
  s.add(Opcode.OP_HASH256)
  s.add(Opcode.OP_FROMALTSTACK).add(Opcode.OP_EQUAL) // == committed hashOutputs ?
  s.add(Opcode.OP_ENDIF)

  if (params.inscription) {
    var env = inscription.buildInscription({
      lock: new Script(), // envelope only; the covenant above is the real lock
      contentType: params.inscription.contentType,
      content: params.inscription.content
    })
    env.chunks.forEach(function (c) { s.chunks.push(c) })
  }
  return s
}

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
 *     [ ...buyerOutputs, payOutput, ...trailingOutputs ]
 * where the output at `payoutIndex` is the seller's payment recreated EXACTLY as the
 * listing pinned it. Everything before it (typically the 1-sat ordinal sent to the
 * buyer) and everything after it (change, data) is unconstrained by the covenant.
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
 * @param {number}      [params.payoutIndex=1] index of the pinned payment output.
 * @param {Buffer|Transaction.Output} [params.payOutput] if given, asserts the spend's
 *   output at `payoutIndex` matches it byte-for-byte (fail-fast before broadcast).
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
  if (payoutIndex >= outs.length) {
    throw new Error('purchase: spend has no output at payoutIndex ' + payoutIndex)
  }

  // Optional fail-fast: the pinned output must be recreated exactly.
  if (params.payOutput != null) {
    var want = Buffer.isBuffer(params.payOutput) ? params.payOutput : serializeOutput(params.payOutput)
    if (!serializeOutput(outs[payoutIndex]).equals(want)) {
      throw new Error('purchase: output at payoutIndex ' + payoutIndex +
        ' does not match the listing payOutput — the seller would not be paid')
    }
  }

  var buyerOuts = Buffer.concat(outs.slice(0, payoutIndex).map(serializeOutput))
  var trailing = Buffer.concat(outs.slice(payoutIndex + 1).map(serializeOutput))

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

module.exports = {
  ORDLOCK_SIGHASH: ORDLOCK_SIGHASH,
  buildOrdLock: buildOrdLock,
  listInscriptionOutput: listInscriptionOutput,
  payOutputFor: payOutputFor,
  purchase: purchase,
  cancel: cancel
}
