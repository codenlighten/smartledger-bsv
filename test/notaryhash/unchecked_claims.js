'use strict'
/* global describe,it,before */

// Two claims a certificate can carry that this library does not verify, and used to answer
// `valid` about anyway. Both were found by the block-penn-station session's differential fuzz
// (3,573 inputs) against an independent Python verifier, comparing our examples/gateway adapter
// with theirs. The rule in both cases is the one adopted for spv.format: verifying a proof is
// not accepting a self-described certificate, so a statement we never read cannot be covered by
// a verdict of `valid`.
//
// 1. anchor.seal is a chain-of-custody claim — that this record is the ONE successor of another,
//    because its transaction spends a one-satoshi seal output of the predecessor's. It is checked
//    by @smartledger/notaryhash; nothing here implements it. 319 fuzz inputs with a damaged seal
//    verified, including a certificate relabelled as the successor of a record it is not, and a
//    seal signature of 64 zero bytes.
//
// 2. anchor.blockHeight was compared with spv.blockHeight only when BOTH were present, so
//    nulling spv.blockHeight removed the only value it was checked against and any height
//    verified. The height was bound to nothing.

require('chai').should()
var bsv = require('../..')
var V = require('../data/notaryhash-tamper-cases.json')

function headerHex (b) {
  var h = bsv.BlockHeader.fromObject({
    version: b.version,
    prevHash: Buffer.from(b.previousblockhash, 'hex').reverse(),
    merkleRoot: Buffer.from(b.merkleroot, 'hex').reverse(),
    time: b.time,
    bits: typeof b.bits === 'string' ? parseInt(b.bits, 16) : b.bits,
    nonce: b.nonce
  })
  if (h.id !== b.hash) throw new Error('pinned block ' + b.hash + ' did not rebuild')
  return h.toBuffer().toString('hex')
}

describe('NotaryHash unchecked claims', function () {
  var genuine, opts

  before(function () {
    var blocks = Array.isArray(V.blocks) ? V.blocks : Object.keys(V.blocks).map(function (k) { return V.blocks[k] })
    var byHash = {}
    var byHeight = {}
    blocks.forEach(function (b) { byHash[b.hash] = headerHex(b); byHeight[b.height] = b.hash })
    genuine = V.cases.filter(function (c) { return c.id === 'T00' })[0].certificate
    opts = {
      header: byHash[genuine.spv.blockHash],
      blockHashAtHeight: byHeight[genuine.spv.blockHeight]
    }
  })

  function clone (mutate) {
    var c = JSON.parse(JSON.stringify(genuine))
    if (mutate) mutate(c)
    return c
  }

  it('leaves the genuine certificate valid', function () {
    bsv.NotaryHash.verify(genuine, opts).valid.should.equal(true)
  })

  describe('anchor.seal', function () {
    it('refuses a certificate carrying a seal, because seals are not verified here', function () {
      var r = bsv.NotaryHash.verify(clone(function (c) {
        c.anchor.seal = { vout: 1, previous: null, previousId: null, signature: '00'.repeat(64) }
      }), opts)
      r.valid.should.equal(false)
      r.errors.join(' | ').should.match(/anchor\.seal is present and this library does not verify seals/)
    })

    it('refuses a seal of any shape, including ones that are not objects', function () {
      ;[{ a: 1 }, 'x', [], true, 7].forEach(function (seal) {
        bsv.NotaryHash.verify(clone(function (c) { c.anchor.seal = seal }), opts)
          .valid.should.equal(false)
      })
    })

    it('accepts a sealed certificate under allowUncheckedSeal', function () {
      var c = clone(function (x) {
        x.anchor.seal = { vout: 1, previous: null, previousId: null, signature: '00'.repeat(64) }
      })
      bsv.NotaryHash.verify(c, Object.assign({ allowUncheckedSeal: true }, opts))
        .valid.should.equal(true)
    })

    // One rule for every member, which is the block-penn-station session's argument and better
    // than the null exemption this first shipped with: absent is absent, present and wrong is
    // wrong. A verifier that reads a wrong-typed member as absent has to decide the same for
    // `false`, `0` and `''` next — and that exemption is exactly what made this library call
    // `spv: "zz"` "not mined yet" for the few hours between the two fixes.
    it('treats only an ABSENT seal as no claim', function () {
      bsv.NotaryHash.verify(clone(function (c) { delete c.anchor.seal }), opts)
        .valid.should.equal(true)
    })

    it('refuses a null seal as a malformed member, not as an absent one', function () {
      var r = bsv.NotaryHash.verify(clone(function (c) { c.anchor.seal = null }), opts)
      r.valid.should.equal(false)
      r.errors.join(' | ').should.match(/anchor\.seal is present but is not an object/)
    })

    it('does not let allowUncheckedSeal wave a malformed seal through', function () {
      // That opt-out means "I will check the seal myself", which nobody can do with a seal
      // that is not a seal.
      ;[null, 'x', [], 7].forEach(function (seal) {
        bsv.NotaryHash.verify(clone(function (c) { c.anchor.seal = seal }),
          Object.assign({ allowUncheckedSeal: true }, opts)).valid.should.equal(false)
      })
    })

    it('refuses a null spv.format by the same rule', function () {
      bsv.NotaryHash.verify(clone(function (c) { c.spv.format = null }), opts)
        .valid.should.equal(false)
    })
  })

  describe('anchor.blockHeight', function () {
    it('refuses a height that cannot be checked because spv.blockHeight is null', function () {
      var r = bsv.NotaryHash.verify(clone(function (c) {
        c.spv.blockHeight = null
        c.anchor.blockHeight = 1
      }), opts)
      r.valid.should.equal(false)
      r.errors.join(' | ').should.match(/anchor\.blockHeight 1 cannot be checked/)
    })

    it('refuses it when spv.blockHeight is absent entirely', function () {
      bsv.NotaryHash.verify(clone(function (c) {
        delete c.spv.blockHeight
        c.anchor.blockHeight = 1
      }), opts).valid.should.equal(false)
    })

    it('still refuses a mismatch when both are present', function () {
      var r = bsv.NotaryHash.verify(clone(function (c) { c.anchor.blockHeight = 1 }), opts)
      r.valid.should.equal(false)
      r.errors.join(' | ').should.match(/does not equal spv\.blockHeight/)
    })

    it('does not require anchor.blockHeight to be present', function () {
      bsv.NotaryHash.verify(clone(function (c) { delete c.anchor.blockHeight }), opts)
        .valid.should.equal(true)
    })
  })
})
