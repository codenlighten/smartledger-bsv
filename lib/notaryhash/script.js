'use strict'

var Script = require('../script/script')
var Opcode = require('../opcode')
var Hash = require('../crypto/hash')
var $ = require('../util/preconditions')

/**
 * BRC-220 on-chain record: an `OP_FALSE OP_RETURN` safe data output.
 *
 *   full   (mode 0): "NOTARYHASH" | u8(1) | u8(0) | algorithm | hashAlgorithm |
 *                    payloadHash | proofHash | publicKey | signature
 *   hybrid (mode 1): as full, but the last two pushes are SHA-256 of each
 *   batch  (kind 2): "NOTARYHASH" | u8(1) | u8(2) | merkleRoot(32) | u32be(leafCount)
 *
 * NOTE the framing differs from the canonical proof bytes on purpose. Those use
 * `lp(x) = u32be(len(x)) || x` because they are one flat byte string; here each field is
 * its own SCRIPT PUSH, and the push opcode already carries the length. Applying `lp()`
 * again would double-encode every field. Both achieve unambiguous boundaries; only one is
 * correct in each place.
 */

var NotaryScript = {}

/** Push index 0. Ten ASCII bytes; the spec states no length, the literal is the spec. */
NotaryScript.PREFIX = 'NOTARYHASH'

/** Push index 1. */
NotaryScript.VERSION = 1

/** Push index 2 — the byte that discriminates the layout. */
NotaryScript.MODE = {
  FULL: 0,
  HYBRID: 1,
  BATCH: 2
}

function u8 (n) { return Buffer.from([n]) }

function u32be (n) {
  var b = Buffer.alloc(4)
  b.writeUInt32BE(n, 0)
  return b
}

function requireBytes (value, name, length) {
  if (!Buffer.isBuffer(value)) {
    throw new Error(name + ' must be a Buffer of raw bytes, not ' + (typeof value) +
      '. Decode hex with Buffer.from(hex, \'hex\') first.')
  }
  if (length != null && value.length !== length) {
    throw new Error(name + ' must be exactly ' + length + ' bytes, got ' + value.length)
  }
  return value
}

/**
 * Read a push that carries a single unsigned byte.
 *
 * A 1-byte data push is what this library emits and what the spec's `u8(...)` describes.
 * `OP_0` and `OP_1`–`OP_16` are ALSO accepted, because a builder that minimally encodes
 * its pushes — which is the default in several Bitcoin libraries — represents the same
 * values that way, and rejecting those would reject records that are otherwise perfectly
 * conformant. Being strict here would buy nothing: the mode byte is a routing hint, and
 * every field that matters is checked on its own terms further down.
 *
 * @private
 */
function readU8 (chunk, name) {
  if (chunk.buf && chunk.buf.length === 1) return chunk.buf[0]
  if (chunk.opcodenum === Opcode.OP_0) return 0
  if (chunk.opcodenum >= Opcode.OP_1 && chunk.opcodenum <= Opcode.OP_16) {
    return chunk.opcodenum - Opcode.OP_1 + 1
  }
  throw new Error(name + ' must be a single byte at this push')
}

function readBuf (chunk, name) {
  if (!chunk || !chunk.buf) throw new Error(name + ' push is missing or carries no data')
  return chunk.buf
}

/**
 * Build the on-chain record.
 *
 * `publicKey` and `signature` are always supplied in FULL form, whatever the mode. In
 * hybrid mode this function hashes them itself rather than accepting pre-hashed values —
 * a caller who passed an already-hashed blob would produce a record that looks right and
 * cannot be reconciled with the certificate, and nothing downstream would notice.
 *
 * @param {Object} record
 * @param {Number} record.mode - NotaryScript.MODE.*
 * @param {String} record.algorithm - full/hybrid
 * @param {String} record.hashAlgorithm - full/hybrid
 * @param {Buffer} record.payloadHash - full/hybrid, 32 bytes
 * @param {Buffer} record.proofHash - full/hybrid, 32 bytes
 * @param {Buffer} record.publicKey - full/hybrid, raw bytes
 * @param {Buffer} record.signature - full/hybrid, raw bytes
 * @param {Buffer} record.merkleRoot - batch, 32 bytes
 * @param {Number} record.leafCount - batch
 * @returns {Script}
 */
NotaryScript.build = function (record) {
  $.checkArgument(record && typeof record === 'object', 'record is required')

  var mode = record.mode
  $.checkArgument(mode === NotaryScript.MODE.FULL ||
    mode === NotaryScript.MODE.HYBRID ||
    mode === NotaryScript.MODE.BATCH,
  'mode must be 0 (full), 1 (hybrid) or 2 (batch)')

  var script = new Script()
    .add(Opcode.OP_FALSE)
    .add(Opcode.OP_RETURN)
    .add(Buffer.from(NotaryScript.PREFIX, 'ascii'))
    .add(u8(NotaryScript.VERSION))
    .add(u8(mode))

  if (mode === NotaryScript.MODE.BATCH) {
    $.checkArgument(typeof record.leafCount === 'number' && Number.isInteger(record.leafCount) &&
      record.leafCount >= 0, 'leafCount must be a non-negative integer')
    script.add(requireBytes(record.merkleRoot, 'merkleRoot', 32))
    script.add(u32be(record.leafCount))
    return script
  }

  $.checkArgument(typeof record.algorithm === 'string' && record.algorithm.length > 0,
    'algorithm must be a non-empty string')
  $.checkArgument(typeof record.hashAlgorithm === 'string' && record.hashAlgorithm.length > 0,
    'hashAlgorithm must be a non-empty string')

  script.add(Buffer.from(record.algorithm, 'utf8'))
  script.add(Buffer.from(record.hashAlgorithm, 'utf8'))
  script.add(requireBytes(record.payloadHash, 'payloadHash', 32))
  script.add(requireBytes(record.proofHash, 'proofHash', 32))

  var publicKey = requireBytes(record.publicKey, 'publicKey')
  var signature = requireBytes(record.signature, 'signature')

  if (mode === NotaryScript.MODE.HYBRID) {
    script.add(Hash.sha256(publicKey))
    script.add(Hash.sha256(signature))
  } else {
    script.add(publicKey)
    script.add(signature)
  }

  return script
}

