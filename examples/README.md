# SmartLedger-BSV Examples

This directory contains comprehensive examples demonstrating all features of SmartLedger-BSV v3.1.1+.

## 📁 Directory Structure

### `/basic` - Basic BSV Operations
- **[transaction-creation.js](basic/transaction-creation.js)**: Ultra-low fee transactions and UTXO management
- **[transaction_signature_api_gap.js](basic/transaction_signature_api_gap.js)**: Manual signature creation examples

### `/covenants` - Advanced Covenant Framework
- **[advanced_covenant_demo.js](covenants/advanced_covenant_demo.js)**: Complete covenant showcase with BIP143 + PUSHTX
- **[covenant_manual_signature_resolved.js](covenants/covenant_manual_signature_resolved.js)**: Working covenant patterns
- **[covenant_signature_template.js](covenants/covenant_signature_template.js)**: Copy-paste covenant templates
- **[covenant_interface_demo.js](covenants/covenant_interface_demo.js)**: Dual-level API demonstration

### `/scripts` - Custom Script Development
- **[custom_script_helper_example.js](scripts/custom_script_helper_example.js)**: CustomScriptHelper API examples
- **[custom_script_signature_test.js](scripts/custom_script_signature_test.js)**: Complete test suite for all script types

### `/preimage` - BIP-143 Preimage Tools
- **[extract_preimage_bidirectional.js](preimage/extract_preimage_bidirectional.js)**: Advanced bidirectional preimage field extractor with CompactSize varint support
- **[generate_sample_preimage.js](preimage/generate_sample_preimage.js)**: Multi-type preimage generator with varint testing
- **[generate_sighash_examples.js](preimage/generate_sighash_examples.js)**: SIGHASH flag examples showing "zero hash" behavior  
- **[test_varint_extraction.js](preimage/test_varint_extraction.js)**: CompactSize varint test suite

## 🚀 Running Examples

### Prerequisites
```bash
npm install @smartledger/bsv
```

### Basic Examples
```bash
# Transaction creation with ultra-low fees
node examples/basic/transaction-creation.js

# Manual signature API examples
node examples/basic/transaction_signature_api_gap.js
```

### Covenant Examples
```bash
# Complete covenant framework demonstration
node examples/covenants/advanced_covenant_demo.js

# Working covenant patterns with manual signatures
node examples/covenants/covenant_manual_signature_resolved.js

# Dual-level API demonstration
node examples/covenants/covenant_interface_demo.js
```

### Custom Script Examples
```bash
# CustomScriptHelper API usage
node examples/scripts/custom_script_helper_example.js

# Complete test suite for all script types
node examples/scripts/custom_script_signature_test.js
```

### Preimage Tools
```bash
# Extract any BIP-143 preimage field with CompactSize varint support
node examples/preimage/extract_preimage_bidirectional.js <preimage_hex> <field_name>

# Generate test preimages with different varint sizes
node examples/preimage/generate_sample_preimage.js [standard|multisig|large|huge]

# Demonstrate SIGHASH flag "zero hash" behavior
node examples/preimage/generate_sighash_examples.js [ALL_FORKID|NONE_FORKID|ALL_ANYONECANPAY_FORKID]

# Test CompactSize varint extraction
node examples/preimage/test_varint_extraction.js

# Examples
node examples/preimage/extract_preimage_bidirectional.js 01000000ab... scriptLen  # Show varint
node examples/preimage/extract_preimage_bidirectional.js 01000000ab... hashPrevouts  # Detect zeros
```

## 📖 Learning Path

### 1. Start with Basic Examples
Begin with transaction creation and UTXO management to understand the foundation:
- Learn ultra-low fee configuration (0.01 sats/byte)
- Understand UTXO state management and change outputs
- Master manual signature creation for custom scripts

### 2. Explore Custom Scripts
Move to custom script development for advanced Bitcoin patterns:
- Multi-signature scripts (m-of-n schemes)
- Timelock contracts (block height and timestamp constraints)  
- Conditional scripts with branching logic
- Template system for rapid development

### 3. Understand BIP-143 Preimage Structure
Learn the foundation of covenant development with preimage tools:
- Extract and analyze transaction preimage fields
- Understand bidirectional parsing strategies (left vs right extraction)
- Generate optimal Bitcoin Script ASM for field extraction
- Master dynamic scriptCode handling with variable lengths

### 4. Master Covenant Framework
Dive into the advanced covenant framework for enterprise applications:
- BIP143 preimage parsing with field-by-field access
- nChain PUSHTX techniques for in-script signature generation
- Perpetually Enforcing Locking Scripts (PELS) for ongoing rule enforcement
- Transaction introspection and validation patterns

## 🔧 Example Categories

### Transaction Management
```javascript
// Ultra-low fee configuration
const tx = new bsv.Transaction()
  .from(utxo)
  .to(address, amount)
  .feePerKb(10); // 0.01 sats/byte (91% reduction)
```

### Custom Script Patterns
```javascript
// Multi-signature script
const helper = new CustomScriptHelper();
const multisig = helper.createMultisigScript([pk1, pk2, pk3], 2);

// Timelock script
const timelock = helper.createTimelockScript(publicKey, 750000, 'block');
```

### Advanced Covenants
```javascript
// PUSHTX covenant with nChain techniques
const covenant = new CovenantInterface();
const pushtx = covenant.createAdvancedCovenant('pushtx', {
  publicKey: publicKey,
  enforceOutputs: true
});

// Perpetual covenant (PELS)
const pels = covenant.createAdvancedCovenant('perpetual', {
  publicKeyHash: pubkeyHash,
  feeDeduction: 512,
  enforceScript: true
});
```

## 🔍 Key Features Demonstrated

### Core Library Features
- ✅ Complete BSV API compatibility
- ✅ Ultra-low fee system (0.01 sats/byte)
- ✅ Advanced UTXO management
- ✅ CDN bundle usage
- ✅ Enhanced error handling

### Covenant Framework Features
- 🔒 BIP143 preimage parsing with field accessors
- 🔒 nChain PUSHTX in-script signature generation
- 🔒 Perpetually Enforcing Locking Scripts (PELS)
- 🔒 Transaction introspection capabilities
- 🔒 Dual-level API (abstractions + granular control)

### Custom Script Features
- 🛠️ Multi-signature scripts (m-of-n)
- 🛠️ Timelock contracts (height/timestamp)
- 🛠️ Conditional branching logic
- 🛠️ Template system for common patterns
- 🛠️ Simplified developer API

## 📚 Related Documentation

- **[Advanced Covenant Development Guide](../docs/ADVANCED_COVENANT_DEVELOPMENT.md)**: Complete BIP143 + PUSHTX techniques
- **[Custom Script Development Guide](../docs/CUSTOM_SCRIPT_DEVELOPMENT.md)**: Script creation patterns  
- **[Covenant Development Resolved](../docs/COVENANT_DEVELOPMENT_RESOLVED.md)**: Problem solutions
- **[Main README](../README.md)**: Project overview and quick start

## 🤝 Contributing Examples

To contribute new examples:

1. Follow the directory structure (`basic/`, `covenants/`, `scripts/`)
2. Include comprehensive comments explaining each step
3. Provide both working examples and error handling
4. Add corresponding documentation links
5. Test examples with multiple scenarios

## 🔐 Security Notes

All examples follow security best practices:
- Parameter validation and error handling
- Canonical signature enforcement
- Proper preimage structure validation
- Production-ready patterns with security analysis

---

*These examples demonstrate SmartLedger-BSV v3.1.1+ capabilities for enterprise Bitcoin SV development.*