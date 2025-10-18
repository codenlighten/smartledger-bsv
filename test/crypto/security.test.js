'use strict';

/**
 * SmartLedger Security Test Suite
 * Tests for all hardened crypto functionality and security fixes
 */

const assert = require('assert');
const crypto = require('crypto');

// Import both original and hardened BSV
const originalBSV = require('bsv');
const hardenedBSV = require('../index');

describe('SmartLedger BSV Security Tests', function() {
  
  describe('Basic Functionality', function() {
    it('should maintain version compatibility', function() {
      assert(hardenedBSV.isHardened);
      assert(hardenedBSV.version === '1.5.6-fix1');
      assert(hardenedBSV.baseVersion);
    });
    
    it('should export all original BSV modules', function() {
      assert(hardenedBSV.Address);
      assert(hardenedBSV.PrivateKey);
      assert(hardenedBSV.PublicKey);
      assert(hardenedBSV.Transaction);
      assert(hardenedBSV.Script);
    });
    
    it('should export enhanced crypto modules', function() {
      assert(hardenedBSV.crypto.ECDSA);
      assert(hardenedBSV.crypto.Signature);
      assert(hardenedBSV.crypto.SmartVerify);
      assert(hardenedBSV.crypto.EllipticFixed);
    });
  });
  
  describe('Signature Canonicalization', function() {
    let testKey, testMessage, testHash;
    
    beforeEach(function() {
      testKey = new originalBSV.PrivateKey();
      testMessage = 'SmartLedger security test';
      testHash = originalBSV.crypto.Hash.sha256(Buffer.from(testMessage));
    });
    
    it('should enforce canonical signatures (s <= n/2)', function() {
      const sig = hardenedBSV.crypto.ECDSA.sign(testHash, testKey);
      
      // Check that signature is canonical
      assert(sig.isCanonical(), 'Signature should be canonical');
      assert(sig.s.lte(hardenedBSV.crypto.SmartVerify.constants.nh), 's should be <= n/2');
    });
    
    it('should canonicalize non-canonical signatures', function() {
      // Create a signature with high s value
      const originalSig = originalBSV.crypto.ECDSA.sign(testHash, testKey);
      const n = hardenedBSV.crypto.SmartVerify.constants.n;
      const nh = hardenedBSV.crypto.SmartVerify.constants.nh;
      
      // Force high s value
      if (originalSig.s.lte(nh)) {
        originalSig.s = n.sub(originalSig.s);
      }
      
      // Verify it's non-canonical
      assert(originalSig.s.gt(nh), 'Test signature should have high s');
      
      // Process through hardened signature
      const hardenedSig = new hardenedBSV.crypto.Signature(originalSig.r, originalSig.s);
      const canonical = hardenedSig.toCanonical();
      
      assert(canonical.isCanonical(), 'Canonicalized signature should be canonical');
      assert(canonical.s.lte(nh), 'Canonicalized s should be <= n/2');
    });
    
    it('should reject zero r or s values', function() {
      const BN = originalBSV.crypto.BN;
      
      assert.throws(() => {
        new hardenedBSV.crypto.Signature(new BN(0), new BN(42));
      }, /zero r or s/);
      
      assert.throws(() => {
        new hardenedBSV.crypto.Signature(new BN(42), new BN(0));
      }, /zero r or s/);
    });
    
    it('should reject out-of-range r or s values', function() {
      const BN = originalBSV.crypto.BN;
      const n = hardenedBSV.crypto.SmartVerify.constants.n;
      
      assert.throws(() => {
        new hardenedBSV.crypto.Signature(n, new BN(42));
      }, /out of range/);
      
      assert.throws(() => {
        new hardenedBSV.crypto.Signature(new BN(42), n);
      }, /out of range/);
    });
  });
  
  describe('ECDSA Verification Security', function() {
    let testKey, testPubKey, testMessage, testHash;
    
    beforeEach(function() {
      testKey = new originalBSV.PrivateKey();
      testPubKey = testKey.toPublicKey();
      testMessage = 'SmartLedger verification test';
      testHash = originalBSV.crypto.Hash.sha256(Buffer.from(testMessage));
    });
    
    it('should verify valid signatures', function() {
      const sig = hardenedBSV.crypto.ECDSA.sign(testHash, testKey);
      const isValid = hardenedBSV.crypto.ECDSA.verify(testHash, sig, testPubKey);
      
      assert(isValid, 'Valid signature should verify');
    });
    
    it('should reject signatures with zero r', function() {
      const sig = hardenedBSV.crypto.ECDSA.sign(testHash, testKey);
      sig.r = new originalBSV.crypto.BN(0);
      
      const isValid = hardenedBSV.crypto.ECDSA.verify(testHash, sig, testPubKey);
      assert(!isValid, 'Signature with zero r should be rejected');
    });
    
    it('should reject signatures with zero s', function() {
      const sig = hardenedBSV.crypto.ECDSA.sign(testHash, testKey);
      sig.s = new originalBSV.crypto.BN(0);
      
      const isValid = hardenedBSV.crypto.ECDSA.verify(testHash, sig, testPubKey);
      assert(!isValid, 'Signature with zero s should be rejected');
    });
    
    it('should reject signatures with r >= n', function() {
      const sig = hardenedBSV.crypto.ECDSA.sign(testHash, testKey);
      const n = hardenedBSV.crypto.SmartVerify.constants.n;
      sig.r = n;
      
      const isValid = hardenedBSV.crypto.ECDSA.verify(testHash, sig, testPubKey);
      assert(!isValid, 'Signature with r >= n should be rejected');
    });
    
    it('should reject signatures with s >= n', function() {
      const sig = hardenedBSV.crypto.ECDSA.sign(testHash, testKey);
      const n = hardenedBSV.crypto.SmartVerify.constants.n;
      sig.s = n;
      
      const isValid = hardenedBSV.crypto.ECDSA.verify(testHash, sig, testPubKey);
      assert(!isValid, 'Signature with s >= n should be rejected');
    });
    
    it('should handle high s values by canonicalizing', function() {
      const sig = hardenedBSV.crypto.ECDSA.sign(testHash, testKey);
      const n = hardenedBSV.crypto.SmartVerify.constants.n;
      const nh = hardenedBSV.crypto.SmartVerify.constants.nh;
      
      // Force high s
      if (sig.s.lte(nh)) {
        sig.s = n.sub(sig.s);
      }
      
      // Should still verify after internal canonicalization
      const isValid = hardenedBSV.crypto.ECDSA.verify(testHash, sig, testPubKey);
      assert(isValid, 'High s signature should verify after canonicalization');
    });
  });
  
  describe('SmartVerify Function', function() {
    let testKey, testPubKey, testMessage, testHash;
    
    beforeEach(function() {
      testKey = new originalBSV.PrivateKey();
      testPubKey = testKey.toPublicKey();
      testMessage = 'SmartLedger smartVerify test';
      testHash = originalBSV.crypto.Hash.sha256(Buffer.from(testMessage));
    });
    
    it('should verify valid signatures', function() {
      const sig = hardenedBSV.crypto.ECDSA.sign(testHash, testKey);
      const isValid = hardenedBSV.crypto.SmartVerify.smartVerify(testHash, sig, testPubKey);
      
      assert(isValid, 'smartVerify should validate correct signatures');
    });
    
    it('should throw on invalid hash length', function() {
      const sig = hardenedBSV.crypto.ECDSA.sign(testHash, testKey);
      const shortHash = Buffer.alloc(16);
      
      assert.throws(() => {
        hardenedBSV.crypto.SmartVerify.smartVerify(shortHash, sig, testPubKey);
      }, /Invalid message hash/);
    });
    
    it('should throw on non-buffer hash', function() {
      const sig = hardenedBSV.crypto.ECDSA.sign(testHash, testKey);
      
      assert.throws(() => {
        hardenedBSV.crypto.SmartVerify.smartVerify('not-a-buffer', sig, testPubKey);
      }, /Invalid message hash/);
    });
    
    it('should check signature canonicality', function() {
      const sig = hardenedBSV.crypto.ECDSA.sign(testHash, testKey);
      
      const isCanonical = hardenedBSV.crypto.SmartVerify.isCanonical(sig);
      assert(isCanonical, 'Generated signature should be canonical');
      
      const n = hardenedBSV.crypto.SmartVerify.constants.n;
      const nh = hardenedBSV.crypto.SmartVerify.constants.nh;
      
      // Create high s signature
      if (sig.s.lte(nh)) {
        sig.s = n.sub(sig.s);
      }
      
      const isNonCanonical = hardenedBSV.crypto.SmartVerify.isCanonical(sig);
      assert(!isNonCanonical, 'High s signature should not be canonical');
    });
  });
  
  describe('DER Encoding Security', function() {
    let testKey, testMessage, testHash;
    
    beforeEach(function() {
      testKey = new originalBSV.PrivateKey();
      testMessage = 'SmartLedger DER test';
      testHash = originalBSV.crypto.Hash.sha256(Buffer.from(testMessage));
    });
    
    it('should produce valid DER encoding', function() {
      const sig = hardenedBSV.crypto.ECDSA.sign(testHash, testKey);
      const der = sig.toDER();
      
      assert(Buffer.isBuffer(der), 'DER should be a buffer');
      assert(der.length > 0, 'DER should not be empty');
      assert(der[0] === 0x30, 'DER should start with sequence tag');
    });
    
    it('should reject negative r values in DER', function() {
      const sig = hardenedBSV.crypto.ECDSA.sign(testHash, testKey);
      
      // Force negative (this is artificial for testing)
      const BN = originalBSV.crypto.BN;
      const backupR = sig.r;
      
      // Mock isNeg to return true
      sig.r = Object.assign(sig.r, {
        isNeg: () => true
      });
      
      assert.throws(() => {
        sig.toDER();
      }, /negative values/);
    });
    
    it('should handle DER roundtrip correctly', function() {
      const sig = hardenedBSV.crypto.ECDSA.sign(testHash, testKey);
      const der = sig.toDER();
      const recovered = hardenedBSV.crypto.Signature.fromDER(der);
      
      assert(sig.r.eq(recovered.r), 'r should survive roundtrip');
      assert(sig.s.eq(recovered.s), 's should survive roundtrip');
      assert(recovered.isCanonical(), 'Recovered signature should be canonical');
    });
  });
  
  describe('Compatibility Tests', function() {
    it('should maintain API compatibility with original BSV', function() {
      const testKey = new originalBSV.PrivateKey();
      const testMessage = 'compatibility test';
      const testHash = originalBSV.crypto.Hash.sha256(Buffer.from(testMessage));
      
      // Test that we can still use BSV objects with hardened functions
      const originalSig = originalBSV.crypto.ECDSA.sign(testHash, testKey);
      const pubKey = testKey.toPublicKey();
      
      // Should work with hardened verify
      const isValid = hardenedBSV.crypto.ECDSA.verify(testHash, originalSig, pubKey);
      assert(typeof isValid === 'boolean', 'Verify should return boolean');
    });
    
    it('should work with transaction signing', function() {
      // Test that our hardened modules work in transaction context
      const privateKey = new hardenedBSV.PrivateKey();
      const address = privateKey.toAddress();
      
      // This validates that the address generation still works
      assert(address.toString().length > 0, 'Address should generate correctly');
    });
  });
});

// Export for use with mocha
module.exports = {
  // Test utilities that might be useful
  generateTestKey: () => new originalBSV.PrivateKey(),
  generateTestHash: (msg) => originalBSV.crypto.Hash.sha256(Buffer.from(msg || 'test'))
};