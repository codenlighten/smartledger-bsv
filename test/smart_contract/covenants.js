'use strict'

/* global describe, it, before, after */
require('chai').should()
var bsv = require('../..')
var SC = bsv.SmartContract
var PrivateKey = bsv.PrivateKey
var Script = bsv.Script
var Transaction = bsv.Transaction

var Locks = SC.Locks
var PushTx = SC.PushTx
var Token = SC.Token
var help = SC.CovenantHelpers
var fundAndSpend = help.fundAndSpend
var p2pkhOutput = help.p2pkhOutput
var verify = help.verify

var SATS = 100000

describe('SmartContract covenants (v4.2.0)', function () {
  this.timeout(20000)
  var I = bsv.Script.Interpreter
  var saved

  before(function () {
    saved = { el: I.MAX_SCRIPT_ELEMENT_SIZE, num: I.MAXIMUM_ELEMENT_SIZE, ops: I.MAX_OPS_PER_SCRIPT }
    SC.enableGenesis() // OP_PUSH_TX covenants need post-Genesis limits
  })
  after(function () {
    I.MAX_SCRIPT_ELEMENT_SIZE = saved.el
    I.MAXIMUM_ELEMENT_SIZE = saved.num
    I.MAX_OPS_PER_SCRIPT = saved.ops
  })

  var alice = PrivateKey.fromRandom()
  var bob = PrivateKey.fromRandom()
  var carol = PrivateKey.fromRandom()

  function spendOf (lock, sats, outputs) {
    return fundAndSpend(lock, sats, { outputs: outputs }).spend
  }

  describe('Locks', function () {
    it('hash-lock accepts the right secret and rejects a wrong one', function () {
      var secret = Buffer.from('correct horse battery staple')
      var c = Locks.hashLock(secret)
      var spend = spendOf(c.lock, SATS, [p2pkhOutput(alice, SATS - 500)])
      spend.inputs[0].setScript(c.unlock(spend, SATS))
      verify(spend.inputs[0].script, c.lock, { tx: spend, satoshis: SATS }).ok.should.equal(true)

      spend = spendOf(c.lock, SATS, [p2pkhOutput(alice, SATS - 500)])
      spend.inputs[0].setScript(c.unlock(spend, SATS, Buffer.from('wrong')))
      verify(spend.inputs[0].script, c.lock, { tx: spend, satoshis: SATS }).ok.should.equal(false)
    })

    it('P2PKH verifies a valid signature', function () {
      var c = Locks.p2pkh(alice)
      var spend = spendOf(c.lock, SATS, [p2pkhOutput(bob, SATS - 500)])
      spend.inputs[0].setScript(c.unlock(spend, SATS))
      verify(spend.inputs[0].script, c.lock, { tx: spend, satoshis: SATS }).ok.should.equal(true)
    })

    it('CLTV accepts a matured spend and rejects an immature one', function () {
      var lt = 800000
      var c = Locks.timeLockCLTV(alice, lt)
      var spend = spendOf(c.lock, SATS, [p2pkhOutput(alice, SATS - 500)])
      spend.nLockTime = lt; spend.inputs[0].sequenceNumber = 0xfffffffe
      spend.inputs[0].setScript(c.unlock(spend, SATS))
      verify(spend.inputs[0].script, c.lock, { tx: spend, satoshis: SATS }).ok.should.equal(true)

      spend = spendOf(c.lock, SATS, [p2pkhOutput(alice, SATS - 500)])
      spend.nLockTime = lt - 1; spend.inputs[0].sequenceNumber = 0xfffffffe
      spend.inputs[0].setScript(c.unlock(spend, SATS))
      verify(spend.inputs[0].script, c.lock, { tx: spend, satoshis: SATS }).ok.should.equal(false)
    })

    it('2-of-3 multisig verifies with two valid signatures', function () {
      var c = Locks.multisig(2, [alice, bob, carol])
      var spend = spendOf(c.lock, SATS, [p2pkhOutput(bob, SATS - 500)])
      spend.inputs[0].setScript(c.unlock(spend, SATS, [alice, bob]))
      verify(spend.inputs[0].script, c.lock, { tx: spend, satoshis: SATS }).ok.should.equal(true)
    })

    it('HTLC supports claim and rejects an early refund', function () {
      var secret = Buffer.from('lightning-preimage-32bytes------')
      var timeout = 750000
      var c = Locks.htlc({ secret: secret, receiver: bob, sender: alice, timeout: timeout })
      var spend = spendOf(c.lock, SATS, [p2pkhOutput(bob, SATS - 500)])
      spend.inputs[0].setScript(c.unlockClaim(spend, SATS))
      verify(spend.inputs[0].script, c.lock, { tx: spend, satoshis: SATS }).ok.should.equal(true)

      spend = spendOf(c.lock, SATS, [p2pkhOutput(alice, SATS - 500)])
      spend.nLockTime = timeout - 1; spend.inputs[0].sequenceNumber = 0xfffffffe
      spend.inputs[0].setScript(c.unlockRefund(spend, SATS))
      verify(spend.inputs[0].script, c.lock, { tx: spend, satoshis: SATS }).ok.should.equal(false)
    })
  })

  describe('OP_PUSH_TX', function () {
    it('accepts an authentic preimage and rejects a tampered one', function () {
      var lock = PushTx.authenticator()
      var spend = spendOf(lock, SATS, [p2pkhOutput(alice, SATS - 500)])
      var g = PushTx.grind(spend, 0, lock, SATS)
      spend.inputs[0].setScript(new Script().add(g.preimage))
      verify(spend.inputs[0].script, lock, { tx: spend, satoshis: SATS }).ok.should.equal(true)

      var bad = Buffer.from(g.preimage); bad[bad.length - 5] ^= 0xff
      spend.inputs[0].setScript(new Script().add(bad))
      verify(spend.inputs[0].script, lock, { tx: spend, satoshis: SATS }).ok.should.equal(false)
    })

    it('value covenant forces coins to the required outputs', function () {
      var beneficiary = PrivateKey.fromRandom()
      var attacker = PrivateKey.fromRandom()
      var required = [p2pkhOutput(beneficiary, SATS - 500)]
      var lock = PushTx.valueCovenant(PushTx.hashOutputs(required))

      var spend = spendOf(lock, SATS, required)
      spend.inputs[0].setScript(new Script().add(PushTx.grind(spend, 0, lock, SATS).preimage))
      verify(spend.inputs[0].script, lock, { tx: spend, satoshis: SATS }).ok.should.equal(true)

      spend = spendOf(lock, SATS, [p2pkhOutput(attacker, SATS - 500)])
      spend.inputs[0].setScript(new Script().add(PushTx.grind(spend, 0, lock, SATS).preimage))
      verify(spend.inputs[0].script, lock, { tx: spend, satoshis: SATS }).ok.should.equal(false)
    })
  })

  describe('PELS (perpetual covenant)', function () {
    var FEE = 500
    it('recreates the same script and chains a second hop', function () {
      var lock = SC.perpetualCovenant(FEE)
      var spend = spendOf(lock, SATS, [new Transaction.Output({ script: lock, satoshis: SATS - FEE })])
      spend.inputs[0].setScript(new Script().add(PushTx.grind(spend, 0, lock, SATS).preimage))
      verify(spend.inputs[0].script, lock, { tx: spend, satoshis: SATS }).ok.should.equal(true)

      var inSats = SATS - FEE
      spend = spendOf(lock, inSats, [new Transaction.Output({ script: lock, satoshis: inSats - FEE })])
      spend.inputs[0].setScript(new Script().add(PushTx.grind(spend, 0, lock, inSats).preimage))
      verify(spend.inputs[0].script, lock, { tx: spend, satoshis: inSats }).ok.should.equal(true)
    })

    it('rejects escaping to a P2PKH', function () {
      var lock = SC.perpetualCovenant(FEE)
      var spend = spendOf(lock, SATS, [p2pkhOutput(PrivateKey.fromRandom(), SATS - FEE)])
      spend.inputs[0].setScript(new Script().add(PushTx.grind(spend, 0, lock, SATS).preimage))
      verify(spend.inputs[0].script, lock, { tx: spend, satoshis: SATS }).ok.should.equal(false)
    })
  })

  describe('Token (stateful NFT)', function () {
    var FEE = 500
    var aliceSecret = Buffer.from('alice-secret-32-bytes-padding!!!')
    var bobSecret = Buffer.from('bob---secret-32-bytes-padding!!!')
    var carolSecret = Buffer.from('carol-secret-32-bytes-padding!!!')

    function transfer (currentLock, inSats, ownerSecret, nextHash, outputOverride) {
      var nextLock = Token.ownershipToken(FEE, nextHash)
      var out = outputOverride || new Transaction.Output({ script: nextLock, satoshis: inSats - FEE })
      var spend = spendOf(currentLock, inSats, [out])
      var g = PushTx.grind(spend, 0, currentLock, inSats)
      spend.inputs[0].setScript(Token.unlockTransfer(ownerSecret, nextHash, g.preimage))
      return { spend: spend, nextLock: nextLock }
    }

    it('transfers ownership across a chain and rejects a non-owner', function () {
      var aliceToken = Token.ownershipToken(FEE, Token.ownerId(aliceSecret))
      var bobHash = Token.ownerId(bobSecret)
      var carolHash = Token.ownerId(carolSecret)

      var r = transfer(aliceToken, SATS, aliceSecret, bobHash)
      verify(r.spend.inputs[0].script, aliceToken, { tx: r.spend, satoshis: SATS }).ok.should.equal(true)

      var inSats = SATS - FEE
      var r2 = transfer(r.nextLock, inSats, bobSecret, carolHash)
      verify(r2.spend.inputs[0].script, r.nextLock, { tx: r2.spend, satoshis: inSats }).ok.should.equal(true)

      var bad = transfer(aliceToken, SATS, carolSecret, bobHash) // wrong owner
      verify(bad.spend.inputs[0].script, aliceToken, { tx: bad.spend, satoshis: SATS }).ok.should.equal(false)
    })

    it('rejects breaking the token out to a P2PKH', function () {
      var aliceToken = Token.ownershipToken(FEE, Token.ownerId(aliceSecret))
      var r = transfer(aliceToken, SATS, aliceSecret, Token.ownerId(bobSecret),
        p2pkhOutput(PrivateKey.fromRandom(), SATS - FEE))
      verify(r.spend.inputs[0].script, aliceToken, { tx: r.spend, satoshis: SATS }).ok.should.equal(false)
    })
  })
})
