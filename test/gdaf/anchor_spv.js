'use strict'

/* global describe, it */

// Trustless SPV anchor verification end-to-end: build a real anchoring tx with an
// OP_RETURN commitment, place it in a block, prove its inclusion with a Merkle
// branch + header, and verify through SmartLedgerAnchor.verifyAnchor with NO trusted
// provider. Replaces the old {verified:true} stub / trust-the-caller-txData path.

require('chai').should()
var bsv = require('../..')
var Anchor = require('../../lib/gdaf/smartledger-anchor')
var Hash = bsv.crypto.Hash

function rev (b) { return Buffer.from(b).reverse() }
function buildTree (leaves) {
  var tree = leaves.slice(); var j = 0
  for (var size = leaves.length; size > 1; size = Math.floor((size + 1) / 2)) {
    for (var i = 0; i < size; i += 2) {
      var i2 = Math.min(i + 1, size - 1)
      tree.push(Hash.sha256sha256(Buffer.concat([tree[j + i], tree[j + i2]])))
    }
    j += size
  }
  return tree
}
function rootOf (l) { var t = buildTree(l); return t[t.length - 1] }
function branchFor (leaves, index) {
  var tree = buildTree(leaves); var branch = []; var j = 0; var idx = index
  for (var size = leaves.length; size > 1; size = Math.floor((size + 1) / 2)) {
    var sib = idx ^ 1; if (sib >= size) sib = idx
    branch.push(rev(tree[j + sib]).toString('hex'))
    j += size; idx = Math.floor(idx / 2)
  }
  return branch
}

function anchorTxFor (hashHex) {
  var tx = new bsv.Transaction()
  tx.addOutput(new bsv.Transaction.Output({
    script: bsv.Script.buildDataOut(Buffer.from(hashHex, 'hex')),
    satoshis: 0
  }))
  return tx
}

function blockOf (rootInternal) {
  return new bsv.BlockHeader({
    version: 1, prevHash: Buffer.alloc(32), merkleRoot: rootInternal,
    time: 1231006505, bits: 0x1d00ffff, nonce: 0
  })
}

describe('SPV anchor verification (trustless)', function () {
  var anchorHash = Hash.sha256(Buffer.from('anchor me')).toString('hex')
  var atx = anchorTxFor(anchorHash)
  var rawTx = atx.uncheckedSerialize()
  var txid = atx.hash
  // Place the anchor tx at index 2 among 5 leaves.
  var leaves = [
    bsv.crypto.Random.getRandomBuffer(32),
    bsv.crypto.Random.getRandomBuffer(32),
    atx._getHash(),
    bsv.crypto.Random.getRandomBuffer(32),
    bsv.crypto.Random.getRandomBuffer(32)
  ]
  var header = blockOf(rootOf(leaves))
  var spvProof = { index: 2, nodes: branchFor(leaves, 2) }

  it('verifies inclusion + commitment with a valid proof', async function () {
    var res = await Anchor.verifyAnchor(txid, anchorHash, {
      spvProof: spvProof, header: header, rawTx: rawTx, requirePow: false
    })
    res.verified.should.equal(true)
    res.chainVerified.should.equal(true)
    res.committed.should.equal(true)
    res.txidBound.should.equal(true)
    res.proof.type.should.equal('spv_merkle_inclusion')
  })

  it('rejects when the tx does not commit to the expected hash', async function () {
    var otherHash = Hash.sha256(Buffer.from('something else')).toString('hex')
    var res = await Anchor.verifyAnchor(txid, otherHash, {
      spvProof: spvProof, header: header, rawTx: rawTx, requirePow: false
    })
    res.committed.should.equal(false)
    res.verified.should.equal(false)
  })

  it('rejects a tampered Merkle branch (inclusion fails)', async function () {
    var bad = { index: 2, nodes: branchFor(leaves, 2).slice() }
    bad.nodes[0] = rev(bsv.crypto.Random.getRandomBuffer(32)).toString('hex')
    var res = await Anchor.verifyAnchor(txid, anchorHash, {
      spvProof: bad, header: header, rawTx: rawTx, requirePow: false
    })
    res.chainVerified.should.equal(false)
    res.verified.should.equal(false)
  })

  it('rejects rawTx that does not hash to txid', async function () {
    var otherRaw = anchorTxFor(Hash.sha256(Buffer.from('decoy')).toString('hex')).uncheckedSerialize()
    var res = await Anchor.verifyAnchor(txid, anchorHash, {
      spvProof: spvProof, header: header, rawTx: otherRaw, requirePow: false
    })
    res.txidBound.should.equal(false)
    res.verified.should.equal(false)
  })

  it('still refuses to fabricate a result with neither an SPV proof nor a provider', async function () {
    var threw = false
    try { await Anchor.verifyAnchor(txid, anchorHash, {}) } catch (e) { threw = true }
    threw.should.equal(true)
  })
})
