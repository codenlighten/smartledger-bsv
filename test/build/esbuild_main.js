'use strict'

/* global describe, it */

// Build-integrity gate for the esbuild bundler migration (step 1: the full library
// bundle). Proves esbuild resolves every Node-core polyfill and emits a real IIFE that
// exposes the global `bsv`. The full browser behaviour (Shamir CSPRNG via window.crypto)
// is validated separately by the Chrome browser-smoke against this same build.

require('chai').should()
var buildFullBundle = require('../../build/esbuild').buildFullBundle

describe('esbuild: full library bundle builds', function () {
  this.timeout(30000)

  it('bundles with no unresolved Node built-ins and emits the bsv global', function () {
    return buildFullBundle({ write: false, logLevel: 'silent' }).then(function (res) {
      res.errors.length.should.equal(0)
      var js = res.outputFiles[0].text
      js.length.should.be.above(500000) // ~1.3MB minified; a broken build would be tiny
      js.indexOf('var bsv=').should.be.above(-1) // IIFE global assignment
    })
  })
})
