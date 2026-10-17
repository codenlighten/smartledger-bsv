'use strict'

/* global describe, it, before, after */

// A complete output covenant with NO era dependency: it runs on a chain that has activated
// neither Genesis nor Chronicle, only the 2018 Monolith opcodes.
//
// Two changes get there, and both were forced by measurement rather than chosen:
//
//   the GATE   `pushTxCoreCompact` is 89 bytes, so its preimage is 246 — under the 520-byte
//              pre-Genesis element cap — and its arithmetic is one byte, under the 4-byte
//              pre-Genesis script-number cap. The 377-byte classic gate fails both.
//   the FIELD  `extractHashOutputsPortable` replaces `OP_RIGHT`/`OP_LEFT`, which Chronicle
//              restored and which are silent NO-OPS before it, with OP_SIZE/OP_SUB/OP_SPLIT/
//              OP_NIP/OP_DROP. Ten bytes instead of six to drop an era dependency.
//
// Measured: 135 bytes, a 292-byte preimage, verifying on mainnet, pre-Chronicle, and
// pre-Genesis-and-pre-Chronicle together, and refusing a different output set. The classic
// `valueCovenant` is 419 bytes and needs both upgrades.
//
// Why this matters beyond size: it is the difference between "covenants need Genesis" and
// "covenants need the 2018 opcodes". Those are different deployment answers for any chain whose
// activation heights are not BSV mainnet's.

require('chai').should()
var bsv = require('../..')
var Script = bsv.Script
var BN = bsv.crypto.BN
var SC = bsv.SmartContract
var P = SC.PushTx
var H = SC.CovenantHelpers
var I = bsv.Script.Interpreter

var SATS = 50000
var FEE = 500
var PRE_GENESIS_LIMITS = {
  maxScriptElementSize: 520,
  maxScriptSize: 10000,
  maxOpsPerScript: 500,
  maxScriptNumLength: 4
}
// the Chronicle-gated splice opcodes, which the portable form must not contain
var GATED = [0xb3, 0xb4, 0xb5]

function gatedIn (script) {
  var buf = script.toBuffer()
  var found = []
  var i = 0
  while (i < buf.length) {
    var op = buf[i]
    if (op >= 0x01 && op <= 0x4b) { i += 1 + op; continue }
    if (op === 0x4c) { i += 2 + buf[i + 1]; continue }
    if (op === 0x4d) { i += 3 + buf.readUInt16LE(i + 1); continue }
    if (op === 0x4e) { i += 5 + buf.readUInt32LE(i + 1); continue }
    if (GATED.indexOf(op) !== -1 && found.indexOf(op) === -1) found.push(op)
    i++
  }
  return found
}

function outputFor (seed, sats) {
  var k = bsv.PrivateKey.fromBuffer(Buffer.from(seed.repeat(32), 'hex'))
  return new bsv.Transaction.Output({
    script: bsv.Script.buildPublicKeyHashOut(k.toAddress()), satoshis: sats
  })
}

