'use strict';

/**
 * SmartLedger Elliptic Security Wrapper
 * Patches elliptic library to prevent signature verification vulnerabilities
 */

const { ec: EC } = require('elliptic');
const ec = new EC('secp256k1');

// Store original verify method
const origVerify = ec.verify.bind(ec);

/**
 * Hardened elliptic verify method
 * Rejects invalid signature parameters before calling original verify
 */
ec.verify = function (msg, sig, key, enc, opts) {
  // Validate signature components exist
  if (!sig || typeof sig !== 'object') {
    return false;
  }

  // Check for r and s components
  if (!sig.r || !sig.s) {
    return false;
  }

  // Convert to BN if needed for comparison
  const r = typeof sig.r.cmp === 'function' ? sig.r : this.curve.n.red ? this.curve.n.fromRed(sig.r) : sig.r;
  const s = typeof sig.s.cmp === 'function' ? sig.s : this.curve.n.red ? this.curve.n.fromRed(sig.s) : sig.s;

  // Reject if r or s >= curve order n
  if (r && r.cmp && r.cmp(this.curve.n) >= 0) {
    return false;
  }
  if (s && s.cmp && s.cmp(this.curve.n) >= 0) {
    return false;
  }

  // Reject zero values
  if (r && r.isZero && r.isZero()) {
    return false;
  }
  if (s && s.isZero && s.isZero()) {
    return false;
  }

  // Call original verify with validated parameters
  return origVerify(msg, sig, key, enc, opts);
};

// Store original sign method for potential future hardening
const origSign = ec.sign.bind(ec);

/**
 * Hardened elliptic sign method
 * Ensures canonical signatures (s <= n/2)
 */
ec.sign = function (msg, key, enc, options) {
  const signature = origSign(msg, key, enc, options);
  
  // Canonicalize s value to lower half
  if (signature.s && signature.s.cmp) {
    const halfOrder = this.curve.n.shrn(1);
    if (signature.s.cmp(halfOrder) > 0) {
      signature.s = this.curve.n.sub(signature.s);
    }
  }
  
  return signature;
};

module.exports = ec;