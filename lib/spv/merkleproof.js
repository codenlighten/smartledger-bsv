'use strict'
/**
 * SPV Merkle inclusion proofs.
 *
 * Trustlessly verify that a transaction is included in a block, given a Merkle
 * branch proof and a trusted block header — no full node and no trust in the data
 * provider. This is the real inclusion check that replaces the "trust the caller's
 * txData" anchor stubs: a provider (explorer / node) can lie about a tx being mined,
 * but it cannot forge a Merkle branch that hashes to a proof-of-work-backed header's
 * merkle root.
 *
 * Byte order: `txid`, branch `nodes` and `merkleRoot` are DISPLAY-order hex (big
 * endian, as block explorers show them). Bitcoin hashes internally in little-endian,
 * so we reverse on the way in/out. Nodes are combined with double-SHA256, matching
 * lib/block/{block,merkleblock}.js. A node of '*' (or '' / null) means "duplicate the
 * working hash" — Bitcoin's odd-node rule, per the TSC Merkle Proof standard.
 */
var BlockHeader = require('../block/blockheader')
var BN = require('../crypto/bn')
var Hash = require('../crypto/hash')

var HEX32 = /^[0-9a-fA-F]{64}$/

// 2^256, for turning a target into the work it represents.
var TWO_256 = BlockHeader.Constants.LARGEST_HASH

/**
 * The easiest target a header may declare and still be believed: difficulty 1,
 * `0x1d00ffff`, which is the proof-of-work limit of both mainnet and testnet. Regtest
 * headers declare `0x207fffff` and are only checked when a caller asks for that limit.
 */
var POW_LIMIT_BITS = 0x1d00ffff

/**
 * A compact target (`bits`) as a BN, or null if the encoding is one no header may use.
 *
 * Transcribed from Bitcoin's arith_uint256::SetCompact and CheckProofOfWork: a negative
 * target, a zero target and an overflowing target are all refused. `getTargetDifficulty`
 * on BlockHeader implements none of those rules and shifts the wrong way for a size
 * below 4, so it is not used here.
 *
 * @param {Number} bits
 * @returns {BN|null}
 */
function targetFromBits (bits) {
  var size = bits >>> 24
  var word = bits & 0x007fffff
  var target
  // SetCompact shifts BEFORE its zero, negative and overflow tests, so a small size whose
  // shifted word is zero gives a target of zero and is refused. Testing the raw word
  // instead returned a target of 0, and 0 made workFromTarget report 2^256 of work.
  if (size <= 3) {
    word = word >>> (8 * (3 - size))
    target = new BN(word)
  } else {
    target = new BN(word).shln(8 * (size - 3))
  }
  if (word === 0) return null // zero: no hash can be at or below it
  if ((bits & 0x00800000) !== 0) return null // negative
  if ((size > 34) || (word > 0xff && size > 33) || (word > 0xffff && size > 32)) return null
  return target
}

/** The work a target represents: 2^256 / (target + 1). Difficulty 1 is about 4.295e9. */
function workFromTarget (target) {
  return TWO_256.div(target.add(new BN(1)))
}

function targetLimit (powLimit) {
  if (powLimit === undefined || powLimit === null) powLimit = POW_LIMIT_BITS
  // A BN is taken as the target itself. The node's limit is a uint256 (2^224 - 1 on
  // mainnet), and for compact bits the two agree, because 0x1d00ffff is the largest
  // compact target at or below it; a BN limit can sit anywhere between them. It still has
  // to be a target: 2^256 or above is not a limit at all, and zero admits nothing.
  if (BN.isBN(powLimit)) {
    if (powLimit.isNeg() || powLimit.isZero() || powLimit.cmp(TWO_256) >= 0) {
      throw new Error('powLimit as a BN must be a target above zero and below 2^256')
    }
    return powLimit
  }
  var bits
  if (typeof powLimit === 'string') {
    // parseInt stops at the first character it dislikes: '1d00ffzz' would silently
    // become 0x1d00ff, a different limit.
    if (!/^(0x)?[0-9a-fA-F]{1,8}$/.test(powLimit)) {
      throw new Error('powLimit must be compact bits as hex, a uint32, or a BN target, not ' +
        JSON.stringify(powLimit))
    }
    bits = parseInt(powLimit.replace(/^0x/, ''), 16)
  } else if (typeof powLimit === 'number' && Number.isInteger(powLimit) &&
    powLimit >= 0 && powLimit <= 0xffffffff) {
    bits = powLimit
  } else {
    throw new Error('powLimit must be compact bits as hex, a uint32, or a BN target, not ' +
      JSON.stringify(powLimit))
  }
  var target = targetFromBits(bits)
  if (!target) throw new Error('powLimit is not a usable compact target: ' + powLimit)
  return target
}

