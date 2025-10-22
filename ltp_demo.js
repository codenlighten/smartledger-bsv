// Legal Token Protocol (LTP) Demo
// Demonstrates the creation, validation, and management of legal tokens

var bsv = require('./index.js')

console.log('=== Legal Token Protocol (LTP) Demo ===\n')

// Test 1: Create Property Right Token
console.log('1. Creating Property Right Token...')

var ownerKey = new bsv.PrivateKey()
var propertyData = {
  type: 'PropertyTitle',
  owner: 'did:smartledger:' + ownerKey.toPublicKey().toString(),
  jurisdiction: 'US-CA',
  property: {
    address: '123 Main St, San Francisco, CA 94105',
    parcelId: 'APN-12345678',
    coordinates: {
      lat: 37.7749,
      lng: -122.4194
    },
    area: {
      value: 1000,
      unit: 'sqft'
    }
  },
  value: {
    amount: 850000,
    currency: 'USD'
  },
  legalDescription: 'Lot 1, Block 2, Map 3456, City of San Francisco',
  restrictions: ['zoning:residential', 'height:35ft'],
  issuanceDate: new Date().toISOString(),
  expirationDate: new Date(Date.now() + 365 * 24 * 60 * 60 * 1000).toISOString() // 1 year
}

var propertyToken = bsv.createRightToken(propertyData, ownerKey, {
  addProof: true,
  anchor: false, // Skip blockchain anchoring for demo
  register: false // Skip registry for demo
})

if (propertyToken.success) {
  console.log('✓ Property token created successfully')
  console.log('  Token ID:', propertyToken.token.id)
  console.log('  Token Type:', propertyToken.token.type)
  console.log('  Owner:', propertyToken.token.credentialSubject.id)
  console.log('  Property Address:', propertyToken.token.credentialSubject.claim.property.address)
  console.log('  Token Hash:', propertyToken.token.tokenHash)
} else {
  console.log('✗ Failed to create property token:', propertyToken.error)
}

console.log()

// Test 2: Verify Token
console.log('2. Verifying Property Token...')

var verification = bsv.verifyLegalToken(propertyToken.token, ownerKey.toPublicKey().toString())

if (verification.valid) {
  console.log('✓ Token signature is valid')
  console.log('  Public Key:', verification.publicKey)
  console.log('  Token Hash:', verification.tokenHash)
} else {
  console.log('✗ Token verification failed:', verification.error)
}

console.log()

// Test 3: Create Vehicle Title Token
console.log('3. Creating Vehicle Title Token...')

var vehicleOwnerKey = new bsv.PrivateKey()
var vehicleData = {
  type: 'VehicleTitle',
  owner: 'did:smartledger:' + vehicleOwnerKey.toPublicKey().toString(),
  jurisdiction: 'US-TX',
  vehicle: {
    vin: '1HGBH41JXMN109186',
    make: 'Tesla',
    model: 'Model S',
    year: 2023,
    color: 'Pearl White',
    mileage: 5000
  },
  value: {
    amount: 95000,
    currency: 'USD'
  },
  registrationNumber: 'TX-ABC-1234',
  issuanceDate: new Date().toISOString()
}

var vehicleToken = bsv.createRightToken(vehicleData, vehicleOwnerKey, {
  addProof: true
})

if (vehicleToken.success) {
  console.log('✓ Vehicle token created successfully')
  console.log('  Token ID:', vehicleToken.token.id)
  console.log('  VIN:', vehicleToken.token.credentialSubject.claim.vehicle.vin)
  console.log('  Registration:', vehicleToken.token.credentialSubject.claim.registrationNumber)
} else {
  console.log('✗ Failed to create vehicle token:', vehicleToken.error)
}

console.log()

// Test 4: Transfer Property Right
console.log('4. Transferring Property Right...')

var newOwnerKey = new bsv.PrivateKey()
var newOwnerDID = 'did:smartledger:' + newOwnerKey.toPublicKey().toString()

// Create LTP instance for transfer operations
var ltp = new bsv.LTP()

