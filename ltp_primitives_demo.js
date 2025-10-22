/**
 * SmartLedger-BSV Legal Token Protocol (LTP) - Primitives-Only Architecture Demo
 * 
 * This demonstration shows how the new primitives-only approach works:
 * - Library provides all preparation and validation primitives
 * - External systems handle blockchain publishing and storage
 * - Complete separation between foundation tools and application logic
 */

const bsv = require('./index.js')

console.log('🚀 SmartLedger-BSV LTP Primitives Demo')
console.log('=====================================\n')

// Demo keys and identities
const issuerPrivateKey = new bsv.PrivateKey()
const issuerPublicKey = issuerPrivateKey.publicKey
const ownerPrivateKey = new bsv.PrivateKey()
const obligorPrivateKey = new bsv.PrivateKey()

const issuerDID = `did:bsv:${issuerPublicKey.toString()}`
const ownerDID = `did:bsv:${ownerPrivateKey.publicKey.toString()}`
const obligorDID = `did:bsv:${obligorPrivateKey.publicKey.toString()}`

console.log('📋 Demo Participants:')
console.log(`Issuer DID: ${issuerDID}`)
console.log(`Owner DID: ${ownerDID}`)
console.log(`Obligor DID: ${obligorDID}\n`)

/**
 * STEP 1: LEGAL CLAIM PREPARATION
 * Prepare and validate legal claims using standardized schemas
 */
console.log('📝 STEP 1: Legal Claim Preparation')
console.log('----------------------------------')

// Prepare property ownership claim
const propertyClaimData = {
  type: 'PropertyOwnership',
  property: {
    address: '123 Blockchain Street, Crypto City, CC 12345',
    parcel_id: 'BLK-2024-001-DEMO',
    property_type: 'residential',
    square_footage: 2500,
    estimated_value: 750000
  },
  owner: ownerDID,
  acquisition_date: '2024-01-15',
  deed_reference: 'DEED-2024-CC-001-DEMO'
}

// Validate claim against schema
const claimValidation = bsv.prepareClaimValidation(propertyClaimData, 'PropertyOwnership')
console.log('✅ Property claim validation result:', claimValidation.isValid ? 'VALID' : 'INVALID')
if (!claimValidation.isValid) {
  console.log('❌ Validation errors:', claimValidation.errors)
}

// Prepare claim for attestation
const claimAttestation = bsv.prepareClaimAttestation(
  propertyClaimData, 
  'PropertyOwnership', 
  {
    did: issuerDID,
    role: 'property_registrar',
    jurisdiction: 'crypto_city'
  }
)
console.log('📋 Claim attestation prepared for external processing')
console.log('   Claim Hash:', claimAttestation.claimHash)
console.log('   Attestor:', claimAttestation.attestor.role)
console.log('')

/**
 * STEP 2: RIGHT TOKEN PREPARATION
 * Create legal rights tokens based on validated claims
 */
console.log('🏛️ STEP 2: Right Token Preparation')
console.log('----------------------------------')

// Prepare property ownership right token
const rightTokenPreparation = bsv.prepareRightToken(
  'PROPERTY_OWNERSHIP',
  issuerDID,
  ownerDID,
  propertyClaimData,
  issuerPrivateKey,
  {
    jurisdiction: 'crypto_city',
    validUntil: '2034-01-15',
    transferable: true,
    divisible: false
  }
)

console.log('🏠 Property ownership right token prepared:')
console.log('   Token ID:', rightTokenPreparation.tokenId)
console.log('   Right Type:', rightTokenPreparation.rightType)
console.log('   Subject:', rightTokenPreparation.subjectDID)
console.log('   Transferable:', rightTokenPreparation.transferable)
console.log('   Valid Until:', rightTokenPreparation.validUntil)

// Prepare verification data for the right token
const rightVerification = bsv.prepareRightTokenVerification(rightTokenPreparation.token)
console.log('✅ Right token verification prepared:', rightVerification.isValid ? 'VALID' : 'INVALID')
console.log('')

/**
 * STEP 3: OBLIGATION TOKEN PREPARATION
 * Create legal obligations tied to rights
 */
console.log('⚖️ STEP 3: Obligation Token Preparation')
console.log('-------------------------------------')

// Prepare mortgage obligation
const mortgageObligationData = {
  type: 'mortgage_payment',
  principal_amount: 600000,
  interest_rate: 0.065,
  payment_schedule: 'monthly',
  payment_amount: 3582.17,
  payments_remaining: 348,
  next_payment_date: '2024-11-15',
  collateral_reference: rightTokenPreparation.tokenId
}

