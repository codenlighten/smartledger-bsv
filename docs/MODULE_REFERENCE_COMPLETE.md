# 📦 SmartLedger-BSV Module Reference - Complete Library Analysis

## 🔍 **Actual vs Documented Module Analysis**

*Analysis Date: October 28, 2025*  
*SmartLedger-BSV Version: v3.3.4*  

---

## 📊 **Complete Module Inventory**

Based on actual library analysis, SmartLedger-BSV provides **12 distinct modules** with flexible loading options:

### **Core Modules**

| Module | File | Size | Purpose | Status in Docs |
|--------|------|------|---------|----------------|
| **bsv.min.js** | Core BSV + SmartContract | 937KB | Complete BSV development | ✅ Documented |
| **bsv.bundle.js** | Everything in one | 937KB | All features included | ✅ Documented |

### **Specialized Modules** 

| Module | File | Size | Purpose | Status in Docs |
|--------|------|------|---------|----------------|
| **bsv-smartcontract.min.js** | SmartContract framework | 937KB | Covenant development | ✅ Documented |
| **bsv-covenant.min.js** | Covenant interface | 913KB | Covenant operations | ✅ Documented |
| **bsv-script-helper.min.js** | Custom script tools | 26KB | Script development | ✅ Documented |
| **bsv-security.min.js** | Security enhancements (opt-in helpers) | 26KB | `SmartVerify` / `EllipticFixed` | ✅ Documented |

### **Utility Modules**

| Module | File | Size | Purpose | Status in Docs |
|--------|------|------|---------|----------------|
| **bsv-ecies.min.js** | ECIES encryption | 71KB | Message encryption | ✅ Documented |
| **bsv-message.min.js** | Message signing | 26KB | Message operations | ✅ Documented |
| **bsv-mnemonic.min.js** | HD wallet support | 681KB | Mnemonic operations | ✅ Documented |

### **🆕 Advanced Modules (Missing from Documentation!)**

| Module | File | Size | Purpose | Status in Docs |
|--------|------|------|---------|----------------|
| **🔐 bsv-shamir.min.js** | Shamir Secret Sharing | 432KB | Threshold cryptography | ✅ Documented |
| **🌐 bsv-gdaf.min.js** | Global Digital Attestation | 1184KB | Verifiable credentials | ✅ Documented |
| **⚖️ bsv-ltp.min.js** | Legal Token Protocol | 1184KB | Legal compliance tokens | ✅ Documented |

---

## 🚨 **Critical Documentation Gaps Discovered**

### **1. Missing Advanced Modules (40% of library undocumented!)**

Three advanced modules totaling **~2.7MB** of functionality:

#### **🔐 Shamir Secret Sharing (432KB)**
- **Purpose**: Threshold cryptography for secure secret distribution
- **Use Cases**: Backup keys, multi-party security, key recovery
- **Features**: Split secrets into N shares, require M to reconstruct
- **CDN**: `unpkg.com/@smartledger/bsv@5.4.0/bsv-shamir.min.js`

#### **🌐 Global Digital Attestation Framework - GDAF (1184KB)**  
- **Purpose**: W3C Verifiable Credentials and decentralized identity
- **Use Cases**: Identity verification, attestations, zero-knowledge proofs
- **Features**: DID creation, credential issuance, selective disclosure
- **CDN**: `unpkg.com/@smartledger/bsv@5.4.0/bsv-gdaf.min.js`

#### **⚖️ Legal Token Protocol - LTP (1184KB)**
- **Purpose**: Legal compliance framework for tokenized assets
- **Use Cases**: Property rights, obligations, compliant tokenization  
- **Features**: Legal primitives, compliance checking, attestation anchoring
- **CDN**: `unpkg.com/@smartledger/bsv@5.4.0/bsv-ltp.min.js`

### **2. Incorrect File Sizes in Documentation**

| Module | Documented Size | Actual Size | Difference |
|--------|----------------|-------------|------------|
| All bundles | Documented | Match disk | ✅ Resolved as of v3.4.4 |

---

## 📋 **Updated Loading Options Table**

| Module | Size | Use Case | CDN Link |
|--------|------|----------|----------|
| **bsv.min.js** | 937KB | Core BSV + SmartContract | `unpkg.com/@smartledger/bsv@5.4.0/bsv.min.js` |
| **bsv.bundle.js** | 937KB | Everything in one file | `unpkg.com/@smartledger/bsv@5.4.0/bsv.bundle.js` |
| **bsv-smartcontract.min.js** | 937KB | Covenant development | `unpkg.com/@smartledger/bsv@5.4.0/bsv-smartcontract.min.js` |
| **bsv-covenant.min.js** | 913KB | Covenant operations | `unpkg.com/@smartledger/bsv@5.4.0/bsv-covenant.min.js` |
| **bsv-script-helper.min.js** | 26KB | Custom script tools | `unpkg.com/@smartledger/bsv@5.4.0/bsv-script-helper.min.js` |
| **bsv-security.min.js** | 26KB | Security enhancements (opt-in helpers — see README › Security) | `unpkg.com/@smartledger/bsv@5.4.0/bsv-security.min.js` |
| **bsv-ecies.min.js** | 71KB | Encryption | `unpkg.com/@smartledger/bsv@5.4.0/bsv-ecies.min.js` |
| **bsv-message.min.js** | 26KB | Message signing | `unpkg.com/@smartledger/bsv@5.4.0/bsv-message.min.js` |
| **bsv-mnemonic.min.js** | 681KB | HD wallets | `unpkg.com/@smartledger/bsv@5.4.0/bsv-mnemonic.min.js` |
| **🆕 bsv-shamir.min.js** | 432KB | **Secret sharing** | `unpkg.com/@smartledger/bsv@5.4.0/bsv-shamir.min.js` |
| **🆕 bsv-gdaf.min.js** | 1184KB | **Digital attestation** | `unpkg.com/@smartledger/bsv@5.4.0/bsv-gdaf.min.js` |
| **🆕 bsv-ltp.min.js** | 1184KB | **Legal tokens** | `unpkg.com/@smartledger/bsv@5.4.0/bsv-ltp.min.js` |

## 🎯 **Updated Usage Examples**

### **Complete Loading Strategy Examples**

#### **1. Basic Development (~963KB)**
```html
<script src="https://unpkg.com/@smartledger/bsv@5.4.0/bsv.min.js"></script>
<script src="https://unpkg.com/@smartledger/bsv@5.4.0/bsv-script-helper.min.js"></script>
```

#### **2. Smart Contract Development (~2.7MB — each bundle re-embeds core BSV)**
```html
<script src="https://unpkg.com/@smartledger/bsv@5.4.0/bsv.min.js"></script>
<script src="https://unpkg.com/@smartledger/bsv@5.4.0/bsv-covenant.min.js"></script>
<script src="https://unpkg.com/@smartledger/bsv@5.4.0/bsv-smartcontract.min.js"></script>
```

#### **3. 🆕 Legal & Compliance Development (~3.2MB — each bundle re-embeds core BSV)**
```html
<script src="https://unpkg.com/@smartledger/bsv@5.4.0/bsv.min.js"></script>
<script src="https://unpkg.com/@smartledger/bsv@5.4.0/bsv-ltp.min.js"></script>
<script src="https://unpkg.com/@smartledger/bsv@5.4.0/bsv-gdaf.min.js"></script>
<script>
  // Legal Token Protocol
  const legalToken = bsv.createLegalToken({
    propertyType: 'real_estate',
    jurisdiction: 'us_delaware'
  });
  
  // Digital Attestation
  const credential = bsv.createEmailCredential(
    issuerDID, subjectDID, 'user@example.com', issuerPrivateKey
  );
</script>
```

#### **4. 🆕 Security & Cryptography (~1.4MB)**
```html
<script src="https://unpkg.com/@smartledger/bsv@5.4.0/bsv.min.js"></script>
<script src="https://unpkg.com/@smartledger/bsv@5.4.0/bsv-security.min.js"></script>
<script src="https://unpkg.com/@smartledger/bsv@5.4.0/bsv-shamir.min.js"></script>
<script>
  // Shamir Secret Sharing
  const shares = bsv.splitSecret('my_secret_key', 5, 3); // 5 shares, 3 needed
  
  // Enhanced Security
  const verified = bsvSecurity.SmartVerify.verify(signature, hash, publicKey);
</script>
```

#### **5. Everything Bundle (937KB)**
```html
<script src="https://unpkg.com/@smartledger/bsv@5.4.0/bsv.bundle.js"></script>
<script>
  // Everything available immediately
  const shares = bsv.splitSecret('secret', 5, 3);
  const credential = bsv.createDID(publicKey);
  const legalToken = bsv.createPropertyToken({...});
  const covenant = new bsv.CovenantInterface();
</script>
```

---

## 🔧 **New Advanced Module APIs**

### **🔐 Shamir Secret Sharing API**

```javascript
const bsv = require('@smartledger/bsv');

// Split a secret into shares
const secret = 'my_private_key_or_password';
const shares = bsv.splitSecret(secret, 5, 3); // 5 shares, need 3 to reconstruct

// Reconstruct secret from shares
const reconstructed = bsv.reconstructSecret([shares[0], shares[2], shares[4]]);

// Validate share integrity
const isValid = bsv.validateShare(shares[0]);

console.log('Secret reconstructed:', reconstructed === secret);
```

### **🌐 Global Digital Attestation Framework API**

```javascript
const bsv = require('@smartledger/bsv');

// Simple Interface (Recommended)
const issuerDID = bsv.createDID(privateKey.toPublicKey());
const credential = bsv.createEmailCredential(
  issuerDID, subjectDID, 'user@example.com', issuerPrivateKey
);

// Validate credentials
const validation = bsv.validateCredential(credential, 'EmailVerifiedCredential');

// Generate zero-knowledge proofs
const proof = bsv.generateSelectiveProof(
  credential, 
  ['credentialSubject.verified'], 
  nonce
);

// Advanced Interface
const gdaf = new bsv.GDAF({
  anchor: { network: 'mainnet' },
  attestationSigner: { customConfig: true }
});
```

### **⚖️ Legal Token Protocol API**

```javascript
const bsv = require('@smartledger/bsv');

// Create legal property token (Direct API)
const ownerKey = new bsv.PrivateKey();
const propertyData = {
  type: 'PropertyTitle',
  owner: 'did:smartledger:' + ownerKey.toPublicKey().toString(),
  jurisdiction: 'US-CA',
  property: {
    address: '123 Main St, San Francisco, CA 94105',
    parcelId: 'APN-12345678',
    area: { value: 1000, unit: 'sqft' }
  },
  value: { amount: 850000, currency: 'USD' }
};

const propertyToken = bsv.createRightToken(propertyData, ownerKey, {
  addProof: true
});

// Verify legal token
const verification = bsv.verifyLegalToken(propertyToken.token, ownerKey.toPublicKey().toString());

// Create selective disclosure for privacy
const disclosure = bsv.createSelectiveDisclosure(propertyToken.token, 
  ['type', 'jurisdiction', 'property.address'], 'demo-nonce-' + Date.now());

// Primitives-only architecture (for external systems)
const rightPrep = bsv.prepareRightToken('PropertyTitle', issuerDID, subjectDID, 
  claimData, issuerPrivateKey, { jurisdiction: 'US-CA' });

const obligationPrep = bsv.prepareObligationToken('PaymentObligation', issuerDID, 
  obligorDID, obligationData, issuerPrivateKey, { priority: 'HIGH' });
```

---

## 📈 **Module Size Analysis**

### **Total Library Capabilities**: ~8.9MB across 16 standalone bundles

Each standalone bundle is self-contained (it re-embeds core BSV at ~937KB),
so the total is the sum of independently-loadable file sizes — not the
working-set size if you load multiple.

| Category | Modules | Total Size |
|----------|---------|------------|
| **Core / Smart Contracts** | bsv.min, bsv.bundle, bsv-smartcontract, bsv-covenant, bsv-script-helper | ~3.75MB |
| **🆕 Credentials (3.4.x)** | bsv-didweb, bsv-vcjwt, bsv-statuslist, bsv-anchor | ~1.65MB |
| **🆕 Legal & Identity** | bsv-ltp, bsv-gdaf | ~2.31MB |
| **Utilities** | bsv-ecies, bsv-message, bsv-mnemonic | ~778KB |
| **🆕 Advanced Crypto** | bsv-shamir | 432KB |
| **Security** | bsv-security | 26KB |

### **Modular Loading Benefits**

- **Selective Loading**: Load only needed functionality
- **Performance**: Reduce bundle size by 60-80% for specific use cases  
- **Flexibility**: Mix and match modules for custom requirements
- **CDN Optimization**: Cache individual modules across projects

---

## 🚨 **Immediate Documentation Actions Required**

### **1. Add Missing Module Documentation** (Critical Priority)

**Files to Update:**
- `README.md` - Add 3 new modules to loading options table
- `README.md` - Add usage examples for Shamir, GDAF, LTP
- ~~`README.md` - Update file sizes (bundle.js: 764KB → 885KB)~~ — resolved; bundle.js is now 937KB and accurate everywhere

**New Sections Needed:**
- Shamir Secret Sharing usage guide
- GDAF digital identity examples  
- LTP legal token examples
- Advanced cryptography patterns

### **2. Create Dedicated Module Documentation**

**New Files to Create:**
- `docs/SHAMIR_SECRET_SHARING_GUIDE.md`
- `docs/GDAF_DIGITAL_ATTESTATION_GUIDE.md`  
- `docs/LTP_LEGAL_TOKENS_GUIDE.md`
- `docs/ADVANCED_CRYPTOGRAPHY_GUIDE.md`

### **3. Update All Cross-References**

**Files to Update:**
- All documentation mentioning "9 loading options" → "12 loading options"
- Update module counts and size references
- Add new module examples to relevant guides

---

## 💡 **Strategic Recommendations**

### **1. Highlight Unique Capabilities**

SmartLedger-BSV is likely the **only Bitcoin library** providing:
- ✅ Legal Token Protocol for compliant tokenization
- ✅ Global Digital Attestation Framework for W3C credentials  
- ✅ Shamir Secret Sharing for threshold cryptography
- ✅ Complete smart contract development framework

### **2. Market Positioning Updates**

**Current Tagline**: "Complete Bitcoin SV Development Framework with 9 Flexible Loading Options"

**Recommended**: "Complete Bitcoin SV Development Framework with Legal Compliance, Digital Identity, and 12 Flexible Loading Options"

### **3. Developer Onboarding**

Create **use-case specific guides**:
- **DeFi Developers** → Core + SmartContract + Covenant
- **Legal Tech** → Core + LTP + GDAF  
- **Security Applications** → Core + Security + Shamir
- **Enterprise** → Everything Bundle

---

This analysis reveals SmartLedger-BSV is significantly more capable than documented, with 40% of functionality (3 major modules) completely undocumented. Immediate action needed to update documentation and showcase unique legal/identity capabilities not available in other Bitcoin libraries.
