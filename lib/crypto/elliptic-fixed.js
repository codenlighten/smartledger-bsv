'use strict'

/**
 * SmartLedger Elliptic Security Wrapper (@noble-backed)
 *
 * A small elliptic-compatible secp256k1 context, exposing the hardened
 * sign/verify/recover surface used by `bsv.EllipticFixed`, now backed by the
 * audited @noble/curves instead of the `elliptic` package:
 *  - sign: low-S canonical signatures with a consistent recoveryParam
 *    (@noble's signer flips the recovery bit together with s).
 *  - verify: strict rejection of malformed / out-of-range (r, s); returns
 *    false (never throws) on garbage input.
 *
 * Signature objects expose `r`/`s` as bn.js BNs and `recoveryParam` as a number,
 * matching the previous elliptic-derived shape.
 */

var BN = require('./bn')
var { secp256k1 } = require('@noble/curves/secp256k1.js')

var NoblePoint = secp256k1.Point
var N_BIG = NoblePoint.Fn.ORDER

function bigToBN (big) {
  var h = big.toString(16)
  if (h.length % 2) h = '0' + h
  return new BN(h, 16)
}

// Normalize a message (hex string or Buffer, a 32-byte hash) to Uint8Array.
function toMsg (msg) {
  if (Buffer.isBuffer(msg)) return Uint8Array.from(msg)
  if (msg instanceof Uint8Array) return msg
  return Uint8Array.from(Buffer.from(msg, 'hex'))
}

// Public-point wrapper exposing the `.eq()` the consumers use.
function PubPoint (noblePt) {
  this._p = noblePt
}
PubPoint.prototype.eq = function (other) {
  var o = other && other._p ? other._p : other
  return this._p.equals(o)
}

var ec = {
  curve: { n: bigToBN(N_BIG) },

  keyFromPrivate: function (priv, enc) {
    var pb
    if (Buffer.isBuffer(priv)) pb = priv
    else if (priv instanceof Uint8Array) pb = Buffer.from(priv)
    else pb = Buffer.from(priv, enc || 'hex')
    var privBytes = Uint8Array.from(pb)
    return {
      _priv: privBytes,
      getPublic: function () {
        return new PubPoint(NoblePoint.fromBytes(secp256k1.getPublicKey(privBytes, true)))
      }
    }
  },

  // sign(msg, key) — bitcoin signs the digest directly (prehash:false).
  sign: function (msg, key) {
    var recovered = secp256k1.sign(toMsg(msg), key._priv, { lowS: true, prehash: false, format: 'recovered' })
    var recid = recovered[0]
    var r = bigToBN(BigInt('0x' + Buffer.from(recovered.subarray(1, 33)).toString('hex')))
    var s = bigToBN(BigInt('0x' + Buffer.from(recovered.subarray(33, 65)).toString('hex')))
    return { r: r, s: s, recoveryParam: recid }
  },

  verify: function (msg, sig, key) {
    try {
      if (!sig || typeof sig !== 'object') return false
      var r = sig.r
      var s = sig.s
      if (!r || !s || typeof r.cmp !== 'function' || typeof s.cmp !== 'function') return false
      if (r.isZero() || s.isZero()) return false
      var n = ec.curve.n
      if (r.cmp(n) >= 0 || s.cmp(n) >= 0) return false

      var compact = Buffer.concat([r.toBuffer({ size: 32 }), s.toBuffer({ size: 32 })])
      var pubBytes = key._priv
        ? secp256k1.getPublicKey(key._priv, true)
        : (key._p ? key._p.toBytes(true) : key)
      // lowS:false to match the previous behaviour (verify accepts any in-range s).
      return secp256k1.verify(Uint8Array.from(compact), toMsg(msg), Uint8Array.from(pubBytes), { lowS: false, prehash: false })
    } catch (e) {
      return false
    }
  },

  recoverPubKey: function (msg, sig, recoveryParam) {
    var compact = Buffer.concat([
      sig.r.toBuffer({ size: 32 }),
      sig.s.toBuffer({ size: 32 })
    ])
    var signature = secp256k1.Signature.fromBytes(Uint8Array.from(compact), 'compact').addRecoveryBit(recoveryParam)
    return new PubPoint(signature.recoverPublicKey(toMsg(msg)))
  }
}

module.exports = ec
