// Three measured divergences, each against the version installed in <installdir>:
//   A  OP_RSHIFTNUM with a shift count above INT32_MAX: the node aborts BIG_INT, so a
//      script this library VERIFIES is a lock the network refuses (fixed 9.33.0).
//   B  a truncated push in a scriptSig: the node reports SIG_PUSHONLY above EvalScript;
//      this library reported BAD_OPCODE from running it.  BOTH REJECT (fixed 9.33.1).
//   C  an output whose script this library cannot decode: dereferencing the null
//      `output.script` threw an untyped error (fixed 9.33.2).
// Flag words are read from the installed library, never hardcoded, and asserted numeric:
// an `undefined` flag ORs to NaN and looks exactly like a defect.
var name = process.argv[3] || '@smartledger/bsv'
var pkgdir = process.argv[2] + '/node_modules/' + name
var bsv = require(pkgdir)
var version = require(pkgdir + '/package.json').version
var Script = bsv.Script; var Interpreter = Script.Interpreter; var BN = bsv.crypto.BN; var Opcode = bsv.Opcode

function flags (names) {
  var f = 0
  for (var n of names) { if (typeof Interpreter[n] !== 'number') return null; f |= Interpreter[n] }
  return f
}

// ---- A: the OP_RSHIFTNUM shift count
var A
var era = flags(['SCRIPT_UTXO_AFTER_GENESIS', 'SCRIPT_UTXO_AFTER_CHRONICLE', 'SCRIPT_ENABLE_CHRONICLE'])
if (era === null) A = 'flags absent'
else {
  try {
    var s = new Script()
    s.add(new BN(5).toScriptNumBuffer()).add(new BN(4294967297).toScriptNumBuffer())
      .add(Opcode.OP_RSHIFTNUM).add(Opcode.OP_DROP).add(Opcode.OP_1)
    var i = new Interpreter()
    var ok = i.verify(new Script(), s, new bsv.Transaction(), 0, era, new BN(0))
    A = ok ? 'FALSE ACCEPT (verified)' : 'rejected ' + (i.errstr || '')
  } catch (e) { A = 'throw ' + e.message.slice(0, 40) }
}

// ---- B: a truncated push in the scriptSig
var B
// the gate the node applies on today's mainnet, taken from the library itself
var pf = typeof Interpreter.mainnetFlags === 'function' ? Interpreter.mainnetFlags() : null
if (typeof pf !== 'number') B = 'mainnetFlags() absent'
else {
  try {
    var i2 = new Interpreter()
    var ok2 = i2.verify(Script.fromHex('4c50' + 'cd'.repeat(10)), Script.fromHex('7551'),
      undefined, 0, pf, new BN(0))
    B = (ok2 ? 'ACCEPTED' : 'rejected ') + (i2.errstr || '')
  } catch (e) { B = 'throw ' + e.message.slice(0, 40) }
}

// ---- C: an output whose script cannot be decoded (OP_RETURN + a truncated length field)
var C
try {
  var tx = new bsv.Transaction()
  var out = new bsv.Transaction.Output({ script: new Script(), satoshis: 100 })
  out.setScriptFromBuffer(Buffer.from('6a4c', 'hex'))
  tx.addOutput(out)
  var errs = []
  try { tx.getSerializationError() } catch (e) { errs.push('getSerializationError:' + e.constructor.name + '/' + (e.message || '').slice(0, 30)) }
  try { tx.sort() } catch (e) { errs.push('sort:' + e.constructor.name + '/' + (e.message || '').slice(0, 30)) }
  try { out.getSize() } catch (e) { errs.push('getSize:' + e.constructor.name) }
  C = errs.length ? 'CRASHES -> ' + errs.join(' | ') : 'handled'
} catch (e) { C = 'setup ' + e.message.slice(0, 50) }

console.log((name + '@' + version).padEnd(24) + ' A_rshiftnum=[' + A + ']  B_pushonly=[' + B + ']  C_nullscript=[' + C + ']')
