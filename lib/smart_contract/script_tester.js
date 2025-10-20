/**
 * SmartContract.ScriptTester Class
 * ================================
 * 
 * Bitcoin Script execution and debugging capabilities integrated
 * with the SmartContract module for covenant testing.
 * 
 * Features:
 * - Execute any Bitcoin Script locally
 * - Step-by-step debugging with stack visualization
 * - Truth evaluation for script verification
 * - Direct integration with Preimage field extraction
 * - Covenant script testing with real preimages
 */

'use strict'

var bsv = require('../..')

/**
 * ScriptTester Class - Local script execution and debugging
 * @param {Object} options - Configuration options
 */
function ScriptTester(options) {
  if (!(this instanceof ScriptTester)) {
    return new ScriptTester(options)
  }

  this.options = options || {}
  this.flags = this.options.flags || bsv.Script.Interpreter.SCRIPT_ENABLE_SIGHASH_FORKID
  this.satoshis = this.options.satoshis || 100000
}

/**
 * Execute a script and return the result
 * @param {Object} config - Execution configuration
 * @returns {Object} Execution result
 */
ScriptTester.prototype.execute = function(config) {
  var unlockingScript = this._parseScript(config.unlocking)
  var lockingScript = this._parseScript(config.locking)
  
  // Create dummy transaction for testing
  var tx = this._createDummyTransaction()
  
  // Create interpreter
  var interpreter = new bsv.Script.Interpreter()
  var satoshisBN = new bsv.crypto.BN(this.satoshis)
  
  try {
    var verified = interpreter.verify(
      unlockingScript,
      lockingScript,
      tx,
      0,
      this.flags,
      satoshisBN
    )
    
    return {
      success: verified,
      unlocking: unlockingScript.toASM(),
      locking: lockingScript.toASM(),
      finalStack: interpreter.stack.map(function(b) { return b.toString('hex') }),
      altStack: interpreter.altstack.map(function(b) { return b.toString('hex') }),
      error: null
    }
  } catch (error) {
    return {
      success: false,
      unlocking: unlockingScript.toASM(),
      locking: lockingScript.toASM(),
      finalStack: [],
      altStack: [],
      error: error.message
    }
  }
}

/**
 * Step through script execution with detailed debugging
 * @param {Object} config - Execution configuration
 * @returns {Array} Array of execution steps
 */
ScriptTester.prototype.debug = function(config) {
  var combinedScript = this._createCombinedScript(config)
  var tx = this._createDummyTransaction()
  
  var interpreter = new bsv.Script.Interpreter()
  interpreter.script = combinedScript
  interpreter.tx = tx
  interpreter.nIn = 0
  interpreter.flags = this.flags
  
  var steps = []
  var chunks = combinedScript.chunks
  
  try {
    for (var i = 0; i < chunks.length; i++) {
      var chunk = chunks[i]
      var opname = bsv.Opcode.reverseMap[chunk.opcodenum] || 'PUSH'
      
      // Capture state before execution
      var beforeStack = interpreter.stack.map(function(b) { return b.toString('hex') })
      var beforeAltStack = interpreter.altstack.map(function(b) { return b.toString('hex') })
      
      try {
        interpreter.step()
        
        // Capture state after execution
        var afterStack = interpreter.stack.map(function(b) { return b.toString('hex') })
        var afterAltStack = interpreter.altstack.map(function(b) { return b.toString('hex') })
        
        steps.push({
          step: i + 1,
          opcode: opname,
          beforeStack: beforeStack,
          afterStack: afterStack,
          beforeAltStack: beforeAltStack,
          afterAltStack: afterAltStack,
          success: true,
          error: null
        })
      } catch (stepError) {
        steps.push({
          step: i + 1,
          opcode: opname,
          beforeStack: beforeStack,
          afterStack: beforeStack, // No change on error
          beforeAltStack: beforeAltStack,
          afterAltStack: beforeAltStack,
          success: false,
          error: stepError.message
        })
        break
      }
    }
  } catch (error) {
    steps.push({
      step: 0,
      opcode: 'INITIALIZATION',
      beforeStack: [],
      afterStack: [],
      beforeAltStack: [],
      afterAltStack: [],
      success: false,
      error: error.message
    })
  }
  
  return {
    script: combinedScript.toASM(),
    steps: steps,
    totalSteps: chunks.length,
    success: steps.length > 0 && steps[steps.length - 1].success
  }
}

/**
 * Test a covenant with preimage and constraints
 * @param {Object} config - Covenant test configuration
 * @returns {Object} Covenant test result
 */
