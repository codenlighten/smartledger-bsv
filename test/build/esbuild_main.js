'use strict'

/* global describe, it */

// Build-integrity gate for the esbuild bundler migration (step 1: the full library
// bundle). Proves esbuild resolves every Node-core polyfill and emits a real IIFE that
// exposes the global `bsv`. The full browser behaviour (Shamir CSPRNG via window.crypto)
// is validated separately by the Chrome browser-smoke against this same build.

require('chai').should()
var fs = require('fs')
var os = require('os')
var path = require('path')
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

  // UMD contract: the browser bundle must also load via CommonJS require() (as the webpack
  // UMD bundle did) — a browser <script> global is validated separately by the Chrome
  // browser-smoke. (The CSPRNG path is browser-only in both bundles by design; Node
  // consumers use the package's index.js, so static crypto is what's exercised here.)
  it('is require()-able (UMD footer) and exposes a working static API', function () {
    return buildFullBundle({ write: false, logLevel: 'silent' }).then(function (res) {
      var tmp = path.join(os.tmpdir(), 'bsv-esbuild-umd-' + process.pid + '.js')
      fs.writeFileSync(tmp, res.outputFiles[0].text)
      try {
        var bsv = require(tmp)
        ;(typeof bsv.PrivateKey).should.equal('function')
        bsv.version.should.be.a('string')
        var h = bsv.crypto.Hash.sha256(bsv.deps.Buffer.from('x'))
        h.length.should.equal(32)
        ;(!!bsv.Ordinals && !!bsv.SPV).should.equal(true)
      } finally {
        delete require.cache[tmp]
        fs.unlinkSync(tmp)
      }
    })
  })
})
