'use strict'

var Hash = require('../crypto/hash')
var $ = require('../util/preconditions')

/**
 * BRC-220 (NotaryHash) canonical binary encoding.
 *
 * The whole point of this file is that two independent implementations produce the same
 * bytes. Everything here is fixed by the spec; nothing is a local convention.
 *
 * See docs/BRC220_PLAN.md for how this fits together.
 */

var Encoding = {}

/** The protocol prefix that opens the canonical bytes. Verbatim from the spec. */
Encoding.PROTOCOL_PREFIX = 'NotaryHash/1.0'

/** Protocol version carried as a single byte inside the canonical bytes. */
Encoding.VERSION = 1

/**
 * Length-prefix a value: `lp(x) = u32be(len(x)) || x`.
 *
 * The length is the BYTE length, which is why strings are UTF-8 encoded first rather than
 * measured with `.length` — those differ the moment a non-ASCII character appears, and
 * the resulting proof would be unverifiable by anyone else.
 *
 * @param {Buffer|String} value - bytes, or text to encode as UTF-8
 * @returns {Buffer}
 */
Encoding.lp = function (value) {
  var buf = Buffer.isBuffer(value) ? value : Buffer.from(String(value), 'utf8')
  var prefix = Buffer.alloc(4)
  prefix.writeUInt32BE(buf.length, 0)
  return Buffer.concat([prefix, buf])
}

/**
 * Require a byte field to actually be bytes.
 *
 * Certificates carry `payloadHash`, `publicKey` and `signature` as HEX STRINGS, and the
 * canonical bytes are over the RAW BYTES those strings decode to. Passing the hex string
 * straight through would length-prefix 64 bytes where the spec wants 32 — a proofHash
 * that is self-consistent, verifies against itself, and matches no other implementation.
 * That is the failure this guard exists to make impossible, so hex must be decoded by the
 * caller rather than guessed at here.
 *
 * @private
 */
function requireBytes (value, name) {
  if (!Buffer.isBuffer(value)) {
    throw new Error(
      name + ' must be a Buffer of raw bytes, not ' + (typeof value) +
      '. Certificates store this field as hex; decode it with Buffer.from(hex, \'hex\') ' +
      'before hashing, or the length prefix covers the wrong number of bytes.'
    )
  }
  return value
}

/**
 * Encode a Unix timestamp as `u64be`.
 *
 * Seconds, not milliseconds. `Date.now()` is milliseconds, so a caller who forgets to
 * divide produces a timestamp ~1000x in the future that still encodes cleanly — a test
 * pins the boundary rather than trusting the caller.
 *
 * @param {Number} seconds - whole seconds since the Unix epoch
 * @returns {Buffer} 8 bytes, big-endian
 */
Encoding.u64be = function (seconds) {
  $.checkArgument(typeof seconds === 'number' && isFinite(seconds), 'createdAtUnix must be a finite number')
  $.checkArgument(Number.isInteger(seconds), 'createdAtUnix must be whole seconds, not milliseconds or a fraction')
  $.checkArgument(seconds >= 0, 'createdAtUnix must not be negative')
  var buf = Buffer.alloc(8)
  buf.writeBigUInt64BE(BigInt(seconds), 0)
  return buf
}

/**
 * Convert an ISO 8601 timestamp to the whole seconds the canonical bytes carry.
 *
 * Truncates rather than rounds: a certificate's `createdAt` has millisecond precision and
 * `createdAtUnix` does not, so two implementations must agree on which way the fractional
 * part goes. Truncation is the only choice that never moves a timestamp forward.
 *
 * @param {String|Date} createdAt
 * @returns {Number} whole seconds
 */
Encoding.toUnixSeconds = function (createdAt) {
  var date = createdAt instanceof Date ? createdAt : new Date(createdAt)
  $.checkArgument(!isNaN(date.getTime()), 'createdAt is not a valid date: ' + createdAt)
  return Math.floor(date.getTime() / 1000)
}

/**
 * Build the canonical proof bytes.
 *
 *     lp("NotaryHash/1.0") || u8(version=1) ||
 *     lp(algorithm) || lp(hashAlgorithm) ||
 *     lp(payloadHash) || lp(publicKey) || lp(signature) ||
 *     u64be(createdAtUnix)
 *
 * The protocol prefix, the version byte and the timestamp are part of this and are NEVER
 * part of the on-chain record. So the OP_RETURN output alone cannot reconstruct the
 * proofHash — a verifier needs the certificate too. That looks like an omission when
 * reading the on-chain format in isolation; it is deliberate, and it is what lets an SPV
 * envelope be added afterwards without disturbing the hash.
 *
 * @param {Object} fields
 * @param {String} fields.algorithm - e.g. 'ECDSA-secp256k1', 'ML-DSA-65'
 * @param {String} fields.hashAlgorithm - e.g. 'SHA-256'
 * @param {Buffer} fields.payloadHash - raw bytes
 * @param {Buffer} fields.publicKey - raw bytes
 * @param {Buffer} fields.signature - raw bytes
 * @param {Number} fields.createdAtUnix - whole seconds
 * @returns {Buffer}
 */
Encoding.canonicalBytes = function (fields) {
  $.checkArgument(fields && typeof fields === 'object', 'fields object is required')
  $.checkArgument(typeof fields.algorithm === 'string' && fields.algorithm.length > 0,
    'algorithm must be a non-empty string')
  $.checkArgument(typeof fields.hashAlgorithm === 'string' && fields.hashAlgorithm.length > 0,
    'hashAlgorithm must be a non-empty string')

  return Buffer.concat([
    Encoding.lp(Encoding.PROTOCOL_PREFIX),
    Buffer.from([Encoding.VERSION]),
    Encoding.lp(fields.algorithm),
    Encoding.lp(fields.hashAlgorithm),
    Encoding.lp(requireBytes(fields.payloadHash, 'payloadHash')),
    Encoding.lp(requireBytes(fields.publicKey, 'publicKey')),
    Encoding.lp(requireBytes(fields.signature, 'signature')),
    Encoding.u64be(fields.createdAtUnix)
  ])
}

/**
 * The integrity root: `proofHash = SHA-256(canonicalBytes)`.
 *
 * @param {Object} fields - as for canonicalBytes()
 * @returns {Buffer} 32 bytes
 */
Encoding.proofHash = function (fields) {
  return Hash.sha256(Encoding.canonicalBytes(fields))
}

module.exports = Encoding
