#!/usr/bin/env node
'use strict'

/**
 * Refuse any live doc that tells a reader to install or require the UNSCOPED package name.
 *
 * `smartledger-bsv` is a different package from `@smartledger/bsv`. It is dormant — its last
 * publish predates this repository's security work — and **14 of its 22 published versions
 * disclose the caller's private key** (GHSA-gw63-x79h-mhjc, measured 2026-10-13). A snippet that says
 * `require('smartledger-bsv')` is therefore not a cosmetic inconsistency: a reader who copies
 * it installs a package whose current versions leak keys, and `npm install smartledger-bsv`
 * resolves to one of them.
 *
 * `docs/DOCUMENTATION_REVIEW_REPORT.md` noticed the inconsistency and listed it under
 * "Examples ... Others use require('smartledger-bsv')". Nothing acted on it, because nothing
 * failed. This is that something.
 *
 * Exempt: files that RECORD the past rather than instruct. A changelog entry or an archived
 * report describing what an old version did must keep the name it used, and the review report
 * has to quote the string to name the problem.
 */

var fs = require('fs')
var path = require('path')

var ROOT = path.join(__dirname, '..')
var UNSCOPED = 'smartledger-bsv'

// Paths whose job is to preserve history or to quote the problem.
var EXEMPT = [
  'archive/',
  'CHANGELOG.md',
  'docs/DOCUMENTATION_REVIEW_REPORT.md',
  'docs/NPM_RELEASES.md',
  'docs/npm-deprecations/',
  'docs/advisories/',
  'node_modules/',
  '.git/',
  'bsv.bundle.js',
  'scripts/check-package-name.js'
]

function exempt (rel) {
  return EXEMPT.some(function (e) {
    return e.slice(-1) === '/' ? rel.indexOf(e) === 0 : rel === e
  })
}

function walk (dir, out) {
  fs.readdirSync(dir, { withFileTypes: true }).forEach(function (d) {
    var full = path.join(dir, d.name)
    var rel = path.relative(ROOT, full)
    if (exempt(rel + (d.isDirectory() ? '/' : ''))) return
    if (d.isDirectory()) {
      if (d.name === 'node_modules' || d.name === '.git') return
      walk(full, out)
    } else if (/\.(md|js|ts|json)$/.test(d.name)) {
      out.push({ full: full, rel: rel })
    }
  })
  return out
}

// A reference that would make a reader INSTALL or LOAD the unscoped package. Prose that merely
// names it (as this very file does) is fine; `require`, `import` and `npm install` are not.
var Q = '[\'"]'
var PATTERNS = [
  new RegExp('require\\(\\s*' + Q + UNSCOPED + Q, 'g'),
  new RegExp('from\\s+' + Q + UNSCOPED + Q, 'g'),
  new RegExp('import\\s*\\(\\s*' + Q + UNSCOPED + Q, 'g'),
  new RegExp('npm\\s+(install|i|add)\\s+(-[-\\w]+\\s+)*' + UNSCOPED + '(?![\\w./-])', 'g'),
  new RegExp('yarn\\s+add\\s+(-[-\\w]+\\s+)*' + UNSCOPED + '(?![\\w./-])', 'g')
]

var bad = []
walk(ROOT, []).forEach(function (f) {
  var src = fs.readFileSync(f.full, 'utf8')
  var lines = src.split('\n')
  lines.forEach(function (line, i) {
    PATTERNS.forEach(function (re) {
      re.lastIndex = 0
      if (re.test(line)) bad.push(f.rel + ':' + (i + 1) + ': ' + line.trim().slice(0, 100))
    })
  })
})

if (bad.length) {
  console.error('\npackage-name FAILED — ' + bad.length + ' live reference(s) to the UNSCOPED')
  console.error('package `' + UNSCOPED + '`. 14 of its 22 published versions disclose the')
  console.error("caller's private key, and all 22 are deprecated — which warns but still")
  console.error('installs. Use `@smartledger/bsv`:\n')
  bad.forEach(function (b) { console.error('    ' + b) })
  console.error('\n  Historical records are exempt; see EXEMPT in scripts/check-package-name.js.\n')
  process.exit(1)
}
console.log('package-name: OK — no live doc requires or installs the unscoped package.')
