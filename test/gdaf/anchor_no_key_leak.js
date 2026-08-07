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
        function (err) { err.message.should.match(/key material/) })
  })

  it('leaves ordinary metadata alone', function () {
    return gdaf().anchorCredential(HASH, key, {
      utxos: utxos, metadata: { id: 'urn:uuid:1', nested: { note: 'fine' } }
    }).then(function (r) { assertNoSecret(r) })
  })
  // The guard keyed off field NAMES alone, which was wrong in both directions: it
  // rejected `{ d: '2026-01-01' }` as key material while publishing a real WIF stored
  // under `note`. Detection is now by value as well as name.
  describe('detects key material by value, not just by field name', function () {
    var Anchor = require('../../lib/gdaf/smartledger-anchor.js')
    var other = bsv.PrivateKey.fromBuffer(Buffer.alloc(32, 99))
    var HASH_BUF = bsv.crypto.Hash.sha256(Buffer.from('doc'))

    function build (metadata) {
      return new Anchor(key, {})._createAnchorPayload('CREDENTIAL', HASH_BUF, metadata)
    }
    function refuses (label, metadata) {
      it('refuses ' + label, function () {
        ;(function () { build(metadata) }).should.throw(/Refusing to anchor/)
      })
    }
    function accepts (label, metadata) {
      it('accepts ' + label, function () {
        var payload = Buffer.from(build(metadata)).toString('utf8')
        payload.indexOf(key.toWIF()).should.equal(-1)
      })
    }

    // Self-identifying secrets: the encoding says "private key" whatever the field is
    // called. Naming a WIF `note` does not make it safe to publish.
    refuses('a WIF under an innocuous name', { note: other.toWIF() })
    refuses('an xprv under an innocuous name', {
      ref: bsv.HDPrivateKey.fromSeed(Buffer.alloc(32, 1)).toString()
    })
    refuses('a BIP39 mnemonic under an innocuous name', {
      memo: 'abandon abandon abandon abandon abandon abandon abandon abandon abandon abandon abandon about'
    })
    refuses('a secret nested in an array', { signers: [other.toWIF()] })

    // The anchor's OWN key, in any representation — the exact defect this guard exists
    // for. A bare hex scalar is otherwise indistinguishable from a hash, so knowing our
    // own key is what makes this catchable.
    refuses("the anchor's own key as a raw hex scalar", { backup: key.toString() })
    refuses("the anchor's own key as a WIF", { backup: key.toWIF() })

    // Ambiguous names are refused only when the value really is secret.
    refuses('d holding a private scalar', { d: other.toString() })
    refuses('seed holding a mnemonic', {
      seed: 'abandon abandon abandon abandon abandon abandon abandon abandon abandon abandon abandon about'
    })

    // ...and left alone otherwise. Anchoring a document hash is the module's purpose,
    // and a 64-hex hash cannot be told apart from a scalar, so it must not be rejected.
    accepts('d as a date', { d: '2026-01-01' })
    accepts('seed as a campaign name', { seed: 'spring-campaign' })
    accepts('a SHA-256 document hash', { docHash: bsv.crypto.Hash.sha256(Buffer.from('x')).toString('hex') })
    accepts('key used as an ordinary label', { key: 'value' })

    // Public material is not secret and an anchor legitimately references it.
    accepts('an address', { payTo: key.toAddress().toString() })
    accepts('a public key', { pub: key.toPublicKey().toString() })
    accepts('an xpub', { xpub: bsv.HDPrivateKey.fromSeed(Buffer.alloc(32, 1)).hdPublicKey.toString() })
  })
})
