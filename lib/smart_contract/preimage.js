/**
 * SmartContract.Preimage Class
 * ============================
 * 
 * Enhanced BIP-143 preimage utilities with:
 * - Complete CompactSize varint support (1-3 bytes) 
 * - SIGHASH flag detection and zero hash warnings
 * - Bidirectional field extraction (LEFT/RIGHT/DYNAMIC)
 * - Multi-input transaction handling
 * 
 * Based on examples/preimage/extract_preimage_bidirectional.js
 */

'use strict'

var bsv = require('../..')
var crypto = require('crypto')

/**
 * Preimage Class - Enhanced preimage field extraction
 * @param {Buffer|string} preimage - Raw preimage data
 * @param {Object} options - Configuration options
 */
function Preimage(preimage, options) {
  if (!(this instanceof Preimage)) {
    return new Preimage(preimage, options)
  }

  this.preimage = Buffer.isBuffer(preimage) ? preimage : Buffer.from(preimage, 'hex')
  this.options = options || {}
  this.strategy = this.options.strategy || 'DYNAMIC' // LEFT, RIGHT, DYNAMIC
  
  // Initialize extracted fields
  this.fields = null
  this.sighashInfo = null
  
  // Auto-extract if not deferred
  if (!this.options.deferExtraction) {
    this._extractFields()
  }
}

/**
 * Extract all preimage fields using bidirectional strategy
 * @param {string} extractionStrategy - 'LEFT', 'RIGHT', or 'DYNAMIC'
 * @returns {Object} Extracted preimage fields
 */
Preimage.prototype.extract = function(extractionStrategy) {
  this.strategy = extractionStrategy || this.strategy
  this._extractFields()
  return this.fields
}

/**
 * Get SIGHASH flag information and warnings
 * @returns {Object} SIGHASH analysis
 */
Preimage.prototype.getSighashInfo = function() {
  if (!this.fields) {
    this._extractFields()
  }
  return this.sighashInfo
}

/**
 * Get specific field by name
 * @param {string} fieldName - Field name (version, hashPrevouts, etc.)
 * @returns {Buffer} Field value
 */
Preimage.prototype.getField = function(fieldName) {
  if (!this.fields) {
    this._extractFields()
  }
  return this.fields[fieldName]
}

/**
 * Extract any preimage field with bidirectional strategy and generate ASM
 * @param {string} fieldName - Field to extract
 * @param {Object} options - Extraction options (includeComments: boolean)
 * @returns {Object} Field data with ASM generation
 */
Preimage.prototype.extractField = function(fieldName, options) {
  options = options || {}
  
  if (!this.fields) {
    this._extractFields()
  }

  // Parse preimage structure for dynamic extraction
  var parsed = this._parsePreimageStructure()
  
  // Generate bidirectional ASM for field extraction
  var asm = this._generateBidirectionalASM(fieldName, parsed, options.includeComments)
  
  // Extract field value
  var fieldValue = this._extractSpecificField(fieldName, parsed)
  
  // Generate interpretation
  var interpretation = this._interpretField(fieldName, fieldValue, parsed)
  
  return {
    field: fieldName,
    value: fieldValue ? fieldValue.toString('hex') : null,
    buffer: fieldValue,
    asm: asm,
    interpretation: interpretation,
    strategy: this._getExtractionStrategy(fieldName),
    structure: parsed._structure
  }
}

/**
 * Generate Bitcoin Script ASM for extracting any preimage field
 * @param {string} fieldName - Field to extract
 * @param {boolean} includeComments - Whether to include comments in ASM (default: false)
 * @returns {string} ASM code for field extraction
 */
Preimage.prototype.generateASM = function(fieldName, includeComments) {
  var parsed = this._parsePreimageStructure()
  return this._generateBidirectionalASM(fieldName, parsed, includeComments)
}

/**
 * Extract multiple fields with their ASM generation
 * @param {Array} fieldNames - Array of field names to extract
 * @returns {Object} Multiple field extraction results
 */
