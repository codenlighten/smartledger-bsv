'use strict'

/* global describe, it */

// `verify()` describes BSV mainnet as it is today when the caller says nothing.
//
// Until 8.0.0 it defaulted to `0` — no rules at all. That is the wrong direction to be
// wrong in: a validator looser than consensus accepts scripts the network rejects, and
// nothing that tests this library against itself can see it. The node vectors found 21
// such cases the first time they were run.
//
// The set is not assembled by judgement. It mirrors what tools/sv-vector-harness.js
// applies, including the MONOLITH/MAGNETIC pair — BSV restored those opcodes in 2018 and
// the node does not gate them, so omitting them here would make the default STRICTER
// than consensus.

require('chai').should()
var bsv = require('../..')
var Script = bsv.Script
var Interpreter = Script.Interpreter
var Opcode = bsv.Opcode
var BN = bsv.crypto.BN

describe('verify() consensus defaults', function () {
  var FLAGS = Interpreter.currentConsensusFlags()

  it('includes both era pairs, for the spend and the output being spent', function () {
    ;[
      'SCRIPT_GENESIS', 'SCRIPT_UTXO_AFTER_GENESIS',
      'SCRIPT_ENABLE_CHRONICLE', 'SCRIPT_UTXO_AFTER_CHRONICLE'
    ].forEach(function (name) {
      (FLAGS & Interpreter[name]).should.equal(Interpreter[name], name + ' missing from the default')
    })
  })

  // Omitting these would make the library stricter than the node, which is the error
  // #112 fixed in mainnetFlags(). The harness sets the same pair for every vector.
  it('enables the opcode groups the node does not gate', function () {
    (FLAGS & Interpreter.SCRIPT_ENABLE_MONOLITH_OPCODES)
      .should.equal(Interpreter.SCRIPT_ENABLE_MONOLITH_OPCODES)
    ;(FLAGS & Interpreter.SCRIPT_ENABLE_MAGNETIC_OPCODES)
      .should.equal(Interpreter.SCRIPT_ENABLE_MAGNETIC_OPCODES)
  })

  it('does not enable the pre-Genesis timelock flags', function () {
    // Genesis reverted CLTV/CSV to upgradable NOPs; carrying their flags made
    // mainnetFlags() report timelocked outputs unspendable. See #112.
    ;(FLAGS & Interpreter.SCRIPT_VERIFY_CHECKLOCKTIMEVERIFY).should.equal(0)
    ;(FLAGS & Interpreter.SCRIPT_VERIFY_CHECKSEQUENCEVERIFY).should.equal(0)
  })

  describe('applied by verify()', function () {
    function evaluate (build, args) {
      var script = new Script()
      build(script)
      var interp = new Interpreter()
      var verified = interp.verify.apply(interp, [new Script(), script].concat(args || []))
      return { verified: verified, errstr: interp.errstr || '' }
    }

    // OP_VER is a Chronicle opcode. Reaching it without BAD_OPCODE proves the default
    // enabled Chronicle rather than merely exposing a constant.
    it('evaluates a Chronicle opcode with no flags argument', function () {
      var r = evaluate(function (s) { s.add(Opcode.OP_VER) }, [new bsv.Transaction(), 0])
      r.errstr.should.not.match(/BAD_OPCODE/)
    })

    it('still lets the caller select older rules explicitly', function () {
      var r = evaluate(function (s) { s.add(Opcode.OP_VER) }, [new bsv.Transaction(), 0, 0])
      r.verified.should.equal(false)
      r.errstr.should.match(/BAD_OPCODE/)
    })

    // FORKID changes the sighash algorithm and cannot be applied without the input
    // amount — verify() rejects that combination outright. Rather than forcing every
    // caller to supply satoshis for scripts containing no signature check, the flag is
    // dropped when there is nothing for it to act on. A FORKID-signed input without the
    // amount then fails to verify, which is a false negative, never a false positive.
    it('drops FORKID when no input amount is supplied, instead of throwing', function () {
      ;(function () {
        evaluate(function (s) { s.add(Opcode.OP_1) }, [new bsv.Transaction(), 0])
      }).should.not.throw()
    })

    it('keeps FORKID when the input amount is supplied', function () {
      var interp = new Interpreter()
      var script = new Script().add(Opcode.OP_1)
      interp.verify(new Script(), script, new bsv.Transaction(), 0, undefined, new BN(1000))
      ;(interp.flags & Interpreter.SCRIPT_ENABLE_SIGHASH_FORKID)
        .should.equal(Interpreter.SCRIPT_ENABLE_SIGHASH_FORKID)
    })
  })
})