describe('portable output covenant (no Genesis, no Chronicle)', function () {
  this.timeout(30000)

  it('extracts hashOutputs without a Chronicle-gated opcode', function () {
    var portable = P.extractHashOutputsPortable(new Script())
    var classic = P.extractHashOutputs(new Script())
    gatedIn(portable).should.deep.equal([], 'the whole point: no OP_SUBSTR/LEFT/RIGHT')
    gatedIn(classic).should.have.length.above(0, 'the classic form does use them')
    portable.toBuffer().length.should.equal(10)
    classic.toBuffer().length.should.equal(6)
  })

  it('builds a covenant with no gated opcode anywhere in it', function () {
    var lock = P.valueCovenantPortable(P.hashOutputs([outputFor('88', SATS - FEE)]))
    gatedIn(lock).should.deep.equal([])
    lock.toBuffer().length.should.equal(135)
    P.valueCovenant(P.hashOutputs([outputFor('88', SATS - FEE)])).toBuffer().length
      .should.equal(419)
  })

  describe('spending it', function () {
    var saved
    before(function () { saved = I.getLimits(); I.useGenesisLimits() })
    after(function () { I.setLimits(saved) })

    function honestSpend () {
      var out = outputFor('88', SATS - FEE)
      var lock = P.valueCovenantPortable(P.hashOutputs([out]))
      var spend = H.fundAndSpend(lock, SATS, { outputs: [out] }).spend
      P.grind(spend, 0, lock, SATS, { form: 'compact' })
      var pre = H.rawPreimage(spend, 0, lock, SATS)
      spend.inputs[0].setScript(new Script().add(Buffer.from(pre)))
      return { lock: lock, spend: spend, preimage: pre }
    }

    it('verifies on mainnet, and its preimage fits the pre-Genesis cap', function () {
      var w = honestSpend()
      w.preimage.length.should.equal(292)
      w.preimage.length.should.be.below(520)
      H.verify(w.spend.inputs[0].script, w.lock, { tx: w.spend, satoshis: SATS }).ok
        .should.equal(true)
    })

    it('verifies pre-Chronicle, where the classic covenant fails closed', function () {
      var w = honestSpend()
      var preChronicle = I.mainnetFlags() & ~I.SCRIPT_UTXO_AFTER_CHRONICLE
      var interp = new I()
      interp.verify(w.spend.inputs[0].script, w.lock, w.spend, 0, preChronicle, new BN(SATS))
        .should.equal(true, 'pre-Chronicle verdict was ' + (interp.errstr || 'accept'))

      // the control: the classic covenant in the same conditions cannot evaluate its extraction
      var out = outputFor('88', SATS - FEE)
      var classic = P.valueCovenant(P.hashOutputs([out]))
      var cs = H.fundAndSpend(classic, SATS, { outputs: [out] }).spend
      P.grind(cs, 0, classic, SATS)
      cs.inputs[0].setScript(new Script().add(Buffer.from(H.rawPreimage(cs, 0, classic, SATS))))
      var ci = new I()
      ci.verify(cs.inputs[0].script, classic, cs, 0, preChronicle, new BN(SATS))
        .should.equal(false)
      ci.errstr.should.equal('SCRIPT_ERR_EVAL_FALSE_IN_STACK')
    })

    it('verifies pre-GENESIS and pre-Chronicle together, under pre-Genesis limits', function () {
      var w = honestSpend()
      var flags = I.mainnetFlags() & ~(I.SCRIPT_UTXO_AFTER_GENESIS | I.SCRIPT_GENESIS |
        I.SCRIPT_UTXO_AFTER_CHRONICLE | I.SCRIPT_ENABLE_CHRONICLE)
      var genesisLimits = I.getLimits()
      I.setLimits(PRE_GENESIS_LIMITS)
      try {
        var interp = new I()
        interp.verify(w.spend.inputs[0].script, w.lock, w.spend, 0, flags, new BN(SATS))
          .should.equal(true, 'pre-Genesis verdict was ' + (interp.errstr || 'accept'))
        // and the control that proves the caps were active in that run
        var ctrl = new I()
        ctrl.verify(new Script(), Script.fromHex('4d' + '1802' + 'aa'.repeat(536) + '51'),
          w.spend, 0, flags, new BN(SATS))
        ctrl.errstr.should.equal('SCRIPT_ERR_PUSH_SIZE')
      } finally { I.setLimits(genesisLimits) }
    })

    it('still binds: a different output set is refused', function () {
      var out = outputFor('88', SATS - FEE)
      var lock = P.valueCovenantPortable(P.hashOutputs([out]))
      var evil = H.fundAndSpend(lock, SATS, { outputs: [outputFor('89', SATS - FEE)] }).spend
      P.grind(evil, 0, lock, SATS, { form: 'compact' })
      evil.inputs[0].setScript(new Script().add(Buffer.from(H.rawPreimage(evil, 0, lock, SATS))))
      var r = H.verify(evil.inputs[0].script, lock, { tx: evil, satoshis: SATS })
      r.ok.should.equal(false)
      r.err.should.equal('SCRIPT_ERR_EVAL_FALSE_IN_STACK')
    })

    it('and a one-byte preimage mutation is refused', function () {
      var w = honestSpend()
      var bad = Buffer.from(w.preimage)
      bad[0] ^= 0x01
      var t = new bsv.Transaction(w.spend.toString())
      t.inputs[0].setScript(new Script().add(bad))
      H.verify(t.inputs[0].script, w.lock, { tx: t, satoshis: SATS }).ok.should.equal(false)
    })
  })
})
