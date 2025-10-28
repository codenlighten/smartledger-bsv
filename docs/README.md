# SmartLedger-BSV Documentation

**The Standard Bitcoin SV Library - Enhanced, Hardened, and Extended**

SmartLedger-BSV is a fully backward-compatible extension of bsv@1.5.6 with elliptic curve hardening and comprehensive additional modules for modern Bitcoin SV development.

## 🎯 **What Makes SmartLedger-BSV the Standard**

- **✅ 100% Backward Compatible** with bsv@1.5.6 - Drop-in replacement
- **🛡️ Security Hardened** - Enhanced elliptic curve implementations  
- **📦 12 Modular Loading Options** - Use only what you need
- **⚖️ Legal Compliance Ready** - Built-in Legal Token Protocol (LTP)
- **🌐 Digital Identity Native** - W3C standard DIDs and Verifiable Credentials
- **🔐 Enterprise Security** - Shamir Secret Sharing and advanced cryptography
- **🔒 Smart Contract Framework** - Complete covenant development toolkit
- **📚 Production Ready** - Comprehensive documentation and examples

## 📚 **Documentation Structure**

### 🚀 **Getting Started**
Perfect for developers new to Bitcoin SV or migrating from other libraries.

- [**Quick Start Guide**](getting-started/QUICK_START.md) - Get running in 2 minutes
- [**Installation & Setup**](getting-started/INSTALLATION.md) - All installation methods
- [**Migration from bsv@1.5.6**](migration/FROM_BSV_1_5_6.md) - Seamless upgrade path
- [**Migration from BitcoinJS**](migration/FROM_BITCOINJS.md) - Switch from BitcoinJS-lib
- [**First Transaction**](getting-started/FIRST_TRANSACTION.md) - Hello World example

### 📖 **Core API Guides** 
Complete guides for standard Bitcoin SV operations.

- [**Transactions**](api/TRANSACTIONS.md) - Create, sign, and broadcast transactions
- [**Addresses & Keys**](api/ADDRESSES_KEYS.md) - Generate and manage Bitcoin addresses
- [**Scripts**](api/SCRIPTS.md) - Bitcoin Script creation and execution
- [**Networks**](api/NETWORKS.md) - Mainnet, testnet, and custom networks
- [**ECIES Encryption**](api/ECIES.md) - Elliptic Curve encryption/decryption
- [**Message Signing**](api/MESSAGE_SIGNING.md) - Sign and verify messages
- [**HD Wallets**](api/HD_WALLETS.md) - Hierarchical Deterministic wallets

### � **Advanced Features**
Unique capabilities that set SmartLedger-BSV apart.

- [**Legal Token Protocol (LTP)**](advanced/LEGAL_TOKEN_PROTOCOL.md) - Property rights & obligations
- [**Global Digital Attestation (GDAF)**](advanced/DIGITAL_ATTESTATION.md) - DIDs & credentials
- [**Shamir Secret Sharing**](advanced/SHAMIR_SECRET_SHARING.md) - Threshold cryptography
- [**Smart Contract Framework**](advanced/SMART_CONTRACT_GUIDE.md) - Complete covenant development
- [**UTXO Management**](advanced/UTXO_MANAGER_GUIDE.md) - Advanced UTXO operations
- [**Custom Script Development**](advanced/CUSTOM_SCRIPT_DEVELOPMENT.md) - Build custom Bitcoin scripts

### 🎓 **Developer Guides**
Step-by-step tutorials for common development patterns.

- [**Building a Wallet**](guides/BUILDING_WALLET.md) - Complete wallet implementation
- [**Payment Processing**](guides/PAYMENT_PROCESSING.md) - Accept Bitcoin payments
- [**Multi-signature Transactions**](guides/MULTISIG_TRANSACTIONS.md) - Multi-party security
- [**Atomic Swaps**](guides/ATOMIC_SWAPS.md) - Trustless exchanges
- [**Micropayment Channels**](guides/MICROPAYMENT_CHANNELS.md) - Payment channels
- [**Data Storage on BSV**](guides/DATA_STORAGE.md) - Store data on-chain

### 🔬 **Advanced Development**
Production-ready patterns and advanced use cases.

- [**Covenant Development**](advanced/ADVANCED_COVENANT_DEVELOPMENT.md) - Production covenant patterns
- [**Smart Contract Security**](advanced/SMART_CONTRACT_SECURITY.md) - Security best practices  
- [**Performance Optimization**](advanced/PERFORMANCE_OPTIMIZATION.md) - Scale your applications
- [**Testing Strategies**](advanced/TESTING_STRATEGIES.md) - Comprehensive testing
- [**Production Deployment**](advanced/PRODUCTION_DEPLOYMENT.md) - Deploy with confidence

### 📋 **Examples & Templates**
Ready-to-use code examples and project templates.

- [**Basic Examples**](../examples/basic/) - Simple transaction examples
- [**Smart Contract Examples**](../examples/covenants/) - Covenant patterns
- [**Advanced Examples**](../examples/covenants2/) - Production patterns
- [**Project Templates**](examples/TEMPLATES.md) - Starter projects

### 🔧 **Troubleshooting & Support**
Solutions to common issues and getting help.

- [**Common Issues**](troubleshooting/COMMON_ISSUES.md) - Frequently encountered problems
- [**Error Reference**](troubleshooting/ERROR_REFERENCE.md) - Complete error guide
- [**Performance Issues**](troubleshooting/PERFORMANCE_ISSUES.md) - Optimization tips
- [**Browser Compatibility**](troubleshooting/BROWSER_COMPATIBILITY.md) - Cross-browser support
- [**Getting Support**](troubleshooting/GETTING_SUPPORT.md) - Community and help

## 🔗 **Quick Navigation**

