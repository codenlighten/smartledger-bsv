'use strict'
/**
 * SmartContract covenant helpers
 * ==============================
 *
 * Shared utilities for building and verifying custom locking scripts &
 * OP_PUSH_TX covenants: a consensus-flag verify() harness, raw BIP-143 preimage
 * access, signing, and fund/spend scaffolding. Used by ./pushtx, ./pels, ./token
 * and ./locks.
 */

var bsv = require('../..')
var BN = require('../crypto/bn')
var Hash = require('../crypto/hash')
var Signature = require('../crypto/signature')

// SIGHASH_ALL | SIGHASH_FORKID — the BSV default these covenants are built for.
var SIGHASH = Signature.SIGHASH_ALL | Signature.SIGHASH_FORKID // 0x41

// Post-Genesis consensus flags (big numbers, OP_CAT/OP_SPLIT/OP_MUL, FORKID,
// CLTV/CSV). LOW_S is enforced: the OP_PUSH_TX grind produces a canonical
// (low-S) in-script signature, so these covenants meet mainnet standardness.
function flags () {
  var I = bsv.Script.Interpreter
  return I.SCRIPT_VERIFY_P2SH |
    I.SCRIPT_VERIFY_STRICTENC |
    I.SCRIPT_VERIFY_DERSIG |
    I.SCRIPT_VERIFY_LOW_S |
    I.SCRIPT_VERIFY_CHECKLOCKTIMEVERIFY |
    I.SCRIPT_VERIFY_CHECKSEQUENCEVERIFY |
    I.SCRIPT_ENABLE_SIGHASH_FORKID |
    I.SCRIPT_ENABLE_MAGNETIC_OPCODES |
    I.SCRIPT_ENABLE_MONOLITH_OPCODES
}

/**
 * Opt into post-Genesis script limits (needed by OP_PUSH_TX covenants).
 * Thin wrapper over Interpreter.useGenesisLimits (added in 4.1.0).
 */
function enableGenesis (max) {
  return bsv.Script.Interpreter.useGenesisLimits(max)
}

/**
 * Verify an unlocking script against a locking script through the consensus
 * interpreter. @returns {{ok:boolean, err:string}}
 */
function verify (unlockingScript, lockingScript, opts) {
  opts = opts || {}
  var interp = new bsv.Script.Interpreter()
  var ok = interp.verify(
    unlockingScript,
    lockingScript,
    opts.tx || new bsv.Transaction(),
    opts.inputIndex || 0,
    opts.flags || flags(),
    new BN(opts.satoshis || 0)
  )
  return { ok: ok, err: interp.errstr || '' }
}

/** Raw BIP-143 preimage (the serialization that is double-SHA256'd), not the digest. */
function rawPreimage (tx, inputIndex, lockingScript, satoshis, sighashType) {
  return bsv.Transaction.sighash.sighashPreimage(
    tx, sighashType || SIGHASH, inputIndex, lockingScript, new BN(satoshis))
}

/** Sighash digest = HASH256(rawPreimage) — useful for asserting OP_PUSH_TX linkage in JS. */
function sighashDigest (tx, inputIndex, lockingScript, satoshis, sighashType) {
  return Hash.sha256sha256(rawPreimage(tx, inputIndex, lockingScript, satoshis, sighashType))
}

/** DER+sighash-byte signature over `lockingScript` for `inputIndex`. */
function signInput (tx, privateKey, inputIndex, lockingScript, satoshis, sighashType) {
  sighashType = sighashType || SIGHASH
  var sig = bsv.Transaction.sighash.sign(tx, privateKey, sighashType, inputIndex, lockingScript, new BN(satoshis))
  return Buffer.concat([sig.toDER(), Buffer.from([sighashType])])
}

/**
 * Build a funding tx paying `satoshis` into `lockingScript`, plus a spending tx
 * consuming it with the supplied outputs. Returns { funding, spend }; the caller
 * sets spend.inputs[0] script.
 */
function fundAndSpend (lockingScript, satoshis, opts) {
  opts = opts || {}
  var funding = new bsv.Transaction().addOutput(
    new bsv.Transaction.Output({ script: lockingScript, satoshis: satoshis }))
  var spend = new bsv.Transaction()
  spend.addInput(
    new bsv.Transaction.Input({ prevTxId: funding.hash, outputIndex: 0, script: bsv.Script.empty() }),
    lockingScript, satoshis)
  if (opts.outputs) opts.outputs.forEach(function (o) { spend.addOutput(o) })
  return { funding: funding, spend: spend }
}

/** A P2PKH Output object for an address or public key. */
function p2pkhOutput (addressOrPubKey, satoshis) {
  var addr = addressOrPubKey.toAddress ? addressOrPubKey.toAddress() : addressOrPubKey
  return new bsv.Transaction.Output({ script: bsv.Script.buildPublicKeyHashOut(addr), satoshis: satoshis })
}

/** Minimal little-endian script-number Buffer (push as data to put a number on-stack). */
function scriptNum (n) {
  return new BN(n).toScriptNumBuffer()
}

module.exports = {
  SIGHASH: SIGHASH,
  flags: flags,
  enableGenesis: enableGenesis,
  verify: verify,
  rawPreimage: rawPreimage,
  sighashDigest: sighashDigest,
  signInput: signInput,
  fundAndSpend: fundAndSpend,
  p2pkhOutput: p2pkhOutput,
  scriptNum: scriptNum
}
