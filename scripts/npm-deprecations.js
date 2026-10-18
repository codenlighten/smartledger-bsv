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

// The state the LAST run replaced, and the only record of an overwritten message, since the
// registry does not version them. snapshot-2026-10-13 and -10-14 stay committed as history.
var SNAPSHOT = path.join(__dirname, '..', 'docs', 'npm-deprecations', 'snapshot-2026-10-18.json')
// Versions deliberately left undeprecated. This was one version per package until three
// releases landed after 9.36.0 while the deprecation set stayed where it was, and the
// one-live-version model then reported them as a coverage gap it could not express. Membership
// here is a statement that a version is NOT deprecated — nothing more. WHETHER to deprecate a
// release is Greg's decision, not this script's: it changes what existing installs are told, so
// adding a version to a tier is never a bookkeeping step.
var LIVE = {
  '@smartledger/bsv': ['9.37.0', '9.38.0', '9.39.0', '9.39.1', '9.40.0', '9.41.0', '9.42.0',
    '9.43.0']
}
// Four of the eight above are inside a PUBLISHED advisory's vulnerable range and are still
// listed here deliberately: GHSA-jpm2-r6jf-2h78 covers `>= 5.5.0, < 9.40.0`, so 9.37.0, 9.38.0,
// 9.39.0 and 9.39.1 are in it. It declares NO patched version, because 9.40.0 adds only an
// OPT-IN pin and the default changes in 10.0.0 - the advisory's own words are "there is no
// version where the default is safe", and an already-issued lineage cannot be migrated at all.
// `checkLiveAgainstAdvisories` below holds this list to that reasoning, so a new advisory
// cannot quietly make a member of LIVE wrong the way GHSA-j884 did to 9.36.0 for three days.
var GHSA = 'https://github.com/codenlighten/smartledger-bsv/security/advisories/GHSA-gw63-x79h-mhjc'
// The age-proof advisory. A deprecation message is the only security notice most consumers ever
// see, so the one tier whose defect has no other description in the set carries its link.
var AGEPROOF_GHSA = 'https://github.com/codenlighten/smartledger-bsv/security/advisories/GHSA-2j2f-5v2f-pvpq'
// THE RECOMMENDED MINIMUM, in one place. It has now gone stale twice: it named 9.33.2, which
// turned out to carry a live confidentiality defect, and then 9.36.0, which went inside
// GHSA-j884's range on 2026-10-15 and was deprecated on 2026-10-18 — leaving 150 security
// messages recommending a deprecated version. Five tiers used to spell the version out as a
// literal and bypass this constant entirely, which is how a target goes stale UNEVENLY; they
// all route through it now, and `checkUpgradeTargets` fails the manifest if any recommended
// minimum is deprecated or inside an advisory range, so the third time cannot be silent.
var UPGRADE_MIN = '@smartledger/bsv@9.43.0'
var UPGRADE = 'upgrade to ' + UPGRADE_MIN + ' or later'
var UPGRADE_CAP = 'Upgrade to ' + UPGRADE_MIN + ' or later'
var SIGHASH_GHSA = 'https://github.com/codenlighten/smartledger-bsv/security/advisories/GHSA-j884-5pmj-6wqp'
// The one clause every version from 3.3.2 to 9.33.2 needs, since all of them have
// lib/ltp/proof and all of them derive the salt from the published nonce.
var SALT = 'An undisclosed field in an LTP selective-disclosure proof can also be ' +
  'recovered from the proof alone, because each field salt is derived from the nonce the ' +
  'proof carries; fixed in 9.34.0, itself deprecated. '

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
    'builds across 11,071 differential checks. ' + UPGRADE_CAP + '.'

  return [
    { id: 'S_crash',
      pkg: '@smartledger/bsv',
      versions: ['9.33.1'],
      why: 'the untyped crash on an undecodable output script, fixed in 9.33.2, plus the ' +
        'salt defect fixed in 9.34.0 - the message named only the first and understated the rest',
      msg: 'Security: an undisclosed field in an LTP selective-disclosure proof can be ' +
        'recovered from the proof alone, because each field salt is derived from the nonce ' +
        'the proof carries; fixed in 9.34.0, itself deprecated. May also throw an untyped ' +
        'error when reading ' +
        'some chain transactions. ' + UPGRADE_CAP + '.' },

    { id: 'S_salt',
      pkg: '@smartledger/bsv',
      versions: ['9.33.2'],
      why: 'the salt derivation, measured on this published artifact: an undisclosed date of ' +
        'birth came back from the proof alone in under 100,000 hashes. It was the only live ' +
        'version with no message at all until 9.34.0 existed to point at',
      msg: 'Security: an undisclosed field in an LTP selective-disclosure proof can be ' +
        'recovered from the proof alone, because each field salt is derived from the nonce ' +
        'the proof carries - measured on this version, a date of birth in under 100,000 ' +
        'hashes. Fixed in 9.34.0, itself deprecated. ' + UPGRADE_CAP + '.' },

    { id: 'S_parser',
      pkg: '@smartledger/bsv',
      versions: ['9.34.0'],
      why: 'the cut-off push length prefix: a FALSE REJECT, not a false accept - three output ' +
        'scripts the node accepts and mines could not be parsed. Fixed in 9.35.0',
      msg: 'Cannot parse three output scripts the reference node accepts and mines (an ' +
        'OP_RETURN followed by a push whose length field is cut off), so a transaction ' +
        'carrying one has no script verdict here. This is a false reject: no script is ' +
        'accepted that the node refuses. Fixed in 9.35.0, which is itself deprecated. ' +
        UPGRADE_CAP + '.' },

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
        'takes the birth date itself and refuses a credential, now deprecated too. ' +
        UPGRADE_CAP + '. ' + AGEPROOF_GHSA },

    // 9.36.0 was the last live version below a fix that an UPGRADE actually delivers, which is
    // the line this set is drawn on: GHSA-j884 is patched by 9.37.0, so a consumer who moves
    // off 9.36.0 is genuinely better off. The four versions above it that are inside
    // GHSA-jpm2's range are NOT deprecated, because no version's default is safe there and a
    // message recommending an upgrade would be recommending a non-remedy. The message names
    // both advisories anyway: a consumer on 9.36.0 is inside both, and the install warning is
    // the only security notice most of them ever see.
    { id: 'S_sighashtail',
      pkg: '@smartledger/bsv',
      versions: ['9.36.0'],
      why: 'the original-algorithm digest over a prevout script the node stops decoding, fixed ' +
        'in 9.37.0 - the one live version whose defect an upgrade actually closes. Deprecated ' +
        'on 2026-10-18 at Greg\'s instruction',
      msg: 'Security (GHSA-j884-5pmj-6wqp): a signature made with a hash type that selects the ' +
        'ORIGINAL transaction digest algorithm serializes the whole prevout script, where the ' +
        'reference node stops at a push it cannot decode, so such a signature disagrees with ' +
        'the network about whether the spend is valid. Fixed in 9.37.0. It needs both a prevout ' +
        'script ending in an undecodable push and a hash type without FORKID, so 0x41 - what ' +
        'current BSV wallets sign with - is unaffected. This version is also inside ' +
        'GHSA-jpm2-r6jf-2h78: the Token covenant accepts an authorization signed SIGHASH_NONE, ' +
        '9.40.0 is the first version offering the opt-in { pinSighash: true } that refuses it, ' +
        'no version is safe by default, and an already-issued lineage cannot be migrated. ' +
        UPGRADE_CAP + '. ' + SIGHASH_GHSA },

    { id: 'U_anchor',
      pkg: 'smartledger-bsv',
      versions: UNSCOPED_ANCHOR,
      why: 'GHSA-gw63-x79h-mhjc, measured live in all 14',
      msg: 'Critical (GHSA-gw63-x79h-mhjc): GDAF.anchorCredential and anchorBatch return a ' +
        "signed transaction whose OP_RETURN contains the caller's private key, measured in " +
        'this version and recoverable to the same WIF, so broadcasting it exposes the key in ' +
        'chain data. JSON.stringify(privateKey) also emits the secret scalar. No currently ' +
        'published smartledger-bsv version fixes either; migrate to ' +
        UPGRADE_MIN + ' or later - review migration requirements before switching - ' +
        'and ROTATE any key passed to those methods. ' + GHSA },

    { id: 'U_stringify',
      pkg: 'smartledger-bsv',
      versions: Object.keys(unscoped).filter(function (v) { return UNSCOPED_ANCHOR.indexOf(v) < 0 }).sort(cmp),
      why: 'the same stringify leak, in the versions that have no anchor module',
      msg: 'Critical: JSON.stringify(privateKey) includes the secret scalar, measured in ' +
        'this version, so any log, error report or request body built from that output ' +
        'carries the key to whoever can read it. No currently published smartledger-bsv ' +
        'version fixes this; migrate to ' + UPGRADE_MIN + ' or later - review migration ' +
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
        'earlier. ' + UPGRADE_CAP + '.' },

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
        'recovered from the proof alone; fixed in 9.34.0, itself deprecated. Also reports a ' +
        'different script ' +
        'error than the reference node for some invalid scripts (both reject), and may throw ' +
        'an untyped error when reading some chain transactions. ' +
        UPGRADE_CAP + '.' },

    { id: 'S_ghsa54',
      pkg: '@smartledger/bsv',
      versions: ghsa,
      why: 'already deprecated, but the existing text recommends >=7.5.3, which is inside the fund-loss window',
      msg: 'SECURITY (GHSA-gw63-x79h-mhjc): GDAF.anchorCredential/anchorBatch put the ' +
        "caller's private key into the OP_RETURN of the signed transaction they return, so " +
        'broadcasting it exposes the key in chain data, recoverable to the same WIF. ROTATE ' +
        'any key passed to those methods. ' + UPGRADE_CAP + ' - the ' +
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

// ------------------------------------------------- live versions vs the advisory ranges

// The vulnerable ranges are NOT retyped here. They are read from the advisory payloads in
// docs/advisories/*.json — the exact bodies sent to GitHub, which `npm run check:advisories`
// holds to their markdown. One source, so a range cannot drift between two files.
//
// Why this exists: on 2026-10-15 GHSA-j884 published with the range `< 9.37.0`, which put
// 9.36.0 — then a member of LIVE, and the version 150 registry messages named as the safe
// minimum — inside a published advisory. Nothing failed. The inventory page went on saying all
// live versions were at or above every fix for three days, because the only checks were
// "does the table match the registry" and "does the page match the messages", and neither
// looks at an advisory. A new advisory could silently make this file wrong, and did.
//
// Drafts and published advisories are treated the SAME. A draft describes a defect that has
// been measured; a live version inside its range needs a written reason either way, and reading
// the published/draft state would add a bookkeeping axis that can itself go stale.
function advisories () {
  var dir = path.join(__dirname, '..', 'docs', 'advisories')
  return fs.readdirSync(dir).filter(function (f) { return /\.json$/.test(f) }).map(function (f) {
    var j = JSON.parse(fs.readFileSync(path.join(dir, f), 'utf8'))
    return { id: f.replace(/^(draft-|GHSA-gw63-)/, '').replace(/\.json$/, ''), file: f, vulns: j.vulnerabilities || [] }
  })
}

// A live version inside an advisory range whose `patched_versions` is NULL. No upgrade closes
// it, so deprecating it would recommend a non-remedy — the message would name a version that
// does not fix what the message describes. Leaving it live is the honest option, but it must be
// a STATED one: an entry here, naming the advisory and why, or the check fails.
var ACCEPTED = {
  'token-sighash-authorization': {
    why: 'declares no patched version: 9.40.0 adds only an OPT-IN { pinSighash: true } and the ' +
      'default changes in 10.0.0, so in the advisory\'s own words "there is no version where ' +
      'the default is safe" — and an already-issued lineage cannot be migrated at all, because ' +
      'the covenant rebuilds its successor scriptCode from the authenticated chunk and forces ' +
      'its own code forward. Being precise about the upgrade, because the loose version of this ' +
      'is wrong: moving to 9.40.0 or later is NECESSARY to get the pin at all and NOT SUFFICIENT ' +
      'for anything, since the default stays unchanged until 10.0.0 and no upgrade touches a ' +
      'lineage already issued. A deprecation message is one line that a consumer reads as ' +
      '"upgrade and you are fine", and here that is false in both directions. The remedy is API ' +
      'use - sign 0x41, which this library\'s own helpers always do and offer no way not to - ' +
      'plus 9.40.0+ WITH { pinSighash: true } for new lineages.',
    versions: ['@smartledger/bsv@9.37.0', '@smartledger/bsv@9.38.0', '@smartledger/bsv@9.39.0',
      '@smartledger/bsv@9.39.1']
  }
}

function checkLiveAgainstAdvisories (semver) {
  var errors = []
  if (!semver) return ['NOTE: semver not resolvable, LIVE was not checked against the advisories']
  var advs = advisories()
  var excused = {}

  Object.keys(LIVE).forEach(function (pkg) {
    LIVE[pkg].forEach(function (v) {
      advs.forEach(function (a) {
        a.vulns.forEach(function (vuln) {
          if (vuln.package.name !== pkg) return
          var range = vuln.vulnerable_version_range.replace(/,/g, ' ')
          if (!semver.validRange(range)) {
            errors.push(a.id + ': vulnerable_version_range "' + vuln.vulnerable_version_range +
              '" is not a semver range this check can read')
            return
          }
          if (!semver.satisfies(v, range)) return
          var k = pkg + '@' + v
          if (typeof vuln.patched_versions === 'string' && vuln.patched_versions) {
            errors.push(k + ' is listed as LIVE but is inside ' + a.id + ' (' +
              vuln.vulnerable_version_range + '), which IS fixed by upgrading to ' +
              vuln.patched_versions + '. A version below a fix an upgrade delivers must be ' +
              'deprecated or Greg must decide otherwise in writing — it cannot just sit in LIVE.')
            return
          }
          var acc = ACCEPTED[a.id]
          if (!acc || acc.versions.indexOf(k) < 0) {
            errors.push(k + ' is listed as LIVE but is inside ' + a.id + ' (' +
              vuln.vulnerable_version_range + '), which names NO patched version. That may be ' +
              'the right call, but it needs an ACCEPTED entry in this file saying why.')
            return
          }
          excused[a.id + ' ' + k] = true
        })
      })
    })
  })

  // and the exceptions must not rot either: an ACCEPTED entry that no longer excuses anything is
  // a stale claim, which is the same failure one level up.
  Object.keys(ACCEPTED).forEach(function (id) {
    if (!advs.some(function (a) { return a.id === id })) {
      errors.push('ACCEPTED names "' + id + '", which is not an advisory payload in docs/advisories/')
    }
    ACCEPTED[id].versions.forEach(function (k) {
      if (!excused[id + ' ' + k]) {
        errors.push('ACCEPTED[' + id + '] excuses ' + k + ', but that version is not live and ' +
          'inside that advisory any more — drop the entry rather than leave it stating a fact ' +
          'that has stopped being true.')
      }
    })
  })
  return errors
}

// ------------------------------------------------- the version each message RECOMMENDS

// A deprecation message's last job is to say where to go instead, and that is the part of it
// that rots: the registry does not version a message, so a minimum that goes bad is 151
// irreversible overwrites to correct. It has gone bad twice — 9.33.2 (a live confidentiality
// defect) and 9.36.0 (inside GHSA-j884 from 2026-10-15, deprecated 2026-10-18) — and both times
// the only thing that noticed was a person re-reading the text.
//
// So: every version named in a RECOMMENDATION must be published, undeprecated, and outside every
// advisory range. Only recommendations are checked, which is the whole subtlety here. A message
// also states history — "Fixed in 9.35.0", "Fixed in 7.5.5, which does not address later
// security fixes" — and those versions are deprecated ON PURPOSE. They are true statements about
// where a defect was closed, not advice, so a check that swept up every version number in the
// text would fail on facts and force them to be deleted, making the messages worse. The
// recommendation is exactly what follows "upgrade to" or "migrate to".
function checkUpgradeTargets (tiers, state, semver) {
  var errors = []
  if (!semver) return ['NOTE: semver not resolvable, upgrade targets were not checked']
  var advs = advisories()
  var seen = {}

  tiers.forEach(function (t) {
    var re = /(?:upgrade|migrate) to (@?[\w@/.-]*?)@(\d+\.\d+\.\d+)/gi
    var m
    var found = 0
    while ((m = re.exec(t.msg)) !== null) {
      found++
      var pkg = m[1]
      var v = m[2]
      var key = t.id + ' ' + pkg + '@' + v
      if (seen[key]) continue
      seen[key] = true
      if (!state[pkg] || !(v in state[pkg])) {
        errors.push(t.id + ' recommends ' + pkg + '@' + v + ', which is not published')
        continue
      }
      if ((state[pkg][v] || '').length) {
        errors.push(t.id + ' recommends ' + pkg + '@' + v + ', which is DEPRECATED. A security ' +
          'notice that sends a consumer to a version carrying its own warning is the error this ' +
          'set has already made twice.')
      }
      advs.forEach(function (a) {
        a.vulns.forEach(function (vuln) {
          if (vuln.package.name !== pkg) return
          var range = vuln.vulnerable_version_range.replace(/,/g, ' ')
          if (!semver.validRange(range) || !semver.satisfies(v, range)) return
          errors.push(t.id + ' recommends ' + pkg + '@' + v + ', which is inside ' + a.id +
            ' (' + vuln.vulnerable_version_range + ')')
        })
      })
    }
    // a message with no recommendation at all is the quieter version of the same failure: the
    // consumer is told something is wrong and not told where to go. 9.34.0's text was like this.
    if (!found) {
      errors.push(t.id + ' names no version to upgrade or migrate to, so a consumer reading it ' +
        'learns there is a defect and nothing about where to go')
    }
  })
  return errors
}

// A version a message names as where a defect CLOSED is history, not advice — which is why
// `checkUpgradeTargets` deliberately ignores it. But several of those versions are themselves
// deprecated, and "fixed in 9.34.0" sitting two sentences from "upgrade to 9.43.0 or later"
// still reads to some people as a second destination. So if a message names a deprecated version
// as a fix, the clause has to say it is deprecated.
//
// Honest about what this is: a prose check, and therefore a BACKSTOP rather than a proof. It
// recognises "fixed in X" and "fixes this in X"; a future message could phrase it some other way
// and escape it. It cannot be made airtight without constraining how messages are written, which
// would be a worse trade. It catches the phrasing we actually use.
function checkFixReferences (tiers, state, semver) {
  var errors = []
  tiers.forEach(function (t) {
    // to the end of the sentence, not a fixed character count: the rule is that the clause says
    // it, and a 70-character window cut off one tier's qualifier mid-word on the first run.
    var re = /(?:fixed in|fixes this in) (\d+\.\d+\.\d+)([^.]*)/gi
    var m
    while ((m = re.exec(t.msg)) !== null) {
      var v = m[1]
      var pkg = '@smartledger/bsv'
      if (!state[pkg] || !(v in state[pkg])) continue
      if (!(state[pkg][v] || '').length) continue            // names a live version: nothing to say
      if (/deprecated|does not address/i.test(m[2])) continue // already qualified
      errors.push(t.id + ' names ' + v + ' as a fix without saying it is deprecated: "' +
        m[0].slice(0, 60) + '" — a reader two sentences from the real recommendation can take ' +
        'that as a second destination')
    }
  })
  return errors
}

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

  errors = errors.concat(checkLiveAgainstAdvisories(semver))
  errors = errors.concat(checkUpgradeTargets(tiers, state, semver))
  errors = errors.concat(checkFixReferences(tiers, state, semver))
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
    // Refusing beats defaulting here. With no tier named this used to assume NOTHING had been
    // applied, so straight after a successful 151-version run it printed 151 mismatches with
    // every expected/actual pair truncated to 80 identical-looking characters — a report that
    // cannot be told apart from a run that failed completely. I read it as catastrophe for
    // several minutes. The question the command answers has to be stated by the caller.
    if (!applied.length) {
      console.error('verify needs the tiers to treat as applied, or `all`.\n' +
        'With none named it would check that NOTHING has changed since ' + path.basename(SNAPSHOT) +
        ', and report every message you just sent as a mismatch.\n' +
        'Usage:  node scripts/npm-deprecations.js verify all\n' +
        '        node scripts/npm-deprecations.js verify S_ghsa54 U_anchor')
      process.exit(2)
    }
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

// The LIVE-vs-advisories invariant needs no network — it reads docs/advisories/*.json — so it is
// exported and pinned by test/docs/live_set_vs_advisories.js, which runs on every `npm test`
// rather than only when someone runs the registry gates. Everything else here does need the
// registry and stays behind the CLI.
module.exports = {
  LIVE: LIVE,
  ACCEPTED: ACCEPTED,
  UPGRADE_MIN: UPGRADE_MIN,
  advisories: advisories,
  buildTiers: buildTiers,
  checkLiveAgainstAdvisories: checkLiveAgainstAdvisories,
  checkUpgradeTargets: checkUpgradeTargets,
  checkFixReferences: checkFixReferences
}

if (require.main === module) {
  main().catch(function (e) {
    console.error('failed: ' + e.message)
    console.error('A network failure here is not a verdict about the deprecation set.')
    process.exit(1)
  })
}
