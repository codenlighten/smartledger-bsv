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

// The second half: a deprecation message's last job is to say where to go instead, and that is
// the part that rots. It has rotted three times — 7.5.3 from inside the fund-loss window, 9.33.2
// which carried a live confidentiality defect, and 9.36.0 which went inside GHSA-j884's range on
// 2026-10-15 and was deprecated on 2026-10-18. Each time a person caught it by re-reading prose.
//
// These run against the tier texts WITHOUT the registry, so they cannot see "is the recommended
// version deprecated" — that needs the packument and stays in the gate. What they can see, and
// what the structural cause actually was, is the target going stale unevenly: five tiers used to
// spell the version out as a literal and bypass the shared constant entirely.
describe('docs: the version each deprecation message recommends', function () {
  var FIXTURE = {
    '@smartledger/bsv': { '9.43.0': '', '9.36.0': 'deprecated', '9.35.0': 'deprecated', '7.5.5': 'deprecated' },
    'smartledger-bsv': { '4.4.0': 'deprecated' }
  }

  it('names one minimum everywhere, and it is the shared constant', function () {
    var min = dep.UPGRADE_MIN
    assert.ok(/^@smartledger\/bsv@\d+\.\d+\.\d+$/.test(min), 'UPGRADE_MIN is malformed: ' + min)
    var src = fs.readFileSync(path.join(__dirname, '..', '..', 'scripts', 'npm-deprecations.js'), 'utf8')
    var body = src.slice(src.indexOf('function buildTiers'))
    var literals = body.match(/@smartledger\/bsv@\d+\.\d+\.\d+ or later/g) || []
    assert.deepStrictEqual(literals, [],
      'a tier spells a recommended minimum out as a literal instead of using UPGRADE_MIN, which ' +
      'is how the target rots unevenly: ' + literals.join(', '))
  })

  it('rejects a recommendation that points at a deprecated version', function () {
    var min = dep.UPGRADE_MIN.split('@').pop()
    var state = JSON.parse(JSON.stringify(FIXTURE))
    state['@smartledger/bsv'][min] = 'deprecated' // the exact shape shipped until 2026-10-18
    var errors = dep.checkUpgradeTargets(dep.buildTiers(state), state, semver)
    assert.ok(errors.some(function (e) { return e.indexOf('is DEPRECATED') >= 0 }),
      'recommending a deprecated version must be an error, got:\n  ' + errors.join('\n  '))
  })

  it('rejects a recommendation inside an advisory range', function () {
    var state = JSON.parse(JSON.stringify(FIXTURE))
    state['@smartledger/bsv']['9.38.0'] = '' // undeprecated, but inside GHSA-jpm2
    var tiers = dep.buildTiers(state).map(function (t) {
      return { id: t.id, pkg: t.pkg, versions: t.versions, msg: t.msg.replace(/@smartledger\/bsv@\d+\.\d+\.\d+ or later/g, '@smartledger/bsv@9.38.0 or later') }
    })
    var errors = dep.checkUpgradeTargets(tiers, state, semver)
    assert.ok(errors.some(function (e) { return e.indexOf('inside token-sighash-authorization') >= 0 }),
      'a target inside an advisory range must be an error, got:\n  ' + errors.join('\n  '))
  })

  it('still accepts a version a message names as HISTORY rather than advice', function () {
    // 9.35.0 and 7.5.5 are deprecated and several messages say "Fixed in" them. Those are true
    // statements about where a defect closed. A check that swept up every version number in the
    // text would fail on facts and force them to be deleted, making the messages worse.
    var state = JSON.parse(JSON.stringify(FIXTURE))
    var tiers = dep.buildTiers(state)
    var historical = tiers.filter(function (t) { return /Fixed in (9\.35\.0|7\.5\.5)/.test(t.msg) })
    assert.ok(historical.length, 'no tier names a deprecated version as history any more — ' +
      'this control has stopped controlling for anything')
    assert.deepStrictEqual(dep.checkUpgradeTargets(historical, state, semver), [],
      'a version named as history must not be treated as a recommendation')
  })
})

// And the quieter half of the same problem. "fixed in 9.34.0" two sentences from "upgrade to
// 9.43.0 or later" reads to some people as a second destination, and 9.34.0 is deprecated. Five
// messages were like that; they now say so. gpt-assist raised it on a review of the finished
// re-point, which is the one point of five that turned out to be a live defect.
describe('docs: a deprecated version named as a fix says that it is deprecated', function () {
  // buildTiers reads both package names, so both have to be present
  var STATE = {
    '@smartledger/bsv': { '9.43.0': '', '9.36.0': 'dep', '9.35.0': 'dep', '9.34.0': 'dep', '7.5.5': 'dep' },
    'smartledger-bsv': { '4.4.0': 'dep' }
  }

  it('holds for every tier as written', function () {
    var errors = dep.checkFixReferences(dep.buildTiers(STATE), STATE, semver)
    assert.deepStrictEqual(errors, [], 'unqualified fix references:\n  ' + errors.join('\n  '))
  })

  it('rejects the unqualified phrasing that shipped until 2026-10-18', function () {
    var tiers = [{ id: 'T',
      pkg: '@smartledger/bsv',
      versions: ['9.33.2'],
      msg: 'A defect, fixed in 9.34.0. Upgrade to @smartledger/bsv@9.43.0 or later.' }]
    var errors = dep.checkFixReferences(tiers, STATE, semver)
    assert.ok(errors.some(function (e) { return e.indexOf('names 9.34.0 as a fix') >= 0 }),
      'got:\n  ' + errors.join('\n  '))
  })

  it('reads to the end of the sentence, not a fixed character count', function () {
    // The first version of the check used a 70-character window and cut off mid-word before the
    // qualifier in the longest clause, failing the real file. A long clause must still pass.
    var tiers = [{ id: 'T',
      pkg: '@smartledger/bsv',
      versions: ['9.35.0'],
      msg: 'Fixed in 9.36.0, which takes the birth date itself and refuses a credential ' +
        'outright rather than guessing, now deprecated too. Upgrade to @smartledger/bsv@9.43.0 or later.' }]
    assert.deepStrictEqual(dep.checkFixReferences(tiers, STATE, semver), [])
  })

  it('says nothing about a fix version that is still live', function () {
    var tiers = [{ id: 'T',
      pkg: '@smartledger/bsv',
      versions: ['9.33.2'],
      msg: 'A defect, fixed in 9.43.0. Upgrade to @smartledger/bsv@9.43.0 or later.' }]
    assert.deepStrictEqual(dep.checkFixReferences(tiers, STATE, semver), [])
  })
})
