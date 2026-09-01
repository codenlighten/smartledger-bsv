'use strict'

/* global describe, it, before, after */
require('chai').should()
var bsv = require('../..')
var SC = bsv.SmartContract
var Script = bsv.Script
var PrivateKey = bsv.PrivateKey
var Opcode = bsv.Opcode
var H = SC.CovenantHelpers
var verify = H.verify

var SATS = 100000

describe('SmartContract covenant DSL + debugger (v4.5.0)', function () {
  this.timeout(20000)

  var alice = PrivateKey.fromRandom()
  var attacker = PrivateKey.fromRandom()
  function spendWith (lock, outputs) {
    return H.fundAndSpend(lock, SATS, { outputs: outputs }).spend
  }

  describe('policy() DSL', function () {
    it('payTo: compiles a covenant that pins the output and rejects redirects', function () {
      var c = SC.policy().payTo(alice.toAddress(), SATS - 500).compile()
      var spend = spendWith(c.lock, c.outputs)
      spend.inputs[0].setScript(c.unlock(spend, SATS))
      verify(spend.inputs[0].script, c.lock, { tx: spend, satoshis: SATS }).ok.should.equal(true)

      spend = spendWith(c.lock, [H.p2pkhOutput(attacker, SATS - 500)])
      spend.inputs[0].setScript(c.unlock(spend, SATS))
      verify(spend.inputs[0].script, c.lock, { tx: spend, satoshis: SATS }).ok.should.equal(false)
    })

    it('multi-output: pins the exact ordered set and rejects a tweaked amount', function () {
      var c = SC.policy().payTo(alice.toAddress(), 60000).payTo(attacker.toAddress(), 39500).compile()
      var spend = spendWith(c.lock, c.outputs)
      spend.inputs[0].setScript(c.unlock(spend, SATS))
      verify(spend.inputs[0].script, c.lock, { tx: spend, satoshis: SATS }).ok.should.equal(true)

      var bad = spendWith(c.lock, [H.p2pkhOutput(alice, 60001), H.p2pkhOutput(attacker, 39499)])
      bad.inputs[0].setScript(c.unlock(bad, SATS))
      verify(bad.inputs[0].script, c.lock, { tx: bad, satoshis: SATS }).ok.should.equal(false)
    })

    it('payTo AND lockUntil compose; rejects an early locktime', function () {
      var height = 800000
      var c = SC.policy().payTo(alice.toAddress(), SATS - 500).lockUntil(height).compile()
      var spend = spendWith(c.lock, c.outputs)
      spend.inputs[0].setScript(c.unlock(spend, SATS))
      verify(spend.inputs[0].script, c.lock, { tx: spend, satoshis: SATS }).ok.should.equal(true)

      spend = spendWith(c.lock, c.outputs)
      spend.nLockTime = height - 1
      spend.inputs[0].sequenceNumber = 0xfffffffe
      spend.inputs[0].setScript(new Script().add(SC.PushTx.grind(spend, 0, c.lock, SATS).preimage))
      verify(spend.inputs[0].script, c.lock, { tx: spend, satoshis: SATS }).ok.should.equal(false)
    })

    // A time lock is three consensus rules. `nLockTime >= floor` is one of them,
    // and on its own it is not a time lock at all — the other two are in the
    // node's CheckLockTime and each has a spend that walks straight through.
    describe('lockUntil enforces the whole of CheckLockTime', function () {
      var HEIGHT = 900000
      var PAST_TIMESTAMP = 1500000000 // 14 Jul 2017, nine years gone
      var T2040 = 2208988800 // 1 Jan 2040 — nLockTime's high bit is set

      // Grind from whatever nLockTime the caller set, rather than from the floor,
      // so a test can put a value the honest unlock() would never choose.
      function spendAs (c, seq, nLockTime) {
        var tx = spendWith(c.lock, c.outputs)
        tx.inputs[0].sequenceNumber = seq
        for (var t = 0; t < 200000; t++) {
          tx.nLockTime = nLockTime + t
          var pre = H.rawPreimage(tx, 0, c.lock, SATS)
          if (SC.PushTx.sFromPreimage(pre)) {
            tx.inputs[0].setScript(new Script().add(pre))
            return verify(tx.inputs[0].script, c.lock, { tx: tx, satoshis: SATS }).ok
          }
        }
        throw new Error('grind failed')
      }

      it('refuses a FINAL sequence, which would void nLockTime outright', function () {
        var c = SC.policy().payTo(alice.toAddress(), SATS - 500).lockUntil(HEIGHT).compile()
        spendAs(c, 0xfffffffe, HEIGHT).should.equal(true)
        // IsFinalTx() ignores nLockTime when every input is 0xffffffff, so this
        // transaction is minable in the next block however large its locktime.
        spendAs(c, 0xffffffff, HEIGHT).should.equal(false)
      })

      // The same attack against the guard-less script, asserted to SUCCEED. If
      // anyone deletes the nSequence check, this test starts failing.
      it('and that spend does succeed once the nSequence check is removed', function () {
        var c = SC.policy().payTo(alice.toAddress(), SATS - 500).lockUntil(HEIGHT).compile()
        var unguarded = new Script()
        c.lock.chunks.forEach(function (chunk, i) {
          // Drop the six-opcode sequence guard: DUP 44 RIGHT 4 LEFT <ffffffff> EQUAL NOT VERIFY
          if (i >= guardStart(c.lock) && i < guardStart(c.lock) + 9) return
          unguarded.chunks.push(chunk)
        })
        var tx = spendWith(unguarded, c.outputs)
        tx.inputs[0].sequenceNumber = 0xffffffff
        for (var t = 0; t < 200000; t++) {
          tx.nLockTime = HEIGHT + t
          var pre = H.rawPreimage(tx, 0, unguarded, SATS)
          if (SC.PushTx.sFromPreimage(pre)) break
        }
        tx.inputs[0].setScript(new Script().add(pre))
        verify(tx.inputs[0].script, unguarded, { tx: tx, satoshis: SATS })
          .ok.should.equal(true, 'the guard is what stops this, not anything else in the script')
      })

      function guardStart (lock) {
        // The guard opens at the first OP_DUP after the OP_PUSH_TX authentication,
        // i.e. the first chunk whose opcode is OP_DUP followed by a push of 44.
        for (var i = 0; i < lock.chunks.length - 1; i++) {
          if (lock.chunks[i].opcodenum === Opcode.OP_DUP && lock.chunks[i + 1].buf &&
              lock.chunks[i + 1].buf.length === 1 && lock.chunks[i + 1].buf[0] === 44) {
            return i
          }
        }
        throw new Error('sequence guard not found in the compiled lock')
      }

      it('refuses a past TIMESTAMP against a future HEIGHT floor', function () {
        var c = SC.policy().payTo(alice.toAddress(), SATS - 500).lockUntil(HEIGHT).compile()
        // 1500000000 >= 900000 is true as arithmetic. As consensus it is a unix
        // time nine years past, so the transaction is final today.
        spendAs(c, 0xfffffffe, PAST_TIMESTAMP).should.equal(false)
      })

      // nLockTime is unsigned and OP_BIN2NUM reads signed, so from 19 Jan 2038 the
      // extracted value used to come back as negative zero and no spend could ever
      // clear the floor. Sign-padding fixes it, and the padded push is only legal
      // because OP_BIN2NUM now honours the era's script-number width.
      it('works on both sides of 19 Jan 2038', function () {
        var c = SC.policy().payTo(alice.toAddress(), SATS - 500).lockUntil(T2040).compile()
        spendAs(c, 0xfffffffe, T2040).should.equal(true)
        spendAs(c, 0xfffffffe, T2040 - 86400 * 400).should.equal(false)
        spendAs(c, 0xffffffff, T2040).should.equal(false)
      })

      it('rejects a floor of 0, which consensus reads as "no lock"', function () {
        ;[0, -1, 1.5, 0x100000000].forEach(function (bad) {
          (function () { SC.policy().lockUntil(bad) }).should.throw(/lockUntil/)
        })
      })

      it('names the unit and the sequence requirement in describe()', function () {
        SC.policy().lockUntil(HEIGHT).describe()
          .should.match(/nLockTime >= 900000 as a block height.*non-final/)
        SC.policy().lockUntil(T2040).describe()
          .should.match(/nLockTime >= 2208988800 as a unix time/)
      })
    })

    it('exposes .perpetual()/.token() shortcuts', function () {
      SC.policy.perpetual(500).toBuffer().length.should.be.above(252)
      var h = bsv.crypto.Hash.sha256ripemd160(bsv.PrivateKey.fromRandom().toPublicKey().toBuffer())
      SC.policy.token(500, h).toBuffer().length.should.be.above(252)
    })

    it('throws on an empty policy', function () {
      (function () { SC.policy().compile() }).should.throw(/empty policy/)
    })
  })

  describe('trace() debugger', function () {
    it('traces a hash-lock and agrees with the interpreter (true and false)', function () {
      var secret = Buffer.from('hello')
      var lock = new Script().add(Opcode.OP_SHA256).add(bsv.crypto.Hash.sha256(secret)).add(Opcode.OP_EQUAL)
      var r = SC.trace(new Script().add(secret), lock, { satoshis: 1000 })
      r.ok.should.equal(true)
      r.steps[r.steps.length - 1].stack.join().should.equal('01')
      SC.trace(new Script().add(Buffer.from('nope')), lock, { satoshis: 1000 }).ok.should.equal(false)
    })

    it('traces an OP_PUSH_TX covenant ending in OP_CHECKSIG -> 01', function () {
      var lock = SC.PushTx.authenticator()
      var spend = H.fundAndSpend(lock, SATS, { outputs: [H.p2pkhOutput(alice, SATS - 500)] }).spend
      spend.inputs[0].setScript(new Script().add(SC.PushTx.grind(spend, 0, lock, SATS).preimage))
      var r = SC.trace(spend.inputs[0].script, lock, { tx: spend, satoshis: SATS })
      r.ok.should.equal(true)
      r.steps[r.steps.length - 1].op.should.equal('OP_CHECKSIG')
      SC.Debugger.format(r).should.contain('VALID')
    })
  })
})
