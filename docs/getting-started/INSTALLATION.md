# Installation & Setup

**Complete installation guide for all environments and use cases**

SmartLedger-BSV offers multiple installation methods to suit different development environments and project requirements.

## 📦 **NPM Installation (Recommended)**

### **Standard Installation**
```bash
# Install latest version
npm install @smartledger/bsv

# Install specific version
npm install @smartledger/bsv@3.3.3

# Install with exact version lock
npm install --save-exact @smartledger/bsv@3.3.3
```

### **Usage in Node.js**
```javascript
// ES6 modules
import bsv from '@smartledger/bsv';

// CommonJS
const bsv = require('@smartledger/bsv');

// Specific modules only
const { PrivateKey, Transaction } = require('@smartledger/bsv');
```

### **TypeScript Support**
SmartLedger-BSV includes complete TypeScript definitions:

```typescript
import { PrivateKey, Transaction, Address } from '@smartledger/bsv';

const privateKey: PrivateKey = new PrivateKey();
const address: Address = privateKey.toAddress();
const tx: Transaction = new Transaction();
```

## 🌐 **Browser Installation**

### **CDN Links (Instant Setup)**

#### **Core Library Only (449KB)**
For basic Bitcoin SV operations:
```html
<script src="https://unpkg.com/@smartledger/bsv@3.3.3/bsv.min.js"></script>
<script>
  const privateKey = new bsv.PrivateKey();
  const address = privateKey.toAddress();
</script>
```

#### **Complete Bundle (885KB)**  
Everything in one file:
```html
<script src="https://unpkg.com/@smartledger/bsv@3.3.3/bsv.bundle.js"></script>
<script>
  // All features available immediately
  const shares = bsv.splitSecret('secret', 5, 3);
  const did = bsv.createDID(publicKey);
  const propertyToken = bsv.createPropertyToken({...});
</script>
```

### **Modular Loading (Choose What You Need)**

#### **Smart Contract Development (932KB total)**
```html
<script src="https://unpkg.com/@smartledger/bsv@3.3.3/bsv.min.js"></script>
<script src="https://unpkg.com/@smartledger/bsv@3.3.3/bsv-covenant.min.js"></script>
<script src="https://unpkg.com/@smartledger/bsv@3.3.3/bsv-smartcontract.min.js"></script>
<script>
  const covenant = bsv.SmartContract.createCovenantBuilder()
    .extractField('amount').push(50000).greaterThanOrEqual().build();
</script>
```

#### **Legal & Identity Development (1.87MB total)**
```html
<script src="https://unpkg.com/@smartledger/bsv@3.3.3/bsv.min.js"></script>
<script src="https://unpkg.com/@smartledger/bsv@3.3.3/bsv-ltp.min.js"></script>
<script src="https://unpkg.com/@smartledger/bsv@3.3.3/bsv-gdaf.min.js"></script>
<script>
  // Legal Token Protocol
  const propertyToken = bsv.createPropertyToken({
    propertyType: 'real_estate', jurisdiction: 'us_delaware'
  });
  
  // Digital Identity
  const credential = bsv.createEmailCredential(issuerDID, subjectDID, 'user@example.com', key);
</script>
```

#### **Security & Cryptography (1.17MB total)**
```html
<script src="https://unpkg.com/@smartledger/bsv@3.3.3/bsv.min.js"></script>
<script src="https://unpkg.com/@smartledger/bsv@3.3.3/bsv-security.min.js"></script>
<script src="https://unpkg.com/@smartledger/bsv@3.3.3/bsv-shamir.min.js"></script>
<script>
  // Threshold Cryptography
  const shares = bsv.splitSecret('my_secret_key', 5, 3);
  
  // Enhanced Security
  const verified = bsvSecurity.SmartVerify.verify(signature, hash, publicKey);
</script>
```

### **Complete Module Reference**

