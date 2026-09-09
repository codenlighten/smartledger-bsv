'use strict'

/* global describe, it */
require('chai').should()
var bsv = require('../..')
var H = bsv.SmartContract.CovenantHelpers
var PushTx = bsv.SmartContract.PushTx
var Script = bsv.Script
var Opcode = bsv.Opcode
var Transaction = bsv.Transaction
var Interpreter = bsv.Script.Interpreter
var Signature = bsv.crypto.Signature
var BN = bsv.crypto.BN

// docs/preimage.md ships in the npm tarball and is linked from the README, and people
// build covenants from it. Its previous version had the preimage at ~108 bytes when
// it is 182, every byte offset from the txid onward off by three or four, four of its
// seven script fragments broken, and OP_BIN2NUM recommended on three unsigned fields.
//
// So the page is asserted rather than proof-read. Every offset and every fragment
// below is quoted from it verbatim.
describe('docs/preimage.md is true of a real preimage', function () {
  this.timeout(20000)

  var key = bsv.PrivateKey.fromRandom()
  var lock = Script.buildPublicKeyHashOut(key.toPublicKey().toAddress())
  var SATS = 10000

  function preimage (opts) {
    opts = opts || {}
    var f = H.fundAndSpend(lock, SATS, {
      outputs: [H.p2pkhOutput(key.toPublicKey(), SATS - 500), H.p2pkhOutput(key.toPublicKey(), 100)]
    })
    var spend = f.spend
    spend.nLockTime = opts.nLockTime === undefined ? 1000 : opts.nLockTime
    spend.inputs[0].sequenceNumber = opts.sequence === undefined ? 0xfffffffe : opts.sequence
    return H.rawPreimage(spend, 0, lock, SATS)
  }

  describe('length', function () {
    it('is 156 fixed bytes plus the length-prefixed scriptCode', function () {
      var pre = preimage()
      var scriptLen = lock.toBuffer().length
      scriptLen.should.equal(25)
      pre.length.should.equal(156 + 1 + scriptLen)
      pre.length.should.equal(182)
    })

    it('grows with the scriptCode, so 182 is not a constant', function () {
      var big = new Script().add(Buffer.alloc(300)).add(Opcode.OP_DROP).add(Opcode.OP_1)
      var f = H.fundAndSpend(big, SATS, { outputs: [H.p2pkhOutput(key.toPublicKey(), SATS - 500)] })
      var pre = H.rawPreimage(f.spend, 0, big, SATS)
      // 300-byte push needs a 2-byte OP_PUSHDATA1 header, and the scriptCode's own
      // length prefix crosses 0xfd, so the varint becomes 3 bytes.
      pre.length.should.equal(156 + 3 + big.toBuffer().length)
      pre.length.should.be.above(182)
    })
  })

  describe('the offset table', function () {
    var pre = preimage()
    var L = 182

    // "Offsets, for a 25-byte scriptCode" — the from-start column.
    var FROM_START = [
      ['nVersion', 0, 4], ['hashPrevouts', 4, 32], ['hashSequence', 36, 32],
      ['outpoint', 68, 36], ['scriptCode', 104, 26],
      ['amount', 130, 8], ['nSequence', 138, 4], ['hashOutputs', 142, 32],
      ['nLockTime', 174, 4], ['sighashType', 178, 4]
    ]
    it('accounts for every byte with no gap or overlap', function () {
      var cursor = 0
      FROM_START.forEach(function (row) {
        row[1].should.equal(cursor, row[0] + ' does not start where the previous field ends')
        cursor += row[2]
      })
      cursor.should.equal(L)
    })

    // The from-end column, which is what the scripts use.
    var FROM_END = { amount: [52, 8], nSequence: [44, 4], hashOutputs: [40, 32], nLockTime: [8, 4], sighashType: [4, 4] }
    it('agrees with itself: from-end matches from-start', function () {
      FROM_START.forEach(function (row) {
        var fe = FROM_END[row[0]]
        if (!fe) return
        ;(L - row[1]).should.equal(fe[0], row[0] + ' from-end disagrees with from-start')
        row[2].should.equal(fe[1])
      })
    })

    it('names the right bytes', function () {
      pre.slice(0, 4).should.deep.equal(Buffer.from('01000000', 'hex'))
      pre.readUInt32LE(L - 4).should.equal(Signature.SIGHASH_ALL | Signature.SIGHASH_FORKID)
      pre.readUInt32LE(L - 4).should.equal(0x41)
      pre.readUInt32LE(L - 8).should.equal(1000) // nLockTime
      pre.readUInt32LE(L - 44).should.equal(0xfffffffe) // nSequence
      pre.readUInt32LE(L - 52).should.equal(SATS) // amount, low half
      // scriptCode is length-prefixed at 104 and IS the locking script
      pre[104].should.equal(25)
      pre.slice(105, 130).should.deep.equal(lock.toBuffer())
    })
  })

  describe('the zero-hash table', function () {
    var Z = Buffer.alloc(32)
    function hashes (type) {
      var f = H.fundAndSpend(lock, SATS, {
        outputs: [H.p2pkhOutput(key.toPublicKey(), SATS - 500), H.p2pkhOutput(key.toPublicKey(), 100)]
      })
      var pre = bsv.Transaction.sighash.sighashPreimage(
        f.spend, type, 0, lock, new BN(SATS), Interpreter.SCRIPT_ENABLE_SIGHASH_FORKID)
      return {
        prevouts: pre.slice(4, 36).equals(Z),
        sequence: pre.slice(36, 68).equals(Z),
        outputs: pre.slice(pre.length - 40, pre.length - 8).equals(Z)
      }
    }
    var F = Signature.SIGHASH_FORKID
    var S = Signature
    // [type, prevoutsZero, sequenceZero, outputsZero] exactly as the table states.
    var ROWS = [
      ['ALL', S.SIGHASH_ALL | F, false, false, false],
      ['NONE', S.SIGHASH_NONE | F, false, true, true],
      ['SINGLE', S.SIGHASH_SINGLE | F, false, true, false],
      ['ALL|ANYONECANPAY', S.SIGHASH_ALL | S.SIGHASH_ANYONECANPAY | F, true, true, false],
      ['SINGLE|ANYONECANPAY', S.SIGHASH_SINGLE | S.SIGHASH_ANYONECANPAY | F, true, true, false]
    ]
    ROWS.forEach(function (r) {
      it(r[0] + ' zeroes exactly what the table says', function () {
        var h = hashes(r[1])
        h.prevouts.should.equal(r[2], 'hashPrevouts')
        h.sequence.should.equal(r[3], 'hashSequence')
        h.outputs.should.equal(r[4], 'hashOutputs')
      })
    })

    it('so hashSequence is NOT zero for an ordinary 0x41 signature', function () {
      hashes(Signature.SIGHASH_ALL | F).sequence.should.equal(false)
    })
  })

  describe('the script fragments', function () {
    var pre = preimage()
    var L = pre.length

    // Run a fragment with the preimage on the stack; return the top item.
    function extract (build) {
      var s = new Script()
      build(s)
      var i = new Interpreter()
      var ok = i.verify(new Script().add(pre), s.add(Opcode.OP_1),
        new Transaction(), 0, Interpreter.mainnetFlags(), new BN(0))
      ok.should.equal(true, 'fragment failed: ' + i.errstr)
      return i.stack[i.stack.length - 2]
    }
    var n = function (x) { return (x >= 1 && x <= 16) ? Opcode['OP_' + x] : new BN(x).toScriptNumBuffer() }

    var CASES = [
      ['sighashType', function (s) { s.add(Opcode.OP_DUP).add(n(4)).add(Opcode.OP_RIGHT) }, L - 4, 4],
      ['nLockTime', function (s) { s.add(Opcode.OP_DUP).add(n(8)).add(Opcode.OP_RIGHT).add(n(4)).add(Opcode.OP_LEFT) }, L - 8, 4],
      ['hashOutputs', function (s) { s.add(Opcode.OP_DUP).add(n(40)).add(Opcode.OP_RIGHT).add(n(32)).add(Opcode.OP_LEFT) }, L - 40, 32],
      ['nSequence', function (s) { s.add(Opcode.OP_DUP).add(n(44)).add(Opcode.OP_RIGHT).add(n(4)).add(Opcode.OP_LEFT) }, L - 44, 4],
      ['amount', function (s) { s.add(Opcode.OP_DUP).add(n(52)).add(Opcode.OP_RIGHT).add(n(8)).add(Opcode.OP_LEFT) }, L - 52, 8],
      ['nVersion', function (s) { s.add(Opcode.OP_DUP).add(n(4)).add(Opcode.OP_LEFT) }, 0, 4]
    ]
    CASES.forEach(function (c) {
      it(c[0] + ' extracts the documented bytes', function () {
        extract(c[1]).should.deep.equal(pre.slice(c[2], c[2] + c[3]))
      })
    })

    it('hashOutputs agrees with the fragment the library itself emits', function () {
      var mine = new Script()
      PushTx.extractHashOutputs(mine)
      var i = new Interpreter()
      i.verify(new Script().add(pre), mine.add(Opcode.OP_1), new Transaction(), 0,
        Interpreter.mainnetFlags(), new BN(0)).should.equal(true)
      i.stack[i.stack.length - 2].should.deep.equal(pre.slice(L - 40, L - 8))
    })
  })

  // The warning is the most important thing on the page, so it is the thing most
  // worth asserting: the naive form is wrong, and the documented fix is right.
  describe('the OP_BIN2NUM warning', function () {
    function decode (hex, pad) {
      var s = new Script()
      if (pad) s.add(Buffer.from([0x00])).add(Opcode.OP_CAT)
      s.add(Opcode.OP_BIN2NUM)
      var i = new Interpreter()
      var ok = i.verify(new Script().add(Buffer.from(hex, 'hex')), s,
        new Transaction(), 0, Interpreter.mainnetFlags(), new BN(0))
      if (!ok) return i.errstr
      return BN.fromScriptNumBuffer(i.stack[i.stack.length - 1], false, 32000000).toString()
    }

    it('corrupts an unsigned nLockTime, exactly as documented', function () {
      decode('e8030000').should.equal('1000')
      decode('ffffff7f').should.equal('2147483647')
      decode('00000080').should.equal('SCRIPT_ERR_EVAL_FALSE_IN_STACK') // reads as 0
      decode('01000080').should.equal('-1')
      decode('ffffffff').should.equal('-2147483647')
    })

    it('and the sign-pad fixes every one of them', function () {
      decode('e8030000', true).should.equal('1000')
      decode('ffffff7f', true).should.equal('2147483647')
      decode('00000080', true).should.equal('2147483648')
      decode('01000080', true).should.equal('2147483649')
      decode('ffffffff', true).should.equal('4294967295')
    })

    it('and the padded push needs the era, as the page says', function () {
      var preGenesis = Interpreter.SCRIPT_VERIFY_P2SH | Interpreter.SCRIPT_VERIFY_STRICTENC
      var i = new Interpreter()
      i.verify(new Script().add(Buffer.from('00000080', 'hex')),
        new Script().add(Buffer.from([0x00])).add(Opcode.OP_CAT).add(Opcode.OP_BIN2NUM),
        new Transaction(), 0, preGenesis, new BN(0)).should.equal(false)
      i.errstr.should.equal('SCRIPT_ERR_INVALID_NUMBER_RANGE')
    })
  })

  // "Hashing the preimage does not authenticate it."
  describe('the authentication claim', function () {
    it('OP_HASH256 alone accepts a fabricated preimage', function () {
      // A script that only re-hashes and inspects: it cannot tell these apart.
      var fabricated = Buffer.alloc(182, 0x11)
      var checker = new Script().add(Opcode.OP_HASH256).add(Opcode.OP_DROP).add(Opcode.OP_1)
      var i = new Interpreter()
      i.verify(new Script().add(fabricated), checker, new Transaction(), 0,
        Interpreter.mainnetFlags(), new BN(0)).should.equal(true)
    })

    it('OP_PUSH_TX refuses the same fabricated preimage', function () {
      var auth = PushTx.authenticator()
      var fabricated = Buffer.alloc(182, 0x11)
      var i = new Interpreter()
      i.verify(new Script().add(fabricated), auth, new Transaction(), 0,
        Interpreter.mainnetFlags(), new BN(0)).should.equal(false)
    })

    it('and accepts the real one', function () {
      var auth = PushTx.authenticator()
      var f = H.fundAndSpend(auth, SATS, { outputs: [H.p2pkhOutput(key.toPublicKey(), SATS - 500)] })
      var g = PushTx.grind(f.spend, 0, auth, SATS)
      f.spend.inputs[0].setScript(new Script().add(g.preimage))
      H.verify(f.spend.inputs[0].script, auth, { tx: f.spend, satoshis: SATS }).ok.should.equal(true)
    })
  })
})
