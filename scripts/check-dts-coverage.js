#!/usr/bin/env node
'use strict'

/**
 * Declaration-coverage ratchet for bsv.d.ts.
 *
 * `check:types` proves the declarations that EXIST are correct — that a fixture of
 * misuse still errors, so a subpath degrading to `any` cannot pass quietly. It says
 * nothing about the surface that was never declared at all, and that gap is where
 * the damage was: the whole consensus API added across 9.4.0-9.7.0 was undeclared,
 * so `interp.maxScriptNumLength()` was a compile error and `crypto.BN` was
 * `class BN { }` — an empty declaration that made every satoshi amount `{}`.
 *
 * Four releases went out that way, because nothing measured it.
 *
 * This compares the runtime surface in test/fixtures/api-surface.json against
 * bsv.d.ts and fails when:
 *
 *   1. a name that is not in the baseline has no declaration — NEW drift, the case
 *      that let the era methods ship undeclared four times running;
 *   2. a name IS declared but still sits in the baseline — the ratchet only turns
 *      one way, and a stale baseline is how a gate stops meaning anything;
 *   3. a namespace listed in COMPLETE has any gap at all. Those are surfaces that
 *      have been driven to zero and must stay there.
 *
 * Run `node scripts/check-dts-coverage.js --update` after declaring something.
 *
 * The check is "does a declaration for this NAME exist", not "is its type right" —
 * that is check:types' job. A leaf name alone would be too weak (any mention would
 * count), so a name must appear in declaration POSITION: after a declaring keyword,
 * or as a member followed by `:` `(` or `<`.
 */

const fs = require('fs')
const path = require('path')

const ROOT = path.join(__dirname, '..')
const SURFACE = path.join(ROOT, 'test/fixtures/api-surface.json')
const DTS = path.join(ROOT, 'bsv.d.ts')
const BASELINE = path.join(ROOT, 'test/fixtures/dts-coverage-baseline.json')

// Namespaces with no gaps left. Adding one here is a promise that it stays at zero.
//
// bsv.crypto.BN is deliberately NOT here. Its constructor, comparisons and the
// Bitcoin codecs are declared, but 69 bn.js internals are not — the `red`/`mont`
// modular-arithmetic family, the in-place `i*` mutators, `strip`, `mulTo`. Those
// are inherited from bn.js rather than part of this library's contract, and
// declaring them would assert a shape this package does not own. Listing BN here
// was the first thing this gate rejected, which is the point of it.
const COMPLETE = [
  'bsv.Script.Interpreter'
]

function esc (s) { return s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&') }

/** Is `name` declared anywhere in the .d.ts, as opposed to merely mentioned? */
function isDeclared (dts, name) {
  const n = esc(name)
  return (
    // function foo(...)  /  const foo: T  /  class foo  /  interface foo
    new RegExp('\\b(?:function|const|let|var|class|interface|namespace|enum|type)\\s+' + n + '\\b').test(dts) ||
    // a member:  foo: T   foo?: T   foo(...)   foo<T>(...)   static foo(...)
    new RegExp('(?:^|[\\s;{(,])(?:static\\s+|readonly\\s+)?' + n + '\\s*\\??\\s*[:(<]', 'm').test(dts)
  )
}

function namespaceOf (entry) { return entry.replace(/[#.][^#.]*$/, '') }
function leafOf (entry) { return entry.split(/[#.]/).pop() }

function main () {
  const update = process.argv.includes('--update')

  const surface = JSON.parse(fs.readFileSync(SURFACE, 'utf8'))
  const dts = fs.readFileSync(DTS, 'utf8')
  const names = Object.keys(surface)

  // A guard that passes on empty inputs is a guard that passes from the wrong
  // directory. Both of these have thousands of entries; zero means something broke.
  if (names.length < 500) fail(`api-surface.json has only ${names.length} entries — refusing to compare against it`)
  if (dts.length < 10000) fail(`bsv.d.ts is only ${dts.length} bytes — refusing to compare against it`)

  const undeclared = names.filter((n) => !isDeclared(dts, leafOf(n))).sort()

  if (update) {
    fs.writeFileSync(BASELINE, JSON.stringify({
      note: 'Names in api-surface.json with no declaration in bsv.d.ts. This list may only shrink; see scripts/check-dts-coverage.js.',
      generated: new Date().toISOString().slice(0, 10),
      undeclared
    }, null, 2) + '\n')
    console.log(`dts-coverage: baseline updated — ${undeclared.length} of ${names.length} undeclared`)
    return
  }

  if (!fs.existsSync(BASELINE)) fail('no baseline; run: node scripts/check-dts-coverage.js --update')
  const baseline = JSON.parse(fs.readFileSync(BASELINE, 'utf8')).undeclared
  const known = new Set(baseline)

  const problems = []

  const regressions = undeclared.filter((n) => !known.has(n))
  if (regressions.length) {
    problems.push(`${regressions.length} name(s) added to the runtime with no declaration:\n` +
      regressions.map((n) => `    ${n}  (${surface[n]})`).join('\n') +
      '\n  Declare them in bsv.d.ts. If that is genuinely not wanted yet, record why and\n' +
      '  run: node scripts/check-dts-coverage.js --update')
  }

  const nowDeclared = new Set(undeclared)
  const stale = baseline.filter((n) => !nowDeclared.has(n) && Object.prototype.hasOwnProperty.call(surface, n))
  if (stale.length) {
    problems.push(`${stale.length} baseline name(s) are now declared — the ratchet must turn:\n` +
      stale.slice(0, 12).map((n) => `    ${n}`).join('\n') +
      (stale.length > 12 ? `\n    ...and ${stale.length - 12} more` : '') +
      '\n  Run: node scripts/check-dts-coverage.js --update')
  }

  for (const ns of COMPLETE) {
    const gaps = undeclared.filter((n) => namespaceOf(n) === ns)
    if (gaps.length) {
      problems.push(`${ns} is listed as COMPLETE but has ${gaps.length} undeclared name(s):\n` +
        gaps.map((n) => `    ${n}  (${surface[n]})`).join('\n'))
    }
  }

  if (problems.length) fail(problems.join('\n\n  '))

  const covered = names.length - undeclared.length
  const pct = ((covered / names.length) * 100).toFixed(1)
  console.log(`dts-coverage: OK — ${covered}/${names.length} declared (${pct}%), ` +
    `${undeclared.length} known gaps, ${COMPLETE.length} namespace(s) complete.`)
}

function fail (msg) {
  console.error('\ndts-coverage FAILED: ' + msg + '\n')
  process.exit(1)
}

main()
