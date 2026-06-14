'use strict'

/* global describe, it */

// Proves the VC-JWT module is interoperable with the standards-compliant
// `jose` library in BOTH directions, for ES256 (P-256) and ES256K (secp256k1),
// and that algorithm pinning / curve binding reject substitution attacks.

var assert = require('assert')
var crypto = require('crypto')
var jose = require('jose')
var vcjwt = require('../../lib/vcjwt')

function genKeys (alg, namedCurve) {
  var pair = crypto.generateKeyPairSync('ec', { namedCurve: namedCurve })
  var privateJwk = pair.privateKey.export({ format: 'jwk' })
  var publicJwk = pair.publicKey.export({ format: 'jwk' })
  privateJwk.kid = publicJwk.kid = 'test-key-1'
  privateJwk.alg = publicJwk.alg = alg
  return { privateJwk: privateJwk, publicJwk: publicJwk }
}

function resolverFor (publicJwk) {
  return function () {
    return Promise.resolve({ jwks: { keys: [publicJwk] } })
  }
}

var CASES = [
  { alg: 'ES256', curve: 'prime256v1' },
  { alg: 'ES256K', curve: 'secp256k1' }
]

describe('vcjwt JOSE interop', function () {
  CASES.forEach(function (c) {
    it('issues a token that ' + c.alg + ' jose can verify (P1363 encoding)', async function () {
      var keys = genKeys(c.alg, c.curve)
      var issued = await vcjwt.issueVcJwt({
        issuerDid: 'did:web:example.com',
        subjectId: 'did:web:subject.example',
        credentialSubject: { name: 'Alice' },
        privateJwk: keys.privateJwk,
        alg: c.alg
      })
      var joseKey = await jose.importJWK(keys.publicJwk, c.alg)
      var result = await jose.jwtVerify(issued.jwt, joseKey) // throws if non-compliant
      assert.strictEqual(result.payload.iss, 'did:web:example.com')
    })

    it('verifies a ' + c.alg + ' token issued by jose', async function () {
      var keys = genKeys(c.alg, c.curve)
      var josePriv = await jose.importJWK(keys.privateJwk, c.alg)
      var joseJwt = await new jose.SignJWT({ vc: { type: ['VerifiableCredential'] } })
        .setProtectedHeader({ alg: c.alg, typ: 'JWT', kid: keys.publicJwk.kid })
        .setIssuer('did:web:example.com')
        .setSubject('did:web:subject.example')
        .setIssuedAt()
        .setExpirationTime('1y')
        .sign(josePriv)
      var res = await vcjwt.verifyVcJwt(joseJwt, { didResolver: resolverFor(keys.publicJwk) })
      assert.strictEqual(res.valid, true, res.error)
    })
  })

  it('rejects a token whose alg is not in the allowlist', async function () {
    var keys = genKeys('ES256', 'prime256v1')
    var issued = await vcjwt.issueVcJwt({
      issuerDid: 'did:web:example.com', subjectId: 's', credentialSubject: {}, privateJwk: keys.privateJwk, alg: 'ES256'
    })
    var res = await vcjwt.verifyVcJwt(issued.jwt, {
      allowedAlgs: ['ES256K'],
      didResolver: resolverFor(keys.publicJwk)
    })
    assert.strictEqual(res.valid, false)
    assert.ok(/Algorithm not allowed/.test(res.error), res.error)
  })

  it('rejects when the resolved key curve does not match the algorithm', async function () {
    // ES256 token, but the JWKS serves a secp256k1 key under the same kid.
    var p256 = genKeys('ES256', 'prime256v1')
    var k1 = genKeys('ES256K', 'secp256k1')
    var issued = await vcjwt.issueVcJwt({
      issuerDid: 'did:web:example.com', subjectId: 's', credentialSubject: {}, privateJwk: p256.privateJwk, alg: 'ES256'
    })
    var res = await vcjwt.verifyVcJwt(issued.jwt, { didResolver: resolverFor(k1.publicJwk) })
    assert.strictEqual(res.valid, false)
    assert.ok(/curve does not match/.test(res.error), res.error)
  })

  it('refuses to sign when the key curve does not match the algorithm', async function () {
    var k1 = genKeys('ES256K', 'secp256k1')
    var threw = false
    try {
      await vcjwt.issueVcJwt({
        issuerDid: 'did:web:example.com', subjectId: 's', credentialSubject: {}, privateJwk: k1.privateJwk, alg: 'ES256'
      })
    } catch (e) {
      threw = /does not match alg/.test(e.message)
    }
    assert.ok(threw, 'expected curve/alg mismatch to throw')
  })

  it('accepts a legacy DER-encoded token only when allowLegacyDER is set', async function () {
    // Simulate a <=4.6.0 token: same signing input, but DER-encoded signature.
    var keys = genKeys('ES256', 'prime256v1')
    var header = { alg: 'ES256', typ: 'JWT', kid: keys.publicJwk.kid }
    var payload = { iss: 'did:web:example.com', sub: 's', iat: 1700000000, exp: 4102444800, vc: {} }
    var headerB64 = vcjwt.base64UrlEncode(Buffer.from(JSON.stringify(header)))
    var payloadB64 = vcjwt.base64UrlEncode(Buffer.from(JSON.stringify(payload)))
    var signingInput = headerB64 + '.' + payloadB64
    var derSig = crypto.sign('sha256', Buffer.from(signingInput), {
      key: crypto.createPrivateKey({ key: keys.privateJwk, format: 'jwk' }),
      dsaEncoding: 'der'
    })
    var legacyJwt = signingInput + '.' + vcjwt.base64UrlEncode(derSig)

    var rejected = await vcjwt.verifyVcJwt(legacyJwt, { didResolver: resolverFor(keys.publicJwk) })
    assert.strictEqual(rejected.valid, false, 'legacy DER token must fail by default')

    var accepted = await vcjwt.verifyVcJwt(legacyJwt, {
      allowLegacyDER: true,
      didResolver: resolverFor(keys.publicJwk)
    })
    assert.strictEqual(accepted.valid, true, accepted.error)
  })
})
