'use strict'

/* global describe, it */

// The GDAF anchoring wrappers take (payload, privateKey, options) while the underlying
// SmartLedgerAnchor methods take (payload, metadata, utxos). Every wrapper forwarded
// `privateKey` into a slot that is not a key. For anchorCredential/anchorBatch it landed
// in `metadata`, which is JSON.stringify-ed straight into the OP_RETURN — so the secret
// scalar was broadcast, and the key was recoverable from chain data with an identical WIF.

require('chai').should()
var bsv = require('../..')

describe('GDAF anchoring never publishes key material', function () {
  var key = bsv.PrivateKey.fromBuffer(Buffer.alloc(32, 7))
  var utxos = [{
    txId: '11'.repeat(32),
    outputIndex: 0,
    script: bsv.Script.buildPublicKeyHashOut(key.toAddress()).toHex(),
    satoshis: 100000
  }]
  var HASH = 'ab'.repeat(32)

  function gdaf () { return new bsv.GDAF() }

  // Pull every OP_RETURN payload out of a built transaction, as UTF-8.
  function payloadsOf (result) {
    var tx = new bsv.Transaction((result.transaction || result.tx || result).toString())
    return tx.outputs.map(function (o) {
      var asm = o.script.toASM().split(' ')
      return Buffer.from(asm[asm.length - 1], 'hex').toString('utf8')
    })
  }

  function assertNoSecret (result) {
    var scalarHex = key.bn.toString('hex')
    var raw = (result.transaction || result.tx || result).toString()
    raw.indexOf(Buffer.from(scalarHex, 'utf8').toString('hex')).should.equal(-1)
    raw.indexOf(Buffer.from('"bn"', 'utf8').toString('hex')).should.equal(-1)
    payloadsOf(result).forEach(function (p) {
      p.indexOf(scalarHex).should.equal(-1)
      p.indexOf('"bn"').should.equal(-1)
    })
  }

  it('anchorCredential does not put the key in the OP_RETURN', function () {
    return gdaf().anchorCredential(HASH, key, utxos).then(assertNoSecret)
  })

  it('anchorBatch does not put the key in the OP_RETURN', function () {
    return gdaf().anchorBatch([HASH, 'cd'.repeat(32)], key, utxos).then(assertNoSecret)
  })

  it('accepts the documented { utxos, metadata } options shape', function () {
    return gdaf().anchorCredential(HASH, key, { utxos: utxos, metadata: { issuer: 'did:web:example' } })
      .then(function (r) {
        assertNoSecret(r)
        // The caller's own metadata still reaches the chain.
        payloadsOf(r).join('').indexOf('did:web:example').should.not.equal(-1)
      })
  })

  it('still accepts a bare UTXO array, the only shape that used to work', function () {
    return gdaf().anchorCredential(HASH, key, utxos).then(function (r) {
      r.should.be.an('object')
    })
  })

  // Defence in depth: even reaching the payload builder with key material must fail
  // loudly rather than broadcast it.
  it('refuses to anchor metadata containing a PrivateKey instance', function () {
    return gdaf().anchorCredential(HASH, key, { utxos: utxos, metadata: { signer: key } })
      .then(function () { throw new Error('should not have anchored') },
        function (err) { err.message.should.match(/Refusing to anchor/) })
  })

  it('refuses to anchor metadata carrying a key-shaped field', function () {
    return gdaf().anchorCredential(HASH, key, { utxos: utxos, metadata: { wif: key.toWIF() } })
      .then(function () { throw new Error('should not have anchored') },
        function (err) { err.message.should.match(/looks like key material/) })
  })

  it('leaves ordinary metadata alone', function () {
    return gdaf().anchorCredential(HASH, key, {
      utxos: utxos, metadata: { id: 'urn:uuid:1', nested: { note: 'fine' } }
    }).then(function (r) { assertNoSecret(r) })
  })
})
