/**
 * SmartContract.Builder Class  
 * ============================
 * 
 * Advanced covenant builder with:
 * - Multi-field preimage validation
 * - Dynamic script construction
 * - Template-based covenant creation
 * - Complex condition chaining
 * 
 * Based on examples/covenants2/covenant_bidirectional_example.js
 */

'use strict'

var bsv = require('../..')

/**
 * Builder Class - Advanced covenant construction
 * @param {PrivateKey} privateKey - Private key for covenant operations  
 * @param {Object} options - Configuration options
 */
function Builder(privateKey, options) {
  if (!(this instanceof Builder)) {
    return new Builder(privateKey, options)
  }

  this.privateKey = privateKey
  this.publicKey = privateKey ? privateKey.publicKey : null
  this.options = options || {}
  
  // Builder state
  this.conditions = []
  this.preimageFields = []
  this.scriptTemplate = null
  this.validationRules = []
  
  this.sighashType = this.options.sighashType || 
    (bsv.crypto.Signature.SIGHASH_ALL | bsv.crypto.Signature.SIGHASH_FORKID)
}

/**
 * Add preimage field validation
 * @param {string} field - Preimage field name
 * @param {string|Buffer} expectedValue - Expected value or validation rule
 * @param {Object} options - Validation options
 * @returns {Builder} Builder instance for chaining
 */
Builder.prototype.validateField = function(field, expectedValue, options) {
  options = options || {}

  var validation = {
    field: field,
    expectedValue: expectedValue,
    operator: options.operator || 'EQUAL',
    required: options.required !== false,
    description: options.description || 'Validate ' + field
  }

  this.validationRules.push(validation)
  return this
}

/**
 * Add custom script condition
 * @param {string|Function} condition - Script opcode or custom function
 * @param {Object} options - Condition options
 * @returns {Builder} Builder instance for chaining
 */
Builder.prototype.addCondition = function(condition, options) {
  options = options || {}

  var conditionObj = {
    type: typeof condition === 'function' ? 'CUSTOM' : 'OPCODE',
    condition: condition,
    description: options.description || 'Custom condition',
    required: options.required !== false
  }

  this.conditions.push(conditionObj)
  return this
}

/**
 * Set script template for covenant construction
 * @param {string} template - Script template name or custom script
 * @param {Object} params - Template parameters
 * @returns {Builder} Builder instance for chaining
 */
Builder.prototype.useTemplate = function(template, params) {
  this.scriptTemplate = {
    name: template,
    params: params || {},
    customScript: typeof template === 'object' ? template : null
  }
  return this
}

/**
 * Build covenant locking script
 * @param {Object} preimageData - Preimage data for validation setup
 * @returns {Script} Constructed locking script
 */
Builder.prototype.buildLockingScript = function(preimageData) {
  var script = new bsv.Script()

  if (this.scriptTemplate) {
    return this._buildFromTemplate(preimageData)
  }

  // Default multi-field validation covenant
  return this._buildMultiFieldCovenant(preimageData)
}

/**
 * Build unlocking script for spending covenant
 * @param {Transaction} spendingTx - Transaction being signed
 * @param {number} inputIndex - Input index
 * @param {Object} covenantData - Original covenant data
 * @returns {Script} Constructed unlocking script
 */
Builder.prototype.buildUnlockingScript = function(spendingTx, inputIndex, covenantData) {
  var script = new bsv.Script()

  // Add signature
  var covenantScript = bsv.Script.fromHex(covenantData.script)
  var signature = bsv.Transaction.sighash.sign(
    spendingTx,
    this.privateKey,
    this.sighashType,
    inputIndex,
    covenantScript,
    new bsv.crypto.BN(covenantData.satoshis)
  )

  var fullSignature = Buffer.concat([
    signature.toDER(),
    Buffer.from([this.sighashType])
  ])

  script.add(fullSignature)

  // Add preimage if required
  if (covenantData.originalPreimage) {
    script.add(Buffer.from(covenantData.originalPreimage, 'hex'))
  }

  // Add any additional unlock conditions
  this.conditions.forEach(function(condition) {
    if (condition.type === 'UNLOCK_DATA') {
      script.add(condition.data)
    }
  })

  return script
}

/**
 * Create complete covenant from P2PKH
 * @param {Object} utxo - P2PKH UTXO
 * @param {Object} buildOptions - Build options
 * @returns {Object} Created covenant with metadata
 */
