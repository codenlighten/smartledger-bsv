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

  after(function () { Interpreter.eraDiagnostics = true })

  function run (flags) {
    var i = new Interpreter()
    var ok = i.verify(unlock, lock, tx, 0, flags, new BN(SATS))
    return { ok: ok, err: i.errstr, hint: i.eraHint }
  }

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
