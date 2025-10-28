# Legal Token Protocol (LTP)

## What is LTP?

The Legal Token Protocol (LTP) is SmartLedger-BSV's comprehensive framework for creating **legally interpretable digital tokens** that represent real-world rights, obligations, and legal relationships with cryptographic proof and blockchain anchoring.

### Core Purpose

LTP bridges the gap between **traditional legal concepts** and **blockchain technology** by:
- **Digitizing Legal Rights**: Converting property titles, licenses, permits into cryptographically signed tokens
- **Managing Legal Obligations**: Creating enforceable digital obligations with payment schedules and compliance tracking
- **Ensuring Legal Compliance**: Providing jurisdiction-specific validation and regulatory compliance primitives
- **Maintaining Audit Trails**: Creating immutable records of legal token lifecycle events

### What Makes LTP Different

Unlike simple utility tokens or NFTs, LTP tokens are designed to be **legally meaningful**:
- **W3C Standards Compliant**: Built on Verifiable Credentials standard for interoperability
- **Jurisdiction-Aware**: Supports different legal frameworks (US, EU, etc.)
- **Privacy-Preserving**: Selective disclosure allows sharing only necessary information
- **Legally Binding**: Designed to work within existing legal frameworks and courts

## 🚀 Quick Start

```javascript
const bsv = require('@smartledger/bsv');

// Create a property right token
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
  addProof: true,
  anchor: false,
  register: false
});

console.log('Token created:', propertyToken.success);
console.log('Token ID:', propertyToken.token.id);
```

## 📚 Complete API Reference

### Direct Token Functions

#### `bsv.createRightToken(data, privateKey, options)`
Creates a legal right token (property, vehicle, intellectual property, etc.)

**Parameters:**
- `data` - Token data object with type, owner, jurisdiction, and specific claim data
- `privateKey` - PrivateKey instance for signing
- `options` - Configuration options (addProof, anchor, register)

**Returns:** `{ success: boolean, token: Object, type: string }`

#### `bsv.verifyLegalToken(token, publicKey)`
Verifies a legal token's cryptographic signature and validity

**Parameters:**
- `token` - Token object to verify
- `publicKey` - Public key string for verification

**Returns:** `{ valid: boolean, publicKey: string, tokenHash: string }`

#### `bsv.validateLegalClaim(claimData, schemaType)`
Validates claim data against legal schemas

**Parameters:**
- `claimData` - Claim object to validate
- `schemaType` - Schema type ('PropertyTitle', 'VehicleTitle', etc.)

**Returns:** `{ valid: boolean, schema: string, requiredFields?: Array }`

#### `bsv.createSelectiveDisclosure(token, revealedFields, nonce)`
Creates selective disclosure proof for privacy protection

**Parameters:**
- `token` - Token to create disclosure proof for
- `revealedFields` - Array of field paths to reveal
- `nonce` - Unique nonce string

**Returns:** `{ success: boolean, proof: Object, disclosures: Array }`

#### `bsv.createLegalRegistry(config)`
Creates legal token registry configuration

**Parameters:**
- `config` - Registry configuration object

**Returns:** Registry configuration object

#### `bsv.createLegalValidityProof(token, jurisdiction, nonce)`
Creates legal validity proof for compliance

**Parameters:**
- `token` - Token to validate
- `jurisdiction` - Jurisdiction rules object
- `nonce` - Unique nonce string

**Returns:** `{ success: boolean, proof: Object, valid: boolean }`

### LTP Class Interface

```javascript
const ltp = new bsv.LTP();

// Transfer a right token
const transfer = ltp.transferRight(token, newOwnerDID, ownerKey, {
  reason: 'Sale',
  consideration: { amount: 875000, currency: 'USD' }
});

// Create obligation from right
const obligation = ltp.createObligation(rightToken, obligationData, privateKey);
```

### Primitives-Only Architecture

For maximum flexibility, use the preparation functions that return data for external systems to handle:

```javascript
// Prepare right token (no blockchain interaction)
const rightPrep = bsv.prepareRightToken(
  'PropertyTitle',
  issuerDID,
  subjectDID,
  claimData,
  issuerPrivateKey,
  options
);

// Prepare obligation token
const obligationPrep = bsv.prepareObligationToken(
  'PaymentObligation',
  issuerDID,
  obligorDID,
  obligationData,
  issuerPrivateKey,
  options
);

// Prepare selective disclosure proof
const disclosurePrep = bsv.prepareSelectiveDisclosure(
  token,
  revealedFields,
  nonce
);
```

## 🏗️ Architecture & Module Integration

### How LTP Integrates with SmartLedger-BSV

LTP is built on top of SmartLedger-BSV's modular architecture and integrates seamlessly with other modules:

#### **Foundation Layer (Required)**
- **Core BSV (`bsv.min.js`)**: Provides Bitcoin SV primitives (keys, transactions, addresses)
- **Cryptographic Functions**: Uses hardened elliptic curve implementations for all signatures

#### **Identity Layer (Recommended)**  
- **GDAF Module (`bsv-gdaf.min.js`)**: Provides DID creation and Verifiable Credential standards
- **Integration**: LTP tokens reference DIDs for issuers, subjects, and obligors

#### **Smart Contract Layer (Optional)**
- **Smart Contract Module (`bsv-smartcontract.min.js`)**: Provides covenant enforcement
- **Integration**: LTP tokens can be protected by smart contract covenants for automatic enforcement

#### **Security Layer (Optional)**
- **Shamir Module (`bsv-shamir.min.js`)**: Provides threshold cryptography  
- **Integration**: Can split LTP token signing keys across multiple parties

#### **Privacy Layer (Built-in)**
- **Selective Disclosure**: Native privacy-preserving proofs within LTP
- **ECIES Encryption**: Uses core BSV ECIES for encrypted data fields

### Primitives-Only Design Philosophy

LTP follows SmartLedger-BSV's **primitives-only architecture**:

**What LTP Provides (Preparation Functions):**
- ✅ **Legal Structure Validation**: Ensures tokens follow legal standards
- ✅ **Cryptographic Proof Generation**: Creates verifiable signatures and proofs  
- ✅ **Compliance Checking**: Validates against jurisdiction-specific rules
- ✅ **Token Lifecycle Management**: Handles creation, transfer, and revocation
- ✅ **Registry Data Formatting**: Prepares data for external registry systems
- ✅ **Blockchain Commitment Preparation**: Creates anchoring data without publishing

**What External Systems Handle:**
- 🔗 **Blockchain Publishing**: Your application publishes to BSV blockchain
- 🔗 **Registry Storage**: Your database/registry stores token data
- 🔗 **Network Communication**: Your API handles network requests
- 🔗 **User Interfaces**: Your frontend displays and manages tokens
- 🔗 **Business Logic**: Your application handles domain-specific workflows

### Benefits of This Architecture
- **Maximum Flexibility**: Use any blockchain, database, or UI framework
- **No Vendor Lock-in**: Not tied to specific platforms or services
- **Enterprise Ready**: Clean separation allows enterprise integration
- **Legal Compliance**: Focus on legal correctness without implementation constraints

## 📋 What LTP Can Tokenize

### Real-World Legal Rights (Right Tokens)
- **🏠 PropertyTitle** - Real estate ownership, deeds, titles
- **🚗 VehicleTitle** - Car, boat, aircraft ownership documents
- **💡 IntellectualProperty** - Patents, trademarks, copyrights
- **🎵 MusicLicense** - Music publishing, performance rights
- **💻 SoftwareLicense** - Software usage, distribution rights
- **💰 FinancialInstrument** - Bonds, stocks, derivatives
- **📄 PromissoryNote** - IOUs, payment promises
- **🏅 ProfessionalLicense** - Professional certifications, permits
- **🎫 AccessRight** - Membership rights, access permissions
- **🗳️ VotingRight** - Shareholder voting, governance rights

### Real-World Legal Obligations (Obligation Tokens)
- **💵 PaymentObligation** - Loan payments, rent, mortgages
- **📦 DeliveryObligation** - Shipping, delivery requirements
- **🔧 MaintenanceObligation** - Maintenance contracts, warranties
- **📊 ComplianceObligation** - Regulatory reporting, compliance
- **📋 ReportingObligation** - Financial reporting, disclosures
- **🤐 ConfidentialityObligation** - NDAs, confidentiality agreements
- **🚫 NonCompeteObligation** - Non-compete agreements
- **🛡️ WarrantyObligation** - Product warranties, guarantees

### Module Relationships

Each token type leverages different SmartLedger-BSV capabilities:

```javascript
// Property title using multiple modules
const propertyToken = bsv.createRightToken({
  type: 'PropertyTitle',              // LTP: Legal structure
  owner: ownerDID,                    // GDAF: Digital identity  
  jurisdiction: 'US-CA',              // LTP: Legal compliance
  // Signed with hardened crypto     // Core: Enhanced security
  // Can be covenant-protected       // SmartContract: Enforcement
  // Keys can use Shamir sharing     // Shamir: Distributed control
});
```

## � LTP Internal Architecture

LTP is composed of 6 specialized modules working together:

### Core Modules (`lib/ltp/`)

1. **`right.js`** - Legal rights token creation and validation
   - Creates property titles, licenses, permits
   - Handles token transfers and ownership changes
   - Validates right types and legal structures

2. **`obligation.js`** - Legal obligation token management  
   - Creates payment, delivery, compliance obligations
   - Tracks obligation lifecycle and fulfillment
   - Manages breach detection and remediation

3. **`claim.js`** - Legal claim validation and attestation
   - Validates claims against legal schemas
   - Provides attestation and notarization primitives
   - Handles bulk claim processing

4. **`proof.js`** - Cryptographic proof generation
   - Creates signature proofs for authenticity
   - Generates selective disclosure proofs for privacy
   - Produces legal validity proofs for compliance
   - Handles zero-knowledge proofs for sensitive data

5. **`registry.js`** - Token registry management
   - Prepares registry configurations and policies
   - Handles token registration and approval workflows
   - Manages revocation and status tracking
   - Provides search and audit capabilities

6. **`anchor.js`** - Blockchain anchoring preparation
   - Prepares commitment hashes for blockchain storage
   - Handles batch anchoring for efficiency
   - Creates merkle proofs for token verification
   - Formats revocation data for on-chain publishing

### How These Work Together

```javascript
// Complete workflow using all 6 modules
const claim = bsv.LTP.Claim.validate(propertyData, 'PropertyTitle');     // 1. Validate
const rightToken = bsv.LTP.Right.create(claim, ownerKey);               // 2. Create right  
const obligation = bsv.LTP.Obligation.create(rightToken, taxData);      // 3. Create obligation
const proof = bsv.LTP.Proof.createSignature(rightToken, issuerKey);     // 4. Generate proof
const registry = bsv.LTP.Registry.register(rightToken);                 // 5. Prepare registry
const anchor = bsv.LTP.Anchor.prepareCommitment(rightToken);            // 6. Prepare anchoring
```

## 🔐 Security & Trust Features

- **🔒 Cryptographic Signatures** - All tokens signed with enhanced elliptic curves
- **🎭 Selective Disclosure** - Privacy-preserving proof generation with zero-knowledge
- **⚖️ Legal Validity Proofs** - Jurisdiction-specific compliance verification
- **⛓️ Blockchain Anchoring** - Immutable commitment proofs on BSV blockchain
- **📚 Registry Management** - Complete token lifecycle tracking and audit trails
- **🛡️ Smart Contract Protection** - Optional covenant enforcement for automatic compliance
- **🔑 Multi-Signature Support** - Shamir secret sharing for distributed key management

## 🎯 Real-World Applications

LTP integrates with other SmartLedger-BSV modules for complete enterprise solutions:

### 🏡 Real Estate & Property Management
```javascript
// Complete property title system with GDAF identity verification
const identity = bsv.GDAF.createIdentity(ownerData);                    // Identity layer
const titleClaim = bsv.LTP.Claim.validate(propertyData, 'RealEstate'); // Legal validation
const propertyTitle = bsv.LTP.Right.create(titleClaim, ownerKey);      // Create title token
const transferCovenant = bsv.SmartContract.createCovenant(titleRules); // Smart enforcement
const sharedKey = bsv.Shamir.split(ownerKey, 3, 5);                   // Distributed security
```

### 💼 Corporate Governance & Compliance
```javascript  
// Business license with automatic compliance monitoring
const businessLicense = bsv.LTP.Right.create(licenseData, corporateKey);
const complianceObligation = bsv.LTP.Obligation.create(license, regulations);
const auditCovenant = bsv.SmartContract.createAuditContract(complianceRules);
const executiveKeys = bsv.Shamir.split(corporateKey, 3, 7);
```

### 🏦 Financial Services & Banking
```javascript
// Loan agreement with payment automation
const loanObligation = bsv.LTP.Obligation.create(loanTerms, borrowerKey);
const paymentCovenant = bsv.SmartContract.createPaymentSchedule(terms);
const creditProof = bsv.LTP.Proof.createSignature(creditData, bankKey);
const escrowKeys = bsv.Shamir.split(escrowKey, 2, 3);
```

### 🎓 Education & Professional Certification
```javascript
// Academic credential with verification
const degreeData = bsv.GDAF.createCredential(graduateData);
const degreeClaim = bsv.LTP.Claim.validate(degreeData, 'AcademicDegree');
const diploma = bsv.LTP.Right.create(degreeClaim, universityKey);
const verificationProof = bsv.LTP.Proof.createValidity(diploma, accreditorKey);
```

### 🚛 Supply Chain & Logistics
```javascript
// Delivery tracking with quality assurance
const deliveryObligation = bsv.LTP.Obligation.create(shipmentData, supplierKey);
const qualityContract = bsv.SmartContract.createQualityGates(standards);
const trackingProof = bsv.LTP.Proof.createSignature(locationData, carrierKey);
const insuranceKeys = bsv.Shamir.split(insuranceKey, 2, 4);
```

### 🏛️ Government & Public Services
```javascript
// Government permit with regulatory compliance
const permitData = bsv.GDAF.createGovernmentID(citizenData);
const permitClaim = bsv.LTP.Claim.validate(permitData, 'BuildingPermit');
const buildingPermit = bsv.LTP.Right.create(permitClaim, governmentKey);
const complianceContract = bsv.SmartContract.createRegulatoryContract(codes);
```

## 📋 Token Type Categories

### Right Tokens 🏆
- **Property Titles** - Real estate, vehicles, patents, trademarks
- **Business Licenses** - Professional, operational, regulatory permits  
- **Access Rights** - Security, membership, usage privileges
- **Intellectual Property** - Copyrights, licensing agreements, royalties

### Obligation Tokens 📝
- **Payment Obligations** - Invoices, loans, payment schedules, bonds
- **Delivery Obligations** - Supply contracts, service agreements, milestones
- **Compliance Obligations** - Regulatory, audit, reporting requirements
- **Performance Obligations** - SLAs, quality standards, warranty terms

### Legal Claims 🎖️
- **Identity Claims** - Certifications, credentials, qualifications, clearances
- **Property Claims** - Ownership, liens, encumbrances, easements  
- **Performance Claims** - Warranties, guarantees, quality assurance
- **Compliance Claims** - Regulatory adherence, audit results, certifications

## 📖 Examples

See the working demonstration files:
- `demos/ltp_demo.js` - Complete LTP workflow
- `demos/ltp_primitives_demo.js` - Primitives-only architecture
- `demos/complete_ltp_demo.js` - End-to-end with real BSV keys

## 🌐 W3C Compliance

All LTP tokens follow W3C Verifiable Credential standards with SmartLedger extensions for legal compliance and Bitcoin SV blockchain integration.

## ⚖️ Legal Framework

The Legal Token Protocol is designed to work within existing legal frameworks and provides primitives for:
- Legal claim attestation and validation
- Jurisdictional compliance checking
- Regulatory proof generation
- Audit trail preparation
- Right and obligation lifecycle management

For trust law integration, see [Trust Protocol Mapping](../technical/trust_law.md).