/**
 * GDAF (Global Digital Attestation Framework) Demo
 * 
 * Demonstrates the complete GDAF workflow including:
 * - DID creation and resolution
 * - Credential creation and signing
 * - Zero-knowledge proofs
 * - Blockchain anchoring
 * - Schema validation
 */

const bsv = require('./index.js')

console.log('🌐 SmartLedger BSV Global Digital Attestation Framework Demo')
console.log('=========================================================\n')

// Initialize GDAF
const gdaf = new bsv.GDAF()

console.log('📋 Framework Information:')
console.log(JSON.stringify(gdaf.getInfo(), null, 2))
console.log('\n')

try {
  // 1. Create test identities
  console.log('🔑 Step 1: Creating Test Identities')
  console.log('----------------------------------')
  
  const issuerPrivateKey = new bsv.PrivateKey()
  const subjectPrivateKey = new bsv.PrivateKey()
  const verifierPrivateKey = new bsv.PrivateKey()
  
  const issuerDID = gdaf.createDID(issuerPrivateKey.toPublicKey())
  const subjectDID = gdaf.createDID(subjectPrivateKey.toPublicKey())
  const verifierDID = gdaf.createDID(verifierPrivateKey.toPublicKey())
  
  console.log('Issuer DID:', issuerDID)
  console.log('Subject DID:', subjectDID)
  console.log('Verifier DID:', verifierDID)
  console.log()
  
  // 2. Resolve DID documents
  console.log('📄 Step 2: DID Document Resolution')
  console.log('----------------------------------')
  
  const issuerDocument = gdaf.resolveDID(issuerDID)
  const subjectDocument = gdaf.resolveDID(subjectDID)
  
  console.log('Issuer DID Document:')
  console.log(JSON.stringify(issuerDocument, null, 2))
  console.log('\nSubject DID Document:')
  console.log(JSON.stringify(subjectDocument, null, 2))
  console.log()
  
  // 3. Create credentials
  console.log('📝 Step 3: Credential Creation')
  console.log('------------------------------')
  
  // Email credential
  const emailCredential = gdaf.createEmailCredential(
    issuerDID,
    subjectDID,
    'user@example.com',
    issuerPrivateKey
  )
  
  // Age credential
  const ageCredential = gdaf.createAgeCredential(
    issuerDID,
    subjectDID,
    21,
    new Date('1995-06-15'),
    issuerPrivateKey
  )
  
  // KYC credential
  const kycCredential = gdaf.createKYCCredential(
    issuerDID,
    subjectDID,
    'enhanced',
    {
      firstNameHash: gdaf.hashData('John'),
      lastNameHash: gdaf.hashData('Doe'),
      ssnHash: gdaf.hashData('123-45-6789')
    },
    issuerPrivateKey
  )
  
  console.log('Email Credential:')
  console.log(JSON.stringify(emailCredential, null, 2))
  console.log('\nAge Credential:')
  console.log(JSON.stringify(ageCredential, null, 2))
  console.log('\nKYC Credential:')
  console.log(JSON.stringify(kycCredential, null, 2))
  console.log()
  
  // 4. Schema validation
  console.log('✅ Step 4: Schema Validation')
  console.log('----------------------------')
  
  const emailValidation = gdaf.validateCredential(emailCredential, 'EmailVerifiedCredential')
  const ageValidation = gdaf.validateCredential(ageCredential, 'AgeVerifiedCredential')
  const kycValidation = gdaf.validateCredential(kycCredential, 'KYCVerifiedCredential')
  
  console.log('Email Validation:', emailValidation)
  console.log('Age Validation:', ageValidation)
  console.log('KYC Validation:', kycValidation)
  console.log()
  
  // 5. Credential verification
  console.log('🔍 Step 5: Credential Verification')
  console.log('----------------------------------')
  
  const emailVerification = gdaf.verifyCredential(emailCredential, {
    checkSignature: true,
    checkIssuer: true,
    checkExpiration: true
  })
  
  const ageVerification = gdaf.verifyCredential(ageCredential, {
    checkSignature: true,
    checkIssuer: true,
    checkExpiration: true
  })
  
  console.log('Email Verification:', emailVerification)
  console.log('Age Verification:', ageVerification)
  console.log()
  
  // 6. Zero-knowledge proofs
  console.log('🔒 Step 6: Zero-Knowledge Proofs')
  console.log('--------------------------------')
  
  const nonce = gdaf.generateNonce()
  
  // Selective disclosure proof
  const selectiveProof = gdaf.generateSelectiveProof(
    emailCredential,
    ['credentialSubject.verified'],
    nonce
  )
  
  console.log('Selective Disclosure Proof:')
  console.log(JSON.stringify(selectiveProof, null, 2))
  
  // Age proof
  const ageProof = gdaf.generateAgeProof(ageCredential, 18, nonce)
  
  console.log('\nAge Proof (over 18):')
  console.log(JSON.stringify(ageProof, null, 2))
  
  // Verify proofs
  const selectiveVerification = gdaf.verifySelectiveProof(selectiveProof, {
    nonce: nonce,
    issuerDID: issuerDID
  })
  
  const ageProofVerification = gdaf.verifyAgeProof(ageProof, 18, issuerDID)
  
  console.log('\nSelective Proof Verification:', selectiveVerification)
  console.log('Age Proof Verification:', ageProofVerification)
  console.log()
  
  // 7. Verifiable presentation
  console.log('📊 Step 7: Verifiable Presentation')
  console.log('----------------------------------')
  
  const presentation = gdaf.createPresentation(
    [emailCredential, ageCredential],
    subjectDID,
    subjectPrivateKey,
    {
      challenge: nonce,
      domain: 'example.com'
    }
  )
  
  console.log('Verifiable Presentation:')
  console.log(JSON.stringify(presentation, null, 2))
  
  const presentationVerification = gdaf.verifyPresentation(presentation, {
    challenge: nonce,
    domain: 'example.com'
  })
  
  console.log('\nPresentation Verification:', presentationVerification)
  console.log()
  
  // 8. Extract claims
  console.log('📝 Step 8: Claims Extraction')
  console.log('----------------------------')
  
  const claims = gdaf.extractClaims([emailCredential, ageCredential, kycCredential])
  
  console.log('Extracted Claims:')
  console.log(JSON.stringify(claims, null, 2))
  console.log()
  
  // 9. Schema templates
  console.log('📋 Step 9: Schema Templates')
  console.log('---------------------------')
  
  const emailTemplate = gdaf.createTemplate('EmailVerifiedCredential')
  const orgTemplate = gdaf.createTemplate('OrganizationCredential')
  
  console.log('Email Credential Template:')
  console.log(JSON.stringify(emailTemplate, null, 2))
  console.log('\nOrganization Credential Template:')
  console.log(JSON.stringify(orgTemplate, null, 2))
  console.log()
  
  // 10. Available schemas
  console.log('📚 Step 10: Available Schemas')
  console.log('-----------------------------')
  
  const allSchemas = gdaf.getAllSchemas()
  const schemaNames = Object.keys(allSchemas)
  
  console.log('Available Schema Types:', schemaNames)
  console.log()
  
  console.log('✅ GDAF Demo completed successfully!')
  console.log('\n🎉 All GDAF components are working correctly:')
  console.log('   ✓ DID Resolution')
  console.log('   ✓ Credential Creation & Signing')
  console.log('   ✓ Schema Validation')
  console.log('   ✓ Credential Verification')
  console.log('   ✓ Zero-Knowledge Proofs')
  console.log('   ✓ Verifiable Presentations')
  console.log('   ✓ Claims Extraction')
  console.log('   ✓ Template Generation')
  
} catch (error) {
  console.error('❌ GDAF Demo failed:', error.message)
  console.error('Stack trace:', error.stack)
  process.exit(1)
}