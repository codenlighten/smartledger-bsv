'use strict'

/* global describe, it, before, after */
require('chai').should()
var bsv = require('../..')
var SC = bsv.SmartContract
var PrivateKey = bsv.PrivateKey
var Script = bsv.Script
var Transaction = bsv.Transaction

var Token = SC.Token
var Auth = SC.Authorizers
var help = SC.CovenantHelpers
var fundAndSpend = help.fundAndSpend
var p2pkhOutput = help.p2pkhOutput
var verify = help.verify

var SATS = 100000
var FEE = 500

describe('SmartContract generalized token (pluggable auth + multi-output)', function () {
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

  function spendOf (lock, sats, outputs) {
    return fundAndSpend(lock, sats, { outputs: outputs }).spend
  }

  describe('single-key authorizer (default)', function () {
    var alice = PrivateKey.fromRandom()
    var bob = PrivateKey.fromRandom()

    it('transfers and rejects a non-owner', function () {
      var lock = Token.ownershipToken(FEE, Token.ownerId(alice))
      var bobHash = Token.ownerId(bob)
      var next = Token.ownershipToken(FEE, bobHash)
      var spend = spendOf(lock, SATS, [new Transaction.Output({ script: next, satoshis: SATS - FEE })])
      spend.inputs[0].setScript(Token.unlockTransfer(alice, bobHash, spend, SATS, lock))
      verify(spend.inputs[0].script, lock, { tx: spend, satoshis: SATS }).ok.should.equal(true)

      var bad = spendOf(lock, SATS, [new Transaction.Output({ script: next, satoshis: SATS - FEE })])
      bad.inputs[0].setScript(Token.unlockTransfer(bob, bobHash, bad, SATS, lock)) // bob does not own alice's token
      verify(bad.inputs[0].script, lock, { tx: bad, satoshis: SATS }).ok.should.equal(false)
    })
  })

  describe('multisig authorizer (m-of-n)', function () {
    var a = PrivateKey.fromRandom()
    var b = PrivateKey.fromRandom()
    var c = PrivateKey.fromRandom()
    var keys = [a.toPublicKey(), b.toPublicKey(), c.toPublicKey()]
    var auth23 = Auth.multisig(2, 3)
    var commit = auth23.commit(keys)
    var nextOwner = Token.ownerId(PrivateKey.fromRandom())

    function transfer23 (signWith) {
      var lock = Token.ownershipToken(FEE, commit, auth23)
      var next = Token.ownershipToken(FEE, nextOwner, auth23) // covenant recreates the SAME (multisig) code
      var spend = spendOf(lock, SATS, [new Transaction.Output({ script: next, satoshis: SATS - FEE })])
      spend.inputs[0].setScript(
        Token.unlockTransfer({ keys: keys, signWith: signWith }, nextOwner, spend, SATS, lock, { auth: auth23 }))
      return { spend: spend, lock: lock }
    }

    it('accepts a valid 2-of-3 (keys a,c)', function () {
      var r = transfer23([a, c])
      verify(r.spend.inputs[0].script, r.lock, { tx: r.spend, satoshis: SATS }).ok.should.equal(true)
    })

    it('accepts a different valid pair (keys b,c)', function () {
      var r = transfer23([b, c])
      verify(r.spend.inputs[0].script, r.lock, { tx: r.spend, satoshis: SATS }).ok.should.equal(true)
    })

    it('rejects a single signature (below threshold)', function () {
      var run = function () { transfer23([a]) }
      run.should.throw(/at least 2/)
    })

    it('rejects a signer outside the committed set', function () {
      var outsider = PrivateKey.fromRandom()
      var run = function () { transfer23([a, outsider]) }
      run.should.throw(/not in the committed key set/)
    })

    it('rejects a forged set (right threshold, wrong keys)', function () {
      // Commit to {a,b,c} but try to spend revealing a different key set {a,b,x}.
      var x = PrivateKey.fromRandom()
      var wrongKeys = [a.toPublicKey(), b.toPublicKey(), x.toPublicKey()]
      var lock = Token.ownershipToken(FEE, commit, auth23)
      var next = Token.ownershipToken(FEE, nextOwner, auth23)
      var spend = spendOf(lock, SATS, [new Transaction.Output({ script: next, satoshis: SATS - FEE })])
      spend.inputs[0].setScript(
        Token.unlockTransfer({ keys: wrongKeys, signWith: [a, b] }, nextOwner, spend, SATS, lock, { auth: auth23 }))
      // HASH160(forged redeem) != committed redeem hash => fails.
      verify(spend.inputs[0].script, lock, { tx: spend, satoshis: SATS }).ok.should.equal(false)
    })
  })

  describe('predicate authorizer (custom escape hatch)', function () {
    // Re-implement single-key through the generic predicate interface to prove
    // the contract is sufficient for custom schemes.
    var Opcode = bsv.Opcode
    var Hash = bsv.crypto.Hash
    var owner = PrivateKey.fromRandom()
    var custom = Auth.predicate({
      name: 'custom-single-key',
      commit: function (key) { return Hash.sha256ripemd160(key.toPublicKey().toBuffer()) },
      emit: function (s) {
        return s.add(Opcode.OP_OVER).add(Opcode.OP_HASH160).add(Opcode.OP_EQUALVERIFY).add(Opcode.OP_CHECKSIGVERIFY)
      },
      unlockArgs: function (spend, inputIndex, lock, sats, key) {
        return [help.signInput(spend, key, inputIndex, lock, sats), key.toPublicKey().toBuffer()]
      }
    })

    it('authorizes a transfer via a custom predicate', function () {
      var lock = Token.ownershipToken(FEE, custom.commit(owner), custom)
      var nextOwner = Token.ownerId(PrivateKey.fromRandom())
      var next = Token.ownershipToken(FEE, nextOwner)
      var spend = spendOf(lock, SATS, [new Transaction.Output({ script: next, satoshis: SATS - FEE })])
      spend.inputs[0].setScript(Token.unlockTransfer(owner, nextOwner, spend, SATS, lock, { auth: custom }))
      verify(spend.inputs[0].script, lock, { tx: spend, satoshis: SATS }).ok.should.equal(true)
    })
  })

  describe('multi-output token (N-output)', function () {
    var alice = PrivateKey.fromRandom()
    var bob = PrivateKey.fromRandom()

    function serialize (output) { return output.toBufferWriter().toBuffer() }
    function le8 (v) { return new bsv.crypto.BN(v).toBuffer({ endian: 'little', size: 8 }) }

    it('recreates the token among other outputs and binds them all', function () {
      var lock = Token.ownershipTokenMulti(Token.ownerId(alice))
      var bobHash = Token.ownerId(bob)
      var nextToken = Token.ownershipTokenMulti(bobHash)

      var payment = p2pkhOutput(PrivateKey.fromRandom(), 4000)
      var tokenValue = 1000
      var tokenOutput = new Transaction.Output({ script: nextToken, satoshis: tokenValue })
      var dataOutput = new Transaction.Output({
        script: new Script().add(bsv.Opcode.OP_FALSE).add(bsv.Opcode.OP_RETURN).add(Buffer.from('hello')),
        satoshis: 0
      })

      // tx outputs in order: [payment, token, data]
      var spend = spendOf(lock, SATS, [payment, tokenOutput, dataOutput])
      spend.inputs[0].setScript(Token.unlockTransferMulti(alice, bobHash, spend, SATS, lock, {
        before: serialize(payment),
        after: serialize(dataOutput),
        tokenValue: le8(tokenValue)
      }))
      verify(spend.inputs[0].script, lock, { tx: spend, satoshis: SATS }).ok.should.equal(true)
    })

    it('rejects a tampered surrounding output', function () {
      var lock = Token.ownershipTokenMulti(Token.ownerId(alice))
      var bobHash = Token.ownerId(bob)
      var nextToken = Token.ownershipTokenMulti(bobHash)
      var payment = p2pkhOutput(PrivateKey.fromRandom(), 4000)
      var tokenValue = 1000
      var tokenOutput = new Transaction.Output({ script: nextToken, satoshis: tokenValue })

      var spend = spendOf(lock, SATS, [payment, tokenOutput])
      // Claim a DIFFERENT `before` than the real first output => HASH160 mismatch.
      var lyingPayment = p2pkhOutput(PrivateKey.fromRandom(), 4000)
      spend.inputs[0].setScript(Token.unlockTransferMulti(alice, bobHash, spend, SATS, lock, {
        before: serialize(lyingPayment),
        after: Buffer.alloc(0),
        tokenValue: le8(tokenValue)
      }))
      verify(spend.inputs[0].script, lock, { tx: spend, satoshis: SATS }).ok.should.equal(false)
    })
  })
})