Preimage.prototype.extractFields = function(fieldNames) {
  var results = {}
  
  fieldNames.forEach(function(fieldName) {
    results[fieldName] = this.extractField(fieldName)
  }.bind(this))
  
  return results
}

/**
 * Validate preimage structure
 * @returns {Object} Validation result
 */
Preimage.prototype.validate = function() {
  if (!this.fields) {
    this._extractFields()
  }

  var errors = []
  var warnings = []

  // Check required fields
  var requiredFields = [
    'version', 'hashPrevouts', 'hashSequence', 'outpoint',
    'scriptCode', 'amount', 'sequence', 'hashOutputs', 'locktime', 'sighash'
  ]

  requiredFields.forEach(function(field) {
    if (!this.fields[field]) {
      errors.push('Missing required field: ' + field)
    }
  }.bind(this))

  // Check for zero hashes that might indicate SIGHASH flags
  if (this.sighashInfo.hasZeroHashes) {
    warnings.push('Zero hashes detected - check SIGHASH flags: ' + this.sighashInfo.zeroFields.join(', '))
  }

  // Validate preimage length
  if (this.preimage.length < 104) { // Minimum BIP-143 preimage size
    errors.push('Preimage too short: ' + this.preimage.length + ' bytes (minimum 104)')
  }

  return {
    valid: errors.length === 0,
    errors: errors,
    warnings: warnings,
    sighashInfo: this.sighashInfo
  }
}

/**
 * Convert preimage to detailed object representation
 * @returns {Object} Complete preimage breakdown
 */
Preimage.prototype.toObject = function() {
  if (!this.fields) {
    this._extractFields()
  }

  return {
    preimage: this.preimage.toString('hex'),
    length: this.preimage.length,
    strategy: this.strategy,
    fields: {
      version: this.fields.version ? this.fields.version.toString('hex') : null,
      hashPrevouts: this.fields.hashPrevouts ? this.fields.hashPrevouts.toString('hex') : null,
      hashSequence: this.fields.hashSequence ? this.fields.hashSequence.toString('hex') : null,
      outpoint: this.fields.outpoint ? this.fields.outpoint.toString('hex') : null,
      scriptCode: this.fields.scriptCode ? this.fields.scriptCode.toString('hex') : null,
      scriptCodeLength: this.fields.scriptCodeLength,
      amount: this.fields.amount ? this.fields.amount.toString('hex') : null,
      sequence: this.fields.sequence ? this.fields.sequence.toString('hex') : null,
      hashOutputs: this.fields.hashOutputs ? this.fields.hashOutputs.toString('hex') : null,
      locktime: this.fields.locktime ? this.fields.locktime.toString('hex') : null,
      sighash: this.fields.sighash ? this.fields.sighash.toString('hex') : null
    },
    sighashInfo: this.sighashInfo,
    validation: this.validate()
  }
}

/**
 * Internal field extraction implementation
 * @private
 */
Preimage.prototype._extractFields = function() {
  this.fields = {}
  this.sighashInfo = {
    flag: null,
    hasZeroHashes: false,
    zeroFields: [],
    warnings: []
  }

  try {
    if (this.strategy === 'LEFT' || this.strategy === 'DYNAMIC') {
      this._extractFromLeft()
    } else if (this.strategy === 'RIGHT') {
      this._extractFromRight()
    }

    // Analyze SIGHASH flags and zero hashes
    this._analyzeSighash()

  } catch (error) {
    if (this.strategy === 'DYNAMIC') {
      // Try alternative strategy on failure
      try {
        this.strategy = 'RIGHT'
        this._extractFromRight()
        this._analyzeSighash()
      } catch (fallbackError) {
        throw new Error('Failed to extract preimage fields with any strategy: ' + error.message)
      }
    } else {
      throw error
    }
  }
}

/**
 * Extract fields from left to right (standard approach)
 * @private
 */
