'use strict'

/* global describe, it, before, after */
require('chai').should()
var bsv = require('../..')
var SC = bsv.SmartContract
var Script = bsv.Script
var PrivateKey = bsv.PrivateKey
var Opcode = bsv.Opcode
var H = SC.CovenantHelpers
var verify = H.verify

var SATS = 100000

describe('SmartContract covenant DSL + debugger (v4.5.0)', function () {
  this.timeout(20000)
  var I = bsv.Script.Interpreter
  var saved
  before(function () {
    saved = { el: I.MAX_SCRIPT_ELEMENT_SIZE, num: I.MAXIMUM_ELEMENT_SIZE, ops: I.MAX_OPS_PER_SCRIPT }
    SC.enableGenesis()
  })
  after(function () {
    I.MAX_SCRIPT_ELEMENT_SIZE = saved.el
    I.MAXIMUM_ELEMENT_SIZE = saved.num
    I.MAX_OPS_PER_SCRIPT = saved.ops
  })

  var alice = PrivateKey.fromRandom()
  var attacker = PrivateKey.fromRandom()
  function spendWith (lock, outputs) {
    return H.fundAndSpend(lock, SATS, { outputs: outputs }).spend
  }

  describe('policy() DSL', function () {
    it('payTo: compiles a covenant that pins the output and rejects redirects', function () {
      var c = SC.policy().payTo(alice.toAddress(), SATS - 500).compile()
      var spend = spendWith(c.lock, c.outputs)
      spend.inputs[0].setScript(c.unlock(spend, SATS))
      verify(spend.inputs[0].script, c.lock, { tx: spend, satoshis: SATS }).ok.should.equal(true)

      spend = spendWith(c.lock, [H.p2pkhOutput(attacker, SATS - 500)])
      spend.inputs[0].setScript(c.unlock(spend, SATS))
      verify(spend.inputs[0].script, c.lock, { tx: spend, satoshis: SATS }).ok.should.equal(false)
    })

    it('multi-output: pins the exact ordered set and rejects a tweaked amount', function () {
      var c = SC.policy().payTo(alice.toAddress(), 60000).payTo(attacker.toAddress(), 39500).compile()
      var spend = spendWith(c.lock, c.outputs)
      spend.inputs[0].setScript(c.unlock(spend, SATS))
      verify(spend.inputs[0].script, c.lock, { tx: spend, satoshis: SATS }).ok.should.equal(true)

      var bad = spendWith(c.lock, [H.p2pkhOutput(alice, 60001), H.p2pkhOutput(attacker, 39499)])
      bad.inputs[0].setScript(c.unlock(bad, SATS))
      verify(bad.inputs[0].script, c.lock, { tx: bad, satoshis: SATS }).ok.should.equal(false)
    })

    it('payTo AND lockUntil compose; rejects an early locktime', function () {
      var height = 800000
      var c = SC.policy().payTo(alice.toAddress(), SATS - 500).lockUntil(height).compile()
      var spend = spendWith(c.lock, c.outputs)
      spend.inputs[0].setScript(c.unlock(spend, SATS))
      verify(spend.inputs[0].script, c.lock, { tx: spend, satoshis: SATS }).ok.should.equal(true)

      spend = spendWith(c.lock, c.outputs)
      spend.nLockTime = height - 1
      spend.inputs[0].sequenceNumber = 0xfffffffe
      spend.inputs[0].setScript(new Script().add(SC.PushTx.grind(spend, 0, c.lock, SATS).preimage))
      verify(spend.inputs[0].script, c.lock, { tx: spend, satoshis: SATS }).ok.should.equal(false)
    })

    it('exposes .perpetual()/.token() shortcuts', function () {
      SC.policy.perpetual(500).toBuffer().length.should.be.above(252)
      var h = bsv.crypto.Hash.sha256ripemd160(bsv.PrivateKey.fromRandom().toPublicKey().toBuffer())
      SC.policy.token(500, h).toBuffer().length.should.be.above(252)
    })

    it('throws on an empty policy', function () {
      (function () { SC.policy().compile() }).should.throw(/empty policy/)
    })
  })

  describe('trace() debugger', function () {
    it('traces a hash-lock and agrees with the interpreter (true and false)', function () {
      var secret = Buffer.from('hello')
      var lock = new Script().add(Opcode.OP_SHA256).add(bsv.crypto.Hash.sha256(secret)).add(Opcode.OP_EQUAL)
      var r = SC.trace(new Script().add(secret), lock, { satoshis: 1000 })
      r.ok.should.equal(true)
      r.steps[r.steps.length - 1].stack.join().should.equal('01')
      SC.trace(new Script().add(Buffer.from('nope')), lock, { satoshis: 1000 }).ok.should.equal(false)
    })

    it('traces an OP_PUSH_TX covenant ending in OP_CHECKSIG -> 01', function () {
      var lock = SC.PushTx.authenticator()
      var spend = H.fundAndSpend(lock, SATS, { outputs: [H.p2pkhOutput(alice, SATS - 500)] }).spend
      spend.inputs[0].setScript(new Script().add(SC.PushTx.grind(spend, 0, lock, SATS).preimage))
      var r = SC.trace(spend.inputs[0].script, lock, { tx: spend, satoshis: SATS })
      r.ok.should.equal(true)
      r.steps[r.steps.length - 1].op.should.equal('OP_CHECKSIG')
      SC.Debugger.format(r).should.contain('VALID')
    })
  })
})
