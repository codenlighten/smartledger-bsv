'use strict'

/* global describe, it */

// Post-Chronicle, a CHECKSIG or CHECKMULTISIG executing inside the UNLOCKING script signs
// everything from the most recent code separator to the end of that script PLUS the locking
// script. bitcoin-sv v1.2.3 `interpreter.cpp` 1475-1480 and 1571-1576:
//
//     // checksigData contains scriptPubKey if we are executing within a scriptSig
//     if(checksigData && IsChronicle(flags))
//         scriptCode += *checksigData;
//
// with `VerifyScript` passing `&scriptPubKey` for the scriptSig evaluation (2338) and
// `nullptr` for the scriptPubKey (2358) and P2SH-redeem (2402) evaluations.
//
// This library appended nothing, in any era, until the fix these vectors pin. Before it, 24 of
// these 40 rows disagreed with the reference in BOTH directions — accepting spends the network
// rejects and rejecting spends it accepts.
//
// The gate is SCRIPT_CHRONICLE (1 << 20) alone, NOT the output-era bit
// SCRIPT_UTXO_AFTER_CHRONICLE (1 << 21). The two bits answer different Chronicle questions:
// the relaxations gate on the output era, which is what took 571 of 24,568 disagreements to
// zero in 9.30.0. The `-era` file exists precisely to separate them, because a fix gated on
// bit 21 passes all 24 rows of the first file and still disagrees on 16 of the 40.
//
// Data: oracle vectors in the BSV opcode lab repo, with reference verdicts from a compiled
// bitcoin-sv v1.2.3 oracle and an independent Rust node.

var assert = require('assert')
var fs = require('fs')
var path = require('path')
var bsv = require('../..')
var Interpreter = bsv.Script.Interpreter
var BN = bsv.crypto.BN

var DIR = path.join(__dirname, '..', 'data', 'chronicle-scriptsig')
function load (f) {
  var m = {}
  fs.readFileSync(path.join(DIR, f), 'utf8').split('\n').filter(Boolean).forEach(function (l) {
    var r = JSON.parse(l)
    m[r.id] = r
  })
  return m
}

// Flags are rebuilt from NAMES, never from the vectors' `flagsHex`. The same flag set has
// different words in the two implementations — ours 0x3d586f against the node's 0x3d406f —
// so a copied integer silently validates against the wrong set.
function flagsFrom (names) {
  var f = 0
  names.forEach(function (n) {
    assert.notStrictEqual(Interpreter[n], undefined, 'unmapped flag name: ' + n)
    f |= Interpreter[n]
  })
  return f
}

function run (row) {
  var it = new Interpreter()
  var ok
  try {
    ok = it.verify(
      bsv.Script.fromBuffer(Buffer.from(row.scriptSigHex, 'hex')),
      bsv.Script.fromBuffer(Buffer.from(row.scriptPubKeyHex, 'hex')),
      new bsv.Transaction(row.tx.hex), row.tx.nIn,
      flagsFrom(row.flagNames), new BN(row.tx.amountSats))
  } catch (e) { ok = false }
  return { ok: ok, err: it.errstr || '' }
}

var SETS = [
  ['vectors-sighash-chronicle-scriptsig.jsonl', 'sighash-chronicle-scriptsig-reference-column.jsonl'],
  ['vectors-sighash-chronicle-scriptsig-era.jsonl', 'sighash-chronicle-scriptsig-era-reference-column.jsonl']
]

describe('Chronicle: a signature check inside the unlocking script', function () {
  SETS.forEach(function (pair) {
    describe(pair[0], function () {
      var vec = load(pair[0])
      var ref = load(pair[1])

      it('has a reference verdict for every vector', function () {
        var ids = Object.keys(vec)
        assert.ok(ids.length > 0)
        ids.forEach(function (id) {
          assert.ok(ref[id], 'no reference verdict for ' + id)
        })
      })

      Object.keys(vec).forEach(function (id) {
        it('agrees with the reference on ' + id.split('/').slice(1).join('/'), function () {
          var expected = /^accept/i.test(String(ref[id].verdict))
          var got = run(vec[id])
          assert.strictEqual(got.ok, expected,
            'reference says ' + ref[id].verdict + ', we say ' +
            (got.ok ? 'accept' : 'reject (' + got.err + ')'))
        })
      })
    })
  })

  // The positive control, without reaching into the implementation. Swapping bits 20 and 21
  // in the INPUT flags is observationally identical to swapping which bit the gate reads: a
  // correct bit-20 implementation fed swapped flags produces exactly the verdicts a
  // bit-21-gated implementation would produce on the real flags. So this proves the era file
  // separates the two gates without a monkey patch and without exposing an internal helper.
  it('separates a bit-20 gate from a bit-21 one', function () {
    var vec = load('vectors-sighash-chronicle-scriptsig-era.jsonl')
    var ref = load('sighash-chronicle-scriptsig-era-reference-column.jsonl')
    var B20 = 'SCRIPT_CHRONICLE'
    var B21 = 'SCRIPT_UTXO_AFTER_CHRONICLE'
    var differ = 0
    Object.keys(vec).forEach(function (id) {
      var row = JSON.parse(JSON.stringify(vec[id]))
      row.flagNames = row.flagNames.map(function (n) {
        return n === B20 ? B21 : n === B21 ? B20 : n
      })
      if (run(row).ok !== /^accept/i.test(String(ref[id].verdict))) differ++
    })
    assert.strictEqual(differ, 16,
      'a bit-21 gate must disagree with the reference on all 16 era rows; got ' + differ)
  })
})
