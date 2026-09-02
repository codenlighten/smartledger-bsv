'use strict'

/* global describe, it, beforeEach, afterEach */
var should = require('chai').should()
var bsv = require('../..')
var BN = bsv.crypto.BN
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

  // MAXIMUM_ELEMENT_SIZE is no longer among them. It is CScriptNum's max_length, and
  // since the limits became era-derived it is only the PRE-Genesis fallback — raising it
  // could not enable post-Genesis arithmetic, only corrupt pre-Genesis validation.
  it('useGenesisLimits() lifts the size caps but not the script-number bound', function () {
    Interpreter.useGenesisLimits()
    Interpreter.MAX_SCRIPT_ELEMENT_SIZE.should.equal(0x7fffffff)
    Interpreter.MAX_OPS_PER_SCRIPT.should.equal(0x7fffffff)
    Interpreter.MAXIMUM_ELEMENT_SIZE.should.equal(4)
  })

  // The reason it must not be raised, stated as a test: a 5-byte operand is an overflow
  // before Genesis, and no process-wide call may turn that into an accept.
  it('cannot be made to accept a pre-Genesis script-number overflow', function () {
    var overflow = new Script()
      .add(Buffer.from('1234567890', 'hex'))
      .add(Buffer.from([2]))
      .add(Opcode.OP_MUL)
    var flags = Interpreter.SCRIPT_VERIFY_P2SH | Interpreter.SCRIPT_VERIFY_STRICTENC |
      Interpreter.SCRIPT_ENABLE_MONOLITH_OPCODES | Interpreter.SCRIPT_ENABLE_MAGNETIC_OPCODES
    Interpreter.useGenesisLimits()
    var interp = new Interpreter()
    interp.verify(new Script(), overflow, new bsv.Transaction(), 0, flags, new BN(0))
      .should.equal(false)
    interp.errstr.should.equal('SCRIPT_ERR_SCRIPTNUM_OVERFLOW')
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

  // Post-Genesis arithmetic is reached through the ERA, not through the static. Before
  // the limits became era-derived, useGenesisLimits() was the only route; it no longer
  // is, and using it for this would corrupt pre-Genesis validation elsewhere.
  it('allows >4-byte arithmetic when the post-Genesis era is asked for', function () {
    var interp = new Interpreter()
    interp.verify(new Script(), bigAdd, new bsv.Transaction(), 0,
      Interpreter.mainnetFlags(), new BN(0)).should.equal(true)
  })

  it('still rejects it under pre-Genesis rules, whatever the statics say', function () {
    Interpreter.useGenesisLimits()
    run(bigAdd).should.equal(false)
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

  // There are two op-count checks. The one in step() became era-derived; the one
  // inside OP_CHECKMULTISIG, which adds the key count, kept reading the static. So
  // the line that allows up to UINT32_MAX keys after Genesis was immediately
  // followed by one refusing them against a cap the era had removed — a validator
  // STRICTER than consensus, which is the harder kind to notice.
  //
  // No vector could catch it: every OP_COUNT vector in the node's corpus is
  // pre-Genesis, where the static and the era agree.
  describe('the CHECKMULTISIG op count is the era\'s, not the static', function () {
    var POST = Interpreter.SCRIPT_UTXO_AFTER_GENESIS | Interpreter.SCRIPT_GENESIS

    // 0-of-N: <dummy> <m=0> then N keys and N. No signature is checked, which is
    // what isolates the two COUNT rules from everything else CHECKMULTISIG does.
    function multisig (nKeys, nops, flags) {
      var key = bsv.PrivateKey.fromRandom().toPublicKey().toBuffer()
      var unlock = new Script().add(Opcode.OP_0).add(Opcode.OP_0)
      var lock = new Script()
      for (var j = 0; j < nops; j++) lock.add(Opcode.OP_NOP)
      for (var k = 0; k < nKeys; k++) lock.add(key)
      lock.add(new BN(nKeys).toScriptNumBuffer()).add(Opcode.OP_CHECKMULTISIG)
      var interp = new Interpreter()
      var ok = interp.verify(unlock, lock, new Transaction(), 0, flags, new BN(0))
      return ok ? 'ACCEPT' : interp.errstr
    }

    it('accepts more keys after Genesis than the pre-Genesis cap allowed', function () {
      // 600 keys is 20,404 bytes of script and 601 opcodes — over the pre-Genesis
      // 20-key, 500-op and 10,000-byte caps, all three of which Genesis removed or
      // raised. This returned SCRIPT_ERR_OP_COUNT.
      multisig(600, 0, POST).should.equal('ACCEPT')
    })

    it('still enforces the op count before Genesis', function () {
      // 490 NOPs + 20 keys + CHECKMULTISIG = 511 ops, but only 1,173 bytes, so the
      // size cap cannot be what rejects it.
      multisig(20, 490, 0).should.equal('SCRIPT_ERR_OP_COUNT')
      multisig(20, 0, 0).should.equal('ACCEPT')
    })

    it('still enforces the pre-Genesis 20-key cap', function () {
      multisig(21, 0, 0).should.equal('SCRIPT_ERR_PUBKEY_COUNT')
    })

    it('lifts the op count after Genesis, not just the key count', function () {
      multisig(20, 490, POST).should.equal('ACCEPT')
    })
  })

  // OP_BIN2NUM range-checked its result against a bare `_isMinimallyEncoded(buf)`,
  // whose nMaxNumSize argument defaults to MAXIMUM_ELEMENT_SIZE (4). Every era
  // therefore got the pre-Genesis width. The node passes maxScriptNumLength here,
  // and every OP_BIN2NUM vector in its corpus runs under P2SH,STRICTENC alone —
  // pre-Genesis, where 4 is the right answer either way — so the corpus was
  // consistent with both the correct implementation and this one.
  describe('OP_BIN2NUM honours the era script-number width', function () {
    // Any unsigned field whose top byte has the sign bit set needs a fifth byte to
    // stay positive: an 8-byte satoshi amount at or above 2^31 (21.47 BSV), and an
    // nLockTime at or above 0x80000000 (19 Jan 2038).
    function bin2num (bytes, flags) {
      var interp = new Interpreter()
      var ok = interp.verify(new Script().add(Buffer.from(bytes, 'hex')),
        new Script().add(Opcode.OP_BIN2NUM), new Transaction(), 0, flags, new BN(0))
      return { ok: ok, errstr: interp.errstr }
    }

    // 2,500,000,000 satoshis as the preimage carries it: 8 bytes, unsigned LE.
    var amount25BSV = '00f9029500000000'
    // 2147483648 = 19 Jan 2038, as nLockTime carries it, sign-padded to 5 bytes.
    var lockTime2038 = '0000008000'

    it('rejects a 5-byte result before Genesis, where 4 is the real cap', function () {
      var pre = Interpreter.SCRIPT_VERIFY_P2SH | Interpreter.SCRIPT_VERIFY_STRICTENC
      bin2num(amount25BSV, pre).errstr.should.equal('SCRIPT_ERR_INVALID_NUMBER_RANGE')
      bin2num(lockTime2038, pre).errstr.should.equal('SCRIPT_ERR_INVALID_NUMBER_RANGE')
    })

    it('accepts it under mainnet flags, where the cap is 32,000,000', function () {
      var main = Interpreter.mainnetFlags()
      bin2num(amount25BSV, main).ok.should.equal(true)
      bin2num(lockTime2038, main).ok.should.equal(true)
    })

    // The boundary, so the test fails if the cap is merely widened by a constant
    // rather than derived from the era.
    it('still rejects what is genuinely over the post-Genesis cap', function () {
      var interp = new Interpreter()
      interp.flags = Interpreter.mainnetFlags()
      interp.maxScriptNumLength().should.be.above(750000 - 1)
      Interpreter._isMinimallyEncoded(Buffer.alloc(5), 4).should.equal(false)
      Interpreter._isMinimallyEncoded(Buffer.from(lockTime2038, 'hex'), 750000).should.equal(true)
    })
  })

  it('useGenesisLimits raises the size caps, and getLimits/setLimits round-trip', function () {
    var before = Interpreter.getLimits()
    before.maxScriptSize.should.equal(10000)
    Interpreter.useGenesisLimits(64 * 1024)
    var after = Interpreter.getLimits()
    after.maxScriptElementSize.should.equal(64 * 1024)
    after.maxOpsPerScript.should.equal(64 * 1024)
    // Not raised — see the note on useGenesisLimits. setLimits() can still set it
    // explicitly, which is what the round-trip below checks.
    after.maximumElementSize.should.equal(4)
    after.maxScriptSize.should.equal(64 * 1024)
    Interpreter.setLimits(before)
    Interpreter.getLimits().maxScriptSize.should.equal(10000)
    Interpreter.MAX_SCRIPT_ELEMENT_SIZE.should.equal(520)
  })
})
