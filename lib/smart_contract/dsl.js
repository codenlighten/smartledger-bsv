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
 * authentication; clauses AND together. Requires post-Genesis limits at verify
 * time (SmartContract.enableGenesis()).
 */

var bsv = require('../..')
var PushTx = require('./pushtx')
var PELS = require('./pels')
var Token = require('./token')
var helpers = require('./covenant_helpers')

var Script = bsv.Script
var Opcode = bsv.Opcode
var Transaction = bsv.Transaction
var n = helpers.scriptNum

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

/** Require the spend's nLockTime to be >= height. */
Policy.prototype.lockUntil = function (height) {
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
  if (this._minLockTime !== null) parts.push('nLockTime >= ' + this._minLockTime)
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
    s.add(Opcode.OP_DUP)
    s.add(n(8)).add(Opcode.OP_RIGHT).add(n(4)).add(Opcode.OP_LEFT) // last 8, first 4 = nLockTime
    s.add(Opcode.OP_BIN2NUM).add(n(this._minLockTime)).add(Opcode.OP_GREATERTHANOREQUAL).add(Opcode.OP_VERIFY)
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
