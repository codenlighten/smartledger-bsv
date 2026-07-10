'use strict'

/* global describe, it */

// Regression guard for the StatusList2021 revocation-bypass bug. Before the fix,
// getCredentialStatusEntry / updateStatusList read the revocation bitstring from
// the JWT payload WITHOUT verifying the signature — so anyone who could substitute
// the list JWT could flip a revoked credential back to "valid". These tests assert
// the status-list reads now fail closed.

var expect = require('chai').expect
var didweb = require('../../lib/didweb')
var statuslist = require('../../lib/statuslist')
var vcjwt = require('../../lib/vcjwt')

function tamperEncodedList (listVcJwt, newEncodedList) {
  var parts = listVcJwt.split('.')
  var payload = JSON.parse(vcjwt.base64UrlDecode(parts[1]).toString())
  payload.vc.credentialSubject.encodedList = newEncodedList
  var tamperedPayload = Buffer.from(JSON.stringify(payload)).toString('base64url')
  return parts[0] + '.' + tamperedPayload + '.' + parts[2] // keep original signature
}

describe('StatusList2021 fails closed (revocation-bypass regression)', function () {
  var keys, docs, resolver, verifyOpts, listJwt

  before(async function () {
    keys = await didweb.generateIssuerKeys({ alg: 'ES256' })
    docs = didweb.buildDidWebDocuments({
      domain: 'example.com',
      p256: { jwk: keys.publicJwk, kid: keys.kid }
    })
    resolver = async function () { return { jwks: docs.jwks } }
    verifyOpts = { expectedIssuerDid: docs.did, didResolver: resolver }
    var created = await statuslist.createStatusList({ issuerDid: docs.did, privateJwk: keys.privateJwk })
    listJwt = created.listVcJwt
  })

  it('reads a genuine, verified status list', async function () {
    var status = await statuslist.getCredentialStatusEntry(Object.assign({ listVcJwt: listJwt, index: 7 }, verifyOpts))
    expect(status).to.equal('valid')
  })

  it('rejects a list whose bitstring was tampered without re-signing (bypass closed)', async function () {
    // Build a bitstring that marks index 7 as revoked, then splice it in WITHOUT
    // the issuer's signature — exactly the substitution attack the bug allowed.
    var zlib = require('zlib')
    var buf = Buffer.alloc(Math.ceil(100000 / 8), 0)
    buf[0] = 0xff
    var forgedEncoded = zlib.gzipSync(buf).toString('base64')
    var forgedJwt = tamperEncodedList(listJwt, forgedEncoded)

    var threw = false
    try {
      await statuslist.getCredentialStatusEntry(Object.assign({ listVcJwt: forgedJwt, index: 7 }, verifyOpts))
    } catch (e) { threw = true }
    expect(threw, 'tampered list must be rejected').to.equal(true)
  })

  it('refuses to read without a pinned expectedIssuerDid', async function () {
    var threw = false
    try {
      await statuslist.getCredentialStatusEntry({ listVcJwt: listJwt, index: 7, didResolver: resolver })
    } catch (e) { threw = true }
    expect(threw).to.equal(true)
  })

  it('rejects a list signed by a different (attacker) issuer under the victim DID', async function () {
    var attacker = await didweb.generateIssuerKeys({ alg: 'ES256' })
    var attackerList = await statuslist.createStatusList({ issuerDid: docs.did, privateJwk: attacker.privateJwk })
    // Resolver returns the VICTIM's key for docs.did; attacker's signature must fail.
    var threw = false
    try {
      await statuslist.getCredentialStatusEntry(Object.assign({ listVcJwt: attackerList.listVcJwt, index: 7 }, verifyOpts))
    } catch (e) { threw = true }
    expect(threw).to.equal(true)
  })
})
