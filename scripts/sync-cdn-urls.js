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

// Match any @smartledger/bsv@<semver>/ pin, regardless of CDN host.
const PIN_RE = /@smartledger\/bsv@\d+\.\d+\.\d+\//g
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

const changed = []
for (const file of collectTargets()) {
  const before = fs.readFileSync(file, 'utf8')
  const after = before.replace(PIN_RE, REPLACEMENT)
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
