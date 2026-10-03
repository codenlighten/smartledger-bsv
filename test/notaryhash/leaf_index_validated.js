'use strict'

/* global describe, it, before */

// `merkle.leafIndex` was an unvalidated assertion sitting beside validated ones.
//
// A sided audit path folds by its OWN sides, and `Certificate.normalize` returns a non-legacy
// certificate untouched — so for a reference certificate `leafIndex` was read and never used. It
// could be changed to any other value in range and the proof still verified. A legacy certificate
// was fine, because normalising it DERIVES the sides from `leafIndex`, so a wrong index produced a
// wrong fold and failed. Moving from legacy to reference therefore silently lost a check.
//
// `leafCount` is pinned by the on-chain `u32be` that `recordMatchesCertificate` compares, and a
// mis-stated count that implies the same side sequence is legitimately indistinguishable here —
// that is what the on-chain value is for. `leafIndex` appears on chain nowhere, so this is the
// only place it can be checked, and RFC 6962 already determines the sides from the index and the
// tree size, so checking costs one pass and no hashing.
//
// Reported by the ordinals mint anchoring BRC-220 proofs, whose tamper test caught it on the
// format move.

require('chai').should()
const bsv = require('../..')
const NotaryHash = bsv.NotaryHash
const Merkle = NotaryHash.Merkle

describe('merkle.leafIndex is validated against the path it sits beside', function () {
  let leaves, root, cert
  const INDEX = 3
  const COUNT = 25

  before(function () {
    leaves = []
    for (let n = 0; n < COUNT; n++) leaves.push(bsv.crypto.Hash.sha256(Buffer.from('leaf ' + n)))
    root = Merkle.root(leaves)
    const audit = Merkle.auditPath(leaves, INDEX)
    const key = bsv.PrivateKey.fromString('11'.repeat(32))
    cert = {
      protocol: 'NotaryHash',
      version: '1.0',
      mode: 'full',
      algorithm: 'ECDSA-secp256k1',
      hashAlgorithm: 'SHA-256',
      encoding: 'hex',
      payloadHash: 'aa'.repeat(32),
      publicKey: key.toPublicKey().toBuffer().toString('hex'),
      signature: '00'.repeat(64),
      proofHash: leaves[INDEX].toString('hex'),
      createdAt: '2026-10-03T00:00:00.000Z',
      anchor: { type: 'batch', network: 'bsv-mainnet', txid: 'cd'.repeat(32), vout: 0 },
      merkle: {
        root: root.toString('hex'),
        leafIndex: INDEX,
        leafCount: COUNT,
        path: audit.map(n => ({ hash: n.hash.toString('hex'), side: n.side }))
      }
    }
  })

  function withChange (mutate) {
    const c = JSON.parse(JSON.stringify(cert))
    mutate(c)
    return NotaryHash.verifyBatchInclusion(c)
  }

  it('accepts a correct proof', function () {
    const r = withChange(function () {})
    r.valid.should.equal(true)
    r.errors.should.deep.equal([])
  })

  it('rejects a leafIndex that implies different sides', function () {
    // 3 -> 7: same path length, different side sequence.
    const r = withChange(c => { c.merkle.leafIndex = 7 })
    r.valid.should.equal(false)
    r.errors[0].should.contain('leafIndex 7 disagrees with the path')
  })

  it('rejects leafIndex 0, which a forger would reach for first', function () {
    const r = withChange(c => { c.merkle.leafIndex = 0 })
    r.valid.should.equal(false)
    r.errors[0].should.contain('disagrees with the path')
  })

  it('rejects a leafIndex that implies a different path LENGTH', function () {
    // 24 is the last leaf of 25, which sits at a shallower depth.
    const r = withChange(c => { c.merkle.leafIndex = 24 })
    r.valid.should.equal(false)
    r.errors[0].should.contain('needs 2 path nodes')
  })

  it('still rejects a corrupted path hash, by the fold', function () {
    const r = withChange(c => { c.merkle.path[0].hash = 'ff' + c.merkle.path[0].hash.slice(2) })
    r.valid.should.equal(false)
    r.errors[0].should.contain('does not fold')
  })

  it('still rejects a flipped side', function () {
    const r = withChange(c => {
      c.merkle.path[0].side = c.merkle.path[0].side === 'left' ? 'right' : 'left'
    })
    r.valid.should.equal(false)
  })

  it('leaves a single-leaf batch working', function () {
    const one = bsv.crypto.Hash.sha256(Buffer.from('solo'))
    const c = Object.assign({}, cert, {
      proofHash: one.toString('hex'),
      merkle: { root: Merkle.root([one]).toString('hex'), leafIndex: 0, leafCount: 1, path: [] }
    })
    NotaryHash.verifyBatchInclusion(c).valid.should.equal(true)
  })

  it('accepts every leaf of the tree at its own index', function () {
    for (let i = 0; i < COUNT; i++) {
      const audit = Merkle.auditPath(leaves, i)
      const c = Object.assign({}, cert, {
        proofHash: leaves[i].toString('hex'),
        merkle: {
          root: root.toString('hex'),
          leafIndex: i,
          leafCount: COUNT,
          path: audit.map(n => ({ hash: n.hash.toString('hex'), side: n.side }))
        }
      })
      NotaryHash.verifyBatchInclusion(c).valid.should.equal(true, 'leaf ' + i + ' should verify')
    }
  })

  it('and rejects every leaf claimed at a DIFFERENT index', function () {
    let rejected = 0
    for (let i = 0; i < COUNT; i++) {
      const audit = Merkle.auditPath(leaves, i)
      const wrong = (i + 1) % COUNT
      const c = Object.assign({}, cert, {
        proofHash: leaves[i].toString('hex'),
        merkle: {
          root: root.toString('hex'),
          leafIndex: wrong,
          leafCount: COUNT,
          path: audit.map(n => ({ hash: n.hash.toString('hex'), side: n.side }))
        }
      })
      if (!NotaryHash.verifyBatchInclusion(c).valid) rejected++
    }
    // Every mislabelled leaf must be refused; none may slip through.
    rejected.should.equal(COUNT)
  })
})
