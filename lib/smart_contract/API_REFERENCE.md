# SmartContract API Reference

**SmartLedger-BSV v3.2.0** - Complete JavaScript-to-Bitcoin Script Framework

## Table of Contents

1. [Quick Start](#quick-start)
2. [Core Classes](#core-classes)
3. [Interface Functions (52 Total)](#interface-functions)
4. [JavaScript-to-Script Framework](#javascript-to-script-framework)
5. [CovenantBuilder API (61 Methods)](#covenantbuilder-api)
6. [Opcode Mapping System](#opcode-mapping-system)
7. [Debug and Analysis Tools](#debug-and-analysis-tools)
8. [Real-World Examples](#real-world-examples)
9. [Error Handling](#error-handling)

---

## Quick Start

```javascript
const SmartContract = require('bsv-elliptic-fix').SmartContract

// 🚀 Write covenant logic in JavaScript
const builder = SmartContract.createCovenantBuilder()
const covenant = builder
  .extractField('value')           // Extract value from preimage
  .push('50c3000000000000')       // Expected minimum value
  .greaterThanOrEqual()           // Ensure value >= minimum
  .verify()                       // Assert condition
  .build()

console.log('Generated ASM:', covenant.cleanedASM)
console.log('Generated Hex:', covenant.hex)

// 🧪 Simulate script execution
const result = SmartContract.simulateScript(['OP_1', 'OP_2', 'OP_ADD'])
console.log('Final stack:', result.finalStack) // ['03']
```

---

## Core Classes

### SmartContract.Covenant
**Production-ready covenant creation and management**

```javascript
const privateKey = bsv.PrivateKey.fromRandom()
const covenant = SmartContract.createCovenant(privateKey, {
  storageDir: './covenants'
})

// Create covenant from P2PKH UTXO
const result = covenant.createFromP2PKH({
  txid: 'abc123...',
  vout: 0,
  satoshis: 100000,
  script: 'p2pkh_script_hex'
})

// Complete workflow
const flow = covenant.completeFlow(p2pkhUtxo, (tx, phase) => {
  console.log(`${phase} transaction:`, tx.id)
})
```

### SmartContract.Preimage
**BIP-143 preimage parsing with enhanced CompactSize varint support**

```javascript
const preimage = SmartContract.extractPreimage(preimageHex, {
  strategy: 'DYNAMIC' // AUTO-DETECT best extraction method
})

const fields = preimage.extract()
console.log('Script code:', fields.scriptCode.toString('hex'))
console.log('Amount:', fields.amount.toString('hex'))

// Handle the "zero hash mystery"
const sighashInfo = preimage.getSighashInfo()
if (sighashInfo.hasZeroHashes) {
  console.log('Zero hash explanation:', SmartContract.explainZeroHashes())
}
```

### SmartContract.SIGHASH
**SIGHASH flag analysis and zero hash behavior explanation**

```javascript
const sighash = SmartContract.analyzeSIGHASH(0x41) // SIGHASH_ALL | FORKID
const analysis = sighash.analyze()

console.log('Flag name:', analysis.flagName)
console.log('Has ANYONECANPAY:', analysis.anyoneCanPay)
console.log('Zero hash behavior:', sighash.getZeroHashBehavior())

// Educational demonstrations
const allTypes = SmartContract.getAllSIGHASHTypes()
const demos = SmartContract.demonstrateAllSIGHASH()
```

### SmartContract.CovenantBuilder
**High-level JavaScript-to-Bitcoin Script API**

```javascript
const builder = SmartContract.createCovenantBuilder()

// Fluent API with 61 methods
const covenant = builder
  .comment('Check minimum value requirement')
  .extractField('value')
  .push('1000000')  // 1M satoshis
  .greaterThanOrEqual()
  .verify()
  .build()
```

---

## Interface Functions

### Core Operations (5 functions)

#### `createCovenant(privateKey, options)`
Creates a new Covenant instance for covenant management.

```javascript
const covenant = SmartContract.createCovenant(privateKey, {
  storageDir: './my-covenants',
  network: 'mainnet'
})
```

#### `extractPreimage(preimageHex, options)`
Parses BIP-143 preimage with advanced field extraction.

```javascript
const preimage = SmartContract.extractPreimage(preimageHex, {
  strategy: 'DYNAMIC',        // LEFT, RIGHT, or DYNAMIC
  validateFields: true,       // Validate extracted fields
  detectSIGHASH: true        // Analyze SIGHASH flags
})

const fields = preimage.extract()
console.log('Extracted fields:', Object.keys(fields))
```

#### `analyzeSIGHASH(sighashType)`
Analyzes SIGHASH flags and explains zero hash behavior.

```javascript
const analysis = SmartContract.analyzeSIGHASH(0x41)
console.log('Flag details:', analysis.analyze())
console.log('Zero behavior:', analysis.getZeroHashBehavior())
```

#### `buildCovenant(privateKey, options)`
Creates advanced covenant builder with multi-field validation.

```javascript
const builder = SmartContract.buildCovenant(privateKey, {
  validateFields: ['hashPrevouts', 'amount'],
  customRules: [/* custom validation functions */]
})
```

#### `completeCovenantFlow(privateKey, p2pkhUtxo, broadcastCallback)`
Executes complete covenant workflow from creation to spending.

```javascript
const result = SmartContract.completeCovenantFlow(
  privateKey, 
  p2pkhUtxo,
  (transaction, phase) => {
    console.log(`Broadcasting ${phase} transaction...`)
    // Your broadcast logic here
  }
)
```

### JavaScript-to-Script Framework (7 functions)

#### `createCovenantBuilder()`
Creates a new CovenantBuilder instance for fluent script construction.

```javascript
const builder = SmartContract.createCovenantBuilder()

// Chain operations fluently
const script = builder
  .push('deadbeef')
  .sha256()
  .push('expected_hash')
  .equal()
  .verify()
  .build()
```

#### `createValueLockCovenant(expectedValue)`
Creates a covenant that validates minimum value requirements.

```javascript
const valueLock = SmartContract.createValueLockCovenant('50c3000000000000')
const script = valueLock.build()

console.log('Value lock ASM:', script.cleanedASM)
// Output: OP_SIZE 22 OP_SUB OP_SPLIT OP_DROP OP_8 OP_SPLIT OP_DROP 50c3000000000000 OP_GREATERTHANOREQUAL OP_VERIFY
```

#### `createHashLockCovenant(expectedHash)`
Creates a covenant that validates hash preimage requirements.

```javascript
const hashLock = SmartContract.createHashLockCovenant('abcd1234')
const script = hashLock.build()

console.log('Hash lock operations:', script.operations.length)
```

#### `createComplexValidationCovenant(rules)`
Creates a covenant with multiple validation rules.

```javascript
const complex = SmartContract.createComplexValidationCovenant({
  fields: {
    value: { equals: '50c3000000000000' },
    hashPrevouts: { notEquals: '0000000000000000000000000000000000000000000000000000000000000000' }
  },
  customLogic: builder => builder.push('custom_data').verify()
})
```

#### `getOpcodeMap()`
Returns the complete mapping of 121 Bitcoin Script opcodes.

```javascript
const opcodes = SmartContract.getOpcodeMap()

console.log('Total opcodes:', Object.keys(opcodes).length) // 121
console.log('OP_ADD details:', opcodes.OP_ADD)
// { code: 0x93, action: function, description: 'Add two numbers', category: 'arithmetic' }
```

#### `simulateScript(operations, initialStack)`
Simulates Bitcoin Script execution with step-by-step debugging.

```javascript
const simulation = SmartContract.simulateScript(['OP_1', 'OP_2', 'OP_ADD'], [])

console.log('Final stack:', simulation.finalStack)     // ['03']
console.log('Execution steps:', simulation.history)    // Detailed step history
console.log('Success:', simulation.success)            // true
```

#### `createASMFromJS(operations)`
Converts JavaScript operation array to Bitcoin Script ASM.

```javascript
const asm = SmartContract.createASMFromJS(['OP_DUP', 'OP_HASH160', 'deadbeef', 'OP_EQUALVERIFY'])

console.log('Generated ASM:', asm)
// Output: "OP_DUP OP_HASH160 deadbeef OP_EQUALVERIFY"
```

### Testing & Debugging (5 functions)

#### `testScript(unlockingScript, lockingScript, options)`
Tests script execution with unlocking and locking scripts.

```javascript
const result = SmartContract.testScript('OP_1', 'OP_VERIFY', {
  enableDebug: true,
  strict: true
})

console.log('Script valid:', result.valid)
console.log('Execution trace:', result.trace)
```

#### `testCovenant(preimageHex, constraints, options)`
Tests covenant validation against preimage data.

```javascript
const result = SmartContract.testCovenant(preimageHex, {
  value: { min: 1000000 },
  hashPrevouts: { notZero: true }
}, { enableLogging: true })

console.log('Covenant valid:', result.success)
console.log('Validation details:', result.validations)
```

#### `testFieldExtraction(preimageHex, fieldName, options)`
Tests specific field extraction from preimage.

```javascript
const result = SmartContract.testFieldExtraction(preimageHex, 'value', {
  strategy: 'DYNAMIC',
  validateResult: true
})

console.log('Extracted value:', result.extracted)
console.log('Extraction strategy used:', result.strategyUsed)
```

#### `debugScript(config, options)`
Provides detailed script debugging and analysis.

```javascript
const debug = SmartContract.debugScript({
  script: ['OP_1', 'OP_2', 'OP_ADD'],
  breakpoints: [1, 2],
  watchStack: true
})

console.log('Debug info:', debug.analysis)
console.log('Stack snapshots:', debug.stackSnapshots)
```

#### `createTestEnvironment(options)`
Creates comprehensive testing environment with real UTXOs.

```javascript
const testEnv = SmartContract.createTestEnvironment({
  generateUTXO: true,
  createPreimage: true,
  network: 'testnet'
})

console.log('Test UTXO:', testEnv.utxo)
console.log('Test preimage:', testEnv.preimage)
```

### Educational Resources (4 functions)

#### `explainZeroHashes()`
Explains the "zero hash mystery" in Bitcoin preimages.

```javascript
const explanation = SmartContract.explainZeroHashes()

console.log('Title:', explanation.title)
console.log('Problem:', explanation.problem)
console.log('Reality:', explanation.reality)
console.log('Solution:', explanation.solution)
```

#### `getAllSIGHASHTypes()`
Returns all SIGHASH flag types with descriptions.

```javascript
const types = SmartContract.getAllSIGHASHTypes()

types.forEach(type => {
  console.log(`${type.name}: 0x${type.value.toString(16)} - ${type.description}`)
})
```

#### `demonstrateAllSIGHASH()`
Generates educational demonstrations for all SIGHASH types.

```javascript
const demos = SmartContract.demonstrateAllSIGHASH()

demos.forEach(demo => {
  console.log(`${demo.typeName}:`)
  console.log('  Behavior:', demo.demonstration.behavior)
  console.log('  Zero hashes:', demo.demonstration.zeroHashes)
})
```

#### `getEducationalResources()`
Returns comprehensive educational materials.

```javascript
const resources = SmartContract.getEducationalResources()

console.log('Zero hash mystery:', resources.zeroHashMystery)
console.log('SIGHASH types:', resources.sighashTypes.length)
console.log('Example demos:', resources.exampleDemonstrations.length)
```

### Utility Functions (8 functions)

#### Constructor Classes (4 functions)
- `Covenant` - Covenant management class
- `Preimage` - Preimage parsing class  
- `SIGHASH` - SIGHASH analysis class
- `Builder` - Advanced covenant builder class

#### Generators (4 functions)
- `UTXOGenerator` - Real UTXO generation class
- `ScriptTester` - Script testing utilities class
- `CovenantBuilder` - JavaScript-to-Script builder class
- `OpcodeMap` - Opcode mapping utilities class

---

## JavaScript-to-Script Framework

The revolutionary framework allows you to write covenant logic in JavaScript and automatically generate Bitcoin Script.

### Basic Workflow

```javascript
// 1. Create builder
const builder = SmartContract.createCovenantBuilder()

// 2. Write logic in JavaScript
const covenant = builder
  .comment('Validate transaction value')
  .extractField('value')           // Get value from preimage
  .push('1000000')                // 1M satoshis minimum
  .greaterThanOrEqual()           // value >= 1M
  .verify()                       // Assert condition
  .build()

// 3. Get Bitcoin Script output
console.log('ASM:', covenant.cleanedASM)
console.log('Hex:', covenant.hex)
console.log('Size:', covenant.operations.length, 'operations')
```

### Advanced Example: Multi-condition Covenant

```javascript
const builder = SmartContract.createCovenantBuilder()

const covenant = builder
  .comment('Multi-condition covenant validation')
  
  // Condition 1: Check minimum value
  .extractField('value')
  .push('1000000')
  .greaterThanOrEqual()
  .verify()
  
  // Condition 2: Verify hash preimage
  .push('deadbeef')
  .sha256()
  .push('expected_hash_of_deadbeef')
  .equalVerify()
  
  // Condition 3: Time lock validation
  .extractField('nLockTime')
  .push('1609459200')  // Jan 1, 2021
  .greaterThan()
  .verify()
  
  .build()

console.log('Complex covenant ASM:', covenant.cleanedASM)
```

---

## CovenantBuilder API

The CovenantBuilder provides 61 methods for fluent covenant construction:

### Stack Operations (12 methods)
```javascript
builder
  .push('data')           // Push data onto stack
  .dup()                  // Duplicate top item
  .drop()                 // Remove top item
  .swap()                 // Swap top two items
  .over()                 // Copy second item to top
  .rot()                  // Rotate top three items
  .pick(depth)            // Copy item at depth to top
  .roll(depth)            // Move item at depth to top
  .depth()                // Push stack depth
  .size()                 // Push size of top item
  .left(n)                // Take left n bytes
  .right(n)               // Take right n bytes
```

### Arithmetic Operations (10 methods)
```javascript
builder
  .add()                  // Add top two numbers
  .sub()                  // Subtract: second - first
  .mul()                  // Multiply top two numbers
  .div()                  // Divide: second / first
  .mod()                  // Modulo: second % first
  .abs()                  // Absolute value
  .negate()               // Negate number
  .min()                  // Minimum of two numbers
  .max()                  // Maximum of two numbers
  .within()               // Check if x is within min/max
```

### Comparison Operations (8 methods)
```javascript
builder
  .equal()                // Check equality
  .equalVerify()          // Check equality and verify
  .numEqual()             // Numeric equality
  .numNotEqual()          // Numeric inequality
  .lessThan()             // Less than comparison
  .lessThanOrEqual()      // Less than or equal
  .greaterThan()          // Greater than comparison
  .greaterThanOrEqual()   // Greater than or equal
```

### Logical Operations (6 methods)
```javascript
builder
  .and()                  // Bitwise AND
  .or()                   // Bitwise OR
  .xor()                  // Bitwise XOR
  .not()                  // Bitwise NOT
  .boolAnd()              // Boolean AND
  .boolOr()               // Boolean OR
```

### Cryptographic Operations (5 methods)
```javascript
builder
  .hash160()              // RIPEMD160(SHA256(x))
  .hash256()              // SHA256(SHA256(x))
  .sha256()               // SHA256(x)
  .ripemd160()            // RIPEMD160(x)
  .invert()               // Bitwise inversion
```

### Control Flow (4 methods)
```javascript
builder
  .if()                   // Conditional execution
  .else()                 // Else branch
  .endif()                // End conditional
  .verify()               // Assert top item is true
```

### Data Manipulation (8 methods)
```javascript
builder
  .split()                // Split data at position
  .cat()                  // Concatenate two items
  .substr(start, length)  // Extract substring
  .size()                 // Get size of data
  .left(n)                // Take left n bytes
  .right(n)               // Take right n bytes
  .extractField(name)     // Extract preimage field
  .validateField(name, expected) // Validate field value
```

### Utility Methods (8 methods)
```javascript
builder
  .comment(text)          // Add documentation comment
  .document(section)      // Add documentation section
  .simulate()             // Simulate script execution
  .build()                // Build final script
  .validateFields(fields) // Validate multiple fields
  .validateRange(min, max) // Validate numeric range
  .return()               // Return from script
  ._analyzeStructure()    // Internal: analyze script structure
```

---

## Opcode Mapping System

All 121 Bitcoin Script opcodes are mapped to JavaScript functions:

### Categories

1. **Constants (16 opcodes)**: `OP_FALSE`, `OP_TRUE`, `OP_1` through `OP_16`
2. **Push Data (4 opcodes)**: `OP_PUSHDATA1`, `OP_PUSHDATA2`, `OP_PUSHDATA4`
3. **Flow Control (6 opcodes)**: `OP_IF`, `OP_ELSE`, `OP_ENDIF`, `OP_VERIFY`, `OP_RETURN`
4. **Stack Operations (17 opcodes)**: `OP_DUP`, `OP_DROP`, `OP_SWAP`, etc.
5. **String Operations (8 opcodes)**: `OP_CAT`, `OP_SPLIT`, `OP_SIZE`, etc.
6. **Bitwise Logic (4 opcodes)**: `OP_AND`, `OP_OR`, `OP_XOR`, `OP_INVERT`
7. **Arithmetic (11 opcodes)**: `OP_ADD`, `OP_SUB`, `OP_MUL`, `OP_DIV`, etc.
8. **Comparison (8 opcodes)**: `OP_EQUAL`, `OP_LESSTHAN`, `OP_GREATERTHAN`, etc.
9. **Cryptographic (6 opcodes)**: `OP_SHA256`, `OP_HASH160`, `OP_CHECKSIG`, etc.
10. **Reserved (3 opcodes)**: `OP_RESERVED`, `OP_VER`, `OP_VERIF`
11. **Splice Operations (4 opcodes)**: `OP_LEFT`, `OP_RIGHT`, `OP_SUBSTR`
12. **Numeric (17 opcodes)**: `OP_1ADD`, `OP_1SUB`, `OP_NEGATE`, etc.
13. **Disabled (18 opcodes)**: Previously disabled opcodes now mapped

### Usage Example

```javascript
const opcodes = SmartContract.getOpcodeMap()

// Get specific opcode
console.log('OP_ADD:', opcodes.OP_ADD)
// { code: 0x93, action: function, description: 'Add two numbers', category: 'arithmetic' }

// Simulate specific opcode
const stack = ['02', '03']  // [2, 3]
const newStack = opcodes.OP_ADD.action(stack)
console.log('Result stack:', newStack)  // ['05'] (2 + 3 = 5)
```

---

## Debug and Analysis Tools

### Stack Examination

**Examine stack states during script execution**

```javascript
// Examine stack evolution step-by-step
const lockingScript = "76a914" + "89abcdef".repeat(5) + "88ac"  // P2PKH
const unlockingScript = "47" + "30440220".repeat(4) + "01"      // Signature

const success = SmartContract.examineStack(lockingScript, unlockingScript)
// Outputs:
// 🔍 STACK EXAMINATION TOOL
// 🧩 Step 1: PUSH (signature)
// Stack: ['30440220...']
// 🧩 Step 2: OP_DUP
// Stack: ['30440220...', '30440220...']
// ... continues through all opcodes
```

### Script Debugging

**Interactive script debugging with step-by-step execution**

```javascript
// Parse script from ASM or HEX
const unlocking = SmartContract.parseScript("OP_1 OP_2")
const locking = SmartContract.parseScript("OP_ADD OP_3 OP_EQUAL")

// Debug with full verification
SmartContract.debugScriptExecution(unlocking, locking, {
  stepMode: false  // Set to true for interactive step-by-step
})
// Outputs:
// 🔍 SCRIPT INTERPRETER DEBUGGER (FULL RUN)
// 🔐 Locking Script: OP_ADD OP_3 OP_EQUAL
// 🔓 Unlocking Script: OP_1 OP_2
// ✅ Result: TRUE (Success)
```

### Stack State Analysis

**Manual stack inspection and formatting**

```javascript
const stack = [Buffer.from('01', 'hex'), Buffer.from('02', 'hex')]
const altstack = [Buffer.from('ff', 'hex')]

SmartContract.printStack(stack, altstack)
// Output:
// Stack: ['01', '02']
// AltStack: ['ff']
```

### Advanced Script Analysis

**Comprehensive script analysis and optimization**

```javascript
// Analyze script complexity and find optimizations
const script = bsv.Script.fromASM("OP_DUP OP_DUP OP_DROP OP_HASH160")

const analysis = SmartContract.analyzeComplexity(script)
console.log('Complexity score:', analysis.score)
console.log('Optimization suggestions:', analysis.suggestions)

const optimized = SmartContract.optimizeScript(script)
console.log('Original ASM:', script.toASM())
console.log('Optimized ASM:', optimized.toASM())

// Explain script in human-readable format
const explanation = SmartContract.explainScript(script)
console.log('Script explanation:', explanation)
```

### Batch Testing

**Test multiple scripts efficiently**

```javascript
const scripts = [
  {
    name: 'P2PKH Test',
    unlocking: '47304402...',
    locking: '76a914...88ac',
    expectedResult: true
  },
  {
    name: 'Multi-sig Test',
    unlocking: '004730440...',
    locking: '52210...53ae',
    expectedResult: true
  }
]

const results = SmartContract.batchTestScripts(scripts, {
  verbose: true,
  stopOnFailure: false
})

console.log('Batch test results:', results)
// { passed: 2, failed: 0, results: [...] }
```

---

## Real-World Examples

### Example 1: Value-Preserving Covenant

```javascript
// Ensure transaction doesn't reduce value
const covenant = SmartContract.createCovenantBuilder()
  .comment('Value preservation covenant')
  .extractField('value')              // Get current transaction value
  .push('original_value_hex')         // Expected original value
  .greaterThanOrEqual()              // Ensure value >= original
  .verify()                          // Assert condition
  .build()

console.log('Generated script size:', covenant.operations.length)
console.log('ASM:', covenant.cleanedASM)
```

### Example 2: Hash Lock with Time Delay

```javascript
const covenant = SmartContract.createCovenantBuilder()
  .comment('Hash lock with time delay')
  
  // Check if correct preimage is provided
  .push('secret_data')
  .sha256()
  .push('expected_hash')
  .equal()
  
  // OR check if enough time has passed
  .if()
    .push(1)  // Valid preimage path
  .else()
    .extractField('nLockTime')
    .push('1640995200')  // Jan 1, 2022
    .greaterThan()
  .endif()
  
  .verify()
  .build()

// Test the covenant
const simulation = SmartContract.simulateScript(covenant.operations)
console.log('Simulation result:', simulation.success)
```

### Example 3: Multi-Signature with Spending Conditions

```javascript
const covenant = SmartContract.createCovenantBuilder()
  .comment('Multi-sig with spending conditions')
  
  // Require 2-of-3 signatures (simplified)
  .push('sig1')
  .push('sig2')
  .push('sig3')
  .push(2)                    // Require 2 signatures
  // ... multi-sig verification logic ...
  
  // AND require minimum output value
  .extractField('value')
  .push('100000')             // 100k satoshis minimum
  .greaterThanOrEqual()
  .verify()
  
  .build()

console.log('Multi-sig covenant ASM:', covenant.cleanedASM)
```

---

## Error Handling

### Script Validation

```javascript
try {
  const covenant = builder.build()
  
  // Validate generated script
  const validation = SmartContract.validateScript(covenant.operations)
  if (!validation.valid) {
    console.log('Script validation errors:', validation.errors)
  }
  
} catch (error) {
  console.log('Build error:', error.message)
}
```

### Simulation Error Handling

```javascript
const simulation = SmartContract.simulateScript(['OP_1', 'OP_VERIFY'])

if (!simulation.success) {
  console.log('Simulation failed:', simulation.error)
  console.log('Failed at step:', simulation.failedStep)
  console.log('Stack at failure:', simulation.stackAtFailure)
}
```

### Preimage Extraction Errors

```javascript
try {
  const preimage = SmartContract.extractPreimage(preimageHex)
  const fields = preimage.extract()
  
  // Check for warnings
  const validation = preimage.validate()
  if (validation.warnings.length > 0) {
    console.log('Extraction warnings:', validation.warnings)
  }
  
} catch (error) {
  console.log('Preimage extraction failed:', error.message)
}
```

---

## Performance Considerations

### Script Size Optimization

```javascript
// Use built-in optimization (if available)
const optimized = SmartContract.optimizeScript(covenant.operations)
console.log('Original size:', covenant.operations.length)
console.log('Optimized size:', optimized.length)

// Estimate script execution cost
const metrics = SmartContract.scriptMetrics(covenant.operations)
console.log('Estimated cost:', metrics.estimatedCost)
```

### Simulation Performance

```javascript
// For large scripts, use step limits
const simulation = SmartContract.simulateScript(operations, [], {
  maxSteps: 10000,
  enableLogging: false  // Disable for performance
})
```

---

This API reference provides comprehensive coverage of all SmartContract functionality. The JavaScript-to-Bitcoin Script framework enables developers to write complex covenant logic in familiar JavaScript syntax while automatically generating optimized Bitcoin Script output.

For additional examples and tutorials, see the `/docs` directory in the repository.