Preimage.prototype._extractFromLeft = function() {
  var offset = 0

  // version (4 bytes)
  this.fields.version = this.preimage.slice(offset, offset + 4)
  offset += 4

  // hashPrevouts (32 bytes)
  this.fields.hashPrevouts = this.preimage.slice(offset, offset + 32)
  offset += 32

  // hashSequence (32 bytes)
  this.fields.hashSequence = this.preimage.slice(offset, offset + 32)
  offset += 32

  // outpoint (36 bytes: 32 byte txid + 4 byte vout)
  this.fields.outpoint = this.preimage.slice(offset, offset + 36)
  offset += 36

  // scriptCode - starts with CompactSize varint
  var scriptResult = Preimage.decodeCompactSize(this.preimage, offset)
  this.fields.scriptCodeLength = scriptResult.value
  offset = scriptResult.nextOffset

  this.fields.scriptCode = this.preimage.slice(offset, offset + this.fields.scriptCodeLength)
  offset += this.fields.scriptCodeLength

  // amount (8 bytes)
  this.fields.amount = this.preimage.slice(offset, offset + 8)
  offset += 8

  // sequence (4 bytes)
  this.fields.sequence = this.preimage.slice(offset, offset + 4)
  offset += 4

  // hashOutputs (32 bytes)
  this.fields.hashOutputs = this.preimage.slice(offset, offset + 32)
  offset += 32

  // locktime (4 bytes)
  this.fields.locktime = this.preimage.slice(offset, offset + 4)
  offset += 4

  // sighash (4 bytes)
  this.fields.sighash = this.preimage.slice(offset, offset + 4)
}

/**
 * Extract fields from right to left (fallback strategy)
 * @private
 */
Preimage.prototype._extractFromRight = function() {
  var length = this.preimage.length
  var offset = length

  // sighash (4 bytes from end)
  offset -= 4
  this.fields.sighash = this.preimage.slice(offset, offset + 4)

  // locktime (4 bytes)
  offset -= 4
  this.fields.locktime = this.preimage.slice(offset, offset + 4)

  // hashOutputs (32 bytes)
  offset -= 32
  this.fields.hashOutputs = this.preimage.slice(offset, offset + 32)

  // sequence (4 bytes)
  offset -= 4
  this.fields.sequence = this.preimage.slice(offset, offset + 4)

  // amount (8 bytes)
  offset -= 8
  this.fields.amount = this.preimage.slice(offset, offset + 8)

  // Now work from the left for scriptCode with varint
  var leftOffset = 4 + 32 + 32 + 36 // Skip version, hashPrevouts, hashSequence, outpoint

  var scriptResult = Preimage.decodeCompactSize(this.preimage, leftOffset)
  this.fields.scriptCodeLength = scriptResult.value
  this.fields.scriptCode = this.preimage.slice(scriptResult.nextOffset, scriptResult.nextOffset + this.fields.scriptCodeLength)

  // Extract remaining left-side fields
  this.fields.version = this.preimage.slice(0, 4)
  this.fields.hashPrevouts = this.preimage.slice(4, 36)
  this.fields.hashSequence = this.preimage.slice(36, 68)
  this.fields.outpoint = this.preimage.slice(68, 104)
}

/**
 * Analyze SIGHASH flags and detect zero hashes
 * @private
 */
