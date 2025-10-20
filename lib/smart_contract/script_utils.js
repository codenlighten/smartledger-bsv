#!/usr/bin/env node
/**
 * script_utils.js
 * ===============
 * 
 * Comprehensive script analysis and conversion utilities for Bitcoin SV.
 * Provides missing functionality for script manipulation, validation, and optimization.
 * 
 * Features:
 * - Script format conversions (Buffer ↔ ASM ↔ Hex)
 * - Script validation and syntax checking
 * - Script optimization and analysis
 * - Performance metrics and complexity analysis
 * - Human-readable explanations
 */

'use strict'

const bsv = require('../..')

/**
 * Script Format Conversion Utilities
 */

function scriptToASM(scriptBuffer) {
  if (Buffer.isBuffer(scriptBuffer)) {
    const script = bsv.Script.fromBuffer(scriptBuffer)
    return script.toASM()
  } else if (scriptBuffer && typeof scriptBuffer.toASM === 'function') {
    return scriptBuffer.toASM()
  }
  throw new Error('Input must be a Buffer or Script object')
}

function asmToScript(asmString) {
  try {
    return bsv.Script.fromASM(asmString)
  } catch (error) {
    throw new Error(`Invalid ASM string: ${error.message}`)
  }
}

function asmToHex(asmString) {
  try {
    const script = bsv.Script.fromASM(asmString)
    return script.toBuffer().toString('hex')
  } catch (error) {
    throw new Error(`Cannot convert ASM to hex: ${error.message}`)
  }
}

function hexToASM(hexString) {
  try {
    const buffer = Buffer.from(hexString, 'hex')
    const script = bsv.Script.fromBuffer(buffer)
    return script.toASM()
  } catch (error) {
    throw new Error(`Cannot convert hex to ASM: ${error.message}`)
  }
}

function scriptToHex(script) {
  if (Buffer.isBuffer(script)) {
    return script.toString('hex')
  } else if (script && typeof script.toBuffer === 'function') {
    return script.toBuffer().toString('hex')
  }
  throw new Error('Input must be a Buffer or Script object')
}

/**
 * Script Validation Utilities
 */

function validateASM(asmString) {
  try {
    bsv.Script.fromASM(asmString)
    return { valid: true, error: null }
  } catch (error) {
    return { valid: false, error: error.message }
  }
}

function validateScript(script) {
  try {
    let scriptObj
    if (typeof script === 'string') {
      scriptObj = bsv.Script.fromASM(script)
    } else if (Buffer.isBuffer(script)) {
      scriptObj = bsv.Script.fromBuffer(script)
    } else if (script && typeof script.toBuffer === 'function') {
      scriptObj = script
    } else {
      return { valid: false, error: 'Invalid script input type' }
    }
    
    // Basic validation checks
    const buffer = scriptObj.toBuffer()
    const asm = scriptObj.toASM()
    
    return {
      valid: true,
      error: null,
      size: buffer.length,
      asm: asm,
      operations: asm.split(' ').length
    }
  } catch (error) {
    return { valid: false, error: error.message }
  }
}

function validateSyntax(asmString) {
  const validation = validateASM(asmString)
  if (!validation.valid) {
    return validation
  }
  
  // Additional syntax checks
  const operations = asmString.split(' ')
  const issues = []
  
  for (let i = 0; i < operations.length; i++) {
    const op = operations[i]
    
    // Check for unknown opcodes
    if (op.startsWith('OP_') && !bsv.Opcode.map[op]) {
      issues.push(`Unknown opcode: ${op} at position ${i}`)
    }
    
    // Check for malformed hex data
    if (!op.startsWith('OP_') && op.length > 0) {
      if (!/^[0-9a-fA-F]*$/.test(op)) {
        issues.push(`Invalid hex data: ${op} at position ${i}`)
      }
    }
  }
  
  return {
    valid: issues.length === 0,
    error: issues.length > 0 ? issues.join('; ') : null,
    issues: issues,
    operations: operations.length
  }
}

