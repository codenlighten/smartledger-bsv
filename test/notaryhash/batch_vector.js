'use strict'

/* global describe, it */

// The BRC-220 batch-mode golden vector.
//
// BRC-220 writes the batch leaf as `SHA256(0x00 ‖ d)` and never says what `d` is. Prose
// cannot reliably close that gap — two implementers read the same sentence and chose
// differently — so this file holds a concrete vector that any implementation can check
// itself against.
//
// What this vector is: a CONFORMANCE TARGET produced by this library. It is not external
// validation, and nothing here proves our reading is the one the spec intended. What makes
// it worth having is that the tree underneath it IS externally anchored — the RFC 6962
// construction is checked against the published Certificate Transparency roots in
// merkle.js. Given a tree that provably matches RFC 6962, this vector pins the one thing
// the spec leaves open.
//
// These tests rebuild every value from the recorded inputs rather than reading the
// recorded outputs back. A test that asserts `vector.root === vector.root` would pass
// forever while proving nothing, which is the failure mode this repository has fixed most
// often.
//
// See docs/BRC220_BATCH_LEAF_AMENDMENT.md and tools/gen-brc220-batch-vector.js.

require('chai').should()
var vector = require('../data/brc220-batch-vector.json')
var Hash = require('../../lib/crypto/hash')
var Encoding = require('../../lib/notaryhash/encoding')
var Merkle = require('../../lib/notaryhash/merkle')
var Suites = require('../../lib/notaryhash/suites')
var NotaryHash = require('../../lib/notaryhash')
var NotaryScript = require('../../lib/notaryhash/script')
var BN = require('../../lib/crypto/bn')
var PrivateKey = require('../../lib/privatekey')
// Deliberately a SECOND implementation: see the independent-verification test below.
var { secp256k1 } = require('@noble/curves/secp256k1.js')

function hex (s) { return Buffer.from(s, 'hex') }

