'use strict'

/* global describe, it */

// The corpus's own blind spots, pinned.
//
// `npm run vectors:sv-coverage` reports what the SV Node script vectors cannot tell us. This
// asserts the answers, for one reason: if the corpus is ever extended or replaced, these
// assertions fail and whoever did it has to re-read the report rather than assume the holes are
// where they were. A frozen corpus's blind spots are a property of the file, so they belong in
// a test like any other property of it.
//
// Both defect classes released in 9.15.0 are named by this report, which is the evidence that
// it is worth running. Had it existed, it would have pointed at them before either was found:
// MUST_USE_FORKID and ILLEGAL_CHRONICLE as verdicts no row asks for, and LOW_S + STRICTENC as a
// masking pair never set together.
//
// The instrument is the bsv-scale-protocol session's idea, ported from its Rust harness.

var expect = require('chai').expect
var harness = require('../../tools/sv-vector-harness')
var rows = require('../data/bitcoin-sv/script_tests.json')

function parsedRows () {
  var out = []
  rows.forEach(function (raw) {
    if (!Array.isArray(raw) || raw.length === 1) return
    var r = harness.parseRow(raw)
    if (r) out.push(r)
  })
  return out
}

describe('what the SV Node script corpus cannot tell us', function () {
  var parsed = parsedRows()

  it('has 1483 rows, every one at transaction version 1', function () {
    expect(parsed.length).to.equal(1483)
    var versions = {}
    parsed.forEach(function (r) { versions[r.version] = true })
    expect(Object.keys(versions), 'a new version would reach rules nothing here tests')
      .to.deep.equal(['1'])
  })

  it('never asks for MUST_USE_FORKID or ILLEGAL_CHRONICLE', function () {
    // Two of the three false accepts released in 9.15.0 were exactly these verdicts.
    var expected = {}
    parsed.forEach(function (r) { if (r.expected) expected[r.expected] = true })
    expect(expected).to.not.have.property('MUST_USE_FORKID')
    expect(expected).to.not.have.property('ILLEGAL_CHRONICLE')
  })

  it('never sets LOW_S together with STRICTENC', function () {
    // The masking pair. SIG_HASHTYPE is exercised by 7 rows, so verdict coverage alone calls it
    // covered; what was missing was any row where LOW_S could shadow it.
    var both = 0
    var hashTypeRows = 0
    var hashTypeWithLowS = 0
    parsed.forEach(function (r) {
      var on = String(r.flagStr).split(',').map(function (s) { return s.trim() })
      if (on.indexOf('LOW_S') !== -1 && on.indexOf('STRICTENC') !== -1) both++
      if (r.expected === 'SIG_HASHTYPE' || r.expected === 'SIG_DER' ||
          r.expected === 'ILLEGAL_FORKID') {
        hashTypeRows++
        if (on.indexOf('LOW_S') !== -1) hashTypeWithLowS++
      }
    })
    expect(both, 'LOW_S + STRICTENC never co-occur in this corpus').to.equal(0)
    expect(hashTypeRows, 'there ARE hash-type rows').to.be.above(0)
    expect(hashTypeWithLowS, 'but none of them sets LOW_S').to.equal(0)
  })

  it('leaves the engine able to emit verdicts no row asks for', function () {
    var expected = {}
    parsed.forEach(function (r) { if (r.expected && r.expected !== 'OK') expected[r.expected] = true })
    // A sample of ours the corpus never requests. If one of these starts being exercised, good
    // — update the list and say so.
    ;['MUST_USE_FORKID', 'ILLEGAL_CHRONICLE', 'INVALID_FLAGS'].forEach(function (code) {
      expect(expected, code + ' is unexercised by this corpus').to.not.have.property(code)
    })
  })
})
