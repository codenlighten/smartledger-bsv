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
// This library reads `d` as proofHash, as the reference implementation's batcher does.
// The alternative reading, d = canonicalBytes, is equally sound cryptographically and
// produces a DIFFERENT root — so the two do not interoperate, and the failure is silent:
// the fold just does not reach the root.
//
// These tests pin the choice, and pin the divergence too. A comment saying "we use
// proofHash" would not fail if someone changed it; this does.
//
// Reasoning and spec text, filed as bsv-blockchain/BRCs#246:
// docs/BRC220_BATCH_LEAF_AMENDMENT.md

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

// The path as a certificate carries it: hex hashes, each with its side.
function sided (path) {
  return path.map(function (n) { return { hash: n.hash.toString('hex'), side: n.side } })
}

function batchCertificate (index, leaves) {
  return {
    mode: 'full',
    proofHash: leaves[index].toString('hex'),
    anchor: { type: 'batch' },
    merkle: {
      root: Merkle.root(leaves).toString('hex'),
      leafIndex: index,
      leafCount: leaves.length,
      path: sided(Merkle.auditPath(leaves, index))
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
        mode: 'full',
        proofHash: proofHashes[1].toString('hex'),
        anchor: { type: 'batch' },
        merkle: {
          // Root and path from the canonicalBytes tree — the other reading.
          root: Merkle.root(canonicalBytesSet).toString('hex'),
          leafIndex: 1,
          leafCount: 4,
          path: sided(Merkle.auditPath(canonicalBytesSet, 1))
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

  // The sides are what the fold follows, so each one is load-bearing.
  describe('the path is folded by its sides', function () {
    it('rejects a path with one side flipped', function () {
      var cert = batchCertificate(1, PROOF_HASHES)
      cert.merkle.path[0].side = cert.merkle.path[0].side === 'left' ? 'right' : 'left'
      NotaryHash.verifyBatchInclusion(cert).valid.should.equal(false)
    })

    it('rejects a path whose sibling hashes are swapped between levels', function () {
      var cert = batchCertificate(1, PROOF_HASHES)
      var p = cert.merkle.path
      var h = p[0].hash
      p[0].hash = p[1].hash
      p[1].hash = h
      NotaryHash.verifyBatchInclusion(cert).valid.should.equal(false)
    })

    // A path written by 8.3.0–9.8.0 carried bare hashes; its sides are derived from
    // leafIndex and leafCount, so there the index IS load-bearing.
    it('reads a legacy bare-hash path, deriving its sides from leafIndex', function () {
      function legacy (leafIndex) {
        return {
          version: 1,
          mode: NotaryScript.MODE.BATCH,
          proofHash: PROOF_HASHES[1].toString('hex'),
          anchor: { txid: 'ab'.repeat(32) },
          merkle: {
            root: Merkle.root(PROOF_HASHES).toString('hex'),
            leafIndex: leafIndex,
            leafCount: 4,
            path: Merkle.path(PROOF_HASHES, 1).map(function (n) { return n.toString('hex') })
          }
        }
      }
      NotaryHash.verifyBatchInclusion(legacy(1)).valid.should.equal(true)
      NotaryHash.verifyBatchInclusion(legacy(0)).valid.should.equal(false)
    })
  })

  describe('the verdict is a strict report, not a truthy object', function () {
    it('reports valid:false rather than throwing on a malformed merkle object', function () {
      var report = NotaryHash.verifyBatchInclusion({
        mode: 'full',
        proofHash: PROOF_HASHES[0].toString('hex'),
        anchor: { type: 'batch' },
        merkle: { root: 'not-hex', leafIndex: 0, leafCount: 1, path: [] }
      })
      report.valid.should.equal(false)
      report.errors.length.should.be.above(0)
    })

    it('rejects a certificate whose anchor is not a batch anchor', function () {
      var report = NotaryHash.verifyBatchInclusion({
        mode: 'full',
        proofHash: PROOF_HASHES[0].toString('hex'),
        anchor: { type: 'direct' }
      })
      report.valid.should.equal(false)
      report.errors.should.deep.equal(['certificate is not batch-anchored (anchor.type is not "batch")'])
    })

    it('rejects a batch anchor with no merkle proof', function () {
      var report = NotaryHash.verifyBatchInclusion({
        mode: 'full',
        proofHash: PROOF_HASHES[0].toString('hex'),
        anchor: { type: 'batch' }
      })
      report.valid.should.equal(false)
      report.errors.should.deep.equal(['batch certificate has no merkle proof'])
    })
  })
})
