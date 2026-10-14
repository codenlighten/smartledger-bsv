'use strict'

/* global describe, it */

// LTP.Proof's selective disclosure carried TWO defects, both of which had already been found
// and fixed in lib/gdaf/zk-prover.js. This module kept its own copy of the same code and so
// kept the bugs — which is why the encoding now lives in lib/util/field-commit.js and both
// modules require it.
//
//   1. A FORGEABLE COMMITMENT. `_hashField` was
//          path + ':' + JSON.stringify(value) + ':' + salt
//      and `JSON.stringify` renders null, NaN and Infinity all as "null". Measured on 9.31.0
//      through the public API: a disclosure of `null` still verified after the disclosed
//      value was changed to NaN, and again after it was changed to Infinity. A verified
//      disclosure of a value the issuer never committed to.
//
//   2. THE HONEST PROOF FAILED at most field counts, for the same reason as the GDAF
//      prover: `_createMerkleTree` pairs a last odd node with itself and
//      `_generateMerkleProof` emitted nothing for it.
//
// Both are pinned here as the attack that worked.

require('chai').should()
var LTP = require('../../lib/ltp/proof')
var deprecate = require('../../lib/util/deprecate')

var NONCE = 'nonce123'

function verdict (proof) {
  var r = LTP.prepareSelectiveDisclosureVerification(proof, NONCE)
  if (!r.success) return { valid: false, errors: [r.error] }
  return r.verification
}

function disclose (token, paths) {
  var r = LTP.prepareSelectiveDisclosure(token, paths, NONCE)
  r.success.should.equal(true, 'setup: ' + r.error)
  return r.proof || r
}

