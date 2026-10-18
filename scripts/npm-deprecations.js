#!/usr/bin/env node
'use strict'

// The deprecation set for the two npm package names this project has published, and the
// checks that make it safe to send.  See docs/NPM_RELEASES.md for why each message says what
// it says, and scripts/published-version-probes/ for the measurements behind them.
//
//   node scripts/npm-deprecations.js snapshot [file]   read the registry, record every
//                                                      version's current deprecation field
//   node scripts/npm-deprecations.js manifest          build the tiers and check the invariants
//   node scripts/npm-deprecations.js plan [file]       write the npm commands to a shell script
//   node scripts/npm-deprecations.js verify [tier ...] re-read the registry and assert that the
//                                                      named tiers landed and nothing else moved
//
// This script never writes to the registry.  `plan` emits the commands; an operator runs them
// with credentials, which deliberately do not live in this repository.
//
// Two invariants are enforced before a manifest is emitted, because both failures are silent:
//
//   * every published version is covered by exactly ONE tier, or is listed in LIVE — the
//     versions that are deliberately NOT deprecated — and never both;
//   * every tier's range is an explicit `||` union of exact versions that selects exactly its
//     own list and nothing else.  A comparator range such as `>=7.5.5 <9.32.0` would sweep up
//     7.7.0 and 7.8.0, whose existing messages carry a fact no other version's does.

var fs = require('fs')
var path = require('path')
var https = require('https')

var SNAPSHOT = path.join(__dirname, '..', 'docs', 'npm-deprecations', 'snapshot-2026-10-14.json')
// Versions deliberately left undeprecated. This was one version per package until three
// releases landed after 9.36.0 while the deprecation set stayed where it was, and the
// one-live-version model then reported them as a coverage gap it could not express. Membership
// here is a statement that a version is NOT deprecated — nothing more. WHETHER to deprecate a
// release is Greg's decision, not this script's: it changes what existing installs are told, so
// adding a version to a tier is never a bookkeeping step.
var LIVE = {
  '@smartledger/bsv': ['9.36.0', '9.37.0', '9.38.0', '9.39.0', '9.39.1', '9.40.0', '9.41.0',
    '9.42.0', '9.43.0']
}
var GHSA = 'https://github.com/codenlighten/smartledger-bsv/security/advisories/GHSA-gw63-x79h-mhjc'
// The age-proof advisory. A deprecation message is the only security notice most consumers ever
// see, so the one tier whose defect has no other description in the set carries its link.
var AGEPROOF_GHSA = 'https://github.com/codenlighten/smartledger-bsv/security/advisories/GHSA-2j2f-5v2f-pvpq'
var UPGRADE = 'upgrade to @smartledger/bsv@9.36.0 or later'
// The one clause every version from 3.3.2 to 9.33.2 needs, since all of them have
// lib/ltp/proof and all of them derive the salt from the published nonce.
var SALT = 'An undisclosed field in an LTP selective-disclosure proof can also be ' +
  'recovered from the proof alone, because each field salt is derived from the nonce the ' +
  'proof carries; fixed in 9.34.0. '

// ---------------------------------------------------------------- registry

// The registry is fronted by a CDN that can serve a packument a few seconds stale, so a read
// taken straight after a write may still show the OLD message.  That direction is a false
// ALARM rather than a false pass - the new text cannot appear unless it was stored - but it
// makes a verify unusable, so ask for an uncached copy and let the caller retry.
function packument (name) {
  return new Promise(function (resolve, reject) {
    https.get('https://registry.npmjs.org/' + name.replace('/', '%2f') + '?t=' + Date.now(),
      { headers: { accept: 'application/json', 'cache-control': 'no-cache', pragma: 'no-cache' } },
      function (res) {
        if (res.statusCode !== 200) return reject(new Error(name + ': HTTP ' + res.statusCode))
        var body = ''
        res.on('data', function (d) { body += d })
        res.on('end', function () { try { resolve(JSON.parse(body)) } catch (e) { reject(e) } })
      }).on('error', reject)
  })
}

function readRegistry () {
  var names = ['@smartledger/bsv', 'smartledger-bsv']
  return Promise.all(names.map(packument)).then(function (packs) {
    var out = {}
    packs.forEach(function (p, i) {
      out[names[i]] = {}
      Object.keys(p.versions).forEach(function (v) {
        // npm leaves an empty string behind when a deprecation is cleared; treat it as absent
        var d = p.versions[v].deprecated
        out[names[i]][v] = (typeof d === 'string' && d.length) ? d : null
      })
    })
    return out
  })
}

