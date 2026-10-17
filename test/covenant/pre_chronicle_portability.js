'use strict'

/* global describe, it */

// Which covenants this library builds work on a PRE-CHRONICLE chain, and — the part that
// matters — whether the ones that do not FAIL CLOSED.
//
// Chronicle restored the splice opcodes. Before it, `OP_SUBSTR` (0xb3), `OP_LEFT` (0xb4) and
// `OP_RIGHT` (0xb5) are **silent no-ops**: measured, they leave their operands on the stack and
// raise no error. That is far more dangerous than BAD_OPCODE would be, because a script whose
// field extraction quietly does nothing keeps running with the wrong stack.
//
// So the question is not "do these covenants work pre-Chronicle" — they cannot, they read
// preimage fields by slicing. It is whether a spend of one can SUCCEED with its extraction
// having done nothing. Measured here: it cannot. The value covenants fail
// SCRIPT_ERR_EVAL_FALSE_IN_STACK and the Token fails SCRIPT_ERR_EQUALVERIFY.
//
// The OP_PUSH_TX gate is a different case: `PushTx.authenticator()` contains **no**
// Chronicle-gated opcode, so it authenticates a preimage pre-Chronicle. But it does NOT travel
// below Genesis, and the reason is not opcode availability at all — it is the size limits:
//
//   Monolith (2018)  OP_SPLIT / OP_CAT and the rest of that group become available. They cannot
//                    be disabled in this library, so it can say nothing about any earlier era.
//   Genesis (2020)   element size and script numbers become unbounded. REQUIRED BY THE GATE: the
//                    preimage is 536 bytes against a 520-byte pre-Genesis element limit, and the
//                    in-script s-value arithmetic is 32 bytes against a 4-byte CScriptNum cap.
//   Chronicle        OP_SUBSTR / OP_LEFT / OP_RIGHT return. Required by every covenant that READS
//                    the authenticated preimage by slicing; before it they are silent no-ops.
//
// So the floor for a covenant built with this library is GENESIS, and Chronicle on top of it for
// anything that slices. A peer reached the same floor from the other direction — their regtest
// spend failed "Push value size limit exceeded" until genesisactivationheight=1 — after we had
// both briefly attributed it to OP_SPLIT, which is Monolith-era and unconditional.
//
// This file exists because of a near-miss: the first run of it looked like the authenticator was
// "passing without its slices", which would have been a serious finding. It has no slices. The
// control that caught it is the opcode scan below, which asserts WHICH constructions contain a
// gated opcode rather than assuming it from the name.

require('chai').should()
var bsv = require('../..')
var SC = bsv.SmartContract
var I = bsv.Script.Interpreter
var P = SC.PushTx
var H = SC.CovenantHelpers
var Token = SC.Token
var A = SC.Authorizers

var SATS = 100000
var FEE = 500
var MAIN = H.flags()
var PRE = MAIN & ~I.SCRIPT_UTXO_AFTER_CHRONICLE
var PRE_GENESIS = MAIN & ~(I.SCRIPT_UTXO_AFTER_GENESIS | I.SCRIPT_GENESIS |
  I.SCRIPT_UTXO_AFTER_CHRONICLE | I.SCRIPT_ENABLE_CHRONICLE)
// the splice opcodes Chronicle restores, which are no-ops before it
var GATED = [0xb3, 0xb4, 0xb5]

function gatedOpcodesIn (script) {
  var buf = script.toBuffer()
  var found = {}
  var i = 0
  while (i < buf.length) {
    var op = buf[i]
    if (op >= 0x01 && op <= 0x4b) { i += 1 + op; continue }
    if (op === 0x4c) { i += 2 + buf[i + 1]; continue }
    if (op === 0x4d) { i += 3 + buf.readUInt16LE(i + 1); continue }
    if (op === 0x4e) { i += 5 + buf.readUInt32LE(i + 1); continue }
    if (GATED.indexOf(op) !== -1) found[op] = true
    i++
  }
  return Object.keys(found).map(Number)
}

function verify (unlock, lock, tx, flags) {
  var interp = new I()
  var ok = interp.verify(unlock, lock, tx, 0, flags, new bsv.crypto.BN(SATS))
  return { ok: ok, err: interp.errstr || '' }
}

function p2pkhOut (seed, sats) {
  var k = bsv.PrivateKey.fromBuffer(Buffer.from(seed.repeat(32), 'hex'))
  return new bsv.Transaction.Output({
    script: bsv.Script.buildPublicKeyHashOut(k.toAddress()), satoshis: sats
  })
}

