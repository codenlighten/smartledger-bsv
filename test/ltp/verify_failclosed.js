'use strict'

/* global describe, it */

// Regression guard for the C1–C4 fail-open verification bugs. Before the fix,
// LTP signature verification returned the ECDSA instance (always truthy) or
// skipped the JWS check entirely (a `// TODO`), so a forged token verified as
// valid. These tests feed known-bad signatures/issuers and assert valid===false.

var expect = require('chai').expect
var bsv = require('../../')

var LTP = bsv.LTP
var RightToken = LTP.Right
var Obligation = LTP.Obligation

function newDid () {
  var key = bsv.PrivateKey.fromRandom()
  return { key: key, did: 'did:key:' + key.toPublicKey().toString() }
}

describe('LTP verification fails closed (C1–C4 regression)', function () {
  it('a genuinely signed right token still verifies as valid', function () {
    var issuer = newDid()
    var result = RightToken.prepareRightToken(
      'EquityShare', issuer.did, issuer.did,
      { spv: 'spv-001', units: 1000 }, issuer.key, {}
    )
    expect(result.success).to.equal(true)
    var v = RightToken.prepareRightTokenVerification(result.rightToken, {})
    expect(v.verification.valid, JSON.stringify(v.verification.errors)).to.equal(true)
  })

  it('a tampered JWS signature is rejected (C4)', function () {
    var issuer = newDid()
    var result = RightToken.prepareRightToken(
      'EquityShare', issuer.did, issuer.did, { spv: 'x' }, issuer.key, {}
    )
    var token = result.rightToken
    // Flip the signature: replace it with a signature over different data by a
    // different key, re-encoded as a valid-looking JWS.
    var attacker = newDid()
    var parts = token.proof.jws.split('.')
    var bogusSig = bsv.crypto.ECDSA.sign(
      bsv.crypto.Hash.sha256(Buffer.from('not the token')), attacker.key
    )
    token.proof.jws = parts[0] + '.' + parts[1] + '.' + bogusSig.toDER().toString('base64url')

    var v = RightToken.prepareRightTokenVerification(token, {})
    expect(v.verification.valid).to.equal(false)
  })

  it('a token re-signed by an attacker but attributed to the victim issuer is rejected (C4 binding)', function () {
    var victim = newDid()
    var attacker = newDid()
    var result = RightToken.prepareRightToken(
      'PropertyTitle', victim.did, victim.did, { parcel: '1 Main' }, victim.key, {}
    )
    var token = result.rightToken
    // Attacker re-signs the exact token hash with THEIR key, but leaves issuer =
    // victim. Verification must bind to the victim issuer key and reject.
    var sig = bsv.crypto.ECDSA.sign(
      bsv.crypto.Hash.sha256(Buffer.from(RightToken._canonicalizeToken(token))), attacker.key
    )
    var parts = token.proof.jws.split('.')
    token.proof.jws = parts[0] + '.' + parts[1] + '.' + sig.toDER().toString('base64url')

    var v = RightToken.prepareRightTokenVerification(token, {})
    expect(v.verification.valid).to.equal(false)
  })

  it('prepareRightTokenTransfer rejects a transfer signed by a non-owner (ownership binding)', function () {
    var owner = newDid()
    var attacker = newDid()
    var res = RightToken.prepareRightToken(
      'EquityShare', owner.did, owner.did, { spv: 't-1' }, owner.key, {}
    )
    var token = res.rightToken
    // Attacker tries to transfer a token they do not own → must be refused.
    var bad = RightToken.prepareRightTokenTransfer(token, attacker.did, attacker.key, {})
    expect(bad.success).to.equal(false)
    // The genuine owner can transfer.
    var good = RightToken.prepareRightTokenTransfer(token, attacker.did, owner.key, {})
    expect(good.success, JSON.stringify(good.error)).to.equal(true)
  })

  it('verifyOwnership rejects a signature by the wrong key (C2)', function () {
    var owner = newDid()
    var attacker = newDid()
    var Resolver = require('../../lib/gdaf/did-resolver')
    var did = 'did:smartledger:' + owner.key.toPublicKey().toString()
    var msg = 'transfer authorization'
    // Signature by attacker, checked against owner's DID → must be false.
    var badSig = bsv.crypto.ECDSA.sign(bsv.crypto.Hash.sha256(Buffer.from(msg)), attacker.key)
    expect(Resolver.verifyOwnership(did, badSig.toString(), msg)).to.equal(false)
  })

  it('verifyAnchor refuses to fabricate success without a chain provider (C3)', async function () {
    var Anchor = require('../../lib/gdaf/smartledger-anchor')
    var threw = false
    try {
      await Anchor.verifyAnchor('deadbeef', 'cafe')
    } catch (e) {
      threw = true
    }
    expect(threw).to.equal(true)
  })

  it('a genuinely signed obligation token still verifies as valid', function () {
    var issuer = newDid()
    var ob = Obligation.prepareObligationToken(
      'PaymentObligation', issuer.did, issuer.did, { amount: 1 }, issuer.key, {}
    )
    expect(ob.success).to.equal(true)
    var v = Obligation.prepareObligationVerification(ob.obligationToken, {})
    expect(v.verification.valid, JSON.stringify(v.verification && v.verification.errors)).to.equal(true)
  })

  it('a tampered obligation signature is rejected (C4)', function () {
    var issuer = newDid()
    var attacker = newDid()
    var ob = Obligation.prepareObligationToken(
      'PaymentObligation', issuer.did, issuer.did, { amount: 1 }, issuer.key, {}
    )
    var tok = ob.obligationToken
    var sig = bsv.crypto.ECDSA.sign(
      bsv.crypto.Hash.sha256(Buffer.from('forged')), attacker.key
    )
    var parts = tok.proof.jws.split('.')
    tok.proof.jws = parts[0] + '.' + parts[1] + '.' + sig.toDER().toString('base64url')
    var v = Obligation.prepareObligationVerification(tok, {})
    expect(v.verification.valid).to.equal(false)
  })
})
