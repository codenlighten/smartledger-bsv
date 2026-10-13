'use strict'

/* global describe, it */

// A truncated push in a scriptSig was reported as SCRIPT_ERR_BAD_OPCODE where the SV Node
// reports SCRIPT_ERR_SIG_PUSHONLY. Both reject, so this is an error-NAME and check-ORDER
// divergence, not an accept/reject one — the fifth of that family found in this library
// (see CHANGELOG 9.29.0 through 9.29.2 and 9.33.0), and the first found by someone else.
//
// The node's ordering is explicit in VerifyScript: the push-only gate runs ABOVE EvalScript,
//
//     if(VerifySigPushOnly(flags)) {
//         if(...era...) {
//             if(!scriptSig.IsPushOnly())
//                 return SCRIPT_ERR_SIG_PUSHONLY;           // interpreter.cpp:2329-2331
//         }
//     }
//     ... EvalScript(... scriptSig ...)
//
// and IsPushOnly walks the script with GetOp, which FAILS on a push running past the end.
// So the node never evaluates the script. This library's isPushOnly tested only each chunk's
// opcode number, said a truncated push was a push, passed the gate, evaluated, and reported
// the instruction-read failure from EvalScript instead.
//
// Reported by the op-codes lab against @smartledger/bsv 9.33.0 and @smartledger/bsv-core
// 1.5.0, from 24 vectors judged by a compiled bitcoin-sv v1.2.3; reproduced here before
// being accepted, and the node's IsPushOnly, GetOp2 and VerifyScript were read at v1.2.3 to
// confirm the mechanism rather than the symptom.

require('chai').should()
var bsv = require('../..')
var Script = bsv.Script
var Interpreter = Script.Interpreter
var BN = bsv.crypto.BN

var LOCK = Script.fromHex('7551') // OP_DROP OP_1 — accepts whatever the scriptSig pushed

// Every way a push can declare more bytes than the script carries. `len` is the declared
// length, `buf` holds what is actually there.
var TRUNCATED = {
  'OP_PUSHDATA1 declaring 80 of 10': '4c50' + 'cd'.repeat(10),
  'OP_PUSHDATA2 declaring 80 of 10': '4d5000' + 'cd'.repeat(10),
  'OP_PUSHDATA4 declaring 80 of 10': '4e50000000' + 'cd'.repeat(10),
  'a direct push declaring 75 of 10': '4b' + 'cd'.repeat(10),
  'a direct push declaring 10 of 5': '0a' + 'cd'.repeat(5),
  'a one-byte push with no byte after it': '01'
}

function run (sigHex, flags) {
  var i = new Interpreter()
  var ok = i.verify(Script.fromHex(sigHex), LOCK, undefined, 0, flags, new BN(0))
  return { ok: ok, errstr: i.errstr }
}

