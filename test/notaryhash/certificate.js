'use strict'

/* global describe, it */

// BRC-220 certificate. This is validity check 2 of the three the spec requires — proof
// integrity — plus the object a verifier is actually handed.
//
// The tests below concentrate on three things the spec makes explicit and that would fail
// silently if got wrong: the certificate carries FULL blobs even when the chain carries
// digests; the SPV envelope never disturbs proofHash; and proofHash is over the binary
// proof bytes, NOT over the certificate JSON.

require('chai').should()
var Certificate = require('../../lib/notaryhash/certificate')
var Encoding = require('../../lib/notaryhash/encoding')
var NS = require('../../lib/notaryhash/script')
var Hash = require('../../lib/crypto/hash')
var JCS = require('../../lib/util/jcs')

var PARAMS = {
  mode: NS.MODE.FULL,
  algorithm: 'ECDSA-secp256k1',
  hashAlgorithm: 'SHA-256',
  payloadHash: Buffer.alloc(32, 0x11),
  publicKey: Buffer.alloc(33, 0x02),
  signature: Buffer.alloc(64, 0x30),
  createdAt: '2026-08-16T00:00:00.000Z',
  anchor: { txid: 'ab'.repeat(32), blockHeight: 800000 }
}

var SPV = {
  rawTx: 'deadbeef',
  blockHash: 'cc'.repeat(32),
  blockHeight: 800000,
  merkleProof: { index: 0, nodes: ['aa'.repeat(32), '*'] }
}

describe('BRC-220 certificate', function () {
  describe('build', function () {
    it('carries every field the spec requires', function () {
      var cert = Certificate.build(PARAMS)
      Certificate.REQUIRED_FIELDS.forEach(function (field) {
        ;(cert[field] === undefined).should.equal(false, 'missing ' + field)
      })
    })

    it('defaults encoding to raw', function () {
      Certificate.build(PARAMS).encoding.should.equal('raw')
    })

    it('accepts der for Bitcoin-native signers', function () {
      Certificate.build(Object.assign({}, PARAMS, { encoding: 'der' })).encoding.should.equal('der')
    })

    it('rejects an unknown encoding rather than passing it through', function () {
      ;(function () {
        Certificate.build(Object.assign({}, PARAMS, { encoding: 'base64' }))
      }).should.throw(/encoding must be/)
    })

    it('hex-encodes the byte fields', function () {
      var cert = Certificate.build(PARAMS)
      cert.payloadHash.should.equal(PARAMS.payloadHash.toString('hex'))
      cert.publicKey.should.equal(PARAMS.publicKey.toString('hex'))
      cert.signature.should.equal(PARAMS.signature.toString('hex'))
    })

    // proofHash is computed, never accepted. A caller cannot hand in a value that
    // disagrees with the fields beside it — which is precisely the artefact this protocol
    // exists to make impossible.
    it('computes proofHash rather than accepting one', function () {
      var cert = Certificate.build(Object.assign({}, PARAMS, { proofHash: 'ff'.repeat(32) }))
      cert.proofHash.should.not.equal('ff'.repeat(32))
      Certificate.proofHashMatches(cert).should.equal(true)
    })

    it('requires a merkle proof for batch mode', function () {
      ;(function () {
        Certificate.build(Object.assign({}, PARAMS, { mode: NS.MODE.BATCH }))
      }).should.throw(/merkle/)
    })

    it('carries the merkle proof when batched', function () {
      var cert = Certificate.build(Object.assign({}, PARAMS, {
        mode: NS.MODE.BATCH,
        merkle: { root: 'aa'.repeat(32), leafIndex: 2, leafCount: 8, path: [] }
      }))
      cert.merkle.leafIndex.should.equal(2)
      cert.merkle.leafCount.should.equal(8)
    })

    // Hybrid puts only digests on chain; the certificate keeps the originals. That
    // asymmetry is the whole point of the mode.
    it('keeps the FULL key and signature in hybrid mode', function () {
      var cert = Certificate.build(Object.assign({}, PARAMS, { mode: NS.MODE.HYBRID }))
      cert.publicKey.should.equal(PARAMS.publicKey.toString('hex'))
      cert.signature.should.equal(PARAMS.signature.toString('hex'))
      // What goes on chain is the digest of each — different values entirely.
      var onChain = NS.parse(NS.build(Object.assign({}, PARAMS, { mode: NS.MODE.HYBRID, proofHash: Buffer.alloc(32) })))
      onChain.publicKeyHash.toString('hex').should.equal(Hash.sha256(PARAMS.publicKey).toString('hex'))
      onChain.publicKeyHash.toString('hex').should.not.equal(cert.publicKey)
    })
  })

  describe('proof integrity (validity check 2)', function () {
    it('matches for a well-formed certificate', function () {
      Certificate.proofHashMatches(Certificate.build(PARAMS)).should.equal(true)
    })

    // Each field is inside the canonical proof bytes, so tampering with any of them must
    // be detected. This is the certificate-level counterpart of the encoding module's
    // coverage test.
    it('detects tampering with any covered field', function () {
      var cert = Certificate.build(PARAMS)
      var tampers = {
        algorithm: 'ML-DSA-65',
        hashAlgorithm: 'SHA-512',
        payloadHash: 'ff'.repeat(32),
        publicKey: '03' + '11'.repeat(32),
        signature: 'aa'.repeat(64),
        createdAt: '2026-08-17T00:00:00.000Z'
      }
      Object.keys(tampers).forEach(function (field) {
        var bad = Object.assign({}, cert)
        bad[field] = tampers[field]
        Certificate.proofHashMatches(bad)
          .should.equal(false, 'tampering with ' + field + ' was not detected')
      })
    })

    // Fields NOT in the canonical proof bytes must not affect it — otherwise the SPV
    // envelope could not be additive.
    it('is unaffected by fields outside the canonical bytes', function () {
      var cert = Certificate.build(PARAMS)
      var moved = Object.assign({}, cert, {
        anchor: { txid: 'ff'.repeat(32), blockHeight: 999999 },
        mode: NS.MODE.HYBRID
      })
      Certificate.proofHashMatches(moved).should.equal(true)
    })

    it('returns a strict boolean, never a truthy object', function () {
      Certificate.proofHashMatches(Certificate.build(PARAMS)).should.be.a('boolean')
      Certificate.proofHashMatches(null).should.equal(false)
      Certificate.proofHashMatches({}).should.equal(false)
      Certificate.proofHashMatches({ proofHash: 'nonsense' }).should.equal(false)
    })

    // The hex fields decode to bytes before hashing. Hashing the strings would be twice
    // as many bytes and produce something that still looks like a hash.
    it('hashes the decoded bytes, not the hex strings', function () {
      var cert = Certificate.build(PARAMS)
      var overHex = Hash.sha256(Encoding.canonicalBytes({
        algorithm: cert.algorithm,
        hashAlgorithm: cert.hashAlgorithm,
        payloadHash: Buffer.from(cert.payloadHash, 'utf8'), // the STRING, wrongly
        publicKey: Buffer.from(cert.publicKey, 'hex'),
        signature: Buffer.from(cert.signature, 'hex'),
        createdAtUnix: Encoding.toUnixSeconds(cert.createdAt)
      })).toString('hex')
      overHex.should.not.equal(cert.proofHash)
    })
  })

  describe('SPV envelope', function () {
    // The spec's explicit guarantee. If it ever broke, every previously issued
    // certificate would become unverifiable.
    it('never changes proofHash', function () {
      var cert = Certificate.build(PARAMS)
      var withSPV = Certificate.attachSPV(cert, SPV)
      withSPV.proofHash.should.equal(cert.proofHash)
      Certificate.proofHashMatches(withSPV).should.equal(true)
    })

    it('does not mutate the certificate it was given', function () {
      var cert = Certificate.build(PARAMS)
      Certificate.attachSPV(cert, SPV)
      ;(cert.spv === undefined).should.equal(true)
    })

    it('defaults format to TSC', function () {
      Certificate.attachSPV(Certificate.build(PARAMS), SPV).spv.format.should.equal('TSC')
    })

    it('keeps an explicit format, for BUMP or BEEF', function () {
      var withSPV = Certificate.attachSPV(Certificate.build(PARAMS),
        Object.assign({}, SPV, { format: 'BUMP' }))
      withSPV.spv.format.should.equal('BUMP')
    })
  })

  describe('validateShape', function () {
    it('passes a well-formed certificate', function () {
      Certificate.validateShape(Certificate.build(PARAMS)).should.deep.equal([])
    })

    it('names every missing required field', function () {
      var problems = Certificate.validateShape({})
      problems.length.should.equal(Certificate.REQUIRED_FIELDS.length)
      problems[0].should.match(/missing required field/)
    })

    it('rejects a foreign protocol or version', function () {
      var cert = Certificate.build(PARAMS)
      Certificate.validateShape(Object.assign({}, cert, { protocol: 'Other' }))
        .should.include('protocol must be "NotaryHash"')
      Certificate.validateShape(Object.assign({}, cert, { version: 2 }))
        .should.include('unsupported version: 2')
    })

    it('rejects a hash field of the wrong length or that is not hex', function () {
      var cert = Certificate.build(PARAMS)
      Certificate.validateShape(Object.assign({}, cert, { payloadHash: 'ab' }))
        .should.include('payloadHash must be 32 bytes (64 hex chars)')
      Certificate.validateShape(Object.assign({}, cert, { proofHash: 'zz'.repeat(32) }))
        .should.include('proofHash must be a hex string')
    })

    // Shape is not verification, and a test says so — otherwise it gets used as one.
    it('says nothing about whether the proofHash is correct', function () {
      var cert = Certificate.build(PARAMS)
      var lying = Object.assign({}, cert, { proofHash: '00'.repeat(32) })
      Certificate.validateShape(lying).should.deep.equal([])
      Certificate.proofHashMatches(lying).should.equal(false)
    })
  })

  describe('canonicalize', function () {
    it('is RFC 8785 over the certificate', function () {
      var cert = Certificate.build(PARAMS)
      Certificate.canonicalize(cert).should.equal(JCS.stringify(cert))
    })

    it('sorts keys, so transport order does not matter', function () {
      var cert = Certificate.build(PARAMS)
      var reordered = {}
      Object.keys(cert).reverse().forEach(function (k) { reordered[k] = cert[k] })
      Certificate.canonicalize(reordered).should.equal(Certificate.canonicalize(cert))
    })

    // proofHash is over the length-prefixed BINARY proof bytes, not over this JSON.
    // Confusing the two produces a value that looks like a proofHash and is not one.
    it('is not what proofHash is computed over', function () {
      var cert = Certificate.build(PARAMS)
      Hash.sha256(Buffer.from(Certificate.canonicalize(cert), 'utf8')).toString('hex')
        .should.not.equal(cert.proofHash)
    })
  })
})