Preimage.prototype._analyzeSighash = function() {
  if (!this.fields.sighash) return

  var sighashFlag = this.fields.sighash.readUInt32LE(0)
  this.sighashInfo.flag = sighashFlag

  // Check for SIGHASH flag components
  var baseType = sighashFlag & 0x1f
  var anyoneCanPay = (sighashFlag & 0x80) !== 0
  var forkId = (sighashFlag & 0x40) !== 0

  // Detect zero hashes based on SIGHASH flags
  var zeroHash = Buffer.alloc(32)

  if (anyoneCanPay && this.fields.hashPrevouts.equals(zeroHash)) {
    this.sighashInfo.hasZeroHashes = true
    this.sighashInfo.zeroFields.push('hashPrevouts')
    this.sighashInfo.warnings.push('ANYONECANPAY flag detected - hashPrevouts is zero')
  }

  if (baseType === 2 && this.fields.hashSequence.equals(zeroHash)) { // SIGHASH_NONE
    this.sighashInfo.hasZeroHashes = true
    this.sighashInfo.zeroFields.push('hashSequence')
    this.sighashInfo.warnings.push('SIGHASH_NONE flag detected - hashSequence is zero')
  }

  if ((baseType === 2 || baseType === 3) && this.fields.hashOutputs.equals(zeroHash)) { // NONE or SINGLE
    this.sighashInfo.hasZeroHashes = true
    this.sighashInfo.zeroFields.push('hashOutputs')
    this.sighashInfo.warnings.push('SIGHASH_NONE/SINGLE flag detected - hashOutputs is zero')
  }

  // Set human-readable flag description
  var flagNames = []
  if (baseType === 1) flagNames.push('ALL')
  else if (baseType === 2) flagNames.push('NONE')
  else if (baseType === 3) flagNames.push('SINGLE')
  
  if (anyoneCanPay) flagNames.push('ANYONECANPAY')
  if (forkId) flagNames.push('FORKID')

  this.sighashInfo.flagName = flagNames.join(' | ')
}

/**
 * Parse preimage structure for bidirectional extraction
 * @private
 * @returns {Object} Parsed preimage structure with all fields
 */
Preimage.prototype._parsePreimageStructure = function() {
  var buf = this.preimage
  var offset = 0
  var parsed = {}
  
  // Define field structures
  var leftFixedFields = [
    { name: 'nVersion', len: 4 },
    { name: 'hashPrevouts', len: 32 },
    { name: 'hashSequence', len: 32 },
    { name: 'outpoint_txid', len: 32 },
    { name: 'outpoint_vout', len: 4 }
  ]
  
  var rightFixedFields = [
    { name: 'value', len: 8 },
    { name: 'nSequence', len: 4 },
    { name: 'hashOutputs', len: 32 },
    { name: 'nLocktime', len: 4 },
    { name: 'sighashType', len: 4 }
  ]
  
  // Parse LEFT fixed fields
  for (var i = 0; i < leftFixedFields.length; i++) {
    var field = leftFixedFields[i]
    parsed[field.name] = buf.slice(offset, offset + field.len).toString('hex')
    offset += field.len
  }
  
  // Parse CompactSize varint for scriptLen
  var scriptLenInfo = Preimage.decodeCompactSize(buf, offset)
  parsed.scriptLen = scriptLenInfo.value
  parsed.scriptLenSize = scriptLenInfo.bytes
  parsed.scriptLenRaw = buf.slice(offset, offset + scriptLenInfo.bytes).toString('hex')
  offset += scriptLenInfo.bytes
  
  // Parse variable scriptCode
  parsed.scriptCode = buf.slice(offset, offset + parsed.scriptLen).toString('hex')
  offset += parsed.scriptLen
  
  // Parse RIGHT fields
  for (var j = 0; j < rightFixedFields.length; j++) {
    var rightField = rightFixedFields[j]
    parsed[rightField.name] = buf.slice(offset, offset + rightField.len).toString('hex')
    offset += rightField.len
  }
  
  // Add structure info
  var leftFixedTotal = leftFixedFields.reduce(function(sum, f) { return sum + f.len }, 0)
  var rightTotal = rightFixedFields.reduce(function(sum, f) { return sum + f.len }, 0)
  
  parsed._structure = {
    leftFixed: leftFixedTotal,
    scriptLenVarint: scriptLenInfo.bytes,
    scriptCode: parsed.scriptLen,
    rightFixed: rightTotal,
    totalCalculated: leftFixedTotal + scriptLenInfo.bytes + parsed.scriptLen + rightTotal,
    totalActual: buf.length
  }
  
  return parsed
}

/**
 * Generate bidirectional ASM for field extraction
 * @private
 * @param {string} fieldName - Field to extract
 * @param {Object} parsed - Parsed preimage structure
 * @param {boolean} includeComments - Whether to include comments in ASM
 * @returns {string} ASM code
 */
