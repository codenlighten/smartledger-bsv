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
    saved = Interpreter.getLimits()
  })
  afterEach(function () {
    Interpreter.setLimits(saved)
  })

  it('keeps pre-Genesis defaults out of the box', function () {
    Interpreter.MAX_SCRIPT_ELEMENT_SIZE.should.equal(520)
    Interpreter.MAXIMUM_ELEMENT_SIZE.should.equal(4)
    // 500, not Core's 201: BSV raised the limit before Genesis removed it.
    Interpreter.MAX_OPS_PER_SCRIPT.should.equal(500)
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
  // Over BSV's pre-Genesis limit of 500. It used to be 220, which is over
  // Core's 201 but comfortably inside what BSV allowed.
  var manyOps = new Script()
  for (var i = 0; i < 520; i++) manyOps.add(Opcode.OP_NOP)
  manyOps.add(Opcode.OP_1)

  it('rejects more opcodes than the pre-Genesis limit allows', function () {
    run(manyOps).should.equal(false)
  })

  it('allows them after useGenesisLimits()', function () {
    Interpreter.useGenesisLimits()
    run(manyOps).should.equal(true)
  })
  // Total script size was a hard-coded 10,000 in evaluate(), so useGenesisLimits()
  // could not lift it: any script over 10 KB failed SCRIPT_ERR_SCRIPT_SIZE regardless
  // of what the caller asked for. That put every sizeable 1Sat Ordinals inscription
  // out of reach of the interpreter entirely.
  function scriptOfSize (bytes) {
    // OP_DROP a single large push, then OP_1 — trivially true, but big.
    return new Script()
      .add(Buffer.alloc(bytes))
      .add(Opcode.OP_DROP)
      .add(Opcode.OP_1)
  }

  it('exposes the total script size cap as a constant, defaulting to pre-Genesis', function () {
    Interpreter.MAX_SCRIPT_SIZE.should.equal(10000)
  })

  // Intent inverted in 8.0.0. verify() now defaults to current mainnet, where Genesis
  // removed the size cap, so a 20 KB script is accepted unless the caller asks for the
  // pre-Genesis era. The cap is still enforced — it just has to be selected, which is
  // what the following test asserts.
  it('accepts a >10 KB script under the default (post-Genesis) rules', function () {
    Interpreter.useGenesisLimits()
    Interpreter.MAX_SCRIPT_SIZE = 10000 // the static cap is irrelevant post-Genesis
    var interp = new Interpreter()
    interp.verify(new Script(), scriptOfSize(20 * 1024)).should.equal(true)
  })

  it('rejects a >10 KB script when the pre-Genesis era is asked for', function () {
    Interpreter.useGenesisLimits() // lift element/ops caps so SIZE is what is under test
    Interpreter.MAX_SCRIPT_SIZE = 10000 // ...but keep the pre-Genesis size cap
    var interp = new Interpreter()
    // Flags omitted would mean post-Genesis; 0 selects the older rules explicitly.
    interp.verify(new Script(), scriptOfSize(20 * 1024), new bsv.Transaction(), 0, 0).should.equal(false)
    interp.errstr.should.equal('SCRIPT_ERR_SCRIPT_SIZE')
  })

  it('allows a >10 KB script after useGenesisLimits()', function () {
    Interpreter.useGenesisLimits()
    run(scriptOfSize(20 * 1024)).should.equal(true)
  })

  // Genesis lifted the 520-byte element cap, and OP_CAT is where an
  // implementation is most likely to keep enforcing it: it is the one opcode
  // that can grow an element past the limit from two legal halves. This read
  // the static constant rather than the era-derived size, so it stayed capped
  // at 520 after Genesis and rejected concatenations the network accepts.
  //
  // No vector in the SV corpus covers it, so the corpus passes completely
  // either way. It is held here instead.
  describe('OP_CAT and the element size cap', function () {
    var MONOLITH = Interpreter.SCRIPT_ENABLE_MONOLITH_OPCODES

    // Two 300-byte pushes: each is legal pre-Genesis, their concatenation is
    // not. Nothing but the cap distinguishes the two cases below.
    var cat = new Script()
      .add(Buffer.alloc(300, 1))
      .add(Buffer.alloc(300, 1))
      .add(Opcode.OP_CAT)

    function runWith (flags) {
      var interp = new Interpreter()
      var ok
      try {
        ok = interp.verify(new Script(), cat, new Transaction(), 0, flags)
      } catch (e) {
        ok = false
      }
      return { ok: ok, errstr: interp.errstr }
    }

    it('rejects a 600-byte concatenation before Genesis', function () {
      var got = runWith(MONOLITH)
      got.ok.should.equal(false)
      got.errstr.should.equal('SCRIPT_ERR_PUSH_SIZE')
    })

    it('allows it after Genesis', function () {
      var got = runWith(MONOLITH | Interpreter.SCRIPT_UTXO_AFTER_GENESIS)
      got.ok.should.equal(true, 'rejected with ' + got.errstr)
    })
  })

  it('useGenesisLimits raises all four caps, and getLimits/setLimits round-trip', function () {
    var before = Interpreter.getLimits()
    before.maxScriptSize.should.equal(10000)
    Interpreter.useGenesisLimits(64 * 1024)
    var after = Interpreter.getLimits()
    after.maxScriptElementSize.should.equal(64 * 1024)
    after.maximumElementSize.should.equal(64 * 1024)
    after.maxOpsPerScript.should.equal(64 * 1024)
    after.maxScriptSize.should.equal(64 * 1024)
    Interpreter.setLimits(before)
    Interpreter.getLimits().maxScriptSize.should.equal(10000)
    Interpreter.MAX_SCRIPT_ELEMENT_SIZE.should.equal(520)
  })
})
