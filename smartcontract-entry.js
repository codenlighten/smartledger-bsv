/**
 * SmartLedger BSV - SmartContract Interface
 * 
 * Standalone SmartContract interface with debug tools for browser use.
 * This module provides the complete SmartContract development framework
 * including covenant builders, script debuggers, and testing tools.
 * 
 * Usage:
 *   <script src="bsv.min.js"></script>
 *   <script src="bsv-smartcontract.min.js"></script>
 *   <script>
 *     // SmartContract interface available under bsv.SmartContract
 *     const script = bsv.Script.fromASM('OP_1 OP_2 OP_ADD');
 *     const result = bsv.SmartContract.examineStack(script);
 *     const metrics = bsv.SmartContract.getScriptMetrics(script);
 *   </script>
 */

'use strict'

// Check if BSV library is available
if (typeof window !== 'undefined' && typeof window.bsv === 'undefined') {
  throw new Error('SmartContract interface requires BSV library. Load bsv.min.js first.')
}

// Get BSV reference (works in both Node.js and browser)
var bsv = (typeof window !== 'undefined') ? window.bsv : require('./index.js')

if (!bsv) {
  throw new Error('BSV library not found. Ensure bsv.min.js is loaded before bsv-smartcontract.min.js')
}

// Load SmartContract interface
var SmartContract
try {
  SmartContract = require('./lib/smart_contract')
} catch (e) {
  throw new Error('SmartContract module not found: ' + e.message)
}

// Attach to BSV library
bsv.SmartContract = SmartContract

// Make available globally for browser usage
if (typeof window !== 'undefined') {
  window.bsvSmartContract = SmartContract
  
  // Also ensure it's on the global bsv object
  if (window.bsv) {
    window.bsv.SmartContract = SmartContract
  }
}

// Add debug tools information
if (SmartContract) {
  SmartContract.version = bsv.version || '3.2.1'
  SmartContract.standalone = true
  SmartContract.debugToolsAvailable = {
    examineStack: !!SmartContract.examineStack,
    interpretScript: !!SmartContract.interpretScript,
    getScriptMetrics: !!SmartContract.getScriptMetrics,
    optimizeScript: !!SmartContract.optimizeScript
  }
  
  // Convenience method to check if debug tools are working
  SmartContract.testDebugTools = function() {
    try {
      if (!bsv.Script) {
        return { success: false, error: 'BSV Script class not available' }
      }
      
      const testScript = bsv.Script.fromASM('OP_1 OP_2 OP_ADD')
      const results = {}
      
      if (SmartContract.examineStack) {
        try {
          results.examineStack = SmartContract.examineStack(testScript)
          results.examineStackWorking = true
        } catch (e) {
          results.examineStackWorking = false
          results.examineStackError = e.message
        }
      }
      
      if (SmartContract.interpretScript) {
        try {
          results.interpretScript = SmartContract.interpretScript(testScript)
          results.interpretScriptWorking = true
        } catch (e) {
          results.interpretScriptWorking = false
          results.interpretScriptError = e.message
        }
      }
      
      if (SmartContract.getScriptMetrics) {
        try {
          results.scriptMetrics = SmartContract.getScriptMetrics(testScript)
          results.scriptMetricsWorking = true
        } catch (e) {
          results.scriptMetricsWorking = false
          results.scriptMetricsError = e.message
        }
      }
      
      if (SmartContract.optimizeScript) {
        try {
          results.optimizeScript = SmartContract.optimizeScript(testScript)
          results.optimizeScriptWorking = true
        } catch (e) {
          results.optimizeScriptWorking = false
          results.optimizeScriptError = e.message
        }
      }
      
      return {
        success: true,
        testScript: 'OP_1 OP_2 OP_ADD',
        results: results,
        methodCount: Object.keys(SmartContract).length
      }
    } catch (e) {
      return { success: false, error: e.message }
    }
  }
}

console.log('SmartContract interface loaded:', !!SmartContract)
if (SmartContract) {
  console.log('SmartContract methods available:', Object.keys(SmartContract).length)
  console.log('Debug tools available:', SmartContract.debugToolsAvailable)
}

module.exports = SmartContract