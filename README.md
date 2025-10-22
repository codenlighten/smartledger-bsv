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

## � **Quick Start Examples**

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
- ✅ **Complete BSV API**: Full Bitcoin SV blockchain operations
- ✅ **SmartContract Framework**: 59+ methods for script development and debugging
- ✅ **Security Hardened**: SmartLedger elliptic curve fixes and enhanced validation
- ✅ **Browser + Node.js**: Universal compatibility with proper polyfills
- ✅ **TypeScript Ready**: Complete type definitions included

### Advanced Development Tools
- � **Covenant Interface**: High-level covenant development framework
- � **Custom Script Helper**: Simplified API for script creation and signing  
- 🔒 **Debug Tools**: Script interpreter, stack examiner, metrics, and optimizer
- 🔒 **BIP143 Compliant**: Complete preimage parsing and manipulation
- 🔒 **PUSHTX Integration**: nChain techniques for advanced covenant patterns

### Flexible Architecture
- 📦 **Modular Loading**: Load only what you need
- 📦 **Standalone Modules**: Independent security and utility modules
- 📦 **Complete Bundle**: Everything in one file for convenience
- 📦 **CDN Ready**: All modules available via unpkg and jsDelivr
- 📦 **Webpack Optimized**: Tree-shakeable and build-tool friendly

## ⚡ **Installation & Usage**

### NPM Installation
```bash
# Main package
npm install @smartledger/bsv

# Alternative package name (legacy)
npm install smartledger-bsv
```

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
