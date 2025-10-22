# JavaScript-to-Bitcoin Script Quick Start Guide

**SmartLedger-BSV v3.2.0** - Revolutionary covenant development framework

## Overview

The JavaScript-to-Bitcoin Script framework allows you to write complex covenant logic in familiar JavaScript syntax and automatically generates optimized Bitcoin Script ASM and hex output.

## 🚀 30-Second Quick Start

```javascript
const SmartContract = require('smartledger-bsv').SmartContract

// Write covenant logic in JavaScript
const builder = SmartContract.createCovenantBuilder()
const covenant = builder
  .extractField('value')           // Get transaction value
  .push('1000000')                // 1M satoshis minimum
  .greaterThanOrEqual()           // Ensure value >= minimum
  .verify()                       // Assert condition
  .build()

// Get Bitcoin Script output
console.log('ASM:', covenant.cleanedASM)
console.log('Hex:', covenant.hex)
console.log('Operations:', covenant.operations.length)

// Test execution
const simulation = SmartContract.simulateScript(covenant.operations)
console.log('Script valid:', simulation.success)
```

---

## Core Concepts

### 1. CovenantBuilder Fluent API

The CovenantBuilder provides a fluent interface with 61 methods for building Bitcoin Script:

```javascript
const builder = SmartContract.createCovenantBuilder()

// Chain operations fluently
const script = builder
  .comment('This is a comment for documentation')
  .push('deadbeef')               // Push data onto stack
  .sha256()                       // Hash the data
  .push('expected_hash')          // Push expected result
  .equal()                        // Compare hashes
  .verify()                       // Assert equality
  .build()                        // Generate final script
```

### 2. Preimage Field Extraction

Access BIP-143 preimage fields directly in your covenant logic:

```javascript
const covenant = builder
  .extractField('value')          // Extract transaction value
  .extractField('hashPrevouts')   // Extract input hash
  .extractField('nLockTime')      // Extract lock time
  .extractField('scriptCode')     // Extract script code
  .build()
```

### 3. Real-Time Simulation

Test your scripts immediately without blockchain interaction:

```javascript
const simulation = SmartContract.simulateScript(['OP_1', 'OP_2', 'OP_ADD'])

console.log('Final stack:', simulation.finalStack)     // ['03']
console.log('Steps executed:', simulation.history.length)
console.log('Success:', simulation.success)            // true
```

---

## Common Patterns

### Pattern 1: Value Lock Covenant

Ensure transactions maintain minimum value:

```javascript
const valueLock = SmartContract.createCovenantBuilder()
  .comment('Require minimum transaction value')
  .extractField('value')
  .push('1000000')                // 1M satoshis
  .greaterThanOrEqual()
  .verify()
  .build()

// Or use the template:
const template = SmartContract.createValueLockCovenant('1000000')
```

### Pattern 2: Hash Lock Covenant

Require knowledge of a secret preimage:

```javascript
const hashLock = SmartContract.createCovenantBuilder()
  .comment('Require secret preimage')
  .push('secret_preimage')        // Secret data
  .sha256()                       // Hash it
  .push('expected_hash')          // Expected result
  .equalVerify()                  // Must match
  .build()

// Or use the template:
const template = SmartContract.createHashLockCovenant('expected_hash')
```

### Pattern 3: Time Lock Covenant

Enforce time-based spending conditions:

```javascript
const timeLock = SmartContract.createCovenantBuilder()
  .comment('Require time lock expiry')
  .extractField('nLockTime')
  .push('1640995200')             // Jan 1, 2022 timestamp
  .greaterThan()
  .verify()
  .build()
```

### Pattern 4: Multi-Condition Covenant

Combine multiple validation rules:

```javascript
const multiCondition = SmartContract.createCovenantBuilder()
  .comment('Multi-condition validation')
  
  // Condition 1: Minimum value
  .extractField('value')
  .push('1000000')
  .greaterThanOrEqual()
  .verify()
  
  // Condition 2: Hash validation
  .push('secret')
  .sha256()
  .push('expected_hash')
  .equalVerify()
  
  // Condition 3: Time lock
  .extractField('nLockTime')
  .push('1640995200')
  .greaterThan()
  .verify()
  
  .build()
```

---

## Available Operations

### Stack Operations
```javascript
builder
  .push('data')           // Push data
  .dup()                  // Duplicate top
  .drop()                 // Remove top
  .swap()                 // Swap top two
  .over()                 // Copy second to top
  .rot()                  // Rotate top three
```

