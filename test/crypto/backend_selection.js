'use strict'

/* global describe, it */

// The hashing and PBKDF2 backends are chosen by CAPABILITY, not by `process.browser`.
//
// `process.browser` is a Browserify-era convention, undefined in React Native, Deno,
// Cloudflare Workers and Bun. Every one of those took the node branch and
// require('crypto')'d, which fails outright in React Native or — worse — resolves to a
// partial shim. rn-nodeify and several RN starter templates register exactly such a
// shim, so this is a reported failure mode, not a hypothetical one.
//
// Each case runs in a child process because it has to intercept module resolution
// before lib/ is loaded, which cannot be undone safely in-process.

require('chai').should()
var path = require('path')
var spawnSync = require('child_process').spawnSync

var ROOT = path.resolve(__dirname, '../..')
var SHA256_ABC = 'ba7816bf8f01cfea414140de5dae2223b00361a396177a9cb410ff61f20015ad'

// Run `body` with Module._load intercepted by `stub`, and print the result of `report`.
function inChild (stub, report) {
  var src = [
    'var Module = require("module"), orig = Module._load',
    'var real = orig.call(Module, "crypto", module, false)',
    'Module._load = function (r) {',
    '  if (r === "crypto") { ' + stub + ' }',
    '  return orig.apply(this, arguments)',
    '}',
    // Only the pure-JS backend is loaded for comparison. hash.node.js require()s
    // 'crypto' at module scope, so it is not even loadable when the stub removes it —
    // which is precisely why hash.js must not reach for it unconditionally.
    'var HASH = require(' + JSON.stringify(path.join(ROOT, 'lib/crypto/hash.js')) + ')',
    'var PURE = require(' + JSON.stringify(path.join(ROOT, 'lib/crypto/hash.browser.js')) + ')',
    'console.log(' + report + ')'
  ].join('\n')
  var out = spawnSync(process.execPath, ['-e', src], { encoding: 'utf8' })
  if (out.status !== 0) throw new Error('child failed: ' + out.stderr)
  return out.stdout.trim()
}

describe('crypto backend selection', function () {
  this.timeout(30000)

  it('uses node crypto when it is present and correct', function () {
    // Not the pure-JS module => the node backend was selected.
    inChild('return real', '(HASH !== PURE) + " " + HASH.sha256(Buffer.from("abc")).toString("hex")')
      .should.equal('true ' + SHA256_ABC)
  })

  it('falls back to the pure-JS backend when there is no crypto module', function () {
    inChild('var e = new Error("no crypto"); e.code = "MODULE_NOT_FOUND"; throw e',
      '(HASH === PURE) + " " + HASH.sha256(Buffer.from("abc")).toString("hex")')
      .should.equal('true ' + SHA256_ABC)
  })

  // The important one. A shim that EXISTS but computes the wrong digest must be
  // rejected — trusting it would silently corrupt every hash in the library, and a
  // wrong hash is invisible until it matters.
  it('rejects a crypto shim that returns incorrect digests', function () {
    inChild(
      'return { createHash: function () { return { update: function () { return this }, ' +
      'digest: function () { return "deadbeef" } } } }',
      '(HASH === PURE) + " " + HASH.sha256(Buffer.from("abc")).toString("hex")')
      .should.equal('true ' + SHA256_ABC)
  })

  // OpenSSL 3 moved ripemd160 to the legacy provider, so some Node builds have sha256
  // but throw on ripemd160 — and ripemd160 is what addresses are built from.
  it('rejects a crypto build without ripemd160', function () {
    inChild(
      'return Object.assign({}, real, { createHash: function (a) { ' +
      'if (a === "ripemd160") throw new Error("Digest method not supported"); ' +
      'return real.createHash(a) } })',
      '(HASH === PURE) + " " + HASH.sha256ripemd160(Buffer.from("abc")).toString("hex").slice(0, 16)')
      .should.equal('true bb1be98c142444d7')
  })

  it('does not consult process.browser', function () {
    var src = [
      'process.browser = undefined',
      'var a = require(' + JSON.stringify(path.join(ROOT, 'lib/crypto/hash.js')) + ')',
      'console.log(a.sha256(Buffer.from("abc")).toString("hex"))'
    ].join('\n')
    var withoutFlag = spawnSync(process.execPath, ['-e', src], { encoding: 'utf8' })
    var withFlag = spawnSync(process.execPath, ['-e', 'process.browser = true\n' + src.split('\n').slice(1).join('\n')], { encoding: 'utf8' })
    withoutFlag.stdout.trim().should.equal(SHA256_ABC)
    withFlag.stdout.trim().should.equal(SHA256_ABC)
  })

  describe('pbkdf2', function () {
    // BIP-39 English test vector; the seed must not depend on which backend ran.
    var PHRASE = 'abandon abandon abandon abandon abandon abandon abandon abandon abandon abandon abandon about'
    var SEED = 'c55257c360c07c72029aebc1b53c05ed0362ada38ead3e3e9efa3708e53495531f09a6987599d18264c1e1c92f2cf141630c7a3c4ab7c81b2f001698e7463b04'

    function seedInChild (stub) {
      var src = [
        'var Module = require("module"), orig = Module._load',
        'var real = orig.call(Module, "crypto", module, false)',
        'Module._load = function (r) { if (r === "crypto") { ' + stub + ' } return orig.apply(this, arguments) }',
        'var bsv = require(' + JSON.stringify(ROOT) + ')',
        'console.log(new bsv.Mnemonic(' + JSON.stringify(PHRASE) + ').toSeed("TREZOR").toString("hex"))'
      ].join('\n')
      var out = spawnSync(process.execPath, ['-e', src], { encoding: 'utf8' })
      if (out.status !== 0) throw new Error('child failed: ' + out.stderr)
      return out.stdout.trim()
    }

    it('derives the BIP-39 vector with node crypto', function () {
      seedInChild('return real').should.equal(SEED)
    })

    it('derives the same seed with no crypto module', function () {
      seedInChild('var e = new Error("no crypto"); e.code = "MODULE_NOT_FOUND"; throw e').should.equal(SEED)
    })

    it('rejects a shim whose HMAC is wrong and still derives the right seed', function () {
      seedInChild(
        'return Object.assign({}, real, { createHmac: function () { return { ' +
        'update: function () { return this }, digest: function () { return Buffer.alloc(64) } } } })'
      ).should.equal(SEED)
    })
  })
})