ScriptTester.prototype.testCovenant = function(config) {
  var preimageHex = config.preimage
  var constraints = config.constraints || {}
  
  // Build covenant locking script from constraints
  var lockingASM = this._buildCovenantScript(constraints, preimageHex)
  
  // Test execution
  var result = this.execute({
    unlocking: preimageHex,
    locking: lockingASM
  })
  
  // Add covenant-specific analysis
  result.covenant = {
    preimageLength: preimageHex.length / 2,
    constraints: constraints,
    constraintResults: this._analyzeConstraints(preimageHex, constraints)
  }
  
  return result
}

/**
 * Test preimage field extraction
 * @param {string} preimageHex - Raw preimage hex
 * @param {string} fieldName - Field to extract
 * @returns {Object} Field extraction test result
 */
ScriptTester.prototype.testFieldExtraction = function(preimageHex, fieldName) {
  try {
    // Extract field and generate clean ASM (no comments)
    var Preimage = require('./preimage')
    var fieldData = Preimage.extractFromHex(preimageHex, fieldName, { includeComments: false })
    var cleanASM = this._cleanASM(fieldData.asm) // Clean the ASM to handle numeric literals
    
    // Test the generated ASM
    var result = this.execute({
      unlocking: preimageHex,
      locking: cleanASM + ' OP_DROP OP_TRUE' // Drop extracted field and succeed
    })
    
    result.fieldExtraction = {
      field: fieldName,
      strategy: fieldData.strategy,
      value: fieldData.value,
      interpretation: fieldData.interpretation,
      asmGenerated: fieldData.asm,
      cleanedASM: cleanASM
    }
    
    return result
  } catch (error) {
    return {
      success: false,
      error: error.message,
      fieldExtraction: {
        field: fieldName,
        error: error.message
      }
    }
  }
}

/**
 * Parse script from ASM or HEX, with special handling for preimage data
 * @private
 */
ScriptTester.prototype._parseScript = function(input) {
  if (!input) return new bsv.Script()
  
  var trimmed = input.trim()
  var isHex = /^[0-9a-fA-F]+$/.test(trimmed.replace(/\s+/g, ''))
  
  try {
    if (isHex) {
      // Check if this looks like preimage data (around 180-200 bytes)
      var hexLength = trimmed.length / 2
      if (hexLength >= 180 && hexLength <= 250) {
        // This is likely preimage data - create a script that pushes it
        return new bsv.Script().add(Buffer.from(trimmed, 'hex'))
      } else {
        // Normal hex script
        return bsv.Script.fromHex(trimmed)
      }
    } else {
      return bsv.Script.fromASM(trimmed)
    }
  } catch (error) {
    throw new Error('Failed to parse script: ' + error.message)
  }
}

/**
 * Create combined script from unlocking and locking parts
 * @private
 */
ScriptTester.prototype._createCombinedScript = function(config) {
  if (config.combined) {
    return this._parseScript(config.combined)
  }
  
  var unlockingScript = this._parseScript(config.unlocking)
  var lockingScript = this._parseScript(config.locking)
  
  var combinedBuffer = Buffer.concat([
    unlockingScript.toBuffer(),
    lockingScript.toBuffer()
  ])
  
  return bsv.Script.fromBuffer(combinedBuffer)
}

/**
 * Create dummy transaction for testing
 * @private
 */
ScriptTester.prototype._createDummyTransaction = function() {
  var tx = new bsv.Transaction()
  
  // Create dummy input
  var dummyInput = new bsv.Transaction.Input({
    prevTxId: '0'.repeat(64),
    outputIndex: 0,
    script: bsv.Script.empty(),
    satoshis: this.satoshis,
    output: new bsv.Transaction.Output({
      satoshis: this.satoshis,
      script: bsv.Script.empty()
    })
  })
  
  tx.addInput(dummyInput)
  tx.addOutput(new bsv.Transaction.Output({ 
    satoshis: this.satoshis, 
    script: bsv.Script.empty() 
  }))
  
  return tx
}

/**
 * Build covenant locking script from constraints
 * @private
 */
ScriptTester.prototype._buildCovenantScript = function(constraints, preimageHex) {
  var scriptParts = []
  
  try {
    var Preimage = require('./preimage')
    
    // Amount constraint
    if (constraints.minimumAmount) {
      var valueASM = Preimage.generateASMFromHex(preimageHex, 'value', false) // No comments
      scriptParts.push(valueASM)
      scriptParts.push('OP_BIN2NUM')
      scriptParts.push(constraints.minimumAmount.toString())
      scriptParts.push('OP_GREATERTHANOREQUAL')
      scriptParts.push('OP_VERIFY')
    }
    
    // SIGHASH constraint
    if (constraints.requiredSighash) {
      var sighashASM = Preimage.generateASMFromHex(preimageHex, 'sighashType', false) // No comments
      scriptParts.push(sighashASM)
      scriptParts.push('OP_BIN2NUM')
      scriptParts.push(constraints.requiredSighash.toString())
      scriptParts.push('OP_EQUAL')
      scriptParts.push('OP_VERIFY')
    }
    
    // Add success condition
    scriptParts.push('OP_TRUE')
    
    var scriptString = scriptParts.join(' ')
    
    // Clean the entire script to handle numeric literals
    return this._cleanASM(scriptString)
  } catch (error) {
    throw new Error('Failed to build covenant script: ' + error.message)
  }
}

