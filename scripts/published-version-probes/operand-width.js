// The question this page listed as unchecked: does the unscoped 4.4.0 artifact contain the
// operand-size false accept that 9.29.0 fixed?  `<data> <600 zero bytes> OP_RIGHT` — the node
// reads the operand as an int64 and refuses it on ENCODED WIDTH (SCRIPTNUM_OVERFLOW), whatever
// its value.  Flag words are read from the installed library and asserted numeric.
var root = process.argv[2]; var name = process.argv[3]
var pkgdir = root + '/node_modules/' + name
var bsv = require(pkgdir)
var version = require(pkgdir + '/package.json').version
var Script = bsv.Script; var Interpreter = Script.Interpreter; var Opcode = bsv.Opcode
// the operand's ENCODED WIDTH is the whole point: 10 bytes is the first width that cannot be
// an int64, 600 also exceeds the pre-Genesis 520-byte element limit.  Override with WIDTH=.
var WIDTH = Number(process.env.WIDTH || 10)

var want = ['SCRIPT_UTXO_AFTER_GENESIS', 'SCRIPT_UTXO_AFTER_CHRONICLE', 'SCRIPT_ENABLE_CHRONICLE']
var have = want.filter(n => typeof Interpreter[n] === 'number')
var eras = []
if (have.length === want.length) eras.push(['post-Chronicle', want.reduce((f, n) => f | Interpreter[n], 0)])
// older artifacts may predate the Chronicle flags; try the widest era they do have
if (typeof Interpreter.SCRIPT_UTXO_AFTER_GENESIS === 'number') eras.push(['post-Genesis', Interpreter.SCRIPT_UTXO_AFTER_GENESIS])
if (typeof Interpreter.SCRIPT_ENABLE_MONOLITH_OPCODES === 'number') eras.push(['monolith', Interpreter.SCRIPT_ENABLE_MONOLITH_OPCODES])

var out = [name + '@' + version, 'operand=' + WIDTH + 'B', 'flags_present=' + have.length + '/' + want.length]
if (typeof Opcode.OP_RIGHT !== 'number') out.push('OP_RIGHT absent from this version')
else {
  for (var [label, flags] of eras) {
    var lock = new Script().add(Buffer.from('aabbccdd', 'hex')).add(Buffer.alloc(WIDTH)).add(Opcode.OP_RIGHT)
    var i = new Interpreter()
    var ok
    try { ok = i.verify(new Script(), lock, new bsv.Transaction(), 0, flags) } catch (e) { out.push(label + '=throw:' + e.message.slice(0, 30)); continue }
    out.push(label + '=' + (ok ? 'FALSE ACCEPT' : (i.errstr || 'rejected')))
  }
}
console.log(out.join('  '))
