'use strict'

/* global describe, it */

// OP_LSHIFT and OP_RSHIFT as bitcoin-sv v1.2.2 defines them: the operand is a big-endian bit
// string that keeps its length, n is decoded with the era's script-number length and refused
// if negative BEFORE the operand is looked at, and any n >= 8 * size gives all zero bytes.

var expect = require('chai').expect
var bsv = require('../..')
var Interpreter = bsv.Script.Interpreter
var Script = bsv.Script
var BN = bsv.crypto.BN

var PRE = Interpreter.SCRIPT_VERIFY_P2SH
var GENESIS = PRE | Interpreter.SCRIPT_GENESIS | Interpreter.SCRIPT_UTXO_AFTER_GENESIS

// Run `<x> <n> SHIFT` and return the result bytes, or the error name.
function shift (op, x, n, flags) {
  var s = new Script().add(x).add(n).add(op)
  var interp = new Interpreter()
  interp.script = s
  interp.flags = flags
  interp.tx = new bsv.Transaction()
  interp.nin = 0
  interp.satoshisBN = new BN(0)
  interp.stack = []
  interp.altstack = []
  var ok = interp.evaluate()
  return ok ? interp.stack[interp.stack.length - 1].toString('hex') : interp.errstr.replace(/^SCRIPT_ERR_/, '')
}

// An independent model: write the operand out as a string of '0'/'1' and shift the string.
function model (left, hex, n) {
  var bits = Buffer.from(hex, 'hex').reduce(function (acc, b) {
    return acc + b.toString(2).padStart(8, '0')
  }, '')
  var len = bits.length
  var k = Math.min(n, len)
  var out = left ? bits.slice(k) + '0'.repeat(k) : '0'.repeat(k) + bits.slice(0, len - k)
  var bytes = []
  for (var i = 0; i < len; i += 8) bytes.push(parseInt(out.slice(i, i + 8), 2))
  return Buffer.from(bytes).toString('hex')
}

function num (v) { return new BN(v).toScriptNumBuffer() }

describe('OP_LSHIFT / OP_RSHIFT follow the node', function () {
  it('match an independent bit-string model at every count up to and past the width', function () {
    var operands = ['ff', '80', '01', '0080', '00ff', '5462725afe7647d2', '000000ff00', '8000000001']
    operands.forEach(function (hex) {
      var width = hex.length * 4
      for (var n = 0; n <= width + 9; n++) {
        ;[['OP_LSHIFT', true], ['OP_RSHIFT', false]].forEach(function (pair) {
          ;[PRE, GENESIS].forEach(function (flags) {
            expect(shift(pair[0], Buffer.from(hex, 'hex'), num(n), flags),
              pair[0] + ' ' + hex + ' by ' + n).to.equal(model(pair[1], hex, n))
          })
        })
      }
    })
  })

  it('give all zero bytes, at the operand length, for any count of 8 * size or more', function () {
    var x = Buffer.from('ffffffff', 'hex')
    // 2^31 - 1 fits four bytes, so it is legal in every era; the wider counts are post-Genesis.
    expect(shift('OP_LSHIFT', x, num(0x7fffffff), PRE)).to.equal('00000000')
    expect(shift('OP_RSHIFT', x, num(0x7fffffff), PRE)).to.equal('00000000')
    var wide = [new BN(2).pow(new BN(60)), new BN(2).pow(new BN(200)), new BN(32)]
    wide.forEach(function (n) {
      expect(shift('OP_LSHIFT', x, n.toScriptNumBuffer(), GENESIS), 'n = ' + n.toString())
        .to.equal('00000000')
      expect(shift('OP_RSHIFT', x, n.toScriptNumBuffer(), GENESIS), 'n = ' + n.toString())
        .to.equal('00000000')
    })
  })

  it('keep the operand length for large operands, one bit short of the width', function () {
    var x = Buffer.alloc(4096, 0xff)
    var n = 4096 * 8 - 1
    var left = Buffer.from(shift('OP_LSHIFT', x, num(n), GENESIS), 'hex')
    var right = Buffer.from(shift('OP_RSHIFT', x, num(n), GENESIS), 'hex')
    expect(left.length).to.equal(4096)
    expect(left[0]).to.equal(0x80)
    expect(left.slice(1).every(function (b) { return b === 0 })).to.equal(true)
    expect(right[4095]).to.equal(0x01)
    expect(right.slice(0, 4095).every(function (b) { return b === 0 })).to.equal(true)
  })

  it('check n before looking at the operand, so an empty operand is no shortcut', function () {
    var empty = Buffer.alloc(0)
    ;['OP_LSHIFT', 'OP_RSHIFT'].forEach(function (op) {
      expect(shift(op, empty, num(-1), PRE), op).to.equal('INVALID_NUMBER_RANGE')
      expect(shift(op, empty, num(-1), GENESIS), op).to.equal('INVALID_NUMBER_RANGE')
      // Five bytes is past the pre-Genesis limit of four.
      expect(shift(op, empty, Buffer.from('0100000001', 'hex'), PRE), op)
        .to.equal('SCRIPTNUM_OVERFLOW')
      expect(shift(op, empty, num(3), PRE), op).to.equal('')
    })
    var minimal = PRE | Interpreter.SCRIPT_VERIFY_MINIMALDATA
    expect(shift('OP_LSHIFT', empty, Buffer.from('0100', 'hex'), minimal))
      .to.equal('SCRIPTNUM_MINENCODE')
  })

  it('refuse a negative count, and read negative zero as zero', function () {
    var x = Buffer.from('ff', 'hex')
    expect(shift('OP_LSHIFT', x, num(-1), GENESIS)).to.equal('INVALID_NUMBER_RANGE')
    expect(shift('OP_LSHIFT', x, Buffer.from('80', 'hex'), GENESIS)).to.equal('ff')
  })
})
