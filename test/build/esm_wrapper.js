'use strict'

/* global describe, it */

// Guards index.mjs — the real ESM entry behind the package's `import` condition.
// Asserts (a) it hasn't drifted from the CJS surface, (b) native ESM default AND
// named imports actually work, and (c) deprecated getters (SmartUTXO) are NOT
// forced as named exports (they'd fire their warning on every import).
//
// ESM behaviour is exercised in a child process (via an --input-type=module
// script string) rather than a dynamic import() in this file, so the source
// stays parseable by the pinned standard@12 linter.

require('chai').should()
var fs = require('fs')
var path = require('path')
var execFileSync = require('child_process').execFileSync
var spawnSync = require('child_process').spawnSync
var gen = require('../../scripts/gen-esm-wrapper')

var ROOT = path.resolve(__dirname, '../..')
var MJS = path.join(ROOT, 'index.mjs')

function runEsm (body) {
  return execFileSync(process.execPath, ['--input-type=module', '-e', body],
    { cwd: ROOT, stdio: 'pipe' })
}

describe('ESM wrapper (index.mjs)', function () {
  it('is in sync with the CJS surface (no drift)', function () {
    var onDisk = fs.readFileSync(MJS, 'utf8')
    onDisk.should.equal(gen.generate())
  })

  it('exports every non-accessor top-level member as a named binding', function () {
    var bsv = require('../..')
    var names = gen.exportableNames(bsv)
    names.length.should.be.above(100)
    // SmartUTXO is an accessor (deprecated getter) and must be excluded.
    names.should.not.include('SmartUTXO')
    Object.getOwnPropertyDescriptor(bsv, 'SmartUTXO').get.should.be.a('function')
  })

  it('resolves real ESM default + named imports natively', function () {
    runEsm(
      'import bsv, { PrivateKey, crypto } from ' + JSON.stringify('./index.mjs') + ';' +
      'process.exit((bsv && typeof PrivateKey === "function" && ' +
      'PrivateKey === bsv.PrivateKey && typeof crypto.ECDSA === "function") ? 0 : 3)')
  })

  it('does not emit the SmartUTXO deprecation warning at import (getter excluded)', function () {
    // Re-exporting the getter would trip its console.warn at import time; stderr
    // must be empty for a bare `import './index.mjs'`.
    var res = spawnSync(process.execPath,
      ['--input-type=module', '-e', 'import ' + JSON.stringify('./index.mjs') + ';'],
      { cwd: ROOT, encoding: 'utf8' })
    res.status.should.equal(0)
    res.stderr.should.equal('')
  })

  it('keeps deprecated getters reachable via the default export only', function () {
    runEsm(
      'import bsv from ' + JSON.stringify('./index.mjs') + ';' +
      'process.exit(("SmartUTXO" in bsv) ? 0 : 3)')
  })
})
