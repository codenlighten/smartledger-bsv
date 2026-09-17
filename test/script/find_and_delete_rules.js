'use strict'

/* global describe, it */

// Which signatures are removed from the scriptCode before it is signed, as the
// node does it (bitcoin-sv src/script/interpreter.cpp, CleanupScriptCode, and
// CScript::FindAndDelete in src/script/script.h):
//
//   // Drop the signature in scripts when SIGHASH_FORKID is not used.
//   if (!(flags & SCRIPT_ENABLE_SIGHASH_FORKID) || !sigHashType.hasForkId())
//       scriptCode.FindAndDelete(CScript(vchSig));
//
// and FindAndDelete removes every occurrence, consecutive ones included.
//
// The library removed the signature for every signature, FORKID or not. So a
// locking script that pushes a copy of the signature could be satisfied by a
// signature over the script WITHOUT that push: the library removed the push,
// found the digest it expected and accepted, while the node signs over the
// script as it is and rejects. The library called valid a spend the network
// calls invalid.

require('chai').should()
var expect = require('chai').expect
var bsv = require('../../')
var Script = bsv.Script
var Interpreter = Script.Interpreter
var Signature = bsv.crypto.Signature
var Opcode = bsv.Opcode
var BN = bsv.crypto.BN

var privateKey = bsv.PrivateKey.fromWIF('cSBnVM4xvxarwGQuAfQFwqDg9k5tErHUHzgWsEfD4zdwUasvqRVY')
var pubkey = privateKey.toPublicKey().toBuffer()
var SATS = 10000

function spending (lock) {
  var tx = new bsv.Transaction()
  tx.addInput(new bsv.Transaction.Input({
    prevTxId: Buffer.alloc(32, 9), outputIndex: 0, script: new Script(), sequenceNumber: 0xffffffff
  }), lock, SATS)
  tx.to(privateKey.toAddress(), SATS - 1000)
  return tx
}

// A signature made over `signedScript`, in the transaction spending `lock`.
function signatureOver (tx, signedScript, type, flags) {
  var sig = bsv.Transaction.Sighash.sign(tx, privateKey, type, 0, signedScript, new BN(SATS), flags)
  return Buffer.concat([sig.toDER(), Buffer.from([type & 0xff])])
}

function run (unlock, lock, tx, flags) {
  var interp = new Interpreter()
  var ok = interp.verify(unlock, lock, tx, 0, flags, new BN(SATS))
  return { ok: ok, err: interp.errstr }
}

describe('findAndDelete follows the node', function () {
  var FORKID = Signature.SIGHASH_ALL | Signature.SIGHASH_FORKID
  var forkidFlags = Interpreter.currentConsensusFlags()

  // <sig> OP_DROP <pubkey> OP_CHECKSIG, and the same script without <sig>.
  function scripts (sig) {
    var withoutPush = new Script().add(Opcode.OP_DROP).add(pubkey).add(Opcode.OP_CHECKSIG)
    var withPush = new Script().add(sig).add(Opcode.OP_DROP).add(pubkey).add(Opcode.OP_CHECKSIG)
    return { withoutPush: withoutPush, withPush: withPush }
  }

  it('with FORKID, a signature over the script minus a pushed copy of it is refused', function () {
    // The signature does not depend on the lock, only on the script it signs,
    // so it can be made first and then pushed into the lock.
    var probe = scripts(Buffer.alloc(72))
    var tx = spending(probe.withPush)
    var sig = signatureOver(tx, probe.withoutPush, FORKID)
    var lock = scripts(sig).withPush
    tx = spending(lock)
    // The funding script is part of the digest only through scriptCode, so the
    // signature made against the probe is still over `withoutPush` here.
    sig.equals(signatureOver(tx, scripts(sig).withoutPush, FORKID)).should.equal(true)
    var r = run(new Script().add(sig), lock, tx, forkidFlags)
    expect(r.ok, 'the node would reject this spend').to.equal(false)
  })

  it('with FORKID, a signature over the script as it is still verifies', function () {
    // Fixed point: sign over a lock that pushes an unrelated 72-byte value, so
    // nothing needs to be removed.
    var filler = Buffer.alloc(72, 0x5a)
    var lock = new Script().add(filler).add(Opcode.OP_DROP).add(pubkey).add(Opcode.OP_CHECKSIG)
    var tx = spending(lock)
    var sig = signatureOver(tx, lock, FORKID)
    var r = run(new Script().add(sig), lock, tx, forkidFlags)
    expect(r.ok, r.err).to.equal(true)
  })

  it('without FORKID, the pushed copy is still removed before checking', function () {
    var flags = Interpreter.SCRIPT_VERIFY_P2SH | Interpreter.SCRIPT_VERIFY_STRICTENC
    var type = Signature.SIGHASH_ALL
    var probe = scripts(Buffer.alloc(71))
    var tx = spending(probe.withPush)
    var sig = signatureOver(tx, probe.withoutPush, type, flags)
    var lock = scripts(sig).withPush
    tx = spending(lock)
    var r = run(new Script().add(sig), lock, tx, flags)
    expect(r.ok, r.err).to.equal(true)
  })

  it('removes consecutive occurrences, as CScript::FindAndDelete does', function () {
    var sig = Buffer.alloc(72, 7)
    var s = new Script().add(sig).add(sig).add(Opcode.OP_1).add(sig).add(sig).add(sig)
    s.findAndDelete(new Script().add(sig))
    s.toBuffer().toString('hex').should.equal(new Script().add(Opcode.OP_1).toBuffer().toString('hex'))
  })
})
