# Migration from bsv@1.5.6

**Seamless upgrade path with zero breaking changes**

SmartLedger-BSV is designed as a **100% backward-compatible** drop-in replacement for bsv@1.5.6. Your existing code will work unchanged while gaining access to enhanced security and powerful new features.

## 🔄 **Instant Migration (30 seconds)**

### **Step 1: Update your package.json**
```bash
# Remove old bsv library
npm uninstall bsv

# Install SmartLedger-BSV
npm install @smartledger/bsv
```

### **Step 2: Update imports (only change needed)**
```javascript
// OLD - bsv@1.5.6
const bsv = require('bsv');

// NEW - SmartLedger-BSV (same API!)
const bsv = require('@smartledger/bsv');
```

### **Step 3: That's it! 🎉**
All your existing code continues to work exactly as before.

## ✅ **Compatibility Verification**

### **Core API - 100% Compatible**
```javascript
// All these work exactly the same in SmartLedger-BSV
const privateKey = new bsv.PrivateKey();
const publicKey = privateKey.toPublicKey();
const address = privateKey.toAddress();

const transaction = new bsv.Transaction()
  .from(utxo)
  .to(address, amount)
  .feePerKb(1000)
  .change(changeAddress)
  .sign(privateKey);

const script = bsv.Script.buildPublicKeyHashOut(address);
const signature = bsv.Transaction.sighash.sign(transaction, privateKey, sighashType, inputIndex, subscript);
```

### **Networks & Configuration - Unchanged**
```javascript
// Network configuration remains identical
bsv.Networks.mainnet;
bsv.Networks.testnet;
bsv.Networks.livenet === bsv.Networks.mainnet; // true

// All utility functions work the same
bsv.util.buffer.isBuffer(someBuffer);
bsv.crypto.Hash.sha256(buffer);
bsv.encoding.Base58.encode(buffer);
```

### **HD Wallets - Fully Compatible**
```javascript
// HD wallet functionality unchanged
const hdPrivateKey = new bsv.HDPrivateKey();
const hdPublicKey = hdPrivateKey.hdPublicKey;
const derivedKey = hdPrivateKey.derive("m/44'/0'/0'/0/0");

const mnemonic = new bsv.Mnemonic();
const hdKey = bsv.HDPrivateKey.fromSeed(mnemonic.toSeed());
```

## 🚀 **What You Gain (No Code Changes Required)**

### **Enhanced Security**
```javascript
// Same API, enhanced security under the hood
const privateKey = new bsv.PrivateKey();  // Now with hardened elliptic curves
const signature = privateKey.sign(hash);   // Enhanced cryptographic operations
```

### **Improved Performance**  
- ✅ **Optimized operations** - Faster transaction creation and signing
- ✅ **Better memory usage** - Reduced memory footprint
- ✅ **Enhanced validation** - More comprehensive error checking

### **Additional Formats**
```javascript
// All original formats plus new options
const tx = new bsv.Transaction()
  .from(utxo)
  .to(address, amount)
  .feePerKb(10);  // Now supports ultra-low fees (0.01 sats/byte)
```

## 🆕 **Optional New Features**

Once migrated, you can optionally use new SmartLedger-BSV features:

### **Smart Contract Framework**
```javascript
// NEW: Optional smart contract capabilities
const generator = new bsv.SmartContract.UTXOGenerator();
const utxos = generator.createRealUTXOs(3, 100000);

const preimage = new bsv.SmartContract.Preimage(transaction, inputIndex);
const covenant = bsv.SmartContract.createCovenantBuilder()
  .extractField('amount')
  .push(50000)
  .greaterThanOrEqual()
  .build();
```

### **Legal Token Protocol**
```javascript
// NEW: Optional legal compliance features
const propertyToken = bsv.createPropertyToken({
  propertyType: 'real_estate',
  jurisdiction: 'us_delaware'
});

const obligation = bsv.createObligationToken({
  obligationType: 'payment',
  amount: 100000
});
```

### **Digital Identity**
```javascript
// NEW: Optional W3C identity features  
const did = bsv.createDID(publicKey);
const credential = bsv.createEmailCredential(
  issuerDID, subjectDID, 'user@example.com', signingKey
);
```

### **Advanced Cryptography**
```javascript
// NEW: Optional threshold cryptography
const shares = bsv.splitSecret('my_private_key', 5, 3);
const recovered = bsv.reconstructSecret([shares[0], shares[2], shares[4]]);
```

## 📦 **Modular Loading (Browser)**

### **Original Loading (Still Works)**
```html
<!-- Your existing CDN links continue to work -->
<script src="https://unpkg.com/bsv@1.5.6/bsv.min.js"></script>
```