/**
 * Script Analysis Utilities
 */

function estimateScriptSize(script) {
  try {
    let scriptObj
    if (typeof script === 'string') {
      scriptObj = bsv.Script.fromASM(script)
    } else if (Array.isArray(script)) {
      scriptObj = bsv.Script.fromASM(script.join(' '))
    } else if (Buffer.isBuffer(script)) {
      return script.length
    } else if (script && typeof script.toBuffer === 'function') {
      scriptObj = script
    } else {
      throw new Error('Invalid script input')
    }
    
    return scriptObj.toBuffer().length
  } catch (error) {
    return { error: error.message }
  }
}

function scriptMetrics(script) {
  try {
    const validation = validateScript(script)
    if (!validation.valid) {
      return { error: validation.error }
    }
    
    const asm = validation.asm
    const operations = asm.split(' ')
    const size = validation.size
    
    // Analyze operation types
    const opcodeCount = operations.filter(op => op.startsWith('OP_')).length
    const dataCount = operations.filter(op => !op.startsWith('OP_') && op.length > 0).length
    
    // Estimate execution cost (simplified)
    let executionCost = 0
    operations.forEach(op => {
      if (op.startsWith('OP_')) {
        // Different opcodes have different costs
        if (['OP_CHECKSIG', 'OP_CHECKSIGVERIFY'].includes(op)) {
          executionCost += 100 // Signature operations are expensive
        } else if (['OP_SHA256', 'OP_HASH160', 'OP_HASH256'].includes(op)) {
          executionCost += 10 // Hash operations are moderately expensive
        } else {
          executionCost += 1 // Basic operations
        }
      }
    })
    
    return {
      size: size,
      operations: operations.length,
      opcodes: opcodeCount,
      dataElements: dataCount,
      estimatedCost: executionCost,
      complexity: executionCost > 50 ? 'high' : executionCost > 10 ? 'medium' : 'low',
      asm: asm
    }
  } catch (error) {
    return { error: error.message }
  }
}

function analyzeComplexity(script) {
  const metrics = scriptMetrics(script)
  if (metrics.error) {
    return metrics
  }
  
  const analysis = {
    size: metrics.size,
    operations: metrics.operations,
    complexity: metrics.complexity,
    recommendations: []
  }
  
  // Provide recommendations
  if (metrics.size > 520) {
    analysis.recommendations.push('Script exceeds standard size limit (520 bytes)')
  }
  
  if (metrics.estimatedCost > 100) {
    analysis.recommendations.push('High execution cost - consider optimization')
  }
  
  if (metrics.operations > 200) {
    analysis.recommendations.push('Many operations - may hit operation limits')
  }
  
  return analysis
}

/**
 * Script Optimization Utilities
 */

function optimizeScript(script) {
  try {
    let asm
    if (typeof script === 'string') {
      asm = script
    } else if (Array.isArray(script)) {
      asm = script.join(' ')
    } else {
      asm = scriptToASM(script)
    }
    
    const operations = asm.split(' ')
    const optimized = []
    
    for (let i = 0; i < operations.length; i++) {
      const current = operations[i]
      const next = operations[i + 1]
      
      // Skip empty operations
      if (!current || current.trim() === '') {
        continue
      }
      
      // Optimization: Remove redundant DUP/DROP pairs
      if (current === 'OP_DUP' && next === 'OP_DROP') {
        i++ // Skip the next operation too
        continue
      }
      
      // Optimization: Combine consecutive data pushes (simplified)
      if (!current.startsWith('OP_') && !next?.startsWith('OP_') && next) {
        // Could combine data pushes, but keep simple for now
        optimized.push(current)
      } else {
        optimized.push(current)
      }
    }
    
    const optimizedASM = optimized.join(' ')
    const originalSize = estimateScriptSize(asm)
    const optimizedSize = estimateScriptSize(optimizedASM)
    
    return {
      original: asm,
      optimized: optimizedASM,
      originalSize: originalSize,
      optimizedSize: optimizedSize,
      savings: originalSize - optimizedSize,
      improvement: originalSize > 0 ? ((originalSize - optimizedSize) / originalSize * 100).toFixed(1) + '%' : '0%'
    }
  } catch (error) {
    return { error: error.message }
  }
}

