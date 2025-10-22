/**
 * SmartLedger BSV Covenant Interface - Standalone Module
 * 
 * Advanced covenant development framework for Bitcoin SV
 * Requires main BSV library to be loaded first.
 * 
 * Usage:
 *   <script src="bsv.min.js"></script>
 *   <script src="bsv-covenant.min.js"></script>
 *   <script>
 *     const covenant = new bsvCovenant.CovenantInterface();
 *     const tx = covenant.createCovenantTransaction(config);
 *   </script>
 */

'use strict'

// Verify BSV library is available
if (typeof bsv === 'undefined') {
  throw new Error('CovenantInterface requires BSV library. Load bsv.min.js first.');
}

// Load CovenantInterface
const CovenantInterface = require('./lib/covenant-interface.js');

// Browser compatibility
if (typeof window !== 'undefined') {
  window.bsvCovenant = {
    CovenantInterface: CovenantInterface,
    version: bsv.version || 'unknown'
  };
  
  // Also attach to main bsv object if available
  if (typeof bsv !== 'undefined') {
    bsv.CovenantInterface = CovenantInterface;
  }
  
  console.log('CovenantInterface standalone module loaded');
}

module.exports = {
  CovenantInterface: CovenantInterface,
  version: bsv.version || 'unknown'
};