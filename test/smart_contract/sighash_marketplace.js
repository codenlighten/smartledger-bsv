'use strict'

/* global describe, it, before, after */

// Configurable SIGHASH core (Phase 2). The OP_PUSH_TX core was hard-wired to
// SIGHASH_ALL|FORKID (0x41). It can now be built under any flag; these tests prove
// the marketplace / partially-signed pattern with SIGHASH_SINGLE|ANYONECANPAY|FORKID
// (0xc3): a seller commits only to its own input and its own output, and a buyer may
// add funding inputs and change outputs without invalidating the covenant — while
// the seller's OWN output stays bound.

require('chai').should()
var bsv = require('../..')
var SC = bsv.SmartContract
var PrivateKey = bsv.PrivateKey
var Script = bsv.Script
var Opcode = bsv.Opcode
var Transaction = bsv.Transaction

var P = SC.PushTx
var help = SC.CovenantHelpers
var fundAndSpend = help.fundAndSpend
var p2pkhOutput = help.p2pkhOutput
var verify = help.verify

var SATS = 100000

describe('Configurable SIGHASH — SINGLE|ANYONECANPAY marketplace covenant', function () {
  this.timeout(20000)
  var I = bsv.Script.Interpreter
  var saved
  var flag = P.SIGHASH_SINGLE_ANYONECANPAY_FORKID // 0xc3

  before(function () {
    saved = I.getLimits()
    SC.enableGenesis()
  })
  after(function () {
    I.setLimits(saved)
  })

  // Lock: authenticate the pushed preimage under `flag`, assert the flag, succeed.
  function makeLock () {
    var lock = new Script()
    lock.add(Opcode.OP_DUP)
    P.pushTxCore(lock, { sighashType: flag })
    lock.add(Opcode.OP_VERIFY)
    P.assertSighashType(lock, flag)
    lock.add(Opcode.OP_DROP)
    lock.add(Opcode.OP_TRUE)
    return lock
  }

  function grindUnlock (spend, lock) {
    var g = P.grind(spend, 0, lock, SATS, { sighashType: flag })
    spend.inputs[0].setScript(new Script().add(g.preimage))
  }

  it('verifies a SINGLE|ANYONECANPAY covenant spend', function () {
    var lock = makeLock()
    var sellerOut = p2pkhOutput(PrivateKey.fromRandom(), SATS - 500) // committed output (index 0)
    var spend = fundAndSpend(lock, SATS, { outputs: [sellerOut] }).spend
    grindUnlock(spend, lock)
    verify(spend.inputs[0].script, lock, { tx: spend, satoshis: SATS }).ok.should.equal(true)
  })

  it('stays valid when a buyer adds a funding input and a change output', function () {
    var lock = makeLock()
    var sellerOut = p2pkhOutput(PrivateKey.fromRandom(), SATS - 500)
    var spend = fundAndSpend(lock, SATS, { outputs: [sellerOut] }).spend
    grindUnlock(spend, lock) // seller signs input0 + output0 only

    // Buyer adds a funding input and their own change output AFTER the seller signed.
    spend.addInput(new Transaction.Input({
      prevTxId: '11'.repeat(32), outputIndex: 0, script: Script.empty()
    }), p2pkhOutput(PrivateKey.fromRandom(), 50000).script, 50000)
    spend.addOutput(p2pkhOutput(PrivateKey.fromRandom(), 49000)) // buyer change at index 1

    // The seller's covenant on input 0 is unaffected (ANYONECANPAY ignores the new
    // input; SINGLE ignores the new output).
    verify(spend.inputs[0].script, lock, { tx: spend, satoshis: SATS }).ok.should.equal(true)
  })

  it('still binds the seller\'s OWN output (SINGLE commits output at the input index)', function () {
    var lock = makeLock()
    var sellerOut = p2pkhOutput(PrivateKey.fromRandom(), SATS - 500)
    var spend = fundAndSpend(lock, SATS, { outputs: [sellerOut] }).spend
    grindUnlock(spend, lock)

    // Tamper the committed output (index 0) after signing → must fail.
    spend.outputs[0] = p2pkhOutput(PrivateKey.fromRandom(), 1)
    verify(spend.inputs[0].script, lock, { tx: spend, satoshis: SATS }).ok.should.equal(false)
  })

  it('back-compat: default pushTxCore is still SIGHASH_ALL|FORKID', function () {
    var lock = new Script()
    lock.add(Opcode.OP_DUP)
    P.pushTxCore(lock) // no opts → 0x41
    lock.add(Opcode.OP_VERIFY)
    P.assertSighashAll(lock)
    lock.add(Opcode.OP_DROP).add(Opcode.OP_TRUE)
    var out = p2pkhOutput(PrivateKey.fromRandom(), SATS - 500)
    var spend = fundAndSpend(lock, SATS, { outputs: [out] }).spend
    var g = P.grind(spend, 0, lock, SATS) // default sighash
    spend.inputs[0].setScript(new Script().add(g.preimage))
    verify(spend.inputs[0].script, lock, { tx: spend, satoshis: SATS }).ok.should.equal(true)
  })
})