const obligationTokenPreparation = bsv.prepareObligationToken(
  'FINANCIAL_OBLIGATION',
  issuerDID,
  obligorDID,
  mortgageObligationData,
  issuerPrivateKey,
  {
    priority: 'HIGH',
    jurisdiction: 'crypto_city',
    enforcement_mechanism: 'collateral_seizure',
    grace_period_days: 30
  }
)

console.log('💰 Mortgage obligation token prepared:')
console.log('   Obligation ID:', obligationTokenPreparation.tokenId)
console.log('   Obligor:', obligationTokenPreparation.obligorDID)
console.log('   Type:', obligationTokenPreparation.obligationType)
console.log('   Principal Amount:', `$${mortgageObligationData.principal_amount.toLocaleString()}`)
console.log('   Monthly Payment:', `$${mortgageObligationData.payment_amount.toLocaleString()}`)
console.log('   Priority Level:', obligationTokenPreparation.priority)
console.log('')

/**
 * STEP 4: CRYPTOGRAPHIC PROOF PREPARATION
 * Generate proofs for privacy and legal validity
 */
console.log('🔐 STEP 4: Cryptographic Proof Preparation')
console.log('-----------------------------------------')

// Prepare selective disclosure proof (hide sensitive financial data)
const disclosureFields = ['type', 'payment_schedule', 'next_payment_date'] // Hide amounts
const selectiveDisclosure = bsv.prepareSelectiveDisclosure(
  obligationTokenPreparation.token,
  disclosureFields,
  'demo_nonce_2024'
)

console.log('🎭 Selective disclosure proof prepared:')
console.log('   Revealed Fields:', disclosureFields.join(', '))
console.log('   Hidden Fields: principal_amount, interest_rate, payment_amount')
console.log('   Proof Hash:', selectiveDisclosure.proofHash)

// Prepare legal validity proof
const legalValidityProof = bsv.prepareLegalValidityProof(
  rightTokenPreparation.token,
  'crypto_city',
  'legal_validity_nonce_2024'
)

console.log('⚖️ Legal validity proof prepared:')
console.log('   Jurisdiction:', legalValidityProof.jurisdiction)
console.log('   Validity Hash:', legalValidityProof.validityHash)
console.log('   Legal Framework:', legalValidityProof.legalFramework)
console.log('')

/**
 * STEP 5: REGISTRY PREPARATION
 * Prepare tokens for external registry systems
 */
console.log('📚 STEP 5: Registry Management Preparation')
console.log('-----------------------------------------')

// Prepare registry configuration
const registryConfig = bsv.prepareRegistry({
  name: 'Crypto City Property Registry',
  jurisdiction: 'crypto_city',
  authority: issuerDID,
  compliance_framework: 'GDAF_W3C',
  storage_type: 'distributed_ledger'
})

console.log('🏛️ Registry configuration prepared:')
console.log('   Registry Name:', registryConfig.name)
console.log('   Authority:', registryConfig.authority)
console.log('   Compliance:', registryConfig.compliance_framework)

// Prepare token registration
const tokenRegistration = bsv.prepareTokenRegistration(
  rightTokenPreparation.token,
  registryConfig,
  {
    category: 'property_rights',
    public_visibility: false,
    audit_level: 'full'
  }
)

console.log('📋 Token registration prepared for external processing:')
console.log('   Registration ID:', tokenRegistration.registrationId)
console.log('   Category:', tokenRegistration.category)
console.log('   Audit Level:', tokenRegistration.auditLevel)
console.log('')

/**
 * STEP 6: BLOCKCHAIN ANCHORING PREPARATION
 * Prepare tokens for blockchain commitment
 */
console.log('⛓️ STEP 6: Blockchain Anchoring Preparation')
console.log('------------------------------------------')

// Prepare individual token commitment
const tokenCommitment = bsv.prepareTokenCommitment(rightTokenPreparation.token, {
  include_metadata: true,
  merkle_proof: true,
  commitment_type: 'sha256'
})

console.log('🔗 Token commitment prepared for blockchain:')
console.log('   Commitment Hash:', tokenCommitment.commitmentHash)
console.log('   Merkle Root:', tokenCommitment.merkleRoot)
console.log('   Commitment Type:', tokenCommitment.commitmentType)

// Prepare batch commitment for multiple tokens
const tokenBatch = [rightTokenPreparation.token, obligationTokenPreparation.token]
const batchCommitment = bsv.prepareBatchCommitment(tokenBatch, {
  batch_size: 2,
  include_individual_proofs: true,
  optimization: 'gas_efficient'
})

