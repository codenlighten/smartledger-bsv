'use strict'
/**
 * SmartContract.PushTx — a correct, interpreter-verified OP_PUSH_TX (nChain
 * WP1605) for Bitcoin SV.
 *
 * The locking script GENERATES an ECDSA signature in-script from a preimage the
 * spender pushed, then OP_CHECKSIG verifies it against a fixed public key.
 * OP_CHECKSIG only passes if the message it derives internally (the genuine
 * BIP-143 sighash of THIS spend) equals HASH256(preimage) — so a passing check
 * proves the pushed preimage IS this transaction, letting a script read and
 * constrain its own spending transaction.
 *
 * Optimal parameters: private key a = 1, ephemeral k = 1  =>  r = Gx,
 *   s = (e + Gx) mod n,  pubkey P = 02||Gx,  e = HASH256(preimage).
 *
 * Requires post-Genesis limits — call SmartContract.enableGenesis() (a.k.a
 * Interpreter.useGenesisLimits()) before verifying these scripts.
 */

var bsv = require('../..')
var BN = require('../crypto/bn')
var Hash = require('../crypto/hash')
var H = require('./covenant_helpers')

var Script = bsv.Script
var Opcode = bsv.Opcode
var SIGHASH = H.SIGHASH
var scriptNum = H.scriptNum

// secp256k1 constants (big-endian)
var Gx = Buffer.from('79be667ef9dcbbac55a06295ce870b07029bfcdb2dce28d959f2815b16f81798', 'hex')
var N = new BN('fffffffffffffffffffffffffffffffebaaedce6af48a03bbfd25e8cd0364141', 16)
var PUBKEY = Buffer.concat([Buffer.from([0x02]), Gx]) // compressed P = G (y even)

// script-number (little-endian) forms
var gxLe = Buffer.from(Gx).reverse() // 32B, top 0x79 => positive
var N_LE = Buffer.concat([Buffer.from(N.toBuffer()).reverse(), Buffer.from([0x00])]) // 33B positive

// fixed DER prefix: SEQUENCE(0x44) INTEGER(0x20) r=Gx INTEGER(0x20)
var DER_PREFIX = Buffer.concat([Buffer.from([0x30, 0x44, 0x02, 0x20]), Gx, Buffer.from([0x02, 0x20])])
var SIGHASH_BYTE = Buffer.from([SIGHASH]) // 0x41

/** Reverse a fixed n-byte buffer on top of the stack (big-endian <-> little-endian). */
function reverseBytes (script, n) {
  var i
  for (i = 0; i < n - 1; i++) script.add(Opcode.OP_1).add(Opcode.OP_SPLIT)
  for (i = 0; i < n - 1; i++) script.add(Opcode.OP_SWAP).add(Opcode.OP_CAT)
  return script
}

/**
 * Append the in-script signature generator + verifier ("PUSH_TX core").
 * Pre:  top of stack = preimage. Post: top = OP_CHECKSIG result.
 */
function pushTxCore (script) {
  script.add(Opcode.OP_HASH256) // z = HASH256(preimage), 32B BE
  reverseBytes(script, 32) // -> little-endian
  script.add(Buffer.from([0x00])).add(Opcode.OP_CAT).add(Opcode.OP_BIN2NUM) // e (positive)
  script.add(gxLe).add(Opcode.OP_ADD) // e + Gx
  script.add(N_LE).add(Opcode.OP_MOD) // s = (e + Gx) mod n
  script.add(scriptNum(32)).add(Opcode.OP_NUM2BIN) // s -> 32-byte LE
  reverseBytes(script, 32) // -> big-endian (DER INTEGER body)
  script.add(DER_PREFIX).add(Opcode.OP_SWAP).add(Opcode.OP_CAT) // PREFIX || s
  script.add(SIGHASH_BYTE).add(Opcode.OP_CAT) // || sighash flag => full DER sig
  script.add(PUBKEY).add(Opcode.OP_CHECKSIG) // verify against P = G
  return script
}

/** Bare authenticator script: unlock with the (grindable) preimage. */
function authenticator () {
  return pushTxCore(new Script())
}

/** Extract the committed hashOutputs (item 9, offsetFromEnd 40, len 32) from a preimage on-stack. */
function extractHashOutputs (script) {
  script.add(Opcode.OP_SIZE).add(scriptNum(40)).add(Opcode.OP_SUB)
    .add(Opcode.OP_SPLIT).add(Opcode.OP_NIP)
    .add(scriptNum(32)).add(Opcode.OP_SPLIT).add(Opcode.OP_DROP)
  return script
}

/** BIP-143 hashOutputs (SIGHASH_ALL) for a set of Transaction.Output objects. */
function hashOutputs (outputs) {
  var ser = Buffer.concat(outputs.map(function (o) { return o.toBufferWriter().toBuffer() }))
  return Hash.sha256sha256(ser)
}

/**
 * Value/output covenant: the spend is valid only if its outputs hash to
 * `expectedHashOutputs` — coins can only go where the covenant says.
 */
function valueCovenant (expectedHashOutputs) {
  var script = new Script().add(Opcode.OP_DUP)
  pushTxCore(script)
  script.add(Opcode.OP_VERIFY)
  extractHashOutputs(script)
  script.add(Buffer.from(expectedHashOutputs)).add(Opcode.OP_EQUAL)
  return script
}

/** Compute s = (HASH256(preimage)+Gx) mod n; return its 32-byte BE form, or null if not a clean DER template. */
function sFromPreimage (preimage) {
  var z = Hash.sha256sha256(preimage)
  var s = new BN(z).add(new BN(Gx)).mod(N)
  var sBE = s.toBuffer('be', 32)
  return (sBE[0] >= 0x01 && sBE[0] <= 0x7f) ? sBE : null
}

/**
 * Grind the spend tx (vary nLockTime) until the in-script signature is a clean
 * fixed-length DER. Mutates spend.nLockTime; returns { preimage, tries }.
 */
function grind (spend, inputIndex, lockingScript, satoshis, maxTries) {
  maxTries = maxTries || 5000
  for (var t = 0; t < maxTries; t++) {
    spend.nLockTime = t
    var preimage = H.rawPreimage(spend, inputIndex, lockingScript, satoshis)
    if (sFromPreimage(preimage)) return { preimage: preimage, tries: t + 1 }
  }
  throw new Error('OP_PUSH_TX grind failed after ' + maxTries + ' tries')
}

module.exports = {
  Gx: Gx,
  N: N,
  PUBKEY: PUBKEY,
  gxLe: gxLe,
  N_LE: N_LE,
  DER_PREFIX: DER_PREFIX,
  reverseBytes: reverseBytes,
  pushTxCore: pushTxCore,
  authenticator: authenticator,
  extractHashOutputs: extractHashOutputs,
  hashOutputs: hashOutputs,
  valueCovenant: valueCovenant,
  sFromPreimage: sFromPreimage,
  grind: grind
}