describe('LTP.Proof selective disclosure', function () {
  this.timeout(30000)

  describe('the commitment is not forgeable by re-encoding the value', function () {
    it('refuses NaN substituted for a committed null', function () {
      var p = disclose({ claim: { x: null } }, ['claim.x'])
      verdict(p).valid.should.equal(true)
      p.disclosures[0].value = NaN
      verdict(p).valid.should.equal(false)
    })

    it('refuses Infinity substituted for a committed null', function () {
      var p = disclose({ claim: { x: null } }, ['claim.x'])
      p.disclosures[0].value = Infinity
      verdict(p).valid.should.equal(false)
    })

    it('refuses -Infinity, and reports it as a verdict rather than throwing', function () {
      // A value outside the permitted domain must come back as invalid, not as an exception
      // a caller might read as "inconclusive".
      var p = disclose({ claim: { x: null } }, ['claim.x'])
      p.disclosures[0].value = -Infinity
      var v = verdict(p)
      v.valid.should.equal(false)
      v.errors.join(' ').should.match(/not a permitted type/)
    })

    it('still refuses an ordinary changed value', function () {
      var p = disclose({ claim: { x: 5 } }, ['claim.x'])
      verdict(p).valid.should.equal(true)
      p.disclosures[0].value = 99
      verdict(p).valid.should.equal(false)
    })

    it('refuses to COMMIT to a value it cannot encode injectively', function () {
      // The other half of the fix: the generator must not mint an ambiguous commitment in
      // the first place.
      LTP.prepareSelectiveDisclosure({ claim: { x: NaN } }, ['claim.x'], NONCE)
        .success.should.equal(false)
      LTP.prepareSelectiveDisclosure({ claim: { x: Infinity } }, ['claim.x'], NONCE)
        .success.should.equal(false)
    })
  })

  describe('the honest holder can disclose any field, at any field count', function () {
    it('verifies every single-field disclosure for 1..24 fields', function () {
      var failures = []
      for (var n = 1; n <= 24; n++) {
        var token = { claim: {} }
        for (var i = 0; i < n; i++) token.claim['f' + i] = 'v' + i
        for (var j = 0; j < n; j++) {
          var path = 'claim.f' + j
          var v = verdict(disclose(token, [path]))
          if (!v.valid) failures.push(n + ':' + path + ' [' + v.errors.join(';') + ']')
        }
      }
      failures.should.deep.equal([])
    })

    it('names the counts that used to fail', function () {
      ;[[3, 2], [5, 4], [6, 4], [6, 5], [7, 6], [9, 8]].forEach(function (pair) {
        var token = { claim: {} }
        for (var i = 0; i < pair[0]; i++) token.claim['f' + i] = 'v' + i
        verdict(disclose(token, ['claim.f' + pair[1]])).valid
          .should.equal(true, pair[0] + ' fields, field f' + pair[1])
      })
    })

    it('still rejects a dropped proof step and a wrong root', function () {
      var token = { claim: { a: 1, b: 2, c: 3 } }
      var p = disclose(token, ['claim.c'])
      verdict(p).valid.should.equal(true)
      var q = disclose(token, ['claim.c'])
      q.merkleProofs[0].proof.shift()
      verdict(q).valid.should.equal(false)
      var r = disclose(token, ['claim.c'])
      r.merkleRoot = '00'.repeat(32)
      verdict(r).valid.should.equal(false)
    })
  })

  describe('a field name that is not representable in a path is marked', function () {
    // `.` separates segments and `[n]` indexes arrays, so a key containing either is
    // ambiguous: nested `{a:{b:x}}` and flat `{'a.b':x}` flatten to the same path. Worse here
    // than in GDAF, because `_getNestedValue` reads the path back with `split('.')`, so for a
    // literal 'a.b' key that lookup returns undefined and the commitment and the value it
    // claims to cover come apart.
    //
    // MARKED, not refused: STABILITY.md permits a break inside a 9.x minor only for an API
    // that can lose funds, and escaping the separators would move every Merkle root this
    // module has produced. It warns, names 10.0.0, and keeps working.
    it('warns on a dotted key and names 10.0.0', function () {
      deprecate.reset()
      deprecate.setEnabled(false)
      LTP.prepareSelectiveDisclosure({ claim: { 'x.y': 1 } }, ['claim.x.y'], NONCE)
      var f = deprecate.fired()
      f.length.should.equal(1)
      f[0].what.should.match(/LTP token field name containing/)
      f[0].since.should.equal('9.32.0')
      f[0].removeIn.should.equal('10.0.0')
      deprecate.reset()
      deprecate.setEnabled(true)
    })

    it('warns on a bracketed key', function () {
      deprecate.reset()
      deprecate.setEnabled(false)
      LTP.prepareSelectiveDisclosure({ claim: { 'x[0]': 1 } }, ['claim.x'], NONCE)
      deprecate.fired().length.should.equal(1)
      deprecate.reset()
      deprecate.setEnabled(true)
    })

    it('says nothing about ordinary nesting or real arrays', function () {
      deprecate.reset()
      deprecate.setEnabled(false)
      verdict(disclose({ claim: { a: { b: 'x' } } }, ['claim.a.b'])).valid.should.equal(true)
      LTP.prepareSelectiveDisclosure({ claim: { a: [1, 2] } }, ['claim.a'], NONCE)
        .success.should.equal(true)
      deprecate.fired().length.should.equal(0)
      deprecate.reset()
      deprecate.setEnabled(true)
    })
  })

  describe('no commitment moved', function () {
    // The fix validates the DOMAIN and leaves the framing alone, so every commitment for a
    // representable value is byte-identical to the one 9.31.0 produced. Had the framing
    // changed, every disclosure ever issued would have stopped verifying. These digests were
    // read out of the 9.31.0 code.
    it('reproduces the 9.31.0 field commitment, value by value', function () {
      ;[
        ['claim.x', 'v', 'ss', '9f99bfd0c924ea557a669e6c5e9b2321297e448021f5ba995cab1e47fa18ee73'],
        ['claim.x', null, 'ss', '9a65e815a2e2703f59f9b7dba5b2e37d267cd5775d998035bce889024c289925'],
        ['claim.n', 42, 'ss', '42a99fc096ebfcc34126b97f17bba92102d831807eb4ac8ad261a1fe83f52c74'],
        ['claim.b', true, 'ss', '1c8727010bfa6fec16be167f2805a068b2f33ed89b66adfaa42de69086209d29'],
        ['a.b', 'x', 'ss', '7f64d5104ba9cef08d5318b6236ac06571d0b6beac3a6f5102a406b510b55bd1']
      ].forEach(function (c) {
        LTP._hashField(c[0], c[1], c[2]).should.equal(c[3], c[0] + ' = ' + JSON.stringify(c[1]))
      })
    })

    it('pins the Merkle tree shape at every token size, under a fixed salt seed', function () {
      // Including the odd sizes, where the 9.32.0 proof-generation fix applies — that fix
      // touches the generator only, so the tree itself is untouched.
      //
      // These roots were PINNED AFRESH in 9.34.0 and are not the 9.31.0 ones. 9.34.0 stopped
      // deriving each field's salt from the nonce, because the nonce travels inside the proof
      // and that made every undisclosed field's salt — and so its value — recoverable by
      // whoever held it (test/ltp/salt_derivation.js). The salt is now an HMAC under a master
      // salt that is random per disclosure, so there is no derivation under which a pre-9.34.0
      // root can be reproduced, deliberately: the only consumer that could have pinned one is
      // outside this library, since nothing here signs or anchors this root and verification
      // never re-derives it.
      //
      // What the 9.32.0 fix promised — that no commitment moved for a representable value — is
      // still tested, by the value-by-value `_hashField` digests above, which do not depend on
      // how the salt was produced.
      var SEED = 'f'.repeat(64)
      var ROOTS = {
        1: '26223ffc6b4fea9bfa0e0b14cd66045aba1cb9159983e335641f3443053650a3',
        2: 'e633bca9ff00f674c39cf07d1dd26cc993773a88efa75859c1413af3ec22401a',
        3: '02693e2ccc89c4ccf5efbdfd416be93a09e0e63b397a85fd1a0cd7a5ad7fcbd1',
        4: '6b7e868b6f6497eee07beb722b3fd70c7081702763361717656c52439ba25080',
        5: '1879ea47400c2bf0ea8a272c4be1dfa3529cc1c1aa8a3324095929f8c13fd9a5',
        6: '126f9598b32d104cf83d546a372302517b9258ef330a503ee98a3c3129cf5a1d',
        7: '00169ed5be6e228be525d135fb8896a4156d59cad6f39da63487dda5aaf8d255',
        8: '7d4ff8ca1a2691e144aa0ec1b7dc4a331bb63d677070f4337390465d672a90a3',
        9: '861b5a6030d2c6b7c286385cd67eaeef2917e7dd46fb0cf65300c67428c24004',
        10: '1f9474f072a7a3a18745af23eb4daa9b9869ee3e863c34b5afa8572443e2406d',
        11: '2ad2a08d5ff66d5607106d58004ec11a5b9afec4097bd627c48621d3aeaa3fee',
        12: '83a27fd5d8a10e58df424fca0cb052032ae38d2c0c248a04490eac12dbd42071'
      }
      Object.keys(ROOTS).forEach(function (k) {
        var n = parseInt(k, 10)
        var token = { claim: {} }
        for (var i = 0; i < n; i++) token.claim['f' + i] = 'v' + i
        var p = LTP.prepareSelectiveDisclosure(token, ['claim.f0'], NONCE, { saltSeed: SEED })
        p.success.should.equal(true)
        ;(p.proof || p).merkleRoot.should.equal(ROOTS[k], n + ' fields')
      })
    })
  })
})
