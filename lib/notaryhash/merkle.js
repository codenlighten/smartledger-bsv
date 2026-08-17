'use strict'

var Hash = require('../crypto/hash')
var $ = require('../util/preconditions')

/**
 * RFC 6962 Merkle trees, for BRC-220 batch mode.
 *
 * THIS IS NOT THE BITCOIN MERKLE TREE, and it is not the one in lib/gdaf/zk-prover.js
 * either. Three trees now live in this repository and all three differ:
 *
 *   lib/spv/merkleproof.js   leaf = txid            node = sha256d(l‖r)   odd leaf DUPLICATED
 *   lib/gdaf/zk-prover.js    leaf = salted hash     node = sha256(l‖r)    odd leaf duplicated
 *   here (RFC 6962)          leaf = sha256(0x00‖d)  node = sha256(0x01‖l‖r)  NEVER duplicated
 *
 * The domain separation and the no-duplication rule are what make RFC 6962 resistant to
 * the second-preimage attack Bitcoin's tree is famously open to: without the 0x00/0x01
 * prefixes, an internal node can be reinterpreted as a leaf.
 *
 * Reusing either of the other two here would produce a root that no other BRC-220
 * implementation computes, and the failure would surface only when somebody else tried
 * to verify a batch certificate. That is why this file exists rather than an import.
 *
 * One more trap: RFC 6962 splits at the LARGEST POWER OF TWO STRICTLY LESS THAN n, not at
 * the midpoint. For n = 5 that is 4/1, where a midpoint split gives 2/3 and a different
 * root. Every non-power-of-two tree depends on getting this right.
 */

/**
 * For BRC-220 batch mode the leaf datum `d` is a certificate's **proofHash**, so a leaf
 * is `SHA-256(0x00 ‖ proofHash)`. The spec writes `leaf = SHA256(0x00 ‖ d)` using
 * RFC 6962's generic notation and never binds `d`; passing `canonicalBytes` instead is
 * equally sound and yields a different root, which NotaryHash.verifyBatchInclusion will
 * reject. See docs/BRC220_BATCH_LEAF_AMENDMENT.md.
 */

var Merkle = {}

/** Prefix bytes, per RFC 6962 §2.1. */
Merkle.LEAF_PREFIX = 0x00
Merkle.NODE_PREFIX = 0x01

/**
 * Hash a leaf: `SHA-256(0x00 || d)`.
 *
 * @param {Buffer} d
 * @returns {Buffer} 32 bytes
 */
Merkle.hashLeaf = function (d) {
  $.checkArgument(Buffer.isBuffer(d), 'leaf data must be a Buffer')
  return Hash.sha256(Buffer.concat([Buffer.from([Merkle.LEAF_PREFIX]), d]))
}

/**
 * Hash an internal node: `SHA-256(0x01 || left || right)`.
 *
 * @param {Buffer} left
 * @param {Buffer} right
 * @returns {Buffer} 32 bytes
 */
Merkle.hashNode = function (left, right) {
  return Hash.sha256(Buffer.concat([Buffer.from([Merkle.NODE_PREFIX]), left, right]))
}

/**
 * The largest power of two strictly less than n.
 *
 * RFC 6962 splits here rather than at the midpoint, which is what makes its trees
 * left-complete. For n = 5 this is 4, so the split is 4/1 — a midpoint split would give
 * 2/3 and a root no conformant implementation would agree with.
 *
 * @param {Number} n - at least 2
 * @returns {Number}
 */
Merkle.largestPowerOfTwoBelow = function (n) {
  $.checkArgument(Number.isInteger(n) && n >= 2, 'n must be an integer >= 2')
  var k = 1
  while (k * 2 < n) k *= 2
  return k
}

/**
 * The Merkle Tree Hash of a list of leaf data, per RFC 6962 §2.1.
 *
 *   MTH({})       = SHA-256()                     — the hash of the empty string
 *   MTH({d})      = SHA-256(0x00 || d)
 *   MTH(D[n])     = SHA-256(0x01 || MTH(D[0:k]) || MTH(D[k:n]))
 *
 * @param {Array<Buffer>} leaves - the leaf DATA, not pre-hashed
 * @returns {Buffer} 32 bytes
 */
Merkle.root = function (leaves) {
  $.checkArgument(Array.isArray(leaves), 'leaves must be an array')

  // The empty tree is the hash of the empty string, not a zero buffer. Stated explicitly
  // because "no leaves" is easy to answer with 32 zero bytes and be wrong.
  if (leaves.length === 0) return Hash.sha256(Buffer.alloc(0))
  if (leaves.length === 1) return Merkle.hashLeaf(leaves[0])

  var k = Merkle.largestPowerOfTwoBelow(leaves.length)
  return Merkle.hashNode(
    Merkle.root(leaves.slice(0, k)),
    Merkle.root(leaves.slice(k))
  )
}

