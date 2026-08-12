'use strict'

/**
 * Consensus ratchet over the SV Node script vectors.
 *
 * A report tells you where you are; this stops you going backwards. Both read
 * the same harness, so the progress figure and the gate cannot disagree.
 *
 * False accepts are held at zero outright rather than through an allowlist,
 * because accepting a script the network rejects is the direction that can
 * cost money. False rejects are held at zero too — the corpus passes
 * completely, so there is nothing to exempt and no list to maintain.
 */

require('chai').should()
const harness = require('../../tools/sv-vector-harness')

describe('SV Node script vectors', function () {
  this.timeout(120000)

  let results = null

  before(function () {
    results = harness.runAll()
  })

  it('runs the whole corpus', function () {
    results.length.should.equal(1483)
  })

  it('uses no flag the harness does not recognise', function () {
    // An unrecognised flag means vectors run under the wrong rules, and any
    // pass among them means nothing.
    const unknown = new Set()
    results.forEach(r => r.unknownFlags.forEach(f => unknown.add(f)))
    Array.from(unknown).should.deep.equal([])
  })

  it('accepts nothing the node rejects', function () {
    const accepts = results.filter(r => r.direction === 'accept')
    const detail = accepts.map(r =>
      '\n  ' + r.id + '  ' + r.reason + '\n      ' + harness.describe(r.row)).join('')
    accepts.length.should.equal(0, 'false accepts must stay at zero:' + detail)
  })

  it('rejects nothing the node accepts', function () {
    const rejects = results.filter(r => r.direction === 'reject')
    const detail = rejects.map(r =>
      '\n  ' + r.id + '  ' + r.reason + '\n      ' + harness.describe(r.row)).join('')
    rejects.length.should.equal(0, 'false rejects must stay at zero:' + detail)
  })

  it('fails for the reason the node gives', function () {
    // Matching the outcome is not the same as matching the reason, and the gap
    // hid three real bugs — see ERROR_CODE_ALIASES in the harness. Each left
    // the script failing, so the two tests above stayed green throughout.
    const wrong = results.filter(r => r.codeMatches === false)
    const detail = wrong.map(r =>
      '\n  ' + r.id + '  expected ' + r.expectedCode + ', reported ' + r.gotCode +
      '\n      ' + harness.describe(r.row)).join('')
    wrong.length.should.equal(0,
      wrong.length + ' vector(s) fail for the wrong reason:' + detail)
  })

  it('compares a code on every vector the node rejects', function () {
    // Guards the test above: if `comparable` ever narrowed, it would pass by
    // checking nothing.
    const rejected = results.filter(r => r.row.expected !== 'OK' && r.passed)
    rejected.length.should.equal(600)
    rejected.every(r => r.codeMatches !== null).should.equal(true)
  })

  it('uses every alias it grants', function () {
    // The ratchet's other direction. An alias no vector produces any more is
    // an exemption outliving its reason, and should be deleted rather than
    // left to cover something later.
    const produced = new Set(results.filter(r => r.gotCode).map(r => r.gotCode))
    const unused = Object.keys(harness.ERROR_CODE_ALIASES).filter(a => !produced.has(a))
    unused.should.deep.equal([], 'alias(es) no vector produces; remove them')
  })
})
