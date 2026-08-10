'use strict'

/* global describe, it */

// Regressions for three wrong calls that shipped through 7.5.8, each of which
// no test exercised.
//
// Two were live: Transaction#fromObject threw on an input its own
// checkArgument accepts, and OP_CHECKSEQUENCEVERIFY failed every script with a
// misleading error. Those two tests fail on the unfixed code.
//
// The third — sFromPreimage's toBuffer call — is LATENT, and the tests say so
// rather than pretending otherwise. See the note on that block.

require('chai').should()
var bsv = require('../')
var BN = bsv.crypto.BN

describe('regressions', function () {
  describe('Transaction#fromObject with a Transaction', function () {
    // `fromObject` read `transaction.toObject()` where it meant
    // `arg.toObject()`, so the branch that exists specifically to accept a
    // Transaction was the only branch that could not work. checkArgument
    // admits the input; the next line threw TypeError on it.
    it('accepts a Transaction, which its own checkArgument allows', function () {
      var key = bsv.PrivateKey.fromRandom()
      var source = new bsv.Transaction().to(key.toAddress(), 1000)

      var copy = new bsv.Transaction().fromObject(source)

      copy.outputs.length.should.equal(1)
      copy.outputs[0].satoshis.should.equal(1000)
      copy.toObject().should.deep.equal(source.toObject())
    })

    it('still accepts the plain object form', function () {
      var key = bsv.PrivateKey.fromRandom()
      var source = new bsv.Transaction().to(key.toAddress(), 1000)

      var copy = new bsv.Transaction().fromObject(source.toObject())

      copy.toObject().should.deep.equal(source.toObject())
    })
  })

  describe('BN#toBuffer with the native signature', function () {
    // lib/crypto/bn.js REPLACES toBuffer with an options-object form. Calling
    // it with bn.js's native (endian, length) signature silently ignores the
    // length: 'be' lands in `opts`, `opts.size` is undefined, and the result
    // is the natural-length buffer.
    it('pads to the requested size when given the options form', function () {
      // Leading zero byte, so the natural encoding is shorter than 32.
      var n = new BN('00ff' + '11'.repeat(30), 'hex')

      n.toBuffer({ size: 32 }).length.should.equal(32)
    })

    it('does NOT honour a positional length, which is why the options form is required', function () {
      var n = new BN('00ff' + '11'.repeat(30), 'hex')

      // Documents the trap rather than endorsing it: this is the call shape
      // that produced a 31-byte s inside the OP_PUSH_TX grind.
      n.toBuffer('be', 32).length.should.equal(31)
    })
  })

  describe('PushTx.sFromPreimage uses the right toBuffer signature', function () {
    // sFromPreimage called `s.toBuffer('be', 32)` — bn.js's NATIVE signature,
    // against a toBuffer that lib/crypto/bn.js has replaced with an
    // options-object form. The length argument was therefore ignored.
    //
    // This is a latent defect, NOT a live one, and the distinction is worth
    // stating precisely: the truncation is currently unreachable. `s` is
    // (HASH256(preimage) + Gx) mod n, and the caller has already required the
    // hash's leading byte to be 0x01..0x7f, so z is in [2**248, 2**255).
    // Adding Gx (about 0.476 * 2**256) never wraps, and the low-S filter caps
    // the result at n/2 — confining s to a narrow band whose leading byte is
    // always 0x7a..0x7f. It can never be zero, so the natural encoding is
    // always 32 bytes anyway.
    //
    // The fix is worth making because the correctness of the output currently
    // depends on two upstream filters that have nothing to do with buffer
    // length. Change the MINIMALDATA range or drop the low-S requirement and
    // the truncation becomes reachable, silently, in a covenant.
    it('always returns exactly 32 bytes', function () {
      var PushTx = bsv.SmartContract.PushTx
      var accepted = 0

      for (var i = 0; i < 4000; i++) {
        var preimage = bsv.crypto.Hash.sha256(Buffer.from('grind-' + i))
        var sBE = PushTx.sFromPreimage(preimage)
        if (sBE) {
          accepted++
          sBE.length.should.equal(32)
        }
      }

      accepted.should.be.above(0)
    })

    it('keeps s inside the band that makes the length safe', function () {
      // Pins the property the paragraph above relies on. If this ever fails,
      // the toBuffer call shape matters again — and the fix is already in.
      var PushTx = bsv.SmartContract.PushTx

      for (var i = 0; i < 2000; i++) {
        var preimage = bsv.crypto.Hash.sha256(Buffer.from('band-' + i))
        var sBE = PushTx.sFromPreimage(preimage)
        if (sBE) {
          sBE[0].should.be.within(0x01, 0x7f)
        }
      }
    })
  })

  describe('OP_CHECKSEQUENCEVERIFY', function () {
    // checkSequence masked with `nSequence.and(nLockTimeMask)` where the mask
    // is a plain number. bn.js `and` requires a BN, so it threw
    // 'num.clone is not a function'; the interpreter's try/catch swallowed
    // that and reported SCRIPT_ERR_UNKNOWN_ERROR, making every CSV script fail
    // with a misleading error.
    //
    // Note this is only reachable with SCRIPT_VERIFY_CHECKSEQUENCEVERIFY set:
    // post-Genesis BSV reverted CSV to OP_NOP3 and the flag is off by default.
    it('evaluates instead of failing with SCRIPT_ERR_UNKNOWN_ERROR', function () {
      var Interpreter = bsv.Script.Interpreter
      var key = bsv.PrivateKey.fromRandom()
      var address = key.toAddress()
      var prev = new bsv.Transaction().to(address, 1000)
      var spend = new bsv.Transaction().from({
        txId: prev.hash,
        outputIndex: 0,
        script: bsv.Script.buildPublicKeyHashOut(address).toHex(),
        satoshis: 1000
      })
      spend.version = 2
      spend.inputs[0].sequenceNumber = 20

      var interpreter = new Interpreter()
      var verified = interpreter.verify(
        bsv.Script.fromASM('OP_1'),
        bsv.Script.fromASM('OP_10 OP_CHECKSEQUENCEVERIFY'),
        spend, 0,
        Interpreter.SCRIPT_VERIFY_CHECKSEQUENCEVERIFY,
        new BN(1000)
      )

      interpreter.errstr.should.equal('')
      verified.should.equal(true)
    })

    it('still rejects a sequence that does not satisfy the requirement', function () {
      var Interpreter = bsv.Script.Interpreter
      var key = bsv.PrivateKey.fromRandom()
      var address = key.toAddress()
      var prev = new bsv.Transaction().to(address, 1000)
      var spend = new bsv.Transaction().from({
        txId: prev.hash,
        outputIndex: 0,
        script: bsv.Script.buildPublicKeyHashOut(address).toHex(),
        satoshis: 1000
      })
      spend.version = 2
      // Below the required relative locktime of 10.
      spend.inputs[0].sequenceNumber = 5

      var interpreter = new Interpreter()
      var verified = interpreter.verify(
        bsv.Script.fromASM('OP_1'),
        bsv.Script.fromASM('OP_10 OP_CHECKSEQUENCEVERIFY'),
        spend, 0,
        Interpreter.SCRIPT_VERIFY_CHECKSEQUENCEVERIFY,
        new BN(1000)
      )

      verified.should.equal(false)
      interpreter.errstr.should.equal('SCRIPT_ERR_UNSATISFIED_LOCKTIME')
    })
  })
})