/**
 * Clean ASM by removing comments and extra whitespace
 * @private
 */
ScriptTester.prototype._cleanASM = function(asm) {
  var cleaned = asm
    .split('\n')
    .map(function(line) { return line.split('#')[0].trim() }) // Remove comments
    .filter(function(line) { return line.length > 0 }) // Remove empty lines
    .join(' ') // Join with spaces
    .replace(/\s+/g, ' ') // Normalize whitespace
    .trim()
  
  // Convert numeric literals to proper ASM format
  cleaned = cleaned.replace(/\b(\d+)\b/g, function(match, number) {
    var num = parseInt(number)
    if (num >= 1 && num <= 16) {
      return 'OP_' + num
    } else if (num === 0) {
      return 'OP_0'
    } else if (num === -1) {
      return 'OP_1NEGATE'
    } else {
      // For larger numbers, convert to minimal little-endian representation
      var value = num
      var negative = value < 0
      if (negative) value = -value
      
      var bytes = []
      
      // Convert to little-endian bytes
      while (value > 0) {
        bytes.push(value & 0xFF)
        value = Math.floor(value / 256)
      }
      
      // Handle empty case (zero)
      if (bytes.length === 0) {
        bytes.push(0)
      }
      
      // Handle negative numbers
      if (negative) {
        // Set the high bit of the most significant byte
        if (bytes[bytes.length - 1] >= 0x80) {
          bytes.push(0x80)
        } else {
          bytes[bytes.length - 1] |= 0x80
        }
      } else {
        // Ensure we don't have negative interpretation (high bit set)
        if (bytes.length > 0 && bytes[bytes.length - 1] >= 0x80) {
          bytes.push(0x00)
        }
      }
      
      // Convert to hex string
      return Buffer.from(bytes).toString('hex')
    }
  })
  
  return cleaned
}

/**
 * Analyze constraint satisfaction
 * @private
 */
ScriptTester.prototype._analyzeConstraints = function(preimageHex, constraints) {
  var results = {}
  
  try {
    var Preimage = require('./preimage')
    
    if (constraints.minimumAmount) {
      var valueField = Preimage.extractFromHex(preimageHex, 'value', { includeComments: false })
      var currentAmount = parseInt(valueField.interpretation.satoshis)
      results.amountCheck = {
        constraint: constraints.minimumAmount,
        actual: currentAmount,
        satisfied: currentAmount >= constraints.minimumAmount
      }
    }
    
    if (constraints.requiredSighash) {
      var sighashField = Preimage.extractFromHex(preimageHex, 'sighashType', { includeComments: false })
      var currentSighash = parseInt(sighashField.value, 16)
      results.sighashCheck = {
        constraint: constraints.requiredSighash,
        actual: currentSighash,
        satisfied: (currentSighash & 0xFF) === constraints.requiredSighash
      }
    }
  } catch (error) {
    results.error = error.message
  }
  
  return results
}

/**
 * Static utility methods
 */

/**
 * Quick script execution test
 * @param {string} unlocking - Unlocking script
 * @param {string} locking - Locking script
 * @param {Object} options - Test options
 * @returns {Object} Test result
 */
ScriptTester.test = function(unlocking, locking, options) {
  var tester = new ScriptTester(options)
  return tester.execute({ unlocking: unlocking, locking: locking })
}

/**
 * Quick covenant test
 * @param {string} preimageHex - Preimage hex
 * @param {Object} constraints - Covenant constraints
 * @param {Object} options - Test options
 * @returns {Object} Covenant test result
 */
ScriptTester.testCovenant = function(preimageHex, constraints, options) {
  var tester = new ScriptTester(options)
  return tester.testCovenant({ preimage: preimageHex, constraints: constraints })
}

/**
 * Quick field extraction test
 * @param {string} preimageHex - Preimage hex
 * @param {string} fieldName - Field to extract
 * @param {Object} options - Test options
 * @returns {Object} Field extraction test result
 */
ScriptTester.testFieldExtraction = function(preimageHex, fieldName, options) {
  var tester = new ScriptTester(options)
  return tester.testFieldExtraction(preimageHex, fieldName)
}

module.exports = ScriptTester