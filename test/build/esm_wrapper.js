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

var ROOT = path.resolve(__dirname, '../..')
var MJS = path.join(ROOT, 'index.mjs')

// scripts/ is dev tooling and is not published, so the two checks that
// regenerate index.mjs can only run from a checkout. The ESM import checks below
// run everywhere, including against an installed copy. Presence is tested rather
// than try/catch'd so a broken generator still fails loudly in the repo.
var GEN = path.join(ROOT, 'scripts', 'gen-esm-wrapper.js')
var gen = fs.existsSync(GEN) ? require(GEN) : null
var itFromCheckout = gen ? it : it.skip

function runEsm (body) {
  return execFileSync(process.execPath, ['--input-type=module', '-e', body],
    { cwd: ROOT, stdio: 'pipe' })
}

describe('ESM wrapper (index.mjs)', function () {
  itFromCheckout('is in sync with the CJS surface (no drift)', function () {
    var onDisk = fs.readFileSync(MJS, 'utf8')
    onDisk.should.equal(gen.generate())
  })

  itFromCheckout('exports every non-accessor top-level member as a named binding', function () {
    var bsv = require('../..')
    var names = gen.exportableNames(bsv)
    names.length.should.be.above(100)
  })

  // The library currently has NO accessor properties — bsv.SmartUTXO, the last one,
  // was removed in 9.0.0. The exclusion rule still matters: re-exporting a getter as a
  // named ESM binding evaluates it at import time, which for a deprecated accessor
  // means a warning (or worse, a side effect) fires on a bare `import`. Testing that
  // against a synthetic accessor keeps the guarantee under test instead of letting it
  // rot untested until someone adds a getter back.
  itFromCheckout('excludes accessor properties from the named bindings', function () {
    var bsv = require('../..')
    var probe = '__esmAccessorProbe__'
    var touched = false
    Object.defineProperty(bsv, probe, {
      configurable: true,
      enumerable: true,
      get: function () { touched = true; return 1 }
    })
    try {
      var names = gen.exportableNames(bsv)
      names.should.not.include(probe)
      touched.should.equal(false, 'exportableNames must not invoke the getter')
    } finally {
      delete bsv[probe]
    }
  })

  it('resolves real ESM default + named imports natively', function () {
    runEsm(
      'import bsv, { PrivateKey, crypto } from ' + JSON.stringify('./index.mjs') + ';' +
      'process.exit((bsv && typeof PrivateKey === "function" && ' +
      'PrivateKey === bsv.PrivateKey && typeof crypto.ECDSA === "function") ? 0 : 3)')
  })

  it('emits nothing on stderr at import', function () {
    // Re-exporting a deprecated getter would trip its console.warn at import time;
    // stderr must be empty for a bare `import './index.mjs'`.
    var res = spawnSync(process.execPath,
      ['--input-type=module', '-e', 'import ' + JSON.stringify('./index.mjs') + ';'],
      { cwd: ROOT, encoding: 'utf8' })
    res.status.should.equal(0)
    res.stderr.should.equal('')
  })

  it('no longer exposes bsv.SmartUTXO, which was removed in 9.0.0', function () {
    // Deliberately asserted rather than dropped: the namespace export is gone, and the
    // module is reached by direct import — require('@smartledger/bsv/lib/smartutxo') —
    // which is what its deprecation warning instructed from 4.0.1 onward.
    runEsm(
      'import bsv from ' + JSON.stringify('./index.mjs') + ';' +
      'process.exit(("SmartUTXO" in bsv) ? 3 : 0)')
  })
})
