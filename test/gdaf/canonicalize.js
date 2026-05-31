'use strict'

/* global describe, it */

var expect = require('chai').expect
var bsv = require('../../')
var AttestationSigner = require('../../lib/gdaf/attestation-signer')
var AttestationVerifier = require('../../lib/gdaf/attestation-verifier')

// A stable test key (do NOT use in production / do not fund this address).
var TEST_WIF = 'KxRd1XXYZYuQc7uDdLN418Ds3NCxRLghQrcYecPPcB6ka5Z5dNZT'
var VICTIM_WIF = 'L5EBpijRWptdvC7gfTRGfTuEBwLKQvPgqgSvn4Bi4ps5CqxLP7ow'

function baseCredential () {
  return {
    '@context': ['https://www.w3.org/2018/credentials/v1'],
    id: 'urn:uuid:00000000-0000-0000-0000-000000000001',
    type: ['VerifiableCredential', 'UniversityDegreeCredential'],
    issuer: 'did:smartledger:placeholder',
    issuanceDate: '2025-01-01T00:00:00.000Z',
    credentialSubject: {
      id: 'did:smartledger:subject',
      degree: { type: 'BachelorDegree', name: 'Bachelor of Science' },
      gpa: '2.0'
    }
  }
}

describe('GDAF canonicalization', function () {
  describe('_canonicalizeJSON', function () {
    it('includes nested object keys in the serialization', function () {
      var canonical = AttestationSigner._canonicalizeJSON(baseCredential())
      // Regression guard for the replacer-array bug: credentialSubject MUST NOT
      // collapse to "{}", and the nested claims must appear in the output.
      expect(canonical).to.not.contain('"credentialSubject":{}')
      expect(canonical).to.contain('Bachelor of Science')
      expect(canonical).to.contain('"gpa":"2.0"')
    })

    it('is independent of input key order', function () {
      var a = { issuer: 'did:x', credentialSubject: { gpa: '4.0', degree: 'PhD' } }
      var b = { credentialSubject: { degree: 'PhD', gpa: '4.0' }, issuer: 'did:x' }
      expect(AttestationSigner._canonicalizeJSON(a))
        .to.equal(AttestationSigner._canonicalizeJSON(b))
    })

    it('preserves array order (arrays are order-significant)', function () {
      var a = AttestationSigner._canonicalizeJSON({ type: ['A', 'B'] })
      var b = AttestationSigner._canonicalizeJSON({ type: ['B', 'A'] })
      expect(a).to.not.equal(b)
    })

    it('produces a different hash when a nested claim is tampered', function () {
      var original = baseCredential()
      var tampered = JSON.parse(JSON.stringify(original))
      tampered.credentialSubject.degree.name = 'Doctor of Philosophy'
      tampered.credentialSubject.gpa = '4.0'

      var h1 = AttestationSigner._hashCredential(original).toString('hex')
      var h2 = AttestationSigner._hashCredential(tampered).toString('hex')
      expect(h1).to.not.equal(h2)
    })
  })

  describe('sign / verify round-trip', function () {
    it('verifies an untampered credential', async function () {
      var signer = AttestationSigner(bsv.PrivateKey.fromWIF(TEST_WIF))
      var credential = signer.createCredential({
        id: 'did:smartledger:subject',
        degree: { type: 'BachelorDegree', name: 'Bachelor of Science' },
        gpa: '2.0'
      }, { type: 'UniversityDegreeCredential' })

      var signed = signer.signCredential(credential)
      var result = await AttestationVerifier.verifyCredential(signed)
      expect(result.checks.signature).to.equal(true)
    })

    it('rejects an issuer-spoofed credential (signer DID != issuer)', async function () {
      // Attacker signs with their own key but claims a different issuer.
      var attacker = AttestationSigner(bsv.PrivateKey.fromWIF(TEST_WIF))
      var credential = attacker.createCredential({
        id: 'did:smartledger:subject',
        degree: { type: 'BachelorDegree', name: 'Bachelor of Science' }
      }, { type: 'UniversityDegreeCredential' })

      // A different "trusted authority" the attacker wants to impersonate.
      var victim = AttestationSigner(bsv.PrivateKey.fromWIF(VICTIM_WIF))
      expect(victim.did).to.not.equal(attacker.did)

      var signed = attacker.signCredential(credential)
      // Forge the issuer field. The proof (verificationMethod) still points at
      // the attacker's DID, but the credential now claims the victim issued it.
      signed.issuer = victim.did

      var result = await AttestationVerifier.verifyCredential(signed)
      expect(result.checks.signature).to.equal(false)
      expect(result.valid).to.equal(false)
    })

    it('enforces the trustedIssuers allow-list (rejects untrusted issuer)', async function () {
      var signer = AttestationSigner(bsv.PrivateKey.fromWIF(TEST_WIF))
      var signed = signer.signCredential(signer.createCredential(
        { id: 'did:smartledger:subject', degree: 'BSc' },
        { type: 'UniversityDegreeCredential' }
      ))

      // Allow-list contains a different DID than the actual issuer.
      var other = AttestationSigner(bsv.PrivateKey.fromWIF(VICTIM_WIF))
      var rejected = await AttestationVerifier.verifyCredential(signed, {
        trustedIssuers: [other.did]
      })
      expect(rejected.checks.issuer).to.equal(false)
      expect(rejected.valid).to.equal(false)

      // Same credential passes when its issuer IS on the allow-list.
      var accepted = await AttestationVerifier.verifyCredential(signed, {
        trustedIssuers: [signer.did]
      })
      expect(accepted.checks.issuer).to.equal(true)
    })

    it('rejects a credential whose nested claims were tampered after signing', async function () {
      var signer = AttestationSigner(bsv.PrivateKey.fromWIF(TEST_WIF))
      var credential = signer.createCredential({
        id: 'did:smartledger:subject',
        degree: { type: 'BachelorDegree', name: 'Bachelor of Science' },
        gpa: '2.0'
      }, { type: 'UniversityDegreeCredential' })

      var signed = signer.signCredential(credential)
      // Forge the subject's claims while keeping the original signature/proof.
      signed.credentialSubject.degree.name = 'Doctor of Philosophy'
      signed.credentialSubject.gpa = '4.0'

      var result = await AttestationVerifier.verifyCredential(signed)
      expect(result.checks.signature).to.equal(false)
    })
  })
})
