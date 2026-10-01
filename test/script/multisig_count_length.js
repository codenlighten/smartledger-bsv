'use strict'

/* global describe, it */

// OP_CHECKMULTISIG's two counts are decoded with a FOUR-byte limit in every era.
//
// Every other operand decode in the interpreter takes the era's maxScriptNumLength, which after
// Genesis is 750,000 bytes and after Chronicle 32,000,000. These two do not. The node hardcodes
// the limit and says why:
//
//   // initialize to max size of CScriptNum::MAXIMUM_ELEMENT_SIZE (4 bytes)
//   // because only 4 byte integers are supported by OP_CHECKMULTISIG / OP_CHECKMULTISIGVERIFY
//   nKeysCountSigned = CScriptNum(stack.stacktop(-i).GetElement(), requireMinimal,
//                                 CScriptNum::MAXIMUM_ELEMENT_SIZE).getint();
//
// with MAXIMUM_ELEMENT_SIZE = 4 in script_num.h. Passing the era's length here accepted a 5-byte
// count the node refuses as SCRIPTNUM_OVERFLOW — a false accept, the direction that costs money.
//
// Found while arbitrating a port audit: a second session reported six sites in bsv-core still
// using the 4-byte default where this library used the era length, and proposed changing all six.
// Four were right. These two were the opposite — the library was wrong and bsv-core was right —
// and making the change would have introduced this false accept there too.
//
// No row of the node's 1483-row corpus covers it, which is why both implementations could hold
// opposite answers at 1483/1483.

require('chai').should()
var bsv = require('../..')
var Interpreter = bsv.Script.Interpreter
var Script = bsv.Script
var BN = bsv.crypto.BN

var PUBKEY = bsv.PrivateKey.fromBuffer(Buffer.alloc(32, 0x44)).toPublicKey().toBuffer()

// bottom -> top: dummy, nSigsCount, pubkey, nKeysCount
function spendWithKeyCount (countBuf, flags) {
  var sc = new Script().add('OP_0').add('OP_0').add(PUBKEY).add(countBuf).add('OP_CHECKMULTISIG')
  var interp = new Interpreter()
  var ok = interp.verify(new Script(), sc, new bsv.Transaction(), 0, flags, new BN(0))
  return ok ? 'OK' : interp.errstr.replace(/^SCRIPT_ERR_/, '')
}

describe('OP_CHECKMULTISIG counts are four bytes in every era', function () {
  var eras = {
    'pre-Genesis': Interpreter.SCRIPT_VERIFY_P2SH,
    'post-Genesis': Interpreter.SCRIPT_VERIFY_P2SH | Interpreter.SCRIPT_GENESIS |
      Interpreter.SCRIPT_UTXO_AFTER_GENESIS,
    'post-Chronicle': Interpreter.SCRIPT_VERIFY_P2SH | Interpreter.SCRIPT_GENESIS |
      Interpreter.SCRIPT_UTXO_AFTER_GENESIS | Interpreter.SCRIPT_UTXO_AFTER_CHRONICLE
  }

  Object.keys(eras).forEach(function (era) {
    it('refuses a 5-byte nKeysCount ' + era, function () {
      // 0x0100000000 is a non-minimal 5-byte encoding of 1.
      spendWithKeyCount(Buffer.from('0100000000', 'hex'), eras[era])
        .should.equal('SCRIPTNUM_OVERFLOW')
    })

    it('accepts a minimal 1-byte nKeysCount ' + era, function () {
      spendWithKeyCount(Buffer.from([0x01]), eras[era]).should.equal('OK')
    })
  })

  it('still lifts the limit for ORDINARY operands after Genesis', function () {
    // The contrast that makes the special case a special case: a 5-byte operand to OP_ABS is
    // fine post-Genesis, because that decode DOES take the era's length.
    var postGenesis = eras['post-Genesis']
    var interp = new Interpreter()
    var sc = new Script().add(Buffer.from('0100000000', 'hex')).add('OP_ABS').add('OP_1')
      .add('OP_EQUAL')
    var ok = interp.verify(new Script(), sc, new bsv.Transaction(), 0, postGenesis, new BN(0))
    ;(ok ? 'OK' : interp.errstr.replace(/^SCRIPT_ERR_/, '')).should.equal('OK')
  })

  it('and keeps the 4-byte limit on ordinary operands BEFORE Genesis', function () {
    var interp = new Interpreter()
    var sc = new Script().add(Buffer.from('0100000000', 'hex')).add('OP_ABS')
    interp.verify(new Script(), sc, new bsv.Transaction(), 0, Interpreter.SCRIPT_VERIFY_P2SH,
      new BN(0))
    interp.errstr.should.equal('SCRIPT_ERR_SCRIPTNUM_OVERFLOW')
  })
})
