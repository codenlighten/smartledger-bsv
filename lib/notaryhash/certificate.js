'use strict'

var JCS = require('../util/jcs')
var Encoding = require('./encoding')
var Merkle = require('./merkle')
var NotaryScript = require('./script')
var deprecate = require('../util/deprecate')
var $ = require('../util/preconditions')

/**
 * BRC-220 certificate — the self-contained object a verifier is handed.
 *
 * There are two JSON formats, and this module reads both.
 *
 * The REFERENCE format is the BRC-220 reference implementation's, field for field. A
 * certificate exists to be checked by someone other than its issuer, and this is the
 * format every other BRC-220 verifier reads:
 *
 *   {
 *     protocol: 'NotaryHash',
 *     version: '1.0',
 *     mode: 'full' | 'hybrid',              // how the proof sits on chain
 *     algorithm, hashAlgorithm,
 *     payloadHash: <hex>,
 *     publicKey, signature: <per encoding>, // FULL blobs, even in hybrid mode
 *     encoding: 'hex' | 'base64',           // how publicKey and signature are written
 *     proofHash: <hex>,
 *     createdAt: <ISO 8601, whole seconds>,
 *     anchor: { type: 'direct' | 'batch', network, txid, vout, blockHeight, blockTime },
 *     merkle: { root, leafIndex, leafCount, path: [{ hash, side }] },  // iff batch
 *     spv: { rawTx, blockHash, blockHeight, merkleProof, format }      // once mined
 *   }
 *
 * Batch is NOT a mode there. A batched proof is still full or hybrid; what makes it a
 * batch is that its anchor holds a Merkle root rather than the proof itself, which is why
 * the reference marks it on `anchor.type`.
 *
 * The LEGACY format is what 8.3.0–9.8.0 wrote: `version: 1`, the numeric on-chain mode
 * byte, `encoding: "raw" | "der"`, `anchor: { txid, blockHeight }` and bare-hash Merkle
 * paths. BRC-220 lists the required fields but not their JSON values, and those releases
 * filled the gap with choices of their own, so the reference could verify none of their
 * certificates and they could verify none of the reference's. The cryptography agreed
 * throughout; only the JSON did not.
 *
 * Reading: every check normalises a legacy certificate onto the reference format first,
 * so both verify.
 *
 * Writing: `build({ format: 'reference' })` writes the reference format. Through 9.x,
 * omitting `format` still writes the legacy one, byte for byte as 9.8.0 did, and warns
 * once — STABILITY.md does not let a minor change what an API returns. The default
 * becomes 'reference' in 10.0.0.
 *
 * Two properties are load-bearing and both are asserted by tests:
 *
 *  - The certificate carries the FULL publicKey and signature in every mode, including
 *    hybrid, where only their SHA-256 digests go on chain. That asymmetry is the point of
 *    hybrid mode: the chain stays small, the certificate stays complete.
 *  - The SPV envelope is ADDITIVE. Attaching it never changes proofHash, because
 *    proofHash is over the canonical proof bytes, not over the certificate JSON.
 */

var Certificate = {}

Certificate.PROTOCOL = 'NotaryHash'

/**
 * The `version` the 9.x DEFAULT format writes — the 8.3.0–9.8.0 format. It becomes
 * REFERENCE_VERSION in 10.0.0, with the default.
 */
Certificate.VERSION = 1

/** The `version` the reference format writes. */
Certificate.REFERENCE_VERSION = '1.0'

/** What `build()` writes. See the module comment. */
Certificate.FORMAT = { REFERENCE: 'reference', LEGACY: 'legacy' }

/** A reference-format certificate's `mode`. */
Certificate.MODE = { FULL: 'full', HYBRID: 'hybrid' }

/**
 * `encoding` values. In the reference format, HEX or BASE64: how `publicKey` and
 * `signature` are written into the JSON, and nothing about their bytes — a signature is
 * whatever the signer produced, for ECDSA 64-byte `r || s` or DER, told apart by the
 * bytes themselves. `payloadHash`, `proofHash` and the Merkle hashes are always hex.
 *
 * RAW and DER are the legacy format's values. They named the signature's byte form, and
 * both were written out as hex.
 */
