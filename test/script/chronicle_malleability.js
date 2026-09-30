'use strict'

/* global describe, it */

// Chronicle lets a transaction opt into malleability by using a version above 1. The node
// then stops applying the rules that exist only to keep a signed transaction from being
// rewritten in flight — EnforceNonMalleability(flags, checker.Version()) in
// src/script/interpreter.cpp, at seven sites — and SCRIPT_CHRONICLE is set on every block
// mined since activation at 943,816, so this is today's mainnet, not a future era.
//
// It is also the file that pins the else-if bug. checkSignatureEncoding chained its three
// checks, so SCRIPT_VERIFY_LOW_S — which mainnetFlags() sets — returned early and the
// STRICTENC block never ran. Three signatures the node refuses by name were accepted on
// the library's own default flags. The node has three independent ifs.
//
// The node's script_tests.json cannot see any of this: every one of its 1483 rows carries
// transaction version 1, and not one pairs LOW_S with a hash-type expectation.

var should = require('chai').should()
var bsv = require('../..')
var Interpreter = bsv.Script.Interpreter
var Script = bsv.Script
var Signature = bsv.crypto.Signature
var BN = bsv.crypto.BN
should.exist(should)

var LOW_S = Interpreter.SCRIPT_VERIFY_LOW_S
var STRICTENC = Interpreter.SCRIPT_VERIFY_STRICTENC
var FORKID = Interpreter.SCRIPT_ENABLE_SIGHASH_FORKID
var CHRONICLE = Interpreter.SCRIPT_CHRONICLE
var P2SH = Interpreter.SCRIPT_VERIFY_P2SH
var GENESIS = Interpreter.SCRIPT_GENESIS
var UTXO_AFTER_GENESIS = Interpreter.SCRIPT_UTXO_AFTER_GENESIS
var UTXO_AFTER_CHRONICLE = Interpreter.SCRIPT_UTXO_AFTER_CHRONICLE
var SIGPUSHONLY = Interpreter.SCRIPT_VERIFY_SIGPUSHONLY
var CLEANSTACK = Interpreter.SCRIPT_VERIFY_CLEANSTACK

function verifyWith (sigAsm, pubkeyAsm, flags, version) {
  var tx = new bsv.Transaction()
  tx.version = version === undefined ? 1 : version
  var interp = new Interpreter()
  var ok = interp.verify(Script.fromASM(sigAsm), Script.fromASM(pubkeyAsm), tx, 0, flags,
    new BN(0))
  return ok ? 'OK' : interp.errstr
}

// A low-S DER signature, to which we append whichever hash-type byte the case needs.
var DER = (function () {
  var key = bsv.PrivateKey.fromBuffer(Buffer.alloc(32, 0x11))
  return bsv.crypto.ECDSA.sign(bsv.crypto.Hash.sha256(Buffer.from('anything')), key).toDER()
})()

function checkSig (flags, hashType, version) {
  var interp = new Interpreter()
  var tx = new bsv.Transaction()
  tx.version = version === undefined ? 1 : version
  interp.set({ flags: flags, tx: tx, nin: 0 })
  var ok = interp.checkSignatureEncoding(Buffer.concat([DER, Buffer.from([hashType])]))
  return ok ? 'OK' : interp.errstr
}

describe('Chronicle malleability relaxations', function () {
  describe('checkSignatureEncoding runs all three checks, not the first that matches', function () {
    it('refuses an undefined hash type even when LOW_S is set', function () {
      checkSig(STRICTENC, 0x00).should.equal('SCRIPT_ERR_SIG_HASHTYPE')
      checkSig(STRICTENC | LOW_S, 0x00).should.equal('SCRIPT_ERR_SIG_HASHTYPE')
    })

    it('refuses a signature without FORKID where FORKID is required, with LOW_S set', function () {
      checkSig(STRICTENC | FORKID, 0x01).should.equal('SCRIPT_ERR_MUST_USE_FORKID')
      checkSig(STRICTENC | FORKID | LOW_S, 0x01).should.equal('SCRIPT_ERR_MUST_USE_FORKID')
    })

    it('refuses the Chronicle digest outside Chronicle, with LOW_S set', function () {
      var ht = Signature.SIGHASH_ALL | Signature.SIGHASH_FORKID | Signature.SIGHASH_CHRONICLE
      checkSig(STRICTENC | FORKID, ht).should.equal('SCRIPT_ERR_ILLEGAL_CHRONICLE')
      checkSig(STRICTENC | FORKID | LOW_S, ht).should.equal('SCRIPT_ERR_ILLEGAL_CHRONICLE')
    })

    it('refuses all three on the default mainnet flags', function () {
      var F = Interpreter.mainnetFlags()
      checkSig(F, 0x00).should.equal('SCRIPT_ERR_SIG_HASHTYPE')
      checkSig(F, 0x01).should.equal('SCRIPT_ERR_MUST_USE_FORKID')
      // mainnetFlags() enables Chronicle, so the Chronicle bit is legal there; the
      // pre-Chronicle case is covered above.
      checkSig(F, Signature.SIGHASH_ALL | Signature.SIGHASH_FORKID).should.equal('OK')
    })

    it('and still reports a bad DER encoding first, as the node does', function () {
      var interp = new Interpreter()
      interp.set({ flags: STRICTENC | LOW_S, tx: new bsv.Transaction(), nin: 0 })
      interp.checkSignatureEncoding(Buffer.from('310602010102010101', 'hex'))
        .should.equal(false)
      interp.errstr.should.equal('SCRIPT_ERR_SIG_DER_INVALID_FORMAT')
    })
  })

  // The unit checks above pin checkSignatureEncoding. These spend a real P2PKH output with a
  // signature that genuinely verifies, so execution reaches the accept/reject decision — which
  // is what makes the bug a false accept rather than a wrong reason. All three were ACCEPTED by
  // 9.14.0 under its own mainnetFlags().
  describe('end to end: a spend the network rejects must not verify', function () {
    var key = bsv.PrivateKey.fromBuffer(Buffer.alloc(32, 0x22))
    var addr = key.toAddress()
    var SATS = 100000
    var lock = Script.buildPublicKeyHashOut(addr)

    function spend (hashType, signFlags, verifyFlags) {
      var utxo = new bsv.Transaction.UnspentOutput({
        txId: 'a'.repeat(64), outputIndex: 0, script: lock, satoshis: SATS
      })
      var tx = new bsv.Transaction().from(utxo).to(addr, SATS - 500)
      var sig = bsv.Transaction.Sighash.sign(tx, key, hashType, 0, lock, new BN(SATS), signFlags)
      var unlock = new Script().add(sig.toTxFormat()).add(key.toPublicKey().toBuffer())
      tx.inputs[0].setScript(unlock)
      var interp = new Interpreter()
      var ok = interp.verify(unlock, lock, tx, 0, verifyFlags, new BN(SATS))
      return ok ? 'OK' : interp.errstr
    }

    var MAINNET = Interpreter.mainnetFlags()

    it('refuses a signature with no FORKID bit where FORKID is required', function () {
      // Signed over the legacy digest, so the signature itself is valid.
      spend(Signature.SIGHASH_ALL, 0, MAINNET).should.equal('SCRIPT_ERR_MUST_USE_FORKID')
    })

    it('refuses an undefined hash type', function () {
      spend(0x60 | Signature.SIGHASH_FORKID, FORKID, MAINNET)
        .should.equal('SCRIPT_ERR_SIG_HASHTYPE')
    })

    it('refuses the Chronicle digest where Chronicle does not apply', function () {
      var noChronicle = MAINNET & ~(CHRONICLE | Interpreter.SCRIPT_ENABLE_CHRONICLE |
        UTXO_AFTER_CHRONICLE)
      var ht = Signature.SIGHASH_ALL | Signature.SIGHASH_FORKID | Signature.SIGHASH_CHRONICLE
      spend(ht, FORKID | CHRONICLE, noChronicle).should.equal('SCRIPT_ERR_ILLEGAL_CHRONICLE')
    })

    it('and still accepts a correctly signed spend', function () {
      spend(Signature.SIGHASH_ALL | Signature.SIGHASH_FORKID, FORKID, MAINNET)
        .should.equal('OK')
    })
  })

  describe('a version above 1 under Chronicle is exempt', function () {
    var CH = P2SH | GENESIS | UTXO_AFTER_GENESIS | CHRONICLE | UTXO_AFTER_CHRONICLE

    it('from MINIMALIF', function () {
      var flags = CH | Interpreter.SCRIPT_VERIFY_MINIMALIF
      verifyWith('', 'OP_2 OP_IF OP_1 OP_ENDIF', flags, 1).should.equal('SCRIPT_ERR_MINIMALIF')
      verifyWith('', 'OP_2 OP_IF OP_1 OP_ENDIF', flags, 2).should.equal('OK')
    })

    it('from MINIMALDATA', function () {
      var flags = CH | Interpreter.SCRIPT_VERIFY_MINIMALDATA
      // OP_PUSHDATA1 pushing one byte, where a direct push would do.
      var nonMinimal = Script.fromBuffer(Buffer.from('4c0101', 'hex'))
      function run (version) {
        var tx = new bsv.Transaction(); tx.version = version
        var interp = new Interpreter()
        var ok = interp.verify(nonMinimal, Script.fromASM('OP_1'), tx, 0, flags, new BN(0))
        return ok ? 'OK' : interp.errstr
      }
      run(1).should.equal('SCRIPT_ERR_MINIMALDATA')
      run(2).should.equal('OK')
    })

    it('from LOW_S', function () {
      // A high-S signature: negate s and re-encode.
      var sig = Signature.fromDER(DER)
      var N = bsv.crypto.Point.getN()
      var high = new Signature(sig.r, N.sub(sig.s))
      var buf = Buffer.concat([high.toDER(),
        Buffer.from([Signature.SIGHASH_ALL | Signature.SIGHASH_FORKID])])
      function run (version) {
        var interp = new Interpreter()
        var tx = new bsv.Transaction(); tx.version = version
        interp.set({ flags: CH | LOW_S | FORKID, tx: tx, nin: 0 })
        var ok = interp.checkSignatureEncoding(buf)
        return ok ? 'OK' : interp.errstr
      }
      run(1).should.equal('SCRIPT_ERR_SIG_DER_HIGH_S')
      run(2).should.equal('OK')
    })

    it('from CLEANSTACK', function () {
      var flags = CH | Interpreter.SCRIPT_VERIFY_CLEANSTACK
      verifyWith('OP_1 OP_1', 'OP_NOP', flags, 1).should.equal('SCRIPT_ERR_CLEANSTACK')
      verifyWith('OP_1 OP_1', 'OP_NOP', flags, 2).should.equal('OK')
    })

    it('from SIGPUSHONLY', function () {
      var flags = CH | Interpreter.SCRIPT_VERIFY_SIGPUSHONLY
      verifyWith('OP_1 OP_NOP', 'OP_NOP', flags, 1).should.equal('SCRIPT_ERR_SIG_PUSHONLY')
      verifyWith('OP_1 OP_NOP', 'OP_NOP', flags, 2).should.equal('OK')
    })

    it('but not without Chronicle, where the version means nothing', function () {
      var flags = P2SH | GENESIS | UTXO_AFTER_GENESIS | Interpreter.SCRIPT_VERIFY_MINIMALIF
      verifyWith('', 'OP_2 OP_IF OP_1 OP_ENDIF', flags, 1).should.equal('SCRIPT_ERR_MINIMALIF')
      verifyWith('', 'OP_2 OP_IF OP_1 OP_ENDIF', flags, 2).should.equal('SCRIPT_ERR_MINIMALIF')
    })

    it('and version 1 and below stay non-malleable', function () {
      var flags = CH | Interpreter.SCRIPT_VERIFY_MINIMALIF
      ;[0, 1].forEach(function (v) {
        verifyWith('', 'OP_2 OP_IF OP_1 OP_ENDIF', flags, v)
          .should.equal('SCRIPT_ERR_MINIMALIF', 'version ' + v)
      })
    })
  })

  // Raised in review by the session that recomputed these results independently, and by
  // gpt-assist: the version is an int32 everywhere the node touches it, and two of these
  // checks can fire on the same script, so the order has to be the node's.
  describe('the version is read as an int32, and faults are reported in the node\'s order', function () {
    var CH = P2SH | GENESIS | UTXO_AFTER_GENESIS | CHRONICLE | UTXO_AFTER_CHRONICLE

    it('reads 0xffffffff as -1, so the rules still apply', function () {
      // CTransaction::nVersion is an int32. Reading the JS number would give 4294967295,
      // call the transaction malleable and relax every rule — the fail-open direction.
      var flags = CH | Interpreter.SCRIPT_VERIFY_MINIMALIF
      verifyWith('', 'OP_2 OP_IF OP_1 OP_ENDIF', flags, 0xffffffff)
        .should.equal('SCRIPT_ERR_MINIMALIF')
      var interp = new Interpreter()
      var tx = new bsv.Transaction(); tx.version = 0xffffffff
      interp.set({ flags: CH, tx: tx, nin: 0 })
      interp.enforceNonMalleability().should.equal(true)
    })

    it('treats every version at or below 1 as non-malleable, including negatives', function () {
      var flags = CH | Interpreter.SCRIPT_VERIFY_MINIMALIF
      ;[-1, 0, 1].forEach(function (v) {
        verifyWith('', 'OP_2 OP_IF OP_1 OP_ENDIF', flags, v)
          .should.equal('SCRIPT_ERR_MINIMALIF', 'version ' + v)
      })
    })

    it('enforces the rules when there is no transaction at all', function () {
      // BaseSignatureChecker::Version() returns 0, which is not malleable.
      var interp = new Interpreter()
      interp.set({ flags: CH, nin: 0 })
      interp.enforceNonMalleability().should.equal(true)
    })

    it('reports an impossible flag set before looking at the scriptSig', function () {
      // Both faults are present: the era pair is invalid AND the scriptSig is not push-only.
      // valid_flags comes first in VerifyScript, before any evaluation.
      verifyWith('OP_1 OP_NOP', 'OP_NOP',
        P2SH | UTXO_AFTER_CHRONICLE | SIGPUSHONLY | GENESIS)
        .should.equal('SCRIPT_ERR_INVALID_FLAGS')
    })

    it('reports an evaluation failure before CLEANSTACK judges the flags', function () {
      // CLEANSTACK without P2SH is an invalid flag set, but the node checks it at the END of
      // VerifyScript, after evaluation, so a script that simply fails says so first.
      verifyWith('', 'OP_0', CLEANSTACK).should.equal('SCRIPT_ERR_EVAL_FALSE_IN_STACK')
      verifyWith('', 'OP_1', CLEANSTACK).should.equal('SCRIPT_ERR_INVALID_FLAGS')
    })
  })

  describe('a flag set no node builds is refused rather than guessed at', function () {
    it('post-Chronicle UTXO without post-Genesis', function () {
      verifyWith('OP_1', 'OP_1', P2SH | UTXO_AFTER_CHRONICLE)
        .should.equal('SCRIPT_ERR_INVALID_FLAGS')
    })

    it('CLEANSTACK without P2SH reports rather than throwing', function () {
      verifyWith('OP_1', 'OP_1', Interpreter.SCRIPT_VERIFY_CLEANSTACK)
        .should.equal('SCRIPT_ERR_INVALID_FLAGS')
    })
  })
})
