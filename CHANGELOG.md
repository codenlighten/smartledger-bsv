# Changelog

All notable changes to SmartLedger-BSV will be documented in this file.

The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.0.0/),
and this project adheres to [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

## [3.2.0] - 2025-10-19

### 🚀 MAJOR RELEASE: JavaScript-to-Bitcoin Script Framework

#### Revolutionary JavaScript-to-Script Translation System
- **Complete Opcode Mapping**: All 121 Bitcoin Script opcodes mapped to JavaScript functions
  - Categorized into 13 functional groups (constants, stack, arithmetic, crypto, data, etc.)
  - Proper Bitcoin Script number encoding/decoding with `scriptNum` utilities
  - Stack behavior simulation for testing and debugging
  - Real-time script execution traces with before/after stack states

#### High-Level Covenant Builder API
- **CovenantBuilder Class**: Fluent JavaScript interface for building complex covenant logic
  - Method chaining for intuitive covenant construction
  - Automatic ASM generation from JavaScript operations
  - Preimage field extraction utilities with LEFT/RIGHT/DYNAMIC strategies
  - Template-based patterns for common covenant types
- **CovenantTemplates Library**: Pre-built covenant patterns
  - Value Lock: Ensures output value matches expected amount
  - Hash Lock: Requires preimage that hashes to expected value
  - Multi-Signature with Validation: Combines signature requirements with field validation
  - Time Lock: Enforces locktime constraints
  - Complex Validation: Multi-field validation with range checks

#### Enhanced SmartContract Module Integration
- **New JavaScript-to-Script API Methods**:
  - `SmartContract.createCovenantBuilder()` - Factory for covenant builders
  - `SmartContract.createValueLockCovenant(value)` - Quick value lock creation
  - `SmartContract.simulateScript(operations)` - JavaScript script simulation
  - `SmartContract.createASMFromJS(operations)` - ASM generation from JS operations
  - `SmartContract.getOpcodeMap()` - Access to complete opcode mapping

#### Real-Time Script Simulation Engine
- **JavaScript Stack Simulation**: Complete Bitcoin Script execution in JavaScript
- **Step-by-Step Debugging**: Detailed execution history with stack visualization
- **Error Detection**: Comprehensive validation and debugging capabilities
- **Performance Analysis**: Operation counting and optimization suggestions

### 🔧 Technical Implementation Details

#### Bitcoin Script Number Encoding
- Proper implementation of Bitcoin Script's variable-length integer encoding
- Automatic conversion between JavaScript numbers and Bitcoin Script format
- Support for negative numbers with sign bit handling

#### Stack Manipulation Engine
- Complete Bitcoin Script stack simulation with main and alt stacks
- Proper implementation of all stack operations (DUP, SWAP, DROP, PICK, ROLL, etc.)
- Buffer-based data handling matching Bitcoin Script behavior

#### Preimage Field Extraction Strategies
- **LEFT Strategy**: Extract fields from beginning of preimage (nVersion, hashPrevouts, etc.)
- **RIGHT Strategy**: Extract fields from end of preimage (value, nSequence, etc.)
- **DYNAMIC Strategy**: Context-dependent extraction (scriptLen, scriptCode)

### 📊 Testing and Validation
- **100% Test Coverage**: All 121 opcodes tested and validated
- **Integration Testing**: Seamless compatibility with existing preimage extraction
- **Performance Testing**: Optimized for production deployment
- **Documentation Testing**: All examples verified and working

### 🎨 Usage Examples Added
```javascript
// Simple value lock covenant
const valueLock = SmartContract.createValueLockCovenant('50c3000000000000');
const script = valueLock.build();

// Custom covenant with field validation
const custom = SmartContract.createCovenantBuilder()
  .extractField('value')
  .push('50c3000000000000')
  .equalVerify()
  .push(1);

// Script simulation
const result = SmartContract.simulateScript(['OP_1', 'OP_2', 'OP_ADD']);
```

### 📚 Enhanced Documentation
- **Comprehensive JavaScript-to-Script Guide**: Complete usage documentation
- **Opcode Reference**: All 121 opcodes with descriptions and examples
- **Covenant Builder API**: Detailed method documentation with examples
- **Template Patterns**: Common covenant patterns and usage guidelines

## [3.1.1] - 2025-10-19

### 🎯 Major Features Added

#### Advanced Covenant Framework
- **BIP143 Compliant Preimage Parsing**: Complete field-by-field parsing with proper type conversion
  - Enhanced CovenantPreimage class with little-endian value accessors
  - Variable-length field parsing (scriptCode with varint handling)  
  - Comprehensive 108+ byte structure validation
  - Direct field access (nVersionValue, amountValue, nSequenceValue, etc.)
- **nChain PUSHTX Integration**: Academic research-based in-script signature generation (WP1605)
  - In-script signature generation using s = z + Gx mod n formula
  - Generator point optimization (k=a=1) for efficiency
  - DER canonicalization preventing transaction malleability
  - Message construction following BIP143 structure
- **Perpetually Enforcing Locking Scripts (PELS)**: Ongoing rule enforcement across transaction chains
  - Forces all future transactions to maintain same locking script
  - Configurable fee deduction per transaction (e.g., 512 satoshis)
  - Value preservation with automatic fee adjustment
- **Transaction Introspection**: Selective transaction field validation via preimage analysis

#### Enhanced API Design
- **CovenantInterface Class**: High-level abstractions for covenant development
- **CovenantTransaction Wrapper**: Transaction class with covenant-specific methods
- **CovenantPreimage Class**: Detailed BIP143 preimage parsing

### 📚 Documentation Enhancements
- **Advanced Covenant Development Guide**: Complete BIP143 + PUSHTX techniques
- **Reorganized Documentation Structure**: Clear hierarchy with cross-references
- **Working Examples**: Complete covenant demonstrations and patterns

### 🔧 Technical Improvements
- **Security Enhancements**: Parameter fixing, DER canonicalization, validation
- **Performance Optimizations**: Alt stack usage, preimage caching, script size reduction
- **Developer Experience**: Simplified APIs, template system, enhanced error messages

## [3.0.2] - 2025-10-18

### 🔧 Fixed
- **CRITICAL**: Fixed signature verification bug that caused all ECDSA.verify() calls to return false
- **CRITICAL**: Fixed SmartVerify.smartVerify() failure when processing DER-encoded signatures
- Fixed ECDSA.set() method to automatically parse DER buffers to Signature objects for compatibility
- Fixed double canonicalization issue in ECDSA.sigError() that corrupted signature verification
- Fixed SmartVerify.isCanonical() to properly handle DER buffer inputs
- Enhanced backward compatibility for both canonical and non-canonical signature inputs

### ✨ Added
- **NEW**: SmartUTXO - Comprehensive UTXO management system for BSV development and testing
- **NEW**: SmartMiner - BSV blockchain miner simulator with full transaction validation
- **NEW**: Signature verification validation test suite (`npm run test:signatures`)
- **NEW**: CustomScriptHelper - Simplified API for custom BSV script development
- **NEW**: CDN Bundle System - Multiple distribution formats for different use cases
- **NEW**: Blockchain state management with persistent JSON storage
- **NEW**: Mock UTXO generation for testing and development
- **NEW**: Transaction mempool simulation and block mining
- **NEW**: Enhanced development tools for BSV application testing

### 🚀 Enhanced
- Improved signature verification pipeline for external developer compatibility
- Enhanced DER buffer parsing throughout the crypto modules
- Added comprehensive logging and debugging capabilities for development tools
- Improved error handling and validation in signature processing
- Added compatibility layer for mixed signature formats (DER buffers + Signature objects)

### 📦 Developer Experience
- Added `validation_test.js` for signature verification testing
- Exposed `bsv.SmartUTXO` and `bsv.SmartMiner` modules in main API
- Enhanced npm scripts with signature testing capabilities
- Added comprehensive documentation for new UTXO management features
- Included utilities/ directory in npm package for developer access

### 🐛 Bug Impact
- **Before**: External developers importing smartledger-bsv experienced 100% signature verification failure
- **After**: All signature verification methods now work correctly with 100% success rate
- **Affected Methods**: ECDSA.verify(), SmartVerify.smartVerify(), SmartVerify.isCanonical()
- **Root Cause**: Double canonicalization and improper DER buffer handling in verification pipeline
- **Solution**: Enhanced signature object parsing and canonical verification logic

### 📊 Validation Results
```
Test Results: 14/14 tests passed (100% success rate)
✅ ECDSA.verify(hash, derSig, publicKey): true
✅ ECDSA.verify(hash, canonicalDer, publicKey): true  
✅ ECDSA.verify(hash, signature, publicKey): true
✅ SmartVerify.smartVerify(hash, derSig, publicKey): true
✅ SmartVerify.smartVerify(hash, canonicalDer, publicKey): true
✅ SmartVerify.isCanonical(derSig): true
✅ SmartVerify.isCanonical(canonicalDer): true
```

## [3.0.1] - 2025-10-19

### 🔒 Security
- Security-hardened Bitcoin SV library with zero known vulnerabilities
- Enhanced signature canonicalization and malleability protection  
- Fixed elliptic curve vulnerabilities from upstream dependencies
- Implemented SmartVerify hardened verification module

### 🏗️ Infrastructure  
- Complete drop-in replacement for bsv@1.5.6
- Maintained full API compatibility while enhancing security
- Added comprehensive security feature documentation
- Enhanced error handling and input validation

---

## Migration Guide

### From v3.0.1 to v3.0.2

**No Breaking Changes** - This is a bug fix release that maintains full backward compatibility.

**New Features Available:**
```javascript
const bsv = require('smartledger-bsv');

// New UTXO Management System
const utxoManager = new bsv.SmartUTXO();
const balance = utxoManager.getBalance('1A1zP1eP5QGefi2DMPTfTL5SLmv7DivfNa');

// New Miner Simulator
const miner = new bsv.SmartMiner(bsv);
const accepted = miner.acceptTransaction(transaction);
const block = miner.mineBlock();

// Signature verification now works correctly
const verified = bsv.crypto.ECDSA.verify(hash, derSig, publicKey); // Now returns true
const smartVerified = bsv.SmartVerify.smartVerify(hash, derSig, publicKey); // Now returns true
```

**Testing Your Integration:**
```bash
npm run test:signatures  # Validates signature verification works correctly
```

---

## Support

- **GitHub**: https://github.com/codenlighten/smartledger-bsv
- **Issues**: https://github.com/codenlighten/smartledger-bsv/issues
- **Email**: hello@smartledger.technology