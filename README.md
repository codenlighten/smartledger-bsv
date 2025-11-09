# SmartLedger-BSV

**🚀 Complete Bitcoin SV Development Framework with W3C Verifiable Credentials, DID:web, Legal Compliance, and 16 Flexible Loading Options**

[![Version](https://img.shields.io/badge/version-3.4.0-blue.svg)](https://www.npmjs.com/package/@smartledger/bsv)
[![License](https://img.shields.io/badge/license-MIT-green.svg)](LICENSE)
[![BSV](https://img.shields.io/badge/BSV-Compatible-orange.svg)](https://bitcoinsv.com/)
[![Modular](https://img.shields.io/badge/Loading-Modular-purple.svg)](#loading-options)
[![W3C](https://img.shields.io/badge/W3C-Compliant-blueviolet.svg)](#verifiable-credentials)

The most comprehensive and flexible Bitcoin SV library available. **NEW in v3.4.0**: Legally-recognizable DID:web + VC-JWT toolkit with ES256/ES256K support, StatusList2021 revocation, and BSV anchoring. Choose from 16 different distribution methods: standalone modules, complete bundle, or mix-and-match approach.

## 🆕 **v3.4.0 - Legally-Recognizable Credentials**

### **Why This Matters**
- ✅ **W3C Standards**: Full VC-JWT and DID:web compliance for legal recognition
- ✅ **Enterprise Ready**: ES256 (P-256 NIST curve) for regulated industries
- ✅ **Blockchain Native**: ES256K (secp256k1) for BSV integration
- ✅ **Revocation Built-in**: StatusList2021 standard for credential management
- ✅ **Privacy Preserving**: Hash-only BSV anchoring (no PII on-chain)
- ✅ **CLI Tools**: Complete command-line interface for credential operations

### **Quick Start - Issue Your First Verifiable Credential**

```bash
# Install SmartLedger BSV v3.4.0
npm install @smartledger/bsv@3.4.0

# Initialize DID:web issuer (generates ES256 keys)
npx smartledger-bsv didweb init --domain example.com --alg ES256

# Issue a credential
npx smartledger-bsv vc issue \
  --issuer did:web:example.com \
  --subject did:example:alice \
  --types "VerifiableCredential,DriversLicense" \
  --claims '{"licenseNumber":"DL123456","class":"C"}' \
  > credential.jwt

# Verify the credential
npx smartledger-bsv vc verify credential.jwt

# Anchor hash to BSV (privacy-preserving)
npx smartledger-bsv anchor hash credential.jwt

# Create revocation list
npx smartledger-bsv status create --issuer did:web:example.com > status-list.jwt

# Revoke a credential
npx smartledger-bsv status set --list status-list.jwt --index 42 --status revoked
```

### **Programmatic Usage**

```javascript
const bsv = require('@smartledger/bsv')

// Generate DID:web issuer keys
const keys = await bsv.DIDWeb.generateIssuerKeys({ alg: 'ES256' })

// Build DID documents (.well-known/did.json and jwks.json)
const docs = bsv.DIDWeb.buildDidWebDocuments({
  domain: 'example.com',
  p256: { jwk: keys.publicJwk, kid: keys.kid },
  controllerName: 'Example Corp'
})
// Deploy docs.didDocument to https://example.com/.well-known/did.json
// Deploy docs.jwks to https://example.com/.well-known/jwks.json

// Issue a Verifiable Credential as JWT
const result = await bsv.VcJwt.issueVcJwt({
  issuerDid: docs.did,
  subjectId: 'did:example:alice',
  types: ['VerifiableCredential', 'AgeCredential'],
  credentialSubject: {
    ageOver: 18,
    country: 'US'
  },
  privateJwk: keys.privateJwk,
  alg: 'ES256',
  kid: keys.kid
})

console.log('VC-JWT:', result.jwt)

// Verify the credential
const verification = await bsv.VcJwt.verifyVcJwt(result.jwt, {
  didResolver: async (did) => {
    // In production, fetch https://example.com/.well-known/jwks.json
    return { jwks: docs.jwks }
  },
  expectedIssuerDid: docs.did
})

console.log('Valid:', verification.valid)

// Anchor hash to BSV (no PII on-chain)
const hash = bsv.Anchor.sha256Hex(result.jwt)
const anchorPayload = bsv.Anchor.buildAnchorPayload({
  kind: 'VC_ANCHOR_SHA256',
  hash: hash,
  issuerDid: docs.did
})

// Include anchorPayload.json in OP_RETURN
// Later: verify with bsv.Anchor.verifyAnchorHash(originalData, anchorHash)

// Create revocation list (100k credentials)
const statusList = await bsv.StatusList.createStatusList({
  issuerDid: docs.did,
  privateJwk: keys.privateJwk
})

// Revoke a credential
const updated = await bsv.StatusList.updateStatusList({
  listVcJwt: statusList.listVcJwt,
  index: 42,
  status: 'revoked',
  privateJwk: keys.privateJwk
})

// Check revocation status
const status = bsv.StatusList.getCredentialStatusEntry({
  listVcJwt: updated.listVcJwt,
  index: 42
})

console.log('Status:', status) // 'revoked'
```

## 🎯 **16 Loading Options - Choose Your Approach**

### **Core Modules**
| Module | Size | Use Case | CDN |
|--------|------|----------|-----|
| **bsv.min.js** | 449KB | Core BSV + SmartContract | `unpkg.com/@smartledger/bsv@3.4.0/bsv.min.js` |
| **bsv.bundle.js** | 885KB | Everything in one file | `unpkg.com/@smartledger/bsv@3.4.0/bsv.bundle.js` |

### **🆕 W3C Verifiable Credentials (v3.4.0)**
| Module | Size | Use Case | CDN |
|--------|------|----------|-----|
| **🟢 bsv-didweb.min.js** | 418KB | **DID:web generation** | `unpkg.com/@smartledger/bsv@3.4.0/bsv-didweb.min.js` |
| **🟢 bsv-vcjwt.min.js** | 418KB | **VC-JWT issue/verify** | `unpkg.com/@smartledger/bsv@3.4.0/bsv-vcjwt.min.js` |
| **🟢 bsv-statuslist.min.js** | 486KB | **StatusList2021 revocation** | `unpkg.com/@smartledger/bsv@3.4.0/bsv-statuslist.min.js` |
| **🟢 bsv-anchor.min.js** | 417KB | **BSV anchoring (hash-only)** | `unpkg.com/@smartledger/bsv@3.4.0/bsv-anchor.min.js` |

### **Smart Contract & Development**
| Module | Size | Use Case | CDN |
|--------|------|----------|-----|
| **bsv-smartcontract.min.js** | 451KB | Complete covenant framework | `unpkg.com/@smartledger/bsv@3.4.0/bsv-smartcontract.min.js` |
| **bsv-covenant.min.js** | 32KB | Covenant operations | `unpkg.com/@smartledger/bsv@3.4.0/bsv-covenant.min.js` |
| **bsv-script-helper.min.js** | 27KB | Custom script tools | `unpkg.com/@smartledger/bsv@3.4.0/bsv-script-helper.min.js` |
| **bsv-security.min.js** | 290KB | Security enhancements | `unpkg.com/@smartledger/bsv@3.4.0/bsv-security.min.js` |

### **Legal & Compliance**
| Module | Size | Use Case | CDN |
|--------|------|----------|-----|
| **bsv-ltp.min.js** | 817KB | Legal Token Protocol | `unpkg.com/@smartledger/bsv@3.4.0/bsv-ltp.min.js` |
| **bsv-gdaf.min.js** | 604KB | Digital Identity & Attestation | `unpkg.com/@smartledger/bsv@3.4.0/bsv-gdaf.min.js` |

### **Advanced Cryptography**
| Module | Size | Use Case | CDN |
|--------|------|----------|-----|
| **bsv-shamir.min.js** | 433KB | Threshold Cryptography | `unpkg.com/@smartledger/bsv@3.4.0/bsv-shamir.min.js` |

### **Utilities**
| Module | Size | Use Case | CDN |
|--------|------|----------|-----|
| **bsv-ecies.min.js** | 71KB | Encryption | `unpkg.com/@smartledger/bsv@3.4.0/bsv-ecies.min.js` |
| **bsv-message.min.js** | 26KB | Message signing | `unpkg.com/@smartledger/bsv@3.4.0/bsv-message.min.js` |
| **bsv-mnemonic.min.js** | 670KB | HD wallets | `unpkg.com/@smartledger/bsv@3.4.0/bsv-mnemonic.min.js` |

## ⚡ **2-Minute Quick Start**

Get started with Bitcoin SV development in under 2 minutes:

```bash
# Install via npm
npm install @smartledger/bsv

# Or include in HTML
<script src="https://unpkg.com/@smartledger/bsv@3.4.0/bsv.min.js"></script>
```

> **🔧 v3.4.0 Update:** Added legally-recognizable W3C Verifiable Credentials with DID:web + VC-JWT toolkit. ES256/ES256K support, StatusList2021 revocation, and privacy-preserving BSV anchoring. Complete CLI tooling included!

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

**🆕 Legal Token Development (60 seconds):**
```javascript
// Create legal property token
const propertyToken = bsv.createPropertyToken({
  propertyType: 'real_estate',
  jurisdiction: 'us_delaware', 
  legalDescription: 'Lot 15, Block 3, Subdivision ABC',
  ownerIdentity: ownerDID
});

// Generate W3C Verifiable Credential
const credential = bsv.createEmailCredential(
  issuerDID, subjectDID, 'user@example.com', issuerPrivateKey
);

// Threshold cryptography for secure key management
const shares = bsv.splitSecret('private_key_backup', 5, 3); // 5 shares, 3 needed
```

**🆕 Smart Contract Development (90 seconds):**
```javascript
// Generate authentic UTXOs for testing
const utxoGenerator = new bsv.SmartContract.UTXOGenerator();
const utxos = utxoGenerator.createRealUTXOs(2, 100000);

// Create BIP-143 preimage and extract fields
const preimage = new bsv.SmartContract.Preimage(preimageHex);
const amount = preimage.getField('amount');

// Build covenant with JavaScript-to-Script translation
const covenant = bsv.SmartContract.createCovenantBuilder()
  .extractField('amount')
  .push(50000)
  .greaterThanOrEqual()
  .verify()
  .build();
```

**Next Steps:**
- 📖 [SmartContract Guide](docs/SMART_CONTRACT_GUIDE.md)
- ⚖️ [Legal Token Protocol Guide](docs/LTP_LEGAL_TOKENS_GUIDE.md)  
- 🌐 [Digital Identity Guide](docs/GDAF_DIGITAL_ATTESTATION_GUIDE.md)
- � [Threshold Cryptography Guide](docs/SHAMIR_SECRET_SHARING_GUIDE.md)
- �️ [UTXO Manager Guide](docs/UTXO_MANAGER_GUIDE.md)
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

### 🔧 **Basic Development** (476KB total)
```html
<script src="https://unpkg.com/@smartledger/bsv@3.3.4/bsv.min.js"></script>
<script src="https://unpkg.com/@smartledger/bsv@3.3.4/bsv-script-helper.min.js"></script>
<script>
  const privateKey = new bsv.PrivateKey();
  const utxos = new bsv.SmartContract.UTXOGenerator().createRealUTXOs(2, 100000);
</script>
```

### 🔒 **Smart Contract Development** (932KB total)
```html
<script src="https://unpkg.com/@smartledger/bsv@3.3.4/bsv.min.js"></script>
<script src="https://unpkg.com/@smartledger/bsv@3.3.4/bsv-covenant.min.js"></script>
<script src="https://unpkg.com/@smartledger/bsv@3.3.4/bsv-smartcontract.min.js"></script>
<script>
  const covenant = bsv.SmartContract.createCovenantBuilder()
    .extractField('amount').push(50000).greaterThanOrEqual().verify().build();
  const debugInfo = bsv.SmartContract.examineStack(script);
</script>
```

### 🆕 **Legal & Identity Development** (1.87MB total)
```html
<script src="https://unpkg.com/@smartledger/bsv@3.3.4/bsv.min.js"></script>
<script src="https://unpkg.com/@smartledger/bsv@3.3.4/bsv-ltp.min.js"></script>
<script src="https://unpkg.com/@smartledger/bsv@3.3.4/bsv-gdaf.min.js"></script>
<script>
  // Legal Token Protocol
  const propertyToken = bsv.createPropertyToken({
    propertyType: 'real_estate', jurisdiction: 'us_delaware'
  });
  
  // Digital Identity
  const credential = bsv.createEmailCredential(issuerDID, subjectDID, 'user@example.com', key);
</script>
```

### 🆕 **Security & Cryptography** (1.17MB total)
```html
<script src="https://unpkg.com/@smartledger/bsv@3.3.4/bsv.min.js"></script>
<script src="https://unpkg.com/@smartledger/bsv@3.3.4/bsv-security.min.js"></script>
<script src="https://unpkg.com/@smartledger/bsv@3.3.4/bsv-shamir.min.js"></script>
<script>
  // Threshold Cryptography
  const shares = bsv.splitSecret('my_secret_key', 5, 3); // 5 shares, 3 needed
  
  // Enhanced Security
  const verified = bsvSecurity.SmartVerify.verify(signature, hash, publicKey);
</script>
```

### 🎯 **Everything Bundle** (885KB)
```html
<script src="https://unpkg.com/@smartledger/bsv@3.3.4/bsv.bundle.js"></script>
<script>
  // Everything available immediately
  const shares = bsv.splitSecret('secret', 5, 3);           // Shamir Secret Sharing
  const credential = bsv.createDID(publicKey);              // Digital Identity
  const propertyToken = bsv.createPropertyToken({...});    // Legal Tokens
  const covenant = bsv.SmartContract.createCovenantBuilder(); // Smart Contracts
</script>
```

## 🎯 **Key Features**

### 🚀 **Unique Capabilities** (Only Bitcoin Library with These Features)
- ✅ **Legal Token Protocol**: Compliant tokenization of real-world assets → [Legal Guide](docs/LTP_LEGAL_TOKENS_GUIDE.md)
- ✅ **Digital Identity Framework**: W3C Verifiable Credentials and DIDs → [Identity Guide](docs/GDAF_DIGITAL_ATTESTATION_GUIDE.md)
- ✅ **Threshold Cryptography**: Shamir Secret Sharing for secure key management → [Cryptography Guide](docs/SHAMIR_SECRET_SHARING_GUIDE.md)
- ✅ **Complete Smart Contract Suite**: 23+ production-ready covenant features → [SmartContract Guide](docs/SMART_CONTRACT_GUIDE.md)

### 💼 **Core Library Excellence**
- ✅ **Complete BSV API**: Full Bitcoin SV blockchain operations → [API Reference](#api-reference)  
- ✅ **Security Hardened**: SmartLedger elliptic curve fixes and enhanced validation → [Security Features](#security-features)
- ✅ **Browser + Node.js**: Universal compatibility with proper polyfills → [Loading Options](#12-loading-options--choose-your-approach)
- ✅ **TypeScript Ready**: Complete type definitions included
- ✅ **Ultra-Low Fees**: 0.01 sats/byte configuration (91% fee reduction)

### 🛠️ **Advanced Development Tools**
- 🔧 **JavaScript-to-Script**: High-level covenant development with 121 opcode mapping → [Covenant Guide](docs/ADVANCED_COVENANT_DEVELOPMENT.md)
- 🔧 **UTXO Generator**: Create authentic test UTXOs for development → [UTXO Guide](docs/UTXO_MANAGER_GUIDE.md)
- 🔧 **Preimage Parser**: Complete BIP-143 field extraction and manipulation → [Preimage Tools](examples/preimage/)
- � **Debug Framework**: Script interpreter, stack examiner, and optimizer → [Debug Examples](tests/smartcontract-test.html)
- � **PUSHTX Integration**: nChain techniques for advanced covenant patterns → [PUSHTX Insights](docs/pushtx-key-insights.md)

### 📦 **Flexible Architecture** 
- 📦 **12 Modular Options**: Load only what you need (27KB to 885KB) → [Loading Strategy](#loading-strategy-examples)
- 📦 **Standalone Modules**: Independent legal, identity, and crypto modules → [Standalone Test](tests/standalone-modules-test.html)
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
<script src="https://unpkg.com/@smartledger/bsv@3.3.4/bsv.min.js"></script>
<script src="https://unpkg.com/@smartledger/bsv@3.3.4/bsv-script-helper.min.js"></script>
<script>
  const tx = new bsv.Transaction();
  const sig = bsvScriptHelper.createSignature(tx, privateKey, 0, script, satoshis);
</script>
```

#### 2. **DeFi Development** - Core + Covenants + Debug (932KB)
```html
<script src="https://unpkg.com/@smartledger/bsv@3.3.4/bsv.min.js"></script>
<script src="https://unpkg.com/@smartledger/bsv@3.3.4/bsv-covenant.min.js"></script>
<script src="https://unpkg.com/@smartledger/bsv@3.3.4/bsv-smartcontract.min.js"></script>
<script>
  const covenant = new bsvCovenant.CovenantInterface();
  const debugInfo = SmartContract.interpretScript(script);
  const optimized = SmartContract.optimizeScript(script);
</script>
```

#### 3. **Security First** - Core + Enhanced Security (739KB)
```html
<script src="https://unpkg.com/@smartledger/bsv@3.3.4/bsv.min.js"></script>
<script src="https://unpkg.com/@smartledger/bsv@3.3.4/bsv-security.min.js"></script>
<script>
  const verified = bsvSecurity.SmartVerify.verify(signature, hash, publicKey);
  const enhanced = bsvSecurity.EllipticFixed.createSignature(privateKey, hash);
</script>
```

#### 4. **Everything Bundle** - One File Solution (764KB)
```html
<script src="https://unpkg.com/@smartledger/bsv@3.3.4/bsv.bundle.js"></script>
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

## 🆕 **Advanced Features** (Unique to SmartLedger-BSV)

### ⚖️ Legal Token Protocol (LTP)
```javascript
const bsv = require('@smartledger/bsv');

// Create property rights token
const propertyToken = bsv.createPropertyToken({
  propertyType: 'real_estate',
  jurisdiction: 'us_delaware',
  legalDescription: 'Lot 15, Block 3, Subdivision ABC',
  ownerIdentity: ownerDID,
  attestations: [titleAttestation, valuationAttestation]
});

// Create obligation token  
const obligation = bsv.createObligationToken({
  obligationType: 'payment',
  amount: 100000, // satoshis
  dueDate: '2025-12-31',
  creditor: creditorDID,
  debtor: debtorDID
});

// Validate legal compliance
const compliance = bsv.validateLegalCompliance(propertyToken, 'us_delaware');
console.log('Legally compliant:', compliance.isValid);
```

### 🌐 Global Digital Attestation Framework (GDAF)
```javascript
// Simple Interface - Direct from bsv object
const issuerDID = bsv.createDID(privateKey.toPublicKey());

// Create W3C Verifiable Credentials
const emailCredential = bsv.createEmailCredential(
  issuerDID, subjectDID, 'user@example.com', issuerPrivateKey
);

// Generate zero-knowledge proofs
const proof = bsv.generateSelectiveProof(
  emailCredential,
  ['credentialSubject.verified'], 
  nonce
);

// Verify age without revealing exact age
const ageProof = bsv.generateAgeProof(credential, 18);
const isAdult = bsv.verifyAgeProof(ageProof, 18, issuerDID);

// Advanced Interface for complex applications
const gdaf = new bsv.GDAF({
  anchor: { network: 'mainnet' },
  attestationSigner: { customConfig: true }
});
```

### 🔐 Shamir Secret Sharing
```javascript
// Split secret into threshold shares
const secret = 'my_private_key_backup';
const shares = bsv.splitSecret(secret, 5, 3); // 5 shares, need 3 to reconstruct

console.log('Generated', shares.length, 'shares');
shares.forEach((share, i) => {
  console.log(`Share ${i + 1}:`, share);
});

// Reconstruct secret from any 3 shares
const reconstructed = bsv.reconstructSecret([shares[0], shares[2], shares[4]]);
console.log('Secret recovered:', reconstructed === secret);

// Validate share integrity
shares.forEach((share, i) => {
  const isValid = bsv.validateShare(share);
  console.log(`Share ${i + 1} valid:`, isValid);
});

// Use cases: Key backup, multi-party security, recovery systems
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

## � **Complete Documentation**

### 📚 **Getting Started Guides**
- [📋 **UTXO Manager Guide**](docs/UTXO_MANAGER_GUIDE.md) - Complete UTXO management and mock generation
- [🔒 **Smart Contract Guide**](docs/SMART_CONTRACT_GUIDE.md) - Comprehensive covenant development
- [🛠️ **Custom Script Development**](docs/CUSTOM_SCRIPT_DEVELOPMENT.md) - Build custom Bitcoin scripts
- [🚀 **Advanced Covenant Development**](docs/ADVANCED_COVENANT_DEVELOPMENT.md) - Production-ready covenants

### 🆕 **Advanced Features Documentation**
- [⚖️ **Legal Token Protocol Guide**](docs/LTP_LEGAL_TOKENS_GUIDE.md) - Property rights & obligation tokens
- [🌐 **Digital Attestation Guide**](docs/GDAF_DIGITAL_ATTESTATION_GUIDE.md) - DIDs & verifiable credentials  
- [🔐 **Shamir Secret Sharing Guide**](docs/SHAMIR_SECRET_SHARING_GUIDE.md) - Threshold cryptography & key backup
- [🛡️ **Security Features**](SECURITY_SUMMARY.md) - Enhanced validation & smart verification

### 📊 **Technical References**
- [📝 **Module Reference**](docs/MODULE_REFERENCE_COMPLETE.md) - All 12 modules explained
- [🔍 **Documentation Review Report**](docs/DOCUMENTATION_REVIEW_REPORT.md) - Comprehensive analysis
- [📋 **API Reference**](docs/api/) - Complete API documentation
- [🔧 **Integration Guide**](SMARTCONTRACT_INTEGRATION.md) - Smart contract integration

### 📋 **Examples & Demos**
- [� **Interactive Demos**](demos/) - **NEW!** HTML & Node.js smart contract demos
- [�📁 **Examples Directory**](examples/) - Working code examples
- [🎯 **Basic Examples**](examples/basic/) - Simple transactions & addresses
- [🔒 **Covenant Examples**](examples/covenants/) - Smart contract patterns  
- [📊 **Advanced Examples**](examples/covenants2/) - Production patterns

**🎮 Try the Interactive Demos:**
```bash
# Terminal-based interactive demo
npm run demo

# Or run specific features
npm run demo:basics     # Library basics & tests
npm run demo:covenant   # Covenant builder
npm run demo:preimage   # BIP-143 preimage parser
npm run demo:utxo      # UTXO generator
npm run demo:scripts   # Script tools

# Web-based demo (open in browser)
npm run demo:web
```

### 🔍 **Troubleshooting & Support**
- [📚 **Complete Documentation**](docs/README.md) - Organized documentation hub
- [❓ **Issues & Solutions**](https://github.com/codenlighten/smartledger-bsv/issues) - Community support
- [📈 **Status Reports**](SMARTLEDGER_V302_STATUS_REPORT.md) - Latest updates  
- [🔒 **Security Policy**](SECURITY.md) - Security guidelines
- [📝 **Changelog**](CHANGELOG.md) - Version history

---

## �📄 **License**

This project is licensed under the MIT License - see the [LICENSE](LICENSE) file for details.

## 🤝 **Contributing**

We welcome contributions to SmartLedger-BSV! Please see our [Contributing Guide](CONTRIBUTING.md) for details.

## 🏢 **Enterprise Support**

- **GitHub**: [github.com/codenlighten/smartledger-bsv](https://github.com/codenlighten/smartledger-bsv)
- **NPM**: [@smartledger/bsv](https://www.npmjs.com/package/@smartledger/bsv)
- **Issues**: [GitHub Issues](https://github.com/codenlighten/smartledger-bsv/issues)
- **Documentation**: [Complete Docs](#complete-documentation)

---

**SmartLedger-BSV v3.3.4** - *Complete Bitcoin SV Development Framework*

Built with ❤️ for the Bitcoin SV ecosystem • 9 Loading Options • Enterprise Ready
