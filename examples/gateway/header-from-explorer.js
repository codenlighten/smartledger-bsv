'use strict'

// Turn an explorer's header JSON into the 80 bytes a verifier needs — and prove the bytes are
// right before using them.
//
// Explorers return header FIELDS (version, previousblockhash, merkleroot, time, bits, nonce), not
// the serialised header. Assembling them is mechanical, but assembling them WRONGLY is silent:
// a byte order mistake gives you 80 plausible bytes that verify nothing. So this hashes the
// result back and refuses to return it unless it equals the block id you asked for. That check
// costs one hash and converts a whole class of quiet bug into an exception.
//
// Field names here follow the WhatsOnChain/Bitcoin-RPC shape. Other explorers rename things; map
// them before calling rather than loosening the check.

var bsv = require('../..')

/**
 * @param {Object} json - explorer header fields, including `hash`
 * @returns {String} the 80-byte header as 160 hex characters
 * @throws if the assembled header does not hash to `json.hash`
 */
function headerFromExplorer (json) {
  if (!json || typeof json !== 'object') throw new Error('header json is missing')
  var need = ['hash', 'version', 'previousblockhash', 'merkleroot', 'time', 'bits', 'nonce']
  for (var i = 0; i < need.length; i++) {
    if (json[need[i]] === undefined) throw new Error('header json is missing ' + need[i])
  }

  // Hashes are displayed big-endian and serialised little-endian, which is the usual place this
  // goes wrong.
  var header = bsv.BlockHeader.fromObject({
    version: json.version,
    prevHash: Buffer.from(json.previousblockhash, 'hex').reverse(),
    merkleRoot: Buffer.from(json.merkleroot, 'hex').reverse(),
    time: json.time,
    bits: typeof json.bits === 'string' ? parseInt(json.bits, 16) : json.bits,
    nonce: json.nonce
  })

  if (header.id !== json.hash) {
    throw new Error(
      'assembled header hashes to ' + header.id + ', not the requested ' + json.hash +
      ' — the fields were mapped wrongly, so do not use these bytes'
    )
  }
  return header.toBuffer().toString('hex')
}

module.exports = { headerFromExplorer: headerFromExplorer }
