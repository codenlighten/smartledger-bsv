'use strict'

// A version left UNDEPRECATED on npm is a claim: that we are content for a consumer to install
// it. On 2026-10-15 that claim went false for 9.36.0 without anything failing — GHSA-j884
// published with the range `< 9.37.0`, and 9.36.0 was both a member of the live set and the
// version 150 registry deprecation messages named as the safe minimum. The inventory page went
// on saying every live version was at or above every fix for three days. The two checks that
// existed could not see it: one compares the page's table to the registry, the other compares
// the page's message texts to the plan, and an advisory is in neither.
//
// So this holds the live set to the advisory payloads in docs/advisories/*.json — the exact
// bodies sent to GitHub, which `npm run check:advisories` holds to their markdown. It is here
// rather than only in the registry gate because it needs no network, and a check that only runs
// when someone remembers to run it is the failure mode this project has already paid for twice.

var assert = require('assert')
var fs = require('fs')
var path = require('path')
var semver = require('semver')
var dep = require('../../scripts/npm-deprecations.js')

describe('docs: the live npm set against the published advisory ranges', function () {
  it('every live version is outside every advisory range, or has a written exception', function () {
    var errors = dep.checkLiveAgainstAdvisories(semver)
    assert.deepStrictEqual(errors, [], 'live set vs advisories:\n  ' + errors.join('\n  '))
  })

  it('reads the ranges from the advisory payloads rather than a copy of them', function () {
    var advs = dep.advisories()
    assert.ok(advs.length >= 7, 'expected at least the seven prepared advisories, got ' + advs.length)
    var dir = path.join(__dirname, '..', '..', 'docs', 'advisories')
    var onDisk = fs.readdirSync(dir).filter(function (f) { return /\.json$/.test(f) })
    assert.strictEqual(advs.length, onDisk.length,
      'an advisory payload exists that this check does not read')
    advs.forEach(function (a) {
      a.vulns.forEach(function (v) {
        var range = v.vulnerable_version_range.replace(/,/g, ' ')
        assert.ok(semver.validRange(range),
          a.id + ': "' + v.vulnerable_version_range + '" is not a range this check can read, so ' +
          'it would be skipped silently')
      })
    })
  })

  // The positive control. Without it the two assertions above pass just as happily against a
  // predicate that can never fail, which is a mistake made in this repository before.
  it('rejects the state that actually shipped: 9.36.0 live after GHSA-j884 published', function () {
    var saved = dep.LIVE['@smartledger/bsv'].slice()
    dep.LIVE['@smartledger/bsv'] = ['9.36.0'].concat(saved)
    var errors
    try {
      errors = dep.checkLiveAgainstAdvisories(semver)
    } finally {
      dep.LIVE['@smartledger/bsv'] = saved
    }
    assert.ok(errors.some(function (e) {
      return e.indexOf('9.36.0') >= 0 && e.indexOf('IS fixed by upgrading to 9.37.0') >= 0
    }), 'a live version below a fix an upgrade delivers must be an error, got:\n  ' + errors.join('\n  '))
  })

  it('rejects an exception that has stopped excusing anything', function () {
    var key = Object.keys(dep.ACCEPTED)[0]
    var saved = dep.ACCEPTED[key].versions.slice()
    dep.ACCEPTED[key].versions = saved.concat(['@smartledger/bsv@9.43.0'])
    var errors
    try {
      errors = dep.checkLiveAgainstAdvisories(semver)
    } finally {
      dep.ACCEPTED[key].versions = saved
    }
    assert.ok(errors.some(function (e) { return e.indexOf('9.43.0') >= 0 && e.indexOf('not live and') >= 0 }),
      'a stale exception must be an error, got:\n  ' + errors.join('\n  '))
  })
})