/**
 * `minWork` as a BN, refusing anything bn.js would read loosely. It parses `1e21` as
 * 23521, `'4.3e9'` as 4 and `'abc'` as 1122, so a floor set from a Number near the
 * chain's work would silently become a few thousand — a floor nothing fails.
 */
function minWorkBN (minWork) {
  if (BN.isBN(minWork)) {
    if (minWork.isNeg()) throw new Error('minWork as a BN must not be negative')
    return minWork
  }
  if (typeof minWork === 'number') {
    if (!Number.isSafeInteger(minWork) || minWork < 0) {
      throw new Error('minWork as a number must be a non-negative safe integer; for larger ' +
        'floors pass a decimal string or a BN, not ' + minWork)
    }
    return new BN(String(minWork), 10)
  }
  if (typeof minWork === 'string' && /^[0-9]+$/.test(minWork)) return new BN(minWork, 10)
  throw new Error('minWork must be a non-negative integer, a decimal string or a BN, not ' +
    JSON.stringify(minWork))
}

/**
 * Exactly 80 bytes of header, and a BlockHeader parsed from those same bytes.
 *
 * Every check reads this one snapshot, so a caller cannot pass an object whose stated
 * merkle root differs from the bytes its hash is taken over. An object that merely
 * states a root is refused outright: believing it is the trust the protocol removes.
 */
function headerSnapshot (header) {
  var buf
  if (Buffer.isBuffer(header)) buf = header
  else if (typeof header === 'string') {
    // Buffer.from stops at the first non-hex character, so 160 good characters followed
    // by junk would arrive as a clean 80 bytes.
    if (!/^[0-9a-fA-F]{160}$/.test(header)) {
      throw new Error('a block header as hex must be exactly 160 hex characters')
    }
    buf = Buffer.from(header, 'hex')
  } else if (header instanceof BlockHeader) buf = header.toBuffer()
  else if (header && typeof header.toBuffer === 'function') buf = header.toBuffer()
  else {
    throw new Error('a block header must be 80 bytes, as hex, a Buffer or a BlockHeader; ' +
      'an object stating a merkleRoot is not a header and cannot be checked')
  }
  if (!Buffer.isBuffer(buf) || buf.length !== 80) {
    throw new Error('a block header must be exactly 80 bytes, not ' +
      (Buffer.isBuffer(buf) ? buf.length : typeof buf))
  }
  return BlockHeader.fromBuffer(buf)
}

function rev (buf) { return Buffer.from(buf).reverse() }
function toInternal (hex) { return rev(Buffer.from(hex, 'hex')) } // display -> internal LE
function toDisplay (buf) { return rev(buf).toString('hex') }      // internal LE -> display

/**
 * Recompute the Merkle root from a branch proof.
 * @param {string} txid       display-order txid hex (64 hex chars)
 * @param {number} index      0-based position of the tx within the block
 * @param {Array<string>} nodes sibling hashes, leaf->root (display hex; '*' = duplicate)
 * @returns {string} the computed merkle root (display-order hex)
 */
function merkleRootFromBranch (txid, index, nodes) {
  if (!HEX32.test(String(txid))) throw new Error('txid must be 32-byte hex')
  if (!Number.isInteger(index) || index < 0) throw new Error('index must be a non-negative integer')
  nodes = nodes || []
  var cur = toInternal(txid)
  var idx = index
  for (var i = 0; i < nodes.length; i++) {
    var node = nodes[i]
    var sib
    if (node === '*' || node === '' || node == null) {
      sib = cur // odd-node: the working hash is duplicated
    } else {
      if (!HEX32.test(String(node))) throw new Error('proof node ' + i + ' must be 32-byte hex or "*"')
      sib = toInternal(node)
    }
    // idx even -> current is the LEFT child; idx odd -> current is the RIGHT child.
    cur = (idx & 1)
      ? Hash.sha256sha256(Buffer.concat([sib, cur]))
      : Hash.sha256sha256(Buffer.concat([cur, sib]))
    idx = Math.floor(idx / 2)
  }
  return toDisplay(cur)
}