describe('BRC-220 batch golden vector', function () {
  describe('the vector describes the shape it claims', function () {
    it('is five leaves, which is deliberate', function () {
      // n=5 splits 4/1 under RFC 6962 (largest power of two BELOW n), where a midpoint
      // split would give 2/3 and a different root. Odd n also exercises the rule that the
      // last leaf is never duplicated. A power-of-two vector would catch neither.
      vector.leafCount.should.equal(5)
      vector.proofs.length.should.equal(5)
      Merkle.largestPowerOfTwoBelow(5).should.equal(4)
    })

    it('names its tree and leaf datum explicitly', function () {
      vector.tree.should.equal('RFC 6962')
      vector.leafDatum.should.equal('proofHash')
    })

    // The 4/1 split shows up in the path lengths: the lone right-hand leaf needs one
    // sibling, the four on the left need three. If a future change altered the split rule,
    // this would move before any root did.
    it('has path lengths matching a 4/1 split', function () {
      vector.proofs.map(function (p) { return p.path.length })
        .should.deep.equal([3, 3, 3, 3, 1])
    })
  })

  describe('every input is derived, so the vector is reproducible', function () {
    it('rebuilds each payloadHash from its recorded preimage', function () {
      vector.proofs.forEach(function (p) {
        Hash.sha256(Buffer.from(p.payloadPreimage, 'utf8')).toString('hex')
          .should.equal(p.payloadHash, 'leaf ' + p.leafIndex)
      })
    })

    it('records the preimage labels the generator actually uses', function () {
      vector.proofs.forEach(function (p, i) {
        p.keyPreimage.should.equal('BRC-220/batch-vector/key/' + i)
        p.payloadPreimage.should.equal('BRC-220/batch-vector/payload/' + i)
      })
    })

    it('uses raw encoding: 64-byte signatures and 33-byte compressed keys', function () {
      vector.proofs.forEach(function (p) {
        p.encoding.should.equal('raw')
        hex(p.signature).length.should.equal(64, 'leaf ' + p.leafIndex + ' signature')
        hex(p.publicKey).length.should.equal(33, 'leaf ' + p.leafIndex + ' publicKey')
      })
    })

    it('rebuilds createdAtUnix from the recorded ISO timestamp', function () {
      vector.proofs.forEach(function (p) {
        Encoding.toUnixSeconds(p.createdAt).should.equal(p.createdAtUnix)
      })
    })
  })

  describe('every proof stands on its own', function () {
    // Each signature must verify independently. Without this the vector could pin a tree
    // built over five values that are not valid proofs at all.
    it('verifies all five signatures under the named suite', function () {
      vector.proofs.forEach(function (p) {
        Suites.verify(p.algorithm, hex(p.payloadHash), hex(p.signature), hex(p.publicKey))
          .should.equal(true, 'leaf ' + p.leafIndex + ' signature must verify')
      })
    })

    // THE test this file most needs, and the one it originally lacked.
    //
    // The assertion above uses our own suite, and the generator uses our own signer, so
    // the two agree by construction. The first version of this vector was generated with
    // `endian: 'little'` — matching a verifier bug — and every signature in it was
    // unverifiable by any other implementation. Both tests above still passed, because
    // both sides of the comparison were wrong in the same direction.
    //
    // @noble/curves shares no signing or verification code with lib/crypto/ecdsa.js. If
    // this vector is ever regenerated by a signer that disagrees with the rest of the
    // world, this is the assertion that says so.
    //
    // { prehash: false } is REQUIRED: noble v2 hashes its input by default, so omitting
    // it would compare our signature over `payloadHash` against noble's over
    // `sha256(payloadHash)` — a mismatch that looks exactly like the bug this guards.
    it('verifies all five signatures under an INDEPENDENT implementation', function () {
      vector.proofs.forEach(function (p) {
        secp256k1.verify(hex(p.signature), hex(p.payloadHash), hex(p.publicKey), { prehash: false })
          .should.equal(true,
            'leaf ' + p.leafIndex + ' signature must verify under @noble/curves, not just ours')
      })
    })

    it('derives each public key from the recorded key preimage', function () {
      // Ties the published public keys back to their labelled preimages, so a third party
      // can reproduce the keys and not merely check the signatures against them.
      vector.proofs.forEach(function (p) {
        var priv = PrivateKey.fromObject({
          bn: BN.fromBuffer(Hash.sha256(Buffer.from(p.keyPreimage, 'utf8'))),
          compressed: true,
          network: 'livenet'
        })
        priv.publicKey.toBuffer().toString('hex')
          .should.equal(p.publicKey, 'leaf ' + p.leafIndex + ' public key must derive from its preimage')
      })
    })

    it('rebuilds each canonicalBytes from the recorded fields', function () {
      vector.proofs.forEach(function (p) {
        Encoding.canonicalBytes({
          algorithm: p.algorithm,
          hashAlgorithm: p.hashAlgorithm,
          payloadHash: hex(p.payloadHash),
          publicKey: hex(p.publicKey),
          signature: hex(p.signature),
          createdAtUnix: p.createdAtUnix
        }).toString('hex').should.equal(p.canonicalBytes, 'leaf ' + p.leafIndex)
      })
    })

    it('rebuilds each proofHash as SHA-256 of those canonical bytes', function () {
      vector.proofs.forEach(function (p) {
        Hash.sha256(hex(p.canonicalBytes)).toString('hex')
          .should.equal(p.proofHash, 'leaf ' + p.leafIndex)
      })
    })
  })

  describe('the leaf definition the spec leaves open', function () {
    it('rebuilds each leaf as SHA-256(0x00 || proofHash)', function () {
      vector.proofs.forEach(function (p) {
        Merkle.hashLeaf(hex(p.proofHash)).toString('hex')
          .should.equal(p.leafHash, 'leaf ' + p.leafIndex)
      })
    })

    it('rebuilds the root from the five proofHash values', function () {
      Merkle.root(vector.proofs.map(function (p) { return hex(p.proofHash) }))
        .toString('hex').should.equal(vector.root)
    })

    it('rebuilds every inclusion path and folds each back to the root', function () {
      var leaves = vector.proofs.map(function (p) { return hex(p.proofHash) })
      vector.proofs.forEach(function (p, i) {
        Merkle.path(leaves, i).map(function (n) { return n.toString('hex') })
          .should.deep.equal(p.path, 'path for leaf ' + i)
        Merkle.verifyInclusion(leaves[i], i, vector.leafCount,
          p.path.map(hex), hex(vector.root)).should.equal(true, 'fold for leaf ' + i)
      })
    })

    it('encodes leafCount as u32be for the on-chain record', function () {
      var buf = Buffer.alloc(4)
      buf.writeUInt32BE(vector.leafCount, 0)
      buf.toString('hex').should.equal(vector.onChainRecordTail.leafCountU32be)
      vector.onChainRecordTail.merkleRoot.should.equal(vector.root)
    })
  })

  describe('the rejected reading is recorded and really does diverge', function () {
    it('reproduces the canonicalBytes-leaf root the vector records', function () {
      Merkle.root(vector.proofs.map(function (p) { return hex(p.canonicalBytes) }))
        .toString('hex').should.equal(vector.rejectedReading.root)
    })

    // The whole reason the vector exists. Equal in strength, different root.
    it('is a different root from the proofHash reading', function () {
      vector.root.should.not.equal(vector.rejectedReading.root)
    })

    it('records each leaf hash under both readings, and they differ', function () {
      vector.proofs.forEach(function (p) {
        Merkle.hashLeaf(hex(p.canonicalBytes)).toString('hex')
          .should.equal(p.leafHashUnderRejectedReading, 'leaf ' + p.leafIndex)
        p.leafHash.should.not.equal(p.leafHashUnderRejectedReading)
      })
    })
  })

  // The amendment publishes these values as the text to put in the spec. A document that
  // has drifted from the artifact it describes is worse than no document, and nothing
  // else would notice: the doc is prose, the vector is JSON, and they are edited
  // separately.
  describe('the amendment document publishes the same values', function () {
    var fs = require('fs')
    var path = require('path')
    var doc = fs.readFileSync(
      path.join(__dirname, '..', '..', 'docs', 'BRC220_BATCH_LEAF_AMENDMENT.md'), 'utf8')

    it('publishes the root', function () {
      doc.indexOf(vector.root).should.be.above(-1, 'root missing from the amendment')
    })

    it('publishes the rejected reading root, so the divergence is diagnosable', function () {
      doc.indexOf(vector.rejectedReading.root)
        .should.be.above(-1, 'rejected reading root missing from the amendment')
    })

    it('publishes every proofHash', function () {
      vector.proofs.forEach(function (p) {
        doc.indexOf(p.proofHash).should.be.above(-1,
          'proofHash for leaf ' + p.leafIndex + ' missing from the amendment')
      })
    })

    it('publishes the leaf-4 audit path and the u32be leaf count', function () {
      doc.indexOf(vector.proofs[4].path[0]).should.be.above(-1, 'leaf 4 path missing')
      doc.indexOf(vector.onChainRecordTail.leafCountU32be).should.be.above(-1,
        'u32be leaf count missing')
    })
  })

  describe('the library verifies certificates built from this vector', function () {
    it('accepts a batch certificate for every leaf', function () {
      vector.proofs.forEach(function (p, i) {
        var report = NotaryHash.verifyBatchInclusion({
          mode: NotaryScript.MODE.BATCH,
          proofHash: p.proofHash,
          merkle: {
            root: vector.root,
            leafIndex: i,
            leafCount: vector.leafCount,
            path: p.path
          }
        })
        report.valid.should.equal(true, 'leaf ' + i)
        report.errors.should.deep.equal([])
      })
    })

    // An implementation that chose the other reading produces exactly this, and this is
    // what it looks like when it reaches our verifier.
    it('rejects a certificate carrying the rejected reading root', function () {
      var report = NotaryHash.verifyBatchInclusion({
        mode: NotaryScript.MODE.BATCH,
        proofHash: vector.proofs[0].proofHash,
        merkle: {
          root: vector.rejectedReading.root,
          leafIndex: 0,
          leafCount: vector.leafCount,
          path: vector.proofs[0].path
        }
      })
      report.valid.should.equal(false)
    })
  })
})
