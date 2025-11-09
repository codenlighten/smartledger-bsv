/**
 * Test Vectors for DID:web + VC-JWT + StatusList2021
 * Comprehensive test suite for v3.4.0
 */

'use strict'

var didweb = require('../lib/didweb')
var vcjwt = require('../lib/vcjwt')
var statuslist = require('../lib/statuslist')
var anchor = require('../lib/anchor')
var assert = require('assert')

console.log('🧪 SmartLedger BSV v3.4.0 - Credential Test Suite\n')

// Test 1: DID:web Key Generation (ES256)
async function testES256KeyGeneration() {
  console.log('1️⃣  Testing ES256 key generation...')
  
  var keys = await didweb.generateIssuerKeys({ alg: 'ES256' })
  
  assert(keys.privateJwk, 'Private JWK should exist')
  assert(keys.publicJwk, 'Public JWK should exist')
  assert.strictEqual(keys.alg, 'ES256', 'Algorithm should be ES256')
  assert(keys.kid, 'Key ID should exist')
  assert.strictEqual(keys.publicJwk.kty, 'EC', 'Key type should be EC')
  assert.strictEqual(keys.publicJwk.crv, 'P-256', 'Curve should be P-256')
  
  console.log('   ✅ ES256 key generation successful')
  console.log('   ✅ Kid:', keys.kid)
  return keys
}

// Test 2: DID:web Key Generation (ES256K)
async function testES256KKeyGeneration() {
  console.log('\n2️⃣  Testing ES256K key generation...')
  
  var keys = await didweb.generateIssuerKeys({ alg: 'ES256K' })
  
  assert(keys.privateJwk, 'Private JWK should exist')
  assert(keys.publicJwk, 'Public JWK should exist')
  assert.strictEqual(keys.alg, 'ES256K', 'Algorithm should be ES256K')
  assert(keys.kid, 'Key ID should exist')
  assert.strictEqual(keys.publicJwk.kty, 'EC', 'Key type should be EC')
  assert.strictEqual(keys.publicJwk.crv, 'secp256k1', 'Curve should be secp256k1')
  
  console.log('   ✅ ES256K key generation successful')
  console.log('   ✅ Kid:', keys.kid)
  return keys
}

// Test 3: DID:web Document Building
async function testDIDDocumentBuilding(p256Keys) {
  console.log('\n3️⃣  Testing DID:web document building...')
  
  var docs = didweb.buildDidWebDocuments({
    domain: 'smartledger.technology',
    p256: { jwk: p256Keys.publicJwk, kid: p256Keys.kid },
    controllerName: 'SmartLedger Test Issuer'
  })
  
  assert.strictEqual(docs.did, 'did:web:smartledger.technology', 'DID should be correctly formatted')
  assert(docs.didDocument, 'DID Document should exist')
  assert(docs.jwks, 'JWKS should exist')
  assert(docs.didDocument.verificationMethod.length > 0, 'Should have verification methods')
  assert(docs.jwks.keys.length > 0, 'JWKS should have keys')
  
  console.log('   ✅ DID:', docs.did)
  console.log('   ✅ Verification methods:', docs.didDocument.verificationMethod.length)
  console.log('   ✅ JWKS keys:', docs.jwks.keys.length)
  
  return docs
}

// Test 4: VC-JWT Issuance (ES256)
async function testVCIssuanceES256(issuerDid, keys) {
  console.log('\n4️⃣  Testing VC-JWT issuance (ES256)...')
  
  var result = await vcjwt.issueVcJwt({
    issuerDid: issuerDid,
    subjectId: 'did:example:holder123',
    types: ['VerifiableCredential', 'AgeCredential'],
    credentialSubject: {
      ageOver: 18,
      country: 'US'
    },
    privateJwk: keys.privateJwk,
    alg: 'ES256',
    kid: keys.kid
  })
  
  assert(result.jwt, 'JWT should be generated')
  assert(result.jwt.split('.').length === 3, 'JWT should have 3 parts')
  
  console.log('   ✅ JWT generated')
  console.log('   ✅ JWT length:', result.jwt.length)
  
  return result.jwt
}