// ---------------------------------------------------------------- the tiers

// The 14 unscoped versions measured to carry the anchor key disclosure.  Enumerated rather
// than expressed as a range because the boundary is where `lib/gdaf/smartledger-anchor`
// appears, which is not a version-number property.
var UNSCOPED_ANCHOR = [
  '3.3.1', '3.3.2', '3.3.3', '3.3.4', '3.3.5', '3.4.0', '3.4.4', '3.4.5',
  '4.0.0', '4.0.1', '4.1.0', '4.2.0', '4.2.1', '4.4.0'
]

function buildTiers (state) {
  var bsv = state['@smartledger/bsv']
  var unscoped = state['smartledger-bsv']

  // The 54 versions that carry the GHSA-gw63 anchor disclosure: everything below 7.5.1, where
  // the fix landed. Enumerated from the VERSION RANGE and not from the current deprecation
  // text, which was how this list was built on the first run.
  //
  // That dependency was wrong and the invariant check is what found it. On the first run every
  // version was undeprecated, so "has the GHSA text" and "has no text" partitioned the set
  // cleanly; after the run they do not, and the second run selected nothing at all. A tier
  // list has to be a function of MEASURED FACTS about a version, never of what its message
  // currently says - otherwise the set is correct exactly once.
  var ghsa = Object.keys(bsv).filter(function (v) {
    return cmp(v, '7.5.1') < 0
  }).sort(cmp)

  // The three versions whose PUBLISHED browser bundle was built from bn.js 4.12.3 while
  // package.json pins =4.12.5.  Read out of the bundles themselves: 4.12.5 rewrote divRound
  // to use `dm.mod.abs()` where 4.12.3 had `dm.mod.isub(num)`, and that survives bundling.
  // 7.6.2 was MISSED by the existing deprecations, which cover only 7.7.0 and 7.8.0; the
  // neighbours 7.7.1, 7.8.1 and 7.9.0 each carry one 4.12.5 copy, which is the expected
  // deduplication shape.
  var BUNDLE_MISMATCH = ['7.6.2', '7.7.0', '7.8.0']

  // the forgery range: live, 7.5.5 through 9.31.0.  Measured vulnerable in all of them by
  // scripts/published-version-probes/ltp-forgery.js.  7.6.2 is held out because its message
  // also has to carry the bundle fact.
  var forgery = Object.keys(bsv).filter(function (v) {
    return cmp(v, '7.5.5') >= 0 && cmp(v, '9.31.0') <= 0 &&
      BUNDLE_MISMATCH.indexOf(v) < 0
  }).sort(cmp)

  // Leads with the security item, because that is the one that calls for action.  The
  // mismatch is stated as measured; the no-behaviour-difference claim is attributed to the
  // 7.6.2 release rather than asserted here, because it is a test result, not a proof.
  var bundleText = 'Security: this version predates a verification-forgery fix in 9.32.0 (a ' +
    'verifier can accept a disclosed value the issuer never committed to). Its browser ' +
    'bundle was also built from bn.js 4.12.3 while package.json pins 4.12.5, confirmed in ' +
    'the published bundle; the 7.6.2 release reports no behaviour difference between those ' +
    'builds across 11,071 differential checks. Upgrade to @smartledger/bsv@9.36.0 or later.'

  return [
    { id: 'S_crash',
      pkg: '@smartledger/bsv',
      versions: ['9.33.1'],
      why: 'the untyped crash on an undecodable output script, fixed in 9.33.2, plus the ' +
        'salt defect fixed in 9.34.0 - the message named only the first and understated the rest',
      msg: 'Security: an undisclosed field in an LTP selective-disclosure proof can be ' +
        'recovered from the proof alone, because each field salt is derived from the nonce ' +
        'the proof carries; fixed in 9.34.0. May also throw an untyped error when reading ' +
        'some chain transactions. ' + UPGRADE.charAt(0).toUpperCase() + UPGRADE.slice(1) + '.' },

    { id: 'S_salt',
      pkg: '@smartledger/bsv',
      versions: ['9.33.2'],
      why: 'the salt derivation, measured on this published artifact: an undisclosed date of ' +
        'birth came back from the proof alone in under 100,000 hashes. It was the only live ' +
        'version with no message at all until 9.34.0 existed to point at',
      msg: 'Security: an undisclosed field in an LTP selective-disclosure proof can be ' +
        'recovered from the proof alone, because each field salt is derived from the nonce ' +
        'the proof carries - measured on this version, a date of birth in under 100,000 ' +
        'hashes. Fixed in 9.34.0. ' + UPGRADE.charAt(0).toUpperCase() + UPGRADE.slice(1) + '.' },

    { id: 'S_parser',
      pkg: '@smartledger/bsv',
      versions: ['9.34.0'],
      why: 'the cut-off push length prefix: a FALSE REJECT, not a false accept - three output ' +
        'scripts the node accepts and mines could not be parsed. Fixed in 9.35.0',
      msg: 'Cannot parse three output scripts the reference node accepts and mines (an ' +
        'OP_RETURN followed by a push whose length field is cut off), so a transaction ' +
        'carrying one has no script verdict here. This is a false reject: no script is ' +
        'accepted that the node refuses. Fixed in 9.35.0.' },

    { id: 'S_ageproof',
      pkg: '@smartledger/bsv',
      versions: ['9.35.0'],
      why: 'generateAgeProof discarded its argument and committed to a hardcoded birth date, ' +
        'so an age proof passed for a subject who does not meet the threshold. Fixed in 9.36.0',
      msg: 'GDAF generateAgeProof ignores the credential it is given and commits to a ' +
        'hardcoded birth date of 1995-06-15, so a proof that a subject meets an age threshold ' +
        'can be obtained for a subject who does not - measured on this version, a credential ' +
        'for a subject born 2015-03-01 verified true at every minimum age from 1 to 31. It was ' +
        'a constant function of its first argument: ten input shapes, including undefined and ' +
        'null, returned one commitment between them. A relying party that treats a true from ' +
        'verifyAgeProof as evidence about the credential subject is affected; verification ' +
        'needs the opening, which carries the birth date in plaintext. Fixed in 9.36.0, which ' +
        'takes the birth date itself and refuses a credential. ' +
        UPGRADE.charAt(0).toUpperCase() + UPGRADE.slice(1) + '. ' + AGEPROOF_GHSA },

    { id: 'U_anchor',
      pkg: 'smartledger-bsv',
      versions: UNSCOPED_ANCHOR,
      why: 'GHSA-gw63-x79h-mhjc, measured live in all 14',
      msg: 'Critical (GHSA-gw63-x79h-mhjc): GDAF.anchorCredential and anchorBatch return a ' +
        "signed transaction whose OP_RETURN contains the caller's private key, measured in " +
        'this version and recoverable to the same WIF, so broadcasting it exposes the key in ' +
        'chain data. JSON.stringify(privateKey) also emits the secret scalar. No currently ' +
        'published smartledger-bsv version fixes either; migrate to ' +
        '@smartledger/bsv@9.36.0 or later - review migration requirements before switching - ' +
        'and ROTATE any key passed to those methods. ' + GHSA },

    { id: 'U_stringify',
      pkg: 'smartledger-bsv',
      versions: Object.keys(unscoped).filter(function (v) { return UNSCOPED_ANCHOR.indexOf(v) < 0 }).sort(cmp),
      why: 'the same stringify leak, in the versions that have no anchor module',
      msg: 'Critical: JSON.stringify(privateKey) includes the secret scalar, measured in ' +
        'this version, so any log, error report or request body built from that output ' +
        'carries the key to whoever can read it. No currently published smartledger-bsv ' +
        'version fixes this; migrate to @smartledger/bsv@9.36.0 or later - review migration ' +
        'requirements before switching - and rotate any key that may have been stringified.' },

    { id: 'S_fundloss',
      pkg: '@smartledger/bsv',
      versions: ['7.5.1', '7.5.2', '7.5.3', '7.5.4'],
      why: 'the JSON round trip returns a derivable 40-bit key; bounded by measurement at both ends',
      msg: 'Critical: PrivateKey.fromObject on a JSON round-trip can silently return a ' +
        'different private key that anyone can derive, so funds sent to its address can be ' +
        'taken. Fixed in 7.5.5, which does not address later security fixes; ' + UPGRADE + '.' },

    { id: 'S_forgery',
      pkg: '@smartledger/bsv',
      versions: forgery,
      why: 'the LTP field commitment: the forgery was executed in all 63 of 7.5.5-9.31.0, ' +
        'of which 7.6.2 is carried by S_bundle instead',
      msg: 'Security: this version predates a verification-forgery fix in 9.32.0 (a verifier ' +
        'can accept a disclosed value the issuer never committed to); other fixes were made ' +
        'earlier. Upgrade to @smartledger/bsv@9.36.0 or later.' },

    { id: 'S_falseaccept',
      pkg: '@smartledger/bsv',
      versions: ['9.32.0'],
      why: 'the OP_RSHIFTNUM shift count, a false accept, fixed in 9.33.0, plus the salt ' +
        'defect fixed in 9.34.0',
      msg: 'May accept scripts that network consensus rejects, and may throw an untyped ' +
        'error when reading some chain transactions. ' + SALT + UPGRADE.charAt(0).toUpperCase() +
        UPGRADE.slice(1) + '.' },

    { id: 'S_errname',
      pkg: '@smartledger/bsv',
      versions: ['9.33.0'],
      why: 'NOT a false accept: the truncated-push error name, where both sides reject. ' +
        'Plus the salt defect fixed in 9.34.0, which IS a security item and leads the message',
      msg: 'Security: an undisclosed field in an LTP selective-disclosure proof can be ' +
        'recovered from the proof alone; fixed in 9.34.0. Also reports a different script ' +
        'error than the reference node for some invalid scripts (both reject), and may throw ' +
        'an untyped error when reading some chain transactions. ' +
        UPGRADE.charAt(0).toUpperCase() + UPGRADE.slice(1) + '.' },

    { id: 'S_ghsa54',
      pkg: '@smartledger/bsv',
      versions: ghsa,
      why: 'already deprecated, but the existing text recommends >=7.5.3, which is inside the fund-loss window',
      msg: 'SECURITY (GHSA-gw63-x79h-mhjc): GDAF.anchorCredential/anchorBatch put the ' +
        "caller's private key into the OP_RETURN of the signed transaction they return, so " +
        'broadcasting it exposes the key in chain data, recoverable to the same WIF. ROTATE ' +
        'any key passed to those methods. Upgrade to @smartledger/bsv@9.36.0 or later - the ' +
        'minimum previously recommended here, 7.5.3, has a separate private-key round-trip ' +
        'defect. ' + GHSA },

    { id: 'S_bundle',
      pkg: '@smartledger/bsv',
      versions: BUNDLE_MISMATCH,
      why: 'bundle built from 4.12.3 against a =4.12.5 pin, read from the published bundles; ' +
        '7.6.2 was missed by the existing deprecations, and the pointers at 7.7.1/7.8.1 are dropped',
      msg: bundleText }
  ]
}