### Arithmetic Operations
```javascript
builder
  .add()                  // Add two numbers
  .sub()                  // Subtract
  .mul()                  // Multiply
  .div()                  // Divide
  .mod()                  // Modulo
  .min()                  // Minimum
  .max()                  // Maximum
```

### Comparison Operations
```javascript
builder
  .equal()                // Test equality
  .equalVerify()          // Test and verify
  .lessThan()             // Less than
  .greaterThan()          // Greater than
  .lessThanOrEqual()      // Less than or equal
  .greaterThanOrEqual()   // Greater than or equal
```

### Cryptographic Operations
```javascript
builder
  .sha256()               // SHA256 hash
  .hash160()              // RIPEMD160(SHA256(x))
  .hash256()              // Double SHA256
  .ripemd160()            // RIPEMD160 hash
```

### Data Manipulation
```javascript
builder
  .size()                 // Get data size
  .split()                // Split at position
  .cat()                  // Concatenate
  .left(n)                // Take left n bytes
  .right(n)               // Take right n bytes
  .substr(start, len)     // Extract substring
```

### Control Flow
```javascript
builder
  .if()                   // Conditional execution
  .else()                 // Else branch
  .endif()                // End conditional
  .verify()               // Assert true
  .return()               // Return from script
```

---

## Advanced Examples

### Example 1: Recursive Covenant

Create a covenant that enforces its own continuation:

```javascript
const recursive = SmartContract.createCovenantBuilder()
  .comment('Recursive covenant - enforces continuation')
  
  // Extract current script hash
  .extractField('scriptCode')
  .hash160()
  
  // Extract output script hash
  .extractField('hashOutputs')
  .push(32)                       // Skip to script hash position
  .split()
  .drop()
  .push(20)                       // Take 20 bytes (script hash)
  .split()
  .swap()
  .drop()
  
  // Ensure script hash matches (recursive)
  .equalVerify()
  
  .build()
```

### Example 2: Oracle-Based Covenant

Covenant that validates against signed oracle data:

```javascript
const oracle = SmartContract.createCovenantBuilder()
  .comment('Oracle-validated covenant')
  
  // Verify oracle signature
  .push('oracle_message')
  .push('oracle_signature')
  .push('oracle_pubkey')
  // ... signature verification logic ...
  
  // Extract price from oracle message
  .push('oracle_message')
  .push(8)                        // Price is at position 8
  .split()
  .drop()
  .push(8)                        // Price is 8 bytes
  .split()
  .swap()
  .drop()
  
  // Ensure transaction value matches oracle price
  .extractField('value')
  .greaterThanOrEqual()
  .verify()
  
  .build()
```

### Example 3: Multi-Path Spending

Create a covenant with multiple valid spending paths:

```javascript
const multiPath = SmartContract.createCovenantBuilder()
  .comment('Multi-path spending covenant')
  
  // Path 1: Owner can spend immediately
  .push('owner_signature')
  .push('owner_pubkey')
  // ... signature check ...
  
  // OR Path 2: Anyone can spend after time delay
  .if()
    .push(1)                      // Valid signature path
  .else()
    .extractField('nLockTime')
    .push('1640995200')           // Delay timestamp
    .greaterThan()
  .endif()
  
  .verify()
  .build()
```

---

## Testing and Debugging

### 1. Script Simulation

Test your covenant logic before deployment:

```javascript
const simulation = SmartContract.simulateScript(covenant.operations)

if (simulation.success) {
  console.log('✅ Script executed successfully')
  console.log('Final stack:', simulation.finalStack)
} else {
  console.log('❌ Script failed:', simulation.error)
  console.log('Failed at step:', simulation.failedStep)
}
```

### 2. Step-by-Step Debugging

Debug script execution with detailed traces:

```javascript
const debug = SmartContract.debugScript({
  script: covenant.operations,
  enableTrace: true,
  breakpoints: [5, 10]           // Stop at operations 5 and 10
})

debug.history.forEach((step, index) => {
  console.log(`Step ${index}: ${step.operation}`)
  console.log(`Stack: [${step.stack.join(', ')}]`)
})
```

### 3. Covenant Testing

Test complete covenant validation:

```javascript
const testResult = SmartContract.testCovenant(preimageHex, {
  value: { min: 1000000 },
  hashPrevouts: { notZero: true }
})

console.log('Covenant valid:', testResult.success)
console.log('Validation details:', testResult.validations)
```

---

