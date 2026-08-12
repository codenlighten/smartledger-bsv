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
})