function cmp (a, b) {
  var A = a.split(/[.-]/).map(Number)
  var B = b.split(/[.-]/).map(Number)
  for (var i = 0; i < 3; i++) if ((A[i] || 0) !== (B[i] || 0)) return (A[i] || 0) - (B[i] || 0)
  return 0
}

// ---------------------------------------------------------------- invariants

function check (tiers, state) {
  var errors = []
  var owner = {}
  tiers.forEach(function (t) {
    t.versions.forEach(function (v) {
      var k = t.pkg + '@' + v
      if (owner[k]) errors.push(k + ' is in two tiers (' + owner[k] + ', ' + t.id + ')')
      owner[k] = t.id
      if (!(v in state[t.pkg])) errors.push(k + ' is not published')
    })
  })
  Object.keys(state).forEach(function (pkg) {
    Object.keys(state[pkg]).forEach(function (v) {
      var covered = !!owner[pkg + '@' + v]
      var isLive = (LIVE[pkg] || []).indexOf(v) !== -1
      if (covered && isLive) errors.push('a version listed as live must not be deprecated: ' + pkg + '@' + v)
      if (!covered && !isLive) errors.push('published but in no tier and not listed as live: ' + pkg + '@' + v)
    })
  })

  // every range selects exactly its own list
  var semver
  try { semver = require('semver') } catch (e) { semver = null }
  tiers.forEach(function (t) {
    var range = t.versions.join(' || ')
    if (!semver) return
    if (!semver.validRange(range)) { errors.push(t.id + ': not a valid semver range'); return }
    var selected = Object.keys(state[t.pkg]).filter(function (v) { return semver.satisfies(v, range) }).sort(cmp)
    var want = t.versions.slice().sort(cmp)
    if (selected.join(',') !== want.join(',')) {
      errors.push(t.id + ' range misselects: extra [' +
        selected.filter(function (v) { return want.indexOf(v) < 0 }) + '] missing [' +
        want.filter(function (v) { return selected.indexOf(v) < 0 }) + ']')
    }
  })
  if (!semver) errors.push('NOTE: semver not resolvable, range selection was not checked')
  return errors
}

