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
 *
 * ## `pinSighash`: the authorization signature's own flag byte
 *
 * The Token covenant's security argument is that authorization is a signature over THIS
 * spend, so SIGHASH_ALL's `hashOutputs` commits to the recreated output and a watcher who
 * alters the destination invalidates the proof. That argument holds only while the
 * authorization signature IS SIGHASH_ALL. The 0x41 assertion in the covenant head applies to
 * the OP_PUSH_TX PREIMAGE, not to the separate signature these blocks verify, and
 * `OP_CHECKSIG` takes its sighash mode from the flag byte the SIGNER chose.
 *
 * Measured on 9.39.1: an authorization signed `SIGHASH_NONE|FORKID` verifies, and because it
 * commits to no outputs, a mempool observer can reuse it in a transaction redirecting the
 * token to itself. The observer is pinned to the victim's nLockTime (every mode commits to
 * it) but is free to grind its OWN destination keys until the OP_PUSH_TX s-value condition
 * holds again: a redirect succeeded in **4 candidate keys**.
 *
 * `{ pinSighash: true }` makes the block require the flag byte to be 0x41 before the
 * signature check, so the covenant enforces what its argument rests on. It is OFF by default
 * because turning it on changes the script bytes, and a token's successor output must carry
 * the code the covenant rebuilds from the authenticated `scriptCode` -- so flipping the
 * default would make an in-flight lineage unspendable. It becomes the default in 10.0.0.
 *
 * This library's own unlock path was never exposed: `unlockArgs` below signs with
 * `H.signInput(...)` and no override, i.e. SIGHASH_ALL|FORKID. The exposure is a hand-built
 * unlocking script, which is a documented, public way to use these schemes.
 */

var PrivateKey = require('../privatekey')
var PublicKey = require('../publickey')
var Script = require('../script')
var Hash = require('../crypto/hash')
var H = require('../covenant/helpers')

var Opcode = require('../opcode')
var deprecate = require('../util/deprecate')
var ownOption = require('../util/own-option')
var n = H.scriptNum

/** SIGHASH_ALL | SIGHASH_FORKID -- the only mode the Token covenant's argument supports. */
var SIGHASH_ALL_FORKID = 0x41

/**
 * Require the signature at stack depth `depth` to carry flag byte 0x41. Leaves the stack as
 * it found it. A DER signature is `DER || flagByte`, so the check is on its last byte.
 */
function emitFlagCheck (s, depth) {
  if (depth) s.add(n(depth)).add(Opcode.OP_PICK)
  else s.add(Opcode.OP_DUP)
  s.add(Opcode.OP_SIZE).add(n(1)).add(Opcode.OP_SUB).add(Opcode.OP_SPLIT).add(Opcode.OP_NIP)
  s.add(n(SIGHASH_ALL_FORKID)).add(Opcode.OP_EQUALVERIFY)
  return s
}

/**
 * One-time notice for an authorizer built without the pin. Fires at LOCK-BUILD time, which
 * is the only moment a caller can still choose, and names the option rather than the version.
 */
function warnUnpinned (name) {
  deprecate({
    what: 'a Token authorizer that does not pin the authorization signature to SIGHASH_ALL ' +
      '(' + name + ' without { pinSighash: true })',
    since: '9.40.0',
    removeIn: '10.0.0',
    plan: 'authorizer-unpinned-sighash',
    why: 'the covenant\'s security argument is that the authorization signature commits to ' +
      'the recreated output, which holds only for SIGHASH_ALL; an authorization signed ' +
      'SIGHASH_NONE commits to no output, and a mempool observer can reuse it to redirect ' +
      'the token by grinding its own destination keys, which succeeded in as few as 4 ' +
      'candidate keys. The library\'s own unlockArgs always signs SIGHASH_ALL, so this bites ' +
      'a hand-built unlocking script. Note the pin changes the locking script, so an ' +
      'in-flight token lineage must finish under the code it was created with',
    use: '{ pinSighash: true } on the authorizer'
  })
}

function pubBuffer (key) {
  if (key instanceof PrivateKey) return key.toPublicKey().toBuffer()
  if (key instanceof PublicKey) return key.toBuffer()
  return key // already a Buffer
}

/* -------------------------------------------------------------------------- */
/* single-key: owner is one key; authorize with its signature over the spend.  */
/* -------------------------------------------------------------------------- */
function singleKey (opts) {
  var pin = !!(opts && ownOption(opts, 'pinSighash'))
  if (!pin) warnUnpinned('singleKey')
  return {
    name: 'single-key' + (pin ? '-pinned' : ''),
    pinSighash: pin,
    commit: function (key) { return Hash.sha256ripemd160(pubBuffer(key)) },
    emit: function (s) {
      // stack: [.., sig, pubkey, ownerCommit]
      s.add(Opcode.OP_OVER).add(Opcode.OP_HASH160).add(Opcode.OP_EQUALVERIFY) // HASH160(pubkey) == ownerCommit
      // [.., sig, pubkey]: the signature is one below the top.
      if (pin) emitFlagCheck(s, 1)
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
  var s = new Script().add(Opcode['OP_' + m])
  pubkeys.forEach(function (p) { s.add(Buffer.from(p)) }) // each emitted as 0x21||pk (33-byte push)
  s.add(Opcode['OP_' + nn]).add(Opcode.OP_CHECKMULTISIG)
  return s.toBuffer()
}

function multisig (m, nKeys, opts) {
  // `nKeys` is a COUNT, not the keys. Passing an array made `m > nKeys` compare a number
  // to an array, which coerces to NaN, so the guard passed and an authorizer was built
  // with the array spliced into its name — broken, but silently.
  if (typeof nKeys !== 'number' || !Number.isInteger(nKeys)) {
    throw new Error('multisig(m, nKeys): nKeys is the NUMBER of keys, not the keys themselves' +
      (Array.isArray(nKeys) ? ' — pass ' + nKeys.length + ' instead of the array' : ''))
  }
  if (typeof m !== 'number' || !Number.isInteger(m)) throw new Error('multisig(m, nKeys): m must be an integer')
  if (m < 1 || m > nKeys || nKeys < 1 || nKeys > 16) throw new Error('multisig requires 1 <= m <= n <= 16')
  var pin = !!(opts && ownOption(opts, 'pinSighash'))
  if (!pin) warnUnpinned('multisig')
  return {
    name: m + '-of-' + nKeys + '-multisig' + (pin ? '-pinned' : ''),
    m: m,
    n: nKeys,
    pinSighash: pin,
    /** descriptor: an ordered array of n public keys (PublicKey|PrivateKey|Buffer). */
    commit: function (keys) {
      if (keys.length !== nKeys) throw new Error('expected ' + nKeys + ' public keys')
      return Hash.sha256ripemd160(redeemScript(m, keys.map(pubBuffer)))
    },
    emit: function (s) {
      // stack: [.., dummy, sig_1..sig_m, redeem, ownerCommit]   (redeem = canonical bytes)
      s.add(Opcode.OP_OVER).add(Opcode.OP_HASH160).add(Opcode.OP_EQUALVERIFY) // HASH160(redeem) == ownerCommit
      // [.., dummy, sig_1..sig_m, redeem]: the topmost signature is one below the redeem,
      // so sig_m is at depth 1 and sig_1 at depth m. Every one of the m must carry 0x41 --
      // checking only the top would leave the others free to commit to no outputs.
      if (pin) for (var d = 1; d <= this.m; d++) emitFlagCheck(s, d)
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
