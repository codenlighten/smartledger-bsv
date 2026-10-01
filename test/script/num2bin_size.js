'use strict'

/* global describe, it */

// OP_NUM2BIN's size as bitcoin-sv v1.2.2 bounds it: decoded with the era's length, refused as
// PUSH_SIZE when negative or above INT32_MAX in every era, and only then held to the era's
// element limit (520 bytes before Genesis).

var expect = require('chai').expect
var bsv = require('../..')
var Interpreter = bsv.Script.Interpreter
var Script = bsv.Script
var BN = bsv.crypto.BN

var PRE = Interpreter.SCRIPT_VERIFY_P2SH
var GENESIS = PRE | Interpreter.SCRIPT_GENESIS | Interpreter.SCRIPT_UTXO_AFTER_GENESIS

function num2bin (x, size, flags) {
  var interp = new Interpreter()
  interp.script = new Script().add(x).add(size).add('OP_NUM2BIN')
  interp.flags = flags
  interp.tx = new bsv.Transaction()
  interp.nin = 0
  interp.satoshisBN = new BN(0)
  var ok = interp.evaluate()
  return ok ? interp.stack[interp.stack.length - 1].toString('hex') : interp.errstr.replace(/^SCRIPT_ERR_/, '')
}

function num (v) { return new BN(v).toScriptNumBuffer() }

describe('OP_NUM2BIN size follows the node', function () {
  var one = Buffer.from('01', 'hex')

  it('refuses a size above INT32_MAX as PUSH_SIZE in every era', function () {
    expect(num2bin(one, num(0x80000000), GENESIS)).to.equal('PUSH_SIZE')
    expect(num2bin(one, new BN(10).mul(new BN(0x40000000)).toScriptNumBuffer(), GENESIS))
      .to.equal('PUSH_SIZE')
    // Wider than a JS number can hold exactly: a bound, not an exception.
    expect(num2bin(one, new BN(2).pow(new BN(80)).toScriptNumBuffer(), GENESIS))
      .to.equal('PUSH_SIZE')
  })

  it('refuses a negative size as PUSH_SIZE', function () {
    expect(num2bin(one, num(-1), GENESIS)).to.equal('PUSH_SIZE')
    expect(num2bin(one, num(-1), PRE)).to.equal('PUSH_SIZE')
  })

  it('keeps the pre-Genesis limit of 520 bytes', function () {
    expect(num2bin(one, num(520), PRE)).to.have.length(1040)
    expect(num2bin(one, num(521), PRE)).to.equal('PUSH_SIZE')
    expect(num2bin(one, num(521), GENESIS)).to.have.length(1042)
  })

  it('still pads and carries the sign as before', function () {
    expect(num2bin(one, num(4), GENESIS)).to.equal('01000000')
    expect(num2bin(Buffer.from('81', 'hex'), num(3), GENESIS)).to.equal('010080')
    expect(num2bin(Buffer.from('0102', 'hex'), num(1), GENESIS)).to.equal('IMPOSSIBLE_ENCODING')
  })
})
