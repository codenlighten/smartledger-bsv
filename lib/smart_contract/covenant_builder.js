/**
 * covenant_builder.js
 * ===================
 * 
 * High-level JavaScript API for building Bitcoin SV covenant scripts.
 * This module allows you to write covenant logic in JavaScript and automatically
 * generates the corresponding Bitcoin Script ASM and hex.
 * 
 * Features:
 * - JavaScript-to-Bitcoin Script translation
 * - Preimage field extraction utilities
 * - Conditional logic builders
 * - Arithmetic and comparison operations
 * - Data manipulation functions
 * - Template-based covenant patterns
 */

'use strict'

const { opcodeMap, scriptNum, utils } = require('./opcode_map')

/**
 * CovenantBuilder Class - High-level covenant construction
 */
class CovenantBuilder {
  constructor() {
    this.operations = []
    this.comments = []
  }

  /**
   * Add a comment for documentation
   */
  comment(text) {
    this.comments.push(`// ${text}`)
    return this
  }

  /**
   * Push a value onto the stack
   */
  push(value) {
    if (typeof value === 'number') {
      if (value >= -1 && value <= 16) {
        if (value === -1) {
          this.operations.push('OP_1NEGATE')
        } else if (value === 0) {
          this.operations.push('OP_0')
        } else {
          this.operations.push(`OP_${value}`)
        }
      } else {
        // For larger numbers, push encoded bytes
        const encoded = scriptNum.encode(value)
        this.operations.push(encoded.toString('hex'))
      }
    } else if (typeof value === 'string') {
      // Assume hex string
      this.operations.push(value)
    } else if (Buffer.isBuffer(value)) {
      this.operations.push(value.toString('hex'))
    } else {
      throw new Error(`Invalid value type: ${typeof value}`)
    }
    return this
  }

  /**
   * Stack manipulation operations
   */
  dup() { this.operations.push('OP_DUP'); return this }
  drop() { this.operations.push('OP_DROP'); return this }
  swap() { this.operations.push('OP_SWAP'); return this }
  over() { this.operations.push('OP_OVER'); return this }
  rot() { this.operations.push('OP_ROT'); return this }
  pick(n) { this.push(n); this.operations.push('OP_PICK'); return this }
  roll(n) { this.push(n); this.operations.push('OP_ROLL'); return this }
  depth() { this.operations.push('OP_DEPTH'); return this }

  /**
   * Arithmetic operations
   */
  add() { this.operations.push('OP_ADD'); return this }
  sub() { this.operations.push('OP_SUB'); return this }
  mul() { this.operations.push('OP_MUL'); return this }
  div() { this.operations.push('OP_DIV'); return this }
  mod() { this.operations.push('OP_MOD'); return this }
  negate() { this.operations.push('OP_NEGATE'); return this }
  abs() { this.operations.push('OP_ABS'); return this }
  min() { this.operations.push('OP_MIN'); return this }
  max() { this.operations.push('OP_MAX'); return this }

  /**
   * Comparison operations
   */
  equal() { this.operations.push('OP_EQUAL'); return this }
  equalVerify() { this.operations.push('OP_EQUALVERIFY'); return this }
  numEqual() { this.operations.push('OP_NUMEQUAL'); return this }
  numNotEqual() { this.operations.push('OP_NUMNOTEQUAL'); return this }
  lessThan() { this.operations.push('OP_LESSTHAN'); return this }
  greaterThan() { this.operations.push('OP_GREATERTHAN'); return this }
  lessThanOrEqual() { this.operations.push('OP_LESSTHANOREQUAL'); return this }
  greaterThanOrEqual() { this.operations.push('OP_GREATERTHANOREQUAL'); return this }
  within() { this.operations.push('OP_WITHIN'); return this }

  /**
   * Logical operations
   */
  not() { this.operations.push('OP_NOT'); return this }
  boolAnd() { this.operations.push('OP_BOOLAND'); return this }
  boolOr() { this.operations.push('OP_BOOLOR'); return this }

  /**
   * Bitwise operations
   */
  and() { this.operations.push('OP_AND'); return this }
  or() { this.operations.push('OP_OR'); return this }
  xor() { this.operations.push('OP_XOR'); return this }
  invert() { this.operations.push('OP_INVERT'); return this }

  /**
   * Data manipulation operations
   */
  cat() { this.operations.push('OP_CAT'); return this }
  split() { this.operations.push('OP_SPLIT'); return this }
  size() { this.operations.push('OP_SIZE'); return this }
  left(n) { this.push(n); this.operations.push('OP_LEFT'); return this }
  right(n) { this.push(n); this.operations.push('OP_RIGHT'); return this }
  substr(start, length) { 
    this.push(length).push(start)
    this.operations.push('OP_SUBSTR')
    return this
  }

  /**
   * Cryptographic operations
   */
  sha256() { this.operations.push('OP_SHA256'); return this }
  hash256() { this.operations.push('OP_HASH256'); return this }
  hash160() { this.operations.push('OP_HASH160'); return this }
  ripemd160() { this.operations.push('OP_RIPEMD160'); return this }

