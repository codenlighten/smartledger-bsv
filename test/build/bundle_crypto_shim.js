'use strict'

/* global describe, it, before */

// The browser `crypto` polyfill is our own three-function shim, not crypto-browserify.
//
// Two things have to hold, and neither is visible to a test that stays inside lib/.
//
// 1. `elliptic` must not re-enter the bundles. It carries an advisory with no patched
//    version, and it is reachable from crypto-browserify via browserify-sign and
//    create-ecdh. build/esbuild.js used to keep it out with a hand-written onResolve
//    stub; removing crypto-browserify removed the need for the stub, and this file
//    replaces it. A stub is silent when it stops matching — an assertion is not.
//
// 2. The shim must keep implementing what the bundles actually call. If someone adds a
//    `crypto.pbkdf2` call to a bundled module, resolution still succeeds and the member
//    is simply `undefined`, so the failure surfaces far from its cause.
//
// The known-answer test exists because "the bundle builds" and "the bundle hashes
// correctly" are different claims, and only the second one matters to a caller.

require('chai').should()
var crypto = require('crypto')
var esbuild = require('../../build/esbuild.js')
var shim = require('../../build/esbuild/crypto-shim.js')

// Reachable from crypto-browserify; `elliptic` is the one with no fix available.
var BANNED = ['elliptic', 'browserify-sign', 'create-ecdh', 'crypto-browserify']

describe('browser crypto shim', function () {
  this.timeout(300000)

  var pkgsByBundle = {}

  before(function () {
    return Promise.all(esbuild.BUNDLES.map(function (cfg) {
      return esbuild.buildOne(cfg, { metafile: true, write: false, logLevel: 'silent' })
        .then(function (result) {
          pkgsByBundle[cfg.file] = Object.keys(result.metafile.inputs)
            .map(function (p) {
              var m = /node_modules\/((?:@[^/]+\/)?[^/]+)\//.exec(p)
              return m && m[1]
            })
            .filter(Boolean)
        })
    }))
  })

  it('built every bundle', function () {
    esbuild.BUNDLES.length.should.be.above(0)
    Object.keys(pkgsByBundle).length.should.equal(esbuild.BUNDLES.length)
  })

  // Guard against the graph being empty for an unrelated reason, which would make the
  // "no banned packages" assertion below pass without checking anything.
  it('resolved a non-trivial dependency graph', function () {
    Object.keys(pkgsByBundle).forEach(function (file) {
      pkgsByBundle[file].length.should.be.above(0, file + ' has no node_modules inputs')
    })
  })

  it('pulls no part of the elliptic chain into any bundle', function () {
    var offenders = []
    Object.keys(pkgsByBundle).forEach(function (file) {
      BANNED.forEach(function (pkg) {
        if (pkgsByBundle[file].indexOf(pkg) !== -1) offenders.push(file + ' → ' + pkg)
      })
    })
    offenders.should.deep.equal([])
  })

  it('exports exactly the members the bundles call', function () {
    Object.keys(shim).sort().should.deep.equal(['createHash', 'createHmac', 'randomBytes'])
  })

  // Deliberately absent: secrets.js-grempe prefers getRandomValues over randomBytes when
  // it is present, so exporting it would silently move the Shamir CSPRNG to another code
  // path. crypto-browserify did not expose it either.
  it('does not expose getRandomValues', function () {
    ;(shim.getRandomValues === undefined).should.equal(true)
  })

  it('hashes identically to node crypto', function () {
    ['', 'abc', 'The quick brown fox jumps over the lazy dog'].forEach(function (input) {
      ;['sha1', 'sha256', 'sha512', 'ripemd160'].forEach(function (alg) {
        shim.createHash(alg).update(input).digest('hex')
          .should.equal(crypto.createHash(alg).update(input).digest('hex'), alg + ' of ' + JSON.stringify(input))
      })
    })
  })

  it('hmacs identically to node crypto', function () {
    shim.createHmac('sha512', Buffer.from('key')).update('message').digest('hex')
      .should.equal(crypto.createHmac('sha512', Buffer.from('key')).update('message').digest('hex'))
  })

  it('draws distinct random bytes of the requested length', function () {
    var a = shim.randomBytes(32)
    var b = shim.randomBytes(32)
    a.length.should.equal(32)
    b.length.should.equal(32)
    a.toString('hex').should.not.equal(b.toString('hex'))
  })
})
