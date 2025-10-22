# SmartContract Module Documentation

## Overview

The SmartContract module provides enterprise-grade covenant functionality for Bitcoin SV, integrating enhanced BIP-143 preimage parsing, SIGHASH flag detection, and production-ready covenant workflows.

## Installation & Usage

```javascript
const bsv = require('smartledger-bsv')

// Access SmartContract module
const SmartContract = bsv.SmartContract

// Quick covenant creation
const privateKey = bsv.PrivateKey.fromRandom()
const covenant = SmartContract.createCovenant(privateKey)
```

## Core Classes

### 1. SmartContract.Covenant

Production-ready covenant management with complete P2PKH → Covenant → Spending workflow.

**Features:**
- Local UTXO storage and portfolio management
- WhatsOnChain API integration ready
- BIP-143 preimage validation
- Script.Interpreter compliance

**Basic Usage:**
```javascript
const covenant = new SmartContract.Covenant(privateKey, {
  storageDir: './my-covenants'
})

// Create covenant from P2PKH UTXO
const result = covenant.createFromP2PKH({
  txid: 'abc123...',
  vout: 0,
  satoshis: 100000,
  script: 'p2pkh_script_hex'
})

// Save covenant UTXO
covenant.save(result.covenantUtxo)

// Create spending transaction
const spendingTx = covenant.createSpendingTx(result.covenantUtxo)

// Validate spending
const validation = covenant.validate(spendingTx, result.covenantUtxo)
console.log('Valid:', validation.valid)
```

**Complete Workflow:**
```javascript
// One-shot covenant flow
const flow = covenant.completeFlow(p2pkhUtxo, function(tx, phase) {
  console.log(`${phase} transaction:`, tx.toString())
  // Optional: broadcast transaction
})

console.log('Flow success:', flow.success)
```

### 2. SmartContract.Preimage

Enhanced BIP-143 preimage utilities with CompactSize varint support and bidirectional extraction.

**Features:**
- Complete CompactSize varint support (1-3 bytes)
- SIGHASH flag detection and zero hash warnings
- Bidirectional field extraction (LEFT/RIGHT/DYNAMIC)
- Multi-input transaction handling

**Basic Usage:**
```javascript
const preimage = new SmartContract.Preimage(preimageHex, {
  strategy: 'DYNAMIC' // AUTO-DETECT best extraction method
})

const fields = preimage.extract()
console.log('Script code:', fields.scriptCode.toString('hex'))
console.log('Amount:', fields.amount.toString('hex'))

// Get SIGHASH analysis
const sighashInfo = preimage.getSighashInfo()
if (sighashInfo.hasZeroHashes) {
  console.log('Zero hash warnings:', sighashInfo.warnings)
}
```

**The "Zero Hash Mystery" Explained:**
```javascript
// Why do I see zero hashes in my preimage?
const explanation = SmartContract.explainZeroHashes()
console.log(explanation.title)
console.log('Reality:', explanation.reality)
```

**CompactSize Varint Decoding:**
```javascript
// Decode script length varint (handles 1-3 bytes)
const result = SmartContract.Preimage.decodeCompactSize(buffer, offset)
console.log('Script length:', result.value)
console.log('Next offset:', result.nextOffset)
console.log('Varint bytes used:', result.bytes)
```

### 3. SmartContract.SIGHASH

SIGHASH flag utilities with comprehensive flag analysis and zero hash behavior explanation.

**Features:**
- Complete flag analysis and detection
- Zero hash behavior explanation
- Multi-input transaction examples
- BIP-143 compliance verification

**Basic Usage:**
```javascript
const sighash = new SmartContract.SIGHASH(0x41) // SIGHASH_ALL | FORKID
const analysis = sighash.analyze()
console.log('Flag name:', analysis.flagName)
console.log('Has ANYONECANPAY:', analysis.anyoneCanPay)

// Understand zero hash behavior
const behavior = sighash.getZeroHashBehavior()
console.log('Will hashPrevouts be zero?', behavior.hashPrevouts)
console.log('Explanation:', behavior.explanation)
```

