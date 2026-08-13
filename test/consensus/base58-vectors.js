'use strict'

/**
 * Base58 and Base58Check vectors from SV Node v1.2.0.
 *
 * `base58_encode_decode.json` had no counterpart in the inherited bitcoind
 * corpus and nothing else here exercises it. It is small, but it is the only
 * place the raw codec is pinned against the node in both directions, and it
 * carries the two cases an implementation gets wrong: the empty input, and
 * leading zero bytes, which base58 encodes as leading '1's rather than as part
 * of a number.
 *
 * The key vectors are content-identical to the bitcoind copies that
 * test/address.js and test/privatekey.js already use — same 50 rows, different
 * whitespace. They are run here against the SV copies regardless, so that the
 * corpus under test/data/bitcoin-sv is the one this library is measured
 * against. That directory is the declared specification, and re-copying it
 * from a newer node tag should move these tests with it.
 */

require('chai').should()
const bsv = require('../..')
const Base58 = bsv.encoding.Base58
const Base58Check = bsv.encoding.Base58Check
const Address = bsv.Address
const PrivateKey = bsv.PrivateKey

const encodeDecode = require('../data/bitcoin-sv/base58_encode_decode.json')
const keysValid = require('../data/bitcoin-sv/base58_keys_valid.json')
const keysInvalid = require('../data/bitcoin-sv/base58_keys_invalid.json')

describe('base58 vectors (SV Node v1.2.0)', function () {
  describe('the raw codec', function () {
    it('encodes every vector to the recorded string', function () {
      encodeDecode.forEach(function (v, i) {
        Base58.encode(Buffer.from(v[0], 'hex'))
          .should.equal(v[1], 'encoding row ' + i + ' (' + v[0] + ')')
      })
    })

    it('decodes every vector back to the recorded bytes', function () {
      encodeDecode.forEach(function (v, i) {
        Base58.decode(v[1]).toString('hex')
          .should.equal(v[0], 'decoding row ' + i + ' (' + JSON.stringify(v[1]) + ')')
      })
    })

    it('keeps leading zero bytes as leading ones', function () {
      // Ten zero bytes encode as ten '1's. An implementation that treats the
      // input purely as a number loses them, and every address starting 1
      // depends on this.
      Base58.encode(Buffer.alloc(10)).should.equal('1111111111')
      Base58.decode('1111111111').should.deep.equal(Buffer.alloc(10))
    })

    it('round-trips the empty input', function () {
      Base58.encode(Buffer.alloc(0)).should.equal('')
      Base58.decode('').length.should.equal(0)
    })
  })

  describe('keys and addresses', function () {
    it('accepts every valid key vector', function () {
      let addresses = 0
      let privkeys = 0
      keysValid.forEach(function (v, i) {
        const str = v[0]
        const meta = v[2]
        if (meta.isPrivkey) {
          const key = PrivateKey.fromWIF(str)
          key.toWIF().should.equal(str, 'WIF round trip at ' + i)
          privkeys++
        } else {
          const network = meta.isTestnet ? 'testnet' : 'livenet'
          const address = Address.fromString(str, network)
          address.toString().should.equal(str, 'address round trip at ' + i)
          address.hashBuffer.toString('hex')
            .should.equal(v[1], 'hash at ' + i)
          address.type.should.equal(
            meta.addrType === 'script' ? Address.PayToScriptHash : Address.PayToPublicKeyHash,
            'type at ' + i)
          addresses++
        }
      })
      // Both kinds must actually have been reached.
      addresses.should.be.above(0)
      privkeys.should.be.above(0)
    })

    it('rejects every invalid key vector, as neither address nor key', function () {
      // The claim these vectors make is that the string is not a valid address
      // and not a valid WIF — not that it fails Base58Check. Several of them
      // carry a perfectly good checksum and are simply the wrong length or
      // version, so the checksum layer accepts them and the layer above is
      // what has to refuse. Asserting the stronger thing would be asserting
      // something the corpus does not say.
      let checksumOk = 0
      keysInvalid.forEach(function (v, i) {
        const str = v[0]
        Address.isValid(str).should.equal(false, 'Address accepted row ' + i)

        let isKey = true
        try {
          PrivateKey.fromWIF(str)
        } catch (e) {
          isKey = false
        }
        isKey.should.equal(false, 'PrivateKey accepted row ' + i)

        try {
          Base58Check.decode(str)
          checksumOk++
        } catch (e) { /* a bad checksum is one way to be invalid, not the only one */ }
      })
      // Guards the reasoning above: if none of them had a valid checksum, this
      // test would be weaker than it looks and Base58Check could be asserted.
      checksumOk.should.be.above(0)
    })
  })
})
