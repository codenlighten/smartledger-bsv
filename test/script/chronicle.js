'use strict'

/* global describe, it */

// The BSV Chronicle script surface: OP_2MUL/OP_2DIV restored, OP_VER/OP_VERIF/
// OP_VERNOTIF given meaning, and SIGHASH_CHRONICLE selecting the Original
// Transaction Digest Algorithm. All of it sits behind SCRIPT_ENABLE_CHRONICLE.
//
// The default (flag off) behaviour is pinned just as carefully as the enabled
// behaviour. Enabling an opcode by accident is a consensus change, and the
// pre-Chronicle rules are what every existing signature and script was written
// against.

require('chai').should()
var bsv = require('../..')
var Interpreter = bsv.Script.Interpreter
var Opcode = bsv.Opcode
var Script = bsv.Script
var BN = bsv.crypto.BN
var Signature = bsv.crypto.Signature

var CHRONICLE = Interpreter.SCRIPT_ENABLE_CHRONICLE

/** Evaluate `build`ed script against a tx of `version`, returning the outcome. */
function run (build, opts) {
  opts = opts || {}
  var tx = new bsv.Transaction()
  if (opts.version != null) tx.version = opts.version
  var script = new Script()
  build(script)
  var interp = new Interpreter()
  var verified = interp.verify(
    new Script(), script, tx, 0, opts.flags == null ? CHRONICLE : opts.flags, new BN(0)
  )
  return {
    verified: verified,
    errstr: interp.errstr || '',
    stack: (interp.stack || []).map(function (b) { return BN.fromScriptNumBuffer(b).toString() })
  }
}