// ---------------------------------------------------------------- commands

function main () {
  var cmd = process.argv[2] || 'manifest'
  var arg = process.argv[3]

  if (cmd === 'snapshot') {
    return readRegistry().then(function (state) {
      var file = arg || SNAPSHOT
      fs.mkdirSync(path.dirname(file), { recursive: true })
      fs.writeFileSync(file, JSON.stringify(state, null, 1) + '\n')
      Object.keys(state).forEach(function (n) {
        var vs = Object.keys(state[n])
        console.log(n + ': ' + vs.length + ' versions, ' +
          vs.filter(function (v) { return state[n][v] }).length + ' deprecated')
      })
      console.log('written to ' + file)
    })
  }

  if (cmd === 'manifest' || cmd === 'plan') {
    return readRegistry().then(function (state) {
      var tiers = buildTiers(state)
      var errors = check(tiers, state)
      if (errors.length) {
        console.error('MANIFEST INVALID:\n  ' + errors.join('\n  '))
        process.exit(1)
      }
      var total = 0
      tiers.forEach(function (t) {
        total += t.versions.length
        console.log(t.id.padEnd(14) + String(t.versions.length).padStart(3) + '  ' +
          t.pkg.padEnd(17) + t.msg.length + ' chars  ' + t.why)
      })
      console.log('--- ' + total + ' versions in ' + tiers.length + ' tiers; invariants OK')

      if (cmd === 'plan') {
        var file = arg || '/tmp/npm-deprecations.sh'
        var lines = [
          '#!/bin/bash',
          '# Generated by scripts/npm-deprecations.js. Each line deprecates exactly the',
          '# versions listed in its range. Run with npm credentials; re-read the registry',
          '# afterwards with: node scripts/npm-deprecations.js verify <tier ...>',
          'set -eu',
          ''
        ]
        tiers.forEach(function (t) {
          lines.push('# ' + t.id + ': ' + t.versions.length + ' versions - ' + t.why)
          lines.push('npm deprecate ' + JSON.stringify(t.pkg + '@' + t.versions.join(' || ')) +
            ' ' + JSON.stringify(t.msg))
          lines.push('')
        })
        fs.writeFileSync(file, lines.join('\n'))
        console.log('commands written to ' + file)
      }
    })
  }

  if (cmd === 'verify') {
    var applied = process.argv.slice(3)
    var before = JSON.parse(fs.readFileSync(SNAPSHOT, 'utf8'))
    var attempt = 0
    var pass = function () {
      return once().then(function (bad) {
        if (!bad || ++attempt >= 4) process.exit(bad ? 1 : 0)
        console.log('  (' + bad + ' mismatches; the CDN copy may be stale, retrying in 10s)')
        return new Promise(function (resolve) { setTimeout(resolve, 10000) }).then(pass)
      })
    }
    var once = function () {
      return readRegistry().then(function (now) {
        var tiers = buildTiers(before)
        var expected = JSON.parse(JSON.stringify(before))
        tiers.forEach(function (t) {
          if (applied.indexOf(t.id) < 0 && applied.indexOf('all') < 0) return
          t.versions.forEach(function (v) { expected[t.pkg][v] = t.msg })
        })
        var bad = 0
        var moved = 0
        var total = 0
        Object.keys(expected).forEach(function (pkg) {
          Object.keys(expected[pkg]).forEach(function (v) {
            total++
            var e = expected[pkg][v]
            var a = now[pkg] ? now[pkg][v] : undefined
            if (e !== a) {
              bad++
              console.log('  MISMATCH ' + pkg + '@' + v +
              '\n    expected: ' + JSON.stringify(String(e).slice(0, 80)) +
              '\n    actual:   ' + JSON.stringify(String(a).slice(0, 80)))
            }
            if (before[pkg][v] !== a) moved++
          })
        })
        console.log('treating as applied: ' + (applied.join(', ') || '(none)'))
        console.log(total + ' versions checked, ' + moved + ' changed since the snapshot, ' +
        bad + ' mismatches')
        return bad
      })
    }
    return pass()
  }

  console.error('usage: node scripts/npm-deprecations.js snapshot|manifest|plan|verify')
  process.exit(2)
}

main().catch(function (e) {
  console.error('failed: ' + e.message)
  console.error('A network failure here is not a verdict about the deprecation set.')
  process.exit(1)
})