Preimage.prototype._generateBidirectionalASM = function(fieldName, parsed, includeComments) {
  // Field mappings
  var rightFields = ['value', 'nSequence', 'hashOutputs', 'nLocktime', 'sighashType']
  var leftFields = ['nVersion', 'hashPrevouts', 'hashSequence', 'outpoint_txid', 'outpoint_vout']
  
  if (rightFields.includes(fieldName)) {
    return this._generateRightExtractionASM(fieldName, includeComments)
  } else if (leftFields.includes(fieldName)) {
    return this._generateLeftExtractionASM(fieldName, includeComments)
  } else if (fieldName === 'scriptCode') {
    return this._generateDynamicExtractionASM(parsed, includeComments)
  } else if (fieldName === 'scriptLen') {
    return this._generateScriptLenExtractionASM(parsed, includeComments)
  } else {
    throw new Error('Unknown field: ' + fieldName)
  }
}

/**
 * Generate ASM for RIGHT-side field extraction
 * @private
 */
Preimage.prototype._generateRightExtractionASM = function(fieldName, includeComments) {
  var rightFields = [
    { name: 'value', len: 8 },
    { name: 'nSequence', len: 4 },
    { name: 'hashOutputs', len: 32 },
    { name: 'nLocktime', len: 4 },
    { name: 'sighashType', len: 4 }
  ]
  
  // Calculate offset from end (accumulate lengths of fields that come AFTER target field)
  var offsetFromEnd = 0
  var targetLen = 0
  var found = false
  
  for (var i = 0; i < rightFields.length; i++) {
    var f = rightFields[i]
    if (f.name === fieldName) {
      targetLen = f.len
      found = true
      break
    }
    offsetFromEnd += f.len
  }
  
  if (!found) throw new Error('Field not found in RIGHT fields: ' + fieldName)
  
  var rightTotal = 52 // Total bytes in right zone
  var splitPoint = rightTotal - offsetFromEnd // Split point from end
  
  var instructions = []
  
  if (includeComments) {
    instructions.push('# 🔄 Extract ' + fieldName + ' from RIGHT side (bidirectional strategy)')
    instructions.push('OP_SIZE                    # Push preimage size: [preimage, size]')
  } else {
    instructions.push('OP_SIZE')
  }
  
  if (includeComments) {
    instructions = instructions.concat([
      splitPoint + ' OP_SUB     # Calculate split point: [preimage, split_point]',
      'OP_SPLIT                  # Split: [left_part, right_part]',
      'OP_DROP                   # Drop left: [right_part]',
      targetLen + ' OP_SPLIT             # Extract field: [remaining, ' + fieldName + ']',
      'OP_DROP                   # Clean up: [' + fieldName + ']',
      '# ✅ Result: ' + fieldName + ' is now on top of stack'
    ])
  } else {
    instructions = instructions.concat([
      splitPoint + ' OP_SUB',
      'OP_SPLIT',
      'OP_DROP',
      targetLen + ' OP_SPLIT',
      'OP_DROP'
    ])
  }
  
  return instructions.join('\n')
}

/**
 * Generate ASM for LEFT-side field extraction
 * @private
 */
Preimage.prototype._generateLeftExtractionASM = function(fieldName, includeComments) {
  var leftFields = [
    { name: 'nVersion', len: 4, offset: 0 },
    { name: 'hashPrevouts', len: 32, offset: 4 },
    { name: 'hashSequence', len: 32, offset: 36 },
    { name: 'outpoint_txid', len: 32, offset: 68 },
    { name: 'outpoint_vout', len: 4, offset: 100 }
  ]
  
  var fieldInfo = leftFields.find(function(f) { return f.name === fieldName })
  if (!fieldInfo) throw new Error('Field not found in LEFT fields: ' + fieldName)
  
  var instructions = []
  
  if (includeComments) {
    instructions = [
      '# 🔄 Extract ' + fieldName + ' from LEFT side (bidirectional strategy)',
      fieldInfo.offset + ' OP_SPLIT           # Skip to field: [prefix, remainder]',
      'OP_DROP                   # Drop prefix: [remainder]',
      fieldInfo.len + ' OP_SPLIT             # Extract field: [' + fieldName + ', suffix]',
      'OP_DROP                   # Clean up: [' + fieldName + ']',
      '# ✅ Result: ' + fieldName + ' is now on top of stack'
    ]
  } else {
    instructions = [
      fieldInfo.offset + ' OP_SPLIT',
      'OP_DROP',
      fieldInfo.len + ' OP_SPLIT',
      'OP_DROP'
    ]
  }
  
  return instructions.join('\n')
}