Certificate.ENCODING = { HEX: 'hex', BASE64: 'base64', RAW: 'raw', DER: 'der' }

Certificate.ANCHOR_TYPE = { DIRECT: 'direct', BATCH: 'batch' }
Certificate.DEFAULT_NETWORK = 'bsv-mainnet'

// What 8.3.0–9.8.0 wrote in `version`. Not exported under this name: in 9.x it is
// Certificate.VERSION, and a second constant for the same value invites the two to drift.
var LEGACY_VERSION = 1

// What each legacy numeric mode becomes. Legacy batch (2) was a mode; here it is a full
// proof on a batch anchor.
var LEGACY_MODE = { 0: 'full', 1: 'hybrid', 2: 'full' }

var HEX_RE = /^[0-9a-fA-F]*$/
// Both RFC 4648 alphabets (§4 standard, §5 URL-safe) and missing padding are accepted, as
// the reference accepts them. What is NOT accepted is anything that is not base64: a
// character outside the alphabet, padding out of place, or a length no byte string
// encodes. Buffer.from skips the first and truncates the last, turning a corrupted field
// into different bytes instead of an error.
var BASE64_RE = /^[A-Za-z0-9+/_-]*={0,2}$/

/**
 * Decode a certificate string field to bytes.
 *
 * Hex takes an optional `0x` prefix, because the reference accepts one. Both forms are
 * validated rather than handed to Buffer.from, which silently drops characters it does
 * not recognise and would turn a malformed field into different bytes instead of an
 * error.
 *
 * @param {String} value
 * @param {String} encoding - 'hex' | 'base64'
 * @param {String} [name] - for the error message
 * @returns {Buffer}
 */
Certificate.decodeBytes = function (value, encoding, name) {
  name = name || 'value'
  if (typeof value !== 'string') throw new Error(name + ' must be a string')
  if (encoding === Certificate.ENCODING.HEX) {
    var clean = value.slice(0, 2) === '0x' ? value.slice(2) : value
    if (clean.length % 2 !== 0 || !HEX_RE.test(clean)) throw new Error(name + ' must be a hex string')
    return Buffer.from(clean, 'hex')
  }
  if (encoding === Certificate.ENCODING.BASE64) {
    if (!BASE64_RE.test(value)) throw new Error(name + ' must be base64')
    var body = value.replace(/=+$/, '')
    if ((body.length !== value.length && value.length % 4 !== 0) || body.length % 4 === 1) {
      throw new Error(name + ' is not a valid base64 length')
    }
    return Buffer.from(value, 'base64')
  }
  throw new Error('encoding must be "hex" or "base64", not ' + JSON.stringify(encoding))
}

function encodeBytes (buf, encoding, name) {
  if (!Buffer.isBuffer(buf)) {
    throw new Error(name + ' must be a Buffer of raw bytes, not ' + (typeof buf))
  }
  return encoding === Certificate.ENCODING.BASE64 ? buf.toString('base64') : buf.toString('hex')
}

/** A 32-byte hash field as lowercase hex, from a Buffer or a hex string. */
function hashHex (value, name) {
  var buf = Buffer.isBuffer(value) ? value : Certificate.decodeBytes(value, 'hex', name)
  if (buf.length !== 32) throw new Error(name + ' must be 32 bytes')
  return buf.toString('hex')
}

function resolveMode (mode) {
  if (mode === Certificate.MODE.FULL || mode === Certificate.MODE.HYBRID) {
    return { mode: mode, batch: false }
  }
  // The numeric on-chain mode bytes, which is what 8.3.0–9.8.0 took here.
  if (mode === NotaryScript.MODE.FULL) return { mode: 'full', batch: false }
  if (mode === NotaryScript.MODE.HYBRID) return { mode: 'hybrid', batch: false }
  if (mode === NotaryScript.MODE.BATCH) return { mode: 'full', batch: true }
  if (mode === 'batch') {
    throw new Error('batch is an anchor type, not a mode: pass mode "full" or "hybrid" with a merkle proof')
  }
  throw new Error('mode is required: "full" or "hybrid"')
}

