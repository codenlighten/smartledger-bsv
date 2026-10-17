'use strict'

/* global describe, it */

// The Token covenant's security argument, and the guard that makes it true.
//
// The argument has always been: authorization is an ECDSA signature over THIS spend, so
// SIGHASH_ALL's hashOutputs commits to the recreated output, and a watcher who alters the
// destination invalidates the proof. (That is why authorization is a signature and not a
// revealed secret -- the hash-lock design was front-runnable.)
//
// The covenant never checked the mode. Its 0x41 assertion applies to the OP_PUSH_TX PREIMAGE;
// the authorization signature is a separate signature and OP_CHECKSIG takes its mode from the
// flag byte the SIGNER chose. An authorization signed SIGHASH_NONE commits to no outputs, and
// is therefore reusable: keeping the input, version, nSequence and the victim's nLockTime (every
// mode commits to nLockTime), an observer grinds its OWN destination keys -- each key is a
// different owner id, hence a different output, hence a different preimage -- until the
// OP_PUSH_TX s-value condition holds again, then rebroadcasts with the victim's signature
// unchanged.
//
// This file keeps both halves: the theft as a POSITIVE control on the unpinned default, so the
// guard cannot go vacuous, and its refusal under { pinSighash: true }.
//
// The library's own unlock path was never exposed: Authorizers.*.unlockArgs signs with no
// override. The exposure is a hand-built unlocking script, which is public, documented usage.

var should = require('chai').should()
var bsv = require('../..')
var SC = bsv.SmartContract
var Token = SC.Token
var A = SC.Authorizers
var H = SC.CovenantHelpers
var P = SC.PushTx
var Sig = bsv.crypto.Signature
var Script = bsv.Script
var Transaction = bsv.Transaction
var PrivateKey = bsv.PrivateKey

var SATS = 100000
var FEE = 500
var ALL = Sig.SIGHASH_ALL | Sig.SIGHASH_FORKID
var NONE = Sig.SIGHASH_NONE | Sig.SIGHASH_FORKID

function world (auth) {
  var alice = PrivateKey.fromRandom()
  var bob = PrivateKey.fromRandom()
  var lock = Token.ownershipToken(FEE, auth.commit(alice), auth)
  return {
    auth: auth,
    alice: alice,
    lock: lock,
    bobHash: auth.commit(bob),
    spendTo: function (ownerHash) {
      return H.fundAndSpend(lock, SATS, {
        outputs: [new Transaction.Output({
          script: Token.ownershipToken(FEE, ownerHash, auth), satoshis: SATS - FEE
        })]
      }).spend
    }
  }
}

// A hand-built unlock, which is what a consumer writing their own wallet does.
function handBuilt (w, spend, ownerHash, sighashType) {
  P.grind(spend, 0, w.lock, SATS)
  var sig = H.signInput(spend, w.alice, 0, w.lock, SATS, sighashType)
  var unlock = new Script().add(Buffer.from(ownerHash)).add(sig)
    .add(w.alice.toPublicKey().toBuffer())
    .add(Buffer.from(H.rawPreimage(spend, 0, w.lock, SATS)))
  spend.inputs[0].setScript(unlock)
  return sig
}

function verify (w, spend) {
  return H.verify(spend.inputs[0].script, w.lock, { tx: spend, satoshis: SATS }).ok
}

// Reuse `victimSig` to redirect the token to a key the attacker controls.
function tryRedirect (w, victim, victimSig, maxKeys) {
  for (var i = 0; i < maxKeys; i++) {
    var thiefHash = w.auth.commit(PrivateKey.fromRandom())
    var attack = w.spendTo(thiefHash)
    attack.nLockTime = victim.nLockTime // committed by every sighash mode
    attack.inputs[0].sequenceNumber = victim.inputs[0].sequenceNumber
    attack.version = victim.version
    var pre = H.rawPreimage(attack, 0, w.lock, SATS)
    if (!P.sFromPreimage(pre)) continue // OP_PUSH_TX core would reject this candidate
    attack.inputs[0].setScript(new Script().add(Buffer.from(thiefHash)).add(victimSig)
      .add(w.alice.toPublicKey().toBuffer()).add(Buffer.from(pre)))
    if (verify(w, attack)) return { keys: i + 1, to: thiefHash.toString('hex') }
  }
  return null
}