Builder.prototype.createCovenant = function(utxo, buildOptions) {
  buildOptions = buildOptions || {}

  // Create covenant creation transaction
  var creationTx = new bsv.Transaction()
    .from({
      txId: utxo.txid,
      outputIndex: utxo.vout,
      script: utxo.script,
      satoshis: utxo.satoshis
    })
    .to(this.privateKey.toAddress(), utxo.satoshis - (buildOptions.fee || 1000))

  // Generate creation preimage
  var p2pkhScript = bsv.Script.fromHex(utxo.script)
  var creationPreimage = bsv.Transaction.sighash.sighashPreimage(
    creationTx,
    this.sighashType,
    0,
    p2pkhScript,
    new bsv.crypto.BN(utxo.satoshis)
  )

  // Extract preimage fields for covenant construction
  var Preimage = require('./preimage')
  var preimageObj = new Preimage(creationPreimage)
  var preimageFields = preimageObj.extract()

  // Build covenant locking script
  var covenantScript = this.buildLockingScript({
    preimage: creationPreimage,
    fields: preimageFields,
    transaction: creationTx
  })

  // Update transaction output
  creationTx.outputs[0].setScript(covenantScript)

  // Sign creation transaction
  creationTx.sign(this.privateKey)

  var covenantUtxo = {
    txid: creationTx.id,
    vout: 0,
    satoshis: utxo.satoshis - (buildOptions.fee || 1000),
    script: covenantScript.toHex(),
    originalPreimage: creationPreimage.toString('hex'),
    preimageFields: preimageFields,
    validationRules: this.validationRules.slice(), // Copy rules
    conditions: this.conditions.slice(), // Copy conditions
    template: this.scriptTemplate,
    createdAt: new Date().toISOString(),
    type: 'builder_covenant'
  }

  return {
    creationTx: creationTx,
    covenantUtxo: covenantUtxo,
    lockingScript: covenantScript,
    preimageData: {
      preimage: creationPreimage,
      fields: preimageFields
    }
  }
}

/**
 * Validate covenant spending transaction
 * @param {Transaction} spendingTx - Transaction to validate
 * @param {Object} covenantUtxo - Original covenant UTXO
 * @returns {Object} Validation result
 */
Builder.prototype.validateSpending = function(spendingTx, covenantUtxo) {
  var validation = {
    valid: true,
    errors: [],
    warnings: [],
    fieldValidations: []
  }

  // Generate spending preimage
  var covenantScript = bsv.Script.fromHex(covenantUtxo.script)
  var spendingPreimage = bsv.Transaction.sighash.sighashPreimage(
    spendingTx,
    this.sighashType,
    0,
    covenantScript,
    new bsv.crypto.BN(covenantUtxo.satoshis)
  )

  var Preimage = require('./preimage')
  var preimageObj = new Preimage(spendingPreimage)
  var spendingFields = preimageObj.extract()

  // Validate against original rules
  if (covenantUtxo.validationRules) {
    covenantUtxo.validationRules.forEach(function(rule) {
      var fieldValidation = this._validateFieldRule(rule, spendingFields, covenantUtxo.preimageFields)
      validation.fieldValidations.push(fieldValidation)
      
      if (!fieldValidation.passed && rule.required) {
        validation.valid = false
        validation.errors.push(fieldValidation.error)
      }
    }.bind(this))
  }

  // Run Script.Interpreter validation
  var interpreter = new bsv.Script.Interpreter()
  var flags = bsv.Script.Interpreter.SCRIPT_VERIFY_P2SH |
              bsv.Script.Interpreter.SCRIPT_VERIFY_STRICTENC |
              bsv.Script.Interpreter.SCRIPT_VERIFY_DERSIG |
              bsv.Script.Interpreter.SCRIPT_VERIFY_LOW_S |
              bsv.Script.Interpreter.SCRIPT_ENABLE_SIGHASH_FORKID

  var unlockingScript = spendingTx.inputs[0].script
  var lockingScript = bsv.Script.fromHex(covenantUtxo.script)

  var interpreterResult = interpreter.verify(
    unlockingScript,
    lockingScript,
    spendingTx,
    0,
    flags,
    new bsv.crypto.BN(covenantUtxo.satoshis)
  )

  if (!interpreterResult) {
    validation.valid = false
    validation.errors.push('Script interpreter validation failed: ' + interpreter.errstr)
  }

  return validation
}