/**
 * The audit path for the leaf at `index`, per RFC 6962 §2.1.1.
 *
 * Returns sibling hashes ordered from the leaf upward. Unlike the Bitcoin proofs in
 * lib/spv, there is no direction flag: RFC 6962 recovers left/right from the index and
 * the tree size during folding, so the path is bare hashes and `verify` needs both
 * numbers.
 *
 * @param {Array<Buffer>} leaves
 * @param {Number} index
 * @returns {Array<Buffer>}
 */
Merkle.path = function (leaves, index) {
  $.checkArgument(Array.isArray(leaves) && leaves.length > 0, 'leaves must be a non-empty array')
  $.checkArgument(Number.isInteger(index) && index >= 0 && index < leaves.length,
    'index must be within the leaves')

  if (leaves.length === 1) return []

  var k = Merkle.largestPowerOfTwoBelow(leaves.length)

  if (index < k) {
    return Merkle.path(leaves.slice(0, k), index)
      .concat([Merkle.root(leaves.slice(k))])
  }
  return Merkle.path(leaves.slice(k), index - k)
    .concat([Merkle.root(leaves.slice(0, k))])
}

/**
 * Fold an audit path back to a root, per RFC 6962 §2.1.2.
 *
 * `leafCount` is required and is not decoration: the tree's shape at each level comes
 * from it, and RFC 6962 folding cannot be done from the path alone. Bitcoin proofs carry
 * a direction bit per node instead, which is why lib/spv's shape does not transfer here.
 *
 * @param {Buffer} leafData - the leaf DATA, hashed here
 * @param {Number} index
 * @param {Number} leafCount
 * @param {Array<Buffer>} path
 * @returns {Buffer} the computed root
 */
Merkle.foldPath = function (leafData, index, leafCount, path) {
  $.checkArgument(Buffer.isBuffer(leafData), 'leafData must be a Buffer')
  $.checkArgument(Number.isInteger(index) && index >= 0, 'index must be a non-negative integer')
  $.checkArgument(Number.isInteger(leafCount) && leafCount > 0, 'leafCount must be a positive integer')
  $.checkArgument(index < leafCount, 'index must be less than leafCount')
  $.checkArgument(Array.isArray(path), 'path must be an array')

  // RFC 6962 §2.1.2, transcribed rather than reinvented. The first attempt at this
  // descended from the root by repeatedly splitting at the largest power of two, which
  // is how root() builds the tree — but the audit path is ordered LEAF-UPWARD, so
  // top-down consumption pairs each sibling at the wrong level. It round-tripped for
  // powers of two and failed for 21 of the 45 leaves in trees of size 1..9.
  //
  // The RFC tracks two counters instead: fn, the node's index within its level, and sn,
  // the index of the last node in that level. A node folds as a RIGHT child when fn is
  // odd or when it is the last node in the level — which is what encodes "the rightmost
  // leaf is never duplicated" without a direction flag in the path.
  var r = Merkle.hashLeaf(leafData)
  var fn = index
  var sn = leafCount - 1

  for (var i = 0; i < path.length; i++) {
    if (sn === 0) {
      throw new Error('audit path is too long for a tree of ' + leafCount + ' leaves')
    }
    if ((fn & 1) === 1 || fn === sn) {
      r = Merkle.hashNode(path[i], r)
      while ((fn & 1) === 0 && fn !== 0) {
        fn >>= 1
        sn >>= 1
      }
    } else {
      r = Merkle.hashNode(r, path[i])
    }
    fn >>= 1
    sn >>= 1
  }

  if (sn !== 0) {
    throw new Error('audit path is too short for a tree of ' + leafCount + ' leaves')
  }

  return r
}

/**
 * Does a leaf belong to the tree with this root?
 *
 * Strict boolean, and false on any malformed input rather than throwing — a caller
 * writing `if (verifyInclusion(...))` must not receive a truthy object, which is the
 * defect class this codebase has fixed most often.
 *
 * @param {Buffer} leafData
 * @param {Number} index
 * @param {Number} leafCount
 * @param {Array<Buffer>} path
 * @param {Buffer} expectedRoot
 * @returns {Boolean}
 */
Merkle.verifyInclusion = function (leafData, index, leafCount, path, expectedRoot) {
  try {
    if (!Buffer.isBuffer(expectedRoot)) return false
    return Merkle.foldPath(leafData, index, leafCount, path).equals(expectedRoot)
  } catch (e) {
    return false
  }
}

module.exports = Merkle
