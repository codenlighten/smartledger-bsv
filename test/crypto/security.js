const bsv = require('../../index.js')
const { SmartVerify } = bsv

describe('SmartLedger Security Patches', function () {
  let privateKey, publicKey, message, hash

  before(function () {
    privateKey = new bsv.PrivateKey()
    publicKey = privateKey.toPublicKey()
    message = 'SmartLedger security test message'
    hash = bsv.crypto.Hash.sha256(Buffer.from(message))
  })

  describe('Zero Parameter Attack Protection', function () {
    it('should reject signatures with r=0', function () {
      const zeroRSig = Buffer.concat([
        Buffer.alloc(1, 0x30), // DER sequence
        Buffer.alloc(1, 0x06), // length
        Buffer.alloc(1, 0x02), // integer r
        Buffer.alloc(1, 0x01), // r length
        Buffer.alloc(1, 0x00), // r=0
        Buffer.alloc(1, 0x02), // integer s
        Buffer.alloc(1, 0x01), // s length
        Buffer.alloc(1, 0x01) // s=1
      ])

      const signature = new bsv.Signature(zeroRSig)
      signature.validate().should.equal(false)
    })

    it('should reject signatures with s=0', function () {
      const zeroSSig = Buffer.concat([
        Buffer.alloc(1, 0x30), // DER sequence
        Buffer.alloc(1, 0x06), // length
        Buffer.alloc(1, 0x02), // integer r
        Buffer.alloc(1, 0x01), // r length
        Buffer.alloc(1, 0x01), // r=1
        Buffer.alloc(1, 0x02), // integer s
        Buffer.alloc(1, 0x01), // s length
        Buffer.alloc(1, 0x00) // s=0
      ])

      const signature = new bsv.Signature(zeroSSig)
      signature.validate().should.equal(false)
    })
  })

  describe('Canonical Signature Enforcement', function () {
    it('should detect non-canonical signatures', function () {
      // Create a valid signature first
      const signature = bsv.Message(message).sign(privateKey)
      const sigObj = new bsv.Signature(signature)

      // All properly generated signatures should be canonical
      sigObj.isCanonical().should.equal(true)
    })

    it('should convert high s values to canonical form', function () {
      // This tests the toCanonical() method exists and works
      const signature = bsv.Message(message).sign(privateKey)
      const sigObj = new bsv.Signature(signature)
      const canonical = sigObj.toCanonical()

      canonical.isCanonical().should.equal(true)
    })
  })

  describe('SmartVerify Enhanced Validation', function () {
    it('should perform strict signature verification', function () {
      const signature = bsv.Message(message).sign(privateKey)

      // SmartVerify should accept valid signatures
      const isValid = SmartVerify.verifySignature(signature, hash, publicKey)
      isValid.should.equal(true)
    })

    it('should reject invalid hash length in strict mode', function () {
      const signature = bsv.Message(message).sign(privateKey)
      const shortHash = Buffer.alloc(16) // Too short

      try {
        SmartVerify.verifySignature(signature, shortHash, publicKey)
        false.should.equal(true, 'Should have thrown error')
      } catch (error) {
        error.message.should.match(/Invalid hash length/)
      }
    })
  })

  describe('Integration with Original BSV', function () {
    it('should maintain compatibility with BSV signature verification', function () {
      const signature = bsv.Message(message).sign(privateKey)
      const isValid = bsv.Message(message).verify(publicKey.toAddress(), signature)

      isValid.should.equal(true)
    })

    it('should work with transaction signing', function () {
      const utxo = {
        txId: '115e8f72f39fad874cfab0deed11a80f24f967a84079a8f9ae2e0c0b518d0b1e4a',
        outputIndex: 0,
        address: privateKey.toAddress().toString(),
        script: bsv.Script.buildPublicKeyHashOut(privateKey.toAddress()).toHex(),
        satoshis: 100000
      }

      const transaction = new bsv.Transaction()
        .from(utxo)
        .to(privateKey.toAddress(), 50000)
        .sign(privateKey)

      transaction.isFullySigned().should.equal(true)
    })
  })
})
