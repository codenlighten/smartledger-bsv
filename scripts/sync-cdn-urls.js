#!/usr/bin/env node
'use strict'

// Sync CDN version pins in README/docs to package.json's current version.
//
// The published bundles are served from version-pinned CDN URLs
// (unpkg.com / cdn.jsdelivr.net /@smartledger/bsv@X.Y.Z/<bundle>.js).
// On every release the version in package.json gets bumped, but the docs
// kept pointing at the previous version — serving stale code to CDN
// consumers. The Hygiene CI job flags this; this script fixes it
// mechanically so it never reaches CI.
//
// Wired into the `version` npm lifecycle hook (see package.json): it runs
// after `npm version` rewrites package.json but before the version commit.
// The hook's `git add` (in the npm script line, not here) re-stages the
// touched docs so they land in the same commit/tag. This script only
// rewrites files — it stays a pure, idempotent rewriter so it is equally
// safe to run by hand (`npm run sync-cdn`) without side effects on the
// git index.

const fs = require('fs')
const path = require('path')

const ROOT = path.resolve(__dirname, '..')
const VERSION = require(path.join(ROOT, 'package.json')).version

// Match any @smartledger/bsv@<semver>/ pin, regardless of CDN host. The optional
// group covers prerelease/build tags (e.g. 7.0.0-alpha.1) so an alpha->release
// bump rewrites its own preview URLs instead of leaving dead pins behind.
const PIN_RE = /@smartledger\/bsv@\d+\.\d+\.\d+(?:-[0-9A-Za-z.-]+)?\//g
const REPLACEMENT = `@smartledger/bsv@${VERSION}/`

// Files to scan: README plus everything under docs/ (.md and .html).
function collectTargets () {
  const targets = []
  const readme = path.join(ROOT, 'README.md')
  if (fs.existsSync(readme)) targets.push(readme)

  const docsDir = path.join(ROOT, 'docs')
  if (fs.existsSync(docsDir)) {
    const stack = [docsDir]
    while (stack.length) {
      const dir = stack.pop()
      for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
        const full = path.join(dir, entry.name)
        if (entry.isDirectory()) {
          stack.push(full)
        } else if (/\.(md|html)$/.test(entry.name)) {
          targets.push(full)
        }
      }
    }
  }
  return targets
}

// The README also states the version in two places that are NOT URL pins, and for
// five releases only the pins were rewritten — so the page advertised 5.4.0 while
// linking 8.3.0 assets. Sync those here too; `npm run check:readme` fails the
// release if either drifts, and a gate nobody can satisfy just gets deleted.
const README_VERSION_RULES = [
  { re: /(badge\/version-)\d+\.\d+\.\d+(?:-[0-9A-Za-z.-]+)?(-)/g, to: `$1${VERSION}$2` },
  { re: /(\*\*SmartLedger-BSV v)\d+\.\d+\.\d+(?:-[0-9A-Za-z.-]+)?(\*\*)/g, to: `$1${VERSION}$2` }
]

const changed = []
for (const file of collectTargets()) {
  const before = fs.readFileSync(file, 'utf8')
  let after = before.replace(PIN_RE, REPLACEMENT)
  if (path.basename(file) === 'README.md' && path.dirname(file) === ROOT) {
    for (const rule of README_VERSION_RULES) after = after.replace(rule.re, rule.to)
  }
  if (after !== before) {
    fs.writeFileSync(file, after)
    changed.push(path.relative(ROOT, file))
  }
}

if (!changed.length) {
  console.log(`sync-cdn-urls: all CDN pins already at @${VERSION}.`)
  process.exit(0)
}

console.log(`sync-cdn-urls: bumped CDN pins to @${VERSION} in:`)
for (const f of changed) console.log(`  ${f}`)