/**
 * Generate ASM for dynamic scriptCode extraction
 * @private
 */
Preimage.prototype._generateDynamicExtractionASM = function(parsed, includeComments) {
  var leftZone = 104 + parsed.scriptLenSize // 104 bytes fixed + varint size
  
  return [
    '# 🎯 Extract scriptCode DYNAMICALLY with CompactSize varint support',
    leftZone + ' OP_SPLIT            # Skip left zone + scriptLen varint: [left_zone, remainder]',
    'OP_DROP                   # Drop left: [remainder]',
    parsed.scriptLen + ' OP_SPLIT             # Extract scriptCode: [scriptCode, right_zone]',
    'OP_DROP                   # Clean up: [scriptCode]',
    '# ✅ Result: scriptCode extracted with ' + parsed.scriptLenSize + '-byte varint awareness'
  ].join('\n')
}

/**
 * Generate ASM for scriptLen extraction
 * @private
 */
Preimage.prototype._generateScriptLenExtractionASM = function(parsed, includeComments) {
  return [
    '# 🎯 Extract scriptLen CompactSize varint (' + parsed.scriptLenSize + ' bytes)',
    '104 OP_SPLIT            # Skip left fixed fields: [left_zone, remainder]',
    'OP_DROP                   # Drop left: [remainder]',
    parsed.scriptLenSize + ' OP_SPLIT             # Extract varint: [scriptLen_varint, suffix]',
    'OP_DROP                   # Clean up: [scriptLen_varint]',
    '# ✅ Result: CompactSize varint (decode off-chain to get ' + parsed.scriptLen + ')'
  ].join('\n')
}

/**
 * Extract specific field from parsed structure
 * @private
 */
Preimage.prototype._extractSpecificField = function(fieldName, parsed) {
  var hexValue = parsed[fieldName]
  return hexValue ? Buffer.from(hexValue, 'hex') : null
}

/**
 * Interpret field value with context
 * @private
 */
Preimage.prototype._interpretField = function(fieldName, fieldValue, parsed) {
  if (!fieldValue) return null
  
  var interpretation = {
    raw: fieldValue.toString('hex'),
    bytes: fieldValue.length
  }
  
  try {
    switch (fieldName) {
      case 'nVersion':
        interpretation.value = fieldValue.readUInt32LE(0)
        interpretation.description = 'Transaction version ' + interpretation.value
        break
        
      case 'value':
        if (fieldValue.length === 8) {
          interpretation.satoshis = fieldValue.readBigUInt64LE(0).toString()
          interpretation.description = interpretation.satoshis + ' satoshis'
        }
        break
        
      case 'sighashType':
        var sighashInt = fieldValue.readUInt32LE(0)
        var types = {
          1: 'SIGHASH_ALL',
          65: 'SIGHASH_ALL | FORKID',
          2: 'SIGHASH_NONE',
          66: 'SIGHASH_NONE | FORKID',
          3: 'SIGHASH_SINGLE',
          67: 'SIGHASH_SINGLE | FORKID'
        }
        interpretation.value = sighashInt
        interpretation.description = types[sighashInt] || 'Custom (' + sighashInt + ')'
        break
        
      case 'outpoint_vout':
        interpretation.value = fieldValue.readUInt32LE(0)
        interpretation.description = 'Output index ' + interpretation.value
        break
        
      case 'scriptLen':
        interpretation.varintSize = parsed.scriptLenSize
        interpretation.scriptLength = parsed.scriptLen
        interpretation.description = parsed.scriptLen + ' bytes encoded as ' + parsed.scriptLenSize + '-byte varint'
        break
        
      case 'scriptCode':
        if (fieldValue.length === 25 && fieldValue[0] === 0x76 && fieldValue[1] === 0xa9) {
          interpretation.description = 'Standard P2PKH script (25 bytes)'
          interpretation.type = 'P2PKH'
        } else if (fieldValue.length > 0 && fieldValue[0] === 0x6a) {
          interpretation.description = 'OP_RETURN data script (' + fieldValue.length + ' bytes)'
          interpretation.type = 'OP_RETURN'
        } else {
          interpretation.description = 'Custom script (' + fieldValue.length + ' bytes)'
          interpretation.type = 'CUSTOM'
        }
        break
        
      default:
        if (['hashPrevouts', 'hashSequence', 'hashOutputs'].includes(fieldName)) {
          var zeroHash = Buffer.alloc(32)
          if (fieldValue.equals(zeroHash)) {
            interpretation.isZero = true
            interpretation.description = 'Zero hash (check SIGHASH flags)'
          } else {
            interpretation.description = '32-byte hash'
          }
        }
    }
  } catch (error) {
    interpretation.error = error.message
  }
  
  return interpretation
}

