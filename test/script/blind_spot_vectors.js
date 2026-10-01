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
// Both cost real bugs while the corpus read 1483/1483 — and not only here. These vectors found a
// false accept in the official bsv-blockchain/go-sdk v1.7.0, filed as go-sdk#373: its
// checkHashTypeEncoding returns before the MUST_USE_FORKID check, so a signature with no FORKID
// bit is accepted under STRICTENC + EnableSighashForkID. A different mechanism from ours, the
// same consequence, and invisible to its 9,398-row replay of the reference corpus for the same
// reason it was invisible here. They also surfaced five unguarded EnforceNonMalleability sites in
// an independent Rust implementation. @bsv/sdk 2.8.11 agreed on all 21.
//
// This replays each vector from its raw bytes — the same form another implementation consumes — and requires the interpreter's verdict
// to equal the one derived from bitcoin-sv v1.2.2's source.

var expect = require('chai').expect
var bsv = require('../..')
var Interpreter = bsv.Script.Interpreter
var Script = bsv.Script
var Transaction = bsv.Transaction
var BN = bsv.crypto.BN
var corpus = require('../data/blind-spot-vectors.json')

describe('cross-implementation blind-spot vectors', function () {
  // Every label must be a name the node itself renders. One row said MUST_USE_FORKID, which is
  // the ENUM suffix; the node's table calls that error MISSING_FORKID, and the other twenty rows
  // used table names. A Rust implementation running these caught it, which is one implementation
  // too many for a file that adjudicates consensus.
  it('labels every verdict with a name the node actually renders', function () {
    var nodeNames = {}
    Object.keys(corpus.nodeErrorNames).forEach(function (k) {
      nodeNames[corpus.nodeErrorNames[k]] = true
    })
    expect(Object.keys(nodeNames).length, 'the node name table must be vendored')
      .to.be.at.least(40)
    corpus.vectors.forEach(function (v) {
      if (v.nodeExpects === 'OK') return
      expect(nodeNames, v.id + ' expects "' + v.nodeExpects +
        '", which is not a name FormatScriptError produces')
        .to.have.property(v.nodeExpects)
    })
  })

  it('covers both blind spots, in both directions', function () {
    var classes = corpus.vectors.map(function (v) { return v.regressionClass })
    expect(corpus.vectors.length).to.be.at.least(21)
    expect(classes).to.include('false-accept in <= 9.14.0')
    expect(classes).to.include('false-reject in <= 9.14.0')
    var spots = corpus.vectors.map(function (v) { return v.blindSpot })
    expect(new Set(spots).size).to.equal(4)
    // All seven EnforceNonMalleability sites in the node must have a vector, at both versions.
    var ids = corpus.vectors.map(function (v) { return v.id })
    ;['minimalif', 'cleanstack', 'sigpushonly', 'lowS-highS', 'minimaldata', 'nullfail',
      'nulldummy'].forEach(function (rule) {
      expect(ids, rule + ' needs both versions').to.include(rule + '-v1')
      expect(ids, rule + ' needs both versions').to.include(rule + '-v2')
    })
    expect(corpus.narrowerNames).to.be.an('object')
  })

  corpus.vectors.forEach(function (v) {
    it('agrees with the node on ' + v.id + ' (expects ' + v.nodeExpects + ')', function () {
      // Rebuilt from the published bytes, not from this library's builders, so the vector file
      // and the interpreter are checked against each other rather than sharing a helper.
      var tx = new Transaction(v.spendingTxHex)
      var scriptSig = Script.fromBuffer(Buffer.from(v.scriptSigHex, 'hex'))
      var scriptPubkey = Script.fromBuffer(Buffer.from(v.prevoutScriptHex, 'hex'))
      var flags = parseInt(v.flagsHexAsRun, 16)

      // The names and the hex must not be two readings with two answers. A session running
      // these against two SDKs found nulldummy-v1 reading OK by name and rejected by hex,
      // because the name list was a subset of the bits actually set.
      var fromNames = v.nodeFlags.reduce(function (acc, name) {
        var bit = Object.keys(corpus.nodeFlagBits).find(function (b) {
          return corpus.nodeFlagBits[b] === name
        })
        expect(bit, name + ' is not a node flag').to.not.equal(undefined)
        return acc | (1 << Number(bit))
      }, 0)
      expect(fromNames, 'nodeFlags must reconstruct nodeFlagsHex exactly')
        .to.equal(parseInt(v.nodeFlagsHex, 16))

      // Only bits the node does not define may differ between the two, and they must be
      // declared as such.
      var extra = flags & ~parseInt(v.nodeFlagsHex, 16)
      var declared = v.libraryOnlyFlags.reduce(function (acc, name) {
        var bit = Object.keys(corpus.libraryOnlyFlagBits).find(function (b) {
          return corpus.libraryOnlyFlagBits[b] === name
        })
        return acc | (1 << Number(bit))
      }, 0)
      expect(extra, 'every bit beyond nodeFlagsHex must be declared in libraryOnlyFlags')
        .to.equal(declared)

      expect(tx.version, 'txVersion must match the serialised transaction').to.equal(v.txVersion)
      expect(tx.inputs[0].script.toBuffer().toString('hex'),
        'scriptSigHex must match the transaction input').to.equal(v.scriptSigHex)

      var interp = new Interpreter()
      var ok = interp.verify(scriptSig, scriptPubkey, tx, 0, flags, new BN(v.prevoutSatoshis))
      var got = ok ? 'OK' : interp.errstr.replace(/^SCRIPT_ERR_/, '')

      // Our name may be NARROWER than the node's, which is agreement, not a mismatch.
      // Three ways our name can legitimately differ from the node's: identical, narrower
      // (we say which EVAL_FALSE), or simply a different label for the same error.
      var resolved = corpus.narrowerNames[got] || corpus.nodeShortNames[got] || got
      expect(resolved, v.comment).to.equal(v.nodeExpects)
      expect(got, 'the recorded verdict is stale').to.equal(v.smartledgerBsv_9_15_0)
      expect(v.agreesWithNode, 'agreesWithNode must be true for every published vector')
        .to.equal(true)
    })
  })
})