/**
 * Verify a Merkle branch proof against an expected root.
 * @param {object} proof { txid, index, nodes, merkleRoot } (all display-order hex)
 * @returns {boolean}
 */
function verifyMerkleProof (proof) {
  if (!proof || !proof.merkleRoot) throw new Error('proof.merkleRoot is required')
  var computed = merkleRootFromBranch(proof.txid, proof.index, proof.nodes)
  return computed.toLowerCase() === String(proof.merkleRoot).toLowerCase()
}

/**
 * Verify a transaction is included in a block: branch -> root, root == the root in the
 * header's own bytes, and (unless disabled) the header's proof of work.
 *
 * A header's work is only as good as the target it declares, and a header declares its
 * own. `hash <= target` alone therefore proves nothing: with `bits` of 0x2100ffff nearly
 * every hash passes (65535 in 65536), so a forged header costs one attempt. The declared
 * target is capped at
 * `powLimit` — difficulty 1 by default, the limit of mainnet and testnet — and
 * `minWork` can demand more.
 *
 * NOTE: this proves inclusion in the SUPPLIED header. Even a genuine, fully worked
 * header can belong to an orphaned block; only a chain source knows which block is the
 * chain's at a height. That check is the caller's, out of band.
 *
 * @param {object} params { txid, index, nodes, header, requirePow=true, powLimit, minWork }
 *   header:   a bsv.BlockHeader, an 80-byte Buffer, or 80-byte hex.
 *   powLimit: the easiest target a header may declare, as compact bits (number or hex
 *             string) or a BN target. Default 0x1d00ffff. Regtest needs 0x207fffff.
 *   minWork:  minimum work the header must represent (number, decimal string or BN);
 *             2^256 / (target + 1). Difficulty 1 is about 4.295e9.
 * With `requirePow: false` the work checks are not performed at all: `targetAllowed` and
 * `workSufficient` report true because nothing objected, and `powLimit`/`minWork` are not
 * even read.
 *
 * @returns {{ valid:boolean, rootMatches:boolean, powValid:boolean, targetAllowed:boolean,
 *   workSufficient:boolean, work:string, merkleRoot:string, blockHash:string }}
 */
function verifyTxInclusion (params) {
  var header = headerSnapshot(params.header)

  var headerRoot = toDisplay(header.merkleRoot) // the root as the header's own bytes give it
  var computed = merkleRootFromBranch(params.txid, params.index, params.nodes)
  var rootMatches = computed.toLowerCase() === headerRoot.toLowerCase()

  var requirePow = params.requirePow !== false
  var target = targetFromBits(header.bits)
  var powValid = target !== null && new BN(header.id, 'hex').cmp(target) <= 0
  var work = target === null ? new BN(0) : workFromTarget(target)
  // Both are policy the caller supplies, so neither is read — nor rejected as malformed —
  // when the work checks are off.
  var targetAllowed = target !== null &&
    (!requirePow || target.cmp(targetLimit(params.powLimit)) <= 0)
  var workSufficient = !requirePow || params.minWork === undefined || params.minWork === null ||
    work.cmp(minWorkBN(params.minWork)) >= 0

  return {
    valid: rootMatches && (!requirePow || (powValid && targetAllowed && workSufficient)),
    rootMatches: rootMatches,
    powValid: powValid,
    targetAllowed: targetAllowed,
    workSufficient: workSufficient,
    work: work.toString(10),
    merkleRoot: computed,
    blockHash: header.id
  }
}

module.exports = {
  POW_LIMIT_BITS: POW_LIMIT_BITS,
  // Internal to lib/spv: headerchain applies the same cap. Not re-exported by lib/spv,
  // because the public surface is deliberately hard to grow (see test/api_surface.js).
  targetFromBits: targetFromBits,
  targetLimit: targetLimit,
  workFromTarget: workFromTarget,
  headerSnapshot: headerSnapshot,
  merkleRootFromBranch: merkleRootFromBranch,
  verifyMerkleProof: verifyMerkleProof,
  verifyTxInclusion: verifyTxInclusion
}
