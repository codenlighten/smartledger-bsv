'use strict'

/* global describe, it, before, after */

// Ordinal-safe transfer (Phase 1). A 1-sat ordinal held in a covenant must be
// transferred WITHOUT burning the inscribed satoshi. The single-output
// ownershipToken sets output = input - fee, so it destroys a 1-sat UTXO; these
// tests prove (a) the single-output path refuses a 1-sat UTXO, and (b)
// transferOrdinal recreates the token at exactly 1 sat among funding outputs and
// the covenant verifies.

require('chai').should()
var bsv = require('../..')
var SC = bsv.SmartContract
var PrivateKey = bsv.PrivateKey
var Transaction = bsv.Transaction

var Token = SC.Token
var help = SC.CovenantHelpers
var fundAndSpend = help.fundAndSpend
var p2pkhOutput = help.p2pkhOutput
var verify = help.verify

describe('Ordinal-safe transfer (1-sat, SIGHASH_ALL)', function () {
  this.timeout(20000)
  var I = bsv.Script.Interpreter
  var saved
  var alice = PrivateKey.fromRandom()
  var bob = PrivateKey.fromRandom()

  before(function () {
    saved = I.getLimits()
    SC.enableGenesis()
  })
  after(function () {
    I.setLimits(saved)
  })

  it('transferOrdinal recreates the 1-sat token among funding outputs and verifies', function () {
    var lock = Token.ordinalLock(Token.ownerId(alice))
    var bobHash = Token.ownerId(bob)
    var nextToken = Token.ordinalLock(bobHash)

    // Ordinal output stays exactly 1 sat; a change output carries the funding.
    var tokenOutput = new Transaction.Output({ script: nextToken, satoshis: 1 })
    var change = p2pkhOutput(PrivateKey.fromRandom(), 5000)

    // token output at index 0 (ordinal FIFO), change after.
    var spend = fundAndSpend(lock, 1, { outputs: [tokenOutput, change] }).spend
    spend.inputs[0].setScript(Token.transferOrdinal(alice, bobHash, spend, 1, lock, { tokenIndex: 0 }))

    verify(spend.inputs[0].script, lock, { tx: spend, satoshis: 1 }).ok.should.equal(true)
    // The recreated token output is still exactly 1 sat.
    spend.outputs[0].satoshis.should.equal(1)
  })

  it('guardrail: single-output unlockTransfer refuses a 1-sat UTXO', function () {
    var lock = Token.ordinalLock(Token.ownerId(alice))
    var bobHash = Token.ownerId(bob)
    var next = Token.ownershipToken(500, bobHash)
    var spend = fundAndSpend(lock, 1, {
      outputs: [new Transaction.Output({ script: next, satoshis: 1 })]
    }).spend
    ;(function () {
      Token.unlockTransfer(alice, bobHash, spend, 1, lock)
    }).should.throw(/burns|ordinal/)
  })

  it('anti-burn: transferOrdinal rejects a token output not equal to the ordinal value', function () {
    var lock = Token.ordinalLock(Token.ownerId(alice))
    var bobHash = Token.ownerId(bob)
    var nextToken = Token.ordinalLock(bobHash)
    // Wrong: token output is 2 sat, not the ordinal's 1 sat.
    var tokenOutput = new Transaction.Output({ script: nextToken, satoshis: 2 })
    var change = p2pkhOutput(PrivateKey.fromRandom(), 5000)
    var spend = fundAndSpend(lock, 1, { outputs: [tokenOutput, change] }).spend
    ;(function () {
      Token.transferOrdinal(alice, bobHash, spend, 1, lock, { tokenIndex: 0 })
    }).should.throw(/equal the ordinal|burn/)
  })
})