function resolveEncoding (encoding) {
  if (encoding === undefined) return Certificate.ENCODING.HEX
  if (encoding === Certificate.ENCODING.HEX || encoding === Certificate.ENCODING.BASE64) {
    return encoding
  }
  // The legacy values named the signature's BYTE format. Both were written as hex, so
  // both mean "hex" in the reference format.
  if (encoding === Certificate.ENCODING.RAW || encoding === Certificate.ENCODING.DER) {
    return Certificate.ENCODING.HEX
  }
  throw new Error('encoding must be "hex" or "base64"')
}

/**
 * An audit path in the `{ hash, side }` form certificates carry, from either that form
 * or the bare hashes 8.3.0–9.8.0 wrote. Bare hashes get their sides from the index and
 * tree size, which is exactly how RFC 6962 determines them.
 */
function sidedPath (path, leafIndex, leafCount) {
  if (!Array.isArray(path)) throw new Error('merkle.path must be an array')
  var sided = path.length > 0 && path.every(function (n) {
    return n && typeof n === 'object' && !Buffer.isBuffer(n) && 'side' in n
  })
  if (sided || path.length === 0) {
    return path.map(function (n, i) {
      if (n.side !== 'left' && n.side !== 'right') {
        throw new Error('merkle.path[' + i + '].side must be "left" or "right"')
      }
      return { hash: hashHex(n.hash, 'merkle.path[' + i + '].hash'), side: n.side }
    })
  }
  var sides = Merkle.pathSides(leafIndex, leafCount)
  if (sides.length !== path.length) {
    throw new Error('merkle.path has ' + path.length + ' nodes; a tree of ' + leafCount +
      ' leaves needs ' + sides.length + ' for leaf ' + leafIndex)
  }
  return path.map(function (n, i) {
    return { hash: hashHex(n, 'merkle.path[' + i + ']'), side: sides[i] }
  })
}

function buildMerkle (merkle) {
  $.checkArgument(merkle && typeof merkle === 'object',
    'batch certificates require a merkle inclusion proof')
  $.checkArgument(Number.isInteger(merkle.leafIndex) && merkle.leafIndex >= 0,
    'merkle.leafIndex must be a non-negative integer')
  $.checkArgument(Number.isInteger(merkle.leafCount) && merkle.leafCount > merkle.leafIndex,
    'merkle.leafCount must be an integer greater than leafIndex')
  return {
    root: hashHex(merkle.root, 'merkle.root'),
    leafIndex: merkle.leafIndex,
    leafCount: merkle.leafCount,
    path: sidedPath(merkle.path, merkle.leafIndex, merkle.leafCount)
  }
}

function buildAnchor (anchor, batch) {
  $.checkArgument(anchor && typeof anchor === 'object', 'anchor is required')
  $.checkArgument(typeof anchor.txid === 'string', 'anchor.txid must be a string')
  var type = anchor.type || (batch ? Certificate.ANCHOR_TYPE.BATCH : Certificate.ANCHOR_TYPE.DIRECT)
  $.checkArgument(type === Certificate.ANCHOR_TYPE.DIRECT || type === Certificate.ANCHOR_TYPE.BATCH,
    'anchor.type must be "direct" or "batch"')
  $.checkArgument((type === Certificate.ANCHOR_TYPE.BATCH) === batch,
    'anchor.type is "batch" exactly when a merkle inclusion proof is given')
  return {
    type: type,
    network: anchor.network || Certificate.DEFAULT_NETWORK,
    txid: anchor.txid,
    vout: anchor.vout === undefined ? 0 : anchor.vout,
    blockHeight: anchor.blockHeight === undefined ? null : anchor.blockHeight,
    blockTime: anchor.blockTime === undefined ? null : anchor.blockTime
  }
}

/**
 * The reference format. `createdAt` is written the way the reference writes it — the
 * whole seconds that go into proofHash, as ISO 8601 — so two implementations given the
 * same proof produce the same JSON.
 */
