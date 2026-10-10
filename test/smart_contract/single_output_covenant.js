'use strict'

/* global describe, it */

// valueCovenantSingle: an output covenant under SIGHASH_SINGLE.
//
// Proposed by the ticketmint-july2026 session (via op-if-contracts) as
// PushTx.valueCovenantSingle. The request also asked for grind({ sighashType }), which
// already shipped — so the only new thing here is the named helper, and the case for it is
// that it is not sugar. Composing it the obvious way, valueCovenant(hashOutputs([pinned]))
// with assertSighashType appended afterwards, builds a lock that fails the HONEST spend:
// pushTxCore consumes the preimage copy it checks, so an assertion appended after the
// covenant body has nothing left to read. The last test here pins that, because the
// ordering is the entire reason the helper exists.
//
// The hazard in the last-but-one test is deliberate and asserted, not tolerated. Under
// SIGHASH_SINGLE the preimage commits to the output at the input's index and nothing else,
// so this covenant binds ONE output and leaves the rest free. That is what makes the flag
// useful for marketplace trades and what makes it wrong for binding where value goes.
// Asserting it means a future change to that behaviour has to come past this file.

require('chai').should()
var bsv = require('../..')
var Script = bsv.Script
var PrivateKey = bsv.PrivateKey
var PushTx = bsv.SmartContract.PushTx
var help = bsv.SmartContract.CovenantHelpers

var SATS = 100000
var SINGLE = PushTx.SIGHASH_SINGLE_FORKID

describe('valueCovenantSingle (SIGHASH_SINGLE output covenant)', function () {
  this.timeout(20000)

  var beneficiary = PrivateKey.fromRandom()
  var attacker = PrivateKey.fromRandom()

  function pinnedOutput () { return help.p2pkhOutput(beneficiary, SATS - 500) }

  // Returns the verify result for spending `lock` with `outputs` under `flag`.
  function spendWith (lock, outputs, flag) {
    var spend = help.fundAndSpend(lock, SATS, { outputs: outputs }).spend
    var g = PushTx.grind(spend, 0, lock, SATS, { sighashType: flag || SINGLE })
    spend.inputs[0].setScript(new Script().add(g.preimage))
    return help.verify(spend.inputs[0].script, lock, { tx: spend, satoshis: SATS })
  }

  it('accepts the honest spend that recreates the pinned output', function () {
    var pinned = pinnedOutput()
    spendWith(PushTx.valueCovenantSingle(pinned), [pinned]).ok.should.equal(true)
  })

  it('takes an Output or its digest, and builds the same lock either way', function () {
    var pinned = pinnedOutput()
    var fromOutput = PushTx.valueCovenantSingle(pinned)
    var fromDigest = PushTx.valueCovenantSingle(PushTx.hashOutputs([pinned]))
    fromOutput.toHex().should.equal(fromDigest.toHex())
    spendWith(fromDigest, [pinned]).ok.should.equal(true)
  })

  it('refuses a spend that puts someone else at the pinned index', function () {
    var pinned = pinnedOutput()
    spendWith(PushTx.valueCovenantSingle(pinned),
      [help.p2pkhOutput(attacker, SATS - 500)]).ok.should.equal(false)
  })

  it('pins the flag, so the lock cannot be spent under SIGHASH_ALL', function () {
    var pinned = pinnedOutput()
    spendWith(PushTx.valueCovenantSingle(pinned), [pinned],
      PushTx.SIGHASH_ALL_FORKID).ok.should.equal(false)
  })

  it('accepts the ANYONECANPAY variant, which also leaves sibling inputs open', function () {
    var pinned = pinnedOutput()
    var lock = PushTx.valueCovenantSingle(pinned,
      { sighashType: PushTx.SIGHASH_SINGLE_ANYONECANPAY_FORKID })
    spendWith(lock, [pinned], PushTx.SIGHASH_SINGLE_ANYONECANPAY_FORKID).ok.should.equal(true)
  })

  it('refuses to build a lock whose name would be a lie', function () {
    var pinned = pinnedOutput()
    ;(function () {
      PushTx.valueCovenantSingle(pinned, { sighashType: PushTx.SIGHASH_ALL_FORKID })
    }).should.throw(/SIGHASH_SINGLE variant/)
    ;(function () { PushTx.valueCovenantSingle(Buffer.alloc(31)) }).should.throw(/32-byte/)
    ;(function () { PushTx.valueCovenantSingle('deadbeef') }).should.throw(/32-byte/)
    ;(function () { PushTx.valueCovenantSingle() }).should.throw(/32-byte/)
  })

  it('constrains ONE output and leaves the rest free — the documented hazard', function () {
    // Not a gap in the helper: it is what SIGHASH_SINGLE means. The preimage's hashOutputs
    // covers the output at the input's index alone, so a spender may append whatever they
    // like. A covenant pinning a 0-satoshi burn here would constrain the burn and leave
    // the asset's satoshis free to go anywhere. Use valueCovenant to bind every output.
    var pinned = pinnedOutput()
    var r = spendWith(PushTx.valueCovenantSingle(pinned),
      [pinned, help.p2pkhOutput(attacker, 1)])
    r.ok.should.equal(true)
  })

  it('exists because the obvious composition fails the honest spend', function () {
    // valueCovenant consumes the preimage to produce hashOutputs; appending the flag
    // assertion afterwards leaves it nothing to read, and the lock rejects the very spend
    // it was built for. Same byte count, so size is no clue that it is wrong.
    var pinned = pinnedOutput()
    var naive = PushTx.valueCovenant(PushTx.hashOutputs([pinned]))
    PushTx.assertSighashType(naive, SINGLE)
    spendWith(naive, [pinned]).ok.should.equal(false)
    naive.toBuffer().length.should.equal(PushTx.valueCovenantSingle(pinned).toBuffer().length)
  })
})