describe('Token authorization is only sound when its signature is SIGHASH_ALL', function () {
  this.timeout(120000)

  describe('the unpinned default (9.x, deprecated in 9.40.0)', function () {
    it('accepts an authorization that commits to no outputs', function () {
      var w = world(A.singleKey())
      var spend = w.spendTo(w.bobHash)
      handBuilt(w, spend, w.bobHash, NONE)
      verify(w, spend).should.equal(true, 'a SIGHASH_NONE authorization should still verify here')
    })

    // The positive control. Without it, the pinned test below would pass even if the attack
    // were impossible for some unrelated reason, and the guard would be guarding nothing.
    it('lets an observer redirect the token by reusing that signature', function () {
      var w = world(A.singleKey())
      var victim = w.spendTo(w.bobHash)
      var victimSig = handBuilt(w, victim, w.bobHash, NONE)
      verify(w, victim).should.equal(true)
      var stolen = tryRedirect(w, victim, victimSig, 4000)
      should.exist(stolen, 'the attack must succeed here, or the pinned test below guards nothing')
    })
  })

  // The claim that bounds the severity of all of the above: the library's own unlock path
  // cannot produce a non-SIGHASH_ALL authorization, because unlockArgs passes no override. That
  // was measured across every published version carrying signature-based Token authorization
  // (5.5.0 through 9.39.1, on registry artifacts: no call site in the whole shipped lib/ ever
  // hands signInput a 6th argument except ordinals/ordlock.js, and the default is 0x41). This
  // asserts the current-code half, so adding an override later fires here rather than quietly
  // widening the exposure.
  describe('the library\'s own unlock path cannot produce the vulnerable shape', function () {
    it('signs the authorization with SIGHASH_ALL | FORKID and offers no override', function () {
      var w = world(A.singleKey())
      var spend = w.spendTo(w.bobHash)
      P.grind(spend, 0, w.lock, SATS)
      var args = A.singleKey().unlockArgs(spend, 0, w.lock, SATS, w.alice)
      // args[0] is the DER signature with its flag byte appended
      var sig = args[0]
      sig[sig.length - 1].should.equal(ALL, 'unlockArgs must sign 0x41')
      // and the same through the public helper, which is what a consumer actually calls
      var viaApi = Token.unlockTransfer(w.alice, w.bobHash, spend, SATS, w.lock)
      var chunks = viaApi.chunks.filter(function (c) { return c.buf })
      var der = chunks[1].buf // <newOwnerHash> <sig> <pubkey> <preimage>
      der[der.length - 1].should.equal(ALL, 'unlockTransfer must sign 0x41')
    })
  })

  describe('{ pinSighash: true }', function () {
    var pinned = A.singleKey({ pinSighash: true })

    it('refuses an authorization signed SIGHASH_NONE, so there is nothing to reuse', function () {
      var w = world(pinned)
      var spend = w.spendTo(w.bobHash)
      handBuilt(w, spend, w.bobHash, NONE)
      verify(w, spend).should.equal(false)
    })

    it('accepts SIGHASH_ALL, by hand and through the library path', function () {
      var w = world(pinned)
      var byHand = w.spendTo(w.bobHash)
      handBuilt(w, byHand, w.bobHash, ALL)
      verify(w, byHand).should.equal(true)

      var viaApi = w.spendTo(w.bobHash)
      viaApi.inputs[0].setScript(
        Token.unlockTransfer(w.alice, w.bobHash, viaApi, SATS, w.lock, { auth: pinned }))
      verify(w, viaApi).should.equal(true)
    })

    it('is visible in the authorizer and changes the locking script', function () {
      pinned.pinSighash.should.equal(true)
      pinned.name.should.contain('pinned')
      A.singleKey().pinSighash.should.equal(false)
      // the pin is in the script, which is why the default cannot flip inside 9.x
      var owner = A.singleKey().commit(PrivateKey.fromRandom())
      Token.ownershipToken(FEE, owner, pinned).toBuffer().length
        .should.be.above(Token.ownershipToken(FEE, owner, A.singleKey()).toBuffer().length)
    })
  })

  describe('an already-issued lineage cannot be migrated to the pinned covenant', function () {
    // This is the consequence that decides what the fix can and cannot achieve, so it is
    // measured rather than reasoned: the covenant rebuilds its successor's scriptCode from the
    // AUTHENTICATED chunk, splicing only the 20-byte owner, so the successor must carry the
    // same code. A lineage cannot change its own rules. The pin therefore protects newly
    // created tokens only; for tokens already issued the remedy is operational -- sign
    // SIGHASH_ALL, which this library's own unlock path always does.
    it('refuses a successor that carries the pinned code, and accepts the same code', function () {
      var unpinned = A.singleKey()
      var w = world(unpinned)
      var pinned = A.singleKey({ pinSighash: true })

      function transferTo (nextLock) {
        var spend = H.fundAndSpend(w.lock, SATS, {
          outputs: [new Transaction.Output({ script: nextLock, satoshis: SATS - FEE })]
        }).spend
        spend.inputs[0].setScript(
          Token.unlockTransfer(w.alice, w.bobHash, spend, SATS, w.lock, { auth: unpinned }))
        return verify(w, spend)
      }

      transferTo(Token.ownershipToken(FEE, w.bobHash, unpinned))
        .should.equal(true, 'the ordinary transfer must keep working')
      transferTo(Token.ownershipToken(FEE, w.bobHash, pinned))
        .should.equal(false, 'a lineage must not be able to change its own rules')
    })
  })

  describe('multisig pins every signature, not just the top one', function () {
    // The unlock shape is [newOwnerHash, dummy, sig_m..sig_1, redeem, preimage], and the
    // authorizer's own unlockArgs always signs SIGHASH_ALL -- so injecting a NONE signature
    // means rebuilding the canonical redeem script here. That reconstruction is PROVED against
    // the authorizer's own commitment rather than assumed, because a malformed redeem would
    // make the negative test below pass for the wrong reason.
    function redeemBytes (m, keys) {
      var s2 = new Script().add(bsv.Opcode['OP_' + m])
      keys.forEach(function (k) { s2.add(k.toPublicKey().toBuffer()) })
      return s2.add(bsv.Opcode['OP_' + keys.length]).add(bsv.Opcode.OP_CHECKMULTISIG).toBuffer()
    }

    function run (auth, modes) {
      var keys = [PrivateKey.fromRandom(), PrivateKey.fromRandom(), PrivateKey.fromRandom()]
      var redeem = redeemBytes(2, keys)
      // the reconstruction is correct iff it hashes to what the authorizer commits to
      bsv.crypto.Hash.sha256ripemd160(redeem).toString('hex')
        .should.equal(auth.commit(keys).toString('hex'), 'redeem reconstruction is wrong')
      var owner = auth.commit(keys)
      var lock = Token.ownershipToken(FEE, owner, auth)
      var spend = H.fundAndSpend(lock, SATS, {
        outputs: [new Transaction.Output({
          script: Token.ownershipToken(FEE, owner, auth), satoshis: SATS - FEE
        })]
      }).spend
      P.grind(spend, 0, lock, SATS)
      var pre = H.rawPreimage(spend, 0, lock, SATS)
      // emit() meets pk1..pkn, so the m signatures are pushed in descending key index
      var us = new Script().add(Buffer.from(owner)).add(bsv.Opcode.OP_0)
      us.add(H.signInput(spend, keys[1], 0, lock, SATS, modes[1]))
      us.add(H.signInput(spend, keys[0], 0, lock, SATS, modes[0]))
      us.add(Buffer.from(redeem)).add(Buffer.from(pre))
      spend.inputs[0].setScript(us)
      return H.verify(spend.inputs[0].script, lock, { tx: spend, satoshis: SATS }).ok
    }

    var pinned = A.multisig(2, 3, { pinSighash: true })

    it('accepts 2-of-3 when both signatures are SIGHASH_ALL', function () {
      run(pinned, [ALL, ALL]).should.equal(true)
    })

    it('refuses when either of the two signatures is not SIGHASH_ALL', function () {
      run(pinned, [NONE, ALL]).should.equal(false, 'the deeper signature must be checked too')
      run(pinned, [ALL, NONE]).should.equal(false)
      run(pinned, [NONE, NONE]).should.equal(false)
    })

    it('and the unpinned authorizer accepts all of those, which is the defect', function () {
      var unpinned = A.multisig(2, 3)
      run(unpinned, [ALL, ALL]).should.equal(true)
      run(unpinned, [NONE, ALL]).should.equal(true)
      run(unpinned, [ALL, NONE]).should.equal(true)
    })
  })
})