  /**
   * Control flow operations
   */
  verify() { this.operations.push('OP_VERIFY'); return this }
  return() { this.operations.push('OP_RETURN'); return this }

  /**
   * Preimage field extraction utilities
   */
  extractField(fieldName) {
    this.comment(`Extract ${fieldName} field from preimage`)
    
    const fieldMappings = {
      'nVersion': { strategy: 'LEFT', offset: 0, length: 4 },
      'hashPrevouts': { strategy: 'LEFT', offset: 4, length: 32 },
      'hashSequence': { strategy: 'LEFT', offset: 36, length: 32 },
      'outpoint': { strategy: 'LEFT', offset: 68, length: 36 },
      'scriptLen': { strategy: 'DYNAMIC', position: 'after_outpoint' },
      'scriptCode': { strategy: 'DYNAMIC', variable_length: true },
      'value': { strategy: 'RIGHT', offsetFromEnd: 52, length: 8 },
      'nSequence': { strategy: 'RIGHT', offsetFromEnd: 44, length: 4 },
      'hashOutputs': { strategy: 'RIGHT', offsetFromEnd: 40, length: 32 },
      'nLocktime': { strategy: 'RIGHT', offsetFromEnd: 8, length: 4 },
      'sighashType': { strategy: 'RIGHT', offsetFromEnd: 4, length: 4 }
    }

    const field = fieldMappings[fieldName]
    if (!field) {
      throw new Error(`Unknown field: ${fieldName}`)
    }

    if (field.strategy === 'LEFT') {
      // LEFT extraction: split at offset, take left part, then extract field
      this.push(field.offset + field.length)
        .split()
        .drop() // Drop right part
        .push(field.offset)
        .split()
        .swap()
        .drop() // Drop left padding, keep field
    } else if (field.strategy === 'RIGHT') {
      // RIGHT extraction: calculate split position from end
      this.size()
        .push(field.offsetFromEnd)
        .sub()
        .split()
        .drop() // Drop left part
        .push(field.length)
        .split()
        .drop() // Drop remaining, keep field
    } else if (field.strategy === 'DYNAMIC') {
      if (fieldName === 'scriptLen') {
        // Extract scriptLen (varint after outpoint)
        this.push(104) // Fixed left part (4+32+32+36)
          .split()
          .drop() // Drop left part
          // For now, assume 1-byte varint
          .push(1)
          .split()
          .swap()
          .drop() // Keep just the length byte
      } else {
        throw new Error(`Dynamic extraction for ${fieldName} not implemented`)
      }
    }

    return this
  }

  /**
   * Preimage validation patterns
   */
  validateField(fieldName, expectedValue) {
    this.comment(`Validate ${fieldName} equals expected value`)
    this.extractField(fieldName)
    this.push(expectedValue)
    this.equalVerify()
    return this
  }

  /**
   * Range validation
   */
  validateRange(fieldName, min, max) {
    this.comment(`Validate ${fieldName} is within range [${min}, ${max})`)
    this.extractField(fieldName)
    // Convert to number for comparison
    // Stack: [field_value]
    this.dup()
    this.push(min)
    this.greaterThanOrEqual()
    this.verify() // Ensure >= min
    
    this.push(max)
    this.lessThan()
    this.verify() // Ensure < max
    
    return this
  }

  /**
   * Multi-field validation
   */
  validateFields(fieldRules) {
    this.comment('Multi-field validation')
    Object.entries(fieldRules).forEach(([fieldName, rule]) => {
      if (rule.equals) {
        this.validateField(fieldName, rule.equals)
      } else if (rule.min !== undefined || rule.max !== undefined) {
        this.validateRange(fieldName, rule.min || 0, rule.max || Number.MAX_SAFE_INTEGER)
      }
    })
    return this
  }

  /**
   * Conditional execution helpers
   */
  if(condition) {
    // This is a simplified IF - real implementation would need parser state
    this.comment('Begin IF block')
    if (typeof condition === 'function') {
      condition(this)
    }
    this.operations.push('OP_IF')
    return this
  }

  else() {
    this.comment('ELSE block')
    this.operations.push('OP_ELSE')
    return this
  }

  endif() {
    this.comment('End IF block')
    this.operations.push('OP_ENDIF')
    return this
  }

  /**
   * Build the final script
   */
  build() {
    const asm = this.operations.join(' ')
    const cleanedASM = this._cleanASM(asm)
    
    return {
      operations: [...this.operations],
      comments: [...this.comments],
      asm: asm,
      cleanedASM: cleanedASM,
      hex: this._asmToHex(cleanedASM),
      size: cleanedASM.split(' ').length
    }
  }

  /**
   * Clean ASM for Bitcoin Script execution
   */
  _cleanASM(asm) {
    return asm.split(' ').map(token => {
      // Convert decimal numbers to hex representation
      if (/^\d+$/.test(token)) {
        const num = parseInt(token)
        if (num >= 1 && num <= 75) {
          // Direct push of 1-75 bytes
          return num.toString(16).padStart(2, '0')
        } else {
          // Encode as script number
          return scriptNum.encode(num).toString('hex')
        }
      }
      return token
    }).join(' ')
  }