/**
 * Private helper methods
 */

/**
 * Build covenant from template
 * @private
 */
Builder.prototype._buildFromTemplate = function(preimageData) {
  var template = this.scriptTemplate

  if (template.name === 'HASH_LOCK') {
    return this._buildHashLockTemplate(preimageData, template.params)
  } else if (template.name === 'MULTI_FIELD') {
    return this._buildMultiFieldTemplate(preimageData, template.params)
  } else if (template.customScript) {
    return template.customScript
  }

  throw new Error('Unknown template: ' + template.name)
}

/**
 * Build multi-field validation covenant
 * @private
 */
Builder.prototype._buildMultiFieldCovenant = function(preimageData) {
  var script = new bsv.Script()

  // Duplicate preimage for multiple validations
  script.add('OP_DUP')

  // Add field validation opcodes based on rules
  this.validationRules.forEach(function(rule, index) {
    if (index > 0) script.add('OP_DUP') // Duplicate for next validation
    
    script.add('OP_HASH256')
    
    if (rule.expectedValue) {
      var expectedHash = bsv.crypto.Hash.sha256sha256(Buffer.from(rule.expectedValue, 'hex'))
      script.add(expectedHash)
      script.add('OP_EQUALVERIFY')
    }
  })

  // Clean up stack and add signature check
  script.add('OP_DROP')
  
  if (this.publicKey) {
    script.add(this.publicKey.toBuffer())
    script.add('OP_CHECKSIG')
  }

  return script
}

/**
 * Build hash lock template
 * @private
 */
Builder.prototype._buildHashLockTemplate = function(preimageData, params) {
  var script = new bsv.Script()
  
  script.add('OP_DUP')
  script.add('OP_HASH256')
  
  var expectedHash = params.hash || bsv.crypto.Hash.sha256sha256(preimageData.preimage)
  script.add(expectedHash)
  script.add('OP_EQUALVERIFY')
  script.add('OP_DROP')
  
  if (this.publicKey) {
    script.add(this.publicKey.toBuffer())
    script.add('OP_CHECKSIG')
  }

  return script
}

/**
 * Validate individual field rule
 * @private
 */
Builder.prototype._validateFieldRule = function(rule, spendingFields, originalFields) {
  var fieldValue = spendingFields[rule.field]
  var expectedValue = rule.expectedValue

  // If expected value references original field
  if (typeof expectedValue === 'string' && expectedValue.startsWith('ORIGINAL_')) {
    var originalField = expectedValue.replace('ORIGINAL_', '')
    expectedValue = originalFields[originalField]
  }

  var passed = false
  var error = null

  switch (rule.operator) {
    case 'EQUAL':
      passed = fieldValue && fieldValue.equals ? fieldValue.equals(expectedValue) : fieldValue === expectedValue
      if (!passed) error = rule.field + ' does not equal expected value'
      break
    case 'NOT_EQUAL':
      passed = fieldValue && fieldValue.equals ? !fieldValue.equals(expectedValue) : fieldValue !== expectedValue
      if (!passed) error = rule.field + ' should not equal specified value'
      break
    case 'PRESENT':
      passed = !!fieldValue
      if (!passed) error = rule.field + ' is required but not present'
      break
    default:
      error = 'Unknown validation operator: ' + rule.operator
  }

  return {
    field: rule.field,
    operator: rule.operator,
    passed: passed,
    error: error,
    description: rule.description
  }
}

/**
 * Static utility methods
 */

/**
 * Create simple hash-lock covenant builder
 * @param {PrivateKey} privateKey - Private key for covenant
 * @param {Buffer} expectedHash - Expected preimage hash
 * @returns {Builder} Configured builder
 */
Builder.createHashLock = function(privateKey, expectedHash) {
  return new Builder(privateKey)
    .useTemplate('HASH_LOCK', { hash: expectedHash })
}

/**
 * Create multi-field validation covenant builder  
 * @param {PrivateKey} privateKey - Private key for covenant
 * @param {Array} fieldRules - Array of field validation rules
 * @returns {Builder} Configured builder
 */
Builder.createMultiField = function(privateKey, fieldRules) {
  var builder = new Builder(privateKey)
  
  fieldRules.forEach(function(rule) {
    builder.validateField(rule.field, rule.expectedValue, rule.options)
  })

  return builder
}

module.exports = Builder