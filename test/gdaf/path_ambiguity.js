'use strict'

/* global describe, it, beforeEach, afterEach */

// The credential root does not commit to ONE credential, and this file asserts that hazard
// rather than hiding it.
//
// `_extractFields` joins path segments with `.` and nothing stops a key from containing one,
// so nested `{ a: { b: x } }` and flat `{ 'a.b': x }` both flatten to the path `a.b`.
// Measured on 9.31.0:
//
//   * the two credentials produce the SAME credentialRoot;
//   * a proof generated from either verifies against the other's root;
//   * one credential can carry BOTH, and then two contradictory values are each provable for
//     the single path `a.b` under one root.
//
// Same family as the 9.22.0 membership fix and the `':'` separator fix in the leaf encoding —
// that one length-prefixed the three COMPONENTS and left the path's own internal structure
// ambiguous.
//
// 9.32.0 MARKS it instead of refusing it. Refusing outright is a behaviour break for a caller
// who uses dotted keys and never collides, and STABILITY.md permits a break inside a 9.x
// minor only for an API that can lose funds — a root collision is serious but it is not that,
// and the promise is published. Escaping the separator is the real fix and moves every root,
// so it waits for 10.0.0.
//
// Until then the collision is LIVE, which is exactly why it is pinned here: these tests fail
// the moment the behaviour changes in either direction, so the fix cannot land silently and
// the hazard cannot be forgotten.

require('chai').should()
var ZK = require('../../lib/gdaf/zk-prover')
var deprecate = require('../../lib/util/deprecate')

var MASTER = 'aa'.repeat(16)
var WHAT = 'a credential field name containing "." (the path separator)'

describe('ZKProver credential paths are ambiguous, and say so', function () {
  beforeEach(function () {
    deprecate.reset()
    deprecate.setEnabled(false) // keep the suite quiet; `fired` is still recorded
  })
  afterEach(function () {
    deprecate.reset()
    deprecate.setEnabled(true)
  })

  it('warns on a key containing the path separator, and names 10.0.0', function () {
    ZK.createMerkleTree({ 'a.b': 'x' }, MASTER).root.should.match(/^[0-9a-f]{64}$/)
    var f = deprecate.fired()
    f.length.should.equal(1)
    f[0].what.should.equal(WHAT)
    f[0].since.should.equal('9.32.0')
    f[0].removeIn.should.equal('10.0.0')
  })

  it('keeps working, because marking an API is not breaking it', function () {
    var cred = { 'a.b': 'x' }
    var root = ZK.createMerkleTree(cred, MASTER).root
    ZK.verifySelectiveProof(ZK.generateSelectiveProof(cred, ['a.b'], MASTER), root)
      .valid.should.equal(true)
  })

  it('warns on the proof path too, not only on tree construction', function () {
    ZK.generateSelectiveProof({ 'a.b': 'x' }, ['a.b'], MASTER)
    deprecate.fired().length.should.equal(1)
  })

  it('warns for a nested dotted key, not only a top-level one', function () {
    ZK.createMerkleTree({ a: { 'b.c': 1 } }, MASTER)
    deprecate.fired().length.should.equal(1)
  })

  describe('the hazard itself, asserted', function () {
    // These four assertions ARE the defect. They must be deleted, not adjusted, when 10.0.0
    // escapes the separator — at which point the roots stop being equal and the cross-proofs
    // stop verifying.
    it('gives two different credentials the same root', function () {
      ZK.createMerkleTree({ a: { b: 'x' } }, MASTER).root
        .should.equal(ZK.createMerkleTree({ 'a.b': 'x' }, MASTER).root)
    })

    it('verifies a nested credential\'s proof against the flat credential\'s root', function () {
      var flatRoot = ZK.createMerkleTree({ 'a.b': 'x' }, MASTER).root
      ZK.verifySelectiveProof(
        ZK.generateSelectiveProof({ a: { b: 'x' } }, ['a.b'], MASTER), flatRoot)
        .valid.should.equal(true)
    })

    it('verifies a flat credential\'s proof against the nested credential\'s root', function () {
      var nestedRoot = ZK.createMerkleTree({ a: { b: 'x' } }, MASTER).root
      ZK.verifySelectiveProof(
        ZK.generateSelectiveProof({ 'a.b': 'x' }, ['a.b'], MASTER), nestedRoot)
        .valid.should.equal(true)
    })

    it('proves a value for a path a second field also claims', function () {
      // Both fields flatten to `a.b`. The proof discloses whichever the generator reaches
      // first and it verifies, so "a.b is 1" is provable under a root that also commits to
      // a second, contradictory `a.b`.
      var cred = { a: { b: 1 }, 'a.b': 2 }
      ZK._extractFields(cred).map(function (f) { return f.path })
        .should.deep.equal(['a.b', 'a.b'])
      var root = ZK.createMerkleTree(cred, MASTER).root
      var r = ZK.verifySelectiveProof(ZK.generateSelectiveProof(cred, ['a.b'], MASTER), root)
      r.valid.should.equal(true)
      r.verifiedFields[0].value.should.equal(1)
    })
  })

  describe('what must not change', function () {
    it('says nothing about an ordinary credential', function () {
      ZK.createMerkleTree({ a: { b: { c: { d: 'deep' } } } }, MASTER)
        .leaves[0].path.should.equal('a.b.c.d')
      deprecate.fired().length.should.equal(0)
    })

    it('does not disturb the root of a credential that was never ambiguous', function () {
      // The pre-fix digest, so the mark is proved to be additive.
      ZK.createMerkleTree({
        id: 'urn:x',
        credentialSubject: { name: 'Alice', partyAffiliation: 'DEM', eligible: true }
      }, MASTER).root.should.equal(
        '6b2bf2d8f9341c08df03664f5959dff8d687e49d274135d18d8aad0aa917615e')
      deprecate.fired().length.should.equal(0)
    })

    it('says nothing about other punctuation, including the leaf separator', function () {
      // `:` is the leaf encoding's component separator and is SAFE in a path, because that
      // encoding length-prefixes each component. Only `.` is structural for paths. Asserted
      // so the warning does not quietly widen into "no punctuation", which would be noise.
      var cred = { 'a:b': 1, 'c-d': 2, 'e_f': 3, 'g h': 4 }
      var root = ZK.createMerkleTree(cred, MASTER).root
      Object.keys(cred).forEach(function (p) {
        ZK.verifySelectiveProof(ZK.generateSelectiveProof(cred, [p], MASTER), root)
          .valid.should.equal(true, p)
      })
      deprecate.fired().length.should.equal(0)
    })
  })
})
