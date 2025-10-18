'use strict';

/**
 * SmartLedger Hardened Verification Module
 * Provides secure ECDSA signature verification with malleability protection
 */

const BN = require('./bn');
const Point = require('./point');
const ECDSA = require('./ecdsa');

// Cache curve constants for performance
const n = Point.getN();
const nh = n.shrn(1); // n / 2

/**
 * Hardened signature verification with canonicalization
 * @param {Buffer} msgHash - 32-byte message hash
 * @param {Signature} sig - Signature object with r,s components
 * @param {PublicKey} pubkey - Public key for verification
 * @returns {boolean} - true if signature is valid and canonical
 */
function smartVerify(msgHash, sig, pubkey) {
  // Strict input validation
  if (!Buffer.isBuffer(msgHash) || msgHash.length !== 32) {
    throw new Error('Invalid message hash: must be 32-byte buffer');
  }

  if (!sig || !sig.r || !sig.s) {
    return false;
  }

  // Ensure r and s are BN instances
  const r = BN.isBN(sig.r) ? sig.r : new BN(sig.r);
  const s = BN.isBN(sig.s) ? sig.s : new BN(sig.s);

  // Reject zero values
  if (r.isZero() || s.isZero()) {
    return false;
  }

  // Reject values >= n (curve order)
  if (r.gte(n) || s.gte(n)) {
    return false;
  }

  // Canonicalize s to lower half (anti-malleability)
  let canonicalS = s;
  if (s.gt(nh)) {
    canonicalS = n.sub(s);
  }

  // Create canonicalized signature object
  const canonicalSig = {
    r: r,
    s: canonicalS
  };

  // Use BSV's original ECDSA verify with canonical signature
  return ECDSA.verify(msgHash, canonicalSig, pubkey);
}

/**
 * Check if signature is in canonical form (s <= n/2)
 * @param {Object} sig - Signature with r,s components
 * @returns {boolean} - true if signature is canonical
 */
function isCanonical(sig) {
  if (!sig || !sig.s) {
    return false;
  }

  const s = BN.isBN(sig.s) ? sig.s : new BN(sig.s);
  return s.lte(nh);
}

/**
 * Canonicalize signature to ensure s <= n/2
 * @param {Object} sig - Signature object to canonicalize
 * @returns {Object} - New signature object with canonical s
 */
function canonicalize(sig) {
  if (!sig || !sig.r || !sig.s) {
    throw new Error('Invalid signature object');
  }

  const r = BN.isBN(sig.r) ? sig.r : new BN(sig.r);
  const s = BN.isBN(sig.s) ? sig.s : new BN(sig.s);

  let canonicalS = s;
  if (s.gt(nh)) {
    canonicalS = n.sub(s);
  }

  return {
    r: r,
    s: canonicalS
  };
}

module.exports = {
  smartVerify,
  isCanonical,
  canonicalize,
  constants: {
    n: n,
    nh: nh
  }
};