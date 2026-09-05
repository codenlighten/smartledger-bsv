'use strict'

/* global describe, it */
var should = require('chai').should()
var bsv = require('../..')
var BN = bsv.crypto.BN
var Interpreter = bsv.Script.Interpreter
var Script = bsv.Script
var Opcode = bsv.Opcode
var Transaction = bsv.Transaction

// The stack limits were the last of the pre-Genesis caps still applied as a
// literal, and they diverged from the node in BOTH directions.
//
// Pre-Genesis the node caps the two stacks at 1000 elements between them, and
// checks that cap after EVERY opcode. This interpreter checked it once, when the
// script had finished — so a script that piled up 1,001 elements and dropped
// back to one before the end passed here and is rejected by the network. A false
// accept, in the direction that costs money.
//
// Post-Genesis the cap is gone: the node replaced the element COUNT with a bound
// on the memory the stacks occupy. Applying 1000 unconditionally rejected
// post-Genesis scripts the network accepts — which is what a 256-step
// elliptic-curve ladder looks like, since it needs one witness value per step.

function spend (unlock, lock, flags) {
  var lockingScript = lock
  var tx = new Transaction()
  tx.addInput(new Transaction.Input({
    prevTxId: Buffer.from('0'.repeat(63) + '1', 'hex'),
    outputIndex: 0,
    script: new Script(),
    sequenceNumber: 0xffffffff
  }), lockingScript, 1000)
  tx.to(bsv.PrivateKey.fromRandom().toAddress(), 1000)
  tx.inputs[0].setScript(unlock)
  var interp = new Interpreter()
  var ok = interp.verify(unlock, lockingScript, tx, 0, flags, new BN(1000))
  return { ok: ok, err: interp.errstr }
}

/** A script that leaves `n` elements on the stack, the top one true.
 *  Pushes only: OP_1 is not a counted opcode, so this does not run into the
 *  pre-Genesis 500-opcode cap on its way to the stack cap. */
function pushOnly (n) {
  var s = new Script()
  for (var i = 0; i < n; i++) s.add(Opcode.OP_1)
  return s
}

var PRE = Interpreter.SCRIPT_VERIFY_P2SH | Interpreter.SCRIPT_VERIFY_STRICTENC
var POST = PRE | Interpreter.SCRIPT_UTXO_AFTER_GENESIS