/**
 * Get extraction strategy for field
 * @private
 */
Preimage.prototype._getExtractionStrategy = function(fieldName) {
  var rightFields = ['value', 'nSequence', 'hashOutputs', 'nLocktime', 'sighashType']
  var leftFields = ['nVersion', 'hashPrevouts', 'hashSequence', 'outpoint_txid', 'outpoint_vout']
  
  if (rightFields.includes(fieldName)) return 'RIGHT'
  if (leftFields.includes(fieldName)) return 'LEFT'
  if (fieldName === 'scriptCode') return 'DYNAMIC'
  if (fieldName === 'scriptLen') return 'VARINT'
  return 'UNKNOWN'
}

/**
 * Static utility methods
 */

/**
 * Decode CompactSize varint (1-3 bytes for practical Bitcoin amounts)
 * @param {Buffer} buffer - Buffer to read from
 * @param {number} offset - Starting offset
 * @returns {Object} Decoded value and next offset
 */
Preimage.decodeCompactSize = function(buffer, offset) {
  var firstByte = buffer[offset]

  if (firstByte < 0xfd) {
    // 1 byte encoding (0-252)
    return { value: firstByte, nextOffset: offset + 1, bytes: 1 }
  } else if (firstByte === 0xfd) {
    // 2 byte encoding (253-65535)
    var value = buffer.readUInt16LE(offset + 1)
    return { value: value, nextOffset: offset + 3, bytes: 3 }
  } else if (firstByte === 0xfe) {
    // 4 byte encoding (65536-4294967295) - rare for script lengths
    var value = buffer.readUInt32LE(offset + 1)
    return { value: value, nextOffset: offset + 5, bytes: 5 }
  } else {
    // 8 byte encoding - extremely rare, try to handle gracefully
    console.warn('Encountered 8-byte CompactSize - this is very unusual for script lengths')
    // For our purposes, assume it's a reasonable script length and try to parse it
    // This is a fallback for malformed or test data
    try {
      // Read as 4-byte for now since 8-byte values would be enormous for scripts
      var value = buffer.readUInt32LE(offset + 1)
      return { value: value, nextOffset: offset + 9, bytes: 9 } // Skip full 8 bytes + marker
    } catch (e) {
      throw new Error('Invalid 8-byte CompactSize encoding in preimage')
    }
  }
}

/**
 * Create preimage from transaction and input details
 * @param {Transaction} transaction - Transaction to create preimage for
 * @param {number} inputIndex - Input index to sign
 * @param {Script} subscript - Subscript for signing
 * @param {number} satoshis - Input amount in satoshis
 * @param {number} sighashType - SIGHASH type
 * @returns {Preimage} Preimage instance
 */
