'use strict'
/**
 * SmartContract.Authorizers — pluggable ownership-authorization schemes for the
 * stateful Token covenant.
 *
 * A token carries a single 20-byte owner commitment in its scriptCode. By
 * factoring out ONLY the block that proves "the spender is the committed owner of
 * THIS spend", the same covenant can be owned by a single key, an m-of-n group, or
 * any future custom predicate — with the state-rebuild plumbing (read commit =
 * chunk[4:24], rewrite with the next owner's 20-byte commit) identical for every
 * scheme.
 *
 * An Authorizer is `{ name, commit, emit, unlockArgs }`:
 *   - commit(descriptor) -> Buffer(20)
 *       the 20-byte owner id for an owner descriptor (a key, a key set, ...).
 *   - emit(script)
 *       the in-script proof. At entry the stack is  [ ...authArgs, ownerCommit ]
 *       (ownerCommit on top). The block MUST consume authArgs + ownerCommit and
 *       VERIFY authorization over this spend (use *VERIFY opcodes — it must not
 *       leave a fall-through boolean), leaving whatever sits below authArgs
 *       (the next-owner hash) untouched. It must also leave the altstack as it
 *       found it.
 *   - unlockArgs(spend, inputIndex, lock, sats, signer) -> Array<Buffer|opcode>
 *       the authArgs pushed (deepest-first) in the unlock script, which the Token
 *       slots as  <newOwnerHash> <...authArgs> <preimage>.
 *
 * All schemes commit to a fixed 20-byte hash, so a transfer's chosen next owner is
 * always just a 20-byte value the covenant splices into the recreated scriptCode.
 */

var bsv = require('../..')
var Hash = require('../crypto/hash')
var H = require('./covenant_helpers')

var Opcode = bsv.Opcode
var n = H.scriptNum

function pubBuffer (key) {
  if (key instanceof bsv.PrivateKey) return key.toPublicKey().toBuffer()
  if (key instanceof bsv.PublicKey) return key.toBuffer()
  return key // already a Buffer
}

/* -------------------------------------------------------------------------- */
/* single-key: owner is one key; authorize with its signature over the spend.  */
/* -------------------------------------------------------------------------- */
function singleKey () {
  return {
    name: 'single-key',
    commit: function (key) { return Hash.sha256ripemd160(pubBuffer(key)) },
    emit: function (s) {
      // stack: [.., sig, pubkey, ownerCommit]
      s.add(Opcode.OP_OVER).add(Opcode.OP_HASH160).add(Opcode.OP_EQUALVERIFY) // HASH160(pubkey) == ownerCommit
      s.add(Opcode.OP_CHECKSIGVERIFY) // ECDSA signature over THIS spend
      return s
    },
    unlockArgs: function (spend, inputIndex, lock, sats, ownerKey) {
      var sig = H.signInput(spend, ownerKey, inputIndex, lock, sats)
      return [sig, ownerKey.toPublicKey().toBuffer()] // deepest-first: sig, then pubkey
    }
  }
}

/* -------------------------------------------------------------------------- */
/* multisig: owner is an m-of-n key set, committed by hashing the canonical     */
/* multisig redeem script. The set is revealed at spend, bound to the           */
/* commitment, and checked with OP_CHECKMULTISIG.                               */
/* -------------------------------------------------------------------------- */

/** Canonical m-of-n redeem-script bytes: OP_m <33||pk>..<33||pk> OP_n OP_CHECKMULTISIG. */
function redeemScript (m, pubkeys) {
  var nn = pubkeys.length
  if (m < 1 || m > nn || nn < 1 || nn > 16) throw new Error('multisig requires 1 <= m <= n <= 16')
  var s = new bsv.Script().add(Opcode['OP_' + m])
  pubkeys.forEach(function (p) { s.add(Buffer.from(p)) }) // each emitted as 0x21||pk (33-byte push)
  s.add(Opcode['OP_' + nn]).add(Opcode.OP_CHECKMULTISIG)
  return s.toBuffer()
}

