'use strict'

/* global describe, it */

// What each sighash mode actually COMMITS TO, pinned against the node's own rule rather
// than against our output.
//
// BIP-143's three digests are not always digests: `uint256` default-constructs to zero in
// the node, so a branch that never assigns one leaves 32 zero bytes in the preimage.
// bitcoin-sv v1.2.3 `src/script/interpreter.cpp` (SignatureHash) states the conditions:
//
//   hashPrevouts  assigned unless ANYONECANPAY
//   hashSequence  assigned unless ANYONECANPAY or base type SINGLE or NONE
//   hashOutputs   all outputs   when base type is neither SINGLE nor NONE
//                 dsha256(vout[nIn]) when SINGLE and nIn < vout.size()
//                 left ZERO     otherwise  <- SINGLE with nIn out of range, and NONE
//
// The last line is the one that costs money. A covenant GENERATOR that computes its
// expected hashOutputs from an out-of-range index bakes in 32 zeros, and the script then
// matches anything while looking exactly like a correct pin: the mode was pinned, the pin
// was vacuous. `PushTx.valueCovenantSingle` refuses an all-zero pin for that reason
// (9.28.0, test/smart_contract/single_output_covenant.js) -- this file pins the layer
// underneath it, so a change in our sighash cannot quietly move what a covenant relies on.
//
// Cross-checked three ways on 2026-10-17: these assertions, the conditions in the node
// source above, and an independent session's compiled v1.2.3 oracle on the same shape.

require('chai').should()
var bsv = require('../..')
var S = bsv.crypto.Signature
var Sighash = bsv.Transaction.Sighash
var Hash = bsv.crypto.Hash
var BN = bsv.crypto.BN

var ZERO = '0'.repeat(64)
// 4 version + 32 + 32 + 36 outpoint + 1 push length + 25 p2pkh + 8 amount + 4 nSequence
var HASH_OUTPUTS_AT = 142

function fixture () {
  var priv = bsv.PrivateKey.fromBuffer(Buffer.from('7c'.repeat(32), 'hex'))
  var addr = priv.toAddress()
  var spk = bsv.Script.buildPublicKeyHashOut(addr)
  var utxo = function (i, sats) {
    return new bsv.Transaction.UnspentOutput({
      txId: 'b'.repeat(63) + i, outputIndex: i, script: spk.toHex(), satoshis: sats
    })
  }
  // two inputs with DIFFERENT amounts, so "its own amount" is falsifiable
  var tx = new bsv.Transaction().from(utxo(0, 11111)).from(utxo(1, 77777))
  tx.to(addr, 5000)
  tx.to(bsv.PrivateKey.fromBuffer(Buffer.from('7d'.repeat(32), 'hex')).toAddress(), 6000)
  tx.inputs.forEach(function (i) { i.sequenceNumber = 0xfffffffe })
  tx.nLockTime = 800000
  return { tx: tx, spk: spk, amounts: [11111, 77777] }
}

function preimage (f, idx, baseType) {
  return Sighash.sighashPreimage(f.tx, baseType | S.SIGHASH_FORKID, idx, f.spk,
    new BN(f.amounts[idx]))
}

function at (buf, offset) { return buf.slice(offset, offset + 32).toString('hex') }

describe('sighash commitment table', function () {
  var ACP = S.SIGHASH_ANYONECANPAY

  // mode -> [hashPrevouts zero?, hashSequence zero?, hashOutputs zero?]
  var TABLE = [
    ['ALL', S.SIGHASH_ALL, false, false, false],
    ['SINGLE', S.SIGHASH_SINGLE, false, true, false],
    ['NONE', S.SIGHASH_NONE, false, true, true],
    ['ALL|ANYONECANPAY', S.SIGHASH_ALL | ACP, true, true, false],
    ['SINGLE|ANYONECANPAY', S.SIGHASH_SINGLE | ACP, true, true, false],
    ['NONE|ANYONECANPAY', S.SIGHASH_NONE | ACP, true, true, true]
  ]

  TABLE.forEach(function (row) {
    it('zeroes exactly the documented digests under ' + row[0], function () {
      var f = fixture()
      var p = preimage(f, 0, row[1])
      ;(at(p, 4) === ZERO).should.equal(row[2], 'hashPrevouts under ' + row[0])
      ;(at(p, 36) === ZERO).should.equal(row[3], 'hashSequence under ' + row[0])
      ;(at(p, HASH_OUTPUTS_AT) === ZERO).should.equal(row[4], 'hashOutputs under ' + row[0])
    })
  })

  it('derives hashOutputs from ALL outputs under ALL, and from vout[nIn] alone under SINGLE',
    function () {
      var f = fixture()
      var outs = f.tx.outputs.map(function (o) { return o.toBufferWriter().toBuffer() })
      at(preimage(f, 0, S.SIGHASH_ALL), HASH_OUTPUTS_AT)
        .should.equal(Hash.sha256sha256(Buffer.concat(outs)).toString('hex'))
      at(preimage(f, 0, S.SIGHASH_SINGLE), HASH_OUTPUTS_AT)
        .should.equal(Hash.sha256sha256(outs[0]).toString('hex'))
      // and they must differ, or the two assertions above could both hold vacuously
      at(preimage(f, 0, S.SIGHASH_ALL), HASH_OUTPUTS_AT)
        .should.not.equal(at(preimage(f, 0, S.SIGHASH_SINGLE), HASH_OUTPUTS_AT))
    })

  it('leaves hashOutputs ZERO for SINGLE at an index past the last output', function () {
    var f = fixture()
    f.tx.outputs.length = 1 // 2 inputs, 1 output: nIn = 1 is out of range
    at(preimage(f, 1, S.SIGHASH_SINGLE), HASH_OUTPUTS_AT).should.equal(ZERO)
    // in range at the same mode is a real digest, so the above is about the INDEX
    at(preimage(f, 0, S.SIGHASH_SINGLE), HASH_OUTPUTS_AT).should.not.equal(ZERO)
  })

  it('carries only the signed input\'s own amount', function () {
    var f = fixture()
    // amount sits after version, the two digests, the outpoint and the pushed scriptCode
    var AMOUNT_AT = 4 + 32 + 32 + 36 + 1 + 25
    var read = function (idx) {
      return preimage(f, idx, S.SIGHASH_ALL).readUInt32LE(AMOUNT_AT)
    }
    read(0).should.equal(11111)
    read(1).should.equal(77777)
  })

  it('consumes the whole preimage: 10 fields and nothing after the sighash type', function () {
    var f = fixture()
    var p = preimage(f, 0, S.SIGHASH_ALL)
    p.length.should.equal(4 + 32 + 32 + 36 + 1 + 25 + 8 + 4 + 32 + 4 + 4)
    p.readUInt32LE(p.length - 8).should.equal(800000) // nLockTime
    p.readUInt32LE(p.length - 4).should.equal(S.SIGHASH_ALL | S.SIGHASH_FORKID)
  })
})
