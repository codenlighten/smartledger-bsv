'use strict'

/* global describe, it */

// Script#toBuffer, Script#findAndDelete and the sighash preimage used to cost
// time proportional to a script's chunk count several times over per signature
// check: on a 238 KB OP_PUSH_TX locking script (229,150 chunks) one
// OP_CHECKSIGVERIFY spent ~75 ms copying the script, ~220 ms serializing it
// twice and ~120 ms in findAndDelete, against 0.2 ms to hash the bytes.
//
// The faster versions must be the same functions. The previous implementations
// are kept below as references, and each new one is compared with them on
// generated scripts, including malformed chunk objects whose serialization
// throws.

require('chai').should()
var expect = require('chai').expect
var bsv = require('../../')
var Script = bsv.Script
var Opcode = bsv.Opcode
var BufferWriter = bsv.encoding.BufferWriter

function referenceToBuffer (script) {
  var bw = new BufferWriter()
  for (var i = 0; i < script.chunks.length; i++) {
    var chunk = script.chunks[i]
    var opcodenum = chunk.opcodenum
    bw.writeUInt8(chunk.opcodenum)
    if (chunk.buf) {
      if (opcodenum < Opcode.OP_PUSHDATA1) {
        bw.write(chunk.buf)
      } else if (opcodenum === Opcode.OP_PUSHDATA1) {
        bw.writeUInt8(chunk.len)
        bw.write(chunk.buf)
      } else if (opcodenum === Opcode.OP_PUSHDATA2) {
        bw.writeUInt16LE(chunk.len)
        bw.write(chunk.buf)
      } else if (opcodenum === Opcode.OP_PUSHDATA4) {
        bw.writeUInt32LE(chunk.len)
        bw.write(chunk.buf)
      }
    }
  }
  return bw.concat()
}

function referenceFindAndDelete (script, sub) {
  var hex = referenceToBuffer(sub).toString('hex')
  for (var i = 0; i < script.chunks.length; i++) {
    var hex2 = referenceToBuffer(new Script({ chunks: [script.chunks[i]] })).toString('hex')
    if (hex === hex2) {
      script.chunks.splice(i, 1)
    }
  }
  return script
}

// Deterministic generator.
function rng (seed) {
  var s = seed >>> 0
  return function () {
    s ^= s << 13; s >>>= 0
    s ^= s >>> 17
    s ^= s << 5; s >>>= 0
    return s
  }
}

function bytes (r, n) {
  var b = Buffer.alloc(n)
  for (var i = 0; i < n; i++) b[i] = r() & 0xff
  return b
}

function randomChunk (r, needle) {
  var k = r() % 12
  if (needle && k === 0) return Object.assign({}, needle)
  if (k < 5) return { opcodenum: 0x51 + (r() % 80) }
  if (k < 8) { var n = 1 + (r() % 75); return { opcodenum: n, buf: bytes(r, n), len: n } }
  if (k === 8) { var a = r() % 256; return { opcodenum: Opcode.OP_PUSHDATA1, buf: bytes(r, a), len: a } }
  if (k === 9) { var b = r() % 600; return { opcodenum: Opcode.OP_PUSHDATA2, buf: bytes(r, b), len: b } }
  if (k === 10) { var c = r() % 300; return { opcodenum: Opcode.OP_PUSHDATA4, buf: bytes(r, c), len: c } }
  return { opcodenum: 0 }
}

function sameOutcome (fa, fb) {
  var a, b, ea, eb
  try { a = fa() } catch (e) { ea = e }
  try { b = fb() } catch (e) { eb = e }
  if (ea || eb) {
    expect(!!ea, 'one throws and the other does not: ' + (ea || eb)).to.equal(!!eb)
    return
  }
  a.toString('hex').should.equal(b.toString('hex'))
}

