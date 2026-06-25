'use strict'
/**
 * SmartContract.Token — a stateful ownership token (NFT) covenant.
 *
 * Carries mutable STATE in its own locking script and enforces a STATE-
 * TRANSITION rule on every spend.
 *   State          : 20-byte owner id (an Authorizer commitment — by default the
 *                    HASH160 of the owner's public key).
 *   Transition rule: to spend, the current owner proves authorization over THIS
 *                    spend (an ECDSA signature, an m-of-n multisig, or any custom
 *                    predicate), and the spend must recreate the SAME token code
 *                    with a (possibly new) owner. A transferable, perpetual NFT.
 *
 * Why authorization is a proof over the spend, not a revealed secret. An earlier
 * design gated the spend on revealing `ownerSecret` with SHA256(ownerSecret)==
 * ownerHash — a hash-lock. The secret is exposed in the mempool on the first
 * spend, and because the spender freely chooses the next owner, a watcher can lift
 * the revealed secret and broadcast a competing spend redirecting the token to
 * themselves (front-running theft). Binding authorization to a signature over the
 * spend fixes this: the signature commits (via SIGHASH_ALL hashOutputs) to the
 * exact recreated output, including the chosen next owner, so a third party who
 * alters the destination invalidates the proof. See ./authorizers.
 *
 * Layout: <ownerCommit:20> OP_DROP <CODE>. The leading push embeds the state so it
 * rides inside `scriptCode`; OP_DROP discards the runtime copy because CODE reads
 * the authoritative state from the authenticated preimage. Within the scriptCode
 * chunk (varint||script, 3-byte varint for ~480B scripts):
 *   [0:4] = varint||0x14 (prefix), [4:24] = ownerCommit, [24:] = 0x75||CODE
 * A transfer rebuilds the chunk as prefix || newOwnerHash || suffix.
 *
 * Two output shapes:
 *   ownershipToken(fee, owner[, auth])        — single recreated output, value
 *       forwarded as (input - fee). The classic perpetual NFT.
 *   ownershipTokenMulti(owner[, auth])        — the recreated token output may sit
 *       among other outputs (payments, change, data). The spender reveals the
 *       surrounding output bytes and the token's value; the covenant binds them
 *       into the committed hashOutputs. Value conservation is left to the network.
 *
 * Requires post-Genesis limits (SmartContract.enableGenesis()).
 */

var bsv = require('../..')
var P = require('./pushtx')
var H = require('./covenant_helpers')
var A = require('./authorizers')

var Script = bsv.Script
var Opcode = bsv.Opcode
var n = H.scriptNum

function resolveCommit (owner, auth) {
  var commit = Buffer.isBuffer(owner) ? owner : auth.commit(owner)
  if (commit.length !== 20) throw new Error('owner commitment must be 20 bytes (HASH160)')
  return commit
}

/** Push a possibly-empty buffer MINIMALDATA-cleanly (empty => OP_0). */
function pushData (s, buf) { return buf.length ? s.add(Buffer.from(buf)) : s.add(Opcode.OP_0) }

/**
 * Authenticated head shared by both output shapes. Pre: top of stack = preimage,
 * with the scheme's authArgs and the next-owner hash beneath it. Post: consumes
 * the preimage + authArgs, verifies owner authorization, and leaves the next-owner
 * hash (and any lower unlock items) with the scriptChunk on top; altstack carries
 * [value8, hashOutputs].
 */
function emitAuthHead (s, auth) {
  s.add(Opcode.OP_DUP); P.pushTxCore(s); s.add(Opcode.OP_VERIFY) // authenticate
  P.assertSighashAll(s) // fail fast unless this spend is SIGHASH_ALL|FORKID (0x41)

  // park value (8B @ offsetFromEnd 52) and hashOutputs (32B @ offsetFromEnd 40)
  s.add(Opcode.OP_DUP)
    .add(n(52)).add(Opcode.OP_RIGHT).add(n(8)).add(Opcode.OP_LEFT).add(Opcode.OP_TOALTSTACK) // alt:[value8]
  s.add(Opcode.OP_DUP); P.extractHashOutputs(s); s.add(Opcode.OP_TOALTSTACK) // alt:[value8, hashOutputs]

  // scriptChunk = preimage[104 : len-52] (consumes preimage)
  s.add(n(104)).add(Opcode.OP_SPLIT).add(Opcode.OP_NIP)
    .add(Opcode.OP_SIZE).add(n(52)).add(Opcode.OP_SUB).add(Opcode.OP_SPLIT).add(Opcode.OP_DROP)

  // expose the authoritative ownerCommit (= chunk[4:24]) and park the chunk
  s.add(Opcode.OP_DUP).add(n(4)).add(n(20)).add(Opcode.OP_SUBSTR) // [.., scriptChunk, ownerCommit]
  s.add(Opcode.OP_SWAP).add(Opcode.OP_TOALTSTACK) // alt:[value8, hashOutputs, scriptChunk]; [.., authArgs, ownerCommit]

  auth.emit(s) // consumes authArgs + ownerCommit, VERIFYs authorization over this spend

  s.add(Opcode.OP_FROMALTSTACK) // restore scriptChunk ; alt:[value8, hashOutputs]
  return s
}

