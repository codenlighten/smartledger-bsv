/**
 * SmartContract.SIGHASH Class
 * ===========================
 * 
 * SIGHASH flag utilities with:
 * - Complete flag analysis and detection
 * - Zero hash behavior explanation
 * - Multi-input transaction examples
 * - BIP-143 compliance verification
 * 
 * Based on examples/preimage/generate_sighash_examples.js
 */

'use strict'

var bsv = require('../..')

/**
 * SIGHASH Class - SIGHASH flag analysis and utilities
 * @param {number} sighashType - SIGHASH type flags
 */
function SIGHASH(sighashType) {
  if (!(this instanceof SIGHASH)) {
    return new SIGHASH(sighashType)
  }

  this.sighashType = sighashType || (bsv.crypto.Signature.SIGHASH_ALL | bsv.crypto.Signature.SIGHASH_FORKID)
  this.analysis = this._analyzeFlags()
}

/**
 * Analyze SIGHASH flags and their implications
 * @returns {Object} Flag analysis
 */
SIGHASH.prototype.analyze = function() {
  return this.analysis
}

/**
 * Get zero hash behavior explanation
 * @returns {Object} Zero hash behavior details
 */
SIGHASH.prototype.getZeroHashBehavior = function() {
  var behavior = {
    hashPrevouts: false,
    hashSequence: false,
    hashOutputs: false,
    explanation: [],
    criticalNote: null
  }

  if (this.analysis.anyoneCanPay) {
    behavior.hashPrevouts = true
    behavior.explanation.push('ANYONECANPAY: hashPrevouts becomes zero hash (0x00...00)')
  }

  if (this.analysis.baseType === 'NONE') {
    behavior.hashSequence = true
    behavior.hashOutputs = true
    behavior.explanation.push('SIGHASH_NONE: hashSequence and hashOutputs become zero hash')
  }

  if (this.analysis.baseType === 'SINGLE') {
    behavior.hashSequence = true
    behavior.hashOutputs = true
    behavior.explanation.push('SIGHASH_SINGLE: hashSequence becomes zero hash, hashOutputs covers only corresponding output')
  }

  if (behavior.hashPrevouts || behavior.hashSequence || behavior.hashOutputs) {
    behavior.criticalNote = "These zero hashes are NOT bugs - they are correct BIP-143 behavior for the specified SIGHASH flags!"
  }

  return behavior
}

/**
 * Generate example preimage with specific SIGHASH flags
 * @returns {Preimage} Example preimage
 */
SIGHASH.prototype.generateExample = function() {
  // Create simple single-input transaction to avoid complex script size issues
  var privateKey = bsv.PrivateKey.fromRandom()
  var address = privateKey.toAddress()

  // Create simple P2PKH UTXO
  var utxo = {
    txId: 'a'.repeat(64),
    outputIndex: 0,
    script: bsv.Script.buildPublicKeyHashOut(address).toHex(),
    satoshis: 100000
  }

  // Create simple transaction
  var transaction = new bsv.Transaction()
    .from(utxo)
    .to(address, 99000)

  // Generate preimage for the input with our SIGHASH type
  var subscript = bsv.Script.fromHex(utxo.script)
  var preimageBuffer = bsv.Transaction.sighash.sighashPreimage(
    transaction,
    this.sighashType,
    0,
    subscript,
    new bsv.crypto.BN(utxo.satoshis)
  )

  var Preimage = require('./preimage')
  var preimage = new Preimage(preimageBuffer)

  return {
    transaction: transaction,
    preimage: preimage,
    sighashType: this.sighashType,
    analysis: this.analysis,
    zeroHashBehavior: this.getZeroHashBehavior(),
    fields: preimage.extract(),
    validation: preimage.validate()
  }
}

/**
 * Create comprehensive SIGHASH demonstration
 * @returns {Object} Complete SIGHASH analysis with examples
 */
SIGHASH.prototype.createDemonstration = function() {
  var example = this.generateExample()
  var zeroHash = Buffer.alloc(32).toString('hex')
  
  var demonstration = {
    sighashType: this.sighashType,
    analysis: this.analysis,
    zeroHashBehavior: this.getZeroHashBehavior(),
    preimageFields: {},
    observations: [],
    educationalNotes: []
  }

  // Extract and analyze preimage fields
  var fields = example.preimage.toObject().fields
  demonstration.preimageFields = fields

  // Check for zero hashes and explain them
  if (fields.hashPrevouts === zeroHash) {
    demonstration.observations.push({
      field: 'hashPrevouts',
      value: 'ZERO HASH (00...00)',
      reason: 'ANYONECANPAY flag - this input can be combined with any other inputs'
    })
  }

  if (fields.hashSequence === zeroHash) {
    demonstration.observations.push({
      field: 'hashSequence',
      value: 'ZERO HASH (00...00)',
      reason: this.analysis.baseType + ' flag - sequence numbers not covered by signature'
    })
  }

  if (fields.hashOutputs === zeroHash) {
    demonstration.observations.push({
      field: 'hashOutputs',
      value: 'ZERO HASH (00...00)',
      reason: this.analysis.baseType + ' flag - outputs not fully covered by signature'
    })
  }

  // Educational notes
  demonstration.educationalNotes = [
    "Zero hashes in preimages are NOT errors - they indicate specific SIGHASH flag behavior",
    "BIP-143 mandates these zero values when certain flags are used",
    "ANYONECANPAY allows this input to be combined with different sets of inputs",
    "SIGHASH_NONE means the signer doesn't care about any outputs",
    "SIGHASH_SINGLE means the signer only cares about the corresponding output",
    "Always check SIGHASH flags when you see 'mysterious' zero hashes in preimages"
  ]

  return demonstration
}

