'use strict'

/* global describe, it */

// Coverage for SmartContract.Preimage (previously untested public class).
// Focus: a too-short buffer must fail with an HONEST error (it used to trip
// decodeCompactSize into a misleading "8-byte CompactSize" throw plus console
// spam), while real BIP-143 preimages round-trip their fields.

require('chai').should()
var bsv = require('../..')
var Preimage = bsv.SmartContract.Preimage

describe('SmartContract.Preimage', function () {
  describe('length guard (honest failure)', function () {
    it('exposes the derived BIP-143 structural minimum (157)', function () {
      Preimage.LEFT_FIXED_LENGTH.should.equal(104)
      Preimage.RIGHT_FIXED_LENGTH.should.equal(52)
      Preimage.MIN_PREIMAGE_LENGTH.should.equal(157)
    })

    it('throws a clear "too short" error at construction, not a CompactSize error', function () {
      ;[0, 50, 103, 156].forEach(function (n) {
        (function () { return new Preimage(Buffer.alloc(n)) })
          .should.throw(/Preimage too short/)
      })
    })

    it('does NOT mention CompactSize when the real problem is length', function () {
      var threw
      try { threw = new Preimage(Buffer.alloc(50)) } catch (e) { threw = e.message }
      threw.should.match(/Preimage too short/)
      threw.should.not.match(/CompactSize/)
    })

    it('validate() reports the length gracefully for a deferred preimage (no throw)', function () {
      var p = new Preimage(Buffer.alloc(50), { deferExtraction: true })
      var res = p.validate()
      res.valid.should.equal(false)
      res.errors.join(' ').should.match(/Preimage too short: 50 bytes/)
    })

    it('accepts a buffer exactly at the minimum length', function () {
      // 157 bytes: 104 left + 1-byte scriptLen varint (0x00 => empty script) + 52 right.
      var buf = Buffer.alloc(Preimage.MIN_PREIMAGE_LENGTH)
      ;(function () { return new Preimage(buf) }).should.not.throw()
    })
  })

  describe('decodeCompactSize (honest failure)', function () {
    it('throws when reading past the end of the buffer', function () {
      (function () { Preimage.decodeCompactSize(Buffer.alloc(4), 4) })
        .should.throw(/past end of preimage buffer/)
    })

    it('rejects the 8-byte (0xff) length prefix as invalid for a script length', function () {
      var buf = Buffer.concat([Buffer.from([0xff]), Buffer.alloc(8)])
      ;(function () { Preimage.decodeCompactSize(buf, 0) })
        .should.throw(/8-byte length prefix/)
    })

    it('rejects a truncated 2-byte CompactSize', function () {
      (function () { Preimage.decodeCompactSize(Buffer.from([0xfd, 0x01]), 0) })
        .should.throw(/Truncated 2-byte CompactSize/)
    })

    it('decodes a plain 1-byte length', function () {
      var r = Preimage.decodeCompactSize(Buffer.from([0x19]), 0)
      r.value.should.equal(0x19)
      r.bytes.should.equal(1)
      r.nextOffset.should.equal(1)
    })
  })

  describe('real preimage round-trip', function () {
    it('constructs, extracts fields, and validates a genuine preimage', function () {
      var ex = Preimage.createExample(0x41) // SIGHASH_ALL | FORKID
      ex.preimage.length.should.be.above(Preimage.MIN_PREIMAGE_LENGTH)

      // Fixed-width fields come back at their BIP-143 sizes.
      ex.getField('version').length.should.equal(4)
      ex.getField('hashPrevouts').length.should.equal(32)
      ex.getField('hashOutputs').length.should.equal(32)
      ex.getField('sighash').length.should.equal(4)

      var v = ex.validate()
      v.valid.should.equal(true)
      v.errors.length.should.equal(0)
    })

    it('reports SIGHASH flag info for the extracted sighash', function () {
      var ex = Preimage.createExample(0x41)
      var info = ex.getSighashInfo()
      info.flagName.should.match(/ALL/)
      info.flagName.should.match(/FORKID/)
    })
  })
})
