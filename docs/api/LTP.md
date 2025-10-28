# Legal Token Protocol (LTP) API Reference

Complete API documentation for SmartLedger-BSV Legal Token Protocol.

## Core Functions

### Direct Token Operations

#### `bsv.createRightToken(data, privateKey, options)`

Creates a legal right token with cryptographic signature.

**Parameters:**
- `data` (Object) - Token data structure
  - `type` (String) - Token type from supported types
  - `owner` (String) - Owner DID
  - `jurisdiction` (String) - Legal jurisdiction
  - Additional type-specific fields
- `privateKey` (PrivateKey) - Signing key
- `options` (Object) - Configuration options
  - `addProof` (Boolean) - Add cryptographic proof (default: true)
  - `anchor` (Boolean) - Blockchain anchoring (default: false)
  - `register` (Boolean) - Registry registration (default: false)

**Returns:**
```javascript
{
  success: Boolean,
  token: {
    id: String,                    // Unique token ID
    type: Array,                   // W3C VC types
    issuer: String,                // Issuer DID
    issuanceDate: String,          // ISO timestamp
    credentialSubject: Object,     // Token claims
    proof: Object,                 // Cryptographic proof
    tokenHash: String              // Token hash
  },
  type: String                     // Token type
}
```

#### `bsv.verifyLegalToken(token, publicKey)`

Verifies token cryptographic signature and structure.

**Parameters:**
- `token` (Object) - Token to verify
- `publicKey` (String) - Verification public key

**Returns:**
```javascript
{
  valid: Boolean,
  publicKey: String,
  tokenHash: String,
  error?: String
}
```

#### `bsv.validateLegalClaim(claimData, schemaType)`

Validates claim data against legal schemas.

**Parameters:**
- `claimData` (Object) - Claim to validate
- `schemaType` (String) - Schema type

**Returns:**
```javascript
{
  valid: Boolean,
  schema: String,
  requiredFields?: Array,
  errors?: Array
}
```

### Privacy Functions

#### `bsv.createSelectiveDisclosure(token, revealedFields, nonce)`

Creates selective disclosure proof for privacy.

**Parameters:**
- `token` (Object) - Token for disclosure
- `revealedFields` (Array) - Field paths to reveal
- `nonce` (String) - Unique nonce

**Returns:**
```javascript
{
  success: Boolean,
  proof: {
    type: String,
    disclosures: Array,
    totalFields: Number,
    merkleRoot: String
  }
}
```

### Registry Functions

#### `bsv.createLegalRegistry(config)`

Creates registry configuration.

**Parameters:**
- `config` (Object) - Registry configuration

**Returns:**
```javascript
{
  success: Boolean,
  registry: {
    id: String,
    name: String,
    jurisdiction: String,
    authority: String,
    created: String
  }
}
```

#### `bsv.createLegalValidityProof(token, jurisdiction, nonce)`

Creates legal validity proof.

**Parameters:**
- `token` (Object) - Token to validate
- `jurisdiction` (Object) - Jurisdiction rules
- `nonce` (String) - Proof nonce

**Returns:**
```javascript
{
  success: Boolean,
  proof: {
    type: String,
    jurisdiction: String,
    valid: Boolean,
    checks: Array,
    complianceHash: String
  },
  valid: Boolean
}
```

## LTP Class

### Constructor

```javascript
const ltp = new bsv.LTP(config);
```

**Parameters:**
- `config` (Object) - Optional configuration

### Instance Methods

#### `ltp.createRightToken(rightData, privateKey, options)`

Creates right token via class instance.

#### `ltp.transferRight(token, newOwner, ownerKey, options)`

Transfers right token to new owner.

**Parameters:**
- `token` (Object) - Token to transfer
- `newOwner` (String) - New owner DID
- `ownerKey` (PrivateKey) - Current owner key
- `options` (Object) - Transfer options

**Returns:**
```javascript
{
  success: Boolean,
  token: Object,           // Updated token
  transferId: String,      // Transfer ID
  transferredAt: String,   // Timestamp
  transferProof: Object    // Transfer proof
}
```

#### `ltp.createObligation(rightToken, obligationData, privateKey)`

Creates obligation from right token.

**Parameters:**
- `rightToken` (Object) - Source right token
- `obligationData` (Object) - Obligation details
- `privateKey` (PrivateKey) - Signing key

## Primitives API

### Preparation Functions

#### `bsv.prepareRightToken(type, issuerDID, subjectDID, claim, issuerPrivateKey, options)`

Prepares right token data (no external operations).

**Parameters:**
- `type` (String) - Right type
- `issuerDID` (String) - Issuer DID
- `subjectDID` (String) - Subject DID
- `claim` (Object) - Claim data
- `issuerPrivateKey` (PrivateKey) - Signing key
- `options` (Object) - Options

**Returns:**
```javascript
{
  success: Boolean,
  rightToken: Object,           // Prepared token
  tokenHash: String,            // Token hash
  metadata: {
    type: String,
    issuer: String,
    subject: String,
    transferable: Boolean,
    jurisdiction: String
  },
  externalOperations: Object    // Operations for external systems
}
```

#### `bsv.prepareObligationToken(type, issuerDID, obligorDID, obligation, issuerPrivateKey, options)`

Prepares obligation token data.

#### `bsv.prepareSelectiveDisclosure(token, revealedFields, nonce)`

Prepares selective disclosure proof data.

#### `bsv.prepareLegalValidityProof(token, jurisdiction, nonce)`

Prepares legal validity proof data.

#### `bsv.prepareTokenCommitment(token, options)`

Prepares blockchain commitment data.

#### `bsv.prepareBatchCommitment(tokens, options)`

Prepares batch commitment for multiple tokens.

## Supported Types

### Right Types

- `PropertyTitle` - Real estate ownership
- `VehicleTitle` - Vehicle ownership  
- `IntellectualProperty` - IP rights
- `MusicLicense` - Music licensing
- `SoftwareLicense` - Software licensing
- `FinancialInstrument` - Financial instruments
- `PromissoryNote` - Promissory notes
- `Bond` - Bond instruments
- `EquityShare` - Equity shares
- `ProfessionalLicense` - Professional licenses
- `RegulatoryPermit` - Regulatory permits
- `AccessRight` - Access rights
- `VotingRight` - Voting rights
- `RoyaltyRight` - Royalty rights
- `UsageRight` - Usage rights

### Obligation Types

- `PaymentObligation` - Payment duties
- `DeliveryObligation` - Delivery requirements
- `PerformanceObligation` - Performance duties
- `MaintenanceObligation` - Maintenance requirements
- `ComplianceObligation` - Regulatory compliance
- `ReportingObligation` - Reporting duties
- `ConfidentialityObligation` - Confidentiality requirements
- `NonCompeteObligation` - Non-compete agreements
- `WarrantyObligation` - Warranty obligations
- `SupportObligation` - Support requirements

### Status Values

- `PENDING` - Awaiting action
- `ACTIVE` - Currently active
- `IN_PROGRESS` - In progress
- `COMPLETED` - Completed successfully
- `OVERDUE` - Past due date
- `BREACHED` - Obligation breached
- `WAIVED` - Waived by authority
- `TERMINATED` - Terminated

## Utility Functions

### `bsv.getRightTypes()`

Returns available right types.

### `bsv.getObligationTypes()`

Returns available obligation types.

### `bsv.getClaimSchemas()`

Returns available claim schemas.

### `bsv.canonicalizeClaim(claim)`

Canonicalizes claim for consistent hashing.

### `bsv.hashClaim(claim)`

Creates hash of claim data.

## Error Handling

All LTP functions return result objects with success indicators:

```javascript
{
  success: Boolean,
  // ... result data if successful
  error?: String        // Error message if failed
}
```

Always check the `success` field before using result data.

## Examples

See working examples in:
- `demos/ltp_demo.js`
- `demos/ltp_primitives_demo.js` 
- `demos/complete_ltp_demo.js`