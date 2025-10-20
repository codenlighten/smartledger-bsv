/**
 * SmartContract Module
 * ===================
 * 
 * Production-ready covenant functionality for Bitcoin SV (BSV).
 * Implements BIP-143 transaction preimage parsing and covenant operations
 * with comprehensive SIGHASH flag support and error handling.
 * 
 * Classes:
 * - Covenant: Core covenant creation and spending logic
 * - Preimage: BIP-143 preimage parsing and validation with field extraction
 * - SIGHASH: SIGHASH flag detection and analysis
 * - Builder: High-level covenant construction utilities
 * - UTXOGenerator: Real BSV UTXO generation for authentic testing
 * - ScriptTester: Local script execution and debugging capabilities
 * - CovenantBuilder: JavaScript-to-Bitcoin Script covenant generator
 * - OpcodeMap: Comprehensive Bitcoin Script opcode mapping
 */

'use strict'

var bsv = require('../..')

var SmartContract = {
  Covenant: require('./covenant'),
  Preimage: require('./preimage'),
  SIGHASH: require('./sighash'),
  Builder: require('./builder'),
  UTXOGenerator: require('./utxo_generator'),
  ScriptTester: require('./script_tester'),
  CovenantBuilder: require('./covenant_builder').CovenantBuilder,
  CovenantTemplates: require('./covenant_builder').CovenantTemplates,
  OpcodeMap: require('./opcode_map'),
  ScriptUtils: require('./script_utils')
}

// Convenience constructor methods
SmartContract.createCovenant = function(privateKey, options) {
  return new SmartContract.Covenant(privateKey, options)
}

SmartContract.extractPreimage = function(preimage, options) {
  return new SmartContract.Preimage(preimage, options)
}

SmartContract.analyzeSIGHASH = function(sighashType) {
  return new SmartContract.SIGHASH(sighashType)
}

SmartContract.buildCovenant = function(privateKey, options) {
  return new SmartContract.Builder(privateKey, options)
}

SmartContract.createUTXOGenerator = function(options) {
  return new SmartContract.UTXOGenerator(options)
}

SmartContract.createTestEnvironment = function(options) {
  return SmartContract.UTXOGenerator.createTestEnvironment(options)
}

SmartContract.testScript = function(unlocking, locking, options) {
  return SmartContract.ScriptTester.test(unlocking, locking, options)
}

SmartContract.testCovenant = function(preimageHex, constraints, options) {
  return SmartContract.ScriptTester.testCovenant(preimageHex, constraints, options)
}

SmartContract.testFieldExtraction = function(preimageHex, fieldName, options) {
  return SmartContract.ScriptTester.testFieldExtraction(preimageHex, fieldName, options)
}

SmartContract.debugScript = function(config, options) {
  var tester = new SmartContract.ScriptTester(options)
  return tester.debug(config)
}

// Educational and utility functions
SmartContract.explainZeroHashes = function() {
  return SmartContract.SIGHASH.explainZeroMystery()
}

SmartContract.getAllSIGHASHTypes = function() {
  return SmartContract.SIGHASH.getAllTypes()
}

SmartContract.demonstrateAllSIGHASH = function() {
  return SmartContract.SIGHASH.generateAllDemonstrations()
}

// JavaScript-to-Bitcoin Script covenant generation
SmartContract.createCovenantBuilder = function() {
  return new SmartContract.CovenantBuilder()
}

SmartContract.createValueLockCovenant = function(expectedValue) {
  return SmartContract.CovenantTemplates.valueLock(expectedValue)
}

SmartContract.createHashLockCovenant = function(expectedHash) {
  return SmartContract.CovenantTemplates.hashLock(expectedHash)
}

SmartContract.createComplexValidationCovenant = function(rules) {
  return SmartContract.CovenantTemplates.complexValidation(rules)
}

// Opcode mapping utilities
SmartContract.getOpcodeMap = function() {
  return SmartContract.OpcodeMap.opcodeMap
}

SmartContract.simulateScript = function(operations, initialStack) {
  return SmartContract.OpcodeMap.utils.simulate(operations, initialStack)
}

SmartContract.createASMFromJS = function(operations) {
  return SmartContract.OpcodeMap.utils.createASM(operations)
}

// Script analysis and conversion utilities
SmartContract.scriptToASM = function(scriptBuffer) {
  return SmartContract.ScriptUtils.scriptToASM(scriptBuffer)
}

SmartContract.asmToScript = function(asmString) {
  return SmartContract.ScriptUtils.asmToScript(asmString)
}

SmartContract.asmToHex = function(asmString) {
  return SmartContract.ScriptUtils.asmToHex(asmString)
}

SmartContract.hexToASM = function(hexString) {
  return SmartContract.ScriptUtils.hexToASM(hexString)
}

SmartContract.scriptToHex = function(script) {
  return SmartContract.ScriptUtils.scriptToHex(script)
}

SmartContract.validateASM = function(asmString) {
  return SmartContract.ScriptUtils.validateASM(asmString)
}

SmartContract.validateScript = function(script) {
  return SmartContract.ScriptUtils.validateScript(script)
}