### **New Modular Options** 
```html
<!-- Core compatibility (same size as bsv@1.5.6) -->
<script src="https://unpkg.com/@smartledger/bsv@3.3.4/bsv.min.js"></script>

<!-- Add smart contracts when ready -->
<script src="https://unpkg.com/@smartledger/bsv@3.3.4/bsv-smartcontract.min.js"></script>

<!-- Add advanced features as needed -->
<script src="https://unpkg.com/@smartledger/bsv@3.3.4/bsv-ltp.min.js"></script>
<script src="https://unpkg.com/@smartledger/bsv@3.3.4/bsv-gdaf.min.js"></script>

<!-- Everything in one file -->
<script src="https://unpkg.com/@smartledger/bsv@3.3.4/bsv.bundle.js"></script>
```

## 🔍 **Testing Your Migration**

### **Automated Testing**
```javascript
// Run your existing test suite - it should pass unchanged
describe('Migration Verification', () => {
  it('should maintain bsv@1.5.6 compatibility', () => {
    const privateKey = new bsv.PrivateKey();
    const address = privateKey.toAddress();
    
    expect(address.toString()).toMatch(/^1[A-HJ-NP-Z0-9a-km-z]{25,34}$/);
    expect(privateKey.toString()).toMatch(/^[5KL][1-9A-HJ-NP-Z0-9a-km-z]{50,51}$/);
  });
  
  it('should create valid transactions', () => {
    const tx = new bsv.Transaction()
      .from(mockUTXO)
      .to(mockAddress, 50000)
      .sign(mockPrivateKey);
      
    expect(tx.isFullySigned()).toBe(true);
    expect(tx.getFee()).toBeGreaterThan(0);
  });
});
```

### **Manual Verification**
```javascript
// Verify core functionality works as expected
console.log('Testing SmartLedger-BSV compatibility...');

const privateKey = new bsv.PrivateKey();
console.log('✅ Private key generation:', privateKey.toString());

const address = privateKey.toAddress();
console.log('✅ Address generation:', address.toString());

const publicKey = privateKey.toPublicKey();
console.log('✅ Public key derivation:', publicKey.toString());

console.log('🎉 Migration successful!');
```

## 📊 **Side-by-Side Comparison**

| Feature | bsv@1.5.6 | SmartLedger-BSV |
|---------|-----------|-----------------|
| **Core API** | ✅ Full | ✅ **Same + Enhanced** |
| **Transaction Creation** | ✅ Yes | ✅ **Same + Optimized** |  
| **HD Wallets** | ✅ Yes | ✅ **Same + Improved** |
| **Script Operations** | ✅ Basic | ✅ **Same + Extended** |
| **Security** | ⚠️ Standard | ✅ **Hardened** |
| **Smart Contracts** | ❌ No | ✅ **Complete Framework** |
| **Legal Tokens** | ❌ No | ✅ **Built-in** |
| **Digital Identity** | ❌ No | ✅ **W3C Standard** |
| **Modular Loading** | ❌ No | ✅ **12 Options** |

## 🛟 **Rollback Plan (If Needed)**

If you need to rollback for any reason:

```bash
# Uninstall SmartLedger-BSV
npm uninstall @smartledger/bsv

# Reinstall original bsv
npm install bsv@1.5.6

# Revert import changes
# Change: const bsv = require('@smartledger/bsv');
# Back to: const bsv = require('bsv');
```

## 🎯 **Next Steps After Migration**

1. **✅ Verify** - Run your existing tests to confirm compatibility
2. **🚀 Explore** - Check out [Smart Contract Guide](../SMART_CONTRACT_GUIDE.md)
3. **⚖️ Legal** - Learn about [Legal Token Protocol](../advanced/LEGAL_TOKEN_PROTOCOL.md)
4. **🆔 Identity** - Implement [Digital Attestation](../advanced/DIGITAL_ATTESTATION.md)
5. **🔐 Security** - Use [Shamir Secret Sharing](../advanced/SHAMIR_SECRET_SHARING.md)

## 🤝 **Migration Support**

**Need help with migration?**
- **📚 Documentation**: [Complete Docs](../)
- **💬 Community**: [GitHub Discussions](https://github.com/codenlighten/smartledger-bsv/discussions)
- **🐛 Issues**: [GitHub Issues](https://github.com/codenlighten/smartledger-bsv/issues)
- **📧 Direct Support**: [hello@smartledger.technology](mailto:hello@smartledger.technology)

---

**Migration complete! Welcome to enhanced Bitcoin SV development! 🚀**