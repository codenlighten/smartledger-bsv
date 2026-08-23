#!/usr/bin/env node
'use strict'

/**
 * README accuracy gate.
 *
 * The README went five releases (5.4.0 → 8.3.0) advertising the wrong version, the
 * wrong bundle sizes, and a dozen API symbols that did not exist, because
 * `sync-cdn-urls.js` rewrites only the unpkg URLs. Everything around those URLs was
 * unchecked, so it drifted silently while looking maintained.
 *
 * This checks the claims that can be checked mechanically:
 *
 *   1. the version badge and footer match package.json
 *   2. every bundle size in the loading-options table matches the built artifact
 *   3. every `bsv.X.Y` symbol the README names actually resolves at runtime
 *   4. every relative link points at a file that exists
 *   5. no U+FFFD replacement characters (corrupted emoji)
 *   6. no prose calling an old version "latest" or "current"
 *   7. the stability badge and STABILITY.md agree on the support date
 *
 * It cannot check prose. A statement like "defaults to pre-Genesis" stays wrong until
 * a human reads it — which is how that one survived. Treat a pass as "no mechanical
 * drift", not "the README is true".
 */

var fs = require('fs')
var path = require('path')

var ROOT = path.join(__dirname, '..')
var README = path.join(ROOT, 'README.md')

var pkg = require(path.join(ROOT, 'package.json'))
var text = fs.readFileSync(README, 'utf8')

var failures = []
var notes = []

function fail (what) { failures.push(what) }

// ---------------------------------------------------------------- 1. versions
var badge = text.match(/badge\/version-([0-9]+\.[0-9]+\.[0-9]+)-/)
if (!badge) {
  fail('version badge not found in README')
} else if (badge[1] !== pkg.version) {
  fail('version badge says ' + badge[1] + ', package.json says ' + pkg.version)
}

var footer = text.match(/\*\*SmartLedger-BSV v([0-9]+\.[0-9]+\.[0-9]+)\*\*/)
if (footer && footer[1] !== pkg.version) {
  fail('footer says v' + footer[1] + ', package.json says ' + pkg.version)
}

// ------------------------------------------------------------ 2. bundle sizes
// Rows look like: | **bsv-gdaf.min.js** | 1039KB | ... or | **🟢 bsv-x.min.js** | 166KB |
var sizeRow = /\|\s*\*\*(?:[^\w|]*\s*)?(bsv[\w.-]*\.js)\*\*\s*\|\s*(\d+)KB\s*\|/g
var m
var checkedSizes = 0
while ((m = sizeRow.exec(text)) !== null) {
  var file = m[1]
  var claimed = parseInt(m[2], 10)
  var full = path.join(ROOT, file)
  if (!fs.existsSync(full)) {
    notes.push(file + ' is not built, size not checked (run `npm run build-all`)')
    continue
  }
  var actual = Math.ceil(fs.statSync(full).size / 1024)
  checkedSizes++
  if (actual !== claimed) {
    fail(file + ': README says ' + claimed + 'KB, actual ' + actual + 'KB')
  }
}
if (checkedSizes === 0) notes.push('no bundle sizes were checked')

// --------------------------------------------------------------- 3. symbols
// Only resolve when the bundles/library can be loaded; a require failure is itself
// worth failing on.
var bsv
try {
  process.env.BSV_HIDE_DEPRECATIONS = '1'
  bsv = require(path.join(ROOT, 'index.js'))
} catch (e) {
  fail('could not require the library to check README symbols: ' + e.message)
}

if (bsv) {
  var symbols = text.match(/\bbsv\.[A-Za-z_][A-Za-z0-9_]*(\.[A-Za-z_][A-Za-z0-9_]*)*/g) || []
  var seen = Object.create(null)
  symbols.forEach(function (sym) {
    if (seen[sym]) return
    seen[sym] = true
    // bsv.min.js / bsv.bundle.js are filenames, not symbols
    if (/\.(min|bundle)(\.js)?$/.test(sym)) return
    var parts = sym.split('.').slice(1)
    var cur = bsv
    for (var i = 0; i < parts.length; i++) {
      try {
        if (cur == null || cur[parts[i]] === undefined) { cur = undefined; break }
        cur = cur[parts[i]]
      } catch (e) { cur = undefined; break }
    }
    if (cur === undefined) fail('README references ' + sym + ', which does not exist')
  })
}

// ----------------------------------------------------------------- 4. links
var linkRe = /\]\((\.?\/?(?:docs|examples|tests|lib|bin)\/[^)#\s]+)\)/g
var seenLink = Object.create(null)
while ((m = linkRe.exec(text)) !== null) {
  var rel = m[1].replace(/^\.\//, '')
  if (seenLink[rel]) continue
  seenLink[rel] = true
  if (!fs.existsSync(path.join(ROOT, rel))) fail('dead link: ' + rel)
}
;['LICENSE', 'CHANGELOG.md', 'SECURITY.md'].forEach(function (f) {
  if (text.indexOf('](./' + f + ')') !== -1 && !fs.existsSync(path.join(ROOT, f))) {
    fail('dead link: ' + f)
  }
})

// ------------------------------------------------------------- 5. mojibake
var mojibake = text.split('\n').reduce(function (acc, line, i) {
  if (line.indexOf('�') !== -1) acc.push(i + 1)
  return acc
}, [])
if (mojibake.length) {
  fail('U+FFFD replacement characters on line(s) ' + mojibake.join(', '))
}

// ------------------------------------- 6. versions claimed as the current one
// The badge and footer were checked above, but the README also spent five
// releases saying "**8.3.0 (latest)**" in prose while the badge was correct.
// A version presented as the CURRENT one is a mechanical claim even though it
// sits in prose, so check those specifically. Historical references
// ("Upgrading to v8.0.0", "migrating from 5.x") are legitimate and ignored.
var CURRENCY = /(?:\*\*)?v?([0-9]+\.[0-9]+\.[0-9]+)(?:\*\*)?[^\n]{0,30}?\((?:latest|current)\)|(?:latest|current)\s+(?:release|version)[^\n]{0,30}?v?([0-9]+\.[0-9]+\.[0-9]+)/gi
var cm
while ((cm = CURRENCY.exec(text)) !== null) {
  var claimedCurrent = cm[1] || cm[2]
  if (claimedCurrent !== pkg.version) {
    fail('README calls ' + claimedCurrent + ' the latest/current version, package.json says ' + pkg.version)
  }
}

// --------------------------------------------- 7. the stability commitment
// The support window is stated in two places — a README badge and STABILITY.md.
// Two copies of a promise drift, and this is the one promise the project cannot
// afford to be vague about.
var STABILITY = path.join(ROOT, 'STABILITY.md')
if (!fs.existsSync(STABILITY)) {
  fail('STABILITY.md is missing; the README badge and policy depend on it')
} else {
  var badgeDate = text.match(/stable%20until-(\d{4})--(\d{2})--(\d{2})/)
  var policy = fs.readFileSync(STABILITY, 'utf8')
  // Anchored on the COMMITMENT SENTENCE rather than the first date in the file. A bare
  // /(\d{4}-\d{2}-\d{2})/ worked only because that sentence happens to be line 5:
  // STABILITY.md also carries a six-row release-history table of dates, so one dated
  // line added above the commitment ("Last reviewed 2026-08-23") would have pointed
  // this check at the wrong date while still reporting OK.
  var policyDate = policy.match(/will not break your code until at least (\d{4}-\d{2}-\d{2})/)
  var fromBadge = badgeDate && badgeDate[1] + '-' + badgeDate[2] + '-' + badgeDate[3]
  if (!badgeDate && !policyDate) {
    fail('neither the README stability badge nor the STABILITY.md commitment date could be read')
  } else if (!badgeDate) {
    fail('STABILITY.md commits to ' + policyDate[1] + ', but the README has no stability badge')
  } else if (!policyDate) {
    // Previously unhandled: `badgeDate && !policyDate` fell through both arms. Reword
    // the commitment sentence and the two copies of the promise were free to diverge
    // forever while this check still reported OK — the exact failure it exists to catch.
    fail('README badge says ' + fromBadge + ', but STABILITY.md has no parseable commitment ' +
      'date (expected "will not break your code until at least YYYY-MM-DD")')
  } else if (fromBadge !== policyDate[1]) {
    fail('stability badge says ' + fromBadge + ', STABILITY.md says ' + policyDate[1])
  }
}

// ------------------------------- 8. deprecation notices cannot outrun the release
// A `since:` naming a version that does not exist yet is a notice telling users to
// check a changelog they cannot read. It happened: this file shipped `since: '9.1.0'`
// while package.json said 9.0.0, and nothing caught it — check:readme validated the
// badge and footer against pkg.version but never the deprecation metadata.
var libDir = path.join(ROOT, 'lib')
function cmpSemver (a, b) {
  var pa = String(a).split('.').map(Number)
  var pb = String(b).split('.').map(Number)
  for (var i = 0; i < 3; i++) {
    if ((pa[i] || 0) !== (pb[i] || 0)) return (pa[i] || 0) < (pb[i] || 0) ? -1 : 1
  }
  return 0
}
function walkJs (dir, out) {
  fs.readdirSync(dir, { withFileTypes: true }).forEach(function (e) {
    var full = path.join(dir, e.name)
    if (e.isDirectory()) walkJs(full, out)
    else if (/\.js$/.test(e.name)) out.push(full)
  })
  return out
}
if (fs.existsSync(libDir)) {
  walkJs(libDir, []).forEach(function (file) {
    var src = fs.readFileSync(file, 'utf8')
    var re = /since:\s*'(\d+\.\d+\.\d+)'/g
    var m
    while ((m = re.exec(src)) !== null) {
      if (cmpSemver(m[1], pkg.version) > 0) {
        fail(path.relative(ROOT, file) + ' deprecates since ' + m[1] +
          ', which is ahead of package.json (' + pkg.version + ')')
      }
    }
  })
}

// ------------------------------------------------------------------- report
notes.forEach(function (n) { console.log('note: ' + n) })

if (failures.length) {
  console.error('\nREADME accuracy: ' + failures.length + ' problem(s)\n')
  failures.forEach(function (f) { console.error('  ✗ ' + f) })
  console.error('')
  process.exit(1)
}

console.log('README accuracy: OK (version, ' + checkedSizes +
  ' bundle sizes, symbols, links, currency claims, stability date)')
