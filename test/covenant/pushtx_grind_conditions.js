'use strict'

/* global describe, it */

// The three grind conditions are load-bearing, and this file says WHICH guard catches what.
//
// `pushTxCore` hard-codes the DER lengths `30 44 02 20` and appends no sign byte to `e`. Both are
// honest only because `PushTx.grind` refuses a preimage unless HASH256(preimage) yields an `s`
// that is 32 bytes, positive, minimally encoded and low. A covenant that accepts a preimage the
// grind never vetted is relying on those constants without the premise.
//
// A peer pinning the gate against a compiled bitcoin-sv v1.2.3 VerifyScript reproduced
// accept-genuine and reject-mutated for both grind fields, and deferred the low-S must-fail to
// "your suite". It was not in my suite: `covenants.js` asserted the POSITIVE direction and carried
// the sentence "a high-S signature would be rejected here" as a COMMENT, which is prose, not a
// test. This file is that test, and measuring it corrected the claim.
//
// What actually happens to a high-S value, measured over a 20,000-nonce sweep:
//
//   420   usable            (minimal encoding ok, low-S ok)       ~2.1%, the published grind rate
//   9,403 high-S, s >= 2^255                                      rejected by the SCRIPT ITSELF
//   0     high-S, n/2 < s < 2^255                                 would need SCRIPT_VERIFY_LOW_S
//   10,177 minimal encoding failed                                rejected before low-S matters
//
// So the guard that fires is **OP_NUM2BIN**, not the flag: `s >= 2^255` has its top byte >= 0x80,
// so it cannot be a 32-byte SIGNED script number, and the script aborts with
// SCRIPT_ERR_IMPOSSIBLE_ENCODING while serialising `s` — before any signature is assembled or
// checked. The construction therefore cannot EMIT a high-S signature, which is a stronger property
// than "the interpreter would reject one".
//
// Independently reproduced on a compiled bitcoin-sv v1.2.3 oracle, classifying 1,000 of its OWN
// preimages: usable 2.30% (here ~2.1%), minimal-encoding-failed 50.2%, high-S dying at
// OP_NUM2BIN 47.5%, and the LOW_S-would-guard window 0 of 1,000. Two implementations, same
// distribution within sampling error, and the window empty on both.
//
// The window where `SCRIPT_VERIFY_LOW_S` would be the thing that rejects — n/2 < s < 2^255 — is
// about 2^127 wide out of 2^256. Nothing landed in it and nothing will: that branch is
// unreachable by sampling (~2^-129), so its existence is REASONED here and deliberately not
// claimed as measured.

var should = require('chai').should()
var bsv = require('../..')
var SC = bsv.SmartContract
var P = SC.PushTx
var H = SC.CovenantHelpers
var I = bsv.Script.Interpreter
var BN = bsv.crypto.BN
var Hash = bsv.crypto.Hash

var HALF_N = BN.fromBuffer(
  Buffer.from('7FFFFFFFFFFFFFFFFFFFFFFFFFFFFFFF5D576E7357A4501DDFE92F46681B20A0', 'hex'))
var TWO_255 = new BN(1).ushln(255)
var SATS = 50000

function world () {
  var priv = bsv.PrivateKey.fromBuffer(Buffer.from('33'.repeat(32), 'hex'))
  var lock = P.authenticator()
  var out = new bsv.Transaction.Output({
    script: bsv.Script.buildPublicKeyHashOut(priv.toAddress()), satoshis: SATS - 500
  })
  return { lock: lock, spend: H.fundAndSpend(lock, SATS, { outputs: [out] }).spend }
}

// classify the s-value a given nonce would produce, without running the script
function classify (w, nonce) {
  w.spend.nLockTime = nonce
  var pre = H.rawPreimage(w.spend, 0, w.lock, SATS)
  var z = Hash.sha256sha256(pre)
  var s = BN.fromBuffer(z).add(BN.fromBuffer(P.Gx)).mod(P.N)
  return {
    preimage: pre,
    minimalOk: z[0] >= 0x01 && z[0] <= 0x7f,
    lowSOk: !s.gt(HALF_N),
    aboveTwo255: s.gte(TWO_255)
  }
}

describe('OP_PUSH_TX grind conditions: which guard catches what', function () {
  this.timeout(30000)

  it('rejects a high-S preimage in the SCRIPT, not via the LOW_S flag', function () {
    var w = world()
    var hit = null
    for (var n = 0; n < 2000 && !hit; n++) {
      var c = classify(w, n)
      if (c.minimalOk && !c.lowSOk) hit = { nonce: n, c: c } // minimal ok isolates low-S
    }
    should.exist(hit, 'the sweep must find a high-S case, or this test proves nothing')
    ;(!P.sFromPreimage(hit.c.preimage)).should.equal(true, 'grind must refuse it')
    hit.c.aboveTwo255.should.equal(true, 'in practice a high-S s is also >= 2^255')

    w.spend.nLockTime = hit.nonce
    var pre = H.rawPreimage(w.spend, 0, w.lock, SATS)
    w.spend.inputs[0].setScript(new bsv.Script().add(Buffer.from(pre)))

    var strict = H.verify(w.spend.inputs[0].script, w.lock, { tx: w.spend, satoshis: SATS })
    strict.ok.should.equal(false)
    strict.err.should.equal('SCRIPT_ERR_IMPOSSIBLE_ENCODING')

    // The isolating control: removing SCRIPT_VERIFY_LOW_S changes nothing, which is what proves
    // the script's own OP_NUM2BIN is the guard rather than the flag.
    var relaxed = H.verify(w.spend.inputs[0].script, w.lock, {
      tx: w.spend, satoshis: SATS, flags: H.flags() & ~I.SCRIPT_VERIFY_LOW_S
    })
    relaxed.ok.should.equal(false)
    relaxed.err.should.equal('SCRIPT_ERR_IMPOSSIBLE_ENCODING')
  })

  it('finds no case in the window where the LOW_S flag would be the guard', function () {
    var w = world()
    var tally = { usable: 0, aboveTwo255: 0, inWindow: 0, minimalFailed: 0 }
    for (var n = 0; n < 2000; n++) {
      var c = classify(w, n)
      if (!c.minimalOk) tally.minimalFailed++
      else if (c.lowSOk) tally.usable++
      else if (c.aboveTwo255) tally.aboveTwo255++
      else tally.inWindow++
    }
    tally.usable.should.be.above(0, 'the grind must be able to succeed at all')
    tally.aboveTwo255.should.be.above(0)
    // ~2^127 wide out of 2^256: reasoned unreachable, and asserted so it cannot change silently
    tally.inWindow.should.equal(0)
    TWO_255.sub(HALF_N).toString(2).length.should.be.below(130)
  })

  it('and the grind-accepted preimage verifies, which is the positive control', function () {
    var w = world()
    var pre = P.grind(w.spend, 0, w.lock, SATS).preimage
    ;(!!P.sFromPreimage(pre)).should.equal(true)
    w.spend.inputs[0].setScript(new bsv.Script().add(Buffer.from(pre)))
    H.verify(w.spend.inputs[0].script, w.lock, { tx: w.spend, satoshis: SATS }).ok
      .should.equal(true)
  })
})