function buildReference (params) {
  var resolved = resolveMode(params.mode)
  var batch = resolved.batch || params.merkle !== undefined ||
    !!(params.anchor && params.anchor.type === Certificate.ANCHOR_TYPE.BATCH)
  if (batch) {
    $.checkArgument(params.merkle && typeof params.merkle === 'object',
      'batch certificates require a merkle inclusion proof')
  }
  var encoding = resolveEncoding(params.encoding)
  var anchor = buildAnchor(params.anchor, batch)

  var createdAtUnix = params.createdAtUnix !== undefined
    ? params.createdAtUnix
    : Encoding.toUnixSeconds(params.createdAt === undefined ? new Date() : params.createdAt)
  $.checkArgument(Number.isInteger(createdAtUnix) && createdAtUnix >= 0,
    'createdAtUnix must be a non-negative whole number of seconds')

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
    version: Certificate.REFERENCE_VERSION,
    mode: resolved.mode,
    algorithm: params.algorithm,
    hashAlgorithm: params.hashAlgorithm,
    payloadHash: encodeBytes(params.payloadHash, 'hex', 'payloadHash'),
    publicKey: encodeBytes(params.publicKey, encoding, 'publicKey'),
    signature: encodeBytes(params.signature, encoding, 'signature'),
    encoding: encoding,
    proofHash: proofHash.toString('hex'),
    createdAt: new Date(createdAtUnix * 1000).toISOString(),
    anchor: anchor
  }

  if (batch) certificate.merkle = buildMerkle(params.merkle)

  return certificate
}

function legacyHex (buf, name) {
  if (!Buffer.isBuffer(buf)) {
    throw new Error(name + ' must be a Buffer of raw bytes, not ' + (typeof buf))
  }
  return buf.toString('hex')
}

/**
 * The legacy format: 9.8.0's build(), unchanged, so a caller on the 9.x default gets the
 * same certificate byte for byte. test/notaryhash/certificate.js checks that against
 * certificates the 9.8.0 code itself built. Do not tidy this — its quirks (the mode
 * passed through as given, createdAt kept as supplied) are what 9.8.0 wrote.
 */
