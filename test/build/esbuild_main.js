'use strict'

/* global describe, it */

// Build-integrity gate for the esbuild bundler migration. Proves every browser bundle
// (all 16) builds — esbuild resolves each Node-core polyfill and, for the feature bundles,
// externalises the bsv root to the global `bsv` — and that the output is a real UMD module
// (browser global + require()/AMD). Full browser behaviour (Shamir CSPRNG via window.crypto)
// is validated by the Chrome browser-smoke against the full bundle.

require('chai').should()
var fs = require('fs')
var os = require('os')
var path = require('path')
var E = require('../../build/esbuild')

describe('esbuild: all browser bundles build', function () {
  this.timeout(60000)

  it('all ' + E.BUNDLES.length + ' bundles build with no unresolved modules', function () {
    return Promise.all(E.BUNDLES.map(function (cfg) {
      return E.buildOne(cfg, { write: false, logLevel: 'silent' }).then(function (res) {
        res.errors.length.should.equal(0)
        var js = res.outputFiles[0].text
        js.length.should.be.above(20000) // smallest bundle (message) ~31KB; a broken build is tiny
        js.indexOf('var ' + cfg.global + '=').should.be.above(-1) // IIFE global assignment
      })
    }))
  })

  // UMD contract: the full bundle must load via CommonJS require() (as the webpack UMD bundle
  // did). Browser <script> global is validated by the Chrome browser-smoke.
  it('the full bundle is require()-able (UMD) with a working static API', function () {
    return E.buildFullBundle({ write: false, logLevel: 'silent' }).then(function (res) {
      var tmp = path.join(os.tmpdir(), 'bsv-esbuild-full-' + process.pid + '.js')
      fs.writeFileSync(tmp, res.outputFiles[0].text)
      try {
        var bsv = require(tmp)
        ;(typeof bsv.PrivateKey).should.equal('function')
        bsv.version.should.be.a('string')
        bsv.crypto.Hash.sha256(bsv.deps.Buffer.from('x')).length.should.equal(32)
        ;(!!bsv.Ordinals && !!bsv.SPV).should.equal(true)
      } finally { delete require.cache[tmp]; fs.unlinkSync(tmp) }
    })
  })

  // A feature bundle that externalises bsv (bsv-covenant) must load against a global `bsv`.
  it('a feature bundle (bsv-covenant) loads against the global bsv', function () {
    var cfg = E.BUNDLES.filter(function (c) { return c.file === 'bsv-covenant.min.js' })[0]
    return E.buildOne(cfg, { write: false, logLevel: 'silent' }).then(function (res) {
      var tmp = path.join(os.tmpdir(), 'bsv-esbuild-cov-' + process.pid + '.js')
      fs.writeFileSync(tmp, res.outputFiles[0].text)
      var had = 'bsv' in global // Node: global === globalThis, which the bundle reads
      global.bsv = require('../..')
      try {
        var cov = require(tmp)
        ;(cov == null).should.equal(false)
        Object.keys(cov).length.should.be.above(0)
      } finally {
        delete require.cache[tmp]; fs.unlinkSync(tmp)
        if (!had) delete global.bsv
      }
    })
  })
})
