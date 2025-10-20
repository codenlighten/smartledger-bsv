# SmartLedger-BSV

**Advanced Bitcoin SV Library with Enterprise Covenant Framework**

[![Version](https://img.shields.io/badge/version-3.1.1-blue.svg)](https://www.npmjs.com/package/@smartledger/bsv)
[![License](https://img.shields.io/badge/license-MIT-green.svg)](LICENSE)
[![BSV](https://img.shields.io/badge/BSV-Compatible-orange.svg)](https://bitcoinsv.com/)
[![Covenant](https://img.shields.io/badge/Covenants-Advanced-purple.svg)](#covenant-framework)

SmartLedger-BSV is a comprehensive Bitcoin SV library that provides both high-level abstractions and granular control for advanced blockchain development. Built on the foundation of BSV library with enhanced covenant capabilities, custom script framework, and enterprise-grade features.

## 🚀 Key Features

### Core Library
- ✅ **Complete BSV API**: Full compatibility with BSV blockchain operations
- ✅ **Ultra-Low Fees**: 0.01 sats/byte configuration (91% fee reduction)
- ✅ **UTXO Management**: Advanced state management with change output handling
- ✅ **CDN Distribution**: Multiple webpack bundles for web development
- ✅ **NPM Ready**: Published as `smartledger-bsv` and `@smartledger/bsv`

### Advanced Covenant Framework
- 🔒 **BIP143 Compliant**: Complete preimage parsing with field-by-field access
- 🔒 **PUSHTX Integration**: nChain WP1605 in-script signature generation
- 🔒 **PELS Support**: Perpetually Enforcing Locking Scripts
- 🔒 **JavaScript-to-Script**: Write covenant logic in JavaScript, get Bitcoin Script ASM
- 🔒 **Complete Opcode Mapping**: All 121 Bitcoin Script opcodes with JavaScript equivalents
- 🔒 **Covenant Builder**: High-level API for rapid covenant development
- 🔒 **Script Simulation**: Real-time debugging with stack visualization
- 🔒 **Template Patterns**: Pre-built covenant templates for common use cases
- 🔒 **Dual-Level API**: High-level abstractions + granular BSV control
- 🔒 **Production Ready**: Comprehensive validation and error handling

### Custom Script Development  
- 🛠️ **Multi-signature Scripts**: Advanced m-of-n signature schemes
- 🛠️ **Timelock Contracts**: Block height and timestamp constraints
- 🛠️ **Conditional Logic**: Complex branching and validation rules
- 🛠️ **Template System**: Pre-built patterns for common use cases
- 🛠️ **Developer API**: Simplified interface for rapid development

## � Table of Contents

- [Quick Start](#quick-start)
- [Installation](#installation)
- [Basic Usage](#basic-usage)
- [Covenant Framework](#covenant-framework)
- [Custom Scripts](#custom-scripts)
- [Examples](#examples)
- [Documentation](#documentation)
- [API Reference](#api-reference)
- [Contributing](#contributing)
- [License](#license)

## ⚡ Quick Start

```

## 📦 Installation

### NPM Installation
```bash
# Main package
npm install @smartledger/bsv

# Alternative package name
npm install smartledger-bsv
```

### CDN Usage
```html
<!-- Main library -->
<script src="https://unpkg.com/@smartledger/bsv@latest/dist/bsv.bundle.js"></script>

<!-- Minified version -->
<script src="https://unpkg.com/@smartledger/bsv@latest/dist/bsv.min.js"></script>

<!-- Specialized modules -->
<script src="https://unpkg.com/@smartledger/bsv@latest/dist/bsv-ecies.min.js"></script>
<script src="https://unpkg.com/@smartledger/bsv@latest/dist/bsv-message.min.js"></script>
<script src="https://unpkg.com/@smartledger/bsv@latest/dist/bsv-mnemonic.min.js"></script>
```

## 🔨 Basic Usage

### Creating Transactions
```javascript
const bsv = require('@smartledger/bsv');

// Create transaction with optimized fees
const transaction = new bsv.Transaction()
  .from({
    txId: 'prev_tx_id',
    outputIndex: 0,
    script: 'prev_locking_script',
    satoshis: 100000
  })
  .to('1A1zP1eP5QGefi2DMPTfTL5SLmv7DivfNa', 95000)
  .feePerKb(10) // Ultra-low fee: 0.01 sats/byte
  .sign(privateKey);

console.log('Transaction ID:', transaction.id);
console.log('Fee rate: 0.01 sats/byte (91% reduction)');
```

### UTXO Management
```javascript
// Advanced UTXO state management
const utxoManager = {
  createWithChange: (inputs, outputs, changeAddress) => {
    const tx = new bsv.Transaction()
      .from(inputs)
      .to(outputs.address, outputs.amount)
      .change(changeAddress)
      .feePerKb(10);
    
    // Automatic change output creation and UTXO state update
    return tx;
  }
};
```

## 🔒 Covenant Framework

### JavaScript-to-Bitcoin Script Translation
```javascript
const { CovenantBuilder, CovenantTemplates } = require('@smartledger/bsv/lib/smart_contract');

// Write covenant logic in JavaScript
const valueLock = CovenantTemplates.valueLock('50c3000000000000');
const script = valueLock.build();
console.log(script.cleanedASM); 
// Output: OP_SIZE 34 OP_SUB OP_SPLIT OP_DROP OP_8 OP_SPLIT OP_DROP 50c3000000000000 OP_EQUALVERIFY OP_1

// Custom covenant builder
const custom = new CovenantBuilder()
  .comment('Validate preimage value field')
  .extractField('value')
  .push('50c3000000000000')
  .equalVerify()
  .push(1);
```

### Complete Opcode Mapping (121 Opcodes)
```javascript
const SmartContract = require('@smartledger/bsv/lib/smart_contract');

// Simulate script execution in JavaScript
const result = SmartContract.simulateScript(['OP_1', 'OP_2', 'OP_ADD', 'OP_3', 'OP_EQUAL']);
console.log(result.finalStack); // ['01'] - TRUE

// Get comprehensive opcode information
const opcodes = SmartContract.getOpcodeMap();
console.log(Object.keys(opcodes).length); // 121 opcodes mapped
```

### BIP143 Preimage Parsing
```javascript
const { CovenantPreimage } = require('@smartledger/bsv/lib/covenant-interface');

// Enhanced preimage parsing with field-by-field access
const preimage = new CovenantPreimage(preimageHex);

console.log('Version:', preimage.nVersionValue);      // uint32 accessor
console.log('Amount:', preimage.amountValue);         // BigInt accessor  
console.log('Valid structure:', preimage.isValid);    // Boolean validation
```

### PUSHTX Covenants (nChain WP1605)
```javascript
const { CovenantInterface } = require('@smartledger/bsv/lib/covenant-interface');
const covenant = new CovenantInterface();

// Create PUSHTX covenant with in-script signature generation
const pushtxCovenant = covenant.createAdvancedCovenant('pushtx', {
  publicKey: '0279be667ef9dcbbac55a06295ce870b07029bfcdb2dce28d959f2815b16f81798',
  enforceOutputs: true,
  sighashType: 0x41
});
```

### Perpetually Enforcing Locking Scripts (PELS)
```javascript
// Create perpetual covenant that enforces rules across all future transactions
const pels = covenant.createAdvancedCovenant('perpetual', {
  publicKeyHash: '751e76e8199196d454941c45d1b3a323f1433bd6',
  feeDeduction: 512,
  enforceScript: true,
  enforceValue: true
});
```

## 🛠️ Custom Scripts

### Multi-signature Scripts
```javascript
const { CustomScriptHelper } = require('@smartledger/bsv/lib/custom-script-helper');
const helper = new CustomScriptHelper();

// Create 2-of-3 multisig script
const multisigScript = helper.createMultisigScript([
  publicKey1, publicKey2, publicKey3
], 2);
```

### Timelock Contracts
```javascript
// Create timelock script (block height)
const timelockScript = helper.createTimelockScript(
  publicKey,
  750000, // block height
  'block'
);
```

## � Examples

### Basic Examples
- **[Advanced Covenant Demo](advanced_covenant_demo.js)**: Complete covenant showcase
- **[Custom Script Tests](test/custom_script_signature_test.js)**: Script development examples
- **[Covenant Resolution](covenant_manual_signature_resolved.js)**: Working covenant patterns

### Documentation
- **[Advanced Covenant Development](ADVANCED_COVENANT_DEVELOPMENT.md)**: Complete BIP143 + PUSHTX guide
- **[Custom Script Development](CUSTOM_SCRIPT_DEVELOPMENT.md)**: Script creation patterns
- **[Covenant Development Resolved](COVENANT_DEVELOPMENT_RESOLVED.md)**: Problem solutions

## 🔧 CDN Bundles

| Bundle | Size | Description |
|--------|------|-------------|
| `bsv.bundle.js` | 684KB | Complete library with all features |
| `bsv.min.js` | 364KB | Minified production version |
| `bsv-ecies.min.js` | 145KB | ECIES encryption only |
| `bsv-message.min.js` | 120KB | Message signing only |
| `bsv-mnemonic.min.js` | 98KB | Mnemonic handling only |

## 🔐 Security

### Enhanced Security Features
- **Elliptic Curve Fix**: Updated to secure elliptic@6.6.1
- **Parameter Fixing**: Public key, ephemeral key, sighash flag validation
- **DER Canonicalization**: Transaction malleability prevention  
- **Preimage Validation**: Complete BIP143 structure verification

## 📝 Changelog

### v3.2.0 - JavaScript-to-Bitcoin Script Framework
- ✅ Complete JavaScript-to-Bitcoin Script translation system
- ✅ 121 Bitcoin Script opcodes mapped to JavaScript functions
- ✅ High-level CovenantBuilder API for rapid development
- ✅ Real-time script simulation and debugging capabilities
- ✅ Template-based covenant patterns library
- ✅ Automatic ASM generation from JavaScript operations
- ✅ Enhanced documentation and comprehensive examples

### v3.1.1 - Advanced Covenant Framework
- ✅ Enhanced covenant interface with BIP143 + PUSHTX support
- ✅ Perpetually Enforcing Locking Scripts (PELS) implementation
- ✅ Transaction introspection with preimage analysis
- ✅ Comprehensive documentation and examples

### v3.0.2 - Custom Script Framework  
- ✅ Complete custom script development API
- ✅ Multi-signature, timelock, and conditional script support
- ✅ Transaction signature API gap resolution

### v3.0.1 - Ultra-Low Fee System
- ✅ 0.01 sats/byte fee configuration (91% reduction)
- ✅ Advanced UTXO state management
- ✅ Change output optimization

## 📄 License

This project is licensed under the MIT License - see the [LICENSE](LICENSE) file for details.

## 🤝 Contributing

We welcome contributions to SmartLedger-BSV! Please see our [Contributing Guide](CONTRIBUTING.md) for details.

## 🏢 Enterprise Support

- **GitHub**: [github.com/codenlighten/smartledger-bsv](https://github.com/codenlighten/smartledger-bsv)
- **NPM**: [@smartledger/bsv](https://www.npmjs.com/package/@smartledger/bsv)
- **Issues**: [GitHub Issues](https://github.com/codenlighten/smartledger-bsv/issues)

---

**SmartLedger-BSV v3.1.1** - *Advanced Bitcoin SV Library with Enterprise Covenant Framework*

Built with ❤️ for the Bitcoin SV ecosystem
