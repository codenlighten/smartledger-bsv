'use strict'

/* global describe, it, before */

// Feature bundles must EXTERNALISE the shared primitives, not embed a second copy.
//
// Getting this wrong is not a size regression. If a feature bundle ships its own
// PrivateKey class, a key built by bsv.min.js fails `instanceof` inside that bundle
// and index.js's versionGuard reports two library instances — a failure that is
// invisible to every test that stays inside one bundle.
//
// build/esbuild.js has always had a `metafile` option whose comment said it was "used
// to assert" this property. Nothing consumed it: `grep -rn metafile` returned only the
// option itself. This file is that consumer.

require('chai').should()
var esbuild = require('../../build/esbuild.js')

// Bundles that resolve bsv from the global instead of embedding it.
var EXTERNALISED = esbuild.BUNDLES.filter(function (c) { return c.externalBsv })

describe('feature bundles externalise the shared primitives', function () {
  this.timeout(120000)

  var inputsByBundle = {}

  before(function () {
    // Build each one in memory (write:false) and keep its module graph.
    return Promise.all(EXTERNALISED.map(function (cfg) {
      return esbuild.buildOne(cfg, { metafile: true, write: false, logLevel: 'silent' })
        .then(function (result) {
          inputsByBundle[cfg.file] = Object.keys(result.metafile.inputs)
            .filter(function (p) { return p.indexOf('lib/') === 0 })
            .sort()
        })
    }))
  })

  it('has bundles to check', function () {
    EXTERNALISED.length.should.be.above(0)
    Object.keys(inputsByBundle).length.should.equal(EXTERNALISED.length)
  })

  // The primary assertion, derived from the config rather than hand-maintained: every
  // path in LIB_GLOBALS is a module the build promises to take from the global bsv, so
  // none of them may appear as a bundled input. Because it reads the same table the
  // build uses, it cannot drift out of step with it.
  it('never embeds a module that LIB_GLOBALS maps to the global bsv', function () {
    var mapped = Object.keys(esbuild.LIB_GLOBALS)
    var offences = []
    Object.keys(inputsByBundle).forEach(function (file) {
      inputsByBundle[file].forEach(function (input) {
        // 'lib/privatekey.js' -> 'privatekey'; 'lib/script/index.js' -> 'script/index'
        var key = input.replace(/^lib\//, '').replace(/\.js$/, '')
        if (mapped.indexOf(key) !== -1) {
          offences.push(file + ' embeds ' + input + ' (should come from global bsv.' +
            esbuild.LIB_GLOBALS[key] + ')')
        }
      })
    })
    offences.should.deep.equal([])
  })

  // LIB_GLOBALS is deliberately not exhaustive — a feature bundle SHOULD contain its own
  // feature code. So the catch-all is to pin what each bundle contains: anything new
  // appearing here is either the feature growing or a primitive leaking in, and a human
  // decides which. Without this, a `require('../mnemonic')` added to a module reachable
  // from an externalised entry would bundle a second copy silently, with every existing
  // test green.
  it('contains only its own feature code, pinned per bundle', function () {
    // Accepted in any bundle: a tiny lodash subset with no library state, deliberately
    // duplicated rather than routed through the global.
    var SHARED = ['lib/util/']
    var EXPECTED = {
      'bsv-ecies.min.js': ['lib/ecies/'],
      'bsv-message.min.js': ['lib/message/'],
      'bsv-mnemonic.min.js': ['lib/mnemonic/'],
      'bsv-shamir.min.js': ['lib/crypto/'],
      'bsv-smartcontract.min.js': ['lib/smart_contract/', 'lib/covenant/', 'lib/smartutxo.js'],
      'bsv-covenant.min.js': ['lib/smart_contract/'],
      'bsv-script-helper.min.js': ['lib/custom-script-helper.js']
    }
    var unexpected = []
    Object.keys(inputsByBundle).forEach(function (file) {
      var allowed = (EXPECTED[file] || []).concat(SHARED)
      if (!EXPECTED[file]) {
        unexpected.push(file + ' is externalised but has no expected-input list')
        return
      }
      inputsByBundle[file].forEach(function (input) {
        var ok = allowed.some(function (prefix) { return input.indexOf(prefix) === 0 })
        if (!ok) unexpected.push(file + ' unexpectedly embeds ' + input)
      })
    })
    unexpected.should.deep.equal([])
  })

  it('shares nothing but documented helpers across bundles', function () {
    // A module appearing in two feature bundles is a duplicated copy in the shipped
    // set. Only these are accepted, and each is a deliberate call rather than an
    // accident: lib/util/_.js is a tiny lodash subset, and lib/smart_contract/covenant.js
    // is genuinely the feature of both covenant-flavoured bundles.
    var ACCEPTED_DUPLICATES = ['lib/util/_.js', 'lib/smart_contract/covenant.js']
    var seen = {}
    Object.keys(inputsByBundle).forEach(function (file) {
      inputsByBundle[file].forEach(function (input) {
        (seen[input] = seen[input] || []).push(file)
      })
    })
    var duplicated = Object.keys(seen)
      .filter(function (p) { return seen[p].length > 1 })
      .filter(function (p) { return ACCEPTED_DUPLICATES.indexOf(p) === -1 })
      .sort()
    duplicated.should.deep.equal([])
  })
})
