# SmartLedger-BSV Documentation

Comprehensive documentation for SmartLedger-BSV v3.1.1+ - Advanced Bitcoin SV Library with Enterprise Covenant Framework.

## 📚 Documentation Structure

### Core Guides
- **[Getting Started](getting-started.md)** - Installation, setup, and first steps
- **[API Reference](api-reference.md)** - Complete API documentation
- **[Configuration Guide](configuration.md)** - Setup and optimization

### Advanced Features
- **[Advanced Covenant Development](ADVANCED_COVENANT_DEVELOPMENT.md)** - BIP143 + nChain PUSHTX techniques
- **[Custom Script Development](CUSTOM_SCRIPT_DEVELOPMENT.md)** - Script creation patterns
- **[Covenant Development Resolved](COVENANT_DEVELOPMENT_RESOLVED.md)** - Problem solutions and working examples

### Technical Specifications
- **[BIP143 Preimage Format](preimage.md)** - Detailed preimage structure specification
- **[nChain PUSHTX Paper](nchain.md)** - Academic research integration (WP1605)
- **[Security Best Practices](security-best-practices.md)** - Production guidelines

## 🎯 Quick Navigation

### New to SmartLedger-BSV?
1. **[Getting Started](getting-started.md)** - Begin here for installation and basic usage
2. **[Examples Directory](../examples/)** - Hands-on code examples
3. **[Basic Usage](#basic-usage)** - Common patterns and workflows

### Building Custom Scripts?
1. **[Custom Script Development](CUSTOM_SCRIPT_DEVELOPMENT.md)** - Complete guide to script creation
2. **[Script Examples](../examples/scripts/)** - Working code examples
3. **[API Reference](api-reference.md)** - CustomScriptHelper documentation

### Developing Covenants?
1. **[Advanced Covenant Development](ADVANCED_COVENANT_DEVELOPMENT.md)** - Complete covenant framework
2. **[Covenant Examples](../examples/covenants/)** - Working covenant patterns  
3. **[BIP143 Specification](preimage.md)** - Preimage structure details
4. **[nChain PUSHTX](nchain.md)** - Academic research foundation

### Production Deployment?
1. **[Security Best Practices](security-best-practices.md)** - Production guidelines
2. **[Configuration Guide](configuration.md)** - Optimization and setup
3. **[API Reference](api-reference.md)** - Complete API documentation

## 🚀 Key Features Overview

### Core Library Capabilities
- **Complete BSV API**: Full compatibility with Bitcoin SV operations
- **Ultra-Low Fees**: 0.01 sats/byte configuration (91% fee reduction)  
- **UTXO Management**: Advanced state management with change outputs
- **CDN Distribution**: Multiple webpack bundles for web development
- **Security Hardened**: Enhanced elliptic curve security fixes

### Advanced Covenant Framework
- **BIP143 Compliant**: Complete preimage parsing with field-by-field access
- **PUSHTX Integration**: nChain WP1605 in-script signature generation
- **PELS Support**: Perpetually Enforcing Locking Scripts for ongoing rules
- **Dual-Level API**: High-level abstractions with granular BSV control
- **Production Ready**: Comprehensive validation and error handling

### Custom Script Development
- **Multi-signature Scripts**: Advanced m-of-n signature schemes
- **Timelock Contracts**: Block height and timestamp constraints
- **Conditional Logic**: Complex branching and validation rules
- **Template System**: Pre-built patterns for common use cases
- **Developer API**: Simplified interface for rapid development

## 📖 Documentation Categories

### 📦 Installation & Setup
```javascript
// NPM installation
npm install @smartledger/bsv

// Basic usage
const bsv = require('@smartledger/bsv');
const tx = new bsv.Transaction()
  .from(utxo)
  .to(address, amount)
  .feePerKb(10); // Ultra-low fees
```

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