function findOptimizations(script) {
  const optimizations = []
  
  try {
    let asm
    if (typeof script === 'string') {
      asm = script
    } else {
      asm = scriptToASM(script)
    }
    
    const operations = asm.split(' ')
    
    // Find potential optimizations
    for (let i = 0; i < operations.length - 1; i++) {
      const current = operations[i]
      const next = operations[i + 1]
      
      // Redundant DUP/DROP
      if (current === 'OP_DUP' && next === 'OP_DROP') {
        optimizations.push({
          type: 'redundant_operation',
          position: i,
          description: 'Remove redundant OP_DUP OP_DROP pair',
          savings: 2
        })
      }
      
      // Inefficient number pushes
      if (current.match(/^[0-9a-fA-F]+$/) && current.length === 2) {
        const num = parseInt(current, 16)
        if (num >= 1 && num <= 16) {
          optimizations.push({
            type: 'inefficient_push',
            position: i,
            description: `Use OP_${num} instead of pushing ${current}`,
            savings: 1
          })
        }
      }
    }
    
    return {
      optimizations: optimizations,
      totalSavings: optimizations.reduce((sum, opt) => sum + opt.savings, 0)
    }
  } catch (error) {
    return { error: error.message }
  }
}

/**
 * Script Comparison Utilities
 */

function compareScripts(scriptA, scriptB) {
  try {
    let bufferA, bufferB
    
    if (typeof scriptA === 'string') {
      bufferA = bsv.Script.fromASM(scriptA).toBuffer()
    } else if (Buffer.isBuffer(scriptA)) {
      bufferA = scriptA
    } else {
      bufferA = scriptA.toBuffer()
    }
    
    if (typeof scriptB === 'string') {
      bufferB = bsv.Script.fromASM(scriptB).toBuffer()
    } else if (Buffer.isBuffer(scriptB)) {
      bufferB = scriptB
    } else {
      bufferB = scriptB.toBuffer()
    }
    
    const identical = bufferA.equals(bufferB)
    
    return {
      identical: identical,
      scriptA: {
        size: bufferA.length,
        asm: scriptToASM(bufferA)
      },
      scriptB: {
        size: bufferB.length,
        asm: scriptToASM(bufferB)
      }
    }
  } catch (error) {
    return { error: error.message }
  }
}

/**
 * Script Explanation Utilities
 */

function explainScript(script) {
  try {
    let asm
    if (typeof script === 'string') {
      asm = script
    } else {
      asm = scriptToASM(script)
    }
    
    const operations = asm.split(' ')
    const explanations = []
    
    operations.forEach((op, index) => {
      let explanation = ''
      
      if (op.startsWith('OP_')) {
        // Explain common opcodes
        switch (op) {
          case 'OP_DUP':
            explanation = 'Duplicate the top stack item'
            break
          case 'OP_DROP':
            explanation = 'Remove the top stack item'
            break
          case 'OP_SWAP':
            explanation = 'Swap the top two stack items'
            break
          case 'OP_ADD':
            explanation = 'Add the top two numbers'
            break
          case 'OP_SUB':
            explanation = 'Subtract: second - first'
            break
          case 'OP_EQUAL':
            explanation = 'Check if top two items are equal'
            break
          case 'OP_VERIFY':
            explanation = 'Assert that top item is true (non-zero)'
            break
          case 'OP_CHECKSIG':
            explanation = 'Verify signature against public key'
            break
          case 'OP_SHA256':
            explanation = 'Calculate SHA256 hash of top item'
            break
          case 'OP_HASH160':
            explanation = 'Calculate RIPEMD160(SHA256(x)) hash'
            break
          case 'OP_IF':
            explanation = 'Begin conditional execution'
            break
          case 'OP_ELSE':
            explanation = 'Alternative branch of conditional'
            break
          case 'OP_ENDIF':
            explanation = 'End conditional execution'
            break
          default:
            explanation = `Execute ${op}`
        }
      } else if (op.length > 0) {
        explanation = `Push data: ${op} (${op.length / 2} bytes)`
      }
      
      if (explanation) {
        explanations.push({
          operation: op,
          position: index,
          explanation: explanation
        })
      }
    })
    
    return {
      asm: asm,
      operations: operations.length,
      explanations: explanations,
      summary: `Script with ${operations.length} operations: ${explanations.map(e => e.explanation).join(' → ')}`
    }
  } catch (error) {
    return { error: error.message }
  }
}

