'use strict'

/* global describe, it */

// 1Sat Ordinals inscription build/parse round-trip + output construction.

require('chai').should()
var bsv = require('../..')
var Ord = bsv.Ordinals

describe('Ordinals inscriptions', function () {
  var key = bsv.PrivateKey.fromRandom()
  var address = key.toAddress()

  it('builds a P2PKH inscription and round-trips through parse', function () {
    var s = Ord.buildInscription({
      address: address, contentType: 'text/plain', content: 'hello ordinals'
    })
    var parsed = Ord.parseInscription(s)
    parsed.should.be.an('object')
    parsed.contentType.should.equal('text/plain')
    parsed.contentText.should.equal('hello ordinals')
    // The base lock is exactly the P2PKH for the address.
    parsed.lock.toHex().should.equal(bsv.Script.buildPublicKeyHashOut(address).toHex())
  })

  it('preserves binary content and content-type exactly', function () {
    var content = bsv.crypto.Random.getRandomBuffer(64)
    var s = Ord.buildInscription({ address: address, contentType: 'image/png', content: content })
    var parsed = Ord.parseInscription(s)
    parsed.contentType.should.equal('image/png')
    parsed.content.equals(content).should.equal(true)
  })

  it('round-trips through hex serialization', function () {
    var s = Ord.buildInscription({ address: address, contentType: 'application/json', content: '{"a":1}' })
    var parsed = Ord.parseInscription(s.toHex())
    parsed.contentText.should.equal('{"a":1}')
    parsed.contentType.should.equal('application/json')
  })

  it('accepts a custom base lock script', function () {
    var lock = bsv.Script.buildPublicKeyHashOut(address)
    var s = Ord.buildInscription({ lock: lock, contentType: 'text/plain', content: 'x' })
    Ord.isInscription(s).should.equal(true)
    Ord.parseInscription(s).lock.toHex().should.equal(lock.toHex())
  })

  it('isInscription is false for a plain P2PKH script', function () {
    var p2pkh = bsv.Script.buildPublicKeyHashOut(address)
    Ord.isInscription(p2pkh).should.equal(false)
    var isNull = Ord.parseInscription(p2pkh) === null
    isNull.should.equal(true)
  })

  it('createInscriptionOutput is a 1-sat output carrying the inscription', function () {
    var out = Ord.createInscriptionOutput({ address: address, contentType: 'text/plain', content: 'hi' })
    out.satoshis.should.equal(1)
    Ord.isInscription(out.script).should.equal(true)
  })

  it('batchInscriptionOutputs builds one output per item', function () {
    var outs = Ord.batchInscriptionOutputs([
      { address: address, contentType: 'text/plain', content: 'a' },
      { address: address, contentType: 'text/plain', content: 'b' }
    ])
    outs.length.should.equal(2)
    Ord.parseInscription(outs[0].script).contentText.should.equal('a')
    Ord.parseInscription(outs[1].script).contentText.should.equal('b')
  })
})
