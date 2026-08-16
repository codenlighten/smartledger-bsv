'use strict'

/* global describe, it */

// BRC-220 canonical encoding. The property that matters is not that these bytes are
// stable for us — it is that another implementation reading the spec produces the same
// ones. So the tests assert the byte layout the spec dictates, field by field, rather
// than only pinning our own output.
//
// The failure this module is most exposed to is a proofHash that is self-consistent and
// wrong: it verifies against itself, every local test passes, and nobody finds out until
// a third party tries to verify a certificate. Several tests below exist only to make
// that shape impossible.

require('chai').should()
var Encoding = require('../../lib/notaryhash/encoding')
var Hash = require('../../lib/crypto/hash')

var FIELDS = {
  algorithm: 'ECDSA-secp256k1',
  hashAlgorithm: 'SHA-256',
  payloadHash: Buffer.alloc(32, 0x11),
  publicKey: Buffer.alloc(33, 0x02),
  signature: Buffer.alloc(71, 0x30),
  createdAtUnix: 1786838400
}

describe('BRC-220 encoding', function () {
  describe('lp()', function () {
    it('is u32be(len) followed by the bytes', function () {
      Encoding.lp(Buffer.from([0xaa, 0xbb])).toString('hex').should.equal('00000002aabb')
    })

    it('encodes an empty value as a bare zero length', function () {
      Encoding.lp(Buffer.alloc(0)).toString('hex').should.equal('00000000')
    })

    it('measures BYTES, not characters, for text', function () {
      // 'é' is one character and two UTF-8 bytes. Using .length here would prefix 1,
      // and every proof containing a non-ASCII algorithm name would be unverifiable.
      Encoding.lp('é').toString('hex').should.equal('00000002c3a9')
      Encoding.lp('abc').toString('hex').should.equal('00000003616263')
    })

    // Length-prefixing exists to make field boundaries unambiguous. If it did not, these
    // two field pairs would concatenate to identical bytes.
    it('keeps ambiguous field splits distinct', function () {
      var a = Buffer.concat([Encoding.lp('ab'), Encoding.lp('c')])
      var b = Buffer.concat([Encoding.lp('a'), Encoding.lp('bc')])
      a.toString('hex').should.not.equal(b.toString('hex'))
    })
  })

  describe('u64be()', function () {
    it('is 8 bytes, big-endian', function () {
      Encoding.u64be(1).toString('hex').should.equal('0000000000000001')
      Encoding.u64be(1786838400).toString('hex').should.equal('000000006a80fd80')
    })

    // Date.now() is milliseconds. A caller who forgets to divide gets a timestamp about
    // a thousand years in the future that still encodes cleanly, so the guard is on the
    // input rather than the output.
    it('rejects a fractional value, which is what a millisecond mistake looks like', function () {
      ;(function () { Encoding.u64be(1786838400.5) }).should.throw(/whole seconds/)
    })

    it('rejects non-finite and negative values', function () {
      ;(function () { Encoding.u64be(NaN) }).should.throw(/finite/)
      ;(function () { Encoding.u64be(-1) }).should.throw(/negative/)
    })
  })

  describe('toUnixSeconds()', function () {
    it('converts an ISO 8601 string to whole seconds', function () {
      Encoding.toUnixSeconds('2026-08-16T00:00:00.000Z').should.equal(1786838400)
    })

    // Certificates carry millisecond precision in createdAt; the canonical bytes do not.
    // Two implementations must agree on the fractional part, and truncation is the only
    // choice that never moves a timestamp forward.
    it('truncates rather than rounds', function () {
      Encoding.toUnixSeconds('2026-08-16T00:00:00.999Z').should.equal(1786838400)
    })

    it('rejects an unparseable date', function () {
      ;(function () { Encoding.toUnixSeconds('not-a-date') }).should.throw(/not a valid date/)
    })
  })

  describe('canonicalBytes()', function () {
    // The layout, asserted against a hand-built expectation rather than against the
    // function's own output — otherwise this only proves the function is deterministic.
    it('lays the fields out exactly as the spec specifies', function () {
      var expected = Buffer.concat([
        Encoding.lp('NotaryHash/1.0'),
        Buffer.from([1]),
        Encoding.lp('ECDSA-secp256k1'),
        Encoding.lp('SHA-256'),
        Encoding.lp(FIELDS.payloadHash),
        Encoding.lp(FIELDS.publicKey),
        Encoding.lp(FIELDS.signature),
        Encoding.u64be(FIELDS.createdAtUnix)
      ])
      Encoding.canonicalBytes(FIELDS).toString('hex').should.equal(expected.toString('hex'))
    })

    it('opens with the protocol prefix and the version byte', function () {
      var bytes = Encoding.canonicalBytes(FIELDS)
      bytes.slice(0, 4).readUInt32BE(0).should.equal(14) // len('NotaryHash/1.0')
      bytes.slice(4, 18).toString('utf8').should.equal('NotaryHash/1.0')
      bytes[18].should.equal(1) // u8(version)
    })

    it('ends with the timestamp', function () {
      var bytes = Encoding.canonicalBytes(FIELDS)
      bytes.slice(-8).toString('hex').should.equal(Encoding.u64be(FIELDS.createdAtUnix).toString('hex'))
    })

    // THE test for this module. GDAF once signed a serialization that silently omitted
    // credentialSubject, so a forger could rewrite the claims without breaking the proof.
    // Every field must move the hash, or it is not covered by it.
    it('covers every field — changing any one changes the hash', function () {
      var base = Encoding.proofHash(FIELDS).toString('hex')
      var mutations = {
        algorithm: 'ML-DSA-65',
        hashAlgorithm: 'SHA-512',
        payloadHash: Buffer.alloc(32, 0x12),
        publicKey: Buffer.alloc(33, 0x03),
        signature: Buffer.alloc(71, 0x31),
        createdAtUnix: FIELDS.createdAtUnix + 1
      }
      Object.keys(mutations).forEach(function (field) {
        var altered = Object.assign({}, FIELDS)
        altered[field] = mutations[field]
        Encoding.proofHash(altered).toString('hex')
          .should.not.equal(base, field + ' does not affect proofHash, so it is not covered by it')
      })
    })

    // Hex is what certificates carry, and hex is twice as long as the bytes it encodes.
    // Accepting it here would produce a proof that verifies locally and nowhere else.
    it('refuses a hex string where raw bytes are required', function () {
      var withHex = Object.assign({}, FIELDS, { payloadHash: FIELDS.payloadHash.toString('hex') })
      ;(function () { Encoding.canonicalBytes(withHex) }).should.throw(/must be a Buffer/)
    })

    it('names the offending field and points at the hex trap', function () {
      var withHex = Object.assign({}, FIELDS, { signature: FIELDS.signature.toString('hex') })
      ;(function () { Encoding.canonicalBytes(withHex) }).should.throw(/signature.*hex/)
    })

    it('requires the string fields to be present and non-empty', function () {
      ;(function () {
        Encoding.canonicalBytes(Object.assign({}, FIELDS, { algorithm: '' }))
      }).should.throw(/algorithm/)
      ;(function () {
        Encoding.canonicalBytes(Object.assign({}, FIELDS, { hashAlgorithm: undefined }))
      }).should.throw(/hashAlgorithm/)
    })

    it('handles a post-quantum-sized signature', function () {
      // SLH-DSA signatures run to tens of kilobytes; the u32be length prefix must carry
      // them without truncation.
      var big = Object.assign({}, FIELDS, { signature: Buffer.alloc(49856, 0x7f) })
      var bytes = Encoding.canonicalBytes(big)
      var sigLenOffset = bytes.length - 8 - 49856 - 4
      bytes.readUInt32BE(sigLenOffset).should.equal(49856)
    })
  })

  describe('proofHash()', function () {
    it('is SHA-256 of the canonical bytes', function () {
      Encoding.proofHash(FIELDS).toString('hex')
        .should.equal(Hash.sha256(Encoding.canonicalBytes(FIELDS)).toString('hex'))
    })

    it('is 32 bytes', function () {
      Encoding.proofHash(FIELDS).length.should.equal(32)
    })

    it('is deterministic', function () {
      Encoding.proofHash(FIELDS).toString('hex')
        .should.equal(Encoding.proofHash(Object.assign({}, FIELDS)).toString('hex'))
    })
  })
})
