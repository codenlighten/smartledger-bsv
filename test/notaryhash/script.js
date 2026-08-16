'use strict'

/* global describe, it */

// BRC-220 on-chain record. As with the encoding module, the property that matters is that
// another implementation reading the spec produces and accepts the same bytes — so the
// tests assert the push layout the spec dictates rather than only round-tripping our own
// output, which would pass even if every field were in the wrong place.

require('chai').should()
var bsv = require('../..')
var NS = require('../../lib/notaryhash/script')
var Hash = require('../../lib/crypto/hash')
var Opcode = require('../../lib/opcode')

var FULL = {
  mode: NS.MODE.FULL,
  algorithm: 'ECDSA-secp256k1',
  hashAlgorithm: 'SHA-256',
  payloadHash: Buffer.alloc(32, 0x11),
  proofHash: Buffer.alloc(32, 0x22),
  publicKey: Buffer.alloc(33, 0x02),
  signature: Buffer.alloc(64, 0x30)
}

// The spec counts PUSH indices, which start after OP_FALSE OP_RETURN. Script chunks
// include those two opcodes, so push N is chunk N+2.
function pushes (script) {
  return script.chunks.slice(2)
}

describe('BRC-220 on-chain record', function () {
  describe('push layout', function () {
    it('is OP_FALSE OP_RETURN followed by the pushes', function () {
      var s = NS.build(FULL)
      s.chunks[0].opcodenum.should.equal(Opcode.OP_FALSE)
      s.chunks[1].opcodenum.should.equal(Opcode.OP_RETURN)
    })

    it('puts the prefix at push index 0, as 10 ASCII bytes', function () {
      var p = pushes(NS.build(FULL))
      p[0].buf.toString('ascii').should.equal('NOTARYHASH')
      p[0].buf.length.should.equal(10)
      p[0].buf.toString('hex').should.equal('4e4f5441525948415348')
    })

    // The spec discriminates on "the mode/kind byte at push index 2". If this drifts,
    // every other implementation reads the wrong field.
    it('puts the version at push index 1 and the mode at push index 2', function () {
      var p = pushes(NS.build(FULL))
      p[1].buf.length.should.equal(1)
      p[1].buf[0].should.equal(1)
      p[2].buf.length.should.equal(1)
      p[2].buf[0].should.equal(NS.MODE.FULL)
    })

    it('orders full-mode fields as the spec lists them', function () {
      var p = pushes(NS.build(FULL))
      p.length.should.equal(9)
      p[3].buf.toString('utf8').should.equal('ECDSA-secp256k1')
      p[4].buf.toString('utf8').should.equal('SHA-256')
      p[5].buf.toString('hex').should.equal(FULL.payloadHash.toString('hex'))
      p[6].buf.toString('hex').should.equal(FULL.proofHash.toString('hex'))
      p[7].buf.toString('hex').should.equal(FULL.publicKey.toString('hex'))
      p[8].buf.toString('hex').should.equal(FULL.signature.toString('hex'))
    })

    it('lays batch mode out as root then u32be count', function () {
      var p = pushes(NS.build({ mode: NS.MODE.BATCH, merkleRoot: Buffer.alloc(32, 0xaa), leafCount: 12345 }))
      p.length.should.equal(5)
      p[2].buf[0].should.equal(NS.MODE.BATCH)
      p[3].buf.length.should.equal(32)
      p[4].buf.length.should.equal(4)
      p[4].buf.readUInt32BE(0).should.equal(12345)
    })

    // The canonical proof bytes use lp() because they are one flat string; here the push
    // opcode already carries the length. Applying lp() as well would double-encode.
    it('does not length-prefix inside the pushes', function () {
      var p = pushes(NS.build(FULL))
      // A doubly-encoded payloadHash would be 4 + 32 bytes.
      p[5].buf.length.should.equal(32)
      p[3].buf.length.should.equal('ECDSA-secp256k1'.length)
    })
  })

  describe('hybrid mode', function () {
    it('puts SHA-256 of the key and signature on chain', function () {
      var p = pushes(NS.build(Object.assign({}, FULL, { mode: NS.MODE.HYBRID })))
      p[7].buf.toString('hex').should.equal(Hash.sha256(FULL.publicKey).toString('hex'))
      p[8].buf.toString('hex').should.equal(Hash.sha256(FULL.signature).toString('hex'))
      p[7].buf.length.should.equal(32)
      p[8].buf.length.should.equal(32)
    })

    // The caller always supplies the FULL key and signature; hashing is this module's job.
    // Accepting a pre-hashed blob would produce a record that looks right and cannot be
    // reconciled with the certificate, and nothing downstream would notice.
    it('hashes internally rather than trusting a pre-hashed input', function () {
      var preHashed = Object.assign({}, FULL, {
        mode: NS.MODE.HYBRID,
        publicKey: Hash.sha256(FULL.publicKey)
      })
      var p = pushes(NS.build(preHashed))
      // Hashed again, so it does NOT equal the value that was passed in.
      p[7].buf.toString('hex').should.not.equal(Hash.sha256(FULL.publicKey).toString('hex'))
    })

    it('parses to hashes, never to raw blobs', function () {
      var parsed = NS.parse(NS.build(Object.assign({}, FULL, { mode: NS.MODE.HYBRID })))
      parsed.publicKeyHash.toString('hex').should.equal(Hash.sha256(FULL.publicKey).toString('hex'))
      ;(parsed.publicKey === undefined).should.equal(true)
      ;(parsed.signature === undefined).should.equal(true)
    })
  })

  describe('round trip', function () {
    it('preserves every full-mode field', function () {
      var p = NS.parse(NS.build(FULL))
      p.mode.should.equal(NS.MODE.FULL)
      p.version.should.equal(1)
      p.algorithm.should.equal(FULL.algorithm)
      p.hashAlgorithm.should.equal(FULL.hashAlgorithm)
      p.payloadHash.toString('hex').should.equal(FULL.payloadHash.toString('hex'))
      p.proofHash.toString('hex').should.equal(FULL.proofHash.toString('hex'))
      p.publicKey.toString('hex').should.equal(FULL.publicKey.toString('hex'))
      p.signature.toString('hex').should.equal(FULL.signature.toString('hex'))
    })

    it('preserves batch fields', function () {
      var p = NS.parse(NS.build({ mode: NS.MODE.BATCH, merkleRoot: Buffer.alloc(32, 0xbb), leafCount: 1 }))
      p.merkleRoot.toString('hex').should.equal(Buffer.alloc(32, 0xbb).toString('hex'))
      p.leafCount.should.equal(1)
    })

    it('round-trips through hex', function () {
      var hex = NS.build(FULL).toHex()
      NS.parse(hex).algorithm.should.equal(FULL.algorithm)
    })

    it('carries a post-quantum-sized signature in full mode', function () {
      var big = Object.assign({}, FULL, { signature: Buffer.alloc(7856, 0x5a) })
      NS.parse(NS.build(big)).signature.length.should.equal(7856)
    })
  })

  describe('parser rejects', function () {
    function corrupt (fn) {
      var s = NS.build(FULL)
      fn(s)
      return s
    }

    // Long enough to pass the length check, so the OP_FALSE check is what rejects it.
    it('a record that does not open with OP_FALSE', function () {
      var s = corrupt(function (s) { s.chunks[0] = { opcodenum: Opcode.OP_1 } })
      ;(function () { NS.parse(s) }).should.throw(/OP_FALSE/)
    })

    it('a record with no OP_RETURN', function () {
      var s = corrupt(function (s) { s.chunks[1] = { opcodenum: Opcode.OP_1 } })
      ;(function () { NS.parse(s) }).should.throw(/OP_RETURN/)
    })

    it('a foreign protocol prefix', function () {
      var s = corrupt(function (s) { s.chunks[2].buf = Buffer.from('SOMETHINGELSE', 'ascii') })
      ;(function () { NS.parse(s) }).should.throw(/prefix/)
    })

    it('an unsupported version', function () {
      var s = corrupt(function (s) { s.chunks[3].buf = Buffer.from([9]) })
      ;(function () { NS.parse(s) }).should.throw(/version: 9/)
    })

    it('an unknown mode', function () {
      var s = corrupt(function (s) { s.chunks[4].buf = Buffer.from([7]) })
      ;(function () { NS.parse(s) }).should.throw(/unknown NotaryHash mode: 7/)
    })

    it('the wrong number of pushes', function () {
      var s = corrupt(function (s) { s.chunks.pop() })
      ;(function () { NS.parse(s) }).should.throw(/exactly 11 pushes/)
    })

    it('a payloadHash that is not 32 bytes', function () {
      var s = corrupt(function (s) { s.chunks[7].buf = Buffer.alloc(31, 1) })
      ;(function () { NS.parse(s) }).should.throw(/payloadHash must be exactly 32/)
    })

    it('a leafCount that is not 4 bytes', function () {
      var s = NS.build({ mode: NS.MODE.BATCH, merkleRoot: Buffer.alloc(32, 1), leafCount: 5 })
      s.chunks[6].buf = Buffer.alloc(3, 0)
      ;(function () { NS.parse(s) }).should.throw(/leafCount must be 4 bytes/)
    })

    it('too few pushes to be a record at all', function () {
      ;(function () { NS.parse(new bsv.Script().add(Opcode.OP_FALSE).add(Opcode.OP_RETURN)) })
        .should.throw(/too few pushes/)
    })
  })

  describe('builder rejects', function () {
    it('an unknown mode', function () {
      ;(function () { NS.build(Object.assign({}, FULL, { mode: 5 })) }).should.throw(/mode must be/)
    })

    it('hex where raw bytes belong', function () {
      ;(function () {
        NS.build(Object.assign({}, FULL, { payloadHash: FULL.payloadHash.toString('hex') }))
      }).should.throw(/must be a Buffer/)
    })

    it('a payloadHash of the wrong length', function () {
      ;(function () {
        NS.build(Object.assign({}, FULL, { payloadHash: Buffer.alloc(31) }))
      }).should.throw(/exactly 32 bytes/)
    })

    it('a non-integer leafCount', function () {
      ;(function () {
        NS.build({ mode: NS.MODE.BATCH, merkleRoot: Buffer.alloc(32), leafCount: 1.5 })
      }).should.throw(/leafCount/)
    })
  })

  // A builder that minimally encodes its pushes represents u8(1) as OP_1. Those records
  // are conformant, and rejecting them would be an interop failure rather than a safety
  // measure — the mode byte is a routing hint, and every field that matters is checked
  // on its own terms.
  describe('interop with minimally-encoded pushes', function () {
    it('reads OP_1 / OP_0 as the version and mode bytes', function () {
      var s = NS.build(FULL)
      s.chunks[3] = { opcodenum: Opcode.OP_1 }
      s.chunks[4] = { opcodenum: Opcode.OP_0 }
      var p = NS.parse(s)
      p.version.should.equal(1)
      p.mode.should.equal(NS.MODE.FULL)
    })

    it('reads OP_2 as batch mode', function () {
      var s = NS.build({ mode: NS.MODE.BATCH, merkleRoot: Buffer.alloc(32, 3), leafCount: 2 })
      s.chunks[4] = { opcodenum: Opcode.OP_2 }
      NS.parse(s).mode.should.equal(NS.MODE.BATCH)
    })
  })

  describe('isNotaryHash', function () {
    it('accepts a record of each mode', function () {
      NS.isNotaryHash(NS.build(FULL)).should.equal(true)
      NS.isNotaryHash(NS.build(Object.assign({}, FULL, { mode: NS.MODE.HYBRID }))).should.equal(true)
      NS.isNotaryHash(NS.build({ mode: NS.MODE.BATCH, merkleRoot: Buffer.alloc(32), leafCount: 0 }))
        .should.equal(true)
    })

    it('rejects an unrelated output without throwing', function () {
      NS.isNotaryHash(bsv.Script.buildPublicKeyHashOut(bsv.PrivateKey.fromRandom().toAddress()))
        .should.equal(false)
      NS.isNotaryHash('not-hex-at-all').should.equal(false)
    })

    // It is a scanning filter, not a validator. Saying so in a test stops it being used
    // as one.
    it('is only a filter — a truncated record still passes it but fails parse()', function () {
      var s = NS.build(FULL)
      s.chunks = s.chunks.slice(0, 6)
      NS.isNotaryHash(s).should.equal(true)
      ;(function () { NS.parse(s) }).should.throw()
    })
  })
})
