'use strict'

/* global describe, it */

// SPV Merkle inclusion proofs, cross-checked against the codebase's own Merkle
// tree algorithm (lib/block/block.js getMerkleTree). For random trees of many
// shapes (even, odd, duplicate-last), extract the branch for each leaf and assert
// the SPV verifier recomputes the exact same root — then assert tampering fails.

require('chai').should()
var bsv = require('../..')
var SPV = bsv.SPV
var Hash = bsv.crypto.Hash

function rev (b) { return Buffer.from(b).reverse() }

// Build the flat merkle tree exactly like Block.getMerkleTree (leaves = internal-LE).
function buildTree (leaves) {
  var tree = leaves.slice()
  var j = 0
  for (var size = leaves.length; size > 1; size = Math.floor((size + 1) / 2)) {
    for (var i = 0; i < size; i += 2) {
      var i2 = Math.min(i + 1, size - 1)
      tree.push(Hash.sha256sha256(Buffer.concat([tree[j + i], tree[j + i2]])))
    }
    j += size
  }
  return tree
}
function rootOf (leaves) { var t = buildTree(leaves); return t[t.length - 1] }

// Extract the sibling branch (display-order hex) for a leaf, mirroring the tree layout.
function branchFor (leaves, index) {
  var tree = buildTree(leaves)
  var branch = []
  var j = 0
  var idx = index
  for (var size = leaves.length; size > 1; size = Math.floor((size + 1) / 2)) {
    var sib = idx ^ 1
    if (sib >= size) sib = idx // odd end -> duplicate self
    branch.push(rev(tree[j + sib]).toString('hex'))
    j += size
    idx = Math.floor(idx / 2)
  }
  return branch
}

function randLeaves (n) {
  var a = []
  for (var i = 0; i < n; i++) a.push(bsv.crypto.Random.getRandomBuffer(32))
  return a
}

describe('SPV.verifyMerkleProof (cross-checked vs Block.getMerkleTree)', function () {
  var sizes = [1, 2, 3, 4, 5, 7, 8, 9, 16, 21]

  it('recomputes the root for every leaf across many tree shapes', function () {
    sizes.forEach(function (n) {
      var leaves = randLeaves(n)
      var root = rev(rootOf(leaves)).toString('hex') // display order
      for (var idx = 0; idx < n; idx++) {
        var txid = rev(leaves[idx]).toString('hex')
        var nodes = branchFor(leaves, idx)
        SPV.merkleRootFromBranch(txid, idx, nodes).should.equal(root,
          'size ' + n + ' index ' + idx)
        SPV.verifyMerkleProof({ txid: txid, index: idx, nodes: nodes, merkleRoot: root })
          .should.equal(true)
      }
    })
  })

  it('rejects a tampered branch node', function () {
    var leaves = randLeaves(6)
    var root = rev(rootOf(leaves)).toString('hex')
    var nodes = branchFor(leaves, 2)
    nodes[0] = rev(bsv.crypto.Random.getRandomBuffer(32)).toString('hex') // wrong sibling
    SPV.verifyMerkleProof({ txid: rev(leaves[2]).toString('hex'), index: 2, nodes: nodes, merkleRoot: root })
      .should.equal(false)
  })

  it('rejects the right proof against the wrong txid', function () {
    var leaves = randLeaves(8)
    var root = rev(rootOf(leaves)).toString('hex')
    var nodes = branchFor(leaves, 3)
    var wrongTxid = rev(bsv.crypto.Random.getRandomBuffer(32)).toString('hex')
    SPV.verifyMerkleProof({ txid: wrongTxid, index: 3, nodes: nodes, merkleRoot: root })
      .should.equal(false)
  })

  it("accepts '*' as the odd-node duplicate marker", function () {
    // 3 leaves: index 2 is the odd one; its level-0 sibling is itself.
    var leaves = randLeaves(3)
    var root = rev(rootOf(leaves)).toString('hex')
    var nodes = branchFor(leaves, 2)
    nodes[0] = '*' // replace the explicit self-hash with the duplicate marker
    SPV.verifyMerkleProof({ txid: rev(leaves[2]).toString('hex'), index: 2, nodes: nodes, merkleRoot: root })
      .should.equal(true)
  })

  it('single-tx block: empty branch, root == txid', function () {
    var leaves = randLeaves(1)
    var txid = rev(leaves[0]).toString('hex')
    SPV.merkleRootFromBranch(txid, 0, []).should.equal(txid)
  })

  it('verifyTxInclusion binds the branch to a header merkle root', function () {
    var leaves = randLeaves(5)
    var rootInternal = rootOf(leaves)
    var header = new bsv.BlockHeader({
      version: 1,
      prevHash: Buffer.alloc(32),
      merkleRoot: rootInternal, // internal-LE buffer
      time: 1231006505,
      bits: 0x1d00ffff,
      nonce: 0
    })
    var res = SPV.verifyTxInclusion({
      txid: rev(leaves[3]).toString('hex'),
      index: 3,
      nodes: branchFor(leaves, 3),
      header: header,
      requirePow: false // synthetic header has no real PoW
    })
    res.rootMatches.should.equal(true)
    res.valid.should.equal(true)

    // Wrong index -> root mismatch.
    SPV.verifyTxInclusion({
      txid: rev(leaves[3]).toString('hex'), index: 1,
      nodes: branchFor(leaves, 3), header: header, requirePow: false
    }).valid.should.equal(false)
  })
})