console.log('📦 Batch commitment prepared:')
console.log('   Batch Size:', batchCommitment.batchSize)
console.log('   Batch Root:', batchCommitment.batchRoot)
console.log('   Individual Proofs:', batchCommitment.includeIndividualProofs ? 'YES' : 'NO')
console.log('')

/**
 * STEP 7: OBLIGATION LIFECYCLE MANAGEMENT
 * Demonstrate obligation fulfillment and monitoring
 */
console.log('📊 STEP 7: Obligation Lifecycle Management')
console.log('-----------------------------------------')

// Prepare payment fulfillment
const paymentFulfillment = {
  payment_amount: 3582.17,
  payment_date: '2024-10-15',
  payment_method: 'bank_transfer',
  transaction_reference: 'TXN-2024-OCT-001',
  remaining_balance: 596417.83
}

const fulfillmentPreparation = bsv.prepareObligationFulfillment(
  obligationTokenPreparation.token,
  paymentFulfillment,
  obligorPrivateKey,
  {
    update_schedule: true,
    generate_receipt: true,
    notify_creditor: true
  }
)

console.log('💳 Payment fulfillment prepared:')
console.log('   Payment Amount:', `$${paymentFulfillment.payment_amount.toLocaleString()}`)
console.log('   Payment Date:', paymentFulfillment.payment_date)
console.log('   Remaining Balance:', `$${paymentFulfillment.remaining_balance.toLocaleString()}`)
console.log('   Receipt Generated:', fulfillmentPreparation.receiptGenerated ? 'YES' : 'NO')

// Prepare monitoring report
const monitoringReport = bsv.prepareObligationMonitoringReport(
  [obligationTokenPreparation.token],
  {
    period: '2024-Q3',
    include_performance_metrics: true,
    risk_assessment: true
  }
)

console.log('📈 Obligation monitoring report prepared:')
console.log('   Monitoring Period:', monitoringReport.period)
console.log('   Performance Status:', monitoringReport.performanceStatus)
console.log('   Risk Level:', monitoringReport.riskLevel)
console.log('')

/**
 * STEP 8: TRANSFER PREPARATION
 * Prepare right token transfer to new owner
 */
console.log('🔄 STEP 8: Right Token Transfer Preparation')
console.log('------------------------------------------')

const newOwnerPrivateKey = new bsv.PrivateKey()
const newOwnerDID = `did:bsv:${newOwnerPrivateKey.publicKey.toString()}`

const transferPreparation = bsv.prepareRightTokenTransfer(
  rightTokenPreparation.token,
  newOwnerDID,
  ownerPrivateKey,
  {
    transfer_type: 'sale',
    consideration: 750000,
    effective_date: '2024-12-01',
    include_obligations: true,
    clear_title: true
  }
)

console.log('🏡 Property transfer prepared:')
console.log('   Current Owner:', ownerDID.substring(0, 40) + '...')
console.log('   New Owner:', newOwnerDID.substring(0, 40) + '...')
console.log('   Transfer Type:', transferPreparation.transferType)
console.log('   Consideration:', `$${transferPreparation.consideration.toLocaleString()}`)
console.log('   Effective Date:', transferPreparation.effectiveDate)
console.log('   Clear Title:', transferPreparation.clearTitle ? 'YES' : 'NO')
console.log('')

/**
 * SUMMARY: PRIMITIVES-ONLY ARCHITECTURE BENEFITS
 */
console.log('🎯 PRIMITIVES-ONLY ARCHITECTURE SUMMARY')
console.log('=======================================')
console.log('')
console.log('✅ WHAT THE LIBRARY PROVIDES:')
console.log('   • Complete validation and preparation primitives')
console.log('   • Cryptographic proof generation')
console.log('   • Legal claim schema validation') 
console.log('   • Token structure preparation')
console.log('   • Registry data formatting')
console.log('   • Blockchain commitment preparation')
console.log('')
console.log('🔗 WHAT EXTERNAL SYSTEMS HANDLE:')
console.log('   • Actual blockchain publishing')
console.log('   • Registry storage and queries')
console.log('   • Network communication')
console.log('   • User interface and workflows')
console.log('   • Application-specific business logic')
console.log('')
console.log('🏗️ ARCHITECTURE BENEFITS:')
console.log('   • Clean separation of concerns')
console.log('   • Maximum flexibility for integrators')
console.log('   • No vendor lock-in to specific platforms')
console.log('   • Comprehensive foundation for any LTP application')
console.log('   • Focus on cryptographic and legal correctness')
console.log('')
console.log('🚀 This demonstration shows how SmartLedger-BSV now provides')
console.log('   complete Legal Token Protocol primitives while maintaining')
console.log('   architectural flexibility for diverse implementation needs.')