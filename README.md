# SmartLedger-BSV

**🚀 Complete Bitcoin SV Development Framework with 9 Flexible Loading Options**

[![Version](https://img.shields.io/badge/version-3.2.1-blue.svg)](https://www.npmjs.com/package/@smartledger/bsv)
[![License](https://img.shields.io/badge/license-MIT-green.svg)](LICENSE)
[![BSV](https://img.shields.io/badge/BSV-Compatible-orange.svg)](https://bitcoinsv.com/)
[![Modular](https://img.shields.io/badge/Loading-Modular-purple.svg)](#loading-options)

The most comprehensive and flexible Bitcoin SV library available. Choose from 9 different distribution methods: standalone modules, complete bundle, or mix-and-match approach. Perfect for everything from simple transactions to complex DeFi protocols and smart contracts.

## 🎯 **9 Loading Options - Choose Your Approach**

| Module | Size | Use Case | CDN |
|--------|------|----------|-----|
| **bsv.min.js** | 449KB | Core BSV + SmartContract | `unpkg.com/@smartledger/bsv@3.2.1/bsv.min.js` |
| **bsv.bundle.js** | 764KB | Everything in one file | `unpkg.com/@smartledger/bsv@3.2.1/bsv.bundle.js` |
| **bsv-covenant.min.js** | 32KB | Covenant development | `unpkg.com/@smartledger/bsv@3.2.1/bsv-covenant.min.js` |
| **bsv-script-helper.min.js** | 27KB | Custom script tools | `unpkg.com/@smartledger/bsv@3.2.1/bsv-script-helper.min.js` |
| **bsv-security.min.js** | 290KB | Security enhancements | `unpkg.com/@smartledger/bsv@3.2.1/bsv-security.min.js` |
| **bsv-smartcontract.min.js** | 451KB | Debug tools | `unpkg.com/@smartledger/bsv@3.2.1/bsv-smartcontract.min.js` |
| **bsv-ecies.min.js** | 71KB | Encryption | `unpkg.com/@smartledger/bsv@3.2.1/bsv-ecies.min.js` |
| **bsv-message.min.js** | 26KB | Message signing | `unpkg.com/@smartledger/bsv@3.2.1/bsv-message.min.js` |
| **bsv-mnemonic.min.js** | 670KB | HD wallets | `unpkg.com/@smartledger/bsv@3.2.1/bsv-mnemonic.min.js` |

## ⚡ **2-Minute Quick Start**

Get started with Bitcoin SV development in under 2 minutes:

```bash
# Install via npm
npm install @smartledger/bsv

# Or include in HTML
<script src="https://unpkg.com/@smartledger/bsv@3.2.1/bsv.min.js"></script>
```

**Basic Transaction (30 seconds):**
```javascript
const bsv = require('@smartledger/bsv'); // Node.js
// const bsv = window.bsv; // Browser

// 1. Generate keys
const privateKey = new bsv.PrivateKey();
const address = privateKey.toAddress();

// 2. Create transaction
const tx = new bsv.Transaction()
  .from(utxo)                    // Add input
  .to(targetAddress, 50000)      // Send 50,000 satoshis
  .change(address)               // Send change back
  .sign(privateKey);             // Sign transaction

console.log('Transaction ID:', tx.id);
```

**Covenant Development (90 seconds):**
```javascript
// Load covenant interface
const covenant = new bsv.CovenantInterface();

// Create covenant transaction with preimage access
const covenantTx = covenant.createCovenantTransaction({
  inputs: [utxo],
  outputs: [{ address: targetAddress, satoshis: 99000 }]
});

// Get BIP143 preimage for validation
const preimage = covenantTx.getPreimage(0, lockingScript, satoshis);

// Create manual signature
const signature = covenant.createSignature(tx, privateKey, 0, script, satoshis);
```

**Next Steps:**
- 📖 [Advanced Covenant Guide](docs/ADVANCED_COVENANT_DEVELOPMENT.md)
- 🛠️ [Custom Script Development](docs/CUSTOM_SCRIPT_DEVELOPMENT.md)
- 🔧 [API Reference](#api-reference)
- 💡 [Examples Directory](examples/)

## 🔧 **API Reference**

| Component | Method | Purpose | Example |
|-----------|--------|---------|---------|
| **Core** | `new PrivateKey()` | Generate private key | `const key = new bsv.PrivateKey()` |
| | `new Transaction()` | Create transaction | `const tx = new bsv.Transaction()` |
| | `Script.fromASM()` | Parse script | `const script = bsv.Script.fromASM('OP_DUP')` |
| **Covenant** | `CovenantInterface()` | Covenant development | `const covenant = new bsv.CovenantInterface()` |
| | `createCovenantTransaction()` | Covenant transaction | `covenant.createCovenantTransaction(config)` |
| | `getPreimage()` | BIP143 preimage | `covenant.getPreimage(tx, 0, script, sats)` |
| **Custom Scripts** | `CustomScriptHelper()` | Script utilities | `const helper = new bsv.CustomScriptHelper()` |
| | `createSignature()` | Manual signature | `helper.createSignature(tx, key, 0, script, sats)` |
| | `createMultisigScript()` | Multi-signature | `helper.createMultisigScript([pk1, pk2], 2)` |
| **Debug Tools** | `SmartContract.examineStack()` | Analyze script | `SmartContract.examineStack(script)` |
| | `interpretScript()` | Execute script | `SmartContract.interpretScript(script)` |
| | `getScriptMetrics()` | Performance data | `SmartContract.getScriptMetrics(script)` |
| **Security** | `SmartVerify.verify()` | Enhanced verification | `SmartVerify.verify(sig, hash, pubkey)` |
| | `EllipticFixed.sign()` | Secure signing | `EllipticFixed.sign(hash, privateKey)` |

> 💡 **Tip:** All methods include comprehensive error handling and validation. See [documentation links](#documentation) for detailed guides.

## 📚 **Quick Start Examples**

### Minimal Setup (476KB total)
```html
<script src="https://unpkg.com/@smartledger/bsv@3.2.1/bsv.min.js"></script>
<script src="https://unpkg.com/@smartledger/bsv@3.2.1/bsv-script-helper.min.js"></script>
<script>
  const privateKey = new bsv.PrivateKey();
  const signature = bsvScriptHelper.createSignature(tx, privateKey, 0, script, satoshis);
</script>
```

### Advanced Development (932KB total)
```html
<script src="https://unpkg.com/@smartledger/bsv@3.2.1/bsv.min.js"></script>
<script src="https://unpkg.com/@smartledger/bsv@3.2.1/bsv-covenant.min.js"></script>
<script src="https://unpkg.com/@smartledger/bsv@3.2.1/bsv-smartcontract.min.js"></script>
<script>
  const covenant = new bsvCovenant.CovenantInterface();
  const contractTx = covenant.createCovenantTransaction(config);
  const debugInfo = SmartContract.examineStack(script);
</script>
```

### Everything Bundle (764KB)
```html
<script src="https://unpkg.com/@smartledger/bsv@3.2.1/bsv.bundle.js"></script>
<script>
  // Everything available immediately
  const keys = bsv.SmartLedgerBundle.generateKeys();
  const covenant = new bsv.CovenantInterface();
  const encrypted = bsv.ECIES.encrypt(data, publicKey);
</script>
```

## 🎯 **Key Features**

### Core Library  
- ✅ **Complete BSV API**: Full Bitcoin SV blockchain operations → [API Reference](#api-reference)
- ✅ **SmartContract Framework**: 59+ methods for script development and debugging → [SmartContract Integration](SMARTCONTRACT_INTEGRATION.md)
- ✅ **Security Hardened**: SmartLedger elliptic curve fixes and enhanced validation → [Security Features](#smart-security)
- ✅ **Browser + Node.js**: Universal compatibility with proper polyfills → [Loading Options](#9-loading-options--choose-your-approach)
- ✅ **TypeScript Ready**: Complete type definitions included

### Advanced Development Tools
- � **Covenant Interface**: High-level covenant development framework → [Covenant Guide](docs/ADVANCED_COVENANT_DEVELOPMENT.md)
- � **Custom Script Helper**: Simplified API for script creation and signing → [Script Development](docs/CUSTOM_SCRIPT_DEVELOPMENT.md)
- 🔒 **Debug Tools**: Script interpreter, stack examiner, metrics, and optimizer → [Debug Examples](tests/smartcontract-test.html)
- 🔒 **BIP143 Compliant**: Complete preimage parsing and manipulation → [Preimage Tools](examples/preimage/)
- 🔒 **PUSHTX Integration**: nChain techniques for advanced covenant patterns → [PUSHTX Insights](docs/pushtx-key-insights.md)

### Flexible Architecture
- 📦 **Modular Loading**: Load only what you need → [Loading Strategy](#loading-strategy-examples)
- 📦 **Standalone Modules**: Independent security and utility modules → [Standalone Test](tests/standalone-modules-test.html)
- 📦 **Complete Bundle**: Everything in one file for convenience → [Bundle Demo](tests/bundle-demo.html)
- 📦 **CDN Ready**: All modules available via unpkg and jsDelivr
- 📦 **Webpack Optimized**: Tree-shakeable and build-tool friendly

## ⚡ **Installation & Usage**

> 💡 **Quick Start**: Jump to [2-Minute Quick Start](#2-minute-quick-start) for instant setup examples

### NPM Installation
```bash
# Main package
npm install @smartledger/bsv

# Alternative package name (legacy)
npm install smartledger-bsv
```

> 📖 **Next Steps**: After installation, see [Loading Options](#9-loading-options--choose-your-approach) to choose your distribution method

### Node.js Usage
```javascript
const bsv = require('@smartledger/bsv');

// Basic transaction
const privateKey = new bsv.PrivateKey();
const publicKey = privateKey.toPublicKey();
const address = privateKey.toAddress();

// SmartContract debugging
const script = bsv.Script.fromASM('OP_1 OP_2 OP_ADD OP_3 OP_EQUAL');
const metrics = bsv.SmartContract.getScriptMetrics(script);
const stackInfo = bsv.SmartContract.examineStack(script);

// Covenant development
const covenant = new bsv.CovenantInterface();
const contractTx = covenant.createCovenantTransaction({
  inputs: [...],
  outputs: [...]
});
```

### Browser CDN (Choose Your Loading Strategy)

#### 1. **Minimal Setup** - Core + Script Helper (476KB)
```html
<script src="https://unpkg.com/@smartledger/bsv@3.2.1/bsv.min.js"></script>
<script src="https://unpkg.com/@smartledger/bsv@3.2.1/bsv-script-helper.min.js"></script>
<script>
  const tx = new bsv.Transaction();
  const sig = bsvScriptHelper.createSignature(tx, privateKey, 0, script, satoshis);
</script>
```

#### 2. **DeFi Development** - Core + Covenants + Debug (932KB)
```html
<script src="https://unpkg.com/@smartledger/bsv@3.2.1/bsv.min.js"></script>
<script src="https://unpkg.com/@smartledger/bsv@3.2.1/bsv-covenant.min.js"></script>
<script src="https://unpkg.com/@smartledger/bsv@3.2.1/bsv-smartcontract.min.js"></script>
<script>
  const covenant = new bsvCovenant.CovenantInterface();
  const debugInfo = SmartContract.interpretScript(script);
  const optimized = SmartContract.optimizeScript(script);
</script>
```

#### 3. **Security First** - Core + Enhanced Security (739KB)
```html
<script src="https://unpkg.com/@smartledger/bsv@3.2.1/bsv.min.js"></script>
<script src="https://unpkg.com/@smartledger/bsv@3.2.1/bsv-security.min.js"></script>
<script>
  const verified = bsvSecurity.SmartVerify.verify(signature, hash, publicKey);
  const enhanced = bsvSecurity.EllipticFixed.createSignature(privateKey, hash);
</script>
```

#### 4. **Everything Bundle** - One File Solution (764KB)
```html
<script src="https://unpkg.com/@smartledger/bsv@3.2.1/bsv.bundle.js"></script>
<script>
  // Everything available under bsv namespace
  const keys = bsv.SmartLedgerBundle.generateKeys();
  const covenant = new bsv.CovenantInterface();
  const message = new bsv.Message('Hello BSV');
  const encrypted = bsv.ECIES.encrypt('secret', publicKey);
</script>
```
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

---

## 📚 **Complete Documentation**

### 🚀 **Getting Started**
- **[2-Minute Quick Start](#2-minute-quick-start)** - Get up and running fast
- **[Loading Options](#9-loading-options--choose-your-approach)** - Choose your distribution method
- **[API Reference](#api-reference)** - Quick method lookup
- **[Installation Guide](#installation)** - npm, CDN, and browser setup

### 🎯 **Development Guides**
- **[Advanced Covenant Development](docs/ADVANCED_COVENANT_DEVELOPMENT.md)** - Complete BIP143 + PUSHTX guide
- **[Custom Script Development](docs/CUSTOM_SCRIPT_DEVELOPMENT.md)** - Multi-sig, timelock, and custom patterns
- **[Covenant Development Resolved](docs/COVENANT_DEVELOPMENT_RESOLVED.md)** - Solutions to common issues
- **[PUSHTX Key Insights](docs/pushtx-key-insights.md)** - nChain research implementation

### 🔧 **Technical Resources**
- **[SmartContract Integration](SMARTCONTRACT_INTEGRATION.md)** - Debug tools and analysis
- **[Examples Directory](examples/)** - Working code samples
- **[Test Suite](tests/)** - Comprehensive testing examples
- **[Build System](build/)** - Webpack configurations

### 🌐 **Loading Strategy Examples**

| **Use Case** | **Recommended Load** | **Size** | **Features** |
|--------------|---------------------|----------|--------------|
| **Simple Transactions** | `bsv.min.js` | 449KB | Core BSV + SmartContract |
| **DeFi Development** | Core + Covenant + Debug | 932KB | Advanced contracts + tools |
| **Enterprise Apps** | `bsv.bundle.js` | 764KB | Everything included |
| **Mobile/Lightweight** | Core + Script Helper | 476KB | Essential tools only |
| **Research/Analysis** | Core + SmartContract | 900KB | Full debug capabilities |

### 🔗 **Cross-References**

**From Quick Start → Deep Dive:**
- [Basic Transaction](#2-minute-quick-start) → [Transaction API](docs/transaction.md)
- [Covenant Example](#2-minute-quick-start) → [Advanced Covenant Guide](docs/ADVANCED_COVENANT_DEVELOPMENT.md)
- [API Reference](#api-reference) → [Method Documentation](docs/)

**From Examples → Implementation:**
- [Covenant Examples](examples/covenants/) → [Production Guide](docs/ADVANCED_COVENANT_DEVELOPMENT.md#production-guidelines)
- [Script Examples](examples/scripts/) → [Custom Script Guide](docs/CUSTOM_SCRIPT_DEVELOPMENT.md)
- [Test Files](tests/) → [Integration Examples](examples/)

**From Concepts → Code:**
- [PUSHTX Theory](docs/pushtx-key-insights.md) → [Covenant Implementation](examples/covenants/advanced_covenant_demo.js)
- [Security Features](#smart-security) → [Implementation](lib/crypto/smartledger_verify.js)
- [Debug Tools](#debug-tools) → [Usage Examples](tests/smartcontract-test.html)

### 🎓 **Learning Path**

1. **Start**: [2-Minute Quick Start](#2-minute-quick-start)
2. **Practice**: [Examples Directory](examples/) 
3. **Build**: [Custom Script Guide](docs/CUSTOM_SCRIPT_DEVELOPMENT.md)
4. **Advanced**: [Covenant Development](docs/ADVANCED_COVENANT_DEVELOPMENT.md)
5. **Deploy**: [Production Guidelines](docs/ADVANCED_COVENANT_DEVELOPMENT.md#production-guidelines)

---

## 📄 **License**

This project is licensed under the MIT License - see the [LICENSE](LICENSE) file for details.

## 🤝 **Contributing**

We welcome contributions to SmartLedger-BSV! Please see our [Contributing Guide](CONTRIBUTING.md) for details.

## 🏢 **Enterprise Support**

- **GitHub**: [github.com/codenlighten/smartledger-bsv](https://github.com/codenlighten/smartledger-bsv)
- **NPM**: [@smartledger/bsv](https://www.npmjs.com/package/@smartledger/bsv)
- **Issues**: [GitHub Issues](https://github.com/codenlighten/smartledger-bsv/issues)
- **Documentation**: [Complete Docs](#complete-documentation)

---

**SmartLedger-BSV v3.2.1** - *Complete Bitcoin SV Development Framework*

Built with ❤️ for the Bitcoin SV ecosystem • 9 Loading Options • Enterprise Ready