function buildLegacy (params) {
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
    version: LEGACY_VERSION,
    mode: params.mode,
    algorithm: params.algorithm,
    hashAlgorithm: params.hashAlgorithm,
    payloadHash: legacyHex(params.payloadHash, 'payloadHash'),
    publicKey: legacyHex(params.publicKey, 'publicKey'),
    signature: legacyHex(params.signature, 'signature'),
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
 * Build a certificate.
 *
 * `proofHash` is computed here rather than accepted, so a caller cannot supply one that
 * does not match the fields beside it.
 *
 * @param {Object} params
 * @param {String} [params.format] - 'reference' writes the BRC-220 reference format.
 *   Omitted, 9.x writes the 8.3.0–9.8.0 format and warns once; the default becomes
 *   'reference' in 10.0.0. 'legacy' pins the old format without the notice.
 * @param {String|Number} params.mode - reference: 'full' | 'hybrid' (the numeric
 *   NotaryScript.MODE values are still accepted; MODE.BATCH means a full proof on a
 *   batch anchor). legacy: a NotaryScript.MODE value.
 * @param {String} params.algorithm
 * @param {String} params.hashAlgorithm - 'SHA-256' for every algorithm the spec lists
 * @param {Buffer} params.payloadHash - raw 32 bytes
 * @param {Buffer} params.publicKey - raw bytes, FULL even in hybrid mode
 * @param {Buffer} params.signature - raw bytes as the signer produced them
 * @param {String} [params.encoding] - reference: 'hex' (default) | 'base64'.
 *   legacy: 'raw' (default) | 'der'
 * @param {String|Date} [params.createdAt] - defaults to now
 * @param {Number} [params.createdAtUnix] - reference only; whole seconds
 * @param {Object} params.anchor - reference: { txid, vout?, network?, blockHeight?,
 *   blockTime?, type? }. legacy: { txid, blockHeight }
 * @param {Object} [params.merkle] - batch: { root, leafIndex, leafCount, path }. In the
 *   reference format path is Merkle.auditPath() output; bare Merkle.path() hashes are
 *   converted.
 * @returns {Object} certificate
 */
Certificate.build = function (params) {
  $.checkArgument(params && typeof params === 'object', 'params is required')

  var format = params.format
  if (format === undefined) {
    // Per STABILITY.md: mark it in a minor, flip it in a major. 9.x does not change what
    // build() returns, so the default stays the legacy format and the notice carries the
    // migration — as LTP.Claim does for its canonicalization.
    deprecate({
      what: 'NotaryHash.Certificate.build() without a format',
      since: '9.9.0',
      removeIn: '10.0.0',
      use: "NotaryHash.Certificate.build({ ...params, format: 'reference' })",
      why: 'the default format is this library\'s own, which the BRC-220 reference implementation cannot verify'
    })
    return buildLegacy(params)
  }

  // An unrecognised value throws rather than falling back: a typo quietly selecting the
  // legacy format would recreate the exact failure the format option exists to remove.
  $.checkArgument(format === Certificate.FORMAT.REFERENCE || format === Certificate.FORMAT.LEGACY,
    'Unknown certificate format: ' + format +
    ". Expected 'reference' or 'legacy' (NotaryHash.Certificate.FORMAT)")

  return format === Certificate.FORMAT.REFERENCE ? buildReference(params) : buildLegacy(params)
}

/**
 * Is this a certificate in the 8.3.0–9.8.0 format?
 *
 * `version: 1` marks one. So does a numeric `mode` with no version at all: the reference
 * format never has a numeric mode, and 9.8.0's verifyBatchInclusion accepted such objects.
 *
 * @param {Object} certificate
 * @returns {Boolean}
 */
Certificate.isLegacy = function (certificate) {
  return !!certificate && typeof certificate === 'object' &&
    (certificate.version === LEGACY_VERSION ||
      (certificate.version === undefined && typeof certificate.mode === 'number'))
}

/**
 * Map a certificate onto the reference format.
 *
 * A legacy certificate is translated: `mode` 0/1/2 becomes 'full'/'hybrid'/'full' on a
 * batch anchor, `encoding` "raw"/"der" becomes "hex" (both were hex), the anchor gains
 * the fields the reference requires, and a bare-hash Merkle path gains its sides. A
 * missing version stays missing, so validateShape still reports it. proofHash is
 * untouched: it is over the canonical proof bytes, which the translation does not change.
 *
 * Anything else is returned as it was given, for validateShape to judge. Normalising
 * only the format this library actually wrote keeps the two from blurring into a third
 * that nobody writes.
 *
 * @param {Object} certificate
 * @returns {Object} the reference-format certificate (a new object if translated)
 */
Certificate.normalize = function (certificate) {
  if (!Certificate.isLegacy(certificate)) return certificate

  var legacyBatch = certificate.mode === NotaryScript.MODE.BATCH
  var out = Object.assign({}, certificate)
  out.version = certificate.version === LEGACY_VERSION ? Certificate.REFERENCE_VERSION : certificate.version
  out.mode = LEGACY_MODE[certificate.mode] !== undefined ? LEGACY_MODE[certificate.mode] : certificate.mode
  if (certificate.encoding === Certificate.ENCODING.RAW || certificate.encoding === Certificate.ENCODING.DER) {
    out.encoding = Certificate.ENCODING.HEX
  }

  var a = certificate.anchor && typeof certificate.anchor === 'object' ? certificate.anchor : {}
  out.anchor = {
    type: legacyBatch ? Certificate.ANCHOR_TYPE.BATCH : Certificate.ANCHOR_TYPE.DIRECT,
    network: a.network || Certificate.DEFAULT_NETWORK,
    txid: a.txid,
    vout: a.vout === undefined ? 0 : a.vout,
    blockHeight: a.blockHeight === undefined ? null : a.blockHeight,
    blockTime: a.blockTime === undefined ? null : a.blockTime
  }

  if (certificate.merkle && typeof certificate.merkle === 'object') {
    var m = certificate.merkle
    var path = m.path
    try {
      path = sidedPath(m.path, m.leafIndex, m.leafCount)
    } catch (e) {
      // Left as it was: validateShape reports it, and verification then fails.
    }
    out.merkle = { root: m.root, leafIndex: m.leafIndex, leafCount: m.leafCount, path: path }
  }

  return out
}

/**
 * The raw proof fields a certificate's strings decode to — what the canonical proof
 * bytes, the signature check and the on-chain record comparison all operate on.
 *
 * @param {Object} certificate
 * @returns {Object} { algorithm, hashAlgorithm, payloadHash, publicKey, signature, createdAtUnix }
 */
Certificate.toProofInput = function (certificate) {
  $.checkArgument(certificate && typeof certificate === 'object', 'certificate is required')
  var c = Certificate.normalize(certificate)
  return {
    algorithm: c.algorithm,
    hashAlgorithm: c.hashAlgorithm,
    payloadHash: Certificate.decodeBytes(c.payloadHash, 'hex', 'payloadHash'),
    publicKey: Certificate.decodeBytes(c.publicKey, c.encoding, 'publicKey'),
    signature: Certificate.decodeBytes(c.signature, c.encoding, 'signature'),
    createdAtUnix: Encoding.toUnixSeconds(c.createdAt)
  }
}

/**
 * Recompute the proofHash a certificate's own fields imply.
 *
 * This is validity check 2 of the three the spec requires, and it needs no network. It
 * decodes the string fields back to bytes first: the canonical proof bytes are over the
 * raw bytes, and hashing the strings would produce a value that is wrong in a way that
 * still looks like a hash.
 *
 * @param {Object} certificate
 * @returns {Buffer} 32 bytes
 */
Certificate.recomputeProofHash = function (certificate) {
  return Encoding.proofHash(Certificate.toProofInput(certificate))
}

/**
 * Does the stated proofHash match the fields beside it?
 *
 * Strict boolean. Returns false rather than throwing on a malformed certificate, because
 * "this certificate is not valid" is the honest answer to one that cannot be parsed, and
 * a caller writing `if (proofHashMatches(c))` must not get a truthy object.
 *
 * @param {Object} certificate
 * @returns {Boolean}
 */
Certificate.proofHashMatches = function (certificate) {
  try {
    if (!certificate || typeof certificate.proofHash !== 'string') return false
    var stated = Certificate.decodeBytes(certificate.proofHash, 'hex', 'proofHash')
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

function checkHash32 (value, name, problems) {
  if (value === undefined) return
  var clean = typeof value === 'string' && value.slice(0, 2) === '0x' ? value.slice(2) : value
  if (typeof clean !== 'string' || !HEX_RE.test(clean) || clean.length % 2 !== 0) {
    problems.push(name + ' must be a hex string')
  } else if (clean.length !== 64) {
    problems.push(name + ' must be 32 bytes (64 hex chars)')
  }
}

function isIntegerOrNull (v) { return v === null || Number.isInteger(v) }

/**
 * Check a certificate's SHAPE — that the required fields are present and well-formed.
 *
 * This is NOT verification. It says nothing about whether the signature is valid, whether
 * the proofHash matches, or whether the anchor exists. It exists so that those checks can
 * assume a parseable object, and it returns a list of problems rather than a boolean so
 * the caller can report which field is wrong. A legacy certificate is normalised first,
 * so it is judged in the reference format like any other.
 *
 * @param {Object} certificate
 * @returns {Array<String>} problems; empty means the shape is fine
 */
Certificate.validateShape = function (certificate) {
  if (!certificate || typeof certificate !== 'object') {
    return ['certificate must be an object']
  }
  var c = Certificate.normalize(certificate)
  var problems = []

  Certificate.REQUIRED_FIELDS.forEach(function (field) {
    if (c[field] === undefined) problems.push('missing required field: ' + field)
  })

  if (c.protocol !== undefined && c.protocol !== Certificate.PROTOCOL) {
    problems.push('protocol must be "' + Certificate.PROTOCOL + '"')
  }
  if (c.version !== undefined && c.version !== Certificate.REFERENCE_VERSION) {
    problems.push('unsupported version: ' + JSON.stringify(c.version))
  }
  if (c.mode !== undefined && c.mode !== Certificate.MODE.FULL && c.mode !== Certificate.MODE.HYBRID) {
    problems.push('mode must be "full" or "hybrid"')
  }
  ;['algorithm', 'hashAlgorithm'].forEach(function (field) {
    if (c[field] !== undefined && (typeof c[field] !== 'string' || c[field].length === 0)) {
      problems.push(field + ' must be a non-empty string')
    }
  })
  checkHash32(c.payloadHash, 'payloadHash', problems)
  checkHash32(c.proofHash, 'proofHash', problems)

  if (c.encoding !== undefined) {
    if (c.encoding !== Certificate.ENCODING.HEX && c.encoding !== Certificate.ENCODING.BASE64) {
      problems.push('encoding must be "hex" or "base64"')
    } else {
      ;['publicKey', 'signature'].forEach(function (field) {
        if (c[field] === undefined) return
        try {
          if (Certificate.decodeBytes(c[field], c.encoding, field).length === 0) {
            problems.push(field + ' must not be empty')
          }
        } catch (e) {
          problems.push(field + ' is not valid ' + c.encoding)
        }
      })
    }
  }

  if (c.createdAt !== undefined && (typeof c.createdAt !== 'string' || isNaN(new Date(c.createdAt).getTime()))) {
    problems.push('createdAt must be an ISO 8601 date')
  }

  if (c.anchor !== undefined) {
    var a = c.anchor
    if (!a || typeof a !== 'object') {
      problems.push('anchor must be an object')
    } else {
      if (a.type !== Certificate.ANCHOR_TYPE.DIRECT && a.type !== Certificate.ANCHOR_TYPE.BATCH) {
        problems.push('anchor.type must be "direct" or "batch"')
      }
      if (typeof a.txid !== 'string' || !/^[0-9a-fA-F]{64}$/.test(a.txid)) {
        problems.push('anchor.txid must be a 32-byte hex string')
      }
      if (a.vout !== undefined && !(Number.isInteger(a.vout) && a.vout >= 0)) {
        problems.push('anchor.vout must be a non-negative integer')
      }
      if (a.blockHeight !== undefined && !isIntegerOrNull(a.blockHeight)) {
        problems.push('anchor.blockHeight must be an integer or null')
      }
      if (a.blockTime !== undefined && !isIntegerOrNull(a.blockTime)) {
        problems.push('anchor.blockTime must be an integer or null')
      }
      if (a.type === Certificate.ANCHOR_TYPE.BATCH && c.merkle === undefined) {
        problems.push('batch certificates require a merkle inclusion proof')
      }
    }
  }

  if (c.merkle !== undefined) {
    var m = c.merkle
    if (!m || typeof m !== 'object') {
      problems.push('merkle must be an object')
    } else {
      checkHash32(m.root, 'merkle.root', problems)
      if (!(Number.isInteger(m.leafIndex) && m.leafIndex >= 0)) {
        problems.push('merkle.leafIndex must be a non-negative integer')
      }
      if (!(Number.isInteger(m.leafCount) && m.leafCount >= 1)) {
        problems.push('merkle.leafCount must be a positive integer')
      } else if (Number.isInteger(m.leafIndex) && m.leafIndex >= m.leafCount) {
        problems.push('merkle.leafIndex must be less than leafCount')
      }
      if (!Array.isArray(m.path)) {
        problems.push('merkle.path must be an array')
      } else {
        m.path.forEach(function (n, i) {
          if (!n || typeof n !== 'object' || (n.side !== 'left' && n.side !== 'right')) {
            problems.push('merkle.path[' + i + '] must be { hash, side: "left" | "right" }')
          } else {
            checkHash32(n.hash, 'merkle.path[' + i + '].hash', problems)
          }
        })
      }
    }
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
