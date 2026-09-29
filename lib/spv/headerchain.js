'use strict'
/**
 * SPV block-header chain verification — the confirmations half of the SPV story.
 *
 * verifyTxInclusion proves a tx is in a SUPPLIED header; this proves that header is
 * buried under real work by verifying a chain of consecutive headers: each links to
 * the previous (prevHash), each meets its own proof-of-work target, and (optionally)
 * the chain is anchored at a hash the caller independently trusts.
 *
 * TRUST MODEL — read this. It validates linkage + PER-HEADER proof-of-work, but NOT
 * the difficulty-retargeting schedule. Mining a header at an artificially easy `bits`
 * is no longer enough on its own: every header's DECLARED target must be at least as
 * hard as `opts.powLimit` (difficulty 1 by default), so a chain of free headers is
 * refused. Retargeting is still unchecked, so a fork whose headers are each above the
 * limit remains possible. For real assurance pass `opts.trustedHash` — a block hash you
 * already trust (from your own node, or a hardcoded checkpoint) that the chain's tip
 * (or anchor) must match; the headers around it are then real work extending a block
 * you trust. Full difficulty-retarget validation is intentionally out of scope here.
 */
var BN = require('../crypto/bn')
var merkleproof = require('./merkleproof')

function rev (b) { return Buffer.from(b).reverse() }

// Every header goes through the same 80-byte snapshot verifyTxInclusion uses, so a chain
// cannot be built from objects that merely claim a prevHash, an id and a passing
// validProofOfWork(). Their fields are read from the bytes, or there are no bytes.
function toHeader (h) {
  return merkleproof.headerSnapshot(h)
}

/**
 * @param {Array} headers  consecutive headers, oldest→newest (BlockHeader/Buffer/hex).
 * @param {object} [opts]
 *   requirePow {boolean=true}  verify each header meets its bits target.
 *   powLimit {number|string}   easiest target a header may declare, as compact bits.
 *                              Default 0x1d00ffff; regtest headers need 0x207fffff.
 *   trustedHash {string}       a block hash the chain's tip or anchor must equal.
 * @returns {{ valid, reason?, count, anchorHash, tipHash, work }}
 */
function verifyHeaderChain (headers, opts) {
  opts = opts || {}
  if (!Array.isArray(headers) || headers.length === 0) {
    throw new Error('headers must be a non-empty array')
  }
  var hs = headers.map(toHeader)
  var requirePow = opts.requirePow !== false
  var work = 0

  var limit = requirePow ? merkleproof.targetLimit(opts.powLimit) : null
  for (var i = 0; i < hs.length; i++) {
    // The declared target, read the way the node reads it. validProofOfWork() would use
    // BlockHeader.getTargetDifficulty, which disagrees with this for a size below 4, so
    // the hash test and the limit test would be against two different targets.
    var declared = merkleproof.targetFromBits(hs[i].bits)
    if (requirePow) {
      if (declared === null || new BN(hs[i].id, 'hex').cmp(declared) > 0) {
        return { valid: false, reason: 'invalid proof-of-work at index ' + i, count: hs.length }
      }
      // Work against a target the header chose for itself is not work. Without this, a
      // chain of headers mined at bits 0x2100ffff costs nothing and links perfectly.
      if (declared.cmp(limit) > 0) {
        return {
          valid: false,
          reason: 'target easier than the proof-of-work limit at index ' + i,
          count: hs.length
        }
      }
    }
    work += hs[i].getDifficulty()
    if (i > 0) {
      var linkOk = rev(hs[i].prevHash).toString('hex').toLowerCase() === hs[i - 1].id.toLowerCase()
      if (!linkOk) {
        return { valid: false, reason: 'broken link at index ' + i, count: hs.length }
      }
    }
  }

  var anchorHash = hs[0].id
  var tipHash = hs[hs.length - 1].id

  if (opts.trustedHash) {
    var t = String(opts.trustedHash).toLowerCase()
    if (t !== tipHash.toLowerCase() && t !== anchorHash.toLowerCase()) {
      return {
        valid: false,
        reason: 'chain is not anchored at the trusted hash',
        count: hs.length,
        anchorHash: anchorHash,
        tipHash: tipHash
      }
    }
  }

  return { valid: true, count: hs.length, anchorHash: anchorHash, tipHash: tipHash, work: work }
}

module.exports = { verifyHeaderChain: verifyHeaderChain }
