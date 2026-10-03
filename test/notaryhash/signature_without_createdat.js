'use strict'

/* global describe, it, before */

// `NotaryHash.verifySignature` answered `false` for a certificate with no `createdAt`.
//
// It derived its inputs from `Certificate.toProofInput`, which also decodes `createdAt`
// because the proofHash commits to it. The signature does not. So `toUnixSeconds(undefined)`
// threw, the try/catch turned that into `false`, and a caller was told the signature did not
// match its payloadHash and public key — which is what a function of that name means, and
// which sends the reader to their key, their digest convention or their endian handling.
//
// Reported by a downstream ordinals mint that verifies a submitted signature BEFORE spending
// anything to anchor it. At that moment there is no certificate, so there is no createdAt, so
// every valid submission was being rejected. 9.3.0 answered `true` for all of these.
//
// Certificate completeness is unaffected: `validateShape` lists every missing required field
// by name and `NotaryHash.verify` runs it first, returning before the signature check.

require('chai').should()
const bsv = require('../..')
const NotaryHash = bsv.NotaryHash
const Certificate = NotaryHash.Certificate

describe('a signature check does not depend on certificate metadata', function () {
  let base, payloadHash, otherHash, raw, key, otherKey

  before(function () {
    key = bsv.PrivateKey.fromString('11'.repeat(32))
    otherKey = bsv.PrivateKey.fromString('22'.repeat(32))
    payloadHash = bsv.crypto.Hash.sha256(Buffer.from('a document'))
    otherHash = bsv.crypto.Hash.sha256(Buffer.from('a different document'))
    const sig = bsv.crypto.ECDSA.sign(payloadHash, key)
    raw = Buffer.concat([sig.r.toBuffer({ size: 32 }), sig.s.toBuffer({ size: 32 })])
    base = {
      protocol: 'NotaryHash',
      version: 1,
      mode: 0,
      algorithm: 'ECDSA-secp256k1',
      hashAlgorithm: 'sha256',
      payloadHash: payloadHash.toString('hex'),
      publicKey: key.toPublicKey().toBuffer().toString('hex'),
      signature: raw.toString('hex'),
      encoding: 'raw'
    }
  })

  function cert (extra) { return Object.assign({}, base, extra) }

  describe('the fields the signature does not cover', function () {
    it('verifies with no createdAt', function () {
      NotaryHash.verifySignature(cert()).should.equal(true)
    })

    it('verifies with createdAt, unchanged', function () {
      NotaryHash.verifySignature(cert({ createdAt: '2026-10-03T00:00:00.000Z' })).should.equal(true)
    })

    it('verifies with an anchor and no createdAt', function () {
      NotaryHash.verifySignature(cert({ anchor: { txid: 'ab'.repeat(32) } })).should.equal(true)
    })

    it('verifies with an empty anchor', function () {
      NotaryHash.verifySignature(cert({ anchor: {} })).should.equal(true)
    })
  })

  describe('and still refuses everything it should', function () {
    it('a signature over a different digest', function () {
      NotaryHash.verifySignature(cert({ payloadHash: otherHash.toString('hex') })).should.equal(false)
    })

    it('a different public key', function () {
      const pub = otherKey.toPublicKey().toBuffer().toString('hex')
      NotaryHash.verifySignature(cert({ publicKey: pub })).should.equal(false)
    })

    it('a flipped signature byte', function () {
      const flipped = Buffer.from(raw)
      flipped[0] = flipped[0] ^ 0xff
      NotaryHash.verifySignature(cert({ signature: flipped.toString('hex') })).should.equal(false)
    })

    it('a truncated signature', function () {
      NotaryHash.verifySignature(cert({ signature: raw.slice(0, 32).toString('hex') })).should.equal(false)
    })

    it('a certificate with no signature, publicKey or payloadHash at all', function () {
      for (const field of ['signature', 'publicKey', 'payloadHash']) {
        const c = cert()
        delete c[field]
        NotaryHash.verifySignature(c).should.equal(false)
      }
    })
  })

  describe('completeness is still reported, by the function whose job it is', function () {
    it('validateShape names the missing createdAt', function () {
      const problems = Certificate.validateShape(Certificate.normalize(cert()))
      problems.join(' ').should.contain('createdAt')
    })

    it('and the proofHash check still needs it', function () {
      // toProofInput keeps createdAt, because the proofHash commits to it.
      Certificate.proofHashMatches(cert()).should.equal(false)
    })

    it('toSignatureInput returns only the fields the signature uses', function () {
      const f = Certificate.toSignatureInput(cert())
      Object.keys(f).sort().should.deep.equal(
        ['algorithm', 'hashAlgorithm', 'payloadHash', 'publicKey', 'signature'])
    })
  })

  describe('verifySignatureOnly takes no certificate at all', function () {
    const pub = () => key.toPublicKey().toBuffer()

    it('accepts Buffers', function () {
      NotaryHash.verifySignatureOnly(payloadHash, raw, pub()).should.equal(true)
    })

    it('accepts hex', function () {
      NotaryHash.verifySignatureOnly(payloadHash.toString('hex'), raw.toString('hex'),
        pub().toString('hex')).should.equal(true)
    })

    it('returns false for a real mismatch', function () {
      NotaryHash.verifySignatureOnly(otherHash, raw, pub()).should.equal(false)
    })

    it('THROWS rather than returning false when it cannot decode the input', function () {
      // The whole point: a boolean that means both "does not match" and "your hex was
      // malformed" is the ambiguity this entry point exists to remove.
      ;(function () { NotaryHash.verifySignatureOnly('zzzz', raw, pub()) }).should.throw(/hex/)
      ;(function () { NotaryHash.verifySignatureOnly(Buffer.alloc(0), raw, pub()) }).should.throw(/empty/)
      ;(function () { NotaryHash.verifySignatureOnly(null, raw, pub()) }).should.throw()
    })
  })
})
