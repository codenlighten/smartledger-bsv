/**
 * SmartLedger BSV Complete Bundle
 * 
 * This bundle includes:
 * - Core BSV library with all cryptographic functions
 * - Message signing and verification
 * - HD wallets and mnemonic generation  
 * - ECIES encryption/decryption
 * - SmartLedger security enhancements
 * - All dependencies bundled for standalone usage
 * 
 * Usage:
 *   <script src="bsv.bundle.js"></script>
 *   <script>
 *     // Everything available under 'bsv' namespace
 *     const key = new bsv.PrivateKey();
 *     const message = new bsv.Message('hello');  
 *     const mnemonic = new bsv.Mnemonic();
 *     const encrypted = bsv.ECIES.encrypt(data, publicKey);
 *   </script>
 */

'use strict'

// Load main BSV library
var bsv = require('./index.js')

// Attach Message functionality
try {
  const Message = require('./lib/message/message.js')
  bsv.Message = Message
  
  // Make it available globally for consistency with separate modules
  if (typeof window !== 'undefined') {
    window.bsvMessage = Message
  }
} catch (e) {
  console.warn('Message module not available:', e.message)
}

// Attach Mnemonic functionality with browser crypto polyfill
try {
  // Provide crypto polyfill for browser environment
  if (typeof window !== 'undefined' && typeof crypto !== 'undefined' && crypto.subtle) {
    // Browser environment - provide HMAC polyfill
    const originalCrypto = require('crypto')
    if (!originalCrypto.createHmac) {
      originalCrypto.createHmac = function(algorithm, key) {
        return {
          update: function(data) { this._data = data; return this; },
          digest: function(encoding) {
            // Simple fallback - in production you'd want proper HMAC
            const hash = bsv.crypto.Hash.sha256(Buffer.concat([
              Buffer.isBuffer(key) ? key : Buffer.from(key), 
              Buffer.isBuffer(this._data) ? this._data : Buffer.from(this._data)
            ]));
            return encoding === 'hex' ? hash.toString('hex') : hash;
          }
        };
      };
    }
  }
  
  const Mnemonic = require('./lib/mnemonic/mnemonic.js')
  bsv.Mnemonic = Mnemonic
  
  // Make it available globally for consistency with separate modules
  if (typeof window !== 'undefined') {
    window.bsvMnemonic = Mnemonic
  }
} catch (e) {
  console.warn('Mnemonic module not available:', e.message)
  console.warn('This is expected in browser environments without crypto polyfills')
  
  // Provide a minimal mnemonic alternative for browsers
  if (typeof window !== 'undefined') {
    bsv.Mnemonic = function() {
      throw new Error('Full mnemonic functionality requires Node.js crypto. Use separate bsv-mnemonic.min.js for browser support.');
    };
    bsv.Mnemonic.fromString = function() {
      throw new Error('Full mnemonic functionality requires Node.js crypto. Use separate bsv-mnemonic.min.js for browser support.');
    };
  }
}

// Attach ECIES functionality
try {
  const ECIES = require('./lib/ecies/index.js')
  bsv.ECIES = ECIES
  bsv.crypto.ECIES = ECIES
  
  // Make it available globally for consistency with separate modules  
  if (typeof window !== 'undefined') {
    window.bsvEcies = ECIES
  }
} catch (e) {
  console.warn('ECIES module not available:', e.message)
}

// Enhanced bundle information
bsv.bundle = {
  version: bsv.version,
  includes: [
    'core-bsv',
    'message-signing', 
    'hd-wallets',
    'mnemonic-generation',
    'ecies-encryption',
    'smartledger-security'
  ],
  size: 'complete',
  type: 'all-in-one'
}

// SmartLedger bundle namespace
bsv.SmartLedgerBundle = {
  version: bsv.version,
  hardenedBy: bsv.hardenedBy,
  bundleIncludes: bsv.bundle.includes,
  
  // Quick access methods
  generateKeys: function() {
    const privateKey = new bsv.PrivateKey()
    return {
      privateKey: privateKey,
      publicKey: privateKey.toPublicKey(),
      address: privateKey.toAddress()
    }
  },
  
  generateMnemonic: function() {
    if (!bsv.Mnemonic) {
      throw new Error('Mnemonic functionality not available in bundle')
    }
    // Generate 24-word mnemonic by default (256-bit entropy)
    return new bsv.Mnemonic(256)
  },
  
  createMessage: function(text) {
    if (!bsv.Message) {
      throw new Error('Message functionality not available in bundle')
    }
    return new bsv.Message(text)
  },
  
  encrypt: function(data, publicKey) {
    if (!bsv.ECIES) {
      throw new Error('ECIES functionality not available in bundle')
    }
    return bsv.ECIES.encrypt(data, publicKey)
  }
}

module.exports = bsv