/**
 * Easy Developer Interface Demo
 * 
 * Shows how developers can use GDAF features directly from the main bsv object
 * without needing to create separate GDAF instances.
 */

const bsv = require('../index.js')

console.log('🎯 SmartLedger BSV - Easy GDAF Developer Interface')
console.log('=================================================\n')

try {
  // 1. BEFORE: Complex approach (still available)
  console.log('❌ BEFORE - Complex approach:')
  console.log('   const gdaf = new bsv.GDAF()')
  console.log('   const did = gdaf.createDID(publicKey)')
  console.log('   const credential = gdaf.createEmailCredential(...)')
  console.log()
  
  // 2. NOW: Simple direct access
  console.log('✅ NOW - Simple direct access:')
  console.log('   const did = bsv.createDID(publicKey)')
  console.log('   const credential = bsv.createEmailCredential(...)')
  console.log()
  
  // 3. Demonstrate the new easy interface
  console.log('🚀 Live Demo with Easy Interface:')
  console.log('--------------------------------')
  
  const issuerPrivateKey = new bsv.PrivateKey()
  const subjectPrivateKey = new bsv.PrivateKey()
  
  // Direct DID creation - no GDAF instance needed!
  const issuerDID = bsv.createDID(issuerPrivateKey.toPublicKey())
  const subjectDID = bsv.createDID(subjectPrivateKey.toPublicKey())
  
  console.log('✅ DIDs created directly from bsv object')
  console.log('   Issuer:', issuerDID.substring(0, 50) + '...')
  console.log('   Subject:', subjectDID.substring(0, 50) + '...')
  
  // Direct credential creation - no GDAF instance needed!
  const emailCredential = bsv.createEmailCredential(
    issuerDID,
    subjectDID,
    'developer@example.com',
    issuerPrivateKey
  )
  
  console.log('✅ Email credential created directly')
  console.log('   Type:', emailCredential.type.join(', '))
  console.log('   Issuer:', emailCredential.issuer.substring(0, 50) + '...')
  
  // Direct validation - no GDAF instance needed!
  const validation = bsv.validateCredential(emailCredential, 'EmailVerifiedCredential')
  
  console.log('✅ Credential validated directly')
  console.log('   Valid:', validation.valid)
  console.log('   Errors:', validation.errors.length)
  
  // Direct ZK proof generation - no GDAF instance needed!
  const proof = bsv.generateSelectiveProof(
    emailCredential,
    ['credentialSubject.verified'],
    'demo-nonce-123'
  )
  
  console.log('✅ ZK proof generated directly')
  console.log('   Type:', proof.type)
  console.log('   Disclosed fields:', proof.disclosedFields.length)
  
  // Direct schema access - no GDAF instance needed!
  const schemas = bsv.getCredentialSchemas()
  const schemaNames = Object.keys(schemas)
  
  console.log('✅ Schemas accessed directly')
  console.log('   Available types:', schemaNames.length)
  console.log('   Types:', schemaNames.slice(0, 3).join(', ') + '...')
  
  // Direct template creation - no GDAF instance needed!
  const template = bsv.createCredentialTemplate('KYCVerifiedCredential')
  
  console.log('✅ Template created directly')
  console.log('   Template type:', template.type.join(', '))
  console.log()
  
  console.log('🎉 Developer Experience Comparison:')
  console.log('===================================')
  console.log()
  console.log('📦 COMPLEX (Old way):')
  console.log('   const bsv = require("smartledger-bsv")')
  console.log('   const gdaf = new bsv.GDAF()  // Extra step!')
  console.log('   const did = gdaf.createDID(publicKey)')
  console.log('   const cred = gdaf.createEmailCredential(...)')
  console.log('   const proof = gdaf.generateSelectiveProof(...)')
  console.log()
  console.log('⚡ SIMPLE (New way):')
  console.log('   const bsv = require("smartledger-bsv")')
  console.log('   const did = bsv.createDID(publicKey)  // Direct!')
  console.log('   const cred = bsv.createEmailCredential(...)')
  console.log('   const proof = bsv.generateSelectiveProof(...)')
  console.log()
  console.log('✅ Result: 50% fewer lines, no intermediate objects!')
  console.log('✅ Perfect for developers who want quick GDAF features!')
  
} catch (error) {
  console.error('❌ Easy Interface Demo failed:', error.message)
  process.exit(1)
}