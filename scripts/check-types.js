#!/usr/bin/env node
'use strict'

/**
 * TypeScript declaration gate.
 *
 * Eleven of the thirteen subpath exports shipped with no `types` condition and no
 * declaration file, so `import covenant from '@smartledger/bsv/covenant'` was a
 * TS7016 error and every symbol behind it was `any`. Worse, `bsv.d.ts` names
 * `Buffer` 132 times while the package declared no dependency on `@types/node`:
 * without it every `Buffer` parameter in the public API silently widened to
 * `any`, so `Anchor.sha256Hex(12345)` type-checked.
 *
 * Both failures are invisible to the test suite — the runtime is unaffected — so
 * they are checked here:
 *
 *   1. types-test/positive.ts compiles clean. Correct usage of every typed
 *      subpath must keep working.
 *   2. types-test/negative.ts errors on every line marked `@expect-error`. A
 *      declaration that quietly degrades to `any` makes these errors disappear,
 *      which is the regression this catches.
 *
 * Resolution goes through a node_modules symlink rather than tsconfig `paths`,
 * so the package's own `exports` map is what is being exercised.
 */

const fs = require('fs')
const path = require('path')
const { spawnSync } = require('child_process')

const ROOT = path.join(__dirname, '..')
const DIR = path.join(ROOT, 'types-test')
const LINK_DIR = path.join(DIR, 'node_modules', '@smartledger')
const LINK = path.join(LINK_DIR, 'bsv')
const TSC = path.join(ROOT, 'node_modules', '.bin', 'tsc')

function fail (msg) {
  console.error(`\nTypes check FAILED: ${msg}`)
  process.exit(1)
}

if (!fs.existsSync(TSC)) fail('tsc not found — run `npm install` first.')

// --- 0. the declarations depend on Node's globals ----------------------
//
// This cannot be caught by compiling here, because `/// <reference types="node" />`
// resolves through node_modules whatever the tsconfig says, and this repo always
// has @types/node present. It only bites a consumer who does not — for them
// every `Buffer` in the public API widens to `any` and, for example,
// `Anchor.sha256Hex(12345)` type-checks. So assert the declaration instead.
const pkg = JSON.parse(fs.readFileSync(path.join(ROOT, 'package.json'), 'utf8'))
const dts = fs.readFileSync(path.join(ROOT, 'bsv.d.ts'), 'utf8')
const needsNodeTypes = dts.includes('reference types="node"') || /\bBuffer\b/.test(dts)
if (needsNodeTypes && !(pkg.dependencies && pkg.dependencies['@types/node'])) {
  fail(
    'bsv.d.ts references Node types (Buffer appears ' +
    (dts.match(/\bBuffer\b/g) || []).length + ' times) but package.json does not list\n' +
    '@types/node under "dependencies". Consumers without it get Buffer as `any`,\n' +
    'silently disabling type checking on every Buffer parameter in the public API.'
  )
}
console.log('  @types/node               declared as a dependency')

// Point the package name at this working tree so the exports map is what resolves.
fs.mkdirSync(LINK_DIR, { recursive: true })
try { fs.unlinkSync(LINK) } catch (e) { /* first run */ }
fs.symlinkSync(ROOT, LINK, 'dir')

function compile (file) {
  const r = spawnSync(TSC, ['-p', 'tsconfig.json'], {
    cwd: DIR,
    encoding: 'utf8',
    env: { ...process.env, TS_ENTRY: file }
  })
  return (r.stdout || '') + (r.stderr || '')
}

function withFiles (files, fn) {
  const cfgPath = path.join(DIR, 'tsconfig.json')
  const original = fs.readFileSync(cfgPath, 'utf8')
  const cfg = JSON.parse(original)
  cfg.files = files
  fs.writeFileSync(cfgPath, JSON.stringify(cfg, null, 2) + '\n')
  try { return fn() } finally { fs.writeFileSync(cfgPath, original) }
}

// --- 1. correct usage must compile -------------------------------------
const positive = withFiles(['positive.ts'], () => compile('positive.ts'))
if (positive.trim()) {
  fail(`types-test/positive.ts should compile clean but did not:\n\n${positive}`)
}
console.log('  positive.ts               compiles clean')

// --- 2. misuse must still be rejected ----------------------------------
const negSrc = fs.readFileSync(path.join(DIR, 'negative.ts'), 'utf8').split('\n')

// Each marker owns the lines from itself up to the next marker. Requiring an
// error *somewhere* in that region rather than on one predicted line keeps the
// check honest for multi-line statements — the error for an unawaited Promise
// lands on the `return`, not on the `function` line above it.
const markers = []
negSrc.forEach((line, i) => { if (line.includes('@expect-error')) markers.push(i + 1) })
if (!markers.length) fail('negative.ts contains no @expect-error markers.')

const regions = markers.map((start, i) => ({
  start,
  end: i + 1 < markers.length ? markers[i + 1] - 1 : negSrc.length,
  label: (negSrc[start - 1].split('@expect-error')[1] || '').trim()
}))

const negative = withFiles(['negative.ts'], () => compile('negative.ts'))
const reported = [...negative.matchAll(/negative\.ts\((\d+),\d+\):\s*error/g)].map((m) => Number(m[1]))

const missed = regions.filter((r) => !reported.some((l) => l >= r.start && l <= r.end))
if (missed.length) {
  fail(
    'these misuses compiled cleanly and should not have:\n' +
    missed.map((r) => `  line ${r.start}: ${r.label}`).join('\n') +
    '\nA subpath has probably lost its declaration and widened to `any`.\n\n' + negative
  )
}

const orphan = reported.filter((l) => !regions.some((r) => l >= r.start && l <= r.end))
if (orphan.length) {
  fail(`type errors outside any @expect-error region, on lines ${orphan.join(', ')}:\n\n${negative}`)
}
console.log(`  negative.ts               ${regions.length}/${regions.length} misuses correctly rejected`)
console.log('\nTypes: OK (subpath declarations resolve and still catch misuse)')
