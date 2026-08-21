'use strict'
/**
 * SmartContract.Locks — basic interpreter-verified lock primitives.
 * Each factory returns { lock: Script, unlock: fn, meta }.
 */

var Hash = require('../crypto/hash')
var H = require('../covenant/helpers')

var Script = require('../script')
var Opcode = require('../opcode')
var signInput = H.signInput
var n = H.scriptNum

/** Hash-lock: reveal a preimage whose SHA-256 matches a digest. */
function hashLock (secret) {
  var digest = Hash.sha256(secret)
  var lock = new Script().add(Opcode.OP_SHA256).add(digest).add(Opcode.OP_EQUAL)
  return {
    lock: lock,
    meta: { name: 'hash-lock', digest: digest.toString('hex') },
    unlock: function (_spend, _sats, preimage) { return new Script().add(preimage || secret) }
  }
}

/** P2PKH baseline. */
function p2pkh (privateKey) {
  var pub = privateKey.toPublicKey()
  var lock = Script.buildPublicKeyHashOut(pub.toAddress())
  return {
    lock: lock,
    meta: { name: 'p2pkh', address: pub.toAddress().toString() },
    unlock: function (spend, sats) {
      return new Script().add(signInput(spend, privateKey, 0, lock, sats)).add(pub.toBuffer())
    }
  }
}

/**
 * CLTV absolute time-lock: <locktime> CLTV DROP <pk> CHECKSIG.
 *
 * ⚠️ THIS DOES NOT HOLD FUNDS ON CURRENT BSV MAINNET. Genesis (block 620,538,
 * 2020-02-04) reverted OP_CHECKLOCKTIMEVERIFY to an upgradable NOP for outputs created
 * after it, so in a post-Genesis output this opcode enforces nothing and the coins are
 * spendable immediately by the key holder. See the isAfterGenesis() short-circuit in
 * lib/script/interpreter.js, and the tests in test/smart_contract/covenants.js which
 * pin both behaviours.
 *
 * Until 8.4.0 the covenant harness verified under flags that omitted the era bits, so
 * this appeared to enforce the lock and the tests agreed. It never enforced it on the
 * network; only the local harness was running 2019 rules.
 *
 * Kept because it is still correct for pre-Genesis outputs and useful for interop and
 * teaching. Do not use it to time-lock value on mainnet.
 */
function timeLockCLTV (privateKey, locktime) {
  var pub = privateKey.toPublicKey()
  var lock = new Script()
    .add(n(locktime)).add(Opcode.OP_CHECKLOCKTIMEVERIFY).add(Opcode.OP_DROP)
    .add(pub.toBuffer()).add(Opcode.OP_CHECKSIG)
  return {
    lock: lock,
    meta: { name: 'cltv-timelock', locktime: locktime },
    // Caller must set spend.nLockTime >= locktime and input sequence < 0xffffffff.
    unlock: function (spend, sats) { return new Script().add(signInput(spend, privateKey, 0, lock, sats)) }
  }
}

/** m-of-n multisig. */
function multisig (m, privateKeys) {
  var pubs = privateKeys.map(function (k) { return k.toPublicKey() })
  var lock = new Script().add(Opcode['OP_' + m])
  pubs.forEach(function (p) { lock.add(p.toBuffer()) })
  lock.add(Opcode['OP_' + pubs.length]).add(Opcode.OP_CHECKMULTISIG)
  return {
    lock: lock,
    meta: { name: m + '-of-' + pubs.length + '-multisig' },
    unlock: function (spend, sats, signWith) {
      signWith = signWith || privateKeys.slice(0, m)
      var s = new Script().add(Opcode.OP_0)
      signWith.forEach(function (k) { s.add(signInput(spend, k, 0, lock, sats)) })
      return s
    }
  }
}

/**
 * HTLC: hash-OR-timeout.
 *
 * ⚠️ THE TIMEOUT BRANCH DOES NOT BIND ON CURRENT BSV MAINNET. It is gated by
 * OP_CHECKLOCKTIMEVERIFY, which Genesis reverted to a NOP — see timeLockCLTV above for
 * the full note. The sender can take the refund path immediately rather than after the
 * timeout, which removes the property an HTLC exists to provide.
 *
 * The hash branch is unaffected and works as intended.
 */
function htlc (opts) {
  var digest = Hash.sha256(opts.secret)
  var lock = new Script()
    .add(Opcode.OP_IF)
    .add(Opcode.OP_SHA256).add(digest).add(Opcode.OP_EQUALVERIFY)
    .add(opts.receiver.toPublicKey().toBuffer()).add(Opcode.OP_CHECKSIG)
    .add(Opcode.OP_ELSE)
    .add(n(opts.timeout)).add(Opcode.OP_CHECKLOCKTIMEVERIFY).add(Opcode.OP_DROP)
    .add(opts.sender.toPublicKey().toBuffer()).add(Opcode.OP_CHECKSIG)
    .add(Opcode.OP_ENDIF)
  return {
    lock: lock,
    meta: { name: 'htlc', digest: digest.toString('hex'), timeout: opts.timeout },
    unlockClaim: function (spend, sats) {
      return new Script().add(signInput(spend, opts.receiver, 0, lock, sats)).add(opts.secret).add(Opcode.OP_1)
    },
    unlockRefund: function (spend, sats) {
      return new Script().add(signInput(spend, opts.sender, 0, lock, sats)).add(Opcode.OP_0)
    }
  }
}

module.exports = {
  hashLock: hashLock,
  p2pkh: p2pkh,
  timeLockCLTV: timeLockCLTV,
  multisig: multisig,
  htlc: htlc
}