Preimage.fromTransaction = function(transaction, inputIndex, subscript, satoshis, sighashType) {
  var preimageBuffer = bsv.Transaction.sighash.sighashPreimage(
    transaction,
    sighashType,
    inputIndex,
    subscript,
    new bsv.crypto.BN(satoshis)
  )

  return new Preimage(preimageBuffer, {
    transaction: transaction,
    inputIndex: inputIndex,
    subscript: subscript,
    satoshis: satoshis,
    sighashType: sighashType
  })
}

/**
 * Generate example preimage with specific SIGHASH flags
 * @param {number} sighashType - SIGHASH type to demonstrate
 * @returns {Preimage} Example preimage
 */
Preimage.createExample = function(sighashType) {
  // Create a simple example transaction
  var privateKey = bsv.PrivateKey.fromRandom()
  var address = privateKey.toAddress()

  var utxo = {
    txId: '0'.repeat(64),
    outputIndex: 0,
    script: bsv.Script.buildPublicKeyHashOut(address).toHex(),
    satoshis: 100000
  }

  var transaction = new bsv.Transaction()
    .from(utxo)
    .to(address, 99000)

  var subscript = bsv.Script.fromHex(utxo.script)
  
  return Preimage.fromTransaction(transaction, 0, subscript, utxo.satoshis, sighashType)
}

/**
 * Extract any field from raw preimage hex (static utility)
 * @param {string} preimageHex - Raw preimage as hex string
 * @param {string} fieldName - Field to extract
 * @param {Object} options - Extraction options
 * @returns {Object} Field extraction result with ASM
 */
Preimage.extractFromHex = function(preimageHex, fieldName, options) {
  var preimage = new Preimage(preimageHex, { deferExtraction: true })
  return preimage.extractField(fieldName, options)
}

/**
 * Generate ASM for field extraction from raw hex (static utility)
 * @param {string} preimageHex - Raw preimage as hex string
 * @param {string} fieldName - Field to extract ASM for
 * @returns {string} ASM code for stack manipulation
 */
Preimage.generateASMFromHex = function(preimageHex, fieldName, includeComments) {
  var preimage = new Preimage(preimageHex, { deferExtraction: true })
  return preimage.generateASM(fieldName, includeComments)
}

/**
 * Batch extract multiple fields from raw hex (static utility)
 * @param {string} preimageHex - Raw preimage as hex string
 * @param {Array} fieldNames - Array of field names
 * @returns {Object} Multiple field extraction results
 */
Preimage.extractMultipleFromHex = function(preimageHex, fieldNames) {
  var preimage = new Preimage(preimageHex, { deferExtraction: true })
  return preimage.extractFields(fieldNames)
}

/**
 * Validate preimage structure from raw hex (static utility)
 * @param {string} preimageHex - Raw preimage as hex string
 * @returns {Object} Validation result
 */
Preimage.validateFromHex = function(preimageHex) {
  var preimage = new Preimage(preimageHex)
  return preimage.validate()
}

/**
 * Parse preimage structure and return detailed analysis (static utility)
 * @param {string} preimageHex - Raw preimage as hex string
 * @returns {Object} Complete preimage analysis
 */
Preimage.analyzeFromHex = function(preimageHex) {
  var preimage = new Preimage(preimageHex)
  var parsed = preimage._parsePreimageStructure()
  var validation = preimage.validate()
  
  return {
    hex: preimageHex,
    length: preimageHex.length / 2, // Convert from hex chars to bytes
    structure: parsed._structure,
    fields: parsed,
    validation: validation,
    sighashInfo: preimage.getSighashInfo(),
    
    // Helper methods for common operations
    extractField: function(fieldName) {
      return preimage.extractField(fieldName)
    },
    
    generateASM: function(fieldName) {
      return preimage.generateASM(fieldName)
    },
    
    getSummary: function() {
      return {
        totalBytes: parsed._structure.totalActual,
        scriptLength: parsed.scriptLen,
        scriptVarintSize: parsed.scriptLenSize,
        sighashType: parsed.sighashType,
        valid: validation.valid,
        warnings: validation.warnings
      }
    }
  }
}

module.exports = Preimage