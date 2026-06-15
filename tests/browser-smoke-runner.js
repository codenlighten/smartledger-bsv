'use strict'

// Runs tests/browser-smoke-test.html in headless Chrome and fails if any check
// fails. This is the regression gate for browser-only code paths (notably the
// Shamir CSPRNG path) that the Node test suite cannot exercise.
//
// Requires a Chrome/Chromium binary. If none is found it SKIPS (exit 0) with a
// loud warning, so the suite still runs in environments without a browser; CI
// runners (ubuntu-latest) ship google-chrome, so the gate is active there.

var execFileSync = require('child_process').execFileSync
var path = require('path')

var html = 'file://' + path.join(__dirname, 'browser-smoke-test.html')
var candidates = ['google-chrome-stable', 'google-chrome', 'chromium-browser', 'chromium']

var bin = null
for (var i = 0; i < candidates.length; i++) {
  try {
    execFileSync('which', [candidates[i]], { stdio: 'ignore' })
    bin = candidates[i]
    break
  } catch (e) { /* not found, try next */ }
}

if (!bin) {
  console.warn('[browser-smoke] WARNING: no Chrome/Chromium found — SKIPPING browser smoke test')
  process.exit(0)
}

var out
try {
  out = execFileSync(bin, [
    '--headless=new', '--disable-gpu', '--no-sandbox',
    '--dump-dom', '--virtual-time-budget=20000', html
  ], { encoding: 'utf8', maxBuffer: 32 * 1024 * 1024 })
} catch (e) {
  console.error('[browser-smoke] FAILED to run Chrome: ' + e.message)
  process.exit(1)
}

if (/ALL \d+ CHECKS PASSED/.test(out)) {
  var n = (out.match(/ALL (\d+) CHECKS PASSED/) || [])[1]
  console.log('[browser-smoke] ALL ' + n + ' CHECKS PASSED (' + bin + ')')
  process.exit(0)
}

console.error('[browser-smoke] FAILED:')
out.replace(/<\/tr>/g, '\n').replace(/<[^>]*>/g, ' ')
  .split('\n')
  .filter(function (l) { return /✗ FAIL/.test(l) })
  .forEach(function (l) { console.error('  ' + l.replace(/\s+/g, ' ').trim()) })
process.exit(1)
