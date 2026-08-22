'use strict'

require('chai').should()

var fs = require('fs')
var path = require('path')
var surface = require('../scripts/api-surface')
var pkg = require('../package.json')

var FIXTURE = path.join(__dirname, 'fixtures', 'api-surface.json')

/**
 * Enforces the compatibility promise in STABILITY.md.
 *
 * The failure this guards against is not a decision to break the API. It is
 * arriving at 10.0.0 without having decided to — which is how this library
 * reached 9.0.0 in 82 days. A rename inside a refactor, a helper that stops
 * being exported when a file moves, a namespace that quietly loses a member:
 * each is invisible in review and each is a breaking change.
 */
describe('public API surface', function () {
  var expected = JSON.parse(fs.readFileSync(FIXTURE, 'utf8'))
  var actual = surface.extract()

  var major = parseInt(pkg.version.split('.')[0], 10)
  var snapshotHint =
    'If this change is intended, run `npm run api:snapshot` and commit the ' +
    'result so the new surface is visible in review.'

  function diff () {
    var removed = []
    var changed = []
    var added = []
    Object.keys(expected).forEach(function (k) {
      if (!(k in actual)) removed.push(k)
      else if (actual[k] !== expected[k]) changed.push(k + ': ' + expected[k] + ' -> ' + actual[k])
    })
    Object.keys(actual).forEach(function (k) {
      if (!(k in expected)) added.push(k + ': ' + actual[k])
    })
    return { removed: removed, changed: changed, added: added }
  }

  function report (label, items) {
    var shown = items.slice(0, 25)
    var more = items.length - shown.length
    return label + ' (' + items.length + '):\n  ' + shown.join('\n  ') +
      (more > 0 ? '\n  ...and ' + more + ' more' : '')
  }

  it('has not removed anything a caller could be using', function () {
    var d = diff()
    if (d.removed.length) {
      throw new Error(
        report('Public API removed', d.removed) + '\n\n' +
        'Removing a public API is a MAJOR change. This package is ' + pkg.version +
        ', and STABILITY.md commits 9.x through 2027-09-01.\n' +
        'Deprecate it instead — lib/util/deprecate.js — so callers get a warning ' +
        'naming the replacement, and remove it in ' + (major + 1) + '.0.0.\n' +
        'If this IS the major, regenerate the snapshot in the same commit.'
      )
    }
  })

  it('has not changed the shape of anything a caller could be using', function () {
    var d = diff()
    if (d.changed.length) {
      throw new Error(
        report('Public API shape changed', d.changed) + '\n\n' +
        'A changed kind or arity can break callers as surely as a removal ' +
        '(a function becoming an object, a required argument appearing).\n' +
        'If the change is source-compatible — an added optional argument, for ' +
        'instance — it is safe, and ' + snapshotHint.charAt(0).toLowerCase() +
        snapshotHint.slice(1)
      )
    }
  })

  it('records additions deliberately rather than accumulating them', function () {
    var d = diff()
    if (d.added.length) {
      throw new Error(
        report('Public API added', d.added) + '\n\n' +
        'Additions are compatible and allowed in a minor. They are surfaced ' +
        'because API growth is how a library becomes something nobody can hold ' +
        'in their head — this one reached 109 top-level exports and 1927 ' +
        'reachable members that way.\n' + snapshotHint
      )
    }
  })

  it('does not snapshot host-runtime internals', function () {
    // The snapshot must be identical on every supported Node version. Walking
    // into `bsv.deps` broke that: Node 20 and 22 disagree on the arity of
    // Buffer#utf8Write, #asciiWrite and #latin1Write, so CI failed on 20 and
    // passed on 22 for a change that touched neither.
    var leaked = Object.keys(expected).filter(function (k) {
      return k.indexOf('bsv.deps.') === 0 && k.indexOf('#') !== -1
    })
    leaked.should.deep.equal([])

    // Members of `deps` are still covered; only their internals are not.
    expected.should.have.property('bsv.deps.Buffer')
  })

  it('covers what STABILITY.md says it covers', function () {
    // The subpaths are named in the policy, so their presence in the snapshot
    // is itself part of the contract.
    Object.keys(pkg.exports).forEach(function (sub) {
      expected.should.have.property('exports:' + sub)
    })
    Object.keys(expected).filter(function (k) {
      return k.indexOf('bsv.') === 0
    }).length.should.be.above(1000)
  })
})
