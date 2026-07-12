'use strict'

/* global describe, it */

// BSV-20 / BSV-21 fungible-token inscriptions: build/parse round-trips + validation.

require('chai').should()
var bsv = require('../..')
var B = bsv.Ordinals.BSV20
var Ord = bsv.Ordinals

describe('Ordinals BSV-20 fungible tokens', function () {
  var key = bsv.PrivateKey.fromRandom()
  var address = key.toAddress()

  it('deploys a v1 ticker token and round-trips through parse', function () {
    var s = B.buildDeploy({ address: address, tick: 'ORDI', max: '21000000', lim: '1000', dec: 18 })
    var p = B.parseBsv20(s)
    p.p.should.equal('bsv-20')
    p.op.should.equal('deploy')
    p.tick.should.equal('ORDI')
    p.max.should.equal('21000000')
    p.lim.should.equal('1000')
    p.dec.should.equal('18')
    // The payload rides in an inscription with the bsv-20 content-type.
    Ord.parseInscription(s).contentType.should.equal('application/bsv-20')
    // The base lock is the owner's P2PKH.
    Ord.parseInscription(s).lock.toHex().should.equal(bsv.Script.buildPublicKeyHashOut(address).toHex())
  })

  it('mints and transfers a v1 ticker token', function () {
    var mint = B.parseBsv20(B.buildMint({ address: address, tick: 'ORDI', amt: '1000' }))
    mint.op.should.equal('mint')
    mint.tick.should.equal('ORDI')
    mint.amt.should.equal('1000')

    var xfer = B.parseBsv20(B.buildTransfer({ address: address, tick: 'ORDI', amt: '250' }))
    xfer.op.should.equal('transfer')
    xfer.tick.should.equal('ORDI')
    xfer.amt.should.equal('250')
  })

  it('deploy+mints a BSV-21 (id-based) token and transfers by id', function () {
    var dm = B.parseBsv20(B.buildDeployMint({ address: address, amt: '1000000', dec: 8, sym: 'XYZ' }))
    dm.op.should.equal('deploy+mint')
    dm.amt.should.equal('1000000')
    dm.dec.should.equal('8')
    dm.sym.should.equal('XYZ')

    var id = 'a'.repeat(64) + '_0'
    var xfer = B.parseBsv20(B.buildTransfer({ address: address, id: id, amt: '5' }))
    xfer.op.should.equal('transfer')
    xfer.id.should.equal(id)
    xfer.amt.should.equal('5')
    ;(xfer.tick === undefined).should.equal(true)
  })

  it('preserves integer amounts larger than 2^53 exactly (string, never a JS number)', function () {
    var huge = '99999999999999999999999999'
    var p = B.parseBsv20(B.buildMint({ address: address, tick: 'BIG', amt: huge }))
    p.amt.should.equal(huge)
  })

  it('accepts numeric amounts and normalizes them to strings', function () {
    var p = B.parseBsv20(B.buildMint({ address: address, tick: 'NUM', amt: 42 }))
    p.amt.should.equal('42')
  })

  // Code-review finding #4: leading-zero integer strings are canonicalized (indexers expect
  // canonical decimals), while preserving arbitrary precision.
  it('canonicalizes leading-zero amount strings', function () {
    B.parseBsv20(B.buildMint({ address: address, tick: 'ORDI', amt: '007' })).amt.should.equal('7')
    B.parseBsv20(B.buildDeploy({ address: address, tick: 'ORDI', max: '000100' })).max.should.equal('100')
    // canonicalization does not corrupt a huge value
    var huge = '90000000000000000000000000'
    B.parseBsv20(B.buildMint({ address: address, tick: 'ORDI', amt: '0' + huge })).amt.should.equal(huge)
  })

  it('builds a 1-sat token output', function () {
    var out = B.createMintOutput({ address: address, tick: 'ORDI', amt: '1' })
    out.satoshis.should.equal(1)
    B.isBsv20(out.script).should.equal(true)
  })

  it('round-trips through hex serialization', function () {
    var s = B.buildDeploy({ address: address, tick: 'HEX', max: '1000' })
    var p = B.parseBsv20(s.toHex())
    p.tick.should.equal('HEX')
    p.max.should.equal('1000')
  })

  it('parses a raw JSON string or an already-parsed object', function () {
    var json = '{"p":"bsv-20","op":"mint","tick":"ORDI","amt":"1"}'
    B.parseBsv20(json).amt.should.equal('1')
    B.parseBsv20({ p: 'bsv-20', op: 'mint', tick: 'ORDI', amt: '1' }).op.should.equal('mint')
  })

  it('isBsv20 is false for a plain inscription and a P2PKH script', function () {
    var plain = Ord.buildInscription({ address: address, contentType: 'text/plain', content: 'hi' })
    B.isBsv20(plain).should.equal(false)
    B.isBsv20(bsv.Script.buildPublicKeyHashOut(address)).should.equal(false)
    ;(B.parseBsv20(plain) === null).should.equal(true)
  })

  describe('validation', function () {
    it('rejects a tick longer than 4 UTF-8 bytes', function () {
      ;(function () { B.buildDeploy({ address: address, tick: 'TOOLONG', max: '1' }) }).should.throw(/1–4 UTF-8 bytes/)
    })
    it('rejects a non-integer / negative amount', function () {
      ;(function () { B.buildMint({ address: address, tick: 'ORDI', amt: '1.5' }) }).should.throw(/non-negative integer/)
      ;(function () { B.buildMint({ address: address, tick: 'ORDI', amt: -5 }) }).should.throw(/non-negative integer/)
    })
    it('rejects a zero amount for mint/transfer', function () {
      ;(function () { B.buildMint({ address: address, tick: 'ORDI', amt: '0' }) }).should.throw(/greater than zero/)
    })
    it('rejects dec out of the 0…18 range', function () {
      ;(function () { B.buildDeploy({ address: address, tick: 'ORDI', max: '1', dec: 19 }) }).should.throw(/dec must be/)
    })
    it('rejects a malformed BSV-21 id', function () {
      ;(function () { B.buildTransfer({ address: address, id: 'notanid', amt: '1' }) }).should.throw(/txid.*vout|<txid>/)
    })
    it('requires an owner (address or lock)', function () {
      ;(function () { B.buildMint({ tick: 'ORDI', amt: '1' }) }).should.throw(/address or a lock/)
    })
  })
})
