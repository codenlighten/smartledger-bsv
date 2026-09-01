'use strict'
/**
 * SmartContract.policy — a declarative covenant DSL.
 *
 * Describe a spending POLICY and compile it to a verified OP_PUSH_TX locking
 * script, no hand-written opcodes:
 *
 *   var c = bsv.SmartContract.policy()
 *     .payTo(aliceAddr, 9500)        // the spend MUST create this output...
 *     .lockUntil(800000)             // ...with nLockTime >= 800000
 *     .compile()
 *   // c.lock      -> locking Script
 *   // c.outputs   -> the required Transaction.Output[]
 *   // c.unlock(spendTx, satoshis) -> grinds + returns the preimage unlock Script
 *
 * Each clause compiles to one preimage-field check on top of a single OP_PUSH_TX
 * authentication; clauses AND together. Verifies under mainnet consensus flags with
 * no opt-in (8.4.0+).
 */

var PushTx = require('../covenant/pushtx')
var PELS = require('./pels')
var Token = require('./token')
var helpers = require('../covenant/helpers')

var Script = require('../script')
var Opcode = require('../opcode')
var Transaction = require('../transaction')
var n = helpers.scriptNum

// Consensus constants, named so the compiled script can be read against the node.
var LOCKTIME_THRESHOLD = 500000000 // below: block height. at or above: unix time.
var SEQUENCE_FINAL = Buffer.from([0xff, 0xff, 0xff, 0xff])
var SIGN_PAD = Buffer.from([0x00]) // makes an unsigned 32-bit field read positive

function toOutput (dest, satoshis) {
  if (dest instanceof Transaction.Output) return dest
  if (dest instanceof Script) return new Transaction.Output({ script: dest, satoshis: satoshis })
  return helpers.p2pkhOutput(dest, satoshis)
}

// Grind the OP_PUSH_TX nonce (nLockTime) from `base` upward until the in-script
// signature is a clean low-S DER. Grinding from `base` keeps nLockTime within a
// lockUntil floor instead of fighting it (grind uses nLockTime as its nonce).
function grindFrom (spendTx, inputIndex, lock, satoshis, base, maxTries) {
  maxTries = maxTries || 50000
  for (var t = 0; t < maxTries; t++) {
    spendTx.nLockTime = base + t
    var pre = helpers.rawPreimage(spendTx, inputIndex, lock, satoshis)
    if (PushTx.sFromPreimage(pre)) return pre
  }
  throw new Error('covenant grind failed after ' + maxTries + ' tries')
}

function Policy () {
  if (!(this instanceof Policy)) return new Policy()
  this._outputs = []
  this._minLockTime = null
}

/** Require the spend to create this output (call once per required output, in order). */
Policy.prototype.payTo = function (dest, satoshis) {
  this._outputs.push(toOutput(dest, satoshis))
  return this
}

/**
 * Require the spend's nLockTime to be >= height.
 *
 * Below LOCKTIME_THRESHOLD (500000000) the value is a BLOCK HEIGHT; at or above
 * it, a UNIX TIMESTAMP. The compiled script enforces the same unit the floor
 * uses, so a height floor cannot be satisfied by a timestamp.
 *
 * 0 is rejected: consensus reads nLockTime 0 as "no lock" and treats the
 * transaction as final regardless of any input's sequence, so a floor of 0
 * would compile to a lock that binds nothing.
 */
Policy.prototype.lockUntil = function (height) {
  if (!Number.isInteger(height) || height < 1 || height > 0xffffffff) {
    throw new Error('lockUntil: expected an integer in 1..4294967295, got ' + height +
      ' (nLockTime 0 means "no lock" — consensus treats such a transaction as final)')
  }
  this._minLockTime = height
  return this
}

/** The exact outputs a valid spend must contain. */
Policy.prototype.outputs = function () {
  return this._outputs.map(function (o) { return new Transaction.Output(o.toObject()) })
}

Policy.prototype.describe = function () {
  var parts = []
  this._outputs.forEach(function (o, i) {
    parts.push('output[' + i + '] = ' + o.satoshis + ' sat to ' + o.script.toASM().slice(0, 24) + '...')
  })
  if (this._minLockTime !== null) {
    var unit = this._minLockTime < LOCKTIME_THRESHOLD ? 'block height' : 'unix time'
    parts.push('nLockTime >= ' + this._minLockTime + ' as a ' + unit)
    parts.push('this input is non-final (nSequence != 0xffffffff)')
  }
  return 'spend allowed iff: ' + parts.join(' AND ')
}

