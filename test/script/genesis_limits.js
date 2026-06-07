'use strict'

/* global describe, it, beforeEach, afterEach */
var should = require('chai').should()
var bsv = require('../..')
var Interpreter = bsv.Script.Interpreter
var Script = bsv.Script
var Opcode = bsv.Opcode
var Transaction = bsv.Transaction

// Post-Genesis BSV removed the pre-Genesis script limits (520-byte element,
// 4-byte script number, 201 opcodes). These are now configurable so modern
// covenants (e.g. OP_PUSH_TX) can be evaluated. Defaults are unchanged.
describe('Interpreter post-Genesis limits', function () {
  var saved

  beforeEach(function () {
    saved = {
      el: Interpreter.MAX_SCRIPT_ELEMENT_SIZE,
      num: Interpreter.MAXIMUM_ELEMENT_SIZE,
      ops: Interpreter.MAX_OPS_PER_SCRIPT
    }
  })
  afterEach(function () {
    Interpreter.MAX_SCRIPT_ELEMENT_SIZE = saved.el
    Interpreter.MAXIMUM_ELEMENT_SIZE = saved.num
    Interpreter.MAX_OPS_PER_SCRIPT = saved.ops
  })

  it('keeps pre-Genesis defaults out of the box', function () {
    Interpreter.MAX_SCRIPT_ELEMENT_SIZE.should.equal(520)
    Interpreter.MAXIMUM_ELEMENT_SIZE.should.equal(4)
    Interpreter.MAX_OPS_PER_SCRIPT.should.equal(201)
  })

  it('useGenesisLimits() lifts all three caps', function () {
    Interpreter.useGenesisLimits()
    Interpreter.MAX_SCRIPT_ELEMENT_SIZE.should.equal(0x7fffffff)
    Interpreter.MAXIMUM_ELEMENT_SIZE.should.equal(0x7fffffff)
    Interpreter.MAX_OPS_PER_SCRIPT.should.equal(0x7fffffff)
  })

  // <2^32> <2^32> OP_ADD <2^33> OP_NUMEQUAL  — operands exceed the 4-byte cap.
  var bigAdd = new Script()
    .add(Buffer.from('0000000001', 'hex')) // 2^32, little-endian, 5 bytes
    .add(Buffer.from('0000000001', 'hex'))
    .add(Opcode.OP_ADD)
    .add(Buffer.from('0000000002', 'hex')) // 2^33
    .add(Opcode.OP_NUMEQUAL)

  function run (lock) {
    var interp = new Interpreter()
    var ok
    try { ok = interp.verify(new Script(), lock, new Transaction(), 0, 0) } catch (e) { ok = false }
    return ok
  }

  it('rejects >4-byte arithmetic under default limits', function () {
    run(bigAdd).should.equal(false)
  })

  it('allows >4-byte arithmetic after useGenesisLimits()', function () {
    Interpreter.useGenesisLimits()
    run(bigAdd).should.equal(true)
  })

  // 220 OP_NOPs then OP_1 — more non-push opcodes than the 201 cap allows.
  var manyOps = new Script()
  for (var i = 0; i < 220; i++) manyOps.add(Opcode.OP_NOP)
  manyOps.add(Opcode.OP_1)

  it('rejects >201 opcodes under default limits', function () {
    run(manyOps).should.equal(false)
  })

  it('allows >201 opcodes after useGenesisLimits()', function () {
    Interpreter.useGenesisLimits()
    run(manyOps).should.equal(true)
  })
})