**Generate Educational Examples:**
```javascript
// Create example demonstrating SIGHASH behavior
const example = sighash.generateExample()
console.log('Transaction:', example.transaction.toString())
console.log('Preimage fields:', example.fields)
console.log('Zero hash behavior:', example.zeroHashBehavior)
```

**All SIGHASH Types:**
```javascript
const allTypes = SmartContract.getAllSIGHASHTypes()
allTypes.forEach(type => {
  console.log(`${type.name}: 0x${type.value.toString(16)}`)
})

// Generate demonstrations for all types
const demonstrations = SmartContract.demonstrateAllSIGHASH()
demonstrations.forEach(demo => {
  console.log(`${demo.typeName}:`, demo.demonstration.observations)
})
```

### 4. SmartContract.Builder

Advanced covenant builder with multi-field validation and dynamic script construction.

**Features:**
- Multi-field preimage validation
- Dynamic script construction
- Template-based covenant creation
- Complex condition chaining

**Basic Usage:**
```javascript
const builder = new SmartContract.Builder(privateKey)

// Add field validation rules
builder
  .validateField('hashPrevouts', 'ORIGINAL_hashPrevouts', { 
    operator: 'EQUAL',
    description: 'Ensure same input set'
  })
  .validateField('amount', minimumAmount, {
    operator: 'NOT_EQUAL',
    description: 'Prevent amount reduction'
  })

// Create covenant
const result = builder.createCovenant(p2pkhUtxo)
console.log('Covenant created:', result.covenantUtxo.txid)
```

**Template-Based Creation:**
```javascript
// Hash-lock covenant
const hashLock = SmartContract.createHashLockCovenant(
  privateKey, 
  expectedPreimageHash
)

// Multi-field validation covenant
const multiField = SmartContract.createMultiFieldCovenant(privateKey, [
  { field: 'hashPrevouts', expectedValue: 'ORIGINAL_hashPrevouts' },
  { field: 'amount', expectedValue: minimumAmount, operator: 'NOT_EQUAL' }
])
```

## Convenience Methods

### Quick Access Functions

```javascript
// Create covenant instance
const covenant = SmartContract.createCovenant(privateKey, options)

// Extract preimage fields
const preimage = SmartContract.extractPreimage(preimageHex)

// Analyze SIGHASH flags
const analysis = SmartContract.analyzeSIGHASH(sighashType)

// Build advanced covenant
const builder = SmartContract.buildCovenant(privateKey, options)
```

### Educational Resources

```javascript
// Get all educational materials
const resources = SmartContract.getEducationalResources()
console.log('Zero hash mystery:', resources.zeroHashMystery)
console.log('All SIGHASH types:', resources.sighashTypes)
console.log('Example demonstrations:', resources.exampleDemonstrations)
```

## Production Integration

### Complete Covenant Workflow

```javascript
// Production-ready covenant flow with broadcasting
const result = SmartContract.completeCovenantFlow(
  privateKey,
  p2pkhUtxo,
  function(transaction, phase) {
    console.log(`Broadcasting ${phase} transaction...`)
    
    // Your broadcast logic here
    // return broadcastTransaction(transaction)
  }
)

if (result.success) {
  console.log('Covenant flow completed successfully')
  console.log('Creation TX:', result.creationTx.id)
  console.log('Spending TX:', result.spendingTx.id)
} else {
  console.log('Validation errors:', result.validation.errors)
}
```

### Portfolio Management

