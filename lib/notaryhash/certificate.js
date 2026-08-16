'use strict'

var JCS = require('../util/jcs')
var Encoding = require('./encoding')
var NotaryScript = require('./script')
var $ = require('../util/preconditions')

/**
 * BRC-220 certificate — the self-contained object a verifier is handed.
 *
 * Required fields, per the spec: protocol, version, mode, algorithm, hashAlgorithm,
 * payloadHash, publicKey, signature, encoding, proofHash, createdAt, anchor. A batched
 * certificate additionally carries `merkle`.
 *
 * Two things about it are easy to get wrong, and both are load-bearing:
 *
 *  - The certificate carries the FULL publicKey and signature in every mode, including
 *    hybrid, where only their SHA-256 digests go on chain. That asymmetry is the point of
 *    hybrid mode: the chain stays small, the certificate stays complete.
 *  - The SPV envelope is ADDITIVE. The spec is explicit that attaching it never changes
 *    proofHash and never invalidates a previously issued certificate — which follows from
 *    proofHash being computed over the canonical proof bytes, not over the certificate
 *    JSON. A test asserts it rather than trusting the reasoning.
 */

var Certificate = {}

Certificate.PROTOCOL = 'NotaryHash'
Certificate.VERSION = 1

/**
 * The byte representation of publicKey and signature.
 *
 * The spec requires the `encoding` field but never enumerates its values; this library
 * defines them and proposes the definition upstream — see
 * docs/BRC220_ENCODING_AMENDMENT.md.
 *
 * RAW is what everything should emit. For ECDSA-secp256k1 that is 64 bytes of r || s,
 * each a 32-byte big-endian integer, with a 33-byte compressed public key. DER is
 * accepted for Bitcoin-native signers that already hold it, and discouraged: DER is not
 * canonical, so the same signature can encode to 69, 70 or 71 bytes, and those bytes are
 * inside proofHash.
 */
Certificate.ENCODING = {
  RAW: 'raw',
  DER: 'der'
}

function hex (buf, name) {
  if (!Buffer.isBuffer(buf)) {
    throw new Error(name + ' must be a Buffer of raw bytes, not ' + (typeof buf))
  }
  return buf.toString('hex')
}

/**
 * Build a certificate.
 *
 * `proofHash` is computed here rather than accepted, so a caller cannot supply one that
 * does not match the fields beside it. A certificate whose stated proofHash disagrees
 * with its own contents is exactly the artefact this protocol exists to make impossible,
 * and accepting the value would let one be constructed by mistake.
 *
 * @param {Object} params
 * @param {Number} params.mode - NotaryScript.MODE.*
 * @param {String} params.algorithm
 * @param {String} params.hashAlgorithm - 'SHA-256' for every algorithm the spec lists
 * @param {Buffer} params.payloadHash - raw 32 bytes
 * @param {Buffer} params.publicKey - raw bytes, FULL even in hybrid mode
 * @param {Buffer} params.signature - raw bytes, FULL even in hybrid mode
 * @param {String} [params.encoding='raw']
 * @param {String|Date} [params.createdAt] - defaults to now
 * @param {Object} params.anchor - { txid, blockHeight }
 * @param {Object} [params.merkle] - batch mode: { root, leafIndex, leafCount, path }
 * @returns {Object} certificate
 */
Certificate.build = function (params) {
  $.checkArgument(params && typeof params === 'object', 'params is required')
  $.checkArgument(params.anchor && typeof params.anchor === 'object', 'anchor is required')
  $.checkArgument(typeof params.anchor.txid === 'string', 'anchor.txid must be a string')

  var encoding = params.encoding || Certificate.ENCODING.RAW
  $.checkArgument(encoding === Certificate.ENCODING.RAW || encoding === Certificate.ENCODING.DER,
    'encoding must be "raw" or "der"')

  var createdAt = params.createdAt
    ? (params.createdAt instanceof Date ? params.createdAt.toISOString() : params.createdAt)
    : new Date().toISOString()

  var createdAtUnix = Encoding.toUnixSeconds(createdAt)

  var proofHash = Encoding.proofHash({
    algorithm: params.algorithm,
    hashAlgorithm: params.hashAlgorithm,
    payloadHash: params.payloadHash,
    publicKey: params.publicKey,
    signature: params.signature,
    createdAtUnix: createdAtUnix
  })

  var certificate = {
    protocol: Certificate.PROTOCOL,
    version: Certificate.VERSION,
    mode: params.mode,
    algorithm: params.algorithm,
    hashAlgorithm: params.hashAlgorithm,
    payloadHash: hex(params.payloadHash, 'payloadHash'),
    publicKey: hex(params.publicKey, 'publicKey'),
    signature: hex(params.signature, 'signature'),
    encoding: encoding,
    proofHash: proofHash.toString('hex'),
    createdAt: createdAt,
    anchor: {
      txid: params.anchor.txid,
      blockHeight: params.anchor.blockHeight
    }
  }

  if (params.mode === NotaryScript.MODE.BATCH) {
    $.checkArgument(params.merkle && typeof params.merkle === 'object',
      'batch certificates require a merkle inclusion proof')
    certificate.merkle = {
      root: params.merkle.root,
      leafIndex: params.merkle.leafIndex,
      leafCount: params.merkle.leafCount,
      path: params.merkle.path
    }
  }

  return certificate
}

/**
 * Recompute the proofHash a certificate's own fields imply.
 *
 * This is validity check 2 of the three the spec requires, and it needs no network. It
 * decodes the hex fields back to bytes first: the canonical proof bytes are over the raw
 * bytes, and hex is twice as long, so hashing the strings would produce a value that is
 * wrong in a way that still looks like a hash.
 *
 * @param {Object} certificate
 * @returns {Buffer} 32 bytes
 */