  /**
   * Convert ASM to hex (simplified)
   */
  _asmToHex(asm) {
    // This is a simplified implementation
    // Real implementation would use BSV library
    return asm.split(' ').map(token => {
      if (opcodeMap[token]) {
        return opcodeMap[token].code.toString(16).padStart(2, '0')
      } else if (/^[0-9a-fA-F]+$/.test(token)) {
        return token
      } else {
        return '00' // Unknown
      }
    }).join('')
  }

  /**
   * Simulate execution
   */
  simulate(initialStack = []) {
    return utils.simulate(this.operations, initialStack)
  }

  /**
   * Generate documentation
   */
  document() {
    const built = this.build()
    return {
      title: 'Covenant Script Documentation',
      operations: built.operations.length,
      size: built.size,
      asm: built.cleanedASM,
      comments: this.comments,
      structure: this._analyzeStructure()
    }
  }

  _analyzeStructure() {
    const structure = {
      stack_operations: 0,
      arithmetic: 0,
      comparisons: 0,
      crypto: 0,
      data_manipulation: 0,
      flow_control: 0
    }

    this.operations.forEach(op => {
      const opInfo = opcodeMap[op]
      if (opInfo) {
        switch (opInfo.category) {
          case 'stack': structure.stack_operations++; break
          case 'arithmetic': structure.arithmetic++; break
          case 'bitwise': structure.comparisons++; break
          case 'crypto': structure.crypto++; break
          case 'data': structure.data_manipulation++; break
          case 'flow_control': structure.flow_control++; break
        }
      }
    })

    return structure
  }
}

/**
 * Factory functions for common covenant patterns
 */
const CovenantTemplates = {
  /**
   * Value lock covenant - ensures output value matches expected amount
   */
  valueLock: (expectedValue) => {
    return new CovenantBuilder()
      .comment('Value Lock Covenant')
      .comment(`Expected value: ${expectedValue}`)
      .validateField('value', expectedValue)
      .push(1) // Success
  },

  /**
   * Hash lock covenant - requires preimage that hashes to expected value
   */
  hashLock: (expectedHash) => {
    return new CovenantBuilder()
      .comment('Hash Lock Covenant')
      .comment(`Expected hash: ${expectedHash}`)
      .sha256()
      .push(expectedHash)
      .equalVerify()
      .push(1) // Success
  },

  /**
   * Multi-signature covenant with field validation
   */
  multiSigWithValidation: (requiredSigs, pubkeys, fieldRules) => {
    const builder = new CovenantBuilder()
      .comment('Multi-Signature Covenant with Field Validation')
      .comment(`Required signatures: ${requiredSigs}`)
      
    // Validate fields first
    builder.validateFields(fieldRules)
    
    // Then require signatures (simplified)
    builder.comment('Signature validation (placeholder)')
      .push(1) // Success placeholder
      
    return builder
  },

  /**
   * Time-locked covenant
   */
  timeLock: (locktime) => {
    return new CovenantBuilder()
      .comment('Time Lock Covenant')
      .comment(`Locktime: ${locktime}`)
      .validateField('nLocktime', locktime)
      .push(1) // Success
  },

  /**
   * Complex validation covenant
   */
  complexValidation: (rules) => {
    const builder = new CovenantBuilder()
      .comment('Complex Validation Covenant')
    
    // Value range validation
    if (rules.valueRange) {
      builder.validateRange('value', rules.valueRange.min, rules.valueRange.max)
    }
    
    // Specific field validations
    if (rules.fields) {
      builder.validateFields(rules.fields)
    }
    
    // Hash validation
    if (rules.hashValidation) {
      builder.sha256()
        .push(rules.hashValidation.expectedHash)
        .equalVerify()
    }
    
    builder.push(1) // Success
    return builder
  }
}

module.exports = {
  CovenantBuilder,
  CovenantTemplates
}

// CLI demonstration
if (require.main === module) {
  console.log("🏗️  Covenant Builder Demonstration")
  console.log("==================================")

  // Example 1: Simple value lock
  console.log("\n📊 Example 1: Value Lock Covenant")
  const valueLock = CovenantTemplates.valueLock('50c3000000000000')
  const built = valueLock.build()
  console.log("ASM:", built.cleanedASM)
  console.log("Size:", built.size, "operations")

  // Example 2: Custom covenant
  console.log("\n📊 Example 2: Custom Arithmetic Covenant")
  const custom = new CovenantBuilder()
    .comment('Validate that value field equals 5 + 3')
    .extractField('value')
    .push(5)
    .push(3)
    .add()
    .numEqual()
    .verify()
    .push(1)

  const customBuilt = custom.build()
  console.log("Operations:", customBuilt.operations.length)
  console.log("ASM:", customBuilt.cleanedASM)
  
  // Example 3: Documentation
  console.log("\n📊 Example 3: Documentation Generation")
  const docs = custom.document()
  console.log("Structure analysis:", docs.structure)
  console.log("Comments:")
  docs.comments.forEach(comment => console.log("  " + comment))
}