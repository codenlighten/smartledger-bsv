'use strict'

/* global describe, it */

// A fixed OP_PUSH_TX vector, published as data so an EXTERNAL implementation can diff against
// it instead of re-deriving the construction from prose.
//
// A peer building a covenant to a frozen spec refused to transcribe the preimage gate from a
// description -- correctly, because a wrong byte there is the exploitable case. Prose describes
// a construction; this file is an artifact: a locking script, a transaction, the grind nonce
// that made the s-value canonical, and the preimage, all of which must agree.
//
// Independently reproduced 2026-10-17 against a compiled bitcoin-sv v1.2.3 VerifyScript
// (flags 0xd400e: STRICTENC|DERSIG|LOW_S|NULLFAIL|FORKID|GENESIS|UTXO_AFTER_GENESIS) by another
// session: both vectors accept the genuine preimage and reject a one-byte mutation, a preimage
// whose trailing nHashType is forced to 0x42 is rejected, and -- the strongest form of this --
// their own independent grind reached the SAME published nonce, 103, rather than merely some
// working nonce. That last result is what confirms the s = (e + Gx) mod n arithmetic and the
// three grind conditions, not just the outcome.
//
// The test is written so the JSON cannot drift from the code. Every field is RECOMPUTED from
// the others rather than compared to itself: the script is rebuilt from its hex and must equal
// what PushTx.authenticator() emits today, the preimage is recomputed from the serialized
// transaction, the digest is recomputed from the preimage, and the whole spend is re-verified
// under mainnet consensus flags. A regenerated vector that no longer matches the library fails
// here rather than silently becoming the new expectation.

require('chai').should()
var bsv = require('../..')
var P = bsv.SmartContract.PushTx
var H = bsv.SmartContract.CovenantHelpers
var Hash = bsv.crypto.Hash
var V = require('../data/pushtx-authenticator-vector.json')
var VSEQ = require('../data/pushtx-authenticator-vector-seqgrind.json')
var PIN = require('../data/pushtx-gate-pin.json')