Certificate.recomputeProofHash = function (certificate) {
  $.checkArgument(certificate && typeof certificate === 'object', 'certificate is required')
  return Encoding.proofHash({
    algorithm: certificate.algorithm,
    hashAlgorithm: certificate.hashAlgorithm,
    payloadHash: Buffer.from(certificate.payloadHash, 'hex'),
    publicKey: Buffer.from(certificate.publicKey, 'hex'),
    signature: Buffer.from(certificate.signature, 'hex'),
    createdAtUnix: Encoding.toUnixSeconds(certificate.createdAt)
  })
}

/**
 * Does the stated proofHash match the fields beside it?
 *
 * Strict boolean. Returns false rather than throwing on a malformed certificate, because
 * "this certificate is not valid" is the honest answer to a certificate that cannot be
 * parsed, and a caller writing `if (proofHashMatches(c))` must not get a truthy object.
 *
 * @param {Object} certificate
 * @returns {Boolean}
 */
Certificate.proofHashMatches = function (certificate) {
  try {
    if (!certificate || typeof certificate.proofHash !== 'string') return false
    var stated = Buffer.from(certificate.proofHash, 'hex')
    if (stated.length !== 32) return false
    return Certificate.recomputeProofHash(certificate).equals(stated)
  } catch (e) {
    return false
  }
}

/** Every field the spec requires of a certificate, in the order it lists them. */
Certificate.REQUIRED_FIELDS = [
  'protocol', 'version', 'mode', 'algorithm', 'hashAlgorithm', 'payloadHash',
  'publicKey', 'signature', 'encoding', 'proofHash', 'createdAt', 'anchor'
]

/**
 * Check a certificate's SHAPE — that the required fields are present and well-formed.
 *
 * This is NOT verification. It says nothing about whether the signature is valid, whether
 * the proofHash matches, or whether the anchor exists. It exists so that those checks can
 * assume a parseable object, and it returns a list of problems rather than a boolean so
 * the caller can report which field is wrong.
 *
 * @param {Object} certificate
 * @returns {Array<String>} problems; empty means the shape is fine
 */
Certificate.validateShape = function (certificate) {
  var problems = []

  if (!certificate || typeof certificate !== 'object') {
    return ['certificate must be an object']
  }

  Certificate.REQUIRED_FIELDS.forEach(function (field) {
    if (certificate[field] === undefined) problems.push('missing required field: ' + field)
  })

  if (certificate.protocol !== undefined && certificate.protocol !== Certificate.PROTOCOL) {
    problems.push('protocol must be "' + Certificate.PROTOCOL + '"')
  }
  if (certificate.version !== undefined && certificate.version !== Certificate.VERSION) {
    problems.push('unsupported version: ' + certificate.version)
  }
  ;[[certificate.payloadHash, 'payloadHash', 32], [certificate.proofHash, 'proofHash', 32]]
    .forEach(function (pair) {
      if (pair[0] === undefined) return
      if (typeof pair[0] !== 'string' || !/^[0-9a-fA-F]*$/.test(pair[0])) {
        problems.push(pair[1] + ' must be a hex string')
      } else if (pair[0].length !== pair[2] * 2) {
        problems.push(pair[1] + ' must be ' + pair[2] + ' bytes (' + pair[2] * 2 + ' hex chars)')
      }
    })

  if (certificate.mode === NotaryScript.MODE.BATCH && certificate.merkle === undefined) {
    problems.push('batch certificates require a merkle inclusion proof')
  }

  return problems
}

/**
 * Attach the SPV envelope to a finished certificate.
 *
 * Returns a NEW object rather than mutating: a certificate that has been handed to
 * someone should not change under them, and a caller comparing before and after needs
 * both.
 *
 * The spec guarantees this never changes proofHash, because proofHash is over the
 * canonical proof bytes and the envelope is not among them. `attachSPV` asserts that
 * rather than assuming it — if the guarantee ever broke, every previously issued
 * certificate would become unverifiable, and it should break loudly here rather than
 * quietly at a verifier.
 *
 * @param {Object} certificate
 * @param {Object} spv - { rawTx, blockHash, blockHeight, merkleProof, format }
 * @returns {Object} a new certificate with `spv` attached
 */
Certificate.attachSPV = function (certificate, spv) {
  $.checkArgument(certificate && typeof certificate === 'object', 'certificate is required')
  $.checkArgument(spv && typeof spv === 'object', 'spv envelope is required')

  var before = certificate.proofHash

  var withSPV = Object.assign({}, certificate, {
    spv: {
      rawTx: spv.rawTx,
      blockHash: spv.blockHash,
      blockHeight: spv.blockHeight,
      merkleProof: spv.merkleProof,
      format: spv.format || 'TSC'
    }
  })

  if (withSPV.proofHash !== before) {
    throw new Error('attaching the SPV envelope changed proofHash; this must never happen')
  }

  return withSPV
}

/**
 * Canonical JSON for the certificate, per RFC 8785.
 *
 * Used for transport and for hashing the certificate itself. Note this is NOT what
 * proofHash is computed over — that is the length-prefixed binary of the proof fields.
 * Confusing the two produces a value that looks like a proofHash and is not one.
 *
 * @param {Object} certificate
 * @returns {String}
 */
Certificate.canonicalize = function (certificate) {
  return JCS.stringify(certificate)
}

module.exports = Certificate
