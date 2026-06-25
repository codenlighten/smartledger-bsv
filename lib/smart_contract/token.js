'use strict'
/**
 * SmartContract.Token — a stateful ownership token (NFT) covenant.
 *
 * Carries mutable STATE in its own locking script and enforces a STATE-
 * TRANSITION rule on every spend.
 *   State          : 20-byte owner id = HASH160(ownerPubKey).
 *   Transition rule: to spend, the current owner provides an ECDSA SIGNATURE over
 *                    THIS spend (OP_CHECKSIG), and the spend must recreate the
 *                    SAME token code with a (possibly new) owner, paying value-fee
 *                    forward. A transferable, perpetual NFT.
 *
 * Why a signature, not a revealed hash-preimage. An earlier design gated the
 * spend on revealing `ownerSecret` with SHA256(ownerSecret)==ownerHash. That is a
 * hash-lock: the secret is exposed in the mempool on the first spend, and because
 * the spender freely chooses the next owner, a watcher can lift the revealed
 * secret and broadcast a competing spend that redirects the token to themselves —
 * front-running theft. Binding authorization to an ECDSA signature fixes this: the
 * signature commits (via SIGHASH_ALL hashOutputs) to the exact recreated output,
 * including the chosen next owner, so a third party who alters the destination
 * invalidates the signature. Ownership is now a key, not a secret.
 *
 * Layout: <ownerPubKeyHash:20> OP_DROP <CODE>. The leading push embeds the state
 * so it rides inside `scriptCode`; OP_DROP discards the runtime copy because CODE
 * reads the authoritative state from the authenticated preimage. Within the
 * scriptCode chunk (varint||script, 3-byte varint for ~480B scripts):
 *   [0:4] = varint||0x14 (prefix), [4:24] = ownerPubKeyHash, [24:] = 0x75||CODE
 * A transfer rebuilds the chunk as prefix || newOwnerHash || suffix.
 *
 * Unlocking script: <newOwnerHash> <ownerSig> <ownerPubKey> <preimage>.
 * Requires post-Genesis limits (SmartContract.enableGenesis()).
 */

var bsv = require('../..')
var Hash = require('../crypto/hash')
var P = require('./pushtx')
var H = require('./covenant_helpers')

var Script = bsv.Script
var Opcode = bsv.Opcode
var n = H.scriptNum

/** Build the token locking script for a given owner-key-hash and per-hop fee. */
function ownershipToken (fee, ownerPubKeyHash) {
  if (ownerPubKeyHash.length !== 20) {
    throw new Error('ownerPubKeyHash must be 20 bytes (HASH160 of the owner public key)')
  }
  var s = new Script()
  s.add(Buffer.from(ownerPubKeyHash)) // <ownerPubKeyHash:20>
  s.add(Opcode.OP_DROP)

  // CODE — stack at entry: [newOwnerHash, ownerSig, ownerPubKey, preimage]
  s.add(Opcode.OP_DUP); P.pushTxCore(s); s.add(Opcode.OP_VERIFY) // authenticate
  P.assertSighashAll(s) // fail fast unless this spend is SIGHASH_ALL|FORKID (0x41)

  // park value (8B @ offsetFromEnd 52) and hashOutputs (32B @ offsetFromEnd 40)
  s.add(Opcode.OP_DUP)
    .add(n(52)).add(Opcode.OP_RIGHT).add(n(8)).add(Opcode.OP_LEFT).add(Opcode.OP_TOALTSTACK) // alt:[value8]
  s.add(Opcode.OP_DUP); P.extractHashOutputs(s); s.add(Opcode.OP_TOALTSTACK) // alt:[value8, hashOutputs]

  // scriptChunk = preimage[104 : len-52] (consumes preimage)
  s.add(n(104)).add(Opcode.OP_SPLIT).add(Opcode.OP_NIP)
    .add(Opcode.OP_SIZE).add(n(52)).add(Opcode.OP_SUB).add(Opcode.OP_SPLIT).add(Opcode.OP_DROP)
  // stack: [newOwnerHash, ownerSig, ownerPubKey, scriptChunk]

  // pull the authoritative ownerPubKeyHash out of the authenticated chunk = chunk[4:24]
  s.add(Opcode.OP_DUP).add(n(4)).add(n(20)).add(Opcode.OP_SUBSTR) // [.., scriptChunk, ownerPKH]
  s.add(Opcode.OP_SWAP).add(Opcode.OP_TOALTSTACK) // park scriptChunk for the rebuild; [.., ownerPubKey, ownerPKH]

  // owner authorization: HASH160(ownerPubKey) == ownerPKH AND ownerSig signs THIS spend
  s.add(Opcode.OP_SWAP).add(Opcode.OP_DUP).add(Opcode.OP_HASH160) // [.., ownerSig, ownerPKH, ownerPubKey, h160]
  s.add(Opcode.OP_ROT).add(Opcode.OP_EQUALVERIFY) // h160 == ownerPKH ; [.., ownerSig, ownerPubKey]
  s.add(Opcode.OP_CHECKSIGVERIFY) // ECDSA over this spend ; [newOwnerHash]

  // rebuild chunk with new owner: prefix(4) || newOwnerHash(20) || suffix
  s.add(Opcode.OP_FROMALTSTACK) // scriptChunk ; [newOwnerHash, scriptChunk]
  s.add(n(4)).add(Opcode.OP_SPLIT).add(n(20)).add(Opcode.OP_SPLIT).add(Opcode.OP_NIP) // [newOwnerHash, prefix, suffix]
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

/** Owner identifier from a key: HASH160(ownerPubKey). Accepts a PrivateKey or PublicKey. */
function ownerId (key) {
  var pub = (key instanceof bsv.PrivateKey) ? key.toPublicKey() : key
  return Hash.sha256ripemd160(pub.toBuffer())
}

/**
 * Build the unlocking script for a transfer. Grinds the spend so the in-script
 * OP_PUSH_TX signature is canonical, THEN signs with the owner key — the owner's
 * signature must commit to the final tx (nLockTime + outputs), which is exactly
 * what binds the chosen `newOwnerHash` and defeats front-running.
 *
 * @param {PrivateKey} ownerPrivateKey  the CURRENT owner's key.
 * @param {Buffer}     newOwnerHash     20-byte HASH160 of the NEXT owner's pubkey.
 * @param {Transaction} spend           the spend tx (its single output recreates the token).
 * @param {number}     satoshis         value of the token UTXO being spent.
 * @param {Script}     lockingScript    the token script being spent.
 * @param {object}     [opts]           { inputIndex=0, grind } — grind forwarded to PushTx.grind.
 */
function unlockTransfer (ownerPrivateKey, newOwnerHash, spend, satoshis, lockingScript, opts) {
  opts = opts || {}
  var inputIndex = opts.inputIndex || 0
  if (newOwnerHash.length !== 20) {
    throw new Error('newOwnerHash must be 20 bytes (HASH160 of the next owner public key)')
  }
  P.grind(spend, inputIndex, lockingScript, satoshis, opts.grind)
  var preimage = H.rawPreimage(spend, inputIndex, lockingScript, satoshis)
  var sig = H.signInput(spend, ownerPrivateKey, inputIndex, lockingScript, satoshis)
  var pub = ownerPrivateKey.toPublicKey()
  return new Script()
    .add(Buffer.from(newOwnerHash))
    .add(sig)
    .add(pub.toBuffer())
    .add(Buffer.from(preimage))
}

module.exports = {
  ownershipToken: ownershipToken,
  ownerId: ownerId,
  unlockTransfer: unlockTransfer
}
