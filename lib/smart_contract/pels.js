'use strict'
/**
 * SmartContract.PELS — a Perpetually Enforcing Locking Script (nChain WP1605).
 *
 * A covenant that forces every spend to recreate itself: the single output must
 * pay (inputValue - fee) back into the SAME locking script. Coins never leave
 * the covenant — they flow forward through identical UTXOs, shrinking by the fee.
 *
 * It avoids self-hash circularity by reading its own script out of the
 * authenticated BIP-143 preimage's `scriptCode` field. With layout
 *   version(4) hashPrevouts(32) hashSequence(32) outpoint(36) = 104
 *   scriptCode(varint||script)
 *   value(8) nSequence(4) hashOutputs(32) nLockTime(4) sighash(4) = 52 (tail)
 * the slice preimage[104 : len-52] is exactly the `scriptlen||script` half of a
 * TxOut, so the next output is `<newValue:8-LE> || preimage[104:len-52]`.
 *
 * Requires post-Genesis limits (SmartContract.enableGenesis()).
 */

var bsv = require('../..')
var P = require('./pushtx')
var H = require('./covenant_helpers')

var Script = bsv.Script
var Opcode = bsv.Opcode
var n = H.scriptNum

/**
 * @param {number} fee satoshis deducted at each hop.
 * @returns {Script} the perpetual locking script.
 */
function pelsCovenant (fee) {
  var s = new Script()

  // 1. authenticate the pushed preimage
  s.add(Opcode.OP_DUP)
  P.pushTxCore(s)
  s.add(Opcode.OP_VERIFY) // stack: [preimage]
  P.assertSighashAll(s) // fail fast unless this spend is SIGHASH_ALL|FORKID (0x41)

  // 2. scriptChunk = preimage[104 : len-52]
  s.add(Opcode.OP_DUP)
  s.add(n(104)).add(Opcode.OP_SPLIT).add(Opcode.OP_NIP)
  s.add(Opcode.OP_SIZE).add(n(52)).add(Opcode.OP_SUB).add(Opcode.OP_SPLIT).add(Opcode.OP_DROP)

  // 3. value (8B @ offsetFromEnd 52); newValue = value - fee, as 8-byte LE
  s.add(Opcode.OP_OVER)
  s.add(n(52)).add(Opcode.OP_RIGHT).add(n(8)).add(Opcode.OP_LEFT) // last 52 bytes, first 8 = value
  s.add(Opcode.OP_BIN2NUM).add(n(fee)).add(Opcode.OP_SUB)
  s.add(n(8)).add(Opcode.OP_NUM2BIN)

  // 4. nextOutput = newValue8 || scriptChunk ; require HASH256(it) == hashOutputs
  s.add(Opcode.OP_SWAP).add(Opcode.OP_CAT)
  s.add(Opcode.OP_HASH256)
  s.add(Opcode.OP_SWAP)
  P.extractHashOutputs(s)
  s.add(Opcode.OP_EQUAL)

  return s
}

module.exports = { pelsCovenant: pelsCovenant }
