'use strict'

/* global describe, it */

// RFC 6962 Merkle trees, for BRC-220 batch mode.
//
// The first version of foldPath here descended from the root by splitting at the largest
// power of two, mirroring how root() builds the tree. It round-tripped perfectly for
// powers of two and failed for 21 of the 45 leaves in trees of size 1..9 — which is
// exactly why the published vectors below matter more than any round-trip test. A tree
// that agrees with itself is not evidence.

require('chai').should()
var Merkle = require('../../lib/notaryhash/merkle')
var Hash = require('../../lib/crypto/hash')

// The canonical RFC 6962 / Certificate Transparency inputs.
var D = ['', '00', '10', '2021', '3031', '40414243', '5051525354555657',
  '606162636465666768696a6b6c6d6e6f'].map(function (h) { return Buffer.from(h, 'hex') })

describe('RFC 6962 Merkle tree', function () {
  describe('published vectors', function () {
    // External validation. Everything else in this file could be internally consistent
    // and wrong; these numbers come from outside this codebase.
    var EXPECTED = {
      0: 'e3b0c44298fc1c149afbf4c8996fb92427ae41e4649b934ca495991b7852b855',
      1: '6e340b9cffb37a989ca544e6bb780a2c78901d3fb33738768511a30617afa01d',
      2: 'fac54203e7cc696cf0dfcb42c92a1d9dbaf70ad9e621f4bd8d98662f00e3c125',
      4: 'd37ee418976dd95753c1c73862b9398fa2a2cf9b4ff0fdfe8b30cd95209614b7',
      7: 'ddb89be403809e325750d3d263cd78929c2942b7942a34b77e122c9594a74c8c',
      8: '5dc9da79a70659a9ad559cb701ded9a2ab9d823aad2f4960cfe370eff4604328'
    }

    Object.keys(EXPECTED).forEach(function (n) {
      it('MTH of ' + n + ' leaves matches the published root', function () {
        Merkle.root(D.slice(0, Number(n))).toString('hex').should.equal(EXPECTED[n])
      })
    })
  })

  describe('construction', function () {
    it('hashes the empty tree as SHA-256 of the empty string, not zeroes', function () {
      Merkle.root([]).toString('hex').should.equal(Hash.sha256(Buffer.alloc(0)).toString('hex'))
      Merkle.root([]).toString('hex').should.not.equal('00'.repeat(32))
    })

    it('domain-separates leaves from internal nodes', function () {
      Merkle.hashLeaf(Buffer.from('ab', 'hex')).toString('hex')
        .should.equal(Hash.sha256(Buffer.from('00ab', 'hex')).toString('hex'))
      Merkle.hashNode(Buffer.alloc(32, 1), Buffer.alloc(32, 2)).toString('hex')
        .should.equal(Hash.sha256(Buffer.concat([
          Buffer.from([0x01]), Buffer.alloc(32, 1), Buffer.alloc(32, 2)
        ])).toString('hex'))
    })

    // Without the 0x00/0x01 prefixes an internal node could be reinterpreted as a leaf,
    // which is the second-preimage attack Bitcoin's tree is open to.
    it('gives a leaf and a node over the same bytes different hashes', function () {
      var payload = Buffer.alloc(64, 7)
      Merkle.hashLeaf(payload).toString('hex')
        .should.not.equal(Merkle.hashNode(Buffer.alloc(32, 7), Buffer.alloc(32, 7)).toString('hex'))
    })

    // The split point, not the midpoint. For n=5 the RFC splits 4/1.
    it('splits at the largest power of two below n', function () {
      var expected = { 2: 1, 3: 2, 4: 2, 5: 4, 6: 4, 7: 4, 8: 4, 9: 8, 16: 8, 17: 16 }
      Object.keys(expected).forEach(function (n) {
        Merkle.largestPowerOfTwoBelow(Number(n)).should.equal(expected[n])
      })
    })
  })

  // The property the plan named as the one that would ship silently: a Bitcoin-style
  // tree over the same leaves must produce a DIFFERENT root.
  describe('is not the Bitcoin tree', function () {
    function bitcoinStyleRoot (leaves) {
      var level = leaves.map(function (l) { return Hash.sha256sha256(l) })
      while (level.length > 1) {
        var next = []
        for (var i = 0; i < level.length; i += 2) {
          var left = level[i]
          var right = i + 1 < level.length ? level[i + 1] : left // duplicated
          next.push(Hash.sha256sha256(Buffer.concat([left, right])))
        }
        level = next
      }
      return level[0]
    }

    it('produces a different root over the same leaves', function () {
      var leaves = D.slice(0, 4)
      Merkle.root(leaves).toString('hex')
        .should.not.equal(bitcoinStyleRoot(leaves).toString('hex'))
    })

    it('differs for an odd leaf count, where Bitcoin duplicates and RFC 6962 does not', function () {
      var leaves = D.slice(0, 3)
      Merkle.root(leaves).toString('hex')
        .should.not.equal(bitcoinStyleRoot(leaves).toString('hex'))
    })
  })

  describe('inclusion proofs', function () {
    it('round-trips every leaf for every tree size 1..33', function () {
      var failures = []
      for (var n = 1; n <= 33; n++) {
        var leaves = []
        for (var i = 0; i < n; i++) leaves.push(Buffer.from([i & 0xff, n & 0xff]))
        var root = Merkle.root(leaves)
        for (var j = 0; j < n; j++) {
          if (!Merkle.verifyInclusion(leaves[j], j, n, Merkle.path(leaves, j), root)) {
            failures.push('n=' + n + ' i=' + j)
          }
        }
      }
      failures.should.deep.equal([])
    })

    it('rejects a proof for the wrong leaf', function () {
      var leaves = D.slice(0, 8)
      var root = Merkle.root(leaves)
      Merkle.verifyInclusion(D[1], 0, 8, Merkle.path(leaves, 0), root).should.equal(false)
    })

    it('rejects a proof at the wrong index', function () {
      var leaves = D.slice(0, 8)
      var root = Merkle.root(leaves)
      Merkle.verifyInclusion(leaves[3], 4, 8, Merkle.path(leaves, 3), root).should.equal(false)
    })

    // leafCount changes the tree shape — but only for SOME indices. On an 8-leaf tree
    // claimed as 7, indices 0..5 fold identically and only 6 and 7 differ, because the
    // left region of the tree is the same shape either way.
    //
    // That is a property worth knowing rather than a defect: it means an inclusion proof
    // alone cannot be trusted to detect a wrong leafCount, which is why
    // NotaryHash.recordMatchesCertificate compares the certificate's count against the
    // authoritative u32be in the on-chain record instead of assuming the fold implies it.
    it('rejects a wrong leafCount where the shape differs', function () {
      var leaves = D.slice(0, 8)
      var root = Merkle.root(leaves)
      Merkle.verifyInclusion(leaves[6], 6, 7, Merkle.path(leaves, 6), root).should.equal(false)
      Merkle.verifyInclusion(leaves[7], 7, 7, Merkle.path(leaves, 7), root).should.equal(false)
    })

    it('does NOT catch a wrong leafCount where the shape is the same', function () {
      var leaves = D.slice(0, 8)
      var root = Merkle.root(leaves)
      // Documented, not desired. The on-chain leafCount is what closes this.
      Merkle.verifyInclusion(leaves[3], 3, 7, Merkle.path(leaves, 3), root).should.equal(true)
    })

    it('rejects a truncated or padded path', function () {
      var leaves = D.slice(0, 8)
      var root = Merkle.root(leaves)
      var path = Merkle.path(leaves, 3)
      Merkle.verifyInclusion(leaves[3], 3, 8, path.slice(0, -1), root).should.equal(false)
      Merkle.verifyInclusion(leaves[3], 3, 8, path.concat([Buffer.alloc(32)]), root).should.equal(false)
    })

    it('rejects a tampered sibling', function () {
      var leaves = D.slice(0, 8)
      var root = Merkle.root(leaves)
      var path = Merkle.path(leaves, 3)
      path[0] = Buffer.alloc(32, 0xff)
      Merkle.verifyInclusion(leaves[3], 3, 8, path, root).should.equal(false)
    })

    it('returns a strict boolean and never throws on malformed input', function () {
      Merkle.verifyInclusion(D[0], 0, 1, [], Merkle.root([D[0]])).should.be.a('boolean')
      Merkle.verifyInclusion(null, 0, 1, [], Buffer.alloc(32)).should.equal(false)
      Merkle.verifyInclusion(D[0], 5, 1, [], Buffer.alloc(32)).should.equal(false)
      Merkle.verifyInclusion(D[0], 0, 1, [], 'not-a-buffer').should.equal(false)
    })

    it('gives an empty path for a single-leaf tree', function () {
      Merkle.path([D[0]], 0).should.deep.equal([])
      Merkle.verifyInclusion(D[0], 0, 1, [], Merkle.hashLeaf(D[0])).should.equal(true)
    })
  })
})