## Templates and Utilities

### Pre-Built Templates

Use common covenant patterns:

```javascript
// Value lock template
const valueLock = SmartContract.createValueLockCovenant('1000000')

// Hash lock template  
const hashLock = SmartContract.createHashLockCovenant('expected_hash')

// Complex validation template
const complex = SmartContract.createComplexValidationCovenant({
  fields: {
    value: { equals: '1000000' },
    nLockTime: { greaterThan: '1640995200' }
  }
})
```

### Opcode Reference

Access the complete opcode mapping:

```javascript
const opcodes = SmartContract.getOpcodeMap()

// Get specific opcode details
console.log('OP_ADD:', opcodes.OP_ADD)
// { code: 0x93, action: function, description: 'Add two numbers' }

// List all arithmetic opcodes
Object.keys(opcodes)
  .filter(op => opcodes[op].category === 'arithmetic')
  .forEach(op => console.log(op))
```

---

## Integration Examples

### With BSV Library

```javascript
const bsv = require('smartledger-bsv')
const SmartContract = bsv.SmartContract

// Create covenant from private key
const privateKey = bsv.PrivateKey.fromRandom()
const covenant = SmartContract.createCovenant(privateKey)

// Build custom script
const builder = SmartContract.createCovenantBuilder()
const script = builder
  .extractField('value')
  .push('1000000')
  .greaterThanOrEqual()
  .verify()
  .build()

// Use in transaction
const tx = new bsv.Transaction()
tx.addOutput(new bsv.Transaction.Output({
  script: bsv.Script.fromASM(script.cleanedASM),
  satoshis: 100000
}))
```

### Production Workflow

```javascript
// Complete covenant workflow
const result = SmartContract.completeCovenantFlow(
  privateKey,
  p2pkhUtxo,
  (transaction, phase) => {
    console.log(`Broadcasting ${phase} transaction...`)
    // Your broadcast logic here
    return broadcastTransaction(transaction)
  }
)

if (result.success) {
  console.log('✅ Covenant deployed successfully')
  console.log('Creation TX:', result.creationTx.id)
  console.log('Test spending TX:', result.spendingTx.id)
} else {
  console.log('❌ Deployment failed:', result.errors)
}
```

---

## Best Practices

### 1. Always Add Comments

```javascript
const covenant = builder
  .comment('=== Value Validation Section ===')
  .extractField('value')
  .comment('Minimum required: 1M satoshis')
  .push('1000000')
  .greaterThanOrEqual()
  .comment('Assert minimum value requirement')
  .verify()
  .build()
```

### 2. Test Before Deployment

```javascript
// Always simulate before deploying
const simulation = SmartContract.simulateScript(covenant.operations)
if (!simulation.success) {
  throw new Error(`Script validation failed: ${simulation.error}`)
}

// Test with real preimage data
const testResult = SmartContract.testCovenant(preimageHex, constraints)
if (!testResult.success) {
  throw new Error(`Covenant validation failed`)
}
```

### 3. Use Template Patterns

```javascript
// Prefer templates for common patterns
const valueLock = SmartContract.createValueLockCovenant('1000000')

// Rather than building from scratch every time
const manual = SmartContract.createCovenantBuilder()
  .extractField('value')
  .push('1000000')
  .greaterThanOrEqual()
  .verify()
  .build()
```

### 4. Handle Errors Gracefully

```javascript
try {
  const covenant = builder.build()
  const simulation = SmartContract.simulateScript(covenant.operations)
  
  if (!simulation.success) {
    console.log('Simulation failed:', simulation.error)
    console.log('Stack at failure:', simulation.stackAtFailure)
  }
  
} catch (error) {
  console.log('Build error:', error.message)
  // Handle specific error types
}
```

---

## Next Steps

1. **Explore the Full API**: See [API_REFERENCE.md](./API_REFERENCE.md) for complete function documentation
2. **Study Real Examples**: Check `/examples` directory for production covenant patterns  
3. **Join the Community**: Connect with other BSV covenant developers
4. **Build Advanced Covenants**: Experiment with complex multi-condition logic

The JavaScript-to-Bitcoin Script framework makes covenant development accessible while maintaining the full power of Bitcoin Script. Start building your first covenant today!

---

**Need Help?**
- API Reference: [API_REFERENCE.md](./API_REFERENCE.md)
- Opcode Documentation: [opcodes.md](./opcodes.md)
- Example Code: `/examples` directory
- Community: BSV Developer Resources