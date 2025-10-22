/**
 * SmartLedger BSV Custom Script Helper - Standalone Module
 * 
 * Simplified API for custom script development and signing
 * Requires main BSV library to be loaded first.
 * 
 * Usage:
 *   <script src="bsv.min.js"></script>
 *   <script src="bsv-script-helper.min.js"></script>
 *   <script>
 *     const sig = bsvScriptHelper.createSignature(tx, key, 0, script, sats);
 *   </script>
 */

'use strict'

// Verify BSV library is available
if (typeof bsv === 'undefined') {
  throw new Error('CustomScriptHelper requires BSV library. Load bsv.min.js first.');
}

// Load CustomScriptHelper
const CustomScriptHelper = require('./lib/custom-script-helper.js');

// Browser compatibility
if (typeof window !== 'undefined') {
  window.bsvScriptHelper = {
    CustomScriptHelper: CustomScriptHelper,
    createSignature: CustomScriptHelper.createSignature,
    verifySignature: CustomScriptHelper.verifySignature,
    createMultisigSignature: CustomScriptHelper.createMultisigSignature,
    version: bsv.version || 'unknown'
  };
  
  // Also attach to main bsv object if available
  if (typeof bsv !== 'undefined') {
    bsv.CustomScriptHelper = CustomScriptHelper;
  }
  
  console.log('CustomScriptHelper standalone module loaded');
}

module.exports = {
  CustomScriptHelper: CustomScriptHelper,
  createSignature: CustomScriptHelper.createSignature,
  verifySignature: CustomScriptHelper.verifySignature,
  createMultisigSignature: CustomScriptHelper.createMultisigSignature,
  version: bsv.version || 'unknown'
};