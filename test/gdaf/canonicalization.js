'use strict'

/* global describe, it */

// GDAF signs a hash of canonical JSON, so the canonicalization IS part of the signature
// scheme. It was sorted-key JSON that rebuilt the object, which loses the sort: V8 orders
// integer-like own properties numerically, ahead of string keys, whatever order they were
// inserted in.
//
// Within this library that was deterministic — signing and verification agreed, and no
// forgery followed. Across implementations it was a verification failure, which for
// credentials that exist to be checked by other parties is the thing that matters.

require('chai').should()
var Signer = require('../../lib/gdaf/attestation-signer')

describe('GDAF canonicalization', function () {
  describe('RFC 8785 conformance', function () {
    // The concrete divergence. JCS sorts by UTF-16 code unit, where '10' < '2'.
    it('sorts integer-like keys lexicographically, not numerically', function () {
      var o = {}
      o['10'] = 'ten'
      o['2'] = 'two'
      Signer._canonicalizeJCS(o).should.equal('{"10":"ten","2":"two"}')
    })

    it('is what the legacy form got wrong, which is why both exist', function () {
      var o = {}
      o['10'] = 'ten'
      o['2'] = 'two'
      Signer._canonicalizeJSON(o).should.equal('{"2":"two","10":"ten"}')
      Signer._canonicalizeJCS(o).should.not.equal(Signer._canonicalizeJSON(o))
    })

    it('sorts at every depth and leaves arrays in order', function () {
      Signer._canonicalizeJCS({ z: { b: 1, a: 2 }, a: [3, { d: 1, c: 2 }] })
        .should.equal('{"a":[3,{"c":2,"d":1}],"z":{"a":2,"b":1}}')
    })

    it('is insensitive to key insertion order', function () {
      var x = {}; x.b = 1; x.a = 2
      var y = {}; y.a = 2; y.b = 1
      Signer._canonicalizeJCS(x).should.equal(Signer._canonicalizeJCS(y))
    })

    // These are the same IEEE-754 double, so collapsing them is correct rather than a
    // weakness — JavaScript has one number type. Pinned so nobody "fixes" it.
    it('treats 1847, 1847.0 and 1.847e3 as the one number they are', function () {
      Signer._canonicalizeJCS({ a: 1847 }).should.equal('{"a":1847}')
      Signer._canonicalizeJCS({ a: 1847.0 }).should.equal('{"a":1847}')
      Signer._canonicalizeJCS({ a: 1.847e3 }).should.equal('{"a":1847}')
    })

    it('keeps a number distinct from its string form', function () {
      Signer._canonicalizeJCS({ a: 1847 }).should.not.equal(Signer._canonicalizeJCS({ a: '1847' }))
    })

    // JSON.stringify would emit `null` here, silently signing a different document.
    it('refuses non-finite numbers rather than emitting null', function () {
      ;(function () { Signer._canonicalizeJCS({ a: NaN }) }).should.throw(/non-finite/)
      ;(function () { Signer._canonicalizeJCS({ a: Infinity }) }).should.throw(/non-finite/)
    })

    it('emits unicode and non-BMP characters directly', function () {
      Signer._canonicalizeJCS({ a: 'é' }).should.equal('{"a":"é"}')
      Signer._canonicalizeJCS({ a: '😀' }).should.equal('{"a":"😀"}')
    })

    it('drops undefined members, which JSON cannot represent', function () {
      Signer._canonicalizeJCS({ a: 1, b: undefined }).should.equal('{"a":1}')
    })

    it('nulls undefined array elements, as JSON.stringify does', function () {
      Signer._canonicalizeJCS([1, undefined, 2]).should.equal('[1,null,2]')
    })
  })

  describe('hashing and migration', function () {
    var CRED = { id: 'urn:x', credentialSubject: { name: 'Alice', age: 41 } }

    it('hashes with JCS by default', function () {
      Signer._hashCredential(CRED).toString('hex')
        .should.equal(Signer._hashCredential(CRED, Signer.CANONICALIZATION.JCS).toString('hex'))
    })

    // The migration path. A credential whose keys make the two forms differ must hash
    // differently, or the legacy fallback in the verifier would be pointless.
    it('gives a different hash under the legacy form when the forms diverge', function () {
      var withIntKeys = { '10': 'ten', '2': 'two' }
      Signer._hashCredential(withIntKeys, Signer.CANONICALIZATION.JCS).toString('hex')
        .should.not.equal(
          Signer._hashCredential(withIntKeys, Signer.CANONICALIZATION.LEGACY).toString('hex')
        )
    })

    it('agrees between the forms when no integer-like keys are present', function () {
      Signer._hashCredential(CRED, Signer.CANONICALIZATION.JCS).toString('hex')
        .should.equal(Signer._hashCredential(CRED, Signer.CANONICALIZATION.LEGACY).toString('hex'))
    })

    it('exposes both forms by name', function () {
      Signer.CANONICALIZATION.JCS.should.equal('jcs')
      Signer.CANONICALIZATION.LEGACY.should.equal('legacy')
    })
  })
})
