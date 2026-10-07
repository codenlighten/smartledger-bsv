'use strict'
/* global describe,it */

// What `verifyCredential`'s `valid: true` does and does not mean.
//
// Pinned because the vg-wallet session found the gap in its own public verify route and asked us
// to document it: that endpoint returned our result without comparing the issuer against Verified
// Grades, so a self-issued claim would have been reported as verified. The library behaviour is
// correct for a self-contained DID method; the trap is that `valid` reads like "trusted".

require('chai').should()
var bsv = require('../..')

describe('verifyCredential trust boundary', function () {
  it('is async, so an un-awaited call is truthy and always passes', function () {
    var k = bsv.PrivateKey.fromString('ab'.repeat(32))
    var did = bsv.createDID(k.toPublicKey())
    // createEmailCredential is SYNCHRONOUS; only verifyCredential is async. Assuming symmetry
    // is how this test first failed.
    var cred = bsv.createEmailCredential(did, did, 'a@b.c', k)
    var p = bsv.verifyCredential(cred)
    ;(typeof p.then).should.equal('function')
    ;(!!p).should.equal(true)
    return p
  })

  it('accepts a self-issued credential claiming anything, with its own DID as issuer', function () {
    var mallory = bsv.PrivateKey.fromString('cd'.repeat(32))
    var did = bsv.createDID(mallory.toPublicKey())
    return bsv.verifyCredential(bsv.createEmailCredential(did, did, 'ceo@example.com', mallory))
      .then(function (r) {
        r.valid.should.equal(true)
        r.errors.should.deep.equal([])
        // the field a caller MUST compare against its own trust anchor
        r.issuerDID.should.equal(did)
      })
  })

  it('still rejects a tampered subject, a wrong issuer field and a removed proof', function () {
    var issuer = bsv.PrivateKey.fromString('11'.repeat(32))
    var subject = bsv.PrivateKey.fromString('22'.repeat(32))
    var iDID = bsv.createDID(issuer.toPublicKey())
    var sDID = bsv.createDID(subject.toPublicKey())
    var cred = bsv.createEmailCredential(iDID, sDID, 'user@example.com', issuer)
    return Promise.resolve().then(function () {
      var tampered = JSON.parse(JSON.stringify(cred))
      tampered.credentialSubject.email = 'attacker@evil.com'
      var wrongIssuer = JSON.parse(JSON.stringify(cred))
      wrongIssuer.issuer = 'did:smartledger:' + 'ff'.repeat(16)
      var noProof = JSON.parse(JSON.stringify(cred))
      delete noProof.proof
      return Promise.all([
        bsv.verifyCredential(cred),
        bsv.verifyCredential(tampered),
        bsv.verifyCredential(wrongIssuer),
        bsv.verifyCredential(noProof)
      ])
    }).then(function (r) {
      r[0].valid.should.equal(true)
      r[1].valid.should.equal(false)
      r[2].valid.should.equal(false)
      r[3].valid.should.equal(false)
    })
  })
})