| Module | Size | Purpose | CDN Link |
|--------|------|---------|----------|
| **bsv.min.js** | 449KB | Core BSV + SmartContract | `unpkg.com/@smartledger/bsv@3.3.3/bsv.min.js` |
| **bsv.bundle.js** | 885KB | Everything in one file | `unpkg.com/@smartledger/bsv@3.3.3/bsv.bundle.js` |
| **bsv-smartcontract.min.js** | 451KB | Complete covenant framework | `unpkg.com/@smartledger/bsv@3.3.3/bsv-smartcontract.min.js` |
| **bsv-ltp.min.js** | 817KB | **Legal Token Protocol** | `unpkg.com/@smartledger/bsv@3.3.3/bsv-ltp.min.js` |
| **bsv-gdaf.min.js** | 604KB | **Digital Identity & Attestation** | `unpkg.com/@smartledger/bsv@3.3.3/bsv-gdaf.min.js` |
| **bsv-shamir.min.js** | 433KB | **Threshold Cryptography** | `unpkg.com/@smartledger/bsv@3.3.3/bsv-shamir.min.js` |
| **bsv-security.min.js** | 290KB | Security enhancements | `unpkg.com/@smartledger/bsv@3.3.3/bsv-security.min.js` |
| **bsv-mnemonic.min.js** | 670KB | HD wallets | `unpkg.com/@smartledger/bsv@3.3.3/bsv-mnemonic.min.js` |
| **bsv-ecies.min.js** | 71KB | Encryption | `unpkg.com/@smartledger/bsv@3.3.3/bsv-ecies.min.js` |
| **bsv-covenant.min.js** | 32KB | Covenant operations | `unpkg.com/@smartledger/bsv@3.3.3/bsv-covenant.min.js` |
| **bsv-script-helper.min.js** | 27KB | Custom script tools | `unpkg.com/@smartledger/bsv@3.3.3/bsv-script-helper.min.js` |
| **bsv-message.min.js** | 26KB | Message signing | `unpkg.com/@smartledger/bsv@3.3.3/bsv-message.min.js` |

## ⚙️ **Development Environment Setup**

### **VS Code Setup**
```json
// .vscode/settings.json
{
  "typescript.preferences.includePackageJsonAutoImports": "on",
  "npm.packageManager": "npm",
  "eslint.workingDirectories": ["."],
  "typescript.suggest.autoImports": true
}
```

### **ESLint Configuration**
```json
// .eslintrc.json
{
  "extends": ["eslint:recommended"],
  "env": {
    "node": true,
    "browser": true,
    "es2021": true
  },
  "globals": {
    "bsv": "readonly"
  }
}
```

### **Webpack Configuration**
```javascript
// webpack.config.js
module.exports = {
  externals: {
    '@smartledger/bsv': 'bsv'
  },
  resolve: {
    fallback: {
      "crypto": require.resolve("crypto-browserify"),
      "stream": require.resolve("stream-browserify"),
      "buffer": require.resolve("buffer")
    }
  }
};
```

## 🔧 **Project Templates**

### **Basic Node.js Project**
```bash
mkdir my-bsv-project
cd my-bsv-project
npm init -y
npm install @smartledger/bsv
```

```javascript
// index.js
const bsv = require('@smartledger/bsv');

const privateKey = new bsv.PrivateKey();
console.log('Address:', privateKey.toAddress().toString());
```

### **Express.js API Server**
```bash
npm install express @smartledger/bsv
```

```javascript
// server.js
const express = require('express');
const bsv = require('@smartledger/bsv');

const app = express();
app.use(express.json());

app.post('/create-address', (req, res) => {
  const privateKey = new bsv.PrivateKey();
  res.json({
    address: privateKey.toAddress().toString(),
    privateKey: privateKey.toString()
  });
});

app.listen(3000, () => {
  console.log('BSV API server running on port 3000');
});
```

### **React App Integration**
```bash
npx create-react-app my-bsv-app
cd my-bsv-app
npm install @smartledger/bsv
```

```javascript
// src/App.js
import { useEffect, useState } from 'react';

// For React, use dynamic import to avoid SSR issues
function App() {
  const [bsv, setBsv] = useState(null);
  const [address, setAddress] = useState('');

  useEffect(() => {
    import('@smartledger/bsv').then(bsvModule => {
      setBsv(bsvModule);
    });
  }, []);

  const generateAddress = () => {
    if (bsv) {
      const privateKey = new bsv.PrivateKey();
      setAddress(privateKey.toAddress().toString());
    }
  };

  return (
    <div>
      <button onClick={generateAddress}>Generate Address</button>
      <p>Address: {address}</p>
    </div>
  );
}
```

## 🧪 **Testing Setup**