/**
 * Rebuild the scriptChunk with the next owner. Pre: [.., newOwnerHash, scriptChunk].
 * Post: [.., nextChunk] = prefix(4) || newOwnerHash(20) || suffix.
 */
function emitRebuild (s) {
  s.add(n(4)).add(Opcode.OP_SPLIT).add(n(20)).add(Opcode.OP_SPLIT).add(Opcode.OP_NIP) // [.., newOwnerHash, prefix, suffix]
  s.add(Opcode.OP_TOALTSTACK) // park suffix
  s.add(Opcode.OP_SWAP).add(Opcode.OP_CAT) // prefix || newOwnerHash
  s.add(Opcode.OP_FROMALTSTACK).add(Opcode.OP_CAT) // || suffix => nextChunk
  return s
}

function assertVarintLen (s) {
  var len = s.toBuffer().length
  if (len <= 252 || len > 0xffff) {
    throw new Error('token script length must use a 3-byte varint (253..65535); got ' + len)
  }
  return s
}

/**
 * Single-output perpetual NFT: the spend's one output recreates the token with a
 * (possibly new) owner and value = (input - fee).
 *
 * @param {number} fee     satoshis deducted at each hop.
 * @param {*}      owner    a 20-byte commitment Buffer, or an owner descriptor the
 *                          authorizer can commit (a key, a key set, ...).
 * @param {object} [auth]   an Authorizer (default Authorizers.singleKey()).
 */
function ownershipToken (fee, owner, auth) {
  auth = auth || A.singleKey()
  var s = new Script()
  s.add(resolveCommit(owner, auth)) // <ownerCommit:20>
  s.add(Opcode.OP_DROP)

  emitAuthHead(s, auth) // stack: [newOwnerHash, scriptChunk] ; alt:[value8, hashOutputs]
  emitRebuild(s) // stack: [nextChunk]

  // newValue = value - fee (8B LE); nextOutput = newValue || nextChunk
  s.add(Opcode.OP_FROMALTSTACK) // hashOutputs
  s.add(Opcode.OP_SWAP)
  s.add(Opcode.OP_FROMALTSTACK) // value8
  s.add(Opcode.OP_BIN2NUM).add(n(fee)).add(Opcode.OP_SUB).add(n(8)).add(Opcode.OP_NUM2BIN)
  s.add(Opcode.OP_SWAP).add(Opcode.OP_CAT)
  s.add(Opcode.OP_HASH256)
  s.add(Opcode.OP_EQUAL)

  return assertVarintLen(s)
}

/**
 * Multi-output NFT: the recreated token output may sit among other outputs. The
 * spender reveals the serialized outputs before and after the token output and the
 * token output's value; the covenant binds them into the committed hashOutputs.
 * Value conservation across the whole tx is enforced by the network, not the script.
 *
 * @param {*}      owner   commitment Buffer or descriptor (see ownershipToken).
 * @param {object} [auth]  an Authorizer (default Authorizers.singleKey()).
 */
