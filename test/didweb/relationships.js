'use strict'

/* global describe, it */

// DID Core defines the verification relationships to be DISTINCT. `authentication`
// proves who you are right now; `assertionMethod` makes a claim that outlives the
// session. Keeping them apart is what stops a low-friction login signature from being
// redeemed as a signed statement.
//
// This module used to cross-list every key into both, and `rotateIssuerKey` rewrote both
// regardless of which one was being rotated — so replacing a compromised authentication
// key invalidated every statement the issuer had ever signed.

require('chai').should()
var didweb = require('../../lib/didweb')

var DOMAIN = 'example.com'
var DID = 'did:web:example.com'
var P256 = { kid: 'auth-1', jwk: { kty: 'EC', crv: 'P-256', x: 'a', y: 'b' } }
var K1 = { kid: 'sign-1', jwk: { kty: 'EC', crv: 'secp256k1', x: 'c', y: 'd' } }

function scoped (key, rels) {
  return { kid: key.kid, jwk: key.jwk, relationships: rels }
}

describe('did:web verification relationships', function () {
  describe('buildDidWebDocuments', function () {
    // The compatibility guarantee: callers that never heard of `relationships` must get
    // byte-identical documents, including key order.
    it('keeps the previous output when no relationships are given', function () {
      var doc = didweb.buildDidWebDocuments({ domain: DOMAIN, p256: P256, k1: K1 }).didDocument
      doc.authentication.should.deep.equal([DID + '#auth-1', DID + '#sign-1'])
      doc.assertionMethod.should.deep.equal([DID + '#auth-1', DID + '#sign-1'])
      Object.keys(doc).should.deep.equal([
        '@context', 'id', 'verificationMethod', 'authentication', 'assertionMethod'
      ])
    })

    it('scopes each key to the relationships it was given', function () {
      var doc = didweb.buildDidWebDocuments({
        domain: DOMAIN,
        p256: scoped(P256, ['authentication']),
        k1: scoped(K1, ['assertionMethod'])
      }).didDocument
      doc.authentication.should.deep.equal([DID + '#auth-1'])
      doc.assertionMethod.should.deep.equal([DID + '#sign-1'])
    })

    it('supports the other three relationships and omits empty ones', function () {
      var doc = didweb.buildDidWebDocuments({
        domain: DOMAIN,
        p256: scoped(P256, ['keyAgreement', 'capabilityInvocation', 'capabilityDelegation'])
      }).didDocument
      doc.keyAgreement.should.deep.equal([DID + '#auth-1'])
      doc.capabilityInvocation.should.deep.equal([DID + '#auth-1'])
      doc.capabilityDelegation.should.deep.equal([DID + '#auth-1'])
      ;(doc.authentication === undefined).should.equal(true)
      ;(doc.assertionMethod === undefined).should.equal(true)
    })

    it('rejects an unknown relationship rather than silently dropping it', function () {
      ;(function () {
        didweb.buildDidWebDocuments({ domain: DOMAIN, p256: scoped(P256, ['notARelationship']) })
      }).should.throw(/unknown verification relationship/)
    })

    it('rejects an empty relationship list', function () {
      ;(function () {
        didweb.buildDidWebDocuments({ domain: DOMAIN, p256: scoped(P256, []) })
      }).should.throw(/non-empty array/)
    })
  })

  describe('rotateIssuerKey', function () {
    function currentDoc () {
      return didweb.buildDidWebDocuments({
        domain: DOMAIN,
        p256: scoped(P256, ['authentication']),
        k1: scoped(K1, ['assertionMethod'])
      }).didDocument
    }

    // The reported failure. Rotating a compromised auth key must not touch
    // assertionMethod, or every seal the issuer ever made stops verifying.
    it('leaves assertionMethod intact when only authentication is rotated', function () {
      var before = currentDoc()
      var after = didweb.rotateIssuerKey({
        domain: DOMAIN,
        newKey: { kid: 'auth-2', jwk: { kty: 'EC', crv: 'P-256', x: 'e', y: 'f' }, relationships: ['authentication'] },
        currentDocument: before
      }).didDocument

      after.authentication.should.deep.equal([DID + '#auth-2'])
      after.assertionMethod.should.deep.equal(before.assertionMethod)
    })

    it('still defines the key that the carried-over relationship points at', function () {
      var after = didweb.rotateIssuerKey({
        domain: DOMAIN,
        newKey: { kid: 'auth-2', jwk: { kty: 'EC' }, relationships: ['authentication'] },
        currentDocument: currentDoc()
      }).didDocument

      var defined = after.verificationMethod.map(function (vm) { return vm.id })
      // Every referenced id resolves — no dangling references.
      Object.keys(after).forEach(function (k) {
        if (Array.isArray(after[k]) && k !== 'verificationMethod' && k !== '@context') {
          after[k].forEach(function (id) { defined.indexOf(id).should.be.above(-1, k + ' references undefined ' + id) })
        }
      })
    })

    it('drops the rotated-out key, which nothing references any more', function () {
      var after = didweb.rotateIssuerKey({
        domain: DOMAIN,
        newKey: { kid: 'auth-2', jwk: { kty: 'EC' }, relationships: ['authentication'] },
        currentDocument: currentDoc()
      }).didDocument
      after.verificationMethod.some(function (vm) {
        return vm.id === DID + '#auth-1'
      }).should.equal(false)
    })

    it('keeps the previous behaviour with no currentDocument', function () {
      var doc = didweb.rotateIssuerKey({
        domain: DOMAIN, newKey: { kid: 'k9', jwk: { kty: 'EC' } }
      }).didDocument
      doc.authentication.should.deep.equal([DID + '#k9'])
      doc.assertionMethod.should.deep.equal([DID + '#k9'])
      doc.verificationMethod.length.should.equal(1)
      Object.keys(doc).should.deep.equal([
        '@context', 'id', 'verificationMethod', 'authentication', 'assertionMethod', 'rotationInfo'
      ])
    })

    it('still reports rotationInfo', function () {
      var doc = didweb.rotateIssuerKey({
        domain: DOMAIN, newKey: { kid: 'k9', jwk: { kty: 'EC' } }, keepOldForDays: 7
      }).didDocument
      doc.rotationInfo.gracePeriodDays.should.equal(7)
      doc.rotationInfo.rotatedAt.should.be.a('string')
    })
  })
})