describe('Interpreter stack limits', function () {
  describe('the cap is era-derived', function () {
    it('is 1000 elements before Genesis', function () {
      var i = new Interpreter()
      i.flags = PRE
      i.maxStackSize().should.equal(Interpreter.MAX_STACK_SIZE)
      Interpreter.MAX_STACK_SIZE.should.equal(1000)
    })

    it('is removed after Genesis, and nothing is silently put in its place', function () {
      var i = new Interpreter()
      i.flags = POST
      i.maxStackSize().should.equal(Interpreter.UNLIMITED)
      // Post-Genesis CONSENSUS does not bound stack memory either. The node's
      // 100 MB is -maxstackmemoryusagepolicy, a RELAY setting, and applying a
      // relay setting by default would refuse scripts the network accepts —
      // the same mistake as carrying the 1000-element cap past Genesis.
      i.maxStackMemoryUsage().should.equal(Interpreter.UNLIMITED)
      Interpreter.MAX_STACK_MEMORY_USAGE_AFTER_GENESIS.should.equal(Interpreter.UNLIMITED)
      Interpreter.STACK_MEMORY_USAGE_POLICY.should.equal(100 * 1024 * 1024)
    })

    it('does not consult the memory bound before Genesis', function () {
      var i = new Interpreter()
      i.flags = PRE
      i.maxStackMemoryUsage().should.equal(Interpreter.UNLIMITED)
    })
  })

  describe('before Genesis', function () {
    it('accepts 999 elements', function () {
      spend(pushOnly(999), new Script().add(Opcode.OP_1), PRE).ok.should.equal(true)
    })

    it('refuses 1001', function () {
      var r = spend(pushOnly(1001), new Script().add(Opcode.OP_1), PRE)
      r.ok.should.equal(false)
      r.err.should.equal('SCRIPT_ERR_STACK_SIZE')
    })

    // The case an end-of-script check cannot see, and the reason the check moved
    // into the loop. 1001 pushes (pushes are not counted opcodes) and 500
    // OP_2DROPs, which clear two apiece and land exactly on the pre-Genesis
    // 500-opcode budget — so nothing else stops it first. The stack peaks at
    // 1001 and ends at 1, and the node rejects it.
    //
    // Written with 1001 OP_DROPs instead it would trip SCRIPT_ERR_OP_COUNT and
    // pass this assertion for the wrong reason.
    it('refuses a script that exceeds the cap and then drops back', function () {
      var lock = new Script()
      for (var i = 0; i < 1001; i++) lock.add(Opcode.OP_1)
      for (var j = 0; j < 500; j++) lock.add(Opcode.OP_2DROP)
      var r = spend(new Script(), lock, PRE)
      r.ok.should.equal(false)
      r.err.should.equal('SCRIPT_ERR_STACK_SIZE')
    })

    // 300 moves, so the pre-Genesis 500-opcode cap is not what stops it.
    it('counts the altstack toward the same cap', function () {
      var lock = new Script()
      for (var i = 0; i < 300; i++) lock.add(Opcode.OP_1).add(Opcode.OP_TOALTSTACK)
      for (var j = 0; j < 702; j++) lock.add(Opcode.OP_1)
      var r = spend(new Script(), lock, PRE)
      r.ok.should.equal(false)
      r.err.should.equal('SCRIPT_ERR_STACK_SIZE')
    })
  })

  describe('after Genesis', function () {
    it('accepts 1001 elements, which the node does', function () {
      spend(pushOnly(1001), new Script().add(Opcode.OP_1), POST).ok.should.equal(true)
    })

    it('accepts far more than the old cap', function () {
      spend(pushOnly(5000), new Script().add(Opcode.OP_1), POST).ok.should.equal(true)
    })

    it('bounds the memory the stacks occupy once a caller asks it to', function () {
      var saved = Interpreter.MAX_STACK_MEMORY_USAGE_AFTER_GENESIS
      try {
        // A ceiling low enough that a few dozen elements exceed it, to exercise
        // the bound without allocating 100 MB in a unit test.
        Interpreter.MAX_STACK_MEMORY_USAGE_AFTER_GENESIS = 500
        var r = spend(pushOnly(100), new Script().add(Opcode.OP_1), POST)
        r.ok.should.equal(false)
        r.err.should.equal('SCRIPT_ERR_STACK_SIZE')
      } finally {
        Interpreter.MAX_STACK_MEMORY_USAGE_AFTER_GENESIS = saved
      }
    })

    // The point of the default: a script that would breach the node's RELAY
    // ceiling is still valid consensus, so verify() must not refuse it. Asserted
    // through the accounting rather than by allocating 100 MB in a unit test.
    it('does not apply the relay policy ceiling unless asked', function () {
      var i = new Interpreter()
      i.flags = POST
      i.stack = [Buffer.alloc(8), Buffer.alloc(8)]
      i.altstack = []
      var overPolicy = Interpreter.STACK_MEMORY_USAGE_POLICY + 1
      i.stackMemoryUsage.should.be.a('function')
      i.maxStackMemoryUsage().should.equal(Interpreter.UNLIMITED)
      overPolicy.should.be.below(i.maxStackMemoryUsage())
      should.equal(i.checkStackLimits(), null)
    })

    it('applies it when a caller opts in', function () {
      var saved = Interpreter.MAX_STACK_MEMORY_USAGE_AFTER_GENESIS
      try {
        Interpreter.MAX_STACK_MEMORY_USAGE_AFTER_GENESIS = Interpreter.STACK_MEMORY_USAGE_POLICY
        var i = new Interpreter()
        i.flags = POST
        i.maxStackMemoryUsage().should.equal(100 * 1024 * 1024)
      } finally {
        Interpreter.MAX_STACK_MEMORY_USAGE_AFTER_GENESIS = saved
      }
    })

    it('charges each element its container overhead, not only its bytes', function () {
      var i = new Interpreter()
      i.flags = POST
      i.stack = [Buffer.alloc(10), Buffer.alloc(20)]
      i.altstack = [Buffer.alloc(0)]
      i.stackMemoryUsage().should.equal(30 + 3 * Interpreter.STACK_ELEMENT_OVERHEAD)
    })
  })
})
