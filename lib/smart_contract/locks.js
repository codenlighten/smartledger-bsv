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

module.exports = {
  hashLock: hashLock,
  p2pkh: p2pkh,
  multisig: multisig
}