describe('OP_PUSH_TX published vector', function () {
  it('is the script this library emits today', function () {
    bsv.Script.fromHex(V.lockingScriptHex).toHex().should.equal(P.authenticator().toHex())
    V.lockingScriptBytes.should.equal(bsv.Script.fromHex(V.lockingScriptHex).toBuffer().length)
    V.sighashType.should.contain('0x41')
  })

  it('carries a preimage that the transaction itself reproduces', function () {
    var tx = new bsv.Transaction(V.spendTxHex)
    var lock = bsv.Script.fromHex(V.lockingScriptHex)
    H.rawPreimage(tx, 0, lock, V.inputSatoshis).toString('hex').should.equal(V.preimageHex)
    V.preimageBytes.should.equal(Buffer.from(V.preimageHex, 'hex').length)
    tx.nLockTime.should.equal(V.nLockTime, 'the grind nonce is part of the vector')
    tx.inputs[0].sequenceNumber.should.equal(V.nSequence)
  })

  it('carries the digest and the s-value condition that make the gate pass', function () {
    var pre = Buffer.from(V.preimageHex, 'hex')
    Hash.sha256sha256(pre).toString('hex').should.equal(V.hash256OfPreimage)
    ;(!!P.sFromPreimage(pre)).should.equal(true, 'the vector must satisfy the grind conditions')
    V.sFromPreimageAccepts.should.equal(true)
  })

  it('verifies under mainnet consensus flags, rebuilt from the JSON alone', function () {
    var tx = new bsv.Transaction(V.spendTxHex)
    var lock = bsv.Script.fromHex(V.lockingScriptHex)
    H.verify(tx.inputs[0].script, lock, { tx: tx, satoshis: V.inputSatoshis }).ok
      .should.equal(true)
    V.verifiesUnderMainnetFlags.should.equal(true)
  })

  // `pushtx-gate-pin.json` is the same gate as vector A, in a self-contained schema'd form for
  // an EXTERNAL implementation to vendor: it carries the locking script with its SHA-256 and
  // ASM, the spend, the preimage and digest, the grind record, the era requirements, the
  // pre-Genesis limits for reference, the interpreter limits in force when it was generated, and
  // — the part prose cannot carry — the one-byte-mutated preimage as an inline NEGATIVE CONTROL
  // with the error it must produce. A consumer can therefore run accept-genuine and
  // reject-mutated from the file alone, without constructing the mutation itself.
  //
  // It was generated against @smartledger/bsv@9.41.0 installed FROM THE REGISTRY rather than
  // from this working tree, so the pin is to the published package. These assertions check it
  // still describes the library, which is what stops a vendored copy drifting silently.
  describe('the vendorable gate pin', function () {
    it('describes the gate this library emits today', function () {
      PIN.schema.should.equal('smartledger-bsv/op-push-tx-gate-pin/1')
      PIN.lockingScriptHex.should.equal(P.authenticator().toHex())
      PIN.lockingScriptHex.should.equal(V.lockingScriptHex) // same gate as vector A
      PIN.lockingScriptBytes.should.equal(377)
      require('crypto').createHash('sha256').update(Buffer.from(PIN.lockingScriptHex, 'hex'))
        .digest('hex').should.equal(PIN.lockingScriptSha256)
    })

    it('carries a spend that verifies and a mutation that does not', function () {
      var lock = bsv.Script.fromHex(PIN.lockingScriptHex)
      var good = new bsv.Transaction(PIN.spendTxHex)
      H.rawPreimage(good, PIN.inputIndex, lock, PIN.inputSatoshis).toString('hex')
        .should.equal(PIN.preimageHex)
      Hash.sha256sha256(Buffer.from(PIN.preimageHex, 'hex')).toString('hex')
        .should.equal(PIN.hash256OfPreimage)
      H.verify(good.inputs[0].script, lock, { tx: good, satoshis: PIN.inputSatoshis }).ok
        .should.equal(PIN.mustVerify)

      var bad = new bsv.Transaction(PIN.negativeControl.spendTxHex)
      PIN.negativeControl.mustVerify.should.equal(false)
      H.verify(bad.inputs[0].script, lock, { tx: bad, satoshis: PIN.inputSatoshis }).ok
        .should.equal(false)
    })

    it('states the era requirements it was measured under', function () {
      PIN.eraRequirements.genesis.should.match(/REQUIRED/)
      PIN.eraRequirements.chronicle.should.match(/NOT required/)
      PIN.preGenesisLimitsForReference.maxOpsPerScript.should.equal(500)
      PIN.preGenesisLimitsForReference.maxScriptElementSize.should.equal(520)
    })
  })

  // The companion vector grinds the input SEQUENCE instead, because a covenant whose
  // nLockTime is load-bearing for an absolute time-lock cannot also use it as the grind nonce.
  // Both halves of the three-rule time-lock are visible in it: nLockTime is a real height, and
  // the sequence is non-final, which is what makes consensus enforce the locktime at all.
  describe('the sequence-ground companion', function () {
    it('shares the locking script and verifies with nLockTime pinned', function () {
      VSEQ.lockingScriptHex.should.equal(V.lockingScriptHex)
      VSEQ.grind.field.should.equal('sequence')
      VSEQ.nLockTime.should.equal(800000)
      VSEQ.nSequenceIsFinal.should.equal(false, 'a final sequence leaves nLockTime unenforced')
      var tx = new bsv.Transaction(VSEQ.spendTxHex)
      var lock = bsv.Script.fromHex(VSEQ.lockingScriptHex)
      tx.nLockTime.should.equal(VSEQ.nLockTime)
      tx.inputs[0].sequenceNumber.should.equal(VSEQ.nSequence)
      H.rawPreimage(tx, 0, lock, VSEQ.inputSatoshis).toString('hex').should.equal(VSEQ.preimageHex)
      ;(!!P.sFromPreimage(Buffer.from(VSEQ.preimageHex, 'hex'))).should.equal(true)
      H.verify(tx.inputs[0].script, lock, { tx: tx, satoshis: VSEQ.inputSatoshis }).ok
        .should.equal(true)
    })
  })

  it('fails if the preimage is mutated by one byte, which is what makes it a vector', function () {
    var tx = new bsv.Transaction(V.spendTxHex)
    var lock = bsv.Script.fromHex(V.lockingScriptHex)
    var pre = Buffer.from(V.preimageHex, 'hex')
    pre[0] ^= 0x01
    tx.inputs[0].setScript(new bsv.Script().add(pre))
    H.verify(tx.inputs[0].script, lock, { tx: tx, satoshis: V.inputSatoshis }).ok
      .should.equal(false)
  })
})
