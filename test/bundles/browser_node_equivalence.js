'use strict'
/* global describe,it,before */

// Do the BROWSER bundles compute the same things as the Node build?
//
// Every other test in this suite exercises `lib/`. None of them loads `bsv.bundle.js`, so a
// bundler that dropped a module, reordered an initialisation or swapped a crypto backend would
// pass all of them. The smartledger-wallet session had this check and we did not; the idea and
// the method are theirs, described in their commit d88d899:
//
//   "Run in a sandbox as the browser loads them: twenty signatures and four decrypts produce no
//    errors and one notice; the browser bundle and the server copy still give the same signature
//    and the same transaction id."
//
// This implementation is ours, written from that description rather than copied, so that a
// disagreement between the two is informative instead of inherited — which is the lesson of the
// independent Python verifier that found two soundness defects here on the same day.

// 2026-10-15: for most of this file's life it LOADED bsv-message.min.js and bsv-ecies.min.js
// and then never touched them — they set their own globals (`bsvMessage`, `bsvEcies`) while
// loadBundles() returned only `bsv`, which the full bundle sets and which already carries both.
// So a broken standalone bundle passed everything here. The wallet session noticed; two tests
// below close it.
//
// WHAT THIS ACTUALLY CATCHES, measured by sabotaging the built bundle and re-running rather
// than assumed from the fact that it passes:
//
//   truncate bsv.bundle.js to 95%            2 failures   caught
//   alter the "Bitcoin Signed Message:" magic 1 failure    caught
//   change livenet pubkeyhash 0 -> 111        2 failures   caught
//   flip one of seven 2147483648 constants    0 failures   NOT caught
//
// The last line is the honest limit: that occurrence is not on a path these five cases exercise,
// so this file is a smoke test for the bundle pipeline — a dropped module, a swapped crypto
// backend, a changed constant on the paths below — and not proof that the bundle is equivalent
// everywhere. A passing run means less than it looks like unless someone has checked what a
// failing one requires.

require('chai').should()
var fs = require('fs')
var path = require('path')
var vm = require('vm')
var crypto = require('crypto')
var node = require('../..')

var ROOT = path.join(__dirname, '..', '..')
var BUNDLES = ['bsv.bundle.js', 'bsv-message.min.js', 'bsv-ecies.min.js']

// The BIP39 test vector, so the expected address is a published constant rather than
// something this file computed and then asserted against itself.
var MNEMONIC = 'abandon abandon abandon abandon abandon abandon abandon abandon abandon abandon abandon about'
var PATH = "m/44'/0'/0'/0/0"
var EXPECTED_ADDRESS = '1LqBGSKuX5yYUonjxT5qGfpUsXKYYWeabA'
var MESSAGE = 'smartledger equivalence vector'

function loadBundles () {
  // A bare context that looks enough like a browser for the UMD wrappers: window, self and
  // globalThis all point at the sandbox, and webcrypto is supplied because the bundles reach
  // for it rather than for node:crypto.
  var sandbox = { console: { log: function () {}, warn: function () {}, error: function () {} } }
  sandbox.window = sandbox
  sandbox.self = sandbox
  sandbox.globalThis = sandbox
  sandbox.global = sandbox
  sandbox.crypto = crypto.webcrypto
  sandbox.Buffer = Buffer
  sandbox.process = { env: {}, version: process.version, nextTick: process.nextTick }
  sandbox.setTimeout = setTimeout
  sandbox.TextEncoder = TextEncoder
  sandbox.TextDecoder = TextDecoder
  var ctx = vm.createContext(sandbox)
  BUNDLES.forEach(function (f) {
    var src = fs.readFileSync(path.join(ROOT, f), 'utf8')
    vm.runInContext(src, ctx, { filename: f })
  })
  return sandbox.bsv || sandbox.window.bsv
}

// The standalone bundles set their OWN globals — `bsvMessage`, `bsvEcies` — beside `bsv`, and
// returning only `bsv` meant this file loaded them and then never touched them. See the test
// 'the standalone bundles are the ones under test when they are loaded' below for why that
// mattered.
function loadSandbox () {
  var sandbox = { console: { log: function () {}, warn: function () {}, error: function () {} } }
  sandbox.window = sandbox
  sandbox.self = sandbox
  sandbox.globalThis = sandbox
  sandbox.global = sandbox
  sandbox.crypto = crypto.webcrypto
  sandbox.Buffer = Buffer
  sandbox.process = { env: {}, version: process.version, nextTick: process.nextTick }
  sandbox.setTimeout = setTimeout
  sandbox.TextEncoder = TextEncoder
  sandbox.TextDecoder = TextDecoder
  var ctx = vm.createContext(sandbox)
  BUNDLES.forEach(function (f) {
    vm.runInContext(fs.readFileSync(path.join(ROOT, f), 'utf8'), ctx, { filename: f })
  })
  return sandbox
}

