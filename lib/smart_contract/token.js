'use strict'
/**
 * SmartContract.Token — a stateful ownership token (NFT) covenant.
 *
 * Carries mutable STATE in its own locking script and enforces a STATE-
 * TRANSITION rule on every spend.
 *   State          : 32-byte owner id = SHA256(ownerSecret).
 *   Transition rule: to spend, the owner reveals `ownerSecret`; the spend must
 *                    recreate the SAME token code with a (possibly new) owner,
 *                    paying value-fee forward. A transferable, perpetual NFT.
 *
 * Layout: <ownerHash:32> OP_DROP <CODE>. The leading push embeds the state so it
 * rides inside `scriptCode`; OP_DROP discards the runtime copy because CODE reads
 * the authoritative state from the authenticated preimage. Within the scriptCode
 * chunk (varint||script, 3-byte varint for ~480B scripts):
 *   [0:4] = varint||0x20 (prefix), [4:36] = ownerHash, [36:] = 0x75||CODE (suffix)
 * A transfer rebuilds the chunk as prefix || newOwnerHash || suffix.
 *
 * Unlocking script: <ownerSecret> <newOwnerHash> <preimage>.
 * Requires post-Genesis limits (SmartContract.enableGenesis()).
 */

var bsv = require('../..')
var Hash = require('../crypto/hash')
var P = require('./pushtx')
var H = require('./covenant_helpers')

var Script = bsv.Script
var Opcode = bsv.Opcode
var n = H.scriptNum

/** Build the token locking script for a given owner and per-hop fee. */
function ownershipToken (fee, ownerHash) {
  if (ownerHash.length !== 32) throw new Error('ownerHash must be 32 bytes (SHA256)')
  var s = new Script()
  s.add(Buffer.from(ownerHash)) // <ownerHash:32>
  s.add(Opcode.OP_DROP)

  // CODE — stack at entry: [ownerSecret, newOwnerHash, preimage]
  s.add(Opcode.OP_DUP); P.pushTxCore(s); s.add(Opcode.OP_VERIFY) // authenticate

  // park value (8B @ offsetFromEnd 52) and hashOutputs (32B @ offsetFromEnd 40)
  s.add(Opcode.OP_DUP)
    .add(Opcode.OP_SIZE).add(n(52)).add(Opcode.OP_SUB).add(Opcode.OP_SPLIT).add(Opcode.OP_NIP)
    .add(n(8)).add(Opcode.OP_SPLIT).add(Opcode.OP_DROP).add(Opcode.OP_TOALTSTACK) // alt:[value8]
  s.add(Opcode.OP_DUP); P.extractHashOutputs(s); s.add(Opcode.OP_TOALTSTACK) // alt:[value8, hashOutputs]

  // scriptChunk = preimage[104 : len-52] (consumes preimage)
  s.add(n(104)).add(Opcode.OP_SPLIT).add(Opcode.OP_NIP)
    .add(Opcode.OP_SIZE).add(n(52)).add(Opcode.OP_SUB).add(Opcode.OP_SPLIT).add(Opcode.OP_DROP)

  // owner authorization: SHA256(ownerSecret) == ownerHash (chunk[4:36])
  s.add(Opcode.OP_DUP).add(n(4)).add(Opcode.OP_SPLIT).add(Opcode.OP_NIP)
    .add(n(32)).add(Opcode.OP_SPLIT).add(Opcode.OP_DROP)
  s.add(n(3)).add(Opcode.OP_ROLL)
  s.add(Opcode.OP_SHA256).add(Opcode.OP_EQUALVERIFY) // [newOwnerHash, scriptChunk]

  // rebuild chunk with new owner: prefix(4) || newOwnerHash || suffix
  s.add(n(4)).add(Opcode.OP_SPLIT).add(n(32)).add(Opcode.OP_SPLIT).add(Opcode.OP_NIP)
  s.add(Opcode.OP_TOALTSTACK) // park suffix
  s.add(Opcode.OP_SWAP).add(Opcode.OP_CAT) // prefix || newOwnerHash
  s.add(Opcode.OP_FROMALTSTACK).add(Opcode.OP_CAT) // || suffix => nextChunk

  // newValue = value - fee (8B LE); nextOutput = newValue || nextChunk
  s.add(Opcode.OP_FROMALTSTACK) // hashOutputs
  s.add(Opcode.OP_SWAP)
  s.add(Opcode.OP_FROMALTSTACK) // value8
  s.add(Opcode.OP_BIN2NUM).add(n(fee)).add(Opcode.OP_SUB).add(n(8)).add(Opcode.OP_NUM2BIN)
  s.add(Opcode.OP_SWAP).add(Opcode.OP_CAT)
  s.add(Opcode.OP_HASH256)
  s.add(Opcode.OP_EQUAL)

  var len = s.toBuffer().length
  if (len <= 252 || len > 0xffff) {
    throw new Error('token script length must use a 3-byte varint (253..65535); got ' + len)
  }
  return s
}

/** Owner identifier from a secret. */
function ownerId (secret) { return Hash.sha256(secret) }

/** Unlocking script for a transfer. */
function unlockTransfer (ownerSecret, newOwnerHash, preimage) {
  return new Script()
    .add(Buffer.from(ownerSecret))
    .add(Buffer.from(newOwnerHash))
    .add(Buffer.from(preimage))
}

module.exports = {
  ownershipToken: ownershipToken,
  ownerId: ownerId,
  unlockTransfer: unlockTransfer
}