function covenantToEnglish(covenant) {
  try {
    const explanation = explainScript(covenant)
    if (explanation.error) {
      return explanation
    }
    
    const sentences = []
    
    explanation.explanations.forEach(step => {
      switch (step.operation) {
        case 'OP_VERIFY':
          sentences.push('The condition must be true for the script to succeed.')
          break
        case 'OP_CHECKSIG':
          sentences.push('A valid signature must be provided.')
          break
        case 'OP_EQUAL':
          sentences.push('Two values must be identical.')
          break
        case 'OP_ADD':
          sentences.push('Two numbers are added together.')
          break
        default:
          if (step.explanation.includes('Push data')) {
            sentences.push('Some data is made available for processing.')
          }
      }
    })
    
    return {
      english: sentences.join(' '),
      technical: explanation.summary,
      operations: explanation.operations
    }
  } catch (error) {
    return { error: error.message }
  }
}

/**
 * Batch Testing Utilities
 */

function batchTestScripts(scripts, options = {}) {
  const results = []
  
  scripts.forEach((script, index) => {
    try {
      const validation = validateScript(script)
      const metrics = scriptMetrics(script)
      const complexity = analyzeComplexity(script)
      
      results.push({
        index: index,
        script: typeof script === 'string' ? script : scriptToASM(script),
        valid: validation.valid,
        size: validation.size,
        operations: validation.operations,
        complexity: complexity.complexity,
        estimatedCost: metrics.estimatedCost,
        recommendations: complexity.recommendations
      })
    } catch (error) {
      results.push({
        index: index,
        script: typeof script === 'string' ? script : 'Invalid script',
        valid: false,
        error: error.message
      })
    }
  })
  
  const summary = {
    total: scripts.length,
    valid: results.filter(r => r.valid).length,
    invalid: results.filter(r => !r.valid).length,
    averageSize: results.filter(r => r.size).reduce((sum, r) => sum + r.size, 0) / results.filter(r => r.size).length || 0,
    complexityDistribution: {
      low: results.filter(r => r.complexity === 'low').length,
      medium: results.filter(r => r.complexity === 'medium').length,
      high: results.filter(r => r.complexity === 'high').length
    }
  }
  
  return {
    results: results,
    summary: summary
  }
}

/**
 * Export all utilities
 */
module.exports = {
  // Format conversions
  scriptToASM,
  asmToScript,
  asmToHex,
  hexToASM,
  scriptToHex,
  
  // Validation
  validateASM,
  validateScript,
  validateSyntax,
  
  // Analysis
  estimateScriptSize,
  scriptMetrics,
  analyzeComplexity,
  
  // Optimization
  optimizeScript,
  findOptimizations,
  
  // Comparison
  compareScripts,
  
  // Explanation
  explainScript,
  covenantToEnglish,
  
  // Batch testing
  batchTestScripts
}