describe('Chronicle script surface', function () {
  describe('SCRIPT_ENABLE_CHRONICLE flag', function () {
    it('is a distinct bit that does not collide with the other opcode flags', function () {
      CHRONICLE.should.be.a('number')
      ;[
        Interpreter.SCRIPT_ENABLE_MONOLITH_OPCODES,
        Interpreter.SCRIPT_ENABLE_MAGNETIC_OPCODES,
        Interpreter.SCRIPT_ENABLE_SIGHASH_FORKID,
        Interpreter.SCRIPT_ENABLE_REPLAY_PROTECTION
      ].forEach(function (other) {
        (CHRONICLE & other).should.equal(0)
      })
    })

    it('is off by default, so none of this changes existing evaluation', function () {
      (Interpreter.DEFAULT_FLAGS & CHRONICLE).should.equal(0)
    })
  })

  describe('OP_2MUL / OP_2DIV', function () {
    it('stay DISABLED without the flag, even in an unexecuted branch', function () {
      // "Disabled" is stronger than "unimplemented": a disabled opcode fails the
      // script even where it is never executed. That is why the gate lives in
      // isOpcodeDisabled rather than in the evaluation switch — losing this
      // distinction would silently loosen consensus.
      var r = run(function (s) {
        s.add(Opcode.OP_0).add(Opcode.OP_IF).add(Opcode.OP_2MUL).add(Opcode.OP_ENDIF).add(Opcode.OP_1)
      }, { flags: 0 })
      r.verified.should.equal(false)
      r.errstr.should.match(/DISABLED_OPCODE/)
    })

    it('are usable in an unexecuted branch once enabled', function () {
      var r = run(function (s) {
        s.add(Opcode.OP_0).add(Opcode.OP_IF).add(Opcode.OP_2MUL).add(Opcode.OP_ENDIF).add(Opcode.OP_1)
      })
      r.verified.should.equal(true)
    })

    it('OP_2MUL doubles, over positive, negative and zero', function () {
      ;[[0, '0'], [1, '2'], [7, '14'], [-3, '-6'], [-1, '-2']].forEach(function (t) {
        var r = run(function (s) { s.add(new BN(t[0]).toScriptNumBuffer()).add(Opcode.OP_2MUL) })
        r.stack[r.stack.length - 1].should.equal(t[1])
      })
    })

    it('OP_2DIV truncates toward zero, so it agrees with OP_DIV by 2', function () {
      // -5 OP_2DIV is -2, not -3. A shift would give -3; bn.js `shrn` also asserts
      // on negatives. This is the case where a rounding change would hide.
      ;[0, 1, 5, -5, 7, -7, -1, 1000, -1000].forEach(function (v) {
        var viaOp = run(function (s) { s.add(new BN(v).toScriptNumBuffer()).add(Opcode.OP_2DIV) })
        var viaDiv = run(function (s) {
          s.add(new BN(v).toScriptNumBuffer()).add(new BN(2).toScriptNumBuffer()).add(Opcode.OP_DIV)
        })
        viaOp.stack[viaOp.stack.length - 1].should.equal(viaDiv.stack[viaDiv.stack.length - 1])
      })
    })
  })

  describe('OP_VER', function () {
    it('is BAD_OPCODE without the flag', function () {
      var r = run(function (s) { s.add(Opcode.OP_VER) }, { flags: 0 })
      r.verified.should.equal(false)
      r.errstr.should.match(/BAD_OPCODE/)
    })

    it('pushes the executing transaction version', function () {
      ;[1, 2, 10].forEach(function (v) {
        var r = run(function (s) { s.add(Opcode.OP_VER) }, { version: v })
        r.stack[r.stack.length - 1].should.equal(String(v))
      })
    })
  })

  describe('OP_VERIF / OP_VERNOTIF', function () {
    it('without the flag, errors only in an EXECUTED branch', function () {
      // Core treats OP_VERIF as illegal everywhere, including unexecuted
      // branches — a rule it applies to no other opcode. BSV dropped that at
      // Genesis, and the node is explicit:
      //
      //   if(!utxo_after_chronicle) {
      //     if(utxo_after_genesis && !fExec) break;
      //     else return SCRIPT_ERR_BAD_OPCODE;
      //   }
      //
      // Asserting BAD_OPCODE here made this library reject scripts the network
      // accepts.
      var unexecuted = run(function (s) {
        s.add(Opcode.OP_0).add(Opcode.OP_IF).add(Opcode.OP_VERIF).add(Opcode.OP_ENDIF).add(Opcode.OP_1)
      }, { flags: 0 })
      unexecuted.verified.should.equal(true)

      var executed = run(function (s) {
        s.add(Opcode.OP_1).add(Opcode.OP_VERIF).add(Opcode.OP_ENDIF)
      }, { flags: 0 })
      executed.verified.should.equal(false)
      executed.errstr.should.match(/BAD_OPCODE/)
    })

    // The comparison is BYTE-WISE against the four little-endian version
    // bytes, not numeric:
    //
    //   if(vch.size() == 4) { to_le(checker.Version(), val.data());
    //                         fValue = std::ranges::equal(val, vch); }
    //
    // So a 1-byte script number never matches, however equal it looks
    // numerically, and the idiomatic form is `OP_VER OP_VERIF`.
    var LE = function (v) {
      var b = Buffer.alloc(4)
      b.writeInt32LE(v, 0)
      return b
    }

    it('OP_VERIF takes the branch on a 4-byte little-endian version match', function () {
      var taken = run(function (s) {
        s.add(LE(2)).add(Opcode.OP_VERIF).add(Opcode.OP_1).add(Opcode.OP_ENDIF)
      }, { version: 2 })
      taken.verified.should.equal(true)

      var notTaken = run(function (s) {
        s.add(LE(9)).add(Opcode.OP_VERIF).add(Opcode.OP_1).add(Opcode.OP_ENDIF).add(Opcode.OP_1)
      }, { version: 2 })
      notTaken.verified.should.equal(true)
      notTaken.stack.length.should.equal(1) // only the trailing OP_1
    })

    it('a numerically-equal operand of the wrong LENGTH does not match', function () {
      var r = run(function (s) {
        s.add(new BN(2).toScriptNumBuffer()).add(Opcode.OP_VERIF).add(Opcode.OP_1).add(Opcode.OP_ENDIF).add(Opcode.OP_1)
      }, { version: 2 })
      r.verified.should.equal(true)
      r.stack.length.should.equal(1) // branch NOT taken
    })

    it('OP_VER feeds OP_VERIF directly', function () {
      var r = run(function (s) {
        s.add(Opcode.OP_VER).add(Opcode.OP_VERIF).add(Opcode.OP_1).add(Opcode.OP_ENDIF)
      }, { version: 2 })
      r.verified.should.equal(true)
    })

    it('OP_VERNOTIF is its negation', function () {
      var r = run(function (s) {
        s.add(LE(9)).add(Opcode.OP_VERNOTIF).add(Opcode.OP_1).add(Opcode.OP_ENDIF)
      }, { version: 2 })
      r.verified.should.equal(true)
    })

    it('CONSUMES its operand, mirroring OP_IF', function () {
      // The spec describes the comparison but not the stack effect. An IF that left
      // its condition behind would unbalance every script using it, so this pops.
      // Pinned so a correction shows up as a failure rather than silently.
      var r = run(function (s) {
        s.add(Opcode.OP_7).add(Opcode.OP_2).add(Opcode.OP_VERIF).add(Opcode.OP_ENDIF)
      }, { version: 2 })
      r.verified.should.equal(true)
      r.stack.should.deep.equal(['7']) // the 2 was consumed, the 7 remains
    })

    it('fails on an empty stack rather than reading past it', function () {
      var r = run(function (s) {
        s.add(Opcode.OP_VERIF).add(Opcode.OP_ENDIF).add(Opcode.OP_1)
      }, { version: 2 })
      r.verified.should.equal(false)
      r.errstr.should.match(/UNBALANCED_CONDITIONAL/)
    })
  })

  // Ported from SV Node src/script/interpreter.cpp (OP_LSHIFTNUM / OP_RSHIFTNUM) and
  // the CScriptNum / bsv::bint arithmetic behind it. Each case below corresponds to a
  // specific line of that implementation, so a divergence shows up as a named failure.
  describe('OP_LSHIFTNUM / OP_RSHIFTNUM', function () {
    // Push x then n then the opcode: the node's comment is literally `(x n -- out)`,
    // so the COUNT is on top.
    function shift (x, n, op, flags) {
      return run(function (s) {
        s.add(new BN(x).toScriptNumBuffer()).add(new BN(n).toScriptNumBuffer()).add(op)
      }, { flags: flags == null ? CHRONICLE : flags })
    }
    function value (x, n, op) {
      var r = shift(x, n, op)
      return r.stack[r.stack.length - 1]
    }
    // A zero result makes the script fail EVAL_FALSE, so compare against OP_0 instead.
    function isZero (x, n, op) {
      return run(function (s) {
        s.add(new BN(x).toScriptNumBuffer()).add(new BN(n).toScriptNumBuffer()).add(op)
          .add(Opcode.OP_0).add(Opcode.OP_EQUAL)
      }).verified
    }

    it('are upgradable NOPs before Chronicle, as the node has them', function () {
      // if(!utxo_after_chronicle) { ... else break; }  — a no-op, NOT an error.
      // Rejecting here would refuse scripts the network accepts.
      var r = shift(8, 1, Opcode.OP_LSHIFTNUM, 0)
      r.verified.should.equal(true)
      r.stack.should.deep.equal(['8', '1']) // untouched: no shift, nothing popped
    })

    it('honour DISCOURAGE_UPGRADABLE_NOPS before Chronicle', function () {
      var r = shift(8, 1, Opcode.OP_LSHIFTNUM, Interpreter.SCRIPT_VERIFY_DISCOURAGE_UPGRADABLE_NOPS)
      r.verified.should.equal(false)
      r.errstr.should.match(/DISCOURAGE_UPGRADABLE_NOPS/)
    })

    it('left shift multiplies by 2^n, carrying the sign', function () {
      value(1, 4, Opcode.OP_LSHIFTNUM).should.equal('16')
      value(3, 3, Opcode.OP_LSHIFTNUM).should.equal('24')
      value(1, 0, Opcode.OP_LSHIFTNUM).should.equal('1')
      value(-1, 4, Opcode.OP_LSHIFTNUM).should.equal('-16')
      value(-3, 3, Opcode.OP_LSHIFTNUM).should.equal('-24')
    })

    it('right shift TRUNCATES TOWARD ZERO, which is the whole of "preserving sign"', function () {
      // The node spells this out: "Mathematical division by 2^bit_shift, rounding
      // toward zero ... For negative values: n / 2^k = -((-n) >> k)". A two's
      // complement arithmetic shift would FLOOR instead, giving -3 and -4 here.
      value(-5, 1, Opcode.OP_RSHIFTNUM).should.equal('-2')
      value(-7, 1, Opcode.OP_RSHIFTNUM).should.equal('-3')
      value(5, 1, Opcode.OP_RSHIFTNUM).should.equal('2')
      value(-1000, 3, Opcode.OP_RSHIFTNUM).should.equal('-125')
    })

    it('agrees with OP_DIV by 2^n, the same convention as OP_2DIV', function () {
      [5, -5, 7, -7, 1000, -1000].forEach(function (x) {
        var viaShift = value(x, 1, Opcode.OP_RSHIFTNUM)
        var viaDiv = run(function (s) {
          s.add(new BN(x).toScriptNumBuffer()).add(new BN(2).toScriptNumBuffer()).add(Opcode.OP_DIV)
        })
        viaShift.should.equal(viaDiv.stack[viaDiv.stack.length - 1])
      })
    })

    it('rejects a negative shift count', function () {
      // if(n < 0) return SCRIPT_ERR_INVALID_NUMBER_RANGE
      ;[Opcode.OP_LSHIFTNUM, Opcode.OP_RSHIFTNUM].forEach(function (op) {
        var r = shift(8, -1, op)
        r.verified.should.equal(false)
        r.errstr.should.match(/INVALID_NUMBER_RANGE/)
      })
    })

    it('right shift past the bit length is zero, not an error', function () {
      isZero(5, 1000, Opcode.OP_RSHIFTNUM).should.equal(true)
      isZero(-5, 1000, Opcode.OP_RSHIFTNUM).should.equal(true) // and no negative zero
      isZero(1, 1, Opcode.OP_RSHIFTNUM).should.equal(true)
      isZero(-1, 1, Opcode.OP_RSHIFTNUM).should.equal(true)
    })

    it('left shift overflows rather than growing without bound', function () {
      // CScriptNum bounds this BEFORE shifting (current_size + shift_bytes >
      // max_length), so a huge count cannot allocate a huge number first.
      var r = shift(5, 1000, Opcode.OP_LSHIFTNUM)
      r.verified.should.equal(false)
      r.errstr.should.match(/OVERFLOW/)
    })

    it('fails on a short stack', function () {
      var r = run(function (s) { s.add(new BN(1).toScriptNumBuffer()).add(Opcode.OP_LSHIFTNUM) })
      r.verified.should.equal(false)
      r.errstr.should.match(/INVALID_STACK_OPERATION/)
    })
  })

  describe('SIGHASH_CHRONICLE selects the original digest algorithm', function () {
    function fixture () {
      var key = bsv.PrivateKey.fromBuffer(Buffer.alloc(32, 5))
      var sub = Script.buildPublicKeyHashOut(key.toAddress())
      var tx = new bsv.Transaction()
      tx.uncheckedAddInput(new bsv.Transaction.Input({
        prevTxId: 'aa'.repeat(32), outputIndex: 0, script: Script.empty()
      }))
      tx.addOutput(new bsv.Transaction.Output({ script: sub, satoshis: 1000 }))
      return { tx: tx, sub: sub, amt: new BN(2000) }
    }

    it('has the constant at 0x20', function () {
      Signature.SIGHASH_CHRONICLE.should.equal(0x20)
    })

    it('routes to OTDA when the bit is set AND the flag is enabled', function () {
      var f = fixture()
      var type = Signature.SIGHASH_ALL | Signature.SIGHASH_FORKID | Signature.SIGHASH_CHRONICLE
      var enabled = bsv.Transaction.sighash.sighash(
        f.tx, type, 0, f.sub, f.amt,
        Interpreter.SCRIPT_ENABLE_SIGHASH_FORKID | CHRONICLE
      )
      var forcedOtda = bsv.Transaction.sighash.sighash(f.tx, type, 0, f.sub, f.amt, 0)
      enabled.toString('hex').should.equal(forcedOtda.toString('hex'))
    })

    it('OVERRIDES FORKID — otherwise the bit could never select OTDA in practice', function () {
      // FORKID is set on essentially every BSV signature written since 2018, so a
      // CHRONICLE bit that only applied when FORKID was absent would mean nothing.
      var f = fixture()
      var type = Signature.SIGHASH_ALL | Signature.SIGHASH_FORKID | Signature.SIGHASH_CHRONICLE
      var chronicle = bsv.Transaction.sighash.sighash(
        f.tx, type, 0, f.sub, f.amt,
        Interpreter.SCRIPT_ENABLE_SIGHASH_FORKID | CHRONICLE
      )
      var bip143 = bsv.Transaction.sighash.sighash(
        f.tx, type, 0, f.sub, f.amt, Interpreter.SCRIPT_ENABLE_SIGHASH_FORKID
      )
      chronicle.toString('hex').should.not.equal(bip143.toString('hex'))
    })

    it('is IGNORED without the flag, so existing BIP-143 signatures are unaffected', function () {
      // Before the upgrade the 0x20 bit means nothing, so signatures already exist
      // whose type byte happens to set it. Honouring it unconditionally would
      // reinterpret those as OTDA — a silent validity change on historic data.
      var f = fixture()
      var withBit = Signature.SIGHASH_ALL | Signature.SIGHASH_FORKID | Signature.SIGHASH_CHRONICLE
      var viaForkId = bsv.Transaction.sighash.sighash(
        f.tx, withBit, 0, f.sub, f.amt, Interpreter.SCRIPT_ENABLE_SIGHASH_FORKID
      )
      var forcedOtda = bsv.Transaction.sighash.sighash(f.tx, withBit, 0, f.sub, f.amt, 0)
      viaForkId.toString('hex').should.not.equal(forcedOtda.toString('hex'))
    })
  })
})
