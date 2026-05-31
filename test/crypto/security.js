'use strict'

/* global describe, it, before */

require('chai').should()
var expect = require('chai').expect

var bsv = require('../../index.js')
var BN = bsv.crypto.BN
var ECDSA = bsv.crypto.ECDSA
var Hash = bsv.crypto.Hash
var Point = bsv.crypto.Point
var Signature = bsv.crypto.Signature
var SmartVerify = bsv.SmartVerify

describe('SmartLedger Security Patches', function () {
  var privateKey, publicKey, message, hash

  before(function () {
    privateKey = new bsv.PrivateKey()
    publicKey = privateKey.toPublicKey()
    message = 'SmartLedger security test message'
    hash = Hash.sha256(Buffer.from(message))
  })

  describe('Zero Parameter Attack Protection', function () {
    it('Signature.validate() throws when r = 0', function () {
      var sig = new Signature({ r: new BN(0), s: new BN(1) })
      expect(function () { sig.validate() }).to.throw(/r component is zero/)
    })

    it('Signature.validate() throws when s = 0', function () {
      var sig = new Signature({ r: new BN(1), s: new BN(0) })
      expect(function () { sig.validate() }).to.throw(/s component is zero/)
    })

    it('smartVerify rejects (without throwing) a zero-s signature', function () {
      var sig = new Signature({ r: new BN(1), s: new BN(0) })
      SmartVerify.smartVerify(hash, sig, publicKey).should.equal(false)
    })
  })

  describe('Canonical Signature Enforcement', function () {
    it('freshly produced signatures are canonical (low-S)', function () {
      var sig = ECDSA.sign(hash, privateKey)
      sig.isCanonical().should.equal(true)
      SmartVerify.isCanonical(sig).should.equal(true)
    })

    it('detects a non-canonical (high-S) signature', function () {
      var sig = ECDSA.sign(hash, privateKey)
      var n = Point.getN()
      var lowS = sig.s.lte(n.shrn(1)) ? sig.s : n.sub(sig.s)
      var highS = new Signature({ r: sig.r, s: n.sub(lowS) })

      highS.isCanonical().should.equal(false)
      SmartVerify.isCanonical(highS).should.equal(false)
    })

    it('toCanonical() converts a high-S signature to canonical form', function () {
      var sig = ECDSA.sign(hash, privateKey)
      var n = Point.getN()
      var lowS = sig.s.lte(n.shrn(1)) ? sig.s : n.sub(sig.s)
      var highS = new Signature({ r: sig.r, s: n.sub(lowS) })

      var canonical = highS.toCanonical()
      canonical.isCanonical().should.equal(true)
      // Both forms verify (ECDSA is malleable in s); canonicalization does not
      // change which key/message the signature is valid for.
      canonical.r.cmp(highS.r).should.equal(0)
    })
  })

  describe('SmartVerify Enhanced Validation', function () {
    it('accepts a valid signature', function () {
      var sig = ECDSA.sign(hash, privateKey)
      SmartVerify.smartVerify(hash, sig, publicKey).should.equal(true)
    })

    it('accepts a malleated (high-S) signature as valid but canonicalizes it', function () {
      var sig = ECDSA.sign(hash, privateKey)
      var n = Point.getN()
      var lowS = sig.s.lte(n.shrn(1)) ? sig.s : n.sub(sig.s)
      var highS = new Signature({ r: sig.r, s: n.sub(lowS) })
      SmartVerify.smartVerify(hash, highS, publicKey).should.equal(true)
    })

    it('throws on an invalid (non-32-byte) message hash', function () {
      var sig = ECDSA.sign(hash, privateKey)
      var shortHash = Buffer.alloc(16)
      expect(function () {
        SmartVerify.smartVerify(shortHash, sig, publicKey)
      }).to.throw(/32-byte/)
    })

    it('rejects a signature from the wrong key', function () {
      var sig = ECDSA.sign(hash, privateKey)
      var otherPub = new bsv.PrivateKey().toPublicKey()
      SmartVerify.smartVerify(hash, sig, otherPub).should.equal(false)
    })
  })

  describe('Integration with Original BSV', function () {
    it('round-trips a Bitcoin message signature', function () {
      var sig = new bsv.Message(message).sign(privateKey)
      var verified = new bsv.Message(message).verify(publicKey.toAddress().toString(), sig)
      verified.should.equal(true)
    })

    it('signs a transaction to completion', function () {
      var utxo = {
        txId: 'a'.repeat(64),
        outputIndex: 0,
        address: privateKey.toAddress().toString(),
        script: bsv.Script.buildPublicKeyHashOut(privateKey.toAddress()).toHex(),
        satoshis: 100000
      }

      var transaction = new bsv.Transaction()
        .from(utxo)
        .to(privateKey.toAddress(), 50000)
        .sign(privateKey)

      transaction.isFullySigned().should.equal(true)
    })
  })
})
