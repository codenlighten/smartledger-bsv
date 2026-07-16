'use strict'

/* global describe, it */

// FAIL-CLOSED CONTRACTS — a mechanical guard for the operating principle that every
// security-critical verification "returns a bool or throws, never a chainable object"
// and that a forged/invalid input is REJECTED (never accepted).
//
// This exists because the v6.0.0 security-hardening pass fixed four CRITICAL fail-open
// forgery bugs, all of the same shape: code read a truthy return value (an ECDSA
// *instance*, a stub `{verified:true}`) as if it meant "valid". These tests assert the
// negative — a bad input must not verify — and pin the return-type contract so a
// regression to fail-open trips a red test instead of shipping.

require('chai').should()
var assert = require('assert')
var bsv = require('../..')

var Hash = bsv.crypto.Hash
var ECDSA = bsv.crypto.ECDSA

function isStrictBool (v) { return v === true || v === false }

describe('security: fail-closed verification contracts', function () {
  // A signature over `hash` by `signer`, and a different key it was NOT signed by.
  var signer = bsv.PrivateKey.fromRandom()
  var hash = Hash.sha256(Buffer.from('the message'))
  var goodSig = ECDSA.sign(hash, signer)
  var rightPub = signer.toPublicKey()
  var wrongPub = bsv.PrivateKey.fromRandom().toPublicKey()

  describe('ECDSA signature verification', function () {
    it('static ECDSA.verify returns a STRICT boolean (never a truthy object)', function () {
      isStrictBool(ECDSA.verify(hash, goodSig, rightPub)).should.equal(true)
      isStrictBool(ECDSA.verify(hash, goodSig, wrongPub)).should.equal(true)
    })

    it('static ECDSA.verify accepts a valid signature and REJECTS a forged one', function () {
      ECDSA.verify(hash, goodSig, rightPub).should.equal(true)
      ECDSA.verify(hash, goodSig, wrongPub).should.equal(false) // forged: wrong key
    })

    it('instance verifyBool() is the safe boolean path and fails closed on a forgery', function () {
      function inst (pub) {
        var e = new ECDSA(); e.hashbuf = hash; e.sig = goodSig; e.pubkey = pub; return e
      }
      isStrictBool(inst(rightPub).verifyBool()).should.equal(true)
      inst(rightPub).verifyBool().should.equal(true)
      inst(wrongPub).verifyBool().should.equal(false)
    })

    // 7.0: the trap is CLOSED. Instance .verify() now returns a STRICT boolean, so
    // `if (ecdsa.verify())` correctly rejects a forgery. (Pre-7.0 it returned the
    // truthy instance with the real result on .verified; that idiom is gone.)
    it('instance .verify() returns a strict boolean and fails closed on a forgery', function () {
      var good = new ECDSA(); good.hashbuf = hash; good.sig = goodSig; good.pubkey = rightPub
      isStrictBool(good.verify()).should.equal(true)
      good.verify().should.equal(true)

      var forged = new ECDSA(); forged.hashbuf = hash; forged.sig = goodSig; forged.pubkey = wrongPub
      isStrictBool(forged.verify()).should.equal(true)
      forged.verify().should.equal(false) // forged → false, and `if (forged.verify())` does NOT enter
      // The result is still mirrored on .verified as a side effect.
      forged.verified.should.equal(false)
    })
  })

  describe('SmartVerify (hardened secp256k1 verify)', function () {
    it('returns a STRICT boolean and rejects a forged signature', function () {
      var ok = bsv.SmartVerify.smartVerify(hash, goodSig.toBuffer(), rightPub)
      var bad = bsv.SmartVerify.smartVerify(hash, goodSig.toBuffer(), wrongPub)
      isStrictBool(ok).should.equal(true)
      isStrictBool(bad).should.equal(true)
      ok.should.equal(true)
      bad.should.equal(false)
    })
  })

  describe('SPV inclusion / header-chain verification', function () {
    it('verifyHeaderChain fails closed on empty / malformed input (throws, not truthy)', function () {
      assert.throws(function () { bsv.SPV.verifyHeaderChain([], {}) })
    })

    it('verifyMerkleProof rejects a bad proof without ever returning a truthy non-boolean', function () {
      var fakeRoot = Buffer.alloc(32, 1)
      var fakeTxid = Buffer.alloc(32, 2)
      var res
      try {
        res = bsv.SPV.verifyMerkleProof(fakeTxid, { index: 0, nodes: ['00'.repeat(32)] }, fakeRoot)
      } catch (e) { res = false } // throwing is an acceptable fail-closed outcome
      // Whatever the shape, it must not be a truthy value that reads as "included".
      var included = (res === true) || (res && res.valid === true) || (res && res.verified === true)
      included.should.equal(false)
    })
  })

  describe('SmartContract script verification', function () {
    it('verifyScript reports a boolean ok and fails an unsatisfiable lock', function () {
      var r = bsv.SmartContract.verifyScript(new bsv.Script(), new bsv.Script().add(bsv.Opcode.OP_FALSE))
      isStrictBool(r.ok).should.equal(true)
      r.ok.should.equal(false)
    })
  })
})