/**
 * Parse an on-chain record.
 *
 * Returns a plain object, or throws with a message naming what was wrong. It never
 * returns a partially-populated result: a caller that cannot distinguish "parsed" from
 * "parsed some of it" is the shape that produces confident wrong answers.
 *
 * In hybrid mode the returned `publicKeyHash` / `signatureHash` are the on-chain digests;
 * the full blobs live only in the certificate, and reconciling the two is the caller's
 * job.
 *
 * @param {Script|String} script
 * @returns {Object}
 */
NotaryScript.parse = function (script) {
  if (typeof script === 'string') script = Script.fromHex(script)
  $.checkArgument(script instanceof Script, 'script must be a Script or hex string')

  var chunks = script.chunks

  if (chunks.length < 5) {
    throw new Error('not a NotaryHash record: too few pushes')
  }
  if (chunks[0].opcodenum !== Opcode.OP_FALSE && chunks[0].opcodenum !== Opcode.OP_0) {
    throw new Error('not a NotaryHash record: does not start with OP_FALSE')
  }
  if (chunks[1].opcodenum !== Opcode.OP_RETURN) {
    throw new Error('not a NotaryHash record: no OP_RETURN')
  }

  var prefix = readBuf(chunks[2], 'prefix')
  if (prefix.toString('ascii') !== NotaryScript.PREFIX) {
    throw new Error('not a NotaryHash record: prefix is ' + JSON.stringify(prefix.toString('ascii')))
  }

  var version = readU8(chunks[3], 'version')
  if (version !== NotaryScript.VERSION) {
    throw new Error('unsupported NotaryHash version: ' + version)
  }

  var mode = readU8(chunks[4], 'mode')

  if (mode === NotaryScript.MODE.BATCH) {
    if (chunks.length !== 7) {
      throw new Error('batch record must have exactly 7 pushes, got ' + chunks.length)
    }
    var leafCountBuf = readBuf(chunks[6], 'leafCount')
    if (leafCountBuf.length !== 4) {
      throw new Error('leafCount must be 4 bytes (u32be), got ' + leafCountBuf.length)
    }
    return {
      mode: mode,
      version: version,
      merkleRoot: requireBytes(readBuf(chunks[5], 'merkleRoot'), 'merkleRoot', 32),
      leafCount: leafCountBuf.readUInt32BE(0)
    }
  }

  if (mode !== NotaryScript.MODE.FULL && mode !== NotaryScript.MODE.HYBRID) {
    throw new Error('unknown NotaryHash mode: ' + mode)
  }

  if (chunks.length !== 11) {
    throw new Error('full/hybrid record must have exactly 11 pushes, got ' + chunks.length)
  }

  var parsed = {
    mode: mode,
    version: version,
    algorithm: readBuf(chunks[5], 'algorithm').toString('utf8'),
    hashAlgorithm: readBuf(chunks[6], 'hashAlgorithm').toString('utf8'),
    payloadHash: requireBytes(readBuf(chunks[7], 'payloadHash'), 'payloadHash', 32),
    proofHash: requireBytes(readBuf(chunks[8], 'proofHash'), 'proofHash', 32)
  }

  if (mode === NotaryScript.MODE.HYBRID) {
    parsed.publicKeyHash = requireBytes(readBuf(chunks[9], 'publicKeyHash'), 'publicKeyHash', 32)
    parsed.signatureHash = requireBytes(readBuf(chunks[10], 'signatureHash'), 'signatureHash', 32)
  } else {
    parsed.publicKey = readBuf(chunks[9], 'publicKey')
    parsed.signature = readBuf(chunks[10], 'signature')
  }

  return parsed
}

/**
 * Does this script look like a NotaryHash record?
 *
 * Strictly a cheap filter for scanning outputs — a true result means `parse()` is worth
 * attempting, NOT that the record is well-formed. Anything that acts on the contents must
 * call `parse()` and handle its errors.
 *
 * @param {Script|String} script
 * @returns {Boolean}
 */
NotaryScript.isNotaryHash = function (script) {
  try {
    if (typeof script === 'string') script = Script.fromHex(script)
    var c = script.chunks
    return c.length >= 5 &&
      (c[0].opcodenum === Opcode.OP_FALSE || c[0].opcodenum === Opcode.OP_0) &&
      c[1].opcodenum === Opcode.OP_RETURN &&
      !!c[2].buf &&
      c[2].buf.toString('ascii') === NotaryScript.PREFIX
  } catch (e) {
    return false
  }
}

module.exports = NotaryScript
