#!/usr/bin/env node
'use strict'

// Lint ratchet — gate the whole repo on `standard` without cleaning up the large
// legacy baseline in one go. The baseline (`.lint-baseline.json`) records how many
// violations each file currently has; CI fails only when a file gains NEW violations
// (or a previously-clean file gains any). Counts are per-file, so moving code around
// within a file doesn't trip it. The baseline can only shrink: when a file is cleaned,
// re-run with `--update` to lock the improvement in so it can't regress later.
//
//   node scripts/lint-ratchet.js            # check (CI): fail on any regression
//   node scripts/lint-ratchet.js --update   # regenerate the baseline from current state

var fs = require('fs')
var path = require('path')
// standard@12 exports the linter directly and takes a callback; standard@16+ ships an
// ES-module interop wrapper (the real API hangs off `.default`) and returns a Promise.
// Support both so the ratchet survives the upgrade in either direction.
var standardModule = require('standard')
var standard = standardModule.default || standardModule

var ROOT = path.resolve(__dirname, '..')
var BASELINE = path.join(ROOT, '.lint-baseline.json')

function rel (p) { return path.relative(ROOT, p).split(path.sep).join('/') }

/** Lint the whole project, bridging the callback (v12) and Promise (v16+) APIs. */
function lintAll (cb) {
  // v12 treats an empty file list as "everything"; v16+ rejects it with
  // "No files matching '.' were found", so pass an explicit recursive glob there.
  var isPromiseApi = standardModule.default != null
  var files = isPromiseApi ? ['**/*.js'] : []
  var opts = { cwd: ROOT }
  if (!isPromiseApi) return standard.lintFiles(files, opts, cb)
  // v16+ resolves to the ESLint results ARRAY; v12 called back with `{ results: [...] }`.
  standard.lintFiles(files, opts).then(function (res) {
    cb(null, Array.isArray(res) ? { results: res } : res)
  }, cb)
}

// Per-file violation counts + the messages themselves (for reporting regressions).
function collect (cb) {
  lintAll(function (err, res) {
    if (err) return cb(err)
    var counts = {}
    var messages = {}
    res.results.forEach(function (r) {
      if (!r.messages.length) return
      var f = rel(r.filePath)
      counts[f] = r.messages.length
      messages[f] = r.messages.map(function (m) {
        return '    ' + f + ':' + m.line + ':' + m.column + ': ' + m.message +
          (m.ruleId ? ' (' + m.ruleId + ')' : '')
      })
    })
    cb(null, { counts: counts, messages: messages })
  })
}

function sortedJson (obj) {
  var out = {}
  Object.keys(obj).sort().forEach(function (k) { out[k] = obj[k] })
  return JSON.stringify(out, null, 2) + '\n'
}

function update () {
  collect(function (err, cur) {
    if (err) { console.error(err.message); process.exit(2) }
    fs.writeFileSync(BASELINE, sortedJson(cur.counts))
    var total = Object.keys(cur.counts).reduce(function (a, k) { return a + cur.counts[k] }, 0)
    console.log('lint-ratchet: baseline updated — ' + Object.keys(cur.counts).length +
      ' files, ' + total + ' violations grandfathered.')
  })
}

function check () {
  if (!fs.existsSync(BASELINE)) {
    console.error('lint-ratchet: no .lint-baseline.json — run `node scripts/lint-ratchet.js --update` first.')
    process.exit(2)
  }
  var baseline = JSON.parse(fs.readFileSync(BASELINE, 'utf8'))
  collect(function (err, cur) {
    if (err) { console.error(err.message); process.exit(2) }
    var regressions = []
    var improvements = []
    Object.keys(cur.counts).forEach(function (f) {
      var was = baseline[f] || 0
      var now = cur.counts[f]
      if (now > was) regressions.push({ f: f, was: was, now: now })
      else if (now < was) improvements.push({ f: f, was: was, now: now })
    })
    // Files that were dirty and are now clean (absent from current) are improvements too.
    Object.keys(baseline).forEach(function (f) {
      if (!(f in cur.counts)) improvements.push({ f: f, was: baseline[f], now: 0 })
    })

    if (improvements.length) {
      console.log('lint-ratchet: ' + improvements.length + ' file(s) improved — run ' +
        '`node scripts/lint-ratchet.js --update` to lock it in:')
      improvements.forEach(function (i) { console.log('  ✓ ' + i.f + ' ' + i.was + ' -> ' + i.now) })
    }

    if (!regressions.length) {
      console.log('lint-ratchet: OK — no new lint violations against the baseline.')
      return
    }
    console.error('\nlint-ratchet: FAILED — ' + regressions.length + ' file(s) gained new violations:\n')
    regressions.forEach(function (r) {
      console.error('  ✗ ' + r.f + ' ' + r.was + ' -> ' + r.now + ' violations')
      cur.messages[r.f].forEach(function (m) { console.error(m) })
    })
    console.error('\nFix the new violations (or `standard --fix`). Do NOT --update to hide them.')
    process.exit(1)
  })
}

if (process.argv.indexOf('--update') !== -1) update()
else check()