describe('browser bundles match the Node build', function () {
  var browser

  before(function () {
    BUNDLES.forEach(function (f) {
      fs.existsSync(path.join(ROOT, f)).should.equal(true, f + ' is missing; run npm run build-all')
    })
    browser = loadBundles()
  })

  it('exposes bsv when loaded the way a browser loads it', function () {
    // Note for anyone extending this file: chai's `should` style patches Object.prototype in
    // THIS realm, and an object built inside a vm context does not inherit it — `browser.should`
    // is undefined, with no hint that the assertion never ran. Assert on primitives pulled out
    // of the sandbox, or use expect(). The same trap applies to instanceof across the boundary.
    ;(typeof browser).should.equal('object')
    ;(typeof browser.PrivateKey).should.equal('function')
    ;(typeof browser.Transaction).should.equal('function')
    ;(typeof browser.Message).should.equal('function')
    ;(typeof browser.ECIES).should.equal('function')
  })

  it('derives the same address from the BIP39 test vector', function () {
    function derive (lib) {
      var seed = lib.Mnemonic.fromString(MNEMONIC).toSeed()
      return lib.HDPrivateKey.fromSeed(seed).deriveChild(PATH).privateKey.toAddress().toString()
    }
    derive(browser).should.equal(EXPECTED_ADDRESS)
    derive(node).should.equal(EXPECTED_ADDRESS)
  })

  it('produces the same message signature', function () {
    function sign (lib) {
      var seed = lib.Mnemonic.fromString(MNEMONIC).toSeed()
      var key = lib.HDPrivateKey.fromSeed(seed).deriveChild(PATH).privateKey
      return lib.Message(MESSAGE).sign(key)
    }
    var a = sign(browser)
    sign(node).should.equal(a)
    // and each verifies the other's signature, which a matching string alone would not prove
    node.Message(MESSAGE).verify(EXPECTED_ADDRESS, a).should.equal(true)
    browser.Message(MESSAGE).verify(EXPECTED_ADDRESS, sign(node)).should.equal(true)
  })

  it('produces the same txid for the same inputs', function () {
    function build (lib) {
      var seed = lib.Mnemonic.fromString(MNEMONIC).toSeed()
      var key = lib.HDPrivateKey.fromSeed(seed).deriveChild(PATH).privateKey
      var addr = key.toAddress()
      var tx = new lib.Transaction().from({
        txId: 'ab'.repeat(32),
        outputIndex: 0,
        script: lib.Script.buildPublicKeyHashOut(addr).toHex(),
        satoshis: 100000
      })
      tx.to(addr, 90000).fee(1000).sign(key)
      return { id: tx.id, hex: tx.toString() }
    }
    var a = build(browser)
    var b = build(node)
    a.id.should.equal(b.id)
    a.hex.should.equal(b.hex)
  })

  it('round-trips ECIES in the bundle', function () {
    var a = browser.PrivateKey.fromString('11'.repeat(32))
    var b = browser.PrivateKey.fromString('22'.repeat(32))
    var enc = new browser.ECIES().privateKey(a).publicKey(b.toPublicKey()).encrypt('hello')
    new browser.ECIES().privateKey(b).publicKey(a.toPublicKey())
      .decrypt(enc).toString().should.equal('hello')
  })

  it('exercises the standalone bundles, which were loaded and then ignored', function () {
    // Found by the wallet session, 2026-10-15, and it is a hole in THIS file rather than in the
    // bundles: `bsv-message.min.js` and `bsv-ecies.min.js` each set their own global —
    // `bsvMessage`, `bsvEcies` — while `loadBundles()` returned only `bsv`, which the FULL
    // bundle sets and which already carries Message and ECIES. So both standalone bundles were
    // loaded for show: a broken one passed every assertion above.
    //
    // Measured by sabotage after writing it, which corrected two guesses of mine:
    //
    //   truncate bsv-message.min.js to 95%     caught, but by the LOAD (the before-all hook
    //                                          throws) and by test/build/bundle_smoke.js
    //   alter its "Bitcoin Signed Message"     caught by THIS test and by nothing else in the
    //   magic string, keeping the length       whole suite
    //
    // So what this test uniquely catches is a standalone bundle that loads cleanly and computes
    // something DIFFERENT. A bundle that fails to load was already covered; one that lies was
    // not.
    var sandbox = loadSandbox()
    ;(typeof sandbox.bsvMessage).should.equal('function', 'bsv-message.min.js set no bsvMessage global')
    ;(typeof sandbox.bsvEcies).should.equal('function', 'bsv-ecies.min.js set no bsvEcies global')

    // the standalone Message must agree with Node AND with the copy inside the full bundle
    var seed = sandbox.bsv.Mnemonic.fromString(MNEMONIC).toSeed()
    var key = sandbox.bsv.HDPrivateKey.fromSeed(seed).deriveChild(PATH).privateKey
    var wif = key.toWIF()
    var standalone = sandbox.bsvMessage(MESSAGE).sign(sandbox.bsv.PrivateKey.fromWIF(wif))
    var full = sandbox.bsv.Message(MESSAGE).sign(key)
    var nodeSig = node.Message(MESSAGE).sign(node.PrivateKey.fromWIF(wif))
    standalone.should.equal(nodeSig, 'bsv-message.min.js disagrees with the Node build')
    standalone.should.equal(full, 'bsv-message.min.js disagrees with bsv.bundle.js')
    // and it verifies what the others signed
    sandbox.bsvMessage(MESSAGE).verify(EXPECTED_ADDRESS, nodeSig).should.equal(true)
    node.Message(MESSAGE).verify(EXPECTED_ADDRESS, standalone).should.equal(true)
  })

  it('needs no standalone bundle in Node, where loading one after the full bundle is worse than useless', function () {
    // Also from the wallet session: `bsv.Message` is already on bsv.bundle.js alone, so a Node
    // consumer gains nothing by loading bsv-message.min.js as well.
    //
    // The mechanism, measured, because the first explanation of it was too simple: the feature
    // bundles EXTERNALISE bsv (see test/build/bundle_externals.js — this one carries only
    // lib/message/), so they need a `bsv` to exist. In Node that means `global.bsv` must be set
    // before the require, and `require('./bsv-message.min.js')` without it throws
    // "Cannot read properties of undefined (reading 'crypto')" — which is what bundle_smoke.js
    // sets up deliberately, and what a consumer following its nose does not. In a browser the
    // page has already loaded bsv.bundle.js, so the global is there.
    //
    // Hence the advice this test keeps true: in Node take the full bundle alone; load the
    // standalone files only the way a browser does, as loadSandbox() above does.
    var alone = { console: { log: function () {}, warn: function () {}, error: function () {} } }
    alone.window = alone; alone.self = alone; alone.globalThis = alone; alone.global = alone
    alone.crypto = crypto.webcrypto
    alone.Buffer = Buffer
    alone.process = { env: {}, version: process.version, nextTick: process.nextTick }
    alone.setTimeout = setTimeout
    alone.TextEncoder = TextEncoder
    alone.TextDecoder = TextDecoder
    vm.runInContext(fs.readFileSync(path.join(ROOT, 'bsv.bundle.js'), 'utf8'), vm.createContext(alone), { filename: 'bsv.bundle.js' })
    ;(typeof alone.bsv.Message).should.equal('function', 'the full bundle must carry Message on its own')
    ;(typeof alone.bsv.ECIES).should.equal('function', 'the full bundle must carry ECIES on its own')
    // a Buffer from this realm is not the bundle's Buffer: pass strings across that boundary
    ;(function () { alone.bsv.HDPrivateKey.fromSeed(Buffer.alloc(32, 7)) }).should.throw()
    ;(typeof alone.bsv.HDPrivateKey.fromSeed('07'.repeat(32)).toString()).should.equal('string')
  })

  it('signs twenty messages and decrypts four times in silence', function () {
    // The regression the wallet actually hit: calci() printed a stack trace per signature and
    // ECIES printed a notice per decrypt, so a sign-in filled the user's console and buried
    // anything real. Fixed in 9.26.2; this holds it.
    var seen = { log: 0, warn: 0, error: 0 }
    var sandboxed = loadBundles()
    var seed = sandboxed.Mnemonic.fromString(MNEMONIC).toSeed()
    var key = sandboxed.HDPrivateKey.fromSeed(seed).deriveChild(PATH).privateKey
    var real = { log: console.log, warn: console.warn, error: console.error }
    console.log = function () { seen.log++ }
    console.warn = function () { seen.warn++ }
    console.error = function () { seen.error++ }
    try {
      for (var i = 0; i < 20; i++) {
        var sig = sandboxed.Message(MESSAGE + i).sign(key)
        sandboxed.Message(MESSAGE + i).verify(key.toAddress().toString(), sig)
      }
      var a = sandboxed.PrivateKey.fromString('33'.repeat(32))
      var b = sandboxed.PrivateKey.fromString('44'.repeat(32))
      var enc = new sandboxed.ECIES().privateKey(a).publicKey(b.toPublicKey()).encrypt('x')
      for (var j = 0; j < 4; j++) {
        new sandboxed.ECIES({ fixedPublicKey: true }).privateKey(b).publicKey(a.toPublicKey())
          .decrypt(enc)
      }
    } finally {
      console.log = real.log
      console.warn = real.warn
      console.error = real.error
    }
    seen.log.should.equal(0)
    seen.error.should.equal(0)
  })
})
