'use strict'

/* global describe, it */

// BRC-220 batch mode: what is in a Merkle leaf.
//
// The spec writes `leaf = SHA256(0x00 ‖ d)` and never binds `d`. That is RFC 6962's own
// generic notation for the construction, quoted to identify WHICH tree — domain
// separation, the power-of-two split, no duplicated last leaf — not to define the leaf's
// contents. `canonicalBytes` appears once in the whole document, in the proofHash
// definition, and nowhere in the batch text.
//
// This library reads `d` as proofHash. The alternative reading, d = canonicalBytes, is
// equally sound cryptographically and produces a DIFFERENT root — so the two do not
// interoperate, and the failure is silent: the fold just does not reach the root.
//
// These tests pin the choice, and pin the divergence too. A comment saying "we use
// proofHash" would not fail if someone changed it; this does.
//
// Reasoning and proposed spec text: docs/BRC220_BATCH_LEAF_AMENDMENT.md

require('chai').should()
var NotaryHash = require('../../lib/notaryhash')
var Merkle = require('../../lib/notaryhash/merkle')
var Hash = require('../../lib/crypto/hash')
var NotaryScript = require('../../lib/notaryhash/script')

// Four fixed proofHash values, standing in for a four-proof batch.
var PROOF_HASHES = [
  '00'.repeat(31) + '01',
  '00'.repeat(31) + '02',
  'ab'.repeat(32),
  'ff'.repeat(32)
].map(function (h) { return Buffer.from(h, 'hex') })

function batchCertificate (index, leaves) {
  return {
    mode: NotaryScript.MODE.BATCH,
    proofHash: leaves[index].toString('hex'),
    merkle: {
      root: Merkle.root(leaves).toString('hex'),
      leafIndex: index,
      leafCount: leaves.length,
      path: Merkle.path(leaves, index).map(function (n) { return n.toString('hex') })
    }
  }
}

describe('BRC-220 batch leaf', function () {
  describe('the leaf datum is proofHash', function () {
    it('a leaf is SHA-256(0x00 || proofHash)', function () {
      var proofHash = PROOF_HASHES[0]
      Merkle.hashLeaf(proofHash).toString('hex').should.equal(
        Hash.sha256(Buffer.concat([Buffer.from([0x00]), proofHash])).toString('hex')
      )
    })

    // Stated the long way round, because this is the identity the spec leaves open.
    it('is therefore SHA-256(0x00 || SHA-256(canonicalBytes))', function () {
      var canonicalBytes = Buffer.from('any canonical proof bytes at all')
      var proofHash = Hash.sha256(canonicalBytes)
      Merkle.hashLeaf(proofHash).toString('hex').should.equal(
        Hash.sha256(Buffer.concat([
          Buffer.from([0x00]), Hash.sha256(canonicalBytes)
        ])).toString('hex')
      )
    })

    it('verifies inclusion for every leaf of a four-proof batch', function () {
      for (var i = 0; i < PROOF_HASHES.length; i++) {
        var report = NotaryHash.verifyBatchInclusion(batchCertificate(i, PROOF_HASHES))
        report.valid.should.equal(true, 'leaf ' + i + ' should verify')
        report.errors.should.deep.equal([])
      }
    })
  })

  describe('the two readings of `d` are not interchangeable', function () {
    var canonicalBytesSet = [
      Buffer.from('proof one canonical bytes'),
      Buffer.from('proof two canonical bytes'),
      Buffer.from('proof three canonical bytes'),
      Buffer.from('proof four canonical bytes')
    ]
    var proofHashes = canonicalBytesSet.map(function (b) { return Hash.sha256(b) })

    it('produces a different root under each reading', function () {
      Merkle.root(proofHashes).toString('hex')
        .should.not.equal(Merkle.root(canonicalBytesSet).toString('hex'))
    })

    // The interoperability failure, made concrete. This is what a batch built by an
    // implementation using the other reading would look like to this verifier.
    it('REJECTS a certificate whose tree was built over canonicalBytes', function () {
      var certificate = {
        mode: NotaryScript.MODE.BATCH,
        proofHash: proofHashes[1].toString('hex'),
        merkle: {
          // Root and path from the canonicalBytes tree — the other reading.
          root: Merkle.root(canonicalBytesSet).toString('hex'),
          leafIndex: 1,
          leafCount: 4,
          path: Merkle.path(canonicalBytesSet, 1).map(function (n) { return n.toString('hex') })
        }
      }
      var report = NotaryHash.verifyBatchInclusion(certificate)
      report.valid.should.equal(false)
      report.errors.should.deep.equal(['merkle inclusion proof does not fold to the batch root'])
    })

    // Both are sound; neither is being called wrong. The point is only that a choice had
    // to be made and that it is checkable.
    it('both readings are domain-separated and second-preimage resistant', function () {
      var leafBytes = Buffer.alloc(64, 7)
      Merkle.hashLeaf(leafBytes).toString('hex')
        .should.not.equal(Merkle.hashNode(Buffer.alloc(32, 7), Buffer.alloc(32, 7)).toString('hex'))
    })
  })

  describe('the verdict is a strict report, not a truthy object', function () {
    it('reports valid:false rather than throwing on a malformed merkle object', function () {
      var report = NotaryHash.verifyBatchInclusion({
        mode: NotaryScript.MODE.BATCH,
        proofHash: PROOF_HASHES[0].toString('hex'),
        merkle: { root: 'not-hex', leafIndex: 0, leafCount: 1, path: [] }
      })
      report.valid.should.equal(false)
      report.errors.length.should.be.above(0)
    })

    it('rejects a non-batch certificate by mode', function () {
      var report = NotaryHash.verifyBatchInclusion({
        mode: NotaryScript.MODE.FULL,
        proofHash: PROOF_HASHES[0].toString('hex')
      })
      report.valid.should.equal(false)
      report.errors.should.deep.equal(['certificate is not in batch mode'])
    })
  })
})
