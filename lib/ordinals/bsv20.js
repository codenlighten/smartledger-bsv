'use strict'
/**
 * BSV-20 / BSV-21 fungible-token inscriptions.
 *
 * A BSV-20 token is a JSON payload (content-type `application/bsv-20`) carried inside an
 * ordinary 1Sat Ordinals inscription envelope on a 1-satoshi output. The token amount is
 * per-UTXO; an indexer tracks balances by replaying deploy / mint / transfer operations.
 * This module builds and parses those payloads — the on-chain plumbing is just an
 * inscription (see ./inscription), so a token output is a normal P2PKH-owned 1-sat output.
 *
 * Two protocol eras are supported:
 *   v1  (ticker-based)  deploy / mint / transfer keyed by a 1–4 byte `tick`.
 *   v2 / BSV-21 (id-based)  `deploy+mint` a supply in one step; transfer by `id`
 *                           (the deploy outpoint, `<txid>_<vout>`).
 *
 * Amounts (`amt`, `max`, `lim`) are INTEGER STRINGS — they routinely exceed 2^53, so they
 * are never coerced to JS numbers. `dec` (decimals, 0–18) scales display only.
 */
var inscription = require('./inscription')

var CONTENT_TYPE = 'application/bsv-20'
var MAX_DEC = 18

/** A non-negative integer string (no sign, no decimal point). */
function isIntString (v) { return typeof v === 'string' && /^\d+$/.test(v) }

/** Normalize an amount-like field to a CANONICAL non-negative integer string (no leading zeros). */
function normInt (v, name) {
  if (typeof v === 'number') {
    if (!Number.isInteger(v) || v < 0) throw new Error(name + ' must be a non-negative integer')
    return String(v)
  }
  // Strip leading zeros ("007" -> "7", "000" -> "0") so the emitted payload is canonical
  // and not rejected by indexers that expect canonical decimal integers.
  if (isIntString(v)) return v.replace(/^0+(?=\d)/, '')
  throw new Error(name + ' must be a non-negative integer (string or number)')
}

/** Normalize a strictly-positive amount (mint/transfer/supply must move > 0). */
function normPositive (v, name) {
  var s = normInt(v, name)
  if (!/[1-9]/.test(s)) throw new Error(name + ' must be greater than zero')
  return s
}

/** Validate a v1 ticker: 1–4 UTF-8 bytes. */
function assertTick (tick) {
  if (typeof tick !== 'string' || !tick.length) throw new Error('tick is required')
  if (Buffer.byteLength(tick, 'utf8') > 4) throw new Error('tick must be 1–4 UTF-8 bytes')
  return tick
}

/** Normalize `dec` (decimals) to a string in 0…18. */
function normDec (dec) {
  var d = typeof dec === 'string' ? Number(dec) : dec
  if (!Number.isInteger(d) || d < 0 || d > MAX_DEC) throw new Error('dec must be an integer 0…' + MAX_DEC)
  return String(d)
}

/** Validate a BSV-21 token id: `<64-hex-txid>_<vout>`. */
function assertId (id) {
  if (typeof id !== 'string' || !/^[0-9a-fA-F]{64}_\d+$/.test(id)) {
    throw new Error('id must be "<txid>_<vout>" (64-hex txid, underscore, output index)')
  }
  return id
}

/** Wrap a BSV-20 JSON payload in an inscription locking script (P2PKH owner by default). */
function buildBsv20 (payload, params) {
  params = params || {}
  return inscription.buildInscription({
    lock: params.lock,
    address: params.address,
    contentType: params.contentType || CONTENT_TYPE,
    content: JSON.stringify(payload)
  })
}

/**
 * Deploy a v1 (ticker) token: fix its ticker, max supply, per-mint limit, and decimals.
 * @param {object} params { tick, max, lim?, dec?, address|lock, contentType? }
 * @returns {Script}
 */
function buildDeploy (params) {
  params = params || {}
  var p = { p: 'bsv-20', op: 'deploy', tick: assertTick(params.tick), max: normPositive(params.max, 'max') }
  if (params.lim != null) p.lim = normPositive(params.lim, 'lim')
  if (params.dec != null) p.dec = normDec(params.dec)
  return buildBsv20(p, params)
}