function ownershipTokenMulti (owner, auth) {
  auth = auth || A.singleKey()
  var s = new Script()
  s.add(resolveCommit(owner, auth))
  s.add(Opcode.OP_DROP)

  emitAuthHead(s, auth)
  // stack: [before, after, tokenValue8, newOwnerHash, scriptChunk] ; alt:[value8, hashOutputs]
  emitRebuild(s)
  // stack: [before, after, tokenValue8, nextChunk]

  s.add(Opcode.OP_CAT) // tokenValue8 || nextChunk => tokenOutput ; [before, after, tokenOutput]
  s.add(Opcode.OP_SWAP).add(Opcode.OP_CAT) // tokenOutput || after ; [before, tokenOutput||after]
  s.add(Opcode.OP_CAT) // before || tokenOutput || after => allOutputs

  s.add(Opcode.OP_FROMALTSTACK) // hashOutputs ; alt:[value8]
  s.add(Opcode.OP_FROMALTSTACK).add(Opcode.OP_DROP) // discard the input value (not used in multi mode)
  s.add(Opcode.OP_SWAP).add(Opcode.OP_HASH256).add(Opcode.OP_EQUAL) // HASH256(allOutputs) == hashOutputs

  return assertVarintLen(s)
}

/** Owner identifier from a single key: HASH160(ownerPubKey). For other schemes use the authorizer's commit(). */
function ownerId (key) { return A.singleKey().commit(key) }

/**
 * Build the unlocking script for a single-output transfer. Grinds the spend so the
 * in-script OP_PUSH_TX signature is canonical, THEN proves authorization — the
 * owner's proof must commit to the final tx (nLockTime + outputs), which is what
 * binds the chosen `newOwnerHash` and defeats front-running.
 *
 * @param {*}        signer        descriptor passed to the authorizer's unlockArgs
 *                                 (a PrivateKey for single-key; { keys, signWith } for multisig).
 * @param {Buffer}   newOwnerHash  20-byte commitment of the NEXT owner.
 * @param {Transaction} spend      the spend tx (its single output recreates the token).
 * @param {number}   satoshis      value of the token UTXO being spent.
 * @param {Script}   lockingScript the token script being spent.
 * @param {object}   [opts]        { auth, inputIndex=0, grind }.
 */
function unlockTransfer (signer, newOwnerHash, spend, satoshis, lockingScript, opts) {
  opts = opts || {}
  var auth = opts.auth || A.singleKey()
  var inputIndex = opts.inputIndex || 0
  if (newOwnerHash.length !== 20) throw new Error('newOwnerHash must be 20 bytes (HASH160)')
  P.grind(spend, inputIndex, lockingScript, satoshis, opts.grind)
  var preimage = H.rawPreimage(spend, inputIndex, lockingScript, satoshis)
  var args = auth.unlockArgs(spend, inputIndex, lockingScript, satoshis, signer)
  var us = new Script().add(Buffer.from(newOwnerHash))
  args.forEach(function (a) { us.add(a) })
  us.add(Buffer.from(preimage))
  return us
}

/**
 * Unlocking script for a multi-output transfer (see ownershipTokenMulti).
 *
 * @param {object} layout  { before, after, tokenValue } — `before`/`after` are the
 *                         serialized Output bytes surrounding the token output, and
 *                         `tokenValue` is the 8-byte LE value of the token output.
 *                         The spend tx MUST actually contain those outputs in order.
 */
function unlockTransferMulti (signer, newOwnerHash, spend, satoshis, lockingScript, layout, opts) {
  opts = opts || {}
  var auth = opts.auth || A.singleKey()
  var inputIndex = opts.inputIndex || 0
  if (newOwnerHash.length !== 20) throw new Error('newOwnerHash must be 20 bytes (HASH160)')
  if (!layout || layout.tokenValue == null || layout.tokenValue.length !== 8) {
    throw new Error('layout.tokenValue must be the 8-byte LE value of the token output')
  }
  P.grind(spend, inputIndex, lockingScript, satoshis, opts.grind)
  var preimage = H.rawPreimage(spend, inputIndex, lockingScript, satoshis)
  var args = auth.unlockArgs(spend, inputIndex, lockingScript, satoshis, signer)
  var us = new Script()
  pushData(us, layout.before || Buffer.alloc(0))
  pushData(us, layout.after || Buffer.alloc(0))
  us.add(Buffer.from(layout.tokenValue))
  us.add(Buffer.from(newOwnerHash))
  args.forEach(function (a) { us.add(a) })
  us.add(Buffer.from(preimage))
  return us
}

module.exports = {
  ownershipToken: ownershipToken,
  ownershipTokenMulti: ownershipTokenMulti,
  ownerId: ownerId,
  unlockTransfer: unlockTransfer,
  unlockTransferMulti: unlockTransferMulti
}
