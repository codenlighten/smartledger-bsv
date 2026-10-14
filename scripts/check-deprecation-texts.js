#!/usr/bin/env node
'use strict'

// Every deprecation message that `npm deprecate` would send must appear VERBATIM in
// docs/NPM_RELEASES.md.
//
// This existed as a check I ran by hand after the first run, and it found nothing, so it was
// never wired in. The second run is what showed why it has to be: every message's upgrade
// target moved from 9.33.2 to 9.35.0, and the doc kept the old text while the registry got the
// new one. Nothing failed. The page simply stopped describing what consumers were being told,
// which is the one job it has.
//
// The registry is the authority for what WAS sent; `scripts/npm-deprecations.js verify` reads
// it back byte for byte. This is the other half: that the page and the script agree about what
// WILL be sent.

var fs = require('fs')
var path = require('path')
var cp = require('child_process')

var DOC = path.join(__dirname, '..', 'docs', 'NPM_RELEASES.md')
var RUNNER = path.join(__dirname, 'npm-deprecations.js')
var tmp = path.join(require('os').tmpdir(), 'deprecation-texts-' + process.pid + '.sh')

try {
  cp.execFileSync(process.execPath, [RUNNER, 'plan', tmp], { stdio: 'pipe', maxBuffer: 1 << 24 })
} catch (e) {
  console.error('deprecation-texts: could not build the plan — ' + (e.stderr || e.message))
  process.exit(1)
}

var plan = fs.readFileSync(tmp, 'utf8')
fs.unlinkSync(tmp)
var doc = fs.readFileSync(DOC, 'utf8')

var messages = []
plan.split('\n').forEach(function (line) {
  var m = line.match(/^npm deprecate "([^"]+)" "(.*)"$/)
  if (m) messages.push({ spec: m[1], msg: m[2] })
})

if (!messages.length) {
  console.error('deprecation-texts: the plan produced no messages, which cannot be right')
  process.exit(1)
}

var missing = messages.filter(function (m) { return doc.indexOf(m.msg) < 0 })

if (missing.length) {
  console.error('\ndeprecation-texts FAILED — ' + missing.length + ' of ' + messages.length +
    ' message(s) are not in docs/NPM_RELEASES.md verbatim:\n')
  missing.forEach(function (m) {
    console.error('  ' + m.spec.split(' || ')[0] + (m.spec.indexOf('||') > 0 ? ' (and others)' : ''))
    console.error('    ' + m.msg.slice(0, 110) + (m.msg.length > 110 ? '…' : ''))
  })
  console.error('\nThe page has to carry the exact text consumers see, or it is describing a')
  console.error('set of messages that no longer exists. Paste each one in as a fenced block.')
  process.exit(1)
}

console.log('deprecation-texts: OK — all ' + messages.length +
  ' messages appear verbatim in docs/NPM_RELEASES.md.')
