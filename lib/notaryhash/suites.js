'use strict'

var BN = require('../crypto/bn')
var ECDSA = require('../crypto/ecdsa')
var Signature = require('../crypto/signature')
var PublicKey = require('../publickey')
var Point = require('../crypto/point')
var $ = require('../util/preconditions')

/**
 * Signature suites, keyed on the `algorithm` string BRC-220 already carries.
 *
 * `ECDSA-secp256k1` is registered here and needs nothing new. ML-DSA and SLH-DSA are NOT
 * built in, and that is deliberate rather than unfinished:
 *
 *   @noble/post-quantum is the one Noble package with no independent audit -- its README
 *   says so -- and it is 0.x, 669 KB, and does not claim constant-time execution. This
 *   library's other primitives carry a published Cure53 audit, which is what lets
 *   docs/AUDIT_SCOPE.md tell a vendor not to price the primitive layer. Making an
 *   unaudited implementation a hard dependency of a transaction-signing library would
 *   forfeit that for a capability the spec does not require: ECDSA-secp256k1 is a
 *   first-class algorithm alongside the post-quantum ones, so an ECDSA-only
 *   implementation is conformant.
 *
 * So post-quantum suites are supplied by the caller -- most obviously from
 * @smartledger/keys, which already wraps @noble/post-quantum -- and callers who do not
 * need them pay nothing in bundle size or audit surface. See docs/BRC220_PLAN.md §2.
 */

var Suites = {}

var registry = {}

/**
 * Register a signature suite.
 *
 * `verify` MUST return a strict boolean. A suite returning a truthy object would make
 * every signature check pass, which is the single defect class this codebase has had to
 * fix most often -- so the registry enforces it at call time rather than trusting the
 * suite.
 *
 * @param {String} algorithm - e.g. 'ML-DSA-65'
 * @param {Object} suite
 * @param {Function} suite.verify - (payloadHash: Buffer, signature: Buffer, publicKey: Buffer) => boolean
 */
Suites.register = function (algorithm, suite) {
  $.checkArgument(typeof algorithm === 'string' && algorithm.length > 0,
    'algorithm must be a non-empty string')
  $.checkArgument(suite && typeof suite.verify === 'function',
    'suite must provide a verify(payloadHash, signature, publicKey) function')
  registry[algorithm] = suite
  return Suites
}

/** @returns {Object|undefined} */
Suites.get = function (algorithm) {
  return registry[algorithm]
}

/** @returns {Array<String>} registered algorithm identifiers */
Suites.list = function () {
  return Object.keys(registry).sort()
}

/** Test seam. */
Suites.unregister = function (algorithm) {
  delete registry[algorithm]
  return Suites
}

/**
 * Verify a signature under the named suite.
 *
 * An UNREGISTERED algorithm returns false. It does not fall through to a default, and it
 * does not throw: a certificate naming an algorithm this process cannot check has not
 * been verified, and `false` is the honest answer. Falling through to ECDSA for an
 * `ML-DSA-65` certificate would be catastrophic and is exactly what a default invites.
 *
 * The suite's own return value is coerced with `=== true`, so a suite that returns a
 * truthy object cannot smuggle a pass through.
 *
 * @param {String} algorithm
 * @param {Buffer} payloadHash - the 32 bytes that were signed
 * @param {Buffer} signature
 * @param {Buffer} publicKey
 * @returns {Boolean}
 */
Suites.verify = function (algorithm, payloadHash, signature, publicKey) {
  var suite = registry[algorithm]
  if (!suite) return false
  if (!Buffer.isBuffer(payloadHash) || !Buffer.isBuffer(signature) || !Buffer.isBuffer(publicKey)) {
    return false
  }
  try {
    return suite.verify(payloadHash, signature, publicKey) === true
  } catch (e) {
    return false
  }
}

/**
 * ECDSA over secp256k1.
 *
 * The signer signs the 32-byte `payloadHash` DIRECTLY (spec §Algorithms: "post-quantum
 * schemes apply their own internal hashing"). There is no second hash, and no Bitcoin
 * sighash — this is a detached signature over a digest.
 *
 * Signatures are 64 raw bytes, `r || s`, each a 32-byte big-endian integer. DER is
 * accepted as a length-discriminated fallback for Bitcoin-native signers, because the
 * certificate's `encoding` field may say so; see docs/BRC220_ENCODING_AMENDMENT.md for
 * why raw is what new implementations should emit.
 *
 * Low-S is REQUIRED. A high-S signature is rejected rather than normalised: normalising
 * changes the signature bytes, and those bytes are inside `proofHash`, so accepting both
 * forms would mean two valid certificates exist for one signing act.
 */
Suites.register('ECDSA-secp256k1', {
  verify: function (payloadHash, signature, publicKey) {
    if (payloadHash.length !== 32) return false

    var sig
    if (signature.length === 64) {
      sig = new Signature(
        BN.fromBuffer(signature.slice(0, 32)),
        BN.fromBuffer(signature.slice(32, 64))
      )
    } else {
      // DER, for the legacy `encoding: "der"` case.
      try {
        sig = Signature.fromDER(signature)
      } catch (e) {
        return false
      }
    }

    // Low-S, enforced rather than normalised.
    var halfOrder = Point.getN().div(new BN(2))
    if (sig.s.gt(halfOrder)) return false

    var pubkey
    try {
      pubkey = PublicKey.fromBuffer(publicKey)
    } catch (e) {
      return false
    }

    var ecdsa = new ECDSA()
    ecdsa.hashbuf = payloadHash
    // NO endian override. `payloadHash` is the scalar, big-endian, exactly as the
    // 32 bytes are given — which is what every other ECDSA implementation does and
    // what BRC-220 means by "signs the payloadHash".
    //
    // 8.3.0 set `endian = 'little'` here, which made ECDSA reverse the digest before
    // reducing it to the scalar. That is Bitcoin's message-signing convention, not
    // this protocol's, and it is why lib/crypto/ecdsa.js offers the option at all.
    //
    // The effect was on the VERIFY side: a signature produced the way BRC-220
    // specifies was rejected, and the only signatures accepted were ones made with
    // bsv's own little-endian convention. Every test in this repo signed that way
    // too, so the module and its tests were self-consistent and wrong together —
    // the exact failure shape test/notaryhash/encoding.js warns about in its header.
    //
    // test/notaryhash/interop.js now pins this against @noble/curves, which shares
    // no verification code with lib/crypto/ecdsa.js. A second implementation is the
    // only thing that can catch a defect where the code and its tests agree.
    ecdsa.pubkey = pubkey
    ecdsa.sig = sig
    return ecdsa.verify() === true
  }
})

module.exports = Suites