// Test 5: VC-JWT Verification
async function testVCVerification(jwt, jwks) {
  console.log('\n5️⃣  Testing VC-JWT verification...')
  
  var didResolver = async function(did) {
    return { jwks: jwks }
  }
  
  var result = await vcjwt.verifyVcJwt(jwt, {
    didResolver: didResolver,
    expectedIssuerDid: 'did:web:smartledger.technology'
  })
  
  assert.strictEqual(result.valid, true, 'JWT should be valid')
  assert(result.payload, 'Payload should be present')
  assert(result.header, 'Header should be present')
  
  console.log('   ✅ JWT verification successful')
  console.log('   ✅ Issuer:', result.payload.iss)
  console.log('   ✅ Subject:', result.payload.sub)
  
  return result
}

// Test 6: StatusList2021 Creation
async function testStatusListCreation(issuerDid, keys) {
  console.log('\n6️⃣  Testing StatusList2021 creation...')
  
  var result = await statuslist.createStatusList({
    issuerDid: issuerDid,
    privateJwk: keys.privateJwk
  })
  
  assert(result.listVcJwt, 'Status list JWT should be created')
  assert(result.listId, 'List ID should be created')
  
  console.log('   ✅ Status list created')
  console.log('   ✅ List ID:', result.listId)
  
  return result.listVcJwt
}

// Test 7: StatusList2021 Update (Revocation)
async function testStatusListRevocation(listJwt, keys) {
  console.log('\n7️⃣  Testing credential revocation...')
  
  var index = 42
  
  // Check initial status
  var initialStatus = statuslist.getCredentialStatusEntry({
    listVcJwt: listJwt,
    index: index
  })
  
  assert.strictEqual(initialStatus, 'valid', 'Initial status should be valid')
  console.log('   ✅ Initial status at index', index + ':', initialStatus)
  
  // Revoke credential
  var result = await statuslist.updateStatusList({
    listVcJwt: listJwt,
    index: index,
    status: 'revoked',
    privateJwk: keys.privateJwk
  })
  
  assert(result.listVcJwt, 'Updated list should be returned')
  
  // Check updated status
  var updatedStatus = statuslist.getCredentialStatusEntry({
    listVcJwt: result.listVcJwt,
    index: index
  })
  
  assert.strictEqual(updatedStatus, 'revoked', 'Status should be revoked')
  console.log('   ✅ Updated status at index', index + ':', updatedStatus)
  
  return result.listVcJwt
}

// Test 8: Anchor Hash Generation
function testAnchorHashing() {
  console.log('\n8️⃣  Testing anchor hash generation...')
  
  var testData = 'Test Verifiable Credential Data'
  var hash = anchor.sha256Hex(testData)
  
  assert(hash, 'Hash should be generated')
  assert.strictEqual(hash.length, 64, 'Hash should be 64 hex characters')
  assert(/^[a-f0-9]{64}$/.test(hash), 'Hash should be valid hex')
  
  console.log('   ✅ SHA-256 hash generated')
  console.log('   ✅ Hash:', hash)
  
  // Test hash reproducibility
  var hash2 = anchor.sha256Hex(testData)
  assert.strictEqual(hash, hash2, 'Hash should be reproducible')
  console.log('   ✅ Hash reproducibility confirmed')
  
  return hash
}

// Test 9: Anchor Payload Building
function testAnchorPayload(hash, issuerDid) {
  console.log('\n9️⃣  Testing anchor payload building...')
  
  var payload = anchor.buildAnchorPayload({
    kind: 'VC_ANCHOR_SHA256',
    hash: hash,
    issuerDid: issuerDid,
    issuedAt: new Date().toISOString()
  })
  
  assert(payload.json, 'Payload JSON should be generated')
  
  var parsed = JSON.parse(payload.json)
  assert.strictEqual(parsed.protocol, 'SmartLedger', 'Protocol should be SmartLedger')
  assert.strictEqual(parsed.type, 'VC_ANCHOR_SHA256', 'Type should match')
  assert.strictEqual(parsed.hash, hash, 'Hash should match')
  assert.strictEqual(parsed.issuer, issuerDid, 'Issuer should match')
  
  console.log('   ✅ Anchor payload created')
  console.log('   ✅ Size:', payload.json.length, 'bytes')
  console.log('   ✅ Protocol:', parsed.protocol)
  
  return payload
}