**I want to...**
- **Get started quickly** → [Quick Start Guide](getting-started/QUICK_START.md)
- **Migrate from bsv@1.5.6** → [Migration Guide](migration/FROM_BSV_1_5_6.md)  
- **Learn smart contracts** → [Smart Contract Guide](advanced/SMART_CONTRACT_GUIDE.md)
- **Use legal tokens** → [Legal Token Protocol](advanced/LEGAL_TOKEN_PROTOCOL.md)
- **Implement digital identity** → [Digital Attestation Guide](advanced/DIGITAL_ATTESTATION.md)
- **Build a production app** → [Advanced Development](advanced/)
- **See working examples** → [Examples Directory](../examples/)
- **Get help** → [Troubleshooting](troubleshooting/)

## � **Library Comparison**

| Feature | SmartLedger-BSV | bsv@1.5.6 | BitcoinJS-lib |
|---------|-----------------|-----------|---------------|
| **Core BSV Support** | ✅ Full | ✅ Full | ❌ Bitcoin only |
| **Backward Compatibility** | ✅ 100% | - | ❌ Different API |
| **Security Hardening** | ✅ Yes | ❌ No | ❌ No |
| **Legal Tokens** | ✅ Built-in | ❌ No | ❌ No |
| **Digital Identity** | ✅ W3C Standard | ❌ No | ❌ No |
| **Smart Contracts** | ✅ Complete Framework | ❌ Basic | ❌ No |
| **Modular Loading** | ✅ 12 Options | ❌ Monolithic | ❌ Monolithic |
| **Production Ready** | ✅ Yes | ⚠️ Limited | ⚠️ Bitcoin only |

### 🔒 Covenant Development
```javascript
// Advanced covenant creation
const { CovenantInterface } = require('@smartledger/bsv/lib/covenant-interface');
const covenant = new CovenantInterface();

// PUSHTX covenant with nChain techniques
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

### 🛠️ Custom Scripts
```javascript
// Custom script development
const { CustomScriptHelper } = require('@smartledger/bsv/lib/custom-script-helper');
const helper = new CustomScriptHelper();

// Multi-signature script
const multisig = helper.createMultisigScript([pk1, pk2, pk3], 2);

// Timelock script  
const timelock = helper.createTimelockScript(publicKey, 750000, 'block');
```

### 📊 BIP143 Preimage Analysis
```javascript
// Enhanced preimage parsing
const { CovenantPreimage } = require('@smartledger/bsv/lib/covenant-interface');
const preimage = new CovenantPreimage(preimageHex);

console.log('Version:', preimage.nVersionValue);    // uint32 accessor
console.log('Amount:', preimage.amountValue);       // BigInt accessor
console.log('Valid:', preimage.isValid);            // Structure validation
```

## 🔧 Technical Specifications

### BIP143 Preimage Structure (108+ bytes)
```
Field 1:  nVersion        (4 bytes, little-endian)
Field 2:  hashPrevouts    (32 bytes) - double SHA256 of input outpoints
Field 3:  hashSequence    (32 bytes) - double SHA256 of input sequences  
Field 4:  outpoint        (36 bytes) - prevTxId + outputIndex
Field 5:  scriptCode      (variable) - with varint length encoding
Field 6:  amount          (8 bytes, little-endian) - UTXO value
Field 7:  nSequence       (4 bytes, little-endian)
Field 8:  hashOutputs     (32 bytes) - double SHA256 of all outputs
Field 9:  nLockTime       (4 bytes, little-endian)
Field 10: sighashType     (4 bytes, little-endian)
```

### nChain PUSHTX Techniques (WP1605)
- **In-script signature generation**: `s = z + Gx mod n`
- **Generator optimization**: k=a=1 for efficiency
- **DER canonicalization**: s ≤ n/2 prevents malleability
- **Message construction**: BIP143 preimage building
- **Security proof**: Computationally infeasible to forge

## 🔐 Security Considerations

### Critical Security Features
- **Parameter Fixing**: Public key, ephemeral key, sighash flag must be fixed
- **DER Canonicalization**: Prevents transaction malleability
- **Preimage Validation**: Complete BIP143 structure verification
- **Error Handling**: Comprehensive validation and reporting

### Production Guidelines
- Parameter validation before script creation
- Comprehensive error handling and fallbacks
- Security audit documentation for covenant logic
- Testing requirements for mainnet deployment

## 📈 Performance Optimization

### Script Optimization Techniques
- **Alt stack usage**: Store constants for reuse
- **Endianness optimization**: Minimize reversal operations
- **Preimage caching**: Avoid recomputation
- **k=a=1 optimization**: Simplifies PUSHTX signature generation

### Transaction Size Optimization
- Optimized PUSHTX scripts: ~1KB for PELS implementation
- CDN bundles: Multiple sizes for different use cases
- Fee optimization: 91% reduction with 0.01 sats/byte

## 🤝 Contributing to Documentation

To improve this documentation:

1. Follow the existing structure and formatting
2. Include working code examples with explanations
3. Add cross-references to related sections
4. Provide both simple and advanced examples
5. Include security considerations for all patterns

## 🔗 External Resources

### Official References
- **[Bitcoin SV Documentation](https://bitcoinsv.com/)**
- **[BIP143 Specification](https://github.com/bitcoin/bips/blob/master/bip-0143.mediawiki)**
- **[nChain Research Papers](https://nchain.com/research/)**

### Community Resources
- **[SmartLedger-BSV GitHub](https://github.com/codenlighten/smartledger-bsv)**
- **[NPM Package](https://www.npmjs.com/package/@smartledger/bsv)**
- **[Examples Repository](../examples/)**

---

*Documentation for SmartLedger-BSV v3.1.1+ - Built for enterprise Bitcoin SV development*