describe('covenants on a pre-Chronicle chain', function () {
  this.timeout(30000)

  it('the splice opcodes are silent no-ops before Chronicle, not errors', function () {
    // <"abcdef"> 1 2 OP_SUBSTR  — post-Chronicle slices, pre-Chronicle leaves all three items
    var hex = '06616263646566' + '51' + '52' + 'b3'
    var tx = new bsv.Transaction()
    tx.from(new bsv.Transaction.UnspentOutput({
      txId: 'e'.repeat(64), outputIndex: 0, script: '51', satoshis: SATS
    }))
    tx.to(p2pkhOut('44', 500).script, 500)

    var pre = new I()
    pre.verify(new bsv.Script(), bsv.Script.fromHex(hex), tx, 0, PRE, new bsv.crypto.BN(SATS))
    pre.errstr.should.not.match(/BAD_OPCODE/, 'a no-op, not a rejection — that is the hazard')
    pre.stack.length.should.equal(3, 'the operands are left where they were')

    var post = new I()
    post.verify(new bsv.Script(), bsv.Script.fromHex(hex), tx, 0, MAIN, new bsv.crypto.BN(SATS))
    post.stack.length.should.equal(1)
    post.stack[0].toString('hex').should.equal('6263')
  })

  // The control for everything below: assert which constructions actually contain a gated
  // opcode, so a "passes pre-Chronicle" result cannot be misread as a skipped constraint.
  // The limit of what this file can establish, and of what the library can: the Monolith and
  // Magnetic group cannot be turned off, so a verify() here is not evidence about a chain at
  // pre-2018 rules. A peer's portability argument rested on OP_SPLIT "failing closed below
  // Genesis"; in this library it does not fail at all, under any flag set.
  it('cannot disable OP_SPLIT, so it is not evidence about a pre-Monolith chain', function () {
    var hex = '06616263646566' + '52' + '7f' // <"abcdef"> 2 OP_SPLIT
    var tx = new bsv.Transaction()
    tx.from(new bsv.Transaction.UnspentOutput({
      txId: 'e'.repeat(64), outputIndex: 0, script: '51', satoshis: SATS
    }))
    tx.to(p2pkhOut('44', 500).script, 500)
    var sets = [
      ['SCRIPT_VERIFY_NONE', I.SCRIPT_VERIFY_NONE],
      ['mainnet', MAIN],
      ['mainnet minus MONOLITH', MAIN & ~I.SCRIPT_ENABLE_MONOLITH_OPCODES],
      ['mainnet minus MONOLITH and MAGNETIC',
        MAIN & ~(I.SCRIPT_ENABLE_MONOLITH_OPCODES | I.SCRIPT_ENABLE_MAGNETIC_OPCODES)],
      ['pre-Chronicle', PRE]
    ]
    sets.forEach(function (pair) {
      var interp = new I()
      interp.verify(new bsv.Script(), bsv.Script.fromHex(hex), tx, 0, pair[1],
        new bsv.crypto.BN(SATS))
      ;(interp.errstr || '').should.equal('', 'OP_SPLIT must run under ' + pair[0])
      interp.stack[interp.stack.length - 1].toString('hex').should.equal('63646566')
    })
  })

  it('says which constructions depend on Chronicle, rather than assuming it', function () {
    var k = bsv.PrivateKey.fromBuffer(Buffer.from('59'.repeat(32), 'hex'))
    var auth = A.singleKey({ pinSighash: true })
    gatedOpcodesIn(P.authenticator()).should.deep.equal([],
      'the OP_PUSH_TX gate must not depend on Chronicle')
    gatedOpcodesIn(P.valueCovenant(P.hashOutputs([p2pkhOut('44', 500)])))
      .should.have.length.above(0)
    gatedOpcodesIn(Token.ownershipToken(FEE, auth.commit(k), auth))
      .should.have.length.above(0)
  })

  it('authenticates a preimage pre-Chronicle, because the gate needs no gated opcode', function () {
    var lock = P.authenticator()
    var spend = H.fundAndSpend(lock, SATS, { outputs: [p2pkhOut('55', SATS - FEE)] }).spend
    P.grind(spend, 0, lock, SATS)
    var unlock = new bsv.Script().add(Buffer.from(H.rawPreimage(spend, 0, lock, SATS)))
    spend.inputs[0].setScript(unlock)
    verify(unlock, lock, spend, MAIN).ok.should.equal(true)
    verify(unlock, lock, spend, PRE).ok.should.equal(true)
  })

  it('does NOT travel below Genesis: the preimage cannot even be pushed', function () {
    var lock = P.authenticator()
    var spend = H.fundAndSpend(lock, SATS, { outputs: [p2pkhOut('55', SATS - FEE)] }).spend
    P.grind(spend, 0, lock, SATS)
    var preimage = H.rawPreimage(spend, 0, lock, SATS)
    preimage.length.should.be.above(520, 'the pre-Genesis element limit is 520 bytes')
    var unlock = new bsv.Script().add(Buffer.from(preimage))
    spend.inputs[0].setScript(unlock)
    verify(unlock, lock, spend, MAIN).ok.should.equal(true)
    var pre = verify(unlock, lock, spend, PRE_GENESIS)
    pre.ok.should.equal(false)
    pre.err.should.equal('SCRIPT_ERR_PUSH_SIZE')
  })

  it('and both Genesis limits the gate depends on are era-gated, isolated', function () {
    var tx = new bsv.Transaction()
    tx.from(new bsv.Transaction.UnspentOutput({
      txId: 'e'.repeat(64), outputIndex: 0, script: '51', satoshis: SATS
    }))
    tx.to(p2pkhOut('44', 500).script, 500)
    function raw (hex, flags) {
      var interp = new I()
      interp.verify(new bsv.Script(), bsv.Script.fromHex(hex), tx, 0, flags,
        new bsv.crypto.BN(SATS))
      return interp.errstr || 'no error'
    }
    // a 536-byte element, the size the gate's preimage actually is
    var bigPush = '4d' + '1802' + 'aa'.repeat(536) + '51'
    raw(bigPush, PRE_GENESIS).should.equal('SCRIPT_ERR_PUSH_SIZE')
    raw(bigPush, MAIN).should.equal('no error')
    // OP_CAT producing 528 bytes: the limit applies to a CONSTRUCTED element too
    var cat528 = '4d' + '0801' + 'bb'.repeat(264) + '4d' + '0801' + 'cc'.repeat(264) + '7e' + '51'
    raw(cat528, PRE_GENESIS).should.equal('SCRIPT_ERR_PUSH_SIZE')
    raw(cat528, MAIN).should.equal('no error')
    // and the 32-byte arithmetic the s-value computation needs
    var bigArith = '20' + 'dd'.repeat(32) + '20' + 'ee'.repeat(32) + '93' + '75' + '51'
    raw(bigArith, PRE_GENESIS).should.equal('SCRIPT_ERR_SCRIPTNUM_OVERFLOW')
    raw(bigArith, MAIN).should.equal('no error')
  })

  it('FAILS CLOSED for a value covenant, which reads the preimage by slicing', function () {
    var out = p2pkhOut('56', SATS - FEE)
    var lock = P.valueCovenant(P.hashOutputs([out]))
    var spend = H.fundAndSpend(lock, SATS, { outputs: [out] }).spend
    P.grind(spend, 0, lock, SATS)
    var unlock = new bsv.Script().add(Buffer.from(H.rawPreimage(spend, 0, lock, SATS)))
    spend.inputs[0].setScript(unlock)
    verify(unlock, lock, spend, MAIN).ok.should.equal(true)
    var pre = verify(unlock, lock, spend, PRE)
    pre.ok.should.equal(false, 'it must not be spendable with its output pin unevaluated')
    pre.err.should.equal('SCRIPT_ERR_EVAL_FALSE_IN_STACK')
  })

  it('FAILS CLOSED for the stateful Token, which splices its own state', function () {
    var auth = A.singleKey({ pinSighash: true })
    var alice = bsv.PrivateKey.fromBuffer(Buffer.from('57'.repeat(32), 'hex'))
    var bob = bsv.PrivateKey.fromBuffer(Buffer.from('58'.repeat(32), 'hex'))
    var lock = Token.ownershipToken(FEE, auth.commit(alice), auth)
    var bobHash = auth.commit(bob)
    var spend = H.fundAndSpend(lock, SATS, {
      outputs: [new bsv.Transaction.Output({
        script: Token.ownershipToken(FEE, bobHash, auth), satoshis: SATS - FEE
      })]
    }).spend
    var unlock = Token.unlockTransfer(alice, bobHash, spend, SATS, lock, { auth: auth })
    spend.inputs[0].setScript(unlock)
    verify(unlock, lock, spend, MAIN).ok.should.equal(true)
    var pre = verify(unlock, lock, spend, PRE)
    pre.ok.should.equal(false, 'it must not transfer with its owner check unevaluated')
    pre.err.should.equal('SCRIPT_ERR_EQUALVERIFY')
  })
})