/**
 * Mint an amount of a v1 (ticker) token.
 * @param {object} params { tick, amt, address|lock, contentType? }
 * @returns {Script}
 */
function buildMint (params) {
  params = params || {}
  var p = { p: 'bsv-20', op: 'mint', tick: assertTick(params.tick), amt: normPositive(params.amt, 'amt') }
  return buildBsv20(p, params)
}

/**
 * Transfer an amount of a token. Provide `tick` (v1) OR `id` (v2 / BSV-21).
 * @param {object} params { tick?|id?, amt, address|lock, contentType? }
 * @returns {Script}
 */
function buildTransfer (params) {
  params = params || {}
  var p = { p: 'bsv-20', op: 'transfer', amt: normPositive(params.amt, 'amt') }
  if (params.id != null) p.id = assertId(params.id)
  else p.tick = assertTick(params.tick)
  return buildBsv20(p, params)
}

/**
 * Deploy + mint a BSV-21 (id-based) token supply in one operation.
 * @param {object} params { amt, dec?, sym?, icon?, address|lock, contentType? }
 * @returns {Script}
 */
function buildDeployMint (params) {
  params = params || {}
  var p = { p: 'bsv-20', op: 'deploy+mint', amt: normPositive(params.amt, 'amt') }
  if (params.dec != null) p.dec = normDec(params.dec)
  if (params.sym != null) p.sym = String(params.sym)
  if (params.icon != null) p.icon = String(params.icon)
  return buildBsv20(p, params)
}

function outputFor (script, satoshis) {
  var bsv = require('../..')
  return new bsv.Transaction.Output({ script: script, satoshis: satoshis != null ? satoshis : 1 })
}

/** 1-sat Output helpers mirroring the builders. */
function createDeployOutput (params) { return outputFor(buildDeploy(params), params && params.satoshis) }
function createMintOutput (params) { return outputFor(buildMint(params), params && params.satoshis) }
function createTransferOutput (params) { return outputFor(buildTransfer(params), params && params.satoshis) }
function createDeployMintOutput (params) { return outputFor(buildDeployMint(params), params && params.satoshis) }

/** Extract the JSON body from a locking script, a JSON string, a Buffer, or an object. */
function bodyOf (input) {
  var bsv = require('../..')
  if (input && typeof input === 'object' && !Buffer.isBuffer(input) && !(input instanceof bsv.Script)) {
    return input // already a parsed object
  }
  if (typeof input === 'string' && input.trim()[0] === '{') return input // raw JSON string
  var insc = inscription.parseInscription(input) // Script / Buffer / hex script
  return insc ? insc.contentText : null
}

/**
 * Parse a BSV-20 payload from a locking script (Script/Buffer/hex), a JSON string, or an
 * already-parsed object. Returns the payload object (with `p:'bsv-20'`) or null if the
 * input carries no valid BSV-20 inscription.
 * @returns {null|{ p:'bsv-20', op:string, tick?:string, id?:string, amt?:string, max?:string, lim?:string, dec?:string, sym?:string, icon?:string }}
 */
function parseBsv20 (input) {
  try {
    var body = bodyOf(input)
    if (body == null) return null
    var obj = (typeof body === 'object') ? body : JSON.parse(body)
    if (!obj || obj.p !== 'bsv-20' || typeof obj.op !== 'string') return null
    return obj
  } catch (e) {
    return null
  }
}

/** True if the input carries a valid BSV-20 inscription. */
function isBsv20 (input) { return parseBsv20(input) !== null }

module.exports = {
  CONTENT_TYPE: CONTENT_TYPE,
  buildDeploy: buildDeploy,
  buildMint: buildMint,
  buildTransfer: buildTransfer,
  buildDeployMint: buildDeployMint,
  createDeployOutput: createDeployOutput,
  createMintOutput: createMintOutput,
  createTransferOutput: createTransferOutput,
  createDeployMintOutput: createDeployMintOutput,
  parseBsv20: parseBsv20,
  isBsv20: isBsv20
}
