'use strict'

require('chai').should()

var bsv = require('../..')
var Script = bsv.Script
var Interpreter = Script.Interpreter
var BN = bsv.crypto.BN
var PushTx = bsv.SmartContract.PushTx

describe('era-flag diagnostics', function () {
  var lock, unlock, tx
  var SATS = 100000

  before(function () {
    var dest = Script.fromASM('OP_FALSE OP_RETURN 6f6b')
    var out = new bsv.Transaction.Output({ script: dest, satoshis: 99000 })
    lock = PushTx.valueCovenant(PushTx.hashOutputs([out]))
    tx = new bsv.Transaction()
    tx.addInput(new bsv.Transaction.Input({
      prevTxId: '0'.repeat(64),
      outputIndex: 0,
      script: new Script(),
      output: new bsv.Transaction.Output({ script: lock, satoshis: SATS })
    }))
    tx.addOutput(out)
    unlock = new Script().add(PushTx.grind(tx, 0, lock, SATS).preimage)
  })

  beforeEach(function () {
    Interpreter._resetEraWarning()
    Interpreter.eraDiagnostics = false
  })

  // Restore what the ENVIRONMENT asked for, not a hard-coded true. Forcing true here
  // meant running the suite with the documented BSV_NO_ERA_HINT=1 still printed
  // notices from every file that ran after this one.
  var originalEraDiagnostics = Interpreter.eraDiagnostics
  after(function () { Interpreter.eraDiagnostics = originalEraDiagnostics })

  function run (flags) {
    var i = new Interpreter()
    var ok = i.verify(unlock, lock, tx, 0, flags, new BN(SATS))
    return { ok: ok, err: i.errstr, hint: i.eraHint }
  }

  // THE regression. The gate used to test a single ERA_FLAGS word containing all four
  // era bits, so ANY of them present suppressed the notice. But the size caps read
  // isAfterGenesis(), which tests SCRIPT_UTXO_AFTER_GENESIS and nothing else — so a
  // flag word carrying SCRIPT_GENESIS still got the 520-byte cap, still failed with
  // PUSH_SIZE, and was told nothing. SCRIPT_GENESIS is the constant a hand-assembling
  // caller reaches for first: it is the one named "GENESIS".
  describe('fires on the era bit that actually lifts the cap', function () {
    var BASE = Interpreter.SCRIPT_VERIFY_STRICTENC | Interpreter.SCRIPT_ENABLE_SIGHASH_FORKID

    // Every bit that does NOT lift the element-size cap must still explain the failure.
    ;[
      ['SCRIPT_GENESIS', 'SCRIPT_GENESIS'],
      ['SCRIPT_ENABLE_CHRONICLE', 'SCRIPT_ENABLE_CHRONICLE'],
      ['SCRIPT_UTXO_AFTER_CHRONICLE', 'SCRIPT_UTXO_AFTER_CHRONICLE']
    ].forEach(function (pair) {
      it('still explains PUSH_SIZE when only ' + pair[0] + ' is set', function () {
        var r = run(BASE | Interpreter[pair[1]])
        r.ok.should.equal(false)
        r.err.should.equal('SCRIPT_ERR_PUSH_SIZE')
        ;(r.hint === null).should.equal(false,
          pair[0] + ' does not lift the element-size cap, so the hint must still fire')
      })
    })

    it('stays silent once SCRIPT_UTXO_AFTER_GENESIS actually lifts the cap', function () {
      var r = run(BASE | Interpreter.SCRIPT_UTXO_AFTER_GENESIS)
      ;(r.hint === null).should.equal(true)
    })

    it('maps each era-sensitive error to the bit its own cap derives from', function () {
      var E = Interpreter.ERA_SENSITIVE_ERRORS
      // maxScriptElementSize / maxScriptSize / maxOpsPerScript -> isAfterGenesis()
      ;['SCRIPT_ERR_PUSH_SIZE', 'SCRIPT_ERR_SCRIPT_SIZE', 'SCRIPT_ERR_OP_COUNT'].forEach(function (k) {
        E[k].lifts.should.equal(Interpreter.SCRIPT_UTXO_AFTER_GENESIS, k)
      })
      // maxScriptNumLength -> isAfterChronicle(), then isAfterGenesis()
      E.SCRIPT_ERR_SCRIPTNUM_OVERFLOW.lifts.should.equal(
        Interpreter.SCRIPT_UTXO_AFTER_GENESIS | Interpreter.SCRIPT_UTXO_AFTER_CHRONICLE)
    })
  })

  // The flag word a caller writes by hand from named constants: modern feature
  // opcodes, no era bit. This is the case the diagnostic exists for.
  var PARTIAL = Interpreter.SCRIPT_VERIFY_STRICTENC |
    Interpreter.SCRIPT_ENABLE_SIGHASH_FORKID |
    Interpreter.SCRIPT_ENABLE_MONOLITH_OPCODES |
    Interpreter.SCRIPT_ENABLE_MAGNETIC_OPCODES

  it('explains a covenant rejected by pre-Genesis limits', function () {
    var r = run(PARTIAL)
    r.ok.should.equal(false)
    r.err.should.equal('SCRIPT_ERR_PUSH_SIZE')
    r.hint.should.be.a('string')
    r.hint.should.contain('PRE-GENESIS')
    r.hint.should.contain('mainnetFlags')
  })

  it('stays silent when flags are omitted', function () {
    var i = new Interpreter()
    i.verify(unlock, lock, tx, 0, undefined, new BN(SATS)).should.equal(true)
    ;(i.eraHint === null).should.equal(true)
  })

  it('stays silent under mainnetFlags()', function () {
    var r = run(Interpreter.mainnetFlags())
    r.ok.should.equal(true)
    ;(!r.hint).should.equal(true)
  })

  it('does not blame the era for an ordinary wrong answer', function () {
    var i = new Interpreter()
    var ok = i.verify(
      Script.fromASM('OP_2 OP_2'), Script.fromASM('OP_ADD OP_5 OP_EQUAL'),
      new bsv.Transaction(), 0, Interpreter.SCRIPT_VERIFY_P2SH, new BN(0))
    ok.should.equal(false)
    i.errstr.should.equal('SCRIPT_ERR_EVAL_FALSE_IN_STACK')
    ;(i.eraHint === null).should.equal(true)
  })

  it('warns at most once per process', function () {
    Interpreter.eraDiagnostics = true
    var warned = 0
    var orig = console.warn
    console.warn = function () { warned++ }
    try {
      for (var k = 0; k < 25; k++) run(PARTIAL)
    } finally { console.warn = orig }
    warned.should.equal(1)
  })

  it('still populates eraHint when output is silenced', function () {
    run(PARTIAL).hint.should.be.a('string')
  })
})
