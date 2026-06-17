'use strict'

/* global describe, it */

// Regression tests for LTP right-token creation, signing, transfer and the
// instance LTP#createRightToken path. These guard three defects fixed together:
//   1. lib/ltp/right.js defined `_signToken` twice; the second definition
//      shadowed the working one and referenced an undefined `hash` — every
//      prepareRightToken / transfer / reissue / obligation signing threw
//      "hash is not defined". The second definition is the detached-JWS builder
//      and is now `_createJWS(hash, signature)`.
//   2. lib/ltp/index.js#createRightToken called the non-existent
//      `LTPRight.create(...)`. `RightToken.create` now exists (build-only).
//   3. lib/ltp/index.js#createRightToken signed via the non-existent
//      `LTPProof.createSignature`; it now signs via `RightToken._signToken`.

var expect = require('chai').expect
var bsv = require('../../')

var LTP = bsv.LTP
var RightToken = LTP.Right

function newDid () {
  var key = bsv.PrivateKey.fromRandom()
  return { key: key, did: 'did:key:' + key.toPublicKey().toString() }
}

describe('LTP right-token signing (regression)', function () {
  it('prepareRightToken produces a signed token with a JWS proof and tokenHash', function () {
    var issuer = newDid()
    var result = RightToken.prepareRightToken(
      'EquityShare', issuer.did, issuer.did,
      { spv: 'spv-001', units: 1000000 }, issuer.key, { jurisdiction: 'US-DE' }
    )
    expect(result.success).to.equal(true)
    expect(result.rightToken).to.be.an('object')
    expect(result.rightToken.proof).to.be.an('object')
    expect(result.rightToken.proof.jws).to.be.a('string').with.length.greaterThan(0)
    expect(result.rightToken.tokenHash).to.match(/^[0-9a-f]{64}$/)
  })

  it('a prepared right token passes verification (hash integrity)', function () {
    var issuer = newDid()
    var result = RightToken.prepareRightToken(
      'PropertyTitle', issuer.did, issuer.did,
      { parcel: '123 Main St' }, issuer.key, {}
    )
    expect(result.success).to.equal(true)
    var verification = RightToken.prepareRightTokenVerification(result.rightToken, {})
    expect(verification.success).to.equal(true)
    expect(verification.verification.valid).to.equal(true)
  })

  it('RightToken.create builds an unsigned token structure', function () {
    var issuer = newDid()
    var token = RightToken.create(
      'EquityShare', issuer.did, issuer.did, { spv: 'spv-001' }, issuer.key, {}
    )
    expect(token).to.be.an('object')
    expect(token.credentialSubject.rightType).to.equal('EquityShare')
    expect(token.proof).to.equal(undefined)
  })

  it('rejects an invalid right type', function () {
    var issuer = newDid()
    expect(function () {
      RightToken.create('NotAType', issuer.did, issuer.did, {}, issuer.key, {})
    }).to.throw(/Invalid right type/)
  })

  it('prepareRightTokenTransfer signs a transfer to a new owner', function () {
    var issuer = newDid()
    var created = RightToken.prepareRightToken(
      'EquityShare', issuer.did, issuer.did, { spv: 'spv-001', units: 1000000 }, issuer.key, {}
    )
    expect(created.success).to.equal(true)
    var buyer = newDid()
    var transfer = RightToken.prepareRightTokenTransfer(created.rightToken, buyer.did, issuer.key, {})
    expect(transfer.success).to.equal(true)
  })

  it('LTP#createRightToken (instance) returns a signed, verifiable token', function () {
    var issuer = newDid()
    var ltp = new LTP()
    var res = ltp.createRightToken(
      { type: 'EquityShare', owner: issuer.did, spv: 'spv-001', units: 1000000 },
      issuer.key, {}
    )
    expect(res.success).to.equal(true)
    expect(res.token.proof.jws).to.be.a('string').with.length.greaterThan(0)
    expect(res.token.tokenHash).to.match(/^[0-9a-f]{64}$/)

    var verification = RightToken.prepareRightTokenVerification(res.token, {})
    expect(verification.verification.valid).to.equal(true)
  })
})
