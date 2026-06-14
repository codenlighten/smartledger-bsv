# Quick Start Guide

**Get up and running with SmartLedger-BSV in under 2 minutes**

SmartLedger-BSV is a drop-in replacement for bsv@1.5.6 with enhanced security and additional features. If you're already using bsv@1.5.6, you can upgrade immediately with zero code changes.

## 🚀 **30-Second Installation**

### NPM (Recommended)
```bash
npm install @smartledger/bsv
```

### Browser CDN (Instant)
```html
<!-- Core library (937KB) -->
<script src="https://unpkg.com/@smartledger/bsv@5.0.1/bsv.min.js"></script>

<!-- Everything included (937KB) -->
<script src="https://unpkg.com/@smartledger/bsv@5.0.1/bsv.bundle.js"></script>
```

## 💰 **Your First Transaction (60 seconds)**

```javascript
const bsv = require('@smartledger/bsv'); // Node.js
// const bsv = window.bsv; // Browser

// 1. Generate keys
const privateKey = new bsv.PrivateKey();
const address = privateKey.toAddress();

console.log('Address:', address.toString());
console.log('Private Key:', privateKey.toString());

// 2. Create a transaction (with real UTXO)
const transaction = new bsv.Transaction()
  .from({
    txId: '6e30c9df8a4b2d8e4d8c8e5f1a2b3c4d5e6f7a8b9c0d1e2f3a4b5c6d7e8f9a0b',
    outputIndex: 0,
    address: address.toString(),
    script: bsv.Script.buildPublicKeyHashOut(address).toHex(),
    satoshis: 100000  // 1000 sats
  })
  .to('1A1zP1eP5QGefi2DMPTfTL5SLmv7DivfNa', 50000)  // Send 500 sats
  .feePerKb(1000)  // Ultra-low fee: ~0.01 sats/byte
  .change(address)  // Change back to sender
  .sign(privateKey);

console.log('Transaction:', transaction.toString());
```

## 🎯 **Choose Your Path**

### **New to Bitcoin SV?**
Start here for comprehensive Bitcoin SV development:
```javascript
// Basic wallet operations
const privateKey = new bsv.PrivateKey();
const publicKey = privateKey.toPublicKey();
const address = privateKey.toAddress();

// Create and sign transactions
const tx = new bsv.Transaction()
  .from(utxo)
  .to(destinationAddress, amount)
  .sign(privateKey);
```
➡️ **Next**: [Complete Installation Guide](INSTALLATION.md)

### **Migrating from bsv@1.5.6?**
SmartLedger-BSV is 100% backward compatible:
```javascript
// Your existing bsv@1.5.6 code works unchanged
const bsv = require('@smartledger/bsv'); // Only change the import

// All your existing code continues to work
const tx = new bsv.Transaction()
  .from(utxo)
  .to(address, amount)
  .sign(privateKey);
```
➡️ **Next**: [Migration Guide](../migration/FROM_BSV_1_5_6.md)

### **Want Advanced Features?**
Explore unique SmartLedger-BSV capabilities:
```javascript
// Legal Token Protocol - Property rights on-chain
const propertyToken = bsv.createPropertyToken({
  propertyType: 'real_estate',
  jurisdiction: 'us_delaware'
});

// Digital Identity - W3C standard DIDs
const did = bsv.createDID(publicKey);
const credential = bsv.createEmailCredential(issuerDID, did, 'user@example.com', signingKey);

// Shamir Secret Sharing - Threshold cryptography
const shares = bsv.splitSecret('my_private_key', 5, 3); // 5 shares, need 3
```
➡️ **Next**: [Advanced Features Guide](../advanced/)

### **Building Smart Contracts?**
Complete covenant development framework:
```javascript
// Generate test UTXOs
const generator = new bsv.SmartContract.UTXOGenerator();
const utxos = generator.createRealUTXOs(3, 100000);

// Build covenants with JavaScript
const covenant = bsv.SmartContract.createCovenantBuilder()
  .extractField('amount')
  .push(50000)
  .greaterThanOrEqual()
  .verify()
  .build();

// Parse BIP-143 preimages
const preimage = new bsv.SmartContract.Preimage(transaction, inputIndex);
const amount = preimage.getField('amount');
```
➡️ **Next**: [Smart Contract Guide](../SMART_CONTRACT_GUIDE.md)

## 📦 **Modular Loading Options**

SmartLedger-BSV offers 12 different loading options - use only what you need:

```html
<!-- Core BSV only (937KB) -->
<script src="https://unpkg.com/@smartledger/bsv@5.0.1/bsv.min.js"></script>

<!-- Smart contracts (937KB) -->
<script src="https://unpkg.com/@smartledger/bsv@5.0.1/bsv-smartcontract.min.js"></script>

<!-- Legal tokens (1.16MB) -->
<script src="https://unpkg.com/@smartledger/bsv@5.0.1/bsv-ltp.min.js"></script>

<!-- Digital identity (1.16MB) -->
<script src="https://unpkg.com/@smartledger/bsv@5.0.1/bsv-gdaf.min.js"></script>

<!-- Everything (937KB) -->
<script src="https://unpkg.com/@smartledger/bsv@5.0.1/bsv.bundle.js"></script>
```

## ⚡ **Key Advantages**

### **Security helpers (opt-in)**
- ✅ **`bsv.SmartVerify` / `bsv.EllipticFixed`** - hardened verify with strict input validation and low-`s` canonicalization. Call explicitly; the default `signature.verify()` does **not** route through them. See [README › Security](../../README.md#-security).
- ✅ **Pinned dependencies** - `elliptic@6.6.1` (upstream-patched), `bn.js@4.11.9`, `bs58@4.0.1`
- ✅ **Comprehensive validation** - Built-in error checking and 534+ mocha tests

### **Developer Experience**  
- ✅ **Zero breaking changes** - Drop-in replacement for bsv@1.5.6
- ✅ **Extensive documentation** - Complete guides and examples
- ✅ **TypeScript support** - Full type definitions included

### **Modern Features**
- ✅ **Legal compliance** - Built-in regulatory token support
- ✅ **Digital identity** - W3C standard implementation  
- ✅ **Enterprise security** - Shamir secret sharing and more

## 🎓 **Next Steps**

1. **📖 Learn More**: [Complete Installation Guide](INSTALLATION.md)
2. **🔄 Migration**: [Upgrade from bsv@1.5.6](../migration/FROM_BSV_1_5_6.md) 
3. **💡 Examples**: [Working Code Examples](../../examples/)
4. **🚀 Advanced**: [Smart Contract Development](../SMART_CONTRACT_GUIDE.md)
5. **🆔 Identity**: [Digital Attestation](../advanced/DIGITAL_ATTESTATION.md)
6. **⚖️ Legal**: [Legal Token Protocol](../advanced/LEGAL_TOKEN_PROTOCOL.md)

## 🤝 **Getting Help**

- **📚 Documentation**: [Complete Docs](../)
- **💬 Community**: [GitHub Discussions](https://github.com/codenlighten/smartledger-bsv/discussions)
- **🐛 Issues**: [GitHub Issues](https://github.com/codenlighten/smartledger-bsv/issues)
- **📧 Support**: [hello@smartledger.technology](mailto:hello@smartledger.technology)

---

**Welcome to the future of Bitcoin SV development! 🎉**