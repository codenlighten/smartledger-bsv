'use strict'

/* global describe, it */

// A RATCHET over every `.script.<prop>` dereference in lib/.
//
// Two accessors in this library return null rather than a Script:
//
//   * `Output#script` — null when the raw bytes could not be decoded. That happens for
//     output scripts the node ACCEPTS AND MINES: post-Genesis a top-level OP_RETURN
//     terminates evaluation as successful before a truncated tail is read, so `6a4c` is a
//     valid locking script. `Output#setScriptFromBuffer` catches `Script.InvalidBuffer` and
//     keeps the bytes in `_scriptBuffer`.
//   * `Input#script` — null when `isNull()`, i.e. the coinbase input every block has.
//
// Four call sites dereferenced one of those without asking and threw a raw, untyped
// TypeError on data read from a valid block: `_hasDustOutputs`, `Output#getSize`,
// `Transaction#sort()`'s BIP69 comparator, and `Policy#describe()`. All are fixed.
//
// The point of this file is that finding them was a METHOD, not a one-off. The first audit
// was a pattern grep plus probes of what it surfaced, filtered by the shape of the bug
// already found — so it inherited that bug's blind spot and missed two live sites. The
// enumeration below is the durable artifact, and this test makes it self-enforcing: add a
// new `.script.` dereference anywhere in lib/ and this fails until it is classified here
// with a reason. A note in a commit message does not reach the person who adds the next one.
//
// Note the two sites that were ALREADY guarded with `if (this.script)` — `Output#inspect`
// and `Input#toObject`. The convention existed; the four crashes were inconsistency with
// it, not an unknown hazard.

var fs = require('fs')
var path = require('path')
require('chai').should()

// Every dereference, with why it cannot throw on a null receiver.
// Keyed by file and property name, so moving code does not churn this list.
var CLASSIFIED = {
  // --- receiver is a nullable Output#script, and the null case is handled ---
  'lib/transaction/output.js :: inspect': 'guarded by `if (this.script)`, falls back to _scriptBuffer hex',
  'lib/transaction/output.js :: toBuffer': 'getSize(): `this.script === null ? _scriptBuffer.length : ...`',
  'lib/transaction/transaction.js :: toBuffer': 'BIP69 comparator via outputScriptBytes(), null -> _scriptBuffer',
  'lib/smart_contract/dsl.js :: toASM': 'Policy#describe(): null -> "(unparseable) <hex>"',

  // --- receiver is a nullable Input#script, and the null case is handled ---
  'lib/transaction/input/input.js :: toString': 'toObject(): guarded by `if (this.script)`; raw hex is always emitted',

  // --- receiver cannot be null: the script was parsed before this point ---
  'lib/transaction/transaction.js :: isPublicKeyHashOutPrefix': 'from(): utxo script parsed (throws typed InvalidBuffer) before dispatch',
  'lib/transaction/transaction.js :: isPublicKeyOut': 'from() dispatch, as above: a parsed utxo script',
  'lib/transaction/transaction.js :: isMultisigOut': 'from() dispatch, as above: a parsed utxo script',
  'lib/transaction/transaction.js :: isScriptHashOut': 'from() dispatch, as above: a parsed utxo script',
  'lib/transaction/transaction.js :: toString': '_checkConsistency change output + from() UnsupportedScript; we build the change script',
  'lib/transaction/unspentoutput.js :: toBuffer': 'UnspentOutput ctor builds the Script, throwing on bad input',
  'lib/transaction/input/publickey.js :: getPublicKey': 'this.output.script; reached only via a classification that required a parse',
  'lib/transaction/input/publickey.js :: isPublicKeyIn': 'this.script on a PublicKeyInput, never the coinbase',
  'lib/transaction/input/publickeyhash.js :: chunks': 'this.output.script, reached only after a P2PKH classification that parsed it',
  'lib/transaction/input/publickeyhash.js :: isPublicKeyHashIn': 'this.script on a PublicKeyHashInput, never the coinbase',
  'lib/script/interpreter.js :: chunks': "the interpreter's own script, assigned from a parsed Script",
  'lib/script/interpreter.js :: toBuffer': "the interpreter's own script, assigned from a parsed Script",
  'lib/script/interpreter.js :: checkMinimalPush': "the interpreter's own script, assigned from a parsed Script",
  'lib/ordinals/ordlock.js :: isPublicKeyHashOut': 'inside a try/catch that swallows',
  'lib/ordinals/ordlock.js :: toAddress': 'inside the same try/catch that swallows a throw',

  // --- receiver is not a Script at all ---
  'lib/ltp/anchor.js :: startsWith': '_extractOpReturn takes API JSON, where `script` is an ASM STRING; guarded by `output.script &&`',
  'lib/ltp/anchor.js :: replace': 'same API-JSON shape, a string rather than a Script'
}

function sourceFiles (dir, out) {
  fs.readdirSync(dir, { withFileTypes: true }).forEach(function (e) {
    var p = path.join(dir, e.name)
    if (e.isDirectory()) sourceFiles(p, out)
    else if (e.name.endsWith('.js')) out.push(p)
  })
  return out
}

// Strip line comments so prose about `.script.` does not register as a dereference.
function stripComments (line) {
  var i = line.indexOf('//')
  return i === -1 ? line : line.slice(0, i)
}

function enumerate () {
  var root = path.join(__dirname, '..', '..')
  var found = {}
  sourceFiles(path.join(root, 'lib'), []).forEach(function (file) {
    var rel = path.relative(root, file).split(path.sep).join('/')
    fs.readFileSync(file, 'utf8').split('\n').forEach(function (raw) {
      var line = stripComments(raw)
      var re = /\.script\s*\.\s*([A-Za-z_$][\w$]*)|\.script\s*\[/g
      var m
      while ((m = re.exec(line))) found[rel + ' :: ' + (m[1] || '[index]')] = true
    })
  })
  return Object.keys(found).sort()
}

describe('every .script dereference in lib/ is classified', function () {
  it('has no unclassified dereference', function () {
    var unclassified = enumerate().filter(function (k) {
      return !Object.prototype.hasOwnProperty.call(CLASSIFIED, k)
    })
    unclassified.should.deep.equal([],
      'A new `.script.<prop>` dereference appeared in lib/. `Output#script` is null for an ' +
      'output script the node accepts and mines, and `Input#script` is null for the ' +
      'coinbase input, so a dereference that cannot rule both out throws an untyped ' +
      'TypeError on data read from a valid block. Either guard it, or add it to CLASSIFIED ' +
      'in this file with the reason its receiver cannot be null.')
  })

  it('lists nothing that has since been removed', function () {
    // Keeps the registry honest: a stale reason is worse than no reason, because it reads
    // as though someone checked.
    var live = enumerate()
    var stale = Object.keys(CLASSIFIED).filter(function (k) { return live.indexOf(k) === -1 })
    stale.should.deep.equal([], 'these entries no longer exist in lib/ and should be deleted')
  })

  it('gives every entry a non-empty reason', function () {
    Object.keys(CLASSIFIED).forEach(function (k) {
      CLASSIFIED[k].should.be.a('string').with.length.above(10, k)
    })
  })
})