// The script-number bound is era-derived, not a process-wide static.
//
// `mainnetFlags()` omitted every era flag except SCRIPT_ENABLE_CHRONICLE, so
// `maxScriptNumLength()` fell back to the pre-Genesis 4 for a validator built from the
// helper named after mainnet — while post-Genesis is 750,000 and post-Chronicle
// 32,000,000. An earlier fix pinned MAXIMUM_ELEMENT_SIZE to stop useGenesisLimits()
// raising it to 0x7fffffff and making Chronicle's shift-overflow check unreachable; that
// treated the symptom rather than the missing flags.
//
// The node's vectors settle the pre-Genesis value at 4 and are silent above it: all 22
// SCRIPTNUM_OVERFLOW rows carry P2SH,STRICTENC and no era flag, and raising the static
// bound to 8 turns 15 of them into false accepts.
describe('script-number bound follows the era', function () {
  function boundFor (flags) {
    var i = new Interpreter()
    i.set({ flags: flags })
    return i.maxScriptNumLength()
  }

  it('is 4 before Genesis, which the node vectors pin', function () {
    boundFor(0).should.equal(4)
  })

  it('is the post-Genesis figure when only Genesis is asked for', function () {
    boundFor(Interpreter.mainnetFlags({ afterChronicle: false }))
      .should.equal(Interpreter.MAX_SCRIPT_NUM_LENGTH_AFTER_GENESIS)
  })

  it('is the post-Chronicle figure under mainnetFlags() and the default', function () {
    boundFor(Interpreter.mainnetFlags())
      .should.equal(Interpreter.MAX_SCRIPT_NUM_LENGTH_AFTER_CHRONICLE)
    boundFor(Interpreter.currentConsensusFlags())
      .should.equal(Interpreter.MAX_SCRIPT_NUM_LENGTH_AFTER_CHRONICLE)
  })

  // Genesis activated in 2020 and nothing still spendable predates it in a way that
  // makes a mainnet helper want the older limits, so it is not opt-out-able here.
  it('carries the Genesis era flags in mainnetFlags(), both variants', function () {
    ;[Interpreter.mainnetFlags(), Interpreter.mainnetFlags({ afterChronicle: false })].forEach(function (f) {
      (f & Interpreter.SCRIPT_GENESIS).should.equal(Interpreter.SCRIPT_GENESIS)
      ;(f & Interpreter.SCRIPT_UTXO_AFTER_GENESIS).should.equal(Interpreter.SCRIPT_UTXO_AFTER_GENESIS)
    })
  })

  it('drops only the Chronicle pair for a pre-activation UTXO', function () {
    var pre = Interpreter.mainnetFlags({ afterChronicle: false })
    ;(pre & Interpreter.SCRIPT_ENABLE_CHRONICLE).should.equal(0)
    ;(pre & Interpreter.SCRIPT_UTXO_AFTER_CHRONICLE).should.equal(0)
  })

  // useMainnetConsensus() must no longer pin the static; the flags carry the bound.
  //
  // The limits are process-wide statics, so this saves and restores them. Without the
  // restore the raised caps leak into every later test in the same mocha process — 24 of
  // them, when this was first written, including the inherited pre-Genesis bitcoind
  // vectors. The same trap #114 hit and documented.
  it('is not overridden by useMainnetConsensus()', function () {
    var saved = Interpreter.getLimits()
    try {
      var flags = Interpreter.useMainnetConsensus()
      boundFor(flags).should.equal(Interpreter.MAX_SCRIPT_NUM_LENGTH_AFTER_CHRONICLE)
    } finally {
      Interpreter.setLimits(saved)
    }
  })
})
