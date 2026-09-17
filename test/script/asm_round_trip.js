'use strict'

/* global describe, it */

// Script text must read back as the script it was written from.
//
// An opcode with no name (0xba-0xfc, 67 of them) broke that in both text forms:
//
//   toASM     wrote it as bare hex, `OP_1 ba`, which is also how ASM writes a one-byte
//             data push, so fromASM read it back as a push: 51ba became 5101ba;
//   toString  wrote `OP_1 0xba`, which fromString rejected.
//
// Both now write the raw byte as `0xba` and both read it back. That is also how
// bitcoind's script test format writes a raw byte. The opcodes are not given names:
// Opcode.map deliberately invents none above OP_NOP10 (see test/opcode.js), and a
// name like OP_NOP11 would suggest a no-op where the node fails the script.
//
// ASM cannot say how data was pushed, so a non-minimal push is the one thing that
// does not survive toASM/fromASM. toString/fromString keeps it.
//
// Reported by the scriptmin work (codenlighten/scriptmin#3).

require('chai').should()
var expect = require('chai').expect
var bsv = require('../../')
var Script = bsv.Script
var Opcode = bsv.Opcode

function roundTrips (buf) {
  var s = Script.fromBuffer(buf)
  return {
    asm: Script.fromASM(s.toASM()).toBuffer().toString('hex'),
    str: Script.fromString(s.toString()).toBuffer().toString('hex')
  }
}

describe('Script text round trip', function () {
  it('every non-push opcode byte survives both toASM and toString', function () {
    var unnamed = 0
    for (var c = 0; c < 256; c++) {
      if (c >= 0x01 && c <= Opcode.OP_PUSHDATA4) continue
      if (typeof Opcode.reverseMap[c] === 'undefined' && c !== 0) unnamed++
      var buf = Buffer.from([Opcode.OP_1, c, Opcode.OP_1])
      var r = roundTrips(buf)
      r.asm.should.equal(buf.toString('hex'), 'toASM/fromASM of 0x' + c.toString(16))
      r.str.should.equal(buf.toString('hex'), 'toString/fromString of 0x' + c.toString(16))
    }
    // Guards the loop against passing because it never met an unnamed opcode.
    unnamed.should.equal(67)
  })

  it('writes an unnamed opcode as its raw byte, distinct from a one-byte push', function () {
    var op = Script.fromBuffer(Buffer.from('51ba', 'hex'))
    var push = Script.fromBuffer(Buffer.from('5101ba', 'hex'))
    op.toASM().should.equal('OP_1 0xba')
    push.toASM().should.equal('OP_1 ba')
    op.toString().should.equal('OP_1 0xba')
    Script.fromASM('OP_1 0xba').toBuffer().toString('hex').should.equal('51ba')
    Script.fromASM('OP_1 ba').toBuffer().toString('hex').should.equal('5101ba')
  })

  it('reads a raw opcode byte in either case', function () {
    Script.fromASM('0xBA').toBuffer().toString('hex').should.equal('ba')
    Script.fromString('0xFC').toBuffer().toString('hex').should.equal('fc')
  })

  it('reads a raw byte of a named opcode as that opcode', function () {
    Script.fromASM('0x76 0xa9').toBuffer().toString('hex').should.equal('76a9')
  })

  it('refuses a raw push byte on its own, which would be an incomplete push', function () {
    expect(function () { Script.fromASM('0x05') }).to.throw()
    // fromString already read a bare number or 0x05 as a push length followed by data;
    // that meaning is unchanged.
    Script.fromString('0x05 0x0102030405').toBuffer().toString('hex').should.equal('050102030405')
  })

  it('reads the empty ASM toASM writes for an empty script as an empty script', function () {
    var empty = new Script()
    empty.toASM().should.equal('')
    Script.fromASM('').toBuffer().length.should.equal(0)
    Script.fromASM('0').toBuffer().toString('hex').should.equal('00')
  })

  it('round-trips pushes of every encoding size', function () {
    ;[0, 1, 2, 20, 75, 76, 255, 256, 65535, 65536].forEach(function (n) {
      var buf = new Script().add(Buffer.alloc(n, 0xab)).toBuffer()
      var r = roundTrips(buf)
      r.asm.should.equal(buf.toString('hex'), 'ASM, push of ' + n)
      r.str.should.equal(buf.toString('hex'), 'string, push of ' + n)
    })
  })

  it('keeps a non-minimal push through toString, and cannot through ASM', function () {
    var buf = Buffer.concat([Buffer.from([Opcode.OP_PUSHDATA1, 5]), Buffer.alloc(5, 1)])
    var r = roundTrips(buf)
    r.str.should.equal(buf.toString('hex'))
    r.asm.should.equal('050101010101')
  })

  it('round-trips 3000 generated scripts mixing pushes and named and unnamed opcodes', function () {
    var seed = 99
    function rnd (n) { seed = (seed * 1103515245 + 12345) & 0x7fffffff; return seed % n }
    var ops = [0x00, 0x4f, 0x51, 0x60, 0x76, 0x87, 0xa9, 0xac, 0xba, 0xc0, 0xf9, 0xfc, 0xfd, 0xff]
    var withUnnamed = 0
    for (var t = 0; t < 3000; t++) {
      var s = new Script()
      var k = rnd(12)
      for (var i = 0; i < k; i++) {
        if (rnd(3) === 0) {
          var b = Buffer.alloc(1 + rnd(90))
          for (var j = 0; j < b.length; j++) b[j] = rnd(256)
          s.add(b)
        } else {
          s.add(ops[rnd(ops.length)])
        }
      }
      var buf = s.toBuffer()
      if (s.chunks.some(function (c) { return c.opcodenum >= 0xba && c.opcodenum <= 0xfc })) withUnnamed++
      var r = roundTrips(buf)
      r.asm.should.equal(buf.toString('hex'), 'ASM of ' + buf.toString('hex'))
      r.str.should.equal(buf.toString('hex'), 'string of ' + buf.toString('hex'))
    }
    withUnnamed.should.be.above(1000)
  })

  it('does not name the unnamed opcodes, and still refuses to execute them', function () {
    expect(Opcode.reverseMap[0xba]).to.equal(undefined)
    var interp = new Script.Interpreter()
    var ok = interp.verify(new Script(), Script.fromASM('OP_1 0xba'), new bsv.Transaction(), 0,
      Script.Interpreter.currentConsensusFlags(), new bsv.crypto.BN(0))
    ok.should.equal(false)
    interp.errstr.should.equal('SCRIPT_ERR_BAD_OPCODE')
  })
})