SmartContract.estimateScriptSize = function(script) {
  return SmartContract.ScriptUtils.estimateScriptSize(script)
}

SmartContract.optimizeScript = function(script) {
  return SmartContract.ScriptUtils.optimizeScript(script)
}

SmartContract.compareScripts = function(scriptA, scriptB) {
  return SmartContract.ScriptUtils.compareScripts(scriptA, scriptB)
}

SmartContract.explainScript = function(script) {
  return SmartContract.ScriptUtils.explainScript(script)
}

SmartContract.scriptMetrics = function(script) {
  return SmartContract.ScriptUtils.scriptMetrics(script)
}

SmartContract.analyzeComplexity = function(script) {
  return SmartContract.ScriptUtils.analyzeComplexity(script)
}

SmartContract.findOptimizations = function(script) {
  return SmartContract.ScriptUtils.findOptimizations(script)
}

SmartContract.covenantToEnglish = function(covenant) {
  return SmartContract.ScriptUtils.covenantToEnglish(covenant)
}

SmartContract.batchTestScripts = function(scripts, options) {
  return SmartContract.ScriptUtils.batchTestScripts(scripts, options)
}

// Quick covenant creation utility
SmartContract.createQuickCovenant = function(type, params) {
  const builder = SmartContract.createCovenantBuilder()
  
  switch (type) {
    case 'value_lock':
      return builder
        .comment(`Value lock: minimum ${params.value} satoshis`)
        .extractField('value')
        .push(params.value)
        .greaterThanOrEqual()
        .verify()
        .build()
    
    case 'hash_lock':
      return builder
        .comment(`Hash lock: requires preimage of ${params.hash}`)
        .push('secret_placeholder')
        .sha256()
        .push(params.hash)
        .equalVerify()
        .build()
    
    case 'time_lock':
      return builder
        .comment(`Time lock: requires nLockTime > ${params.timestamp}`)
        .extractField('nLockTime')
        .push(params.timestamp)
        .greaterThan()
        .verify()
        .build()
    
    case 'multi_condition':
      let covenant = builder.comment('Multi-condition covenant')
      params.conditions.forEach(condition => {
        switch (condition.type) {
          case 'value':
            covenant = covenant
              .extractField('value')
              .push(condition.value)
              .greaterThanOrEqual()
              .verify()
            break
          case 'hash':
            covenant = covenant
              .push('secret_placeholder')
              .sha256()
              .push(condition.hash)
              .equalVerify()
            break
          case 'time':
            covenant = covenant
              .extractField('nLockTime')
              .push(condition.timestamp)
              .greaterThan()
              .verify()
            break
        }
      })
      return covenant.build()
    
    default:
      throw new Error(`Unknown covenant type: ${type}`)
  }
}

// Complete workflow helpers
SmartContract.completeCovenantFlow = function(privateKey, p2pkhUtxo, broadcastCallback) {
  var covenant = new SmartContract.Covenant(privateKey)
  return covenant.completeFlow(p2pkhUtxo, broadcastCallback)
}

// Educational utilities
SmartContract.getEducationalResources = function() {
  return {
    zeroHashMystery: SmartContract.SIGHASH.explainZeroMystery(),
    sighashTypes: SmartContract.SIGHASH.getAllTypes(),
    exampleDemonstrations: SmartContract.SIGHASH.generateAllDemonstrations()
  }
}

// Utility functions
SmartContract.utils = {}
SmartContract.utils.reconstructP2pkhScript = function(address) {
  return bsv.Script.buildPublicKeyHashOut(address).toHex()
}

SmartContract.utils.createCovenantAddress = function(script) {
  // Create P2SH address for covenant script
  var scriptHash = bsv.crypto.Hash.sha256ripemd160(script.toBuffer())
  return bsv.Address.fromScriptHash(scriptHash)
}

SmartContract.utils.decodeCompactSize = function(buffer, offset) {
  return SmartContract.Preimage.decodeCompactSize(buffer, offset)
}

// Version information
SmartContract.version = 'v1.0.0'
SmartContract.description = 'Enterprise Smart Contract Framework for Bitcoin SV'

// Feature flags
SmartContract.features = {
  BIP143_PREIMAGE: true,
  COMPACT_SIZE_VARINT: true,
  BIDIRECTIONAL_EXTRACTION: true,
  SIGHASH_DETECTION: true,
  ZERO_HASH_WARNINGS: true,
  MULTI_FIELD_VALIDATION: true,
  REAL_UTXO_GENERATION: true,
  SCRIPT_TESTING: true,
  LOCAL_VERIFICATION: true,
  JAVASCRIPT_TO_SCRIPT: true,
  OPCODE_MAPPING: true,
  COVENANT_BUILDER: true,
  SCRIPT_ANALYSIS: true,
  SCRIPT_OPTIMIZATION: true,
  SCRIPT_CONVERSION: true,
  BATCH_TESTING: true,
  QUICK_COVENANTS: true,
  SCRIPT_EXPLANATIONS: true,
  PRODUCTION_READY: true
}

module.exports = SmartContract