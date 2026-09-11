'use strict'

var should = require('chai').should()

var bsv = require('..')
var deprecate = require('../lib/util/deprecate')

/**
 * The policy in STABILITY.md has two settings, and both need to hold.
 * A deprecation that always warns would ship fund-loss footguns quietly; an
 * exception that swallows every case would make the policy meaningless.
 */
describe('deprecated APIs', function () {
  var warned

  beforeEach(function () {
    deprecate.reset()
    warned = []
    this.origWarn = console.warn
    console.warn = function (m) { warned.push(m) }
  })

  afterEach(function () {
    console.warn = this.origWarn
    deprecate.reset()
  })

  describe('MerkleBlock#filterdTxsHash — unambiguous, so it delegates', function () {
    var block

    // Built from HEX, not from data.JSON[0]. Several tests in
    // test/block/merkleblock.js pass that shared object straight into the
    // MerkleBlock constructor, which mutates it, so a fixture copied from it is
    // only valid depending on file order. A hex string cannot be polluted.
    beforeEach(function () {
      block = bsv.MerkleBlock(Buffer.from(require('./data/merkleblocks.js').HEX[0], 'hex'))
    })

    it('returns what the correctly-spelled method returns', function () {
      var viaTypo = block.filterdTxsHash()
      var viaReal = block.filteredTxsHash()
      viaTypo.should.deep.equal(viaReal)
    })

    it('warns once, naming the replacement and the removal version', function () {
      block.filterdTxsHash()
      block.filterdTxsHash()
      warned.length.should.equal(1)
      warned[0].should.contain('MerkleBlock#filterdTxsHash')
      warned[0].should.contain('filteredTxsHash')
      warned[0].should.contain('10.0.0')
    })

    it('does not throw, which is the whole point', function () {
      ;(function () { block.filterdTxsHash() }).should.not.throw()
    })
  })

  describe('HDPrivateKey#derive — ambiguous, so it still throws', function () {
    var key = bsv.HDPrivateKey.fromRandom()

    it('refuses rather than guessing between two different derivations', function () {
      ;(function () { key.derive(0) }).should.throw(/deprecated/)
    })

    it('names both replacements so the caller chooses consciously', function () {
      try {
        key.derive(0)
        throw new Error('should have thrown')
      } catch (e) {
        e.message.should.contain('deriveChild')
        e.message.should.contain('deriveNonCompliantChild')
      }
    })

    // The two agree on roughly 199 keys out of 200 — they diverge only when an
    // intermediate private key serialises to fewer than 32 bytes and the legacy
    // path fails to zero-pad it. That RARITY is the danger, not a mitigation: a
    // caller who switched to `derive` would pass every test they wrote and then
    // derive unrecoverable addresses for about one wallet in two hundred. A
    // default that is wrong half a percent of the time is worse than one that is
    // wrong always, because nothing catches it.
    it('the two replacements can return different keys, which is why no default is safe', function () {
      var found = null
      for (var i = 0; i < 2000 && !found; i++) {
        var k = bsv.HDPrivateKey.fromRandom()
        var compliant = k.deriveChild("m/0'").xprivkey
        var legacy = k.deriveNonCompliantChild("m/0'").xprivkey
        if (compliant !== legacy) found = { compliant: compliant, legacy: legacy }
      }
      // ~0.5% per attempt; 2000 attempts miss with probability ~e^-10.
      should.exist(found)
      found.compliant.should.not.equal(found.legacy)
    })
  })

  // The LTP canonicalization pattern: the default is kept for 9.x, the notice carries the
  // migration, and choosing explicitly silences it.
  describe('NotaryHash.Certificate.build without a format — default kept, notice given', function () {
    function params (extra) {
      return Object.assign({
        mode: bsv.NotaryHash.MODE.FULL,
        algorithm: 'ECDSA-secp256k1',
        hashAlgorithm: 'SHA-256',
        payloadHash: Buffer.alloc(32, 1),
        publicKey: Buffer.alloc(33, 2),
        signature: Buffer.alloc(64, 3),
        createdAt: '2026-09-11T00:00:00.000Z',
        anchor: { txid: 'ab'.repeat(32), blockHeight: 1 }
      }, extra)
    }

    it('keeps writing the 9.8.0 format, which is the whole point', function () {
      var cert = bsv.NotaryHash.Certificate.build(params())
      cert.version.should.equal(1)
      cert.mode.should.equal(0)
      cert.encoding.should.equal('raw')
    })

    it('warns once, naming the replacement and the version that flips the default', function () {
      bsv.NotaryHash.Certificate.build(params())
      bsv.NotaryHash.Certificate.build(params())
      warned.length.should.equal(1)
      warned[0].should.match(/format: 'reference'/)
      warned[0].should.match(/10\.0\.0/)
    })

    it('is silent once the caller chooses', function () {
      bsv.NotaryHash.Certificate.build(params({ format: 'legacy' }))
      bsv.NotaryHash.Certificate.build(params({ format: 'reference', mode: 'full' }))
      warned.should.deep.equal([])
    })
  })
})
