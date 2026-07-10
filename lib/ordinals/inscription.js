'use strict'
/**
 * 1Sat Ordinals inscriptions.
 *
 * An inscription is content (a content-type + a body) carried on a 1-satoshi output
 * behind an inert data envelope, appended to a normal locking script (P2PKH by
 * default). The envelope is never executed, so spending is controlled entirely by the
 * base lock while the inscription rides on the satoshi:
 *
 *   <lockingScript>
 *   OP_FALSE OP_IF
 *     "ord"
 *     OP_1 <contentType>
 *     OP_0 <content>
 *   OP_ENDIF
 *
 * This matches the widely-used 1Sat Ordinals format (js-1sat-ord).
 */
var bsv = require('../..')

var ORD = Buffer.from('ord', 'utf8')

function scriptClass () { return bsv.Script }
function op () { return bsv.Opcode }

/** Resolve a base locking script from a Script, an Address, or an address string. */
function resolveLock (params) {
  var Script = scriptClass()
  if (params.lock) {
    if (params.lock instanceof Script) return params.lock
    if (Buffer.isBuffer(params.lock)) return Script.fromBuffer(params.lock)
    if (typeof params.lock === 'string') return Script.fromHex(params.lock)
    throw new Error('lock must be a Script, Buffer, or hex string')
  }
  if (params.address) {
    var addr = (params.address instanceof bsv.Address)
      ? params.address
      : bsv.Address.fromString(String(params.address))
    return Script.buildPublicKeyHashOut(addr)
  }
  throw new Error('buildInscription requires an address or a lock script')
}

function toBuf (v, enc) {
  if (Buffer.isBuffer(v)) return v
  if (v == null) return Buffer.alloc(0)
  return Buffer.from(String(v), enc || 'utf8')
}

/**
 * Build a 1Sat Ordinals inscription locking script: a base lock followed by the
 * inert `OP_FALSE OP_IF ... OP_ENDIF` envelope carrying the content.
 *
 * @param {object} params
 * @param {string|Buffer} params.contentType  e.g. 'text/plain', 'image/png'
 * @param {string|Buffer} params.content       the inscription body
 * @param {Script|Buffer|string} [params.lock] base locking script (overrides address)
 * @param {Address|string} [params.address]    P2PKH owner (used if no `lock`)
 * @returns {Script} the full inscription locking script
 */
function buildInscription (params) {
  params = params || {}
  var Opcode = op()
  var lock = resolveLock(params)
  var contentType = toBuf(params.contentType || 'text/plain')
  var content = toBuf(params.content)

  // Clone the base lock so we never mutate the caller's Script.
  var s = scriptClass().fromBuffer(lock.toBuffer())
  s.add(Opcode.OP_FALSE)
  s.add(Opcode.OP_IF)
  s.add(ORD)
  s.add(Opcode.OP_1)
  s.add(contentType)
  s.add(Opcode.OP_0)
  s.add(content)
  s.add(Opcode.OP_ENDIF)
  return s
}

function chunkIsOp (chunk, opcodenum) {
  return chunk && chunk.opcodenum === opcodenum && (chunk.buf == null)
}

/**
 * Parse a 1Sat Ordinals inscription out of a locking script.
 * @param {Script|Buffer|string} script
 * @returns {null|{ contentType: string, content: Buffer, contentText: string, lock: Script }}
 *   null if the script carries no inscription envelope.
 */
function parseInscription (script) {
  var Script = scriptClass()
  var Opcode = op()
  var s = (script instanceof Script) ? script
    : Buffer.isBuffer(script) ? Script.fromBuffer(script)
      : Script.fromHex(script)
  var chunks = s.chunks

  // Find `OP_FALSE OP_IF "ord"`.
  var start = -1
  for (var i = 0; i + 2 < chunks.length; i++) {
    if (chunkIsOp(chunks[i], Opcode.OP_FALSE) &&
        chunkIsOp(chunks[i + 1], Opcode.OP_IF) &&
        chunks[i + 2].buf && chunks[i + 2].buf.equals(ORD)) {
      start = i
      break
    }
  }
  if (start === -1) return null

  // Everything before the envelope is the base lock.
  var lock = new Script()
  for (var k = 0; k < start; k++) lock.chunks.push(chunks[k])

  // Walk fields after "ord" until OP_ENDIF: OP_1 => content-type, OP_0 => body.
  var contentType = Buffer.alloc(0)
  var content = Buffer.alloc(0)
  for (var j = start + 3; j < chunks.length; j++) {
    var c = chunks[j]
    if (chunkIsOp(c, Opcode.OP_ENDIF)) break
    if (chunkIsOp(c, Opcode.OP_1) && chunks[j + 1] && chunks[j + 1].buf) {
      contentType = chunks[j + 1].buf; j++
    } else if (chunkIsOp(c, Opcode.OP_0) && chunks[j + 1] && chunks[j + 1].buf) {
      content = chunks[j + 1].buf; j++
    }
  }

  return {
    contentType: contentType.toString('utf8'),
    content: content,
    contentText: content.toString('utf8'),
    lock: lock
  }
}

/** True if the script carries an inscription envelope. */
function isInscription (script) {
  try { return parseInscription(script) !== null } catch (e) { return false }
}

/**
 * Build the 1-satoshi Transaction.Output carrying an inscription.
 * @returns {Transaction.Output}
 */
function createInscriptionOutput (params) {
  params = params || {}
  var satoshis = params.satoshis != null ? params.satoshis : 1
  return new bsv.Transaction.Output({
    script: buildInscription(params),
    satoshis: satoshis
  })
}

module.exports = {
  buildInscription: buildInscription,
  parseInscription: parseInscription,
  isInscription: isInscription,
  createInscriptionOutput: createInscriptionOutput
}
