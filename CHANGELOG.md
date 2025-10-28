# Changelog# Changelog



All notable changes to SmartLedger-BSV will be documented in this file.All notable changes to SmartLedger-BSV will be documented in this file.



The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.0.0/),The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.0.0/),

and this project adheres to [Semantic Versioning](https://semver.org/spec/v2.0.0.html).and this project adheres to [Semantic Versioning](https://semver.org/spec/v2.0.0.html).



## [3.3.3] - 2025-10-28## [3.3.0] - 2025-10-22



### 🎉 Major Improvements### 🚀 MAJOR RELEASE: Legal Token Protocol (LTP) & Global Digital Attestation Framework (GDAF)



#### 📁 Project Organization & Structure#### Revolutionary Legal Token Protocol Framework

- **Complete repository reorganization**: Moved legacy files to `/archive/` for better project structure- **Complete Legal Token Protocol (LTP)**: 6-module comprehensive legal framework

- **New `/demos/` directory**: Interactive HTML demonstrations for all SmartLedger-BSV modules  - **lib/ltp/anchor.js**: Blockchain anchoring preparation primitives

- **Enhanced `/docs/` structure**: Comprehensive documentation with getting started guides, API references, and technical details  - **lib/ltp/registry.js**: Token registry management primitives  

- **Dedicated `/tests/` directory**: All test files properly organized and categorized  - **lib/ltp/claim.js**: Legal claim validation and attestation primitives

- **New `/tools/` directory**: Development utilities and helper scripts  - **lib/ltp/proof.js**: Cryptographic proof generation primitives

  - **lib/ltp/right.js**: Legal rights token creation and validation primitives

#### 🚀 Interactive Demos  - **lib/ltp/obligation.js**: Legal obligation token management primitives

- **Smart Contract Demo**: Full-featured HTML demo showcasing covenant creation, preimage parsing, script building, and UTXO generation

- **Web3Keys Demo**: Interactive key generation and cryptographic operations demonstration#### Primitives-Only Architecture Philosophy

- **Local development server**: Easy setup for testing demos locally- **No Blockchain Publishing**: Library provides preparation functions only

- **External System Integration**: Perfect for enterprise and custom implementations

#### 📚 Documentation Enhancements- **Maximum Flexibility**: Choose your own blockchain, storage, and UI frameworks

- **Complete API documentation**: Detailed reference for all modules and classes- **Clean Separation**: Cryptographic correctness separated from application logic

- **Getting Started guides**: Step-by-step tutorials for new developers

- **Advanced development guides**: In-depth coverage of complex topics#### Legal Token Framework Components

- **Migration documentation**: Guidelines for upgrading from previous versions- **46 LTP Primitive Methods**: Complete coverage across all legal token operations

- **Technical specifications**: Detailed implementation documentation  - 4 Right Token Primitives (prepare, verify, transfer, validate)

  - 5 Obligation Token Primitives (create, verify, fulfill, breach assessment, monitoring)

### 🔧 Technical Improvements  - 5 Claim Validation Primitives (validate, attest, dispute, bulk processing, templates)

  - 6 Proof Generation Primitives (signature, selective disclosure, ZK, legal validity)

#### ✅ Test Suite Enhancements  - 8 Registry Management Primitives (registry setup, registration, approval, revocation, queries)

- **Fixed opcode mapping tests**: Updated tests to reflect Chronicle string operations (OP_SUBSTR, OP_LEFT, OP_RIGHT)  - 4 Blockchain Anchoring Primitives (commitment, batch processing, verification, revocation)

- **Corrected opcode count**: Updated from 118 to 121 elements to include new Chronicle opcodes

- **Perfect test coverage**: All 534 tests now pass (100% success rate)#### W3C-Compliant Legal Standards

- **Updated reverseMap validation**: Fixed OP_NOP7 position validation (was incorrectly expecting OP_NOP10)- **PropertyTitle**: Complete property ownership claim schema

- **VehicleTitle**: Vehicle ownership and transfer documentation

#### 🛠️ Build System Updates- **PromissoryNote**: Financial obligation and debt instruments

- **Enhanced webpack configurations**: Improved build processes for all modules- **IntellectualProperty**: IP rights and licensing framework

- **Updated bundle outputs**: Refreshed all minified bundles with latest optimizations- **ProfessionalLicense**: Professional certification and licensing

- **Better development workflow**: Streamlined build and test processes- **MusicLicense**: Music rights and royalty management



#### 🧹 Code Quality Improvements#### Global Digital Attestation Framework (GDAF)

- **Linting fixes**: Resolved JavaScript Standard Style violations across utility files- **6-Module GDAF Implementation**: Complete W3C Verifiable Credentials compliance

- **Unused import cleanup**: Removed unused dependencies and imports  - **lib/gdaf/attestation.js**: Digital attestation creation and verification

- **Syntax compatibility**: Fixed ES2020 optional chaining for broader compatibility  - **lib/gdaf/identity.js**: Decentralized identity management

- **Code organization**: Better separation of concerns and cleaner file structure  - **lib/gdaf/registry.js**: Attestation registry and discovery

  - **lib/gdaf/credential.js**: W3C Verifiable Credentials implementation

### 🔒 Chronicle Integration  - **lib/gdaf/proof.js**: Cryptographic proof systems

- **OP_SUBSTR support**: Full implementation of substring operations  - **lib/gdaf/verification.js**: Multi-layer verification framework

- **OP_LEFT support**: Left substring extraction functionality  

- **OP_RIGHT support**: Right substring extraction functionality#### Enhanced Cryptographic Primitives

- **Updated opcode mappings**: Proper integration of Chronicle string operations into opcode system- **Shamir Secret Sharing**: Complete k-of-n threshold cryptography

  - **lib/crypto/shamir.js**: Production-ready SSS implementation

### 📦 Module Improvements  - **bsv.createShares()**: Split secrets into threshold shares

  - **bsv.reconstructSecret()**: Reconstruct from threshold shares

#### 💎 Utility Enhancements  - **bsv.verifyShares()**: Validate share integrity

- **Blockchain state management**: Improved simulation and state tracking

- **UTXO management**: Enhanced UTXO generation and management tools### 🎯 Complete Legal Token Workflow Example

- **Transaction examples**: Comprehensive transaction building examples

- **Miner simulation**: Better blockchain mining simulation for development#### Real BSV Integration Demonstration

- **Success demonstration**: Working examples of successful operations- **Real Private Keys**: Actual BSV addresses and WIF keys generated

- **Mock UTXO System**: Complete testing framework without blockchain dependency

### 🐛 Bug Fixes- **Smart Contract Covenants**: Legal token enforcement through BSV covenants

- **Fixed demo script paths**: Corrected relative paths in HTML demos- **End-to-End Workflow**: From claim creation to token transfer with covenant validation

- **Resolved test failures**: All opcode-related test issues resolved

- **Build output corrections**: Fixed webpack output paths and configurations#### Example Results from `complete_ltp_demo.js`:

- **Import path fixes**: Corrected module import paths across the codebase- Property Right Token: `RT-1bd80ac44e27c3ec0f9dffdd2efffe07`

- Obligation Token: `OB-e87eb0388db36b8b5777118ae45c46d3`

### 🔄 Backwards Compatibility- Covenant Address: `1MhX6MRVE79Qn4CtQ6bkk5JJJeMCTXBwwo`

- **Maintained API compatibility**: All existing APIs remain functional- Transfer Transaction: `4b1125d5dfc53e0157b843b8d2e964922331dd509ca096f9a470bfda421b43e6`

- **Legacy file preservation**: Old files archived rather than deleted

- **Migration support**: Clear upgrade paths for existing applications### 🏗️ Architecture Excellence

- **Version consistency**: No breaking changes to core functionality

#### Interface Transformation

### 📈 Performance Improvements**Before (Application Framework):**

- **Optimized bundles**: Reduced bundle sizes through better webpack configurations```javascript

- **Faster tests**: Improved test execution speed through better organizationbsv.createRightToken()     // Created AND published to blockchain

- **Enhanced development experience**: Faster build times and better error reportingbsv.validateLegalClaim()   // Validated AND stored in database

bsv.anchorTokenBatch()     // Created batch AND sent transaction

### 🎯 Developer Experience```

- **Interactive learning**: Hands-on demos for understanding SmartLedger-BSV capabilities

- **Better documentation**: Clear examples and comprehensive API coverage**After (Primitives-Only):**

- **Improved debugging**: Better error messages and debugging tools```javascript

- **Development tools**: Enhanced utilities for blockchain developmentbsv.prepareRightToken()           // Prepares token structure only

bsv.prepareClaimValidation()      // Validates structure only  

### 📋 Quality Assurancebsv.prepareBatchCommitment()      // Prepares commitment only

- **Complete test coverage**: 534/534 tests passing```

- **Linting compliance**: Full JavaScript Standard Style compliance

- **Build verification**: All builds complete successfully### 🛠️ New Development Tools & Testing

- **Cross-platform compatibility**: Verified functionality across different environments

#### Comprehensive Demo Suite

---- **complete_ltp_demo.js**: Full end-to-end LTP workflow with real BSV keys

- **simple_demo.js**: Architectural overview and primitives showcase

## Previous Versions- **architecture_demo.js**: Before/after comparison demonstration

- **gdaf_demo.js**: Complete GDAF framework demonstration

### [3.3.2] and earlier- **shamir_demo.js**: Threshold cryptography examples

Previous version history is available in the git commit log. This changelog format starts with version 3.3.3.

#### New NPM Scripts

---- **`npm run test:ltp`**: Complete Legal Token Protocol demonstration

- **`npm run test:ltp-primitives`**: Primitives-only architecture showcase

### 🚀 Getting Started- **`npm run test:architecture`**: Architectural transformation comparison



To get started with SmartLedger-BSV v3.3.3:### 📦 Enhanced Build System



```bash#### New Standalone Modules

npm install @smartledger/bsv@3.3.3- **bsv-ltp.min.js**: Complete Legal Token Protocol standalone module

```- **bsv-shamir.min.js**: Standalone Shamir Secret Sharing module

- **bsv-gdaf.min.js**: Complete GDAF framework module

Check out the interactive demos:

```bash#### Updated Keywords & Metadata

cd demos```json

python3 -m http.server 8080"legal-token-protocol", "ltp", "legal-tokens", "primitives-only",

# Open http://localhost:8080"legal-compliance", "property-rights", "obligations", "attestations",

```"gdaf", "global-digital-attestation", "w3c-credentials", 

"verifiable-credentials", "shamir-secret-sharing", "threshold-cryptography"

### 📖 Documentation```



- **API Reference**: `/docs/api/`### 💫 Enterprise Integration Benefits

- **Getting Started**: `/docs/getting-started/`

- **Examples**: `/examples/`#### For Developers

- **Demos**: `/demos/`- ✅ Choose any blockchain platform (BSV, Bitcoin, Ethereum, etc.)

- ✅ Choose any storage solution (SQL, NoSQL, IPFS, etc.)

### 🔗 Links- ✅ Full architectural control and system integration

- ✅ Easy integration with existing business systems

- **GitHub**: https://github.com/codenlighten/smartledger-bsv

- **NPM**: https://npmjs.com/package/@smartledger/bsv#### For Enterprises  

- **Documentation**: https://github.com/codenlighten/smartledger-bsv/tree/main/docs- ✅ No vendor lock-in to specific platforms
- ✅ Compliance with existing IT policies
- ✅ Legacy system compatibility
- ✅ Audit-friendly separation of concerns

#### For Security & Legal
- ✅ Isolated cryptographic operations
- ✅ Standardized legal token structures
- ✅ Predictable, deterministic behavior
- ✅ Regulatory compliance primitives

### 🔄 Migration from v3.2.x

#### Backward Compatibility
- All existing APIs remain functional
- New primitives-only methods added alongside existing functionality
- Gradual migration path available for existing applications

#### Recommended Migration Steps
1. Test new LTP primitives with existing data structures
2. Gradually replace direct blockchain operations with preparation primitives
3. Implement external systems for blockchain publishing and storage
4. Enjoy increased flexibility and architectural control

---

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