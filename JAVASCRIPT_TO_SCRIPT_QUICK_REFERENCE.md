# JavaScript-to-Bitcoin Script Quick Reference
## SmartLedger-BSV v3.2.0

---

## 🚀 Quick Start

```javascript
const SmartContract = require('@smartledger/bsv/lib/smart_contract');
```

## 📊 Covenant Builder API

### Basic Usage
```javascript
// Create a covenant builder
const builder = SmartContract.createCovenantBuilder();

// Chain operations
const covenant = builder
  .comment('Extract and validate value field')
  .extractField('value')
  .push('50c3000000000000')
  .equalVerify()
  .push(1)
  .build();

console.log(covenant.cleanedASM);
// Output: OP_SIZE 34 OP_SUB OP_SPLIT OP_DROP OP_8 OP_SPLIT OP_DROP 50c3000000000000 OP_EQUALVERIFY OP_1
```

### Template Patterns
```javascript
// Value lock covenant
const valueLock = SmartContract.createValueLockCovenant('50c3000000000000');

// Hash lock covenant  
const hashLock = SmartContract.createHashLockCovenant('expected_hash_here');

// Complex validation
const complex = SmartContract.createComplexValidationCovenant({
  fields: {
    value: { equals: '50c3000000000000' },
    nLocktime: { equals: '00000000' }
  },
  valueRange: { min: 1000, max: 100000000 }
});
```

## 🔧 Available Operations

### Stack Manipulation
```javascript
builder
  .dup()         // OP_DUP
  .drop()        // OP_DROP  
  .swap()        // OP_SWAP
  .over()        // OP_OVER
  .rot()         // OP_ROT
  .pick(n)       // n OP_PICK
  .roll(n)       // n OP_ROLL
  .depth()       // OP_DEPTH
```

### Arithmetic Operations
```javascript
builder
  .add()         // OP_ADD
  .sub()         // OP_SUB
  .mul()         // OP_MUL
  .div()         // OP_DIV
  .mod()         // OP_MOD
  .negate()      // OP_NEGATE
  .abs()         // OP_ABS
  .min()         // OP_MIN
  .max()         // OP_MAX
```

### Comparison Operations
```javascript
builder
  .equal()                // OP_EQUAL
  .equalVerify()          // OP_EQUALVERIFY
  .numEqual()             // OP_NUMEQUAL
  .numNotEqual()          // OP_NUMNOTEQUAL
  .lessThan()             // OP_LESSTHAN
  .greaterThan()          // OP_GREATERTHAN
  .lessThanOrEqual()      // OP_LESSTHANOREQUAL
  .greaterThanOrEqual()   // OP_GREATERTHANOREQUAL
  .within()               // OP_WITHIN
```

### Data Manipulation
```javascript
builder
  .cat()           // OP_CAT
  .split()         // OP_SPLIT
  .size()          // OP_SIZE
  .left(n)         // n OP_LEFT
  .right(n)        // n OP_RIGHT
  .substr(start, length)  // length start OP_SUBSTR
```

### Cryptographic Operations
```javascript
builder
  .sha256()        // OP_SHA256
  .hash256()       // OP_HASH256
  .hash160()       // OP_HASH160
  .ripemd160()     // OP_RIPEMD160
```

### Logical Operations
```javascript
builder
  .not()           // OP_NOT
  .boolAnd()       // OP_BOOLAND
  .boolOr()        // OP_BOOLOR
  .and()           // OP_AND (bitwise)
  .or()            // OP_OR (bitwise)
  .xor()           // OP_XOR (bitwise)
  .invert()        // OP_INVERT (bitwise)
```

### Control Flow
```javascript
builder
  .verify()        // OP_VERIFY
  .return()        // OP_RETURN
```

## 📦 Preimage Field Extraction

