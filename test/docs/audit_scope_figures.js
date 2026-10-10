'use strict'

/* global describe, it, before */

// docs/AUDIT_SCOPE.md goes to external vendors, and its stated purpose is that every
// vendor prices the same thing. That makes its line counts part of the deliverable, not
// commentary — and it had already drifted twice. §7 of the document reproduces every
// figure with a shell script and says to re-run it before sending, but nothing checked
// the PROSE that quotes those figures: the enquiry text in §6 asked vendors to price a
// Tier 2 of 1,607 lines while the scope table beside it defined 1,623. A reader cannot
// tell which number is the scope, which is the one thing the document promises.
//
// This recomputes the five figures from lib/ using §7's own definitions and asserts the
// document agrees with the library and with itself. When it fails, the fix is to re-run
// §7 and update the figures — including the copies inside the §6 enquiry text.

require('chai').should()
var fs = require('fs')
var path = require('path')

var ROOT = path.join(__dirname, '..', '..')
var DOC = path.join(ROOT, 'docs', 'AUDIT_SCOPE.md')

// §7, verbatim in intent: whole directories, then individual files (some PARTIAL).
var TIER1_DIRS = ['lib/crypto', 'lib/transaction', 'lib/notaryhash', 'lib/covenant']
var TIER1_FILES = [
  'lib/privatekey.js', 'lib/publickey.js',
  'lib/script/interpreter.js',
  'lib/smart_contract/locks.js', 'lib/smart_contract/index.js',
  'lib/util/jcs.js'
]
var TIER2_DIRS = ['lib/encoding', 'lib/mnemonic', 'lib/ecies']

function jsFiles (dir) {
  var out = []
  ;(function walk (d) {
    fs.readdirSync(d, { withFileTypes: true }).forEach(function (e) {
      var full = path.join(d, e.name)
      if (e.isDirectory()) walk(full)
      else if (e.name.slice(-3) === '.js') out.push(full)
    })
  })(dir)
  return out
}

// `cat f1 f2 … | wc -l` counts newlines across the concatenation. A file whose last line
// has no trailing newline therefore contributes one fewer than its line count, and the
// count is NOT the sum of per-file `wc -l`. Match the shell exactly.
function newlines (files) {
  return files.reduce(function (n, f) {
    var buf = fs.readFileSync(f)
    for (var i = 0, c = 0; i < buf.length; i++) if (buf[i] === 0x0a) c++
    return n + c
  }, 0)
}

function lines (globs) {
  return newlines(globs.reduce(function (acc, g) {
    return acc.concat(fs.statSync(path.join(ROOT, g)).isDirectory()
      ? jsFiles(path.join(ROOT, g))
      : [path.join(ROOT, g)])
  }, []))
}

describe('docs/AUDIT_SCOPE.md figures', function () {
  var doc, measured

  before(function () {
    doc = fs.readFileSync(DOC, 'utf8')
    var total = lines(['lib'])
    var t1 = lines(TIER1_DIRS) + lines(TIER1_FILES)
    var t2 = lines(TIER2_DIRS)
    measured = { tier1: t1, tier2: t2, excluded: total - t1 - t2, total: total,
      files: jsFiles(path.join(ROOT, 'lib')).length }
  })

  function stated (re, label) {
    var m = doc.match(re)
    if (!m) throw new Error('could not find ' + label + ' in docs/AUDIT_SCOPE.md')
    return parseInt(m[1].replace(/,/g, ''), 10)
  }

  it('the measurement reconciles, and is not vacuously zero', function () {
    measured.total.should.be.above(0)
    ;(measured.tier1 + measured.tier2 + measured.excluded).should.equal(measured.total)
  })

  it('the scope table matches the library', function () {
    stated(/\ntier 1\s+([\d,]+)/, 'the §7 tier 1 total').should.equal(measured.tier1)
    stated(/\ntier 2\s+([\d,]+)/, 'the §7 tier 2 total').should.equal(measured.tier2)
    stated(/\nexcluded\s+([\d,]+)/, 'the §7 excluded total').should.equal(measured.excluded)
    stated(/\ntotal\s+([\d,]+)/, 'the §7 grand total').should.equal(measured.total)
    stated(/which is ([\d,]+) lines across/, 'the lib/ total in prose').should.equal(measured.total)
    stated(/across ([\d,]+) files/, 'the file count').should.equal(measured.files)
  })

  it('the section headings match the scope table', function () {
    stated(/### Tier 1 — ([\d,]+) lines/, 'the Tier 1 heading').should.equal(measured.tier1)
    stated(/### Tier 2 — optional, ([\d,]+) lines/, 'the Tier 2 heading').should.equal(measured.tier2)
  })

  it('the enquiry text quotes the same numbers it asks vendors to price', function () {
    // The defect this file was written for: §6 said 1,607 where the table said 1,623.
    var enquiry = doc.slice(doc.indexOf('seeking a quote'))
    var t1 = enquiry.match(/Tier 1 — ([\d,]+) lines/)
    var t2 = enquiry.match(/Tier 2 — ([\d,]+) lines/)
    if (!t1 || !t2) throw new Error('the §6 enquiry text no longer states both tier sizes')
    parseInt(t1[1].replace(/,/g, ''), 10).should.equal(measured.tier1)
    parseInt(t2[1].replace(/,/g, ''), 10).should.equal(measured.tier2)
  })

  it('the claim the §3 cut rests on still holds', function () {
    // networks.js must carry no consensus-flag logic, or the cut needs re-arguing.
    var net = fs.readFileSync(path.join(ROOT, 'lib/networks.js'), 'utf8')
    ;(net.match(/SCRIPT_|GENESIS|CHRONICLE|consensus/g) || []).length.should.equal(0)
  })
})
