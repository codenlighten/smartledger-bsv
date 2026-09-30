'use strict'

/* global describe, it */

// BRC-220 as merged, not as we proposed it.
//
// Our amendments #246 and #247 were merged upstream on 2026-09-18, and the maintainers reflowed
// the wording on the way in — so this library's own amendment documents quote text that no longer
// appears verbatim in apps/0220.md. The rule merged unchanged in substance, and this is where
// that claim is checked rather than asserted: the merged spec publishes a worked batch example,
// and we must reproduce its numbers exactly.
//
// If upstream ever changes the leaf rule, the root below stops matching and this fails — which is
// the point. A doc saying "the substance is unchanged" is worth nothing without it.

var expect = require('chai').expect
var Merkle = require('../../lib/notaryhash/merkle')
var vector = require('../data/brc220-batch-vector.json')

// Published in apps/0220.md, under "The `merkle` member of the last certificate in a five-proof
// batch". Copied from the merged spec, not from our fixture.
var MERGED_SPEC = {
  root: 'abb53eb3b2e3530d51685c6813bb85c85892d2f214c2dc504029d071434ac074',
  leafIndex: 4,
  leafCount: 5,
  path: [
    { hash: '060ca4e4bbcb647ab0162bb027cd8f08c1577aaa7069166dd629a3df7e57befd', side: 'left' }
  ]
}

describe('BRC-220 as merged upstream', function () {
  var leaves = vector.proofs.map(function (p) { return Buffer.from(p.proofHash, 'hex') })

  it('has five leaves, as the published example does', function () {
    expect(leaves.length).to.equal(MERGED_SPEC.leafCount)
    expect(vector.leafCount).to.equal(MERGED_SPEC.leafCount)
  })

  it('reproduces the merged spec\'s published batch root', function () {
    expect(Merkle.root(leaves).toString('hex')).to.equal(MERGED_SPEC.root)
  })

  it('reproduces the merged spec\'s published audit path for leaf 4', function () {
    var path = Merkle.auditPath(leaves, MERGED_SPEC.leafIndex)
    var normalised = path.map(function (e) {
      return {
        hash: Buffer.isBuffer(e.hash) ? e.hash.toString('hex') : e.hash,
        side: e.side
      }
    })
    expect(normalised).to.deep.equal(MERGED_SPEC.path)
  })

  it('has exactly one path element, because the last leaf is never duplicated', function () {
    // Five leaves split at the largest power of two below 5, which is 4. Leaf 4 is alone on the
    // right, so its path is one sibling. A Bitcoin-style tree would duplicate leaf 4 and give a
    // different root — the divergence the amendment existed to settle.
    expect(Merkle.auditPath(leaves, 4)).to.have.lengthOf(1)
    expect(Merkle.largestPowerOfTwoBelow(5)).to.equal(4)
  })

  it('folds that path back to the root', function () {
    var leaf = Merkle.hashLeaf(leaves[4])
    var root = Merkle.hashNode(Buffer.from(MERGED_SPEC.path[0].hash, 'hex'), leaf)
    expect(root.toString('hex')).to.equal(MERGED_SPEC.root)
  })
})