function multisig (m, nKeys) {
  if (m < 1 || m > nKeys || nKeys < 1 || nKeys > 16) throw new Error('multisig requires 1 <= m <= n <= 16')
  return {
    name: m + '-of-' + nKeys + '-multisig',
    m: m,
    n: nKeys,
    /** descriptor: an ordered array of n public keys (PublicKey|PrivateKey|Buffer). */
    commit: function (keys) {
      if (keys.length !== nKeys) throw new Error('expected ' + nKeys + ' public keys')
      return Hash.sha256ripemd160(redeemScript(m, keys.map(pubBuffer)))
    },
    emit: function (s) {
      // stack: [.., dummy, sig_1..sig_m, redeem, ownerCommit]   (redeem = canonical bytes)
      s.add(Opcode.OP_OVER).add(Opcode.OP_HASH160).add(Opcode.OP_EQUALVERIFY) // HASH160(redeem) == ownerCommit
      // strip the leading OP_m byte and the trailing OP_n OP_CHECKMULTISIG (2 bytes),
      // leaving body = (0x21||pubkey) repeated n times.
      s.add(n(1)).add(Opcode.OP_SPLIT).add(Opcode.OP_NIP)
      s.add(Opcode.OP_SIZE).add(n(2)).add(Opcode.OP_SUB).add(Opcode.OP_SPLIT).add(Opcode.OP_DROP)
      // peel each 34-byte (0x21||pubkey) unit, drop the push opcode, park the pubkey.
      // Parking pushes pk1..pkn onto the altstack (pkn on top), so popping them back
      // yields pkn..pk1 — the pubkey just under OP_n is pk1. CHECKMULTISIG therefore
      // encounters keys pk1, pk2, ... pkn; the unlock provides sigs in the matching
      // (descending key-index) order, see unlockArgs.
      for (var i = 0; i < this.n; i++) {
        s.add(n(34)).add(Opcode.OP_SPLIT) // [.., unit34, rest]
        s.add(Opcode.OP_SWAP).add(n(1)).add(Opcode.OP_SPLIT).add(Opcode.OP_NIP) // [.., rest, pubkey]
        s.add(Opcode.OP_TOALTSTACK)
      }
      s.add(Opcode.OP_DROP) // the now-empty remainder
      // rebuild the CHECKMULTISIG stack: [.., dummy, sigs.., m, pkn..pk1, n]
      s.add(n(this.m))
      for (i = 0; i < this.n; i++) s.add(Opcode.OP_FROMALTSTACK)
      s.add(n(this.n))
      s.add(Opcode.OP_CHECKMULTISIGVERIFY)
      return s
    },
    unlockArgs: function (spend, inputIndex, lock, sats, signer) {
      // signer: { keys: [n ordered pubkeys], signWith: [>= m private keys] }
      var keys = signer.keys
      if (keys.length !== nKeys) throw new Error('expected ' + nKeys + ' public keys in signer.keys')
      var redeem = redeemScript(m, keys.map(pubBuffer))
      // emit() encounters keys pk1..pkn, so the m signatures must be pushed in
      // descending key-index order (topmost sig = smallest-index signer).
      var keyHex = keys.map(pubBuffer).map(function (b) { return b.toString('hex') })
      var indexed = signer.signWith.map(function (priv) {
        var idx = keyHex.indexOf(priv.toPublicKey().toBuffer().toString('hex'))
        if (idx < 0) throw new Error('signWith key is not in the committed key set')
        return { idx: idx, priv: priv }
      }).sort(function (a, b) { return b.idx - a.idx }).slice(0, m)
      if (indexed.length < m) throw new Error('need at least ' + m + ' signing keys')
      var sigs = indexed.map(function (e) { return H.signInput(spend, e.priv, inputIndex, lock, sats) })
      // deepest-first: dummy, then the m sigs (descending key index), then redeem.
      return [Opcode.OP_0].concat(sigs).concat([redeem])
    }
  }
}

/* -------------------------------------------------------------------------- */
/* predicate: escape hatch for arbitrary ownership schemes. Supply your own     */
/* { commit, emit, unlockArgs } honoring the Authorizer contract above.         */
/* -------------------------------------------------------------------------- */
function predicate (spec) {
  if (!spec || typeof spec.emit !== 'function' || typeof spec.unlockArgs !== 'function' ||
      typeof spec.commit !== 'function') {
    throw new Error('predicate authorizer needs { commit, emit, unlockArgs } functions')
  }
  return {
    name: spec.name || 'predicate',
    commit: spec.commit,
    emit: spec.emit,
    unlockArgs: spec.unlockArgs
  }
}

module.exports = {
  singleKey: singleKey,
  multisig: multisig,
  predicate: predicate,
  redeemScript: redeemScript
}
