'use strict'

/* global describe, it */

// test/data/blind-spot-vectors.json is shared with other BSV implementations, so it has to keep
// meaning what it says. It covers the two structural blind spots in the reference node's
// script_tests.json:
//
//   - every one of its 1483 rows carries transaction version 1, so Chronicle's malleability
//     relaxations are unreachable by replaying it;
//   - no row pairs SCRIPT_VERIFY_LOW_S with a hash-type expectation, so a signature check that
//     masks another is unreachable too.
//
// Both cost real bugs while the corpus read 1483/1483. This replays each vector from its raw
// bytes — the same form another implementation consumes — and requires the interpreter's verdict
// to equal the one derived from bitcoin-sv v1.2.2's source.

var expect = require('chai').expect
var bsv = require('../..')
var Interpreter = bsv.Script.Interpreter
var Script = bsv.Script
var Transaction = bsv.Transaction
var BN = bsv.crypto.BN
var corpus = require('../data/blind-spot-vectors.json')

describe('cross-implementation blind-spot vectors', function () {
  it('covers both blind spots, in both directions', function () {
    var classes = corpus.vectors.map(function (v) { return v.regressionClass })
    expect(corpus.vectors.length).to.be.at.least(9)
    expect(classes).to.include('false-accept in <= 9.14.0')
    expect(classes).to.include('false-reject in <= 9.14.0')
    var spots = corpus.vectors.map(function (v) { return v.blindSpot })
    expect(new Set(spots).size).to.equal(2)
  })

  corpus.vectors.forEach(function (v) {
    it('agrees with the node on ' + v.id + ' (expects ' + v.nodeExpects + ')', function () {
      // Rebuilt from the published bytes, not from this library's builders, so the vector file
      // and the interpreter are checked against each other rather than sharing a helper.
      var tx = new Transaction(v.spendingTxHex)
      var scriptSig = Script.fromBuffer(Buffer.from(v.scriptSigHex, 'hex'))
      var scriptPubkey = Script.fromBuffer(Buffer.from(v.prevoutScriptHex, 'hex'))
      var flags = parseInt(v.flagsHex, 16)

      expect(tx.version, 'txVersion must match the serialised transaction').to.equal(v.txVersion)
      expect(tx.inputs[0].script.toBuffer().toString('hex'),
        'scriptSigHex must match the transaction input').to.equal(v.scriptSigHex)

      var interp = new Interpreter()
      var ok = interp.verify(scriptSig, scriptPubkey, tx, 0, flags, new BN(v.prevoutSatoshis))
      var got = ok ? 'OK' : interp.errstr.replace(/^SCRIPT_ERR_/, '')

      expect(got, v.comment).to.equal(v.nodeExpects)
      expect(got, 'the recorded 9.15.0 verdict is stale').to.equal(v.smartledgerBsv_9_15_0)
    })
  })
})
