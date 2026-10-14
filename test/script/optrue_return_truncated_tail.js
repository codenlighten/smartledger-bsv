'use strict'

/* global describe, it */

// A push whose LENGTH FIELD is cut off, after a top-level OP_RETURN.
//
// Post-Genesis the node stops at an executed top-level OP_RETURN and never reads the rest of
// the script — its own comment says the remainder "does not affect the validity (even in
// presence of unbalanced IFs, invalid opcodes etc)". So `6a4c`, `6a4d01` and `6a4e0100` are
// valid locking scripts, and one of them appears on livenet in
// ebc9fa1196a59e192352d76c0f6e73167046b9d37b8302b6bb6968dfd279b767 (see
// test/transaction/output.js). This library THREW parsing them, in both eras, so it could not
// answer at all for an output the network accepts and mines.
//
// The 22 rows below were judged on a compiled bitcoin-sv v1.2.3 by the op-codes lab and
// reproduced here before being accepted. 16 of the 22 already agreed; the 6 that did not are
// A1-A3 in both eras, and all six failed in `Script.fromBuffer` without reaching the
// interpreter. So the interpreter needed no change — which was a PREDICTION before the fix and
// is this file afterwards.
//
// Both flag words are rebuilt from the library's own named constants rather than copied from
// the oracle's hex: an undefined flag ORed into a word yields NaN, which looks exactly like a
// defect, and a hard-coded word stops being the library's own answer the moment a bit moves.

require('chai').should()
var bsv = require('../..')
var Script = bsv.Script
var Interpreter = Script.Interpreter
var BN = bsv.crypto.BN

var POST_GENESIS = Interpreter.mainnetFlags()
var PRE_GENESIS = Interpreter.SCRIPT_VERIFY_P2SH |
  Interpreter.SCRIPT_VERIFY_STRICTENC |
  Interpreter.SCRIPT_VERIFY_DERSIG

var SATS = 1000

function txSpending (sigHex) {
  var t = new bsv.Transaction()
  t.version = 1
  t.from({ txId: '00'.repeat(32), outputIndex: 0, script: '51', satoshis: SATS })
  t.inputs[0].setScript(Script.fromHex(sigHex))
  t.to(bsv.PrivateKey.fromRandom().toAddress(), 500)
  return t
}

function verdict (lockHex, sigHex, flags) {
  var i = new Interpreter()
  var ok = i.verify(Script.fromHex(sigHex), Script.fromHex(lockHex),
    txSpending(sigHex), 0, flags, new BN(SATS))
  return ok ? 'ok' : i.errstr.replace(/^SCRIPT_ERR_/, '')
}

// lock, scriptSig, node's pre-Genesis verdict, node's post-Genesis verdict
var ROWS = [
  ['6a4c', '51', 'OP_RETURN', 'ok'],
  ['6a4d01', '51', 'OP_RETURN', 'ok'],
  ['6a4e0100', '51', 'OP_RETURN', 'ok'],
  ['6a01', '51', 'OP_RETURN', 'ok'],
  ['6a4c50' + 'cd'.repeat(10), '51', 'OP_RETURN', 'ok'],
  ['636a4c68', '51', 'OP_RETURN', 'BAD_OPCODE'],
  ['636a4d0168', '51', 'OP_RETURN', 'BAD_OPCODE'],
  ['636a01', '51', 'OP_RETURN', 'BAD_OPCODE'],
  ['636a4c68', '00', 'BAD_OPCODE', 'BAD_OPCODE'],
  ['636a4d0168', '00', 'BAD_OPCODE', 'BAD_OPCODE'],
  ['636a01', '00', 'BAD_OPCODE', 'BAD_OPCODE']
]