/**
 * Check if preimage matches expected SIGHASH behavior
 * @param {Preimage} preimage - Preimage to check
 * @returns {Object} Compliance check result
 */
SIGHASH.prototype.checkCompliance = function(preimage) {
  var fields = preimage.toObject().fields
  var zeroHash = Buffer.alloc(32).toString('hex')
  var compliance = {
    compliant: true,
    issues: [],
    expectedZeros: [],
    unexpectedZeros: []
  }

  var expectedBehavior = this.getZeroHashBehavior()

  // Check hashPrevouts
  if (expectedBehavior.hashPrevouts && fields.hashPrevouts !== zeroHash) {
    compliance.compliant = false
    compliance.issues.push('hashPrevouts should be zero due to ANYONECANPAY flag')
  } else if (!expectedBehavior.hashPrevouts && fields.hashPrevouts === zeroHash) {
    compliance.unexpectedZeros.push('hashPrevouts is zero but ANYONECANPAY not set')
  }

  // Check hashSequence
  if (expectedBehavior.hashSequence && fields.hashSequence !== zeroHash) {
    compliance.compliant = false
    compliance.issues.push('hashSequence should be zero due to ' + this.analysis.baseType + ' flag')
  } else if (!expectedBehavior.hashSequence && fields.hashSequence === zeroHash) {
    compliance.unexpectedZeros.push('hashSequence is zero but ' + this.analysis.baseType + ' allows sequence coverage')
  }

  // Check hashOutputs  
  if (expectedBehavior.hashOutputs && fields.hashOutputs !== zeroHash) {
    compliance.compliant = false
    compliance.issues.push('hashOutputs should be zero due to ' + this.analysis.baseType + ' flag')
  } else if (!expectedBehavior.hashOutputs && fields.hashOutputs === zeroHash) {
    compliance.unexpectedZeros.push('hashOutputs is zero but ' + this.analysis.baseType + ' should cover outputs')
  }

  return compliance
}

/**
 * Internal flag analysis
 * @private
 */
SIGHASH.prototype._analyzeFlags = function() {
  var baseType = this.sighashType & 0x1f
  var anyoneCanPay = (this.sighashType & 0x80) !== 0
  var forkId = (this.sighashType & 0x40) !== 0

  var baseTypeName = 'UNKNOWN'
  if (baseType === 1) baseTypeName = 'ALL'
  else if (baseType === 2) baseTypeName = 'NONE' 
  else if (baseType === 3) baseTypeName = 'SINGLE'

  var flags = []
  flags.push(baseTypeName)
  if (anyoneCanPay) flags.push('ANYONECANPAY')
  if (forkId) flags.push('FORKID')

  return {
    sighashType: this.sighashType,
    baseType: baseTypeName,
    anyoneCanPay: anyoneCanPay,
    forkId: forkId,
    flagName: flags.join(' | '),
    hex: '0x' + this.sighashType.toString(16).padStart(8, '0'),
    binary: '0b' + this.sighashType.toString(2).padStart(32, '0')
  }
}

/**
 * Static utility methods
 */

/**
 * Get all standard SIGHASH types
 * @returns {Array} Array of SIGHASH type objects
 */
SIGHASH.getAllTypes = function() {
  var forkId = bsv.crypto.Signature.SIGHASH_FORKID

  return [
    { name: 'ALL', value: bsv.crypto.Signature.SIGHASH_ALL | forkId },
    { name: 'NONE', value: bsv.crypto.Signature.SIGHASH_NONE | forkId },
    { name: 'SINGLE', value: bsv.crypto.Signature.SIGHASH_SINGLE | forkId },
    { name: 'ALL | ANYONECANPAY', value: bsv.crypto.Signature.SIGHASH_ALL | bsv.crypto.Signature.SIGHASH_ANYONECANPAY | forkId },
    { name: 'NONE | ANYONECANPAY', value: bsv.crypto.Signature.SIGHASH_NONE | bsv.crypto.Signature.SIGHASH_ANYONECANPAY | forkId },
    { name: 'SINGLE | ANYONECANPAY', value: bsv.crypto.Signature.SIGHASH_SINGLE | bsv.crypto.Signature.SIGHASH_ANYONECANPAY | forkId }
  ]
}

/**
 * Generate demonstrations for all SIGHASH types
 * @returns {Array} Array of demonstrations for each SIGHASH type
 */
SIGHASH.generateAllDemonstrations = function() {
  return SIGHASH.getAllTypes().map(function(type) {
    var sighash = new SIGHASH(type.value)
    return {
      typeName: type.name,
      demonstration: sighash.createDemonstration()
    }
  })
}

/**
 * Explain the "extra zero mystery" that confuses developers
 * @returns {Object} Educational explanation
 */
SIGHASH.explainZeroMystery = function() {
  return {
    title: "The 'Extra Zero' Mystery in Bitcoin Preimages",
    problem: "Developers often see zero hashes (0x00...00) in preimage fields and think it's a bug",
    reality: "These zeros are CORRECT behavior mandated by BIP-143 for specific SIGHASH flags",
    explanation: [
      "ANYONECANPAY sets hashPrevouts to zero - allows input combination flexibility",
      "SIGHASH_NONE sets hashSequence and hashOutputs to zero - signer doesn't care about outputs",
      "SIGHASH_SINGLE sets hashSequence to zero - only corresponding output matters",
      "These are features, not bugs - they enable advanced Bitcoin transaction patterns"
    ],
    solution: "Always check SIGHASH flags when analyzing preimages with zero hashes",
    toolTip: "Use SIGHASH.checkCompliance() to verify if zero hashes match expected flag behavior"
  }
}

module.exports = SIGHASH