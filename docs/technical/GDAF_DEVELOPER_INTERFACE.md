# SmartLedger BSV - GDAF Developer Interface Guide

## 🎯 Two Ways to Use GDAF

The SmartLedger BSV library now provides **two interfaces** for using the Global Digital Attestation Framework, designed for different developer preferences:

## ⚡ **Simple Interface** (Recommended for Quick Development)

Use GDAF features directly from the main `bsv` object - no extra objects to create!

```javascript
const bsv = require('smartledger-bsv')

// Create DIDs directly
const issuerDID = bsv.createDID(privateKey.toPublicKey())

// Create credentials directly  
const emailCredential = bsv.createEmailCredential(
  issuerDID, 
  subjectDID, 
  'user@example.com', 
  issuerPrivateKey
)

// Validate directly
const validation = bsv.validateCredential(emailCredential, 'EmailVerifiedCredential')

// Generate ZK proofs directly
const proof = bsv.generateSelectiveProof(
  emailCredential,
  ['credentialSubject.verified'],
  nonce
)

// Verify proofs directly
const isValid = bsv.verifyAgeProof(ageProof, 18, issuerDID)
```

## 🔧 **Advanced Interface** (For Complex Applications)

Use the full GDAF class for advanced configuration and control:

```javascript
const bsv = require('smartledger-bsv')

// Create GDAF instance with custom options
const gdaf = new bsv.GDAF({
  anchor: { network: 'testnet' },
  attestationSigner: { customConfig: true }
})

// Use all GDAF methods
const did = gdaf.createDID(publicKey)
const credential = gdaf.createEmailCredential(issuerDID, subjectDID, email, key)
const verification = gdaf.verifyCredential(credential, options)
```

## 📋 **Available Direct Methods**

| Method | Purpose | Example |
|--------|---------|---------|
| `bsv.createDID(publicKey)` | Create DID from public key | `bsv.createDID(pk.toPublicKey())` |
| `bsv.resolveDID(did)` | Resolve DID document | `bsv.resolveDID('did:smartledger:...')` |
| `bsv.createEmailCredential(...)` | Create email credential | Email verification |
| `bsv.createAgeCredential(...)` | Create age credential | Age verification |
| `bsv.createKYCCredential(...)` | Create KYC credential | Identity verification |
| `bsv.verifyCredential(cred, opts)` | Verify credential | Credential validation |
| `bsv.validateCredential(cred, schema)` | Schema validation | W3C compliance check |
| `bsv.generateSelectiveProof(...)` | ZK selective disclosure | Privacy-preserving proofs |
| `bsv.generateAgeProof(...)` | ZK age proof | Age verification without birthdate |
| `bsv.verifyAgeProof(...)` | Verify age proof | Age proof validation |
| `bsv.createPresentation(...)` | Create VP | Multiple credential presentation |
| `bsv.getCredentialSchemas()` | Get all schemas | Available credential types |
| `bsv.createCredentialTemplate(type)` | Create template | Schema-based templates |

## 🚀 **Quick Start Examples**

### Email Verification System
```javascript
const bsv = require('smartledger-bsv')

// Setup
const issuerKey = new bsv.PrivateKey()
const userKey = new bsv.PrivateKey()
const issuerDID = bsv.createDID(issuerKey.toPublicKey())
const userDID = bsv.createDID(userKey.toPublicKey())

// Create email credential
const emailCred = bsv.createEmailCredential(
  issuerDID,
  userDID, 
  'user@company.com',
  issuerKey
)

// Validate it
const isValid = bsv.validateCredential(emailCred, 'EmailVerifiedCredential')
console.log('Email credential valid:', isValid.valid)
```

### Age Verification (Privacy-Preserving)
```javascript
const bsv = require('smartledger-bsv')

// Create age credential  
const ageCred = bsv.createAgeCredential(
  issuerDID,
  userDID,
  21,
  new Date('1995-06-15'),
  issuerKey
)

// Generate ZK proof for age over 18 (without revealing actual age/birthdate)
const ageProof = bsv.generateAgeProof(ageCred, 18, 'random-nonce')

// Verify the proof
const canDrink = bsv.verifyAgeProof(ageProof, 18, issuerDID)
console.log('Over 18:', canDrink) // true, but birthdate stays private!
```

### KYC System
```javascript
const bsv = require('smartledger-bsv')

// Create KYC credential with hashed PII
const kycCred = bsv.createKYCCredential(
  issuerDID,
  userDID,
  'enhanced', // KYC level
  {
    firstNameHash: bsv.crypto.Hash.sha256(Buffer.from('John')).toString('hex'),
    lastNameHash: bsv.crypto.Hash.sha256(Buffer.from('Doe')).toString('hex'),
    ssnHash: bsv.crypto.Hash.sha256(Buffer.from('123-45-6789')).toString('hex')
  },
  issuerKey
)

// Validate KYC credential
const kycValid = bsv.validateCredential(kycCred, 'KYCVerifiedCredential')
console.log('KYC valid:', kycValid.valid)
```

## 🎯 **When to Use Which Interface**

### Use **Simple Interface** (`bsv.method()`) when:
- ✅ Quick prototyping
- ✅ Simple applications
- ✅ Standard GDAF functionality
- ✅ Minimal configuration needed
- ✅ Learning GDAF features

### Use **Advanced Interface** (`new bsv.GDAF()`) when:
- 🔧 Custom configuration needed
- 🔧 Multiple GDAF instances
- 🔧 Advanced error handling
- 🔧 Complex enterprise applications
- 🔧 Performance optimization

## 📦 **Both Interfaces Available**

You can even mix both approaches in the same application:

```javascript
const bsv = require('smartledger-bsv')

// Quick operations with simple interface
const did = bsv.createDID(publicKey)
const template = bsv.createCredentialTemplate('EmailVerifiedCredential')

// Complex operations with advanced interface
const gdaf = new bsv.GDAF({ 
  anchor: { customSettings: true } 
})
const anchored = gdaf.anchorCredential(credential, privateKey, options)
```

## ✅ **Result: Perfect Developer Experience**

The SmartLedger BSV library now provides the **easiest possible interface** for GDAF features while maintaining full flexibility for advanced use cases. Developers can:

1. **Start simple** with direct methods (`bsv.createDID()`)
2. **Scale up** to advanced features when needed (`new bsv.GDAF()`)
3. **Mix approaches** as their application grows
4. **Access all functionality** through clean, intuitive APIs

This dual-interface approach ensures maximum developer satisfaction and adoption! 🎉