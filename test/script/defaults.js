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