describe('a cut-off push length after OP_RETURN', function () {
  it('rebuilds both flag words from named constants, matching the oracle', function () {
    // If this fails, every verdict below is being compared at the wrong flags and the
    // agreement means nothing.
    ;(POST_GENESIS >>> 0).should.equal(0x3d586f)
    ;(PRE_GENESIS >>> 0).should.equal(0x7)
  })

  describe('agrees with the node on all 22 judged rows', function () {
    ROWS.forEach(function (r) {
      it('lock ' + r[0] + ' sig ' + r[1] + ' pre-Genesis: ' + r[2], function () {
        verdict(r[0], r[1], PRE_GENESIS).should.equal(r[2])
      })
      it('lock ' + r[0] + ' sig ' + r[1] + ' post-Genesis: ' + r[3], function () {
        verdict(r[0], r[1], POST_GENESIS).should.equal(r[3])
      })
    })
  })

  describe('leniency is confined to a TOP-LEVEL OP_RETURN, and not by the parser', function () {
    // The parser cannot know what executed, so it is unconditionally permissive. What keeps
    // the IF cases strict is that they now PARSE and the interpreter decides — which is why
    // rows B1-B6 above were already correct before the parser changed and must stay so.
    it('still fails a cut-off push inside a TAKEN IF branch after OP_RETURN', function () {
      verdict('636a4c68', '51', POST_GENESIS).should.equal('BAD_OPCODE')
    })

    it('still fails one inside an UNTAKEN branch, because the branch is scanned', function () {
      verdict('636a4c68', '00', POST_GENESIS).should.equal('BAD_OPCODE')
    })

    it('still fails pre-Genesis, where OP_RETURN ends the script unsuccessfully', function () {
      verdict('6a4c', '51', PRE_GENESIS).should.equal('OP_RETURN')
    })
  })

  describe('the bytes survive, which is what a txid depends on', function () {
    var SHAPES = ['6a4c', '6a4d', '6a4d01', '6a4e', '6a4e01', '6a4e0100', '4c', '4d', '4e',
      '636a4c68', '6a4c50' + 'cd'.repeat(10)]

    it('round-trips every shape through toBuffer byte for byte', function () {
      SHAPES.forEach(function (hex) {
        Script.fromHex(hex).toHex().should.equal(hex)
      })
    })

    it('parses every byte string: fromBuffer is total', function () {
      // 282,400 sequences were fuzzed when this landed — every 1- and 2-byte script, every
      // 3-byte script opening with a pushdata opcode, and 20,000 random ones — with zero
      // throws and zero round-trip mismatches. A sample is kept here; the property is that
      // a Script can always be built from bytes, as the node's CScript can, and a decode
      // failure surfaces at USE instead.
      for (var a = 0; a < 256; a++) {
        for (var b = 0; b < 256; b++) {
          var buf = Buffer.from([a, b])
          Script.fromBuffer(buf).toBuffer().should.deep.equal(buf)
        }
      }
    })

    it('keeps the two prefix lengths distinct in the text forms', function () {
      // `6a4d` and `6a4d01` have no push to render and no length token to render it with. If
      // both took the no-data branch they would print as `OP_RETURN OP_PUSHDATA2`: two
      // different scripts, one text. This file's sibling fixed that exact shape once already,
      // for unnamed opcodes written as bare hex.
      Script.fromHex('6a4d').toString().should.not.equal(Script.fromHex('6a4d01').toString())
      Script.fromHex('6a4d').toString().should.equal('OP_RETURN 0x4d')
      Script.fromHex('6a4d01').toString().should.equal('OP_RETURN 0x4d01')
      Script.fromHex('6a4c').toASM().should.equal('OP_RETURN 0x4c')
    })

    it('throws rather than mis-reading that text back, which is the safe direction', function () {
      // The grammar has no token for a pushdata opcode with no length, so the text form is
      // informational. It fails loudly instead of reading back as a different script —
      // `toBuffer` is the authoritative round trip.
      ;(function () { Script.fromString('OP_RETURN 0x4c') }).should.throw()
    })
  })

  describe('every consumer that rebuilds or reads chunks keeps the bytes', function () {
    // A review of the change asked the right question: a malformed tail can be UNEXECUTED and
    // still be part of the bytes a signature covers. If any transform that rebuilds chunks
    // dropped it, this library would sign a different scriptCode from the node — a consensus
    // defect that no accept/reject test would see. So it is measured, not reasoned about.
    var bsvlib = require('../..')
    var Sighash = bsvlib.Transaction.Sighash
    var KEY = bsvlib.PrivateKey.fromBuffer(Buffer.from('11'.repeat(32), 'hex'))
    var SIGHASH = bsvlib.crypto.Signature.SIGHASH_ALL | bsvlib.crypto.Signature.SIGHASH_FORKID
    var LOCK = '21' + KEY.toPublicKey().toHex() + 'ac' + '6a4c'

    function spendingTx () {
      var t = new bsvlib.Transaction()
      t.version = 1
      t.from({ txId: '11'.repeat(32), outputIndex: 0, script: LOCK, satoshis: SATS })
      t.to(KEY.toAddress(), 4000)
      return t
    }

    it('signs the cut-off push, because the scriptCode is the whole locking script', function () {
      var lock = Script.fromHex(LOCK)
      var pre = Sighash.sighashPreimage(spendingTx(), SIGHASH, 0, lock, new BN(SATS)).toString('hex')
      pre.indexOf(LOCK).should.be.above(-1, 'the signed scriptCode must contain the tail')
      // And the varint before it must declare the full length, or the tail is signed as
      // something shorter than it is.
      var at = pre.indexOf(LOCK)
      pre.slice(at - 2, at).should.equal((LOCK.length / 2).toString(16))
    })

    it('produces a signature that verifies against that lock', function () {
      var lock = Script.fromHex(LOCK)
      var tx = spendingTx()
      var sig = Sighash.sign(tx, KEY, SIGHASH, 0, lock, new BN(SATS))
      tx.inputs[0].setScript(Script.fromASM(sig.toTxFormat().toString('hex')))
      var i = new Interpreter()
      i.verify(tx.inputs[0].script, lock, tx, 0, POST_GENESIS, new BN(SATS))
        .should.equal(true, i.errstr)
    })

    it('keeps the chunk through removeCodeseparators', function () {
      Script.fromHex('ab6a4c').removeCodeseparators().toHex().should.equal('6a4c')
    })

    it('keeps the chunk through findAndDelete', function () {
      Script.fromHex('516a4c').findAndDelete(Script.fromHex('51')).toHex().should.equal('6a4c')
      // And does not delete it when asked for something else.
      Script.fromHex('6a4c').findAndDelete(Script.fromHex('51')).toHex().should.equal('6a4c')
    })

    it('leaves isScriptHashIn answering as it did, for every newly-parseable shape', function () {
      // It used the parse THROW to answer false. Those buffers parse now, so the answer comes
      // from classify() instead — which only agrees if none of them classifies as a known
      // type. 66,585 shapes were enumerated when this landed and none did; a sample is kept.
      //
      // The pushdata opcode has to come LAST for its length field to be the thing that is
      // missing. Written the other way round the loop built `4c<a>` — a PUSHDATA1 whose length
      // byte IS present and whose data is short, which is the case that already agreed — and
      // reached no new shape at all. The `checked` assertion below is what caught that.
      var checked = 0
      ;[0x4c, 0x4d, 0x4e].forEach(function (op) {
        for (var a = 0; a < 256; a++) {
          var buf = Buffer.from([a, op])
          var sc = Script.fromBuffer(buf)
          if (!sc.chunks.some(function (c) { return c.lenPrefix !== undefined })) continue
          checked++
          sc.classify().should.equal(Script.types.UNKNOWN, buf.toString('hex'))
        }
      })
      checked.should.be.above(0, 'the loop must actually reach the new shapes')
    })

    it('serializes a hand-assembled chunk after one, with the stated hand-assembly limit', function () {
      // Not a defect, and not a supported construction: a chunk placed after a cut-off prefix
      // serializes to bytes in which the following chunk IS the length field, so it re-parses
      // as one chunk. lib/script/push-decode.js already states that a hand-assembled chunk
      // list must be round-tripped through Script.fromBuffer(script.toBuffer()) before any
      // predicate is asked of it. Pinned so the behaviour is known rather than discovered.
      var s = new Script()
      s.chunks = [{ opcodenum: 0x4c, lenPrefix: Buffer.alloc(0) }, { opcodenum: 0x51 }]
      s.toHex().should.equal('4c51')
      Script.fromHex('4c51').chunks.length.should.equal(1)
    })
  })

  describe('an output carrying one is a normal output now', function () {
    var RAW = '0100000001' + '00'.repeat(32) + 'ffffffff' + '0100' + 'ffffffff' +
      '01' + '0100000000000000' + '02' + '6a4c' + '00000000'

    it('gives output.script a Script rather than null', function () {
      var tx = new bsv.Transaction(RAW)
      tx.outputs[0].script.toHex().should.equal('6a4c')
      tx.outputs[0]._scriptBuffer.toString('hex').should.equal('6a4c')
    })

    it('round-trips the transaction byte-exact', function () {
      new bsv.Transaction(RAW).toString().should.equal(RAW)
    })

    it('is NOT a data output, and that is the consistent answer', function () {
      // `isDataOut` is OP_RETURN followed by push-only, and an undecodable push is not
      // push-only — which is the node's own answer from `IsPushOnly` once `GetOp` has failed.
      // So this is false, while a COMPLETE push after OP_RETURN (`6a4c0a` + ten bytes) is
      // true. The node has no isDataOut of its own, so what is pinned here is internal
      // consistency with isPushOnly rather than agreement with a reference.
      Script.fromHex('6a4c').isDataOut().should.equal(false)
      Script.fromHex('6a4c0a' + 'cd'.repeat(10)).isDataOut().should.equal(true)
    })

    it('does not throw from any text or predicate path', function () {
      // The peer's original spec asked for toASM/toString/isDataOut to show an opaque tail
      // rather than throw. They do not throw; this pins that none of them does.
      ;['6a4c', '6a4d01', '6a4e0100', '4c'].forEach(function (hex) {
        var s = Script.fromHex(hex)
        ;(function () { s.toString(); s.toASM(); s.isDataOut(); s.isPushOnly(); s.toHex() })
          .should.not.throw()
      })
    })
  })
})
