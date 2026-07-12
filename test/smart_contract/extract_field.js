'use strict'

/* global describe, it */

// Regression for the inverted OP_SPLIT/OP_DROP idiom in CovenantBuilder.extractField.
// After OP_SPLIT the RIGHT part is on top, so keeping it needs OP_NIP; the code used
// OP_DROP (which keeps the LEFT), so RIGHT-strategy fields (value, nSequence,
// hashOutputs, nLocktime, sighashType) extracted the WRONG bytes — a covenant that
// either fails to constrain the spend or is unspendable. These tests drive the real
// builder through the interpreter and assert the extracted bytes are correct.

require('chai').should()
var bsv = require('../..')
var Interpreter = bsv.Script.Interpreter
var Script = bsv.Script
var Opcode = bsv.Opcode
var Transaction = bsv.Transaction
var CovenantBuilder = require('../../lib/smart_contract/covenant_builder').CovenantBuilder

// Synthetic preimage: 120 bytes of filler + a 52-byte BIP-143 right zone whose
// fields are individually recognizable.
var FILLER = Buffer.alloc(120, 0x11)
var VALUE = Buffer.alloc(8, 0xaa)
var NSEQ = Buffer.alloc(4, 0xbb)
var HASHOUT = Buffer.alloc(32, 0xcc)
var NLOCK = Buffer.alloc(4, 0xdd)
var SIGHASH = Buffer.alloc(4, 0xee)
var PREIMAGE = Buffer.concat([FILLER, VALUE, NSEQ, HASHOUT, NLOCK, SIGHASH])

// Run `<PREIMAGE> <extractField(name) ops> <expected> OP_EQUAL` through the
// interpreter (fromASM avoids the separately-tracked _asmToHex issue).
function extractYields (fieldName, expected) {
  var b = new CovenantBuilder()
  b.extractField(fieldName)
  var extractScript = Script.fromASM(b.operations.join(' '))
  var lock = new Script().add(PREIMAGE)
  extractScript.chunks.forEach(function (c) { lock.chunks.push(c) })
  lock.add(expected).add(Opcode.OP_EQUAL)
  var interp = new Interpreter()
  return interp.verify(new Script(), lock, new Transaction(), 0,
    Interpreter.SCRIPT_ENABLE_MAGNETIC_OPCODES | Interpreter.SCRIPT_ENABLE_MONOLITH_OPCODES)
}

describe('CovenantBuilder.extractField (OP_SPLIT/OP_NIP regression)', function () {
  it('extracts RIGHT field "value" (offsetFromEnd 52, len 8)', function () {
    extractYields('value', VALUE).should.equal(true)
  })
  it('extracts RIGHT field "hashOutputs" (offsetFromEnd 40, len 32)', function () {
    extractYields('hashOutputs', HASHOUT).should.equal(true)
  })
  it('extracts RIGHT field "nSequence" (offsetFromEnd 44, len 4)', function () {
    extractYields('nSequence', NSEQ).should.equal(true)
  })
  it('extracts RIGHT field "sighashType" (offsetFromEnd 4, len 4)', function () {
    extractYields('sighashType', SIGHASH).should.equal(true)
  })
  it('extracts LEFT field "hashPrevouts" (offset 4, len 32)', function () {
    // First 4 bytes are filler(nVersion); bytes 4..36 are filler too here.
    extractYields('hashPrevouts', PREIMAGE.slice(4, 36)).should.equal(true)
  })
})