/** Compile to a locking script + spend helpers. */
Policy.prototype.compile = function () {
  if (this._outputs.length === 0 && this._minLockTime === null) {
    throw new Error('empty policy: add at least one constraint (payTo / lockUntil)')
  }
  var policy = this
  var s = new Script().add(Opcode.OP_DUP)
  PushTx.pushTxCore(s) // authenticate the preimage
  s.add(Opcode.OP_VERIFY) // stack: [preimage]

  if (this._outputs.length) {
    var expected = PushTx.hashOutputs(this._outputs)
    s.add(Opcode.OP_DUP)
    PushTx.extractHashOutputs(s)
    s.add(Buffer.from(expected)).add(Opcode.OP_EQUALVERIFY)
  }

  if (this._minLockTime !== null) {
    // A time lock is three consensus rules, not one comparison. All three are in
    // the node's CheckLockTime; checking only the number reproduces none of them.

    // 1. nSequence of THIS input must be non-final. IsFinalTx() ignores nLockTime
    //    outright when every input is 0xffffffff, so without this the spend is
    //    minable in the next block no matter how large a locktime it declares.
    //    One non-final input is enough to make the whole transaction non-final,
    //    and this input is the only one the preimage lets us see.
    s.add(Opcode.OP_DUP)
    s.add(n(44)).add(Opcode.OP_RIGHT).add(n(4)).add(Opcode.OP_LEFT) // last 44, first 4 = nSequence
    s.add(SEQUENCE_FINAL).add(Opcode.OP_EQUAL).add(Opcode.OP_NOT).add(Opcode.OP_VERIFY)

    // 2. nLockTime is an UNSIGNED 32-bit field, and OP_BIN2NUM reads a SIGNED
    //    one. From 19 Jan 2038 the high bit is set, and 0x80000000 minimally
    //    encodes to negative zero — the floor would be compared against 0 and no
    //    spend would ever satisfy it. Sign-pad to five bytes first. That push is
    //    only legal because OP_BIN2NUM now honours the era's script-number width.
    s.add(Opcode.OP_DUP)
    s.add(n(8)).add(Opcode.OP_RIGHT).add(n(4)).add(Opcode.OP_LEFT) // last 8, first 4 = nLockTime
    s.add(SIGN_PAD).add(Opcode.OP_CAT).add(Opcode.OP_BIN2NUM)

    // 3. Units must match the floor's. Consensus reads nLockTime below
    //    LOCKTIME_THRESHOLD as a height and at or above it as a timestamp, so a
    //    bare `>=` lets a long-past timestamp clear a future height floor —
    //    1500000000 >= 900000 is true, and that transaction is minable today.
    //    A floor already at or above the threshold needs no guard: `>= floor`
    //    implies `>= threshold`.
    if (this._minLockTime < LOCKTIME_THRESHOLD) {
      s.add(Opcode.OP_DUP).add(n(LOCKTIME_THRESHOLD)).add(Opcode.OP_LESSTHAN).add(Opcode.OP_VERIFY)
    }

    s.add(n(this._minLockTime)).add(Opcode.OP_GREATERTHANOREQUAL).add(Opcode.OP_VERIFY)
  }

  s.add(Opcode.OP_DROP).add(Opcode.OP_1) // drop preimage; succeed

  return {
    lock: s,
    outputs: policy.outputs(),
    describe: function () { return policy.describe() },
    unlock: function (spendTx, satoshis, inputIndex) {
      inputIndex = inputIndex || 0
      var base = policy._minLockTime === null ? 0 : policy._minLockTime
      if (policy._minLockTime !== null) {
        spendTx.inputs[inputIndex].sequenceNumber = 0xfffffffe // non-final so locktime applies
      }
      return new Script().add(grindFrom(spendTx, inputIndex, s, satoshis, base))
    }
  }
}

function policy () { return new Policy() }

// Terminal shortcuts for the non-composable whole-covenant patterns.
policy.perpetual = function (fee) { return PELS.pelsCovenant(fee) }
policy.token = function (fee, ownerPubKeyHash) { return Token.ownershipToken(fee, ownerPubKeyHash) }

module.exports = { policy: policy, Policy: Policy }