### **Jest Configuration**
```json
// package.json
{
  "scripts": {
    "test": "jest"
  },
  "jest": {
    "testEnvironment": "node",
    "setupFilesAfterEnv": ["<rootDir>/test/setup.js"]
  }
}
```

```javascript
// test/setup.js
global.bsv = require('@smartledger/bsv');

// Test/development configuration
process.env.BSV_NETWORK = 'testnet';
```

### **Basic Test Example**
```javascript
// test/bsv.test.js
const bsv = require('@smartledger/bsv');

describe('SmartLedger-BSV', () => {
  test('generates valid private keys', () => {
    const privateKey = new bsv.PrivateKey();
    expect(privateKey.isValid()).toBe(true);
    expect(privateKey.toString()).toMatch(/^[5KL][1-9A-HJ-NP-Z0-9a-km-z]{50,51}$/);
  });

  test('creates valid addresses', () => {
    const privateKey = new bsv.PrivateKey();
    const address = privateKey.toAddress();
    expect(address.toString()).toMatch(/^1[A-HJ-NP-Z0-9a-km-z]{25,34}$/);
  });

  test('builds valid transactions', () => {
    const privateKey = new bsv.PrivateKey();
    const address = privateKey.toAddress();
    
    const utxo = {
      txId: '6e30c9df8a4b2d8e4d8c8e5f1a2b3c4d5e6f7a8b9c0d1e2f3a4b5c6d7e8f9a0b',
      outputIndex: 0,
      address: address.toString(),
      script: bsv.Script.buildPublicKeyHashOut(address).toHex(),
      satoshis: 100000
    };

    const tx = new bsv.Transaction()
      .from(utxo)
      .to('1A1zP1eP5QGefi2DMPTfTL5SLmv7DivfNa', 50000)
      .change(address)
      .sign(privateKey);

    expect(tx.isFullySigned()).toBe(true);
  });
});
```

## 🚨 **Troubleshooting**

### **Common Installation Issues**

#### **Node.js Version Compatibility**
SmartLedger-BSV requires Node.js 14+ for optimal performance:
```bash
# Check Node version
node --version

# Update if needed (using nvm)
nvm install 18
nvm use 18
```

#### **Browser Compatibility Issues**
```javascript
// For older browsers, include polyfills
if (typeof Buffer === 'undefined') {
  window.Buffer = require('buffer').Buffer;
}
```

#### **Webpack Bundle Issues**
```javascript
// webpack.config.js
module.exports = {
  resolve: {
    fallback: {
      "crypto": require.resolve("crypto-browserify"),
      "stream": require.resolve("stream-browserify"),
      "buffer": require.resolve("buffer"),
      "util": require.resolve("util"),
      "assert": require.resolve("assert"),
      "url": require.resolve("url")
    }
  },
  plugins: [
    new webpack.ProvidePlugin({
      Buffer: ['buffer', 'Buffer'],
      process: 'process/browser'
    })
  ]
};
```

## ✅ **Verification**

After installation, verify everything works:

```javascript
// verification.js
const bsv = require('@smartledger/bsv');

console.log('SmartLedger-BSV Version:', require('@smartledger/bsv/package.json').version);
console.log('Core functionality test...');

const privateKey = new bsv.PrivateKey();
const address = privateKey.toAddress();
const publicKey = privateKey.toPublicKey();

console.log('✅ Private Key:', privateKey.toString());
console.log('✅ Address:', address.toString());
console.log('✅ Public Key:', publicKey.toString());

// Test advanced features if available
if (bsv.SmartContract) {
  console.log('✅ Smart Contract module loaded');
}

if (bsv.splitSecret) {
  console.log('✅ Shamir Secret Sharing available');
}

console.log('🎉 Installation verified successfully!');
```

## 🎯 **Next Steps**

1. **🚀 Quick Start**: [Get running in 2 minutes](QUICK_START.md)
2. **🔄 Migration**: [Upgrade from bsv@1.5.6](../migration/FROM_BSV_1_5_6.md)
3. **💡 Examples**: [Working Code Examples](../../examples/)
4. **📖 API Docs**: [Complete API Reference](../api/)
5. **🏗️ Advanced**: [Smart Contract Development](../advanced/SMART_CONTRACT_GUIDE.md)

---

**Ready to build the future of Bitcoin SV applications! 🚀**