### Available Fields
```javascript
// LEFT extraction (from beginning)
.extractField('nVersion')      // 4 bytes - transaction version
.extractField('hashPrevouts')  // 32 bytes - hash of all inputs
.extractField('hashSequence')  // 32 bytes - hash of all sequences
.extractField('outpoint')      // 36 bytes - previous output reference

// DYNAMIC extraction (variable length)
.extractField('scriptLen')     // 1-5 bytes - script length varint
.extractField('scriptCode')    // Variable - the actual script

// RIGHT extraction (from end)
.extractField('value')         // 8 bytes - output value in satoshis
.extractField('nSequence')     // 4 bytes - input sequence number
.extractField('hashOutputs')   // 32 bytes - hash of all outputs
.extractField('nLocktime')     // 4 bytes - transaction locktime
.extractField('sighashType')   // 4 bytes - signature hash type
```

### Field Validation Patterns
```javascript
// Single field validation
builder.validateField('value', '50c3000000000000');

// Range validation
builder.validateRange('value', 1000, 100000000);

// Multi-field validation
builder.validateFields({
  value: { equals: '50c3000000000000' },
  nLocktime: { equals: '00000000' },
  nSequence: { min: 0, max: 0xfffffffe }
});
```

## 🧪 Script Simulation

### Basic Simulation
```javascript
const result = SmartContract.simulateScript(['OP_1', 'OP_2', 'OP_ADD', 'OP_3', 'OP_EQUAL']);

console.log('Final stack:', result.finalStack);    // ['01']
console.log('Execution steps:', result.history.length); // 5

// Step-by-step analysis
result.history.forEach((step, i) => {
  console.log(`${i+1}. ${step.opcode}: ${step.description}`);
  console.log(`   Stack: [${step.beforeStack.join(', ')}] → [${step.afterStack.join(', ')}]`);
});
```

### Builder Simulation
```javascript
const builder = SmartContract.createCovenantBuilder()
  .push(5)
  .push(3)
  .add();

const simulation = builder.simulate();
console.log('Final stack:', simulation.finalStack); // ['08']
```

## 📋 Complete Example

```javascript
const SmartContract = require('@smartledger/bsv/lib/smart_contract');

// Create test environment
const testEnv = SmartContract.createTestEnvironment();
const preimageHex = testEnv.getPreimage();

// Build custom covenant
const covenant = SmartContract.createCovenantBuilder()
  .comment('Validate preimage structure and value')
  
  // Check preimage size
  .size()
  .push(182)
  .numEqual()
  .verify()
  
  // Extract and validate value field
  .extractField('value')
  .push('50c3000000000000')
  .equalVerify()
  
  // Extract and validate locktime
  .extractField('nLocktime')
  .push('00000000')
  .equalVerify()
  
  // Success
  .push(1);

// Build the script
const script = covenant.build();
console.log('Generated ASM:', script.cleanedASM);
console.log('Script size:', script.size, 'operations');

// Test with real preimage
const fieldResult = SmartContract.testFieldExtraction(preimageHex, 'value');
console.log('Field extraction success:', fieldResult.success);
console.log('Extracted value:', fieldResult.fieldExtraction.value);
```

## 🎯 Output
```
Generated ASM: OP_SIZE b600 OP_NUMEQUAL OP_VERIFY OP_SIZE 22 OP_SUB OP_SPLIT OP_DROP OP_8 OP_SPLIT OP_DROP 50c3000000000000 OP_EQUALVERIFY OP_SIZE 08 OP_SUB OP_SPLIT OP_DROP OP_4 OP_SPLIT OP_DROP 00000000 OP_EQUALVERIFY OP_1
Script size: 27 operations
Field extraction success: true
Extracted value: 50c3000000000000
```

---

## 📚 Available Resources

- **[Complete Documentation](JAVASCRIPT_TO_BITCOIN_SCRIPT_FRAMEWORK.md)** - Full session summary
- **[Opcode Reference](lib/smart_contract/opcodes.md)** - All 121 Bitcoin Script opcodes
- **[Test Examples](lib/smart_contract/opcode_map.js)** - Run with `node lib/smart_contract/opcode_map.js`
- **[Builder Examples](lib/smart_contract/covenant_builder.js)** - Run with `node lib/smart_contract/covenant_builder.js`

## 🚀 NPM Scripts

```bash
npm run test:js2script    # Test JavaScript-to-Script functionality
npm run test:opcodes      # List all available opcodes
npm run test:covenants    # Test covenant framework
```

---

*SmartLedger-BSV v3.2.0 - JavaScript-to-Bitcoin Script Framework*