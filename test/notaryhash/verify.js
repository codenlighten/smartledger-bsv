'use strict'

/* global describe, it, before */

// BRC-220 verification: the three checks the spec requires, wired together.
//
// The plan's stance is that each check must have a test that defeats it IN ISOLATION —
// a suite where only the conjunction is tested cannot tell you that check 3 was never
// wired up, because checks 1 and 2 carry the verdict. Each of the three below is broken
// on its own with the others left intact.

require('chai').should()
var bsv = require('../..')
var NH = require('../../lib/notaryhash')
var Encoding = require('../../lib/notaryhash/encoding')
var Hash = require('../../lib/crypto/hash')
var BN = require('../../lib/crypto/bn')

// The Bitcoin genesis coinbase — one of the reference vectors the spec names, and the
// only check here that is external to this implementation.
var GENESIS_COINBASE_RAWTX =
  '01000000010000000000000000000000000000000000000000000000000000000000000000ffffffff' +
  '4d04ffff001d0104455468652054696d65732030332f4a616e2f32303039204368616e63656c6c6f72' +
  '206f6e206272696e6b206f66207365636f6e64206261696c6f757420666f722062616e6b73ffffffff' +
  '0100f2052a01000000434104678afdb0fe5548271967f1a67130b7105cd6a828e03909a67962e0ea1f' +
  '61deb649f6bc3f4cef38c4f35504e51ec112de5c384df7ba0b8d578a4c702b6bf11d5fac00000000'
var GENESIS_COINBASE_TXID = '4a5e1e4baab89f3a32518a88c31bc87f618f76673e2cc77ab2127b7afdeda33b'

function rawSig (sig) {
  return Buffer.concat([
    sig.r.toArrayLike(Buffer, 'be', 32),
    sig.s.toArrayLike(Buffer, 'be', 32)
  ])
}

describe('BRC-220 verification', function () {
  var key, publicKey, payloadHash, signature, certificate, header, rawTx

  before(function () {
    key = bsv.PrivateKey.fromRandom()
    publicKey = key.toPublicKey().toBuffer()
    payloadHash = Hash.sha256(Buffer.from('the document nobody sees'))

    // The signer signs the 32-byte payloadHash DIRECTLY — spec §Algorithms.
    var ecdsa = bsv.crypto.ECDSA().set({ hashbuf: payloadHash, endian: 'little', privkey: key })
    ecdsa.sign()
    signature = rawSig(ecdsa.sig)

    var createdAt = '2026-08-16T00:00:00.000Z'
    var proofHash = Encoding.proofHash({
      algorithm: 'ECDSA-secp256k1',
      hashAlgorithm: 'SHA-256',
      payloadHash: payloadHash,
      publicKey: publicKey,
      signature: signature,
      createdAtUnix: Encoding.toUnixSeconds(createdAt)
    })

    // A real transaction carrying the record, so the anchor check has something to read.
    var tx = new bsv.Transaction()
    tx.addOutput(new bsv.Transaction.Output({
      script: NH.Script.build({
        mode: NH.MODE.FULL,
        algorithm: 'ECDSA-secp256k1',
        hashAlgorithm: 'SHA-256',
        payloadHash: payloadHash,
        proofHash: proofHash,
        publicKey: publicKey,
        signature: signature
      }),
      satoshis: 0
    }))
    rawTx = tx.toString()
    var txid = NH.txidFromRawTx(rawTx)

    // A single-transaction block: the Merkle root is the txid itself, so an empty path
    // folds to it. Proof of work is not required for these fixtures.
    header = new bsv.BlockHeader({
      version: 1,
      prevHash: Buffer.alloc(32),
      merkleRoot: Buffer.from(txid, 'hex').reverse(),
      time: 1786838400,
      bits: 0x1d00ffff,
      nonce: 0
    })

    certificate = NH.Certificate.attachSPV(
      NH.Certificate.build({
        mode: NH.MODE.FULL,
        algorithm: 'ECDSA-secp256k1',
        hashAlgorithm: 'SHA-256',
        payloadHash: payloadHash,
        publicKey: publicKey,
        signature: signature,
        createdAt: createdAt,
        anchor: { txid: txid, blockHeight: 800000 }
      }),
      { rawTx: rawTx, blockHash: header.id, blockHeight: 800000, merkleProof: { index: 0, nodes: [] } }
    )
  })

  var OPTS = function () { return { header: header, requirePow: false } }

  describe('the happy path', function () {
    it('passes all three checks', function () {
      var report = NH.verify(certificate, OPTS())
      report.signature.should.equal(true)
      report.proofIntegrity.should.equal(true)
      report.anchor.should.equal(true, JSON.stringify(report.errors))
      report.valid.should.equal(true)
    })

    it('isValid returns a strict boolean', function () {
      NH.isValid(certificate, OPTS()).should.equal(true)
      NH.isValid(certificate, OPTS()).should.be.a('boolean')
    })
  })

  // Each check defeated on its own, with the other two left working.
  describe('check 1 — signature, defeated in isolation', function () {
    it('fails when the signature is forged, while proof integrity still passes', function () {
      var forged = Object.assign({}, certificate, { signature: 'aa'.repeat(64) })
      var report = NH.verify(forged, OPTS())
      report.signature.should.equal(false)
      report.valid.should.equal(false)
    })

    it('fails when the certificate names a key that did not sign', function () {
      var other = bsv.PrivateKey.fromRandom().toPublicKey().toBuffer()
      var swapped = Object.assign({}, certificate, { publicKey: other.toString('hex') })
      NH.verify(swapped, OPTS()).signature.should.equal(false)
    })

    // An unregistered algorithm must FAIL, never fall through to a default. Falling
    // through to ECDSA for an ML-DSA certificate would be catastrophic.
    it('fails for an algorithm no suite is registered for', function () {
      var pq = Object.assign({}, certificate, { algorithm: 'ML-DSA-65' })
      NH.verifySignature(pq).should.equal(false)
      NH.Suites.verify('ML-DSA-65', Buffer.alloc(32), Buffer.alloc(64), Buffer.alloc(33))
        .should.equal(false)
    })
  })

  describe('check 2 — proof integrity, defeated in isolation', function () {
    // The signature still verifies here: payloadHash, signature and publicKey are
    // untouched. Only proofHash is a lie, and only check 2 can see it.
    it('fails when proofHash is replaced, while the signature still verifies', function () {
      var lying = Object.assign({}, certificate, { proofHash: '00'.repeat(32) })
      var report = NH.verify(lying, OPTS())
      report.signature.should.equal(true)
      report.proofIntegrity.should.equal(false)
      report.valid.should.equal(false)
    })

    it('fails when createdAt is moved after issuance', function () {
      var moved = Object.assign({}, certificate, { createdAt: '2026-08-17T00:00:00.000Z' })
      NH.verify(moved, OPTS()).proofIntegrity.should.equal(false)
    })
  })

  describe('check 3 — anchor, defeated in isolation', function () {
    // Signature and proof integrity both still pass; only the anchor is wrong.
    it('fails when rawTx does not hash to anchor.txid', function () {
      var wrongTxid = Object.assign({}, certificate, {
        anchor: { txid: 'ff'.repeat(32), blockHeight: 800000 }
      })
      var report = NH.verify(wrongTxid, OPTS())
      report.signature.should.equal(true)
      report.proofIntegrity.should.equal(true)
      report.anchor.should.equal(false)
      report.errors.should.include('rawTx does not hash to anchor.txid')
    })

    it('fails when the merkle proof does not fold to the header root', function () {
      var otherHeader = new bsv.BlockHeader({
        version: 1,
        prevHash: Buffer.alloc(32),
        merkleRoot: Buffer.alloc(32, 0x77),
        time: 1786838400,
        bits: 0x1d00ffff,
        nonce: 0
      })
      NH.verifyAnchorSPV(certificate, { header: otherHeader, requirePow: false })
        .valid.should.equal(false)
    })

    it('fails when the transaction carries no NotaryHash record', function () {
      var empty = new bsv.Transaction()
      empty.addOutput(new bsv.Transaction.Output({
        script: bsv.Script.buildDataOut('nothing to see'), satoshis: 0
      }))
      var swapped = Object.assign({}, certificate, {
        spv: Object.assign({}, certificate.spv, { rawTx: empty.toString() })
      })
      NH.verifyAnchorSPV(swapped, OPTS()).errors.join(' ').should.match(/no NotaryHash record|does not hash/)
    })

    // THE anchor check. The certificate is internally perfect and the transaction is
    // real; it simply is not the transaction this certificate describes.
    it('fails when the on-chain record describes a different payload', function () {
      var otherPayload = Hash.sha256(Buffer.from('a different document'))
      var tx = new bsv.Transaction()
      tx.addOutput(new bsv.Transaction.Output({
        script: NH.Script.build({
          mode: NH.MODE.FULL,
          algorithm: 'ECDSA-secp256k1',
          hashAlgorithm: 'SHA-256',
          payloadHash: otherPayload,
          proofHash: Buffer.alloc(32, 0x01),
          publicKey: Buffer.from(certificate.publicKey, 'hex'),
          signature: Buffer.from(certificate.signature, 'hex')
        }),
        satoshis: 0
      }))
      var raw = tx.toString()
      var txid = NH.txidFromRawTx(raw)
      var h = new bsv.BlockHeader({
        version: 1,
        prevHash: Buffer.alloc(32),
        merkleRoot: Buffer.from(txid, 'hex').reverse(),
        time: 1786838400,
        bits: 0x1d00ffff,
        nonce: 0
      })
      var mismatched = Object.assign({}, certificate, {
        anchor: { txid: txid, blockHeight: 800000 },
        spv: Object.assign({}, certificate.spv, { rawTx: raw })
      })
      var report = NH.verifyAnchorSPV(mismatched, { header: h, requirePow: false })
      report.valid.should.equal(false)
      report.errors.should.include('on-chain record does not match the certificate')
    })

    // Not supplying a header is not a pass. This is the trust the spec exists to remove.
    it('refuses to pass without a block header', function () {
      var report = NH.verifyAnchorSPV(certificate, {})
      report.valid.should.equal(false)
      report.errors.join(' ').should.match(/block header is required/)
    })

    it('reports a missing SPV envelope rather than ignoring the anchor', function () {
      var noSpv = Object.assign({}, certificate)
      delete noSpv.spv
      NH.verifyAnchorSPV(noSpv, OPTS()).errors.should.include('certificate has no SPV envelope')
    })
  })

  describe('reporting', function () {
    it('names which check failed rather than saying only "invalid"', function () {
      var forged = Object.assign({}, certificate, { signature: 'aa'.repeat(64) })
      NH.verify(forged, OPTS()).errors.should.include('signature does not verify')
    })

    it('reports shape problems before attempting the checks', function () {
      var report = NH.verify({ protocol: 'NotaryHash' }, OPTS())
      report.shape.length.should.be.above(0)
      report.signature.should.equal(false)
      report.valid.should.equal(false)
    })

    // skipAnchor is for offline triage and must never report a valid certificate.
    it('never reports valid when the anchor was skipped', function () {
      var report = NH.verify(certificate, { skipAnchor: true })
      report.signature.should.equal(true)
      report.proofIntegrity.should.equal(true)
      report.valid.should.equal(false)
      report.errors.join(' ').should.match(/NOT verified/)
    })
  })

  describe('txidFromRawTx', function () {
    // External check: the spec names this reference vector, and it is the one assertion
    // here that does not depend on our own construction being right.
    it('matches the Bitcoin genesis coinbase transaction', function () {
      NH.txidFromRawTx(GENESIS_COINBASE_RAWTX).should.equal(GENESIS_COINBASE_TXID)
    })

    it('accepts a Buffer as well as hex', function () {
      NH.txidFromRawTx(Buffer.from(GENESIS_COINBASE_RAWTX, 'hex')).should.equal(GENESIS_COINBASE_TXID)
    })
  })

  describe('suite registry', function () {
    it('registers a caller-supplied suite and uses it', function () {
      var called = false
      NH.registerSuite('TEST-SUITE', {
        verify: function () { called = true; return true }
      })
      NH.Suites.verify('TEST-SUITE', Buffer.alloc(32), Buffer.alloc(8), Buffer.alloc(8))
        .should.equal(true)
      called.should.equal(true)
      NH.Suites.unregister('TEST-SUITE')
    })

    // A suite returning a truthy object must not smuggle a pass through — that is the
    // defect class this codebase has fixed most often.
    it('coerces a truthy non-boolean suite result to false', function () {
      NH.registerSuite('TRUTHY-SUITE', { verify: function () { return { ok: true } } })
      NH.Suites.verify('TRUTHY-SUITE', Buffer.alloc(32), Buffer.alloc(8), Buffer.alloc(8))
        .should.equal(false)
      NH.Suites.unregister('TRUTHY-SUITE')
    })

    it('survives a throwing suite without reporting a pass', function () {
      NH.registerSuite('THROWS', { verify: function () { throw new Error('boom') } })
      NH.Suites.verify('THROWS', Buffer.alloc(32), Buffer.alloc(8), Buffer.alloc(8))
        .should.equal(false)
      NH.Suites.unregister('THROWS')
    })

    it('ships only ECDSA-secp256k1 by default', function () {
      NH.Suites.list().should.deep.equal(['ECDSA-secp256k1'])
    })
  })

  describe('ECDSA suite specifics', function () {
    it('requires low-S, rejecting the malleated form', function () {
      var sig = bsv.crypto.Signature.fromDER(
        new bsv.crypto.Signature(
          BN.fromBuffer(Buffer.from(certificate.signature, 'hex').slice(0, 32)),
          BN.fromBuffer(Buffer.from(certificate.signature, 'hex').slice(32))
        ).toDER()
      )
      var high = Buffer.concat([
        sig.r.toArrayLike(Buffer, 'be', 32),
        bsv.crypto.Point.getN().sub(sig.s).toArrayLike(Buffer, 'be', 32)
      ])
      NH.Suites.verify('ECDSA-secp256k1', payloadHash, high, publicKey).should.equal(false)
    })

    it('accepts DER for the legacy encoding', function () {
      var raw = Buffer.from(certificate.signature, 'hex')
      var der = new bsv.crypto.Signature(
        BN.fromBuffer(raw.slice(0, 32)), BN.fromBuffer(raw.slice(32))
      ).toDER()
      NH.Suites.verify('ECDSA-secp256k1', payloadHash, der, publicKey).should.equal(true)
    })
  })
})
