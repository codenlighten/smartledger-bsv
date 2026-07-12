'use strict'

/* global describe, it */

// SPV header-chain verification: linkage + per-header proof-of-work + optional
// trusted-hash anchoring. Uses the regtest max target (0x207fffff) so a header's
// PoW passes after trivial nonce grinding (no real mining needed).

require('chai').should()
var bsv = require('../..')
var SPV = bsv.SPV

function rand32 () { return bsv.crypto.Random.getRandomBuffer(32) }

// "Mine" a header at regtest difficulty: grind nonce until PoW passes (~1-2 tries).
function minedHeader (prevHashInternal, merkleInternal) {
  for (var nonce = 0; nonce < 100000; nonce++) {
    var h = new bsv.BlockHeader({
      version: 1,
      prevHash: prevHashInternal,
      merkleRoot: merkleInternal,
      time: 1231006505 + nonce,
      bits: 0x207fffff,
      nonce: nonce
    })
    if (h.validProofOfWork()) return h
  }
  throw new Error('could not mine a regtest header')
}

function chain (n) {
  var hs = []
  var prev = Buffer.alloc(32)
  for (var i = 0; i < n; i++) {
    var h = minedHeader(prev, rand32())
    hs.push(h)
    prev = h._getHash()
  }
  return hs
}

describe('SPV.verifyHeaderChain', function () {
  this.timeout(10000)

  it('accepts a linked, PoW-valid chain', function () {
    var hs = chain(4)
    var res = SPV.verifyHeaderChain(hs)
    res.valid.should.equal(true)
    res.count.should.equal(4)
    res.anchorHash.should.equal(hs[0].id)
    res.tipHash.should.equal(hs[3].id)
  })

  it('rejects a broken link', function () {
    var hs = chain(3)
    var res = SPV.verifyHeaderChain([hs[0], hs[2]]) // hs[2] links to hs[1], not hs[0]
    res.valid.should.equal(false)
    res.reason.should.match(/broken link/)
  })

  it('rejects a header that fails proof-of-work', function () {
    // Mainnet-difficulty bits with nonce 0 — the hash will not meet the tiny target.
    var bad = new bsv.BlockHeader({
      version: 1, prevHash: Buffer.alloc(32), merkleRoot: rand32(),
      time: 1231006505, bits: 0x1d00ffff, nonce: 0
    })
    SPV.verifyHeaderChain([bad]).valid.should.equal(false)
    // ...but skipping PoW, a single header is trivially "valid".
    SPV.verifyHeaderChain([bad], { requirePow: false }).valid.should.equal(true)
  })

  it('honours a trusted-hash anchor (tip or anchor)', function () {
    var hs = chain(3)
    SPV.verifyHeaderChain(hs, { trustedHash: hs[2].id }).valid.should.equal(true)
    SPV.verifyHeaderChain(hs, { trustedHash: hs[0].id }).valid.should.equal(true)
    var res = SPV.verifyHeaderChain(hs, { trustedHash: 'ff'.repeat(32) })
    res.valid.should.equal(false)
    res.reason.should.match(/trusted hash/)
  })

  it('accepts hex / buffer headers', function () {
    var hs = chain(2)
    var asHex = hs.map(function (h) { return h.toBuffer().toString('hex') })
    SPV.verifyHeaderChain(asHex).valid.should.equal(true)
  })
})