describe('Script serialization on large scripts', function () {
  describe('Script#toBuffer', function () {
    it('matches the reference on parsed scripts', function () {
      var r = rng(7)
      for (var t = 0; t < 200; t++) {
        var chunks = []
        var n = r() % 400
        for (var i = 0; i < n; i++) chunks.push(randomChunk(r))
        var buf = referenceToBuffer(new Script({ chunks: chunks }))
        var parsed = Script.fromBuffer(buf)
        parsed.toBuffer().toString('hex').should.equal(referenceToBuffer(parsed).toString('hex'))
        new Script({ chunks: chunks }).toBuffer().toString('hex').should.equal(buf.toString('hex'))
      }
    })

    it('matches the reference, including throwing, on malformed chunk objects', function () {
      var cases = [
        [{ opcodenum: 300 }],
        [{ opcodenum: -1 }],
        [{ opcodenum: Opcode.OP_PUSHDATA1, buf: Buffer.alloc(3), len: 300 }],
        [{ opcodenum: Opcode.OP_PUSHDATA2, buf: Buffer.alloc(3), len: 70000 }],
        [{ opcodenum: Opcode.OP_PUSHDATA1, buf: Buffer.alloc(3), len: 7 }],
        [{ opcodenum: 5, buf: Buffer.alloc(3), len: 5 }],
        [{ opcodenum: 0x76, buf: Buffer.alloc(3) }],
        [{ opcodenum: 4, buf: 'not a buffer' }],
        [{ opcodenum: 0x76 }, { opcodenum: 2.5 }]
      ]
      cases.forEach(function (chunks) {
        sameOutcome(function () { return new Script({ chunks: chunks }).toBuffer() },
          function () { return referenceToBuffer(new Script({ chunks: chunks })) })
      })
    })
  })

  describe('Script#findAndDelete', function () {
    it('removes exactly what the reference removes, consecutive matches included', function () {
      var r = rng(11)
      for (var t = 0; t < 200; t++) {
        var needle = t % 2 ? { opcodenum: 72, buf: bytes(r, 72), len: 72 } : { opcodenum: Opcode.OP_PUSHDATA1, buf: bytes(r, 80), len: 80 }
        var chunks = []
        var n = r() % 300
        for (var i = 0; i < n; i++) chunks.push(randomChunk(r, needle))
        var sub = new Script({ chunks: [needle] })
        var mine = new Script({ chunks: chunks.slice() }).findAndDelete(sub)
        var ref = referenceFindAndDelete(new Script({ chunks: chunks.slice() }), sub)
        mine.toBuffer().toString('hex').should.equal(referenceToBuffer(ref).toString('hex'))
      }
    })

    it('throws where the reference throws on a malformed chunk', function () {
      var sub = new Script().add(Buffer.alloc(72, 1))
      sameOutcome(function () { return new Script({ chunks: [{ opcodenum: 0x76 }, { opcodenum: 999 }] }).findAndDelete(sub).toBuffer() },
        function () { return referenceToBuffer(referenceFindAndDelete(new Script({ chunks: [{ opcodenum: 0x76 }, { opcodenum: 999 }] }), sub)) })
    })
  })

  describe('sighash', function () {
    var privateKey = bsv.PrivateKey.fromWIF('cSBnVM4xvxarwGQuAfQFwqDg9k5tErHUHzgWsEfD4zdwUasvqRVY')
    var address = privateKey.toAddress()

    function spend (lockingScript) {
      var tx = new bsv.Transaction()
      tx.addInput(new bsv.Transaction.Input({
        prevTxId: Buffer.alloc(32, 7), outputIndex: 0, script: new Script(), sequenceNumber: 0xffffffff
      }), lockingScript, 10000)
      tx.to(address, 9000)
      return tx
    }

    it('is unchanged for a large scriptCode, and does not modify the script it is given', function () {
      var r = rng(3)
      var chunks = []
      for (var i = 0; i < 5000; i++) chunks.push(randomChunk(r))
      var big = Script.fromBuffer(referenceToBuffer(new Script({ chunks: chunks })))
      var before = big.toBuffer().toString('hex')
      var tx = spend(big)
      var types = [
        bsv.crypto.Signature.SIGHASH_ALL | bsv.crypto.Signature.SIGHASH_FORKID,
        bsv.crypto.Signature.SIGHASH_ALL
      ]
      // Digests of both preimages as computed by the implementation before this
      // change, so the faster one is held to exactly the same bytes.
      var expected = {}
      expected[types[0]] = '7af82a3382c2f3584eb6c5f78fb6a668682365ba5ceaa15b8e3ba76addd001f3'
      expected[types[1]] = '2e095c5fde7322d5ac99e5d66d8cfd19c070d9346f904a77507063a168b677d4'
      types.forEach(function (type) {
        var pre = bsv.Transaction.Sighash.sighashPreimage(tx, type, 0, big, new bsv.crypto.BN(10000))
        bsv.crypto.Hash.sha256(pre).toString('hex').should.equal(expected[type])
        if (type & bsv.crypto.Signature.SIGHASH_FORKID) {
          // BIP-143: the scriptCode appears once, after the outpoint, with its varint length.
          var code = referenceToBuffer(big)
          var at = pre.indexOf(code)
          at.should.be.above(0)
          pre.indexOf(code, at + 1).should.equal(-1)
        }
        big.toBuffer().toString('hex').should.equal(before)
      })
    })

    it('still verifies a signature over a large non-standard script', function () {
      // Thousands of pushes, each dropped, in front of a pay-to-pubkey-hash check.
      var r = rng(5)
      var chunks = []
      for (var i = 0; i < 3000; i++) {
        var n = 1 + (r() % 60)
        chunks.push({ opcodenum: n, buf: bytes(r, n), len: n })
        chunks.push({ opcodenum: Opcode.OP_DROP })
      }
      var lock = Script.fromBuffer(Buffer.concat([
        referenceToBuffer(new Script({ chunks: chunks })),
        Script.buildPublicKeyHashOut(address).toBuffer()
      ]))
      var tx = spend(lock)
      var type = bsv.crypto.Signature.SIGHASH_ALL | bsv.crypto.Signature.SIGHASH_FORKID
      var satoshis = new bsv.crypto.BN(10000)
      var sig = bsv.Transaction.Sighash.sign(tx, privateKey, type, 0, lock, satoshis)
      var unlock = new Script()
        .add(Buffer.concat([sig.toDER(), Buffer.from([type])]))
        .add(privateKey.toPublicKey().toBuffer())
      tx.inputs[0].setScript(unlock)
      var interp = new bsv.Script.Interpreter()
      var ok = interp.verify(unlock, lock, tx, 0, bsv.Script.Interpreter.currentConsensusFlags(), satoshis)
      expect(ok, interp.errstr).to.equal(true)

      // ...and a signature over different bytes still fails.
      var other = bsv.Transaction.Sighash.sign(tx, privateKey, type, 0, Script.buildPublicKeyHashOut(address), satoshis)
      var bad = new Script()
        .add(Buffer.concat([other.toDER(), Buffer.from([type])]))
        .add(privateKey.toPublicKey().toBuffer())
      new bsv.Script.Interpreter().verify(bad, lock, tx, 0, bsv.Script.Interpreter.currentConsensusFlags(), satoshis).should.equal(false)
    })
  })
})
