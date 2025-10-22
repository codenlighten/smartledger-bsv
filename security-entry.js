/**
 * SmartLedger BSV Security Module - Standalone Module
 * 
 * SmartLedger security enhancements and elliptic curve fixes
 * Can be used standalone or with main BSV library.
 * 
 * Usage:
 *   <script src="bsv-security.min.js"></script>
 *   <script>
 *     const verified = bsvSecurity.SmartVerify.verify(sig, hash, pubkey);
 *   </script>
 */

'use strict'

// Load security modules
const SmartVerify = require('./lib/crypto/smartledger_verify');
const EllipticFixed = require('./lib/crypto/elliptic-fixed');

// Browser compatibility
if (typeof window !== 'undefined') {
  window.bsvSecurity = {
    SmartVerify: SmartVerify,
    EllipticFixed: EllipticFixed,
    SmartLedger: {
      version: 'v3.2.1',
      hardenedBy: 'SmartLedger',
      baseVersion: 'v1.5.6',
      securityFeatures: [
        'canonical-signatures',
        'malleability-protection', 
        'enhanced-validation',
        'elliptic-patches'
      ],
      SmartVerify: SmartVerify,
      EllipticFixed: EllipticFixed
    },
    version: 'v3.2.1'
  };
  
  // Also attach to main bsv object if available
  if (typeof bsv !== 'undefined') {
    bsv.SmartVerify = SmartVerify;
    bsv.EllipticFixed = EllipticFixed;
    if (!bsv.SmartLedger) {
      bsv.SmartLedger = window.bsvSecurity.SmartLedger;
    }
  }
  
  console.log('SmartLedger Security standalone module loaded');
}

module.exports = {
  SmartVerify: SmartVerify,
  EllipticFixed: EllipticFixed,
  SmartLedger: {
    version: 'v3.2.1',
    hardenedBy: 'SmartLedger',
    baseVersion: 'v1.5.6',
    securityFeatures: [
      'canonical-signatures',
      'malleability-protection',
      'enhanced-validation', 
      'elliptic-patches'
    ],
    SmartVerify: SmartVerify,
    EllipticFixed: EllipticFixed
  },
  version: 'v3.2.1'
};