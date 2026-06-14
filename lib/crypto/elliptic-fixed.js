'use strict'

/**
 * SmartLedger Elliptic Security Wrapper
 *
 * Wraps the elliptic secp256k1 context with:
 *  - verify: strict rejection of malformed / out-of-range (r, s) before the
 *    underlying verify runs.
 *  - sign: low-S canonical signatures via elliptic's own `canonical` option,
 *    which also keeps `recoveryParam` consistent (a manual s-flip does not).
 */

const { ec: EC } = require('elliptic')
const ec = new EC('secp256k1')

// Store original methods.
const origVerify = ec.verify.bind(ec)
const origSign = ec.sign.bind(ec)

/**
 * Hardened verify: reject malformed or out-of-range signatures up front.
 * (elliptic already range-checks internally; this fails fast and never
 * throws on garbage input, returning false instead.)
 */
ec.verify = function (msg, sig, key, enc, opts) {
  if (!sig || typeof sig !== 'object') {
    return false
  }

  const r = sig.r
  const s = sig.s

  // r and s must be BN-like with a usable comparison.
  if (!r || !s || typeof r.cmp !== 'function' || typeof s.cmp !== 'function') {
    return false
  }

  // Reject r or s outside [1, n-1].
  if (r.isZero() || s.isZero()) {
    return false
  }
  if (r.cmp(this.curve.n) >= 0 || s.cmp(this.curve.n) >= 0) {
    return false
  }

  return origVerify(msg, sig, key, enc, opts)
}

/**
 * Hardened sign: always produce low-S canonical signatures.
 *
 * We delegate canonicalization to elliptic (`{ canonical: true }`) rather than
 * flipping s after the fact, because elliptic also flips `recoveryParam` when
 * it negates s. A manual flip leaves recoveryParam pointing at the wrong
 * candidate key, silently breaking public-key recovery.
 */
ec.sign = function (msg, key, enc, options) {
  // Mirror elliptic's own argument normalization: sign(msg, key, options).
  if (typeof enc !== 'string') {
    options = enc
    enc = undefined
  }
  options = Object.assign({}, options, { canonical: true })
  return origSign(msg, key, enc, options)
}

module.exports = ec