describe('a truncated push in a scriptSig', function () {
  describe('is refused by the push-only gate, above evaluation', function () {
    Object.keys(TRUNCATED).forEach(function (label) {
      it('reports SIG_PUSHONLY for ' + label, function () {
        var r = run(TRUNCATED[label], Interpreter.mainnetFlags())
        r.ok.should.equal(false)
        r.errstr.should.equal('SCRIPT_ERR_SIG_PUSHONLY')
      })
    })
  })

  describe('falls back to the instruction read when that gate does not apply', function () {
    // Without SCRIPT_VERIFY_SIGPUSHONLY there is no gate to fail, and the node reports the
    // decode failure from EvalScript — which is what this library already did everywhere,
    // and must keep doing. Pinned so the fix cannot be mistaken for "SIG_PUSHONLY always".
    it('reports BAD_OPCODE with the flag off', function () {
      var flags = Interpreter.mainnetFlags() & ~Interpreter.SCRIPT_VERIFY_SIGPUSHONLY
      Object.keys(TRUNCATED).forEach(function (label) {
        run(TRUNCATED[label], flags).errstr
          .should.equal('SCRIPT_ERR_BAD_OPCODE', label)
      })
    })

    it('reports BAD_OPCODE pre-Genesis, where push-only is not required at all', function () {
      // The flag is set, but the era test inside the gate is not satisfied, so the new
      // error must not leak backwards into pre-Genesis scripts.
      var flags = Interpreter.SCRIPT_VERIFY_P2SH | Interpreter.SCRIPT_VERIFY_SIGPUSHONLY
      Object.keys(TRUNCATED).forEach(function (label) {
        run(TRUNCATED[label], flags).errstr
          .should.equal('SCRIPT_ERR_BAD_OPCODE', label)
      })
    })
  })

  describe('leaves honest scripts exactly as they were', function () {
    it('still verifies a push that carries its bytes', function () {
      run('0a' + 'cd'.repeat(10), Interpreter.mainnetFlags()).ok.should.equal(true)
    })

    it('still reports MINIMALDATA for a non-minimal push, not SIG_PUSHONLY', function () {
      // A non-minimal push is push-only, so it passes the gate and fails later. This is the
      // pairing that 9.29.2 got wrong in the other direction, where a truncated push that
      // was ALSO non-minimal reported MINIMALDATA.
      run('4c0a' + 'cd'.repeat(10), Interpreter.mainnetFlags()).errstr
        .should.equal('SCRIPT_ERR_MINIMALDATA')
    })

    it('still reports SIG_PUSHONLY for an ordinary non-push opcode', function () {
      run('75', Interpreter.mainnetFlags()).errstr.should.equal('SCRIPT_ERR_SIG_PUSHONLY')
    })
  })

  describe('the data-output classifications move with it, as the node\'s do', function () {
    // The node classifies TX_NULL_DATA with the SAME IsPushOnly, applied to the script after
    // the OP_RETURN, or after OP_FALSE OP_RETURN:
    //
    //   if (isOpReturn && scriptPubKey.IsPushOnly(scriptPubKey.begin() + offset)) {
    //       typeRet = TX_NULL_DATA;                          // standard.cpp, Solver
    //
    // so a truncated push after OP_RETURN stops being a standard data output here too.
    // isSafeDataOut delegates to isDataOut on its own suffix, which is the node's offset-2
    // case, so it follows without a change of its own.
    it('stops classifying a truncated push as a data output', function () {
      Script.fromHex('6a' + '4c50' + 'cd'.repeat(10)).isDataOut().should.equal(false)
      Script.fromHex('006a' + '4c50' + 'cd'.repeat(10)).isSafeDataOut().should.equal(false)
    })

    it('still classifies the honest ones', function () {
      Script.fromHex('6a' + '4c0a' + 'cd'.repeat(10)).isDataOut().should.equal(true)
      Script.fromHex('006a' + '4c0a' + 'cd'.repeat(10)).isSafeDataOut().should.equal(true)
    })
  })

  describe('a push with a truncated LENGTH FIELD is a separate, open divergence', function () {
    // `4c` with no length byte, `4d01`, `4e0100`: the node's GetOp2 fails on these too, at the
    // length read rather than the data read —
    //
    //   else if (opcode == OP_PUSHDATA1) { if (end()-pc < 1) return false; nSize = *pc++; }
    //
    // — so the node builds a script object and refuses it at evaluation. This library parses
    // EAGERLY and has nowhere to put a push whose declared length it never read, so
    // Script.fromBuffer THROWS and there is no Script object to evaluate. We therefore cannot
    // produce the node's verdict for these three shapes at all.
    //
    // HOW FAR THAT REACHES IS NARROWER THAN IT SOUNDS, and the tests below are the measurement
    // rather than the assumption. Transaction parsing is LAZY: the scriptSig is kept as raw
    // bytes and only turned into a Script when something asks for one. So the transaction
    // constructs, `toString()` round-trips it byte for byte, and the raw scriptSig stays
    // readable — only `input.script` throws. A transaction carrying one of these can still be
    // parsed, stored and relayed; what cannot be done is ask this library whether its script
    // is valid.
    //
    // Both sides still REJECT, and a throw is fail-closed, so this is not a false accept. It is
    // NOT fixed here: representing an undecodable instruction changes what the parser may
    // return, and loosening a parser that currently throws turns a fail-closed path into one
    // that must then be rejected correctly everywhere downstream. That is a design decision,
    // not a patch — recorded in docs/NODE_DIVERGENCES.md for Greg to call.
    //
    // What IS pinned here is CONTAINMENT: a typed, catchable error at the boundary rather than
    // a TypeError from somewhere inside, and exactly which operations still work.
    var NO_LENGTH_FIELD = ['4c', '4d01', '4e0100']

    it('throws a typed Script.InvalidBuffer, not an internal error', function () {
      NO_LENGTH_FIELD.forEach(function (hex) {
        var caught = null
        try { Script.fromHex(hex) } catch (e) { caught = e }
        ;(caught === null).should.equal(false, hex + ' parsed when it should have thrown')
        caught.should.be.instanceof(bsv.errors.Script.InvalidBuffer)
        caught.message.should.match(/Invalid script buffer/)
      })
    })

    it('leaves the transaction parseable and byte-exact, and throws only at .script', function () {
      var txHex = [
        '01000000', '01', 'ab'.repeat(32), '00000000',
        '01', '4c',
        'ffffffff', '00', '00000000'
      ].join('')
      var tx = new bsv.Transaction(txHex)
      tx.toString().should.equal(txHex)
      tx.inputs[0]._scriptBuffer.toString('hex').should.equal('4c')
      var caught = null
      try { tx.inputs[0].script } catch (e) { caught = e } // eslint-disable-line no-unused-expressions
      ;(caught === null).should.equal(false, 'input.script should have thrown')
      caught.should.be.instanceof(bsv.errors.Script.InvalidBuffer)
    })
  })

  describe('whether the gate applies at all is an ERA AND TX-VERSION question', function () {
    // This is the condition that makes "the node says SIG_PUSHONLY" true only sometimes, and
    // it is worth pinning in both directions because reading only one of them is how two
    // labs came to believe the node was ASYMMETRIC between a truncated length field and
    // truncated data. It is not. The gate's own condition differs:
    //
    //   if(VerifySigPushOnly(flags)) {
    //       if((IsGenesis(flags) && !IsChronicle(flags)) ||
    //          (IsChronicle(flags) && !IsMalleableTxnVersion(checker.Version())))
    //           if(!scriptSig.IsPushOnly()) return SCRIPT_ERR_SIG_PUSHONLY;
    //
    // with `IsMalleableTxnVersion(v)` being `v > 1` (interpreter.cpp:34-38, "Post-Chronicle,
    // malleability is permitted if txn version > 1"). So post-Chronicle the gate fires ONLY
    // for tx version <= 1; at version 2 it is skipped entirely and the sole possible error is
    // the instruction read. Pre-Chronicle but post-Genesis the version is irrelevant.
    //
    // A measurement taken post-Chronicle at version 2 therefore reports BAD_OPCODE for EVERY
    // truncated push, which looks exactly like the push-only fix not working.
    var SIG = '4c50' + 'cd'.repeat(10)

    function withVersion (v, flags) {
      var tx = new bsv.Transaction()
      tx.version = v
      tx.from({ txId: 'ab'.repeat(32), outputIndex: 0, script: '51', satoshis: 1000 })
      tx.to(new bsv.PrivateKey().toAddress(), 500)
      var i = new Interpreter()
      i.verify(Script.fromHex(SIG), LOCK, tx, 0, flags, new BN(1000))
      return i.errstr
    }

    it('fires post-Chronicle at tx version 0 and 1', function () {
      withVersion(0, Interpreter.mainnetFlags()).should.equal('SCRIPT_ERR_SIG_PUSHONLY')
      withVersion(1, Interpreter.mainnetFlags()).should.equal('SCRIPT_ERR_SIG_PUSHONLY')
    })

    it('is SKIPPED post-Chronicle at tx version 2 and above, leaving BAD_OPCODE', function () {
      withVersion(2, Interpreter.mainnetFlags()).should.equal('SCRIPT_ERR_BAD_OPCODE')
      withVersion(3, Interpreter.mainnetFlags()).should.equal('SCRIPT_ERR_BAD_OPCODE')
    })

    it('fires pre-Chronicle at any version, because the version test is Chronicle-only', function () {
      var pre = Interpreter.mainnetFlags() &
        ~Interpreter.SCRIPT_CHRONICLE & ~Interpreter.SCRIPT_UTXO_AFTER_CHRONICLE
      withVersion(1, pre).should.equal('SCRIPT_ERR_SIG_PUSHONLY')
      withVersion(2, pre).should.equal('SCRIPT_ERR_SIG_PUSHONLY')
    })
  })

  describe('arrives this way from the wire, not only from fromHex', function () {
    it('survives transaction parsing and is then refused', function () {
      // How such a script actually reaches a verifier: the scriptSig is a length-prefixed
      // byte string in the transaction, so a truncated push inside it parses fine as a
      // transaction and only the script is malformed.
      var sig = '4c50' + 'cd'.repeat(10)
      var txHex = [
        '01000000', '01', 'ab'.repeat(32), '00000000',
        (sig.length / 2).toString(16).padStart(2, '0'), sig,
        'ffffffff', '00', '00000000'
      ].join('')
      var tx = new bsv.Transaction(txHex)
      tx.inputs[0].script.toHex().should.equal(sig)
      tx.inputs[0].script.isPushOnly().should.equal(false)
      run(tx.inputs[0].script.toHex(), Interpreter.mainnetFlags()).errstr
        .should.equal('SCRIPT_ERR_SIG_PUSHONLY')
    })
  })
})
