'use strict'

/* global describe, it */

// Why an OrdLock cancel must be signed SIGHASH_ALL, and why "not SIGHASH_NONE" is the wrong rule.
//
// The CANCEL branch is a plain P2PKH gate: it constrains no output. So where the ordinal lands is
// decided entirely by what the seller's signature commits to. For a SATOSHI-TRACKED asset that is
// not the same question as "which output did I sign". Ordinal placement is positional -- satoshis
// flow from the input set into the output set in order -- so the landing output depends on the
// CUMULATIVE VALUES OF THE OUTPUTS BEFORE IT, and a signature that leaves those free does not pin
// the asset even when it pins "the owner's output".
//
// Measured below on a 3-in / 3-out shape, signing input 1 (the 1-sat ordinal), owner output at
// index 1: under SIGHASH_SINGLE the value of OUTPUT 0 can be raised and the signature stays
// valid. Raising output 0 from 2 to 3 satoshis makes it swallow the ordinal satoshi while the
// owner output is untouched and still signed for. No SIGHASH_NONE needed.
//
// So the rule is not "reject NONE": only plain SIGHASH_ALL commits to the whole input and output
// layout that fixes placement. Every relaxation opens a routing gap -- SINGLE leaves earlier
// output values free, ANYONECANPAY lets inputs be prepended, which moves the asset's position in
// the input ordering. `buildCancel` therefore deprecates its free-form sighashType override
// rather than filtering it, because a filter would have to encode this whole argument and would
// still be API protection rather than an on-chain invariant.
//
// The first version of this measurement was wrong in my favour: the fixture rebuilt the owner
// output with a FRESH random address each call, so every comparison differed for its own reason
// and SINGLE looked safe. Hence the two controls below -- an unmutated verify must pass, and the
// same mutation under ALL must fail -- without which this file would prove nothing.

require('chai').should()
var bsv = require('../..')
var Sig = bsv.crypto.Signature
var Sighash = bsv.Transaction.Sighash
var BN = bsv.crypto.BN

var SELLER = bsv.PrivateKey.fromBuffer(Buffer.from('a1'.repeat(32), 'hex'))
var BUYER = bsv.PrivateKey.fromBuffer(Buffer.from('b2'.repeat(32), 'hex'))
var SPK = bsv.Script.buildPublicKeyHashOut(SELLER.toAddress())
var FORK = Sig.SIGHASH_FORKID
var ORDINAL_INPUT = 1 // a 1-sat ordinal sitting second in the input set

// inputs [2, 1(ordinal), 1] -> outputs [2, 1(owner), 1]: the ordinal satoshi is index 2 of the
// input flow, which lands in output 1 only while output 0 stays at 2 satoshis.
function fixture () {
  var t = new bsv.Transaction()
  ;[[0, 2], [1, 1], [2, 1]].forEach(function (p) {
    t.from(new bsv.Transaction.UnspentOutput({
      txId: 'c'.repeat(63) + p[0], outputIndex: p[0], script: SPK.toHex(), satoshis: p[1]
    }))
  })
  t.to(SELLER.toAddress(), 2)
  t.to(BUYER.toAddress(), 1) // fixed, not random: see the note above
  t.to(SELLER.toAddress(), 1)
  return t
}

function survives (mode, mutate) {
  var signed = fixture()
  var sig = Sighash.sign(signed, SELLER, mode | FORK, ORDINAL_INPUT, SPK, new BN(1))
  var after = fixture()
  mutate(after)
  return Sighash.verify(after, sig, SELLER.toPublicKey(), ORDINAL_INPUT, SPK, new BN(1))
}

var noop = function () {}
var raiseOutput0 = function (t) { t.outputs[0].satoshis = 3 }

describe('OrdLock cancel: only SIGHASH_ALL pins where the ordinal lands', function () {
  it('verifies an unmutated transaction under both modes (control)', function () {
    survives(Sig.SIGHASH_SINGLE, noop).should.equal(true)
    survives(Sig.SIGHASH_ALL, noop).should.equal(true)
  })

  it('SINGLE leaves an EARLIER output value free, so the asset can be re-routed', function () {
    survives(Sig.SIGHASH_SINGLE, raiseOutput0).should.equal(true,
      'raising output 0 must not invalidate a SINGLE signature on input 1')
  })

  it('and ALL refuses the same change, which is what makes the test above meaningful', function () {
    survives(Sig.SIGHASH_ALL, raiseOutput0).should.equal(false)
  })

  it('SINGLE does pin the owner output itself, which is why it looks safe', function () {
    survives(Sig.SIGHASH_SINGLE, function (t) { t.outputs[1].satoshis = 2 }).should.equal(false)
    // ...while a LATER output is free too
    survives(Sig.SIGHASH_SINGLE, function (t) { t.outputs[2].satoshis = 9 }).should.equal(true)
  })
})