```javascript
const covenant = new SmartContract.Covenant(privateKey)

// Get portfolio overview
const portfolio = covenant.getPortfolio()
console.log('Total covenants:', portfolio.total)
console.log('Total value:', portfolio.totalValue, 'satoshis')
console.log('By status:', portfolio.byStatus)
console.log('Recent:', portfolio.recent)

// List all stored covenants
const allCovenants = covenant.list()
allCovenants.forEach(cov => {
  console.log(`${cov.txid}: ${cov.satoshis} sats (${cov.status})`)
})
```

## Error Handling & Validation

### Preimage Validation

```javascript
const preimage = new SmartContract.Preimage(preimageHex)
const validation = preimage.validate()

if (!validation.valid) {
  console.log('Preimage errors:', validation.errors)
}

if (validation.warnings.length > 0) {
  console.log('Preimage warnings:', validation.warnings)
}

console.log('SIGHASH info:', validation.sighashInfo)
```

### Covenant Validation

```javascript
const validation = covenant.validate(spendingTx, covenantUtxo)

if (!validation.valid) {
  console.log('Validation failed:', validation.error)
} else {
  console.log('Covenant spending is valid!')
}
```

### Builder Validation

```javascript
const builder = new SmartContract.Builder(privateKey)
// ... configure builder ...

const spendingValidation = builder.validateSpending(spendingTx, covenantUtxo)

console.log('Spending valid:', spendingValidation.valid)
console.log('Field validations:', spendingValidation.fieldValidations)
console.log('Errors:', spendingValidation.errors)
```

## Advanced Features

### Bidirectional Preimage Extraction

```javascript
// Try different extraction strategies
const preimage = new SmartContract.Preimage(preimageHex)

// LEFT-to-RIGHT (standard)
const leftFields = preimage.extract('LEFT')

// RIGHT-to-LEFT (fallback for malformed preimages)  
const rightFields = preimage.extract('RIGHT')

// DYNAMIC (auto-detect best strategy)
const dynamicFields = preimage.extract('DYNAMIC')
```

### Custom Validation Rules

```javascript
const builder = new SmartContract.Builder(privateKey)

// Add custom validation logic
builder.addCondition(function(spendingTx, covenantUtxo) {
  // Custom validation logic
  const outputSum = spendingTx.outputs.reduce((sum, out) => sum + out.satoshis, 0)
  return outputSum >= covenantUtxo.satoshis * 0.9 // Allow max 10% fee
}, {
  description: 'Ensure reasonable fee limits'
})
```

### SIGHASH Compliance Checking

```javascript
const sighash = new SmartContract.SIGHASH(sighashType)
const compliance = sighash.checkCompliance(preimage)

if (!compliance.compliant) {
  console.log('BIP-143 compliance issues:', compliance.issues)
}

if (compliance.unexpectedZeros.length > 0) {
  console.log('Unexpected zero hashes:', compliance.unexpectedZeros)
}
```

## Module Features

- **BIP-143 Preimage Parsing**: Complete support with CompactSize varint handling
- **SIGHASH Detection**: Automatic flag analysis and zero hash warnings
- **Bidirectional Extraction**: Multiple strategies for robust field parsing
- **Production Ready**: Enterprise-grade covenant infrastructure
- **Educational Tools**: Comprehensive explanations of Bitcoin protocol details
- **Zero Hash Warnings**: Explains the "extra zero mystery" that confuses developers
- **Multi-Field Validation**: Advanced covenant condition checking

## Compatibility

- **Node.js**: Full functionality including file system storage
- **Browser**: Core functionality (storage features require adaptation)
- **Bitcoin SV**: Full BIP-143 compliance with FORKID support
- **Network Ready**: WhatsOnChain API integration prepared

## Version Information

```javascript
console.log('SmartContract version:', SmartContract.version)
console.log('Description:', SmartContract.description)
console.log('Features:', SmartContract.features)
```

## Support

The SmartContract module is based on extensive research and production testing in the SmartLedger-BSV ecosystem. It addresses real-world Bitcoin protocol edge cases and provides enterprise-grade tooling for advanced Bitcoin SV applications.