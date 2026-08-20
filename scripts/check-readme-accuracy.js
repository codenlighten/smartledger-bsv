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

// ------------------------------------------------------------------- report
notes.forEach(function (n) { console.log('note: ' + n) })

if (failures.length) {
  console.error('\nREADME accuracy: ' + failures.length + ' problem(s)\n')
  failures.forEach(function (f) { console.error('  ✗ ' + f) })
  console.error('')
  process.exit(1)
}

console.log('README accuracy: OK (version, ' + checkedSizes + ' bundle sizes, symbols, links)')