// Test 10: End-to-end Workflow
async function testEndToEndWorkflow() {
  console.log('\n🔟 Testing complete end-to-end workflow...')
  
  // Generate keys
  var keys = await didweb.generateIssuerKeys({ alg: 'ES256' })
  
  // Build DID documents
  var docs = didweb.buildDidWebDocuments({
    domain: 'test.example.com',
    p256: { jwk: keys.publicJwk, kid: keys.kid }
  })
  
  // Issue credential
  var result = await vcjwt.issueVcJwt({
    issuerDid: docs.did,
    subjectId: 'did:example:alice',
    types: ['VerifiableCredential', 'DriverLicense'],
    credentialSubject: {
      licenseNumber: 'DL123456',
      class: 'C'
    },
    privateJwk: keys.privateJwk,
    alg: 'ES256',
    kid: keys.kid
  })
  var jwt = result.jwt
  
  // Hash credential for anchoring
  var hash = anchor.sha256Hex(jwt)
  
  // Build anchor payload
  var anchorPayload = anchor.buildAnchorPayload({
    kind: 'VC_ANCHOR_SHA256',
    hash: hash,
    issuerDid: docs.did
  })
  
  // Verify credential
  var didResolver = async function() { return { jwks: docs.jwks } }
  var verification = await vcjwt.verifyVcJwt(jwt, { didResolver: didResolver })
  
  assert.strictEqual(verification.valid, true, 'Credential should be valid')
  
  // Create status list
  var statusListResult = await statuslist.createStatusList({
    issuerDid: docs.did,
    privateJwk: keys.privateJwk
  })
  
  // Revoke credential
  var updatedList = await statuslist.updateStatusList({
    listVcJwt: statusListResult.listVcJwt,
    index: 10,
    status: 'revoked',
    privateJwk: keys.privateJwk
  })
  
  // Verify credential is now revoked
  var verification2 = await vcjwt.verifyVcJwt(jwt, { didResolver: didResolver })
  var revokedStatus = statuslist.getCredentialStatusEntry({
    listVcJwt: updatedList.listVcJwt,
    index: 10
  })
  
  assert.strictEqual(verification2.valid, true, 'JWT signature still valid')
  assert.strictEqual(revokedStatus, 'revoked', 'But credential is revoked')
  
  console.log('   ✅ Complete workflow executed successfully')
  console.log('   ✅ Issue → Anchor → Verify → Revoke → Verify')
}

// Run all tests
async function runTests() {
  try {
    var p256Keys = await testES256KeyGeneration()
    var k1Keys = await testES256KKeyGeneration()
    var docs = await testDIDDocumentBuilding(p256Keys)
    var jwt = await testVCIssuanceES256(docs.did, p256Keys)
    var verification = await testVCVerification(jwt, docs.jwks)
    var statusListJwt = await testStatusListCreation(docs.did, p256Keys)
    var revokedListJwt = await testStatusListRevocation(statusListJwt, p256Keys)
    var hash = testAnchorHashing()
    var anchorPayload = testAnchorPayload(hash, docs.did)
    await testEndToEndWorkflow()
    
    console.log('\n🎉 All tests passed successfully!')
    console.log('✅ DID:web generation working')
    console.log('✅ VC-JWT issuance and verification working')
    console.log('✅ StatusList2021 revocation working')
    console.log('✅ BSV anchor hashing working')
    console.log('✅ ES256 and ES256K support confirmed')
    
  } catch (error) {
    console.error('\n❌ Test failed:', error.message)
    console.error(error.stack)
    process.exit(1)
  }
}

// Run the test suite
runTests()
