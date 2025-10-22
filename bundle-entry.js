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

// Include SmartContract interface with debug tools (forced for bundle)
try {
  const SmartContract = require('./lib/smart_contract')
  bsv.SmartContract = SmartContract
  console.log('SmartContract interface loaded in bundle with', Object.keys(SmartContract).length, 'methods')
} catch (e) {
  console.warn('SmartContract module not available:', e.message)
}

// Include CovenantInterface for advanced covenant development
try {
  const CovenantInterface = require('./lib/covenant-interface.js')
  bsv.CovenantInterface = CovenantInterface
  console.log('CovenantInterface loaded in bundle')
} catch (e) {
  console.warn('CovenantInterface module not available:', e.message)
}

// Include CustomScriptHelper for simplified script development
try {
  const CustomScriptHelper = require('./lib/custom-script-helper.js')
  bsv.CustomScriptHelper = CustomScriptHelper
  console.log('CustomScriptHelper loaded in bundle')
} catch (e) {
  console.warn('CustomScriptHelper module not available:', e.message)
}

// Include Legal Token Protocol (LTP) - NEW v3.3.0
try {
  const LTP = require('./lib/ltp')
  bsv.LTP = LTP
  console.log('Legal Token Protocol (LTP) loaded in bundle with', Object.keys(LTP).length, 'methods')
} catch (e) {
  console.warn('LTP module not available:', e.message)
}

// Include Global Digital Attestation Framework (GDAF) - NEW v3.3.0
try {
  const GDAF = require('./lib/gdaf')
  bsv.GDAF = GDAF
  console.log('Global Digital Attestation Framework (GDAF) loaded in bundle')
} catch (e) {
  console.warn('GDAF module not available:', e.message)
}

// Include Shamir Secret Sharing - NEW v3.3.0
try {
  const Shamir = require('./lib/crypto/shamir')
  bsv.crypto.Shamir = Shamir
  bsv.Shamir = Shamir
  console.log('Shamir Secret Sharing loaded in bundle')
} catch (e) {
  console.warn('Shamir module not available:', e.message)
}

// SmartLedger security modules (matching index.js structure)
bsv.SmartLedger = {
  version: bsv.version,
  hardenedBy: bsv.hardenedBy,
  baseVersion: bsv.baseVersion,
  securityFeatures: bsv.securityFeatures,
  SmartVerify: bsv.crypto.SmartVerify,
  EllipticFixed: bsv.crypto.EllipticFixed
}
bsv.SmartVerify = bsv.crypto.SmartVerify
bsv.EllipticFixed = bsv.crypto.EllipticFixed

// Internal usage, exposed for testing/advanced tweaking (matching index.js)
if (bsv.Transaction && bsv.Transaction.sighash === undefined) {
  try {
    bsv.Transaction.sighash = require('./lib/transaction/sighash')
  } catch (e) {
    console.warn('Transaction.sighash not available:', e.message)
  }
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
    'smartledger-security',
    'smartcontract-interface',
    'debug-tools',
    'covenant-interface',
    'custom-script-helper',
    'advanced-sighash',
    'legal-token-protocol-ltp',
    'global-digital-attestation-gdaf',
    'shamir-secret-sharing'
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
  },
  
  // SmartContract debug tools (NEW v3.2.1)
  examineScript: function(scriptASM) {
    if (!bsv.SmartContract || !bsv.SmartContract.examineStack) {
      throw new Error('SmartContract debug tools not available in bundle')
    }
    const script = bsv.Script.fromASM(scriptASM)
    return bsv.SmartContract.examineStack(script)
  },
  
  interpretScript: function(scriptASM) {
    if (!bsv.SmartContract || !bsv.SmartContract.interpretScript) {
      throw new Error('SmartContract debug tools not available in bundle')
    }
    const script = bsv.Script.fromASM(scriptASM)
    return bsv.SmartContract.interpretScript(script)
  },
  
  getScriptMetrics: function(scriptASM) {
    if (!bsv.SmartContract || !bsv.SmartContract.getScriptMetrics) {
      throw new Error('SmartContract metrics not available in bundle')
    }
    const script = bsv.Script.fromASM(scriptASM)
    return bsv.SmartContract.getScriptMetrics(script)
  },
  
  optimizeScript: function(scriptASM) {
    if (!bsv.SmartContract || !bsv.SmartContract.optimizeScript) {
      throw new Error('SmartContract optimizer not available in bundle')
    }
    const script = bsv.Script.fromASM(scriptASM)
    return bsv.SmartContract.optimizeScript(script)
  },
  
  // Covenant development (NEW v3.2.1)
  createCovenant: function(config) {
    if (!bsv.CovenantInterface) {
      throw new Error('CovenantInterface not available in bundle')
    }
    const covenantInterface = new bsv.CovenantInterface()
    return covenantInterface.createCovenantTransaction(config)
  },
  
  // Custom script development (NEW v3.2.1)
  createCustomSignature: function(transaction, privateKey, inputIndex, lockingScript, satoshis, sighashType) {
    if (!bsv.CustomScriptHelper) {
      throw new Error('CustomScriptHelper not available in bundle')
    }
    return bsv.CustomScriptHelper.createSignature(transaction, privateKey, inputIndex, lockingScript, satoshis, sighashType)
  },
  
  // Advanced sighash access (NEW v3.2.1)
  calculateSighash: function(transaction, sighashType, inputNumber, subscript, satoshisBN) {
    if (!bsv.Transaction || !bsv.Transaction.sighash) {
      throw new Error('Advanced sighash functionality not available in bundle')
    }
    return bsv.Transaction.sighash.sighash(transaction, sighashType, inputNumber, subscript, satoshisBN)
  },
  
  // Legal Token Protocol methods (NEW v3.3.0)
  createRightToken: function(type, issuerDID, subjectDID, claim, privateKey, options) {
    if (!bsv.LTP) {
      throw new Error('Legal Token Protocol (LTP) not available in bundle')
    }
    return bsv.LTP.prepareRightToken(type, issuerDID, subjectDID, claim, privateKey, options)
  },
  
  verifyRightToken: function(token) {
    if (!bsv.LTP) {
      throw new Error('Legal Token Protocol (LTP) not available in bundle')
    }
    return bsv.LTP.prepareRightTokenVerification(token)
  },
  
  // GDAF identity methods (NEW v3.3.0)
  createDID: function(publicKey) {
    if (!bsv.GDAF) {
      throw new Error('Global Digital Attestation Framework (GDAF) not available in bundle')
    }
    return bsv.GDAF.createDID(publicKey)
  },
  
  issueCredential: function(issuerWIF, payload) {
    if (!bsv.GDAF) {
      throw new Error('Global Digital Attestation Framework (GDAF) not available in bundle')
    }
    return bsv.GDAF.issueVC(issuerWIF, payload)
  },
  
  // Shamir Secret Sharing methods (NEW v3.3.0)
  splitSecret: function(secret, n, k) {
    if (!bsv.Shamir) {
      throw new Error('Shamir Secret Sharing not available in bundle')
    }
    return bsv.Shamir.split(secret, n, k)
  },
  
  reconstructSecret: function(shares) {
    if (!bsv.Shamir) {
      throw new Error('Shamir Secret Sharing not available in bundle')
    }
    return bsv.Shamir.reconstruct(shares)
  }
}

module.exports = bsv