var transfer = ltp.transferRight(
  propertyToken.token,
  newOwnerDID,
  ownerKey,
  {
    reason: 'Sale',
    consideration: {
      amount: 875000,
      currency: 'USD'
    },
    registeredBy: newOwnerDID
  }
)

if (transfer.success) {
  console.log('✓ Property transferred successfully')
  console.log('  Transfer ID:', transfer.transferId)
  console.log('  New Owner:', transfer.token.credentialSubject.id)
  console.log('  Transfer Date:', transfer.transferredAt)
  console.log('  Original Owner:', transfer.transferProof.issuer)
} else {
  console.log('✗ Transfer failed:', transfer.error)
}

console.log()

// Test 5: Create Obligation from Right
console.log('5. Creating Obligation from Property Right...')

var obligationData = {
  obligationType: 'PropertyTax',
  obligor: transfer.token.credentialSubject.id, // New owner is obligated
  obligee: 'City of San Francisco',
  jurisdiction: 'US-CA',
  description: 'Annual property tax payment obligation',
  amount: {
    value: 10200, // $10,200 annual property tax
    currency: 'USD'
  },
  dueDate: new Date(Date.now() + 365 * 24 * 60 * 60 * 1000).toISOString(), // Due in 1 year
  recurrence: 'ANNUAL',
  penalties: {
    lateFeePct: 0.015, // 1.5% monthly late fee
    maxLateFee: 5000
  }
}

var obligation = ltp.createObligation(transfer.token, obligationData, newOwnerKey)

if (obligation.success) {
  console.log('✓ Tax obligation created successfully')
  console.log('  Obligation ID:', obligation.obligation.id)
  console.log('  Obligor:', obligation.obligation.credentialSubject.id)
  console.log('  Obligee:', obligation.obligation.credentialSubject.obligation.obligee)
  console.log('  Amount:', obligation.obligation.credentialSubject.obligation.amount.value, obligation.obligation.credentialSubject.obligation.amount.currency)
  console.log('  Due Date:', obligation.obligation.credentialSubject.obligation.dueDate)
} else {
  console.log('✗ Failed to create obligation:', obligation.error)
}

console.log()

// Test 6: Validate Legal Claims
console.log('6. Validating Legal Claims...')

var propertyClaimData = {
  propertyId: 'APN-87654321',
  address: {
    street: '456 Oak Street',
    city: 'Los Angeles', 
    state: 'CA',
    zipCode: '90210',
    country: 'US'
  },
  ownershipType: 'fee_simple',
  owner: {
    name: 'John Doe',
    ssn: '***-**-1234' // Masked for privacy
  },
  legalDescription: 'Lot 5, Block 10, Tract 5000',
  recordedDate: '2023-01-15T10:30:00Z',
  grantorGrantee: {
    grantor: 'Jane Smith',
    grantee: 'John Doe'
  }
}

var claimValidation = bsv.validateLegalClaim(propertyClaimData, 'PropertyTitle')

if (claimValidation.valid) {
  console.log('✓ Property claim is valid')
  console.log('  Required fields present:', claimValidation.requiredFields || 'N/A')
  console.log('  Schema:', claimValidation.schema)
} else {
  console.log('✗ Property claim validation failed:')
  if (claimValidation.errors) {
    claimValidation.errors.forEach(function(error) {
      console.log('    -', error)
    })
  }
}

console.log()

// Test 7: Create Selective Disclosure Proof
console.log('7. Creating Selective Disclosure Proof...')

var revealedFields = [
  'type',
  'jurisdiction',
  'property.address',
  'property.area',
  'issuanceDate'
]

var nonce = 'demo-nonce-' + Date.now()

var disclosureProof = bsv.createSelectiveDisclosure(transfer.token, revealedFields, nonce)

if (disclosureProof.success) {
  console.log('✓ Selective disclosure proof created')
  console.log('  Proof type:', disclosureProof.proof.type)
  console.log('  Disclosed fields:', disclosureProof.proof.disclosures.length)
  console.log('  Total fields:', disclosureProof.proof.totalFields)
  console.log('  Merkle root:', disclosureProof.proof.merkleRoot)
  
  // Show disclosed values
  console.log('  Disclosed values:')
  disclosureProof.proof.disclosures.forEach(function(disclosure) {
    console.log('    ' + disclosure.path + ':', disclosure.value)
  })
} else {
  console.log('✗ Failed to create disclosure proof:', disclosureProof.error)
}

console.log()

// Test 8: Legal Registry Operations
console.log('8. Testing Legal Registry Operations...')

var registryConfig = {
  id: 'demo-registry-' + Date.now(),
  name: 'California Property Registry',
  jurisdiction: 'US-CA',
  authority: 'California Department of Real Estate',
  allowPublicRegistration: false,
  requireApproval: true,
  enableRevocation: true,
  enableAuditTrail: true
}

var registry = bsv.createLegalRegistry(registryConfig)

console.log('✓ Legal registry created')
console.log('  Registry ID:', registry.id)
console.log('  Jurisdiction:', registry.jurisdiction)
console.log('  Authority:', registry.authority)

// Create LTP instance with registry
var ltpWithRegistry = new bsv.LTP({ registry: registryConfig })

// Register our property token
var registrationResult = ltpWithRegistry.registry ? 
  bsv.LTP.Registry.registerToken(ltpWithRegistry.registry, transfer.token, {
    registeredBy: 'California DRE'
  }) : null

if (registrationResult && registrationResult.success) {
  console.log('✓ Token registered successfully')
  console.log('  Registration ID:', registrationResult.registrationId)
  console.log('  Status:', registrationResult.status)
} else {
  console.log('✗ Registration failed:', registrationResult ? registrationResult.error : 'No registry')
}

console.log()

// Test 9: Show Available Types and Schemas
console.log('9. Available Right Types and Claim Schemas...')

var rightTypes = bsv.getRightTypes()
var claimSchemas = bsv.getClaimSchemas()

console.log('Available Right Types:')
Object.keys(rightTypes).forEach(function(key) {
  console.log('  -', key + ':', rightTypes[key])
})

console.log('\nAvailable Claim Schemas:')
Object.keys(claimSchemas).forEach(function(key) {
  console.log('  -', key + ':', claimSchemas[key].title)
})

console.log()

// Test 10: Legal Validity Proof
console.log('10. Creating Legal Validity Proof...')

var jurisdiction = {
  code: 'US-CA',
  requirements: [
    {
      type: 'field_present',
      field: 'jurisdiction'
    },
    {
      type: 'field_present',
      field: 'property.address'
    },
    {
      type: 'temporal_validity'
    }
  ]
}

var validityProof = bsv.createLegalValidityProof(transfer.token, jurisdiction, nonce)

if (validityProof.success) {
  console.log('✓ Legal validity proof created')
  console.log('  Valid:', validityProof.proof.valid)
  console.log('  Jurisdiction:', validityProof.proof.jurisdiction)
  console.log('  Checks performed:', validityProof.proof.checks.length)
  
  validityProof.proof.checks.forEach(function(check) {
    console.log('    -', check.requirement + ':', check.satisfied ? '✓' : '✗')
  })
} else {
  console.log('✗ Failed to create validity proof:', validityProof.error)
}

console.log('\n=== Legal Token Protocol Demo Complete ===')
console.log('\nLTP provides:')
console.log('✓ Legal right token creation and management')
console.log('✓ Cryptographic proof and verification')
console.log('✓ Token transfer with audit trails')
console.log('✓ Legal obligation creation from rights')
console.log('✓ Selective disclosure for privacy')
console.log('✓ Registry management and compliance')
console.log('✓ Legal validity proofs')
console.log('✓ Blockchain anchoring capabilities')
console.log('\nSmartLedger Architecture:')
console.log('• Transport Layer: SmartLedger BSV (Bitcoin SV blockchain)')
console.log('• Identity Layer: GDAF (W3C Verifiable Credentials)')
console.log('• Legal Semantics Layer: LTP (Legal Token Protocol)')