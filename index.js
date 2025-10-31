'use strict'

var bsv = module.exports

// Initialize dependencies first to avoid circular dependency issues
bsv.deps = bsv.deps || {}
try {
  bsv.deps.bnjs = require('bn.js')
  bsv.deps.bs58 = require('bs58')
  bsv.deps.Buffer = (typeof Buffer !== 'undefined') ? Buffer : null
  bsv.deps.elliptic = require('elliptic')
  bsv.deps._ = require('./lib/util/_')
} catch (e) {
  // Handle browser environment gracefully
  console.warn('Some dependencies may not be available in browser environment:', e.message)
}

// module information
bsv.version = 'v' + require('./package.json').version
bsv.versionGuard = function (version) {
  if (version !== undefined) {
    var message = `
      More than one instance of bsv found.
      Please make sure to require bsv and check that submodules do
      not also include their own bsv dependency.`
    console.warn(message)
  }
}
bsv.versionGuard(global._bsv)
global._bsv = bsv.version

// SmartLedger security information
bsv.isHardened = true
bsv.hardenedBy = 'SmartLedger'
bsv.baseVersion = 'v1.5.6'
bsv.securityFeatures = [
  'canonical-signatures',
  'malleability-protection',
  'enhanced-validation',
  'elliptic-patches'
]

// crypto
bsv.crypto = {}
bsv.crypto.BN = require('./lib/crypto/bn')
bsv.crypto.ECDSA = require('./lib/crypto/ecdsa')
bsv.crypto.Hash = require('./lib/crypto/hash')
bsv.crypto.Random = require('./lib/crypto/random')
bsv.crypto.Point = require('./lib/crypto/point')
bsv.crypto.Signature = require('./lib/crypto/signature')
bsv.crypto.Shamir = require('./lib/crypto/shamir')

// SmartLedger security enhancements
bsv.crypto.SmartVerify = require('./lib/crypto/smartledger_verify')
bsv.crypto.EllipticFixed = require('./lib/crypto/elliptic-fixed')

// encoding
bsv.encoding = {}
bsv.encoding.Base58 = require('./lib/encoding/base58')
bsv.encoding.Base58Check = require('./lib/encoding/base58check')
bsv.encoding.BufferReader = require('./lib/encoding/bufferreader')
bsv.encoding.BufferWriter = require('./lib/encoding/bufferwriter')
bsv.encoding.Varint = require('./lib/encoding/varint')

// utilities
bsv.util = {}
bsv.util.js = require('./lib/util/js')
bsv.util.preconditions = require('./lib/util/preconditions')

// errors thrown by the library
bsv.errors = require('./lib/errors')

// main bitcoin library
bsv.Address = require('./lib/address')
bsv.Block = require('./lib/block')
bsv.MerkleBlock = require('./lib/block/merkleblock')
bsv.BlockHeader = require('./lib/block/blockheader')
bsv.HDPrivateKey = require('./lib/hdprivatekey.js')
bsv.HDPublicKey = require('./lib/hdpublickey.js')
bsv.Networks = require('./lib/networks')
bsv.Opcode = require('./lib/opcode')
bsv.PrivateKey = require('./lib/privatekey')
bsv.PublicKey = require('./lib/publickey')
bsv.Script = require('./lib/script')
bsv.Transaction = require('./lib/transaction')
bsv.Input = require('./lib/transaction').Input
bsv.Output = require('./lib/transaction').Output
bsv.UnspentOutput = require('./lib/transaction').UnspentOutput
bsv.Message = require('./lib/message')
bsv.Mnemonic = require('./lib/mnemonic')
bsv.ECIES = require('./lib/ecies')
bsv.Signature = require('./lib/crypto/signature')
bsv.Shamir = require('./lib/crypto/shamir')

// SmartLedger security modules (top-level access)
bsv.SmartLedger = {
  version: bsv.version,
  hardenedBy: bsv.hardenedBy,
  baseVersion: bsv.baseVersion,
  securityFeatures: bsv.securityFeatures,
  SmartVerify: require('./lib/crypto/smartledger_verify'),
  EllipticFixed: require('./lib/crypto/elliptic-fixed')
}
bsv.SmartVerify = require('./lib/crypto/smartledger_verify')
bsv.EllipticFixed = require('./lib/crypto/elliptic-fixed')

// SmartLedger Development & Testing Tools
try {
  // SmartContract Framework - now available in both Node.js and browser
  bsv.SmartContract = require('./lib/smart_contract')
} catch (e) {
  // SmartContract not available - use standalone bsv-smartcontract.min.js
  if (typeof window === 'undefined') {
    console.warn('SmartContract module not available:', e.message)
  }
}

// Browser-compatible UTXO Manager (always available)
try {
  bsv.BrowserUTXOManager = require('./lib/browser-utxo-manager-es5')
} catch (e) {
  // BrowserUTXOManager not available
}

// Node.js specific tools (advanced development tools)
if (typeof window === 'undefined' && typeof require === 'function') {
  try {
    bsv.SmartUTXO = require('./lib/smartutxo')
    bsv.SmartMiner = require('./lib/smartminer')
    bsv.CustomScriptHelper = require('./lib/custom-script-helper')
  } catch (e) {
    // Advanced tools not available
  }
}

// Global Digital Attestation Framework (GDAF)
bsv.GDAF = require('./lib/gdaf')

// GDAF Direct Access Methods (for easier developer experience)
bsv.createDID = function(publicKey) {
  var gdaf = new bsv.GDAF()
  return gdaf.createDID(publicKey)
}

bsv.resolveDID = function(did) {
  var gdaf = new bsv.GDAF()
  return gdaf.resolveDID(did)
}

bsv.createEmailCredential = function(issuerDID, subjectDID, email, issuerPrivateKey) {
  var gdaf = new bsv.GDAF()
  return gdaf.createEmailCredential(issuerDID, subjectDID, email, issuerPrivateKey)
}

bsv.createAgeCredential = function(issuerDID, subjectDID, ageThreshold, birthDate, issuerPrivateKey) {
  var gdaf = new bsv.GDAF()
  return gdaf.createAgeCredential(issuerDID, subjectDID, ageThreshold, birthDate, issuerPrivateKey)
}

bsv.createKYCCredential = function(issuerDID, subjectDID, level, piiHashes, issuerPrivateKey) {
  var gdaf = new bsv.GDAF()
  return gdaf.createKYCCredential(issuerDID, subjectDID, level, piiHashes, issuerPrivateKey)
}

bsv.verifyCredential = function(credential, options) {
  var gdaf = new bsv.GDAF()
  return gdaf.verifyCredential(credential, options)
}

bsv.validateCredential = function(credential, schema) {
  var gdaf = new bsv.GDAF()
  return gdaf.validateCredential(credential, schema)
}

bsv.generateSelectiveProof = function(credential, revealedFields, nonce) {
  var gdaf = new bsv.GDAF()
  return gdaf.generateSelectiveProof(credential, revealedFields, nonce)
}

bsv.generateAgeProof = function(ageCredential, minimumAge, nonce) {
  var gdaf = new bsv.GDAF()
  return gdaf.generateAgeProof(ageCredential, minimumAge, nonce)
}

bsv.verifyAgeProof = function(proof, minimumAge, issuerDID) {
  var gdaf = new bsv.GDAF()
  return gdaf.verifyAgeProof(proof, minimumAge, issuerDID)
}

bsv.createPresentation = function(credentials, holderDID, holderPrivateKey, options) {
  var gdaf = new bsv.GDAF()
  return gdaf.createPresentation(credentials, holderDID, holderPrivateKey, options)
}

bsv.getCredentialSchemas = function() {
  var gdaf = new bsv.GDAF()
  return gdaf.getAllSchemas()
}

bsv.createCredentialTemplate = function(credentialType) {
  var gdaf = new bsv.GDAF()
  return gdaf.createTemplate(credentialType)
}

// Legal Token Protocol (LTP) - Primitives-Only Interface
bsv.LTP = require('./lib/ltp')

// LTP Right Token Primitives
bsv.prepareRightToken = function(type, issuerDID, subjectDID, claim, issuerPrivateKey, options) {
  return bsv.LTP.Right.prepareRightToken(type, issuerDID, subjectDID, claim, issuerPrivateKey, options)
}

bsv.prepareRightTokenVerification = function(token, options) {
  return bsv.LTP.Right.prepareRightTokenVerification(token, options)
}

bsv.prepareRightTokenTransfer = function(token, newOwnerDID, currentOwnerKey, options) {
  return bsv.LTP.Right.prepareRightTokenTransfer(token, newOwnerDID, currentOwnerKey, options)
}

bsv.prepareRightTypeValidation = function(type) {
  return bsv.LTP.Right.prepareRightTypeValidation(type)
}

// LTP Obligation Token Primitives
bsv.prepareObligationToken = function(type, issuerDID, obligorDID, obligation, issuerPrivateKey, options) {
  return bsv.LTP.Obligation.prepareObligationToken(type, issuerDID, obligorDID, obligation, issuerPrivateKey, options)
}

bsv.prepareObligationVerification = function(token, options) {
  return bsv.LTP.Obligation.prepareObligationVerification(token, options)
}

bsv.prepareObligationFulfillment = function(token, fulfillment, obligorKey, options) {
  return bsv.LTP.Obligation.prepareObligationFulfillment(token, fulfillment, obligorKey, options)
}

bsv.prepareObligationBreachAssessment = function(token, breach, assessor) {
  return bsv.LTP.Obligation.prepareObligationBreachAssessment(token, breach, assessor)
}

bsv.prepareObligationMonitoringReport = function(obligations, criteria) {
  return bsv.LTP.Obligation.prepareObligationMonitoringReport(obligations, criteria)
}

// LTP Claim Validation Primitives
bsv.prepareClaimValidation = function(claim, schemaName) {
  return bsv.LTP.Claim.prepareClaimValidation(claim, schemaName)
}

bsv.prepareClaimAttestation = function(claim, schemaName, attestor) {
  return bsv.LTP.Claim.prepareClaimAttestation(claim, schemaName, attestor)
}

bsv.prepareClaimDispute = function(claimHash, disputant, dispute) {
  return bsv.LTP.Claim.prepareClaimDispute(claimHash, disputant, dispute)
}

bsv.prepareBulkClaimValidation = function(claims, schemaName) {
  return bsv.LTP.Claim.prepareBulkClaimValidation(claims, schemaName)
}

bsv.prepareClaimTemplate = function(schemaName, options) {
  return bsv.LTP.Claim.prepareClaimTemplate(schemaName, options)
}

// LTP Proof Generation Primitives
bsv.prepareSignatureProof = function(token, privateKey, options) {
  return bsv.LTP.Proof.prepareSignatureProof(token, privateKey, options)
}

bsv.prepareSignatureVerification = function(token, publicKey) {
  return bsv.LTP.Proof.prepareSignatureVerification(token, publicKey)
}

bsv.prepareSelectiveDisclosure = function(token, revealedFields, nonce) {
  return bsv.LTP.Proof.prepareSelectiveDisclosure(token, revealedFields, nonce)
}

bsv.prepareSelectiveDisclosureVerification = function(proof, expectedNonce) {
  return bsv.LTP.Proof.prepareSelectiveDisclosureVerification(proof, expectedNonce)
}

bsv.prepareLegalValidityProof = function(token, jurisdiction, nonce) {
  return bsv.LTP.Proof.prepareLegalValidityProof(token, jurisdiction, nonce)
}

bsv.prepareZeroKnowledgeProof = function(token, statement, nonce) {
  return bsv.LTP.Proof.prepareZeroKnowledgeProof(token, statement, nonce)
}

// LTP Registry Management Primitives
bsv.prepareRegistry = function(config) {
  return bsv.LTP.Registry.prepareRegistry(config)
}

bsv.prepareTokenRegistration = function(token, registryConfig, options) {
  return bsv.LTP.Registry.prepareTokenRegistration(token, registryConfig, options)
}

bsv.prepareTokenApproval = function(tokenId, approver, registryConfig) {
  return bsv.LTP.Registry.prepareTokenApproval(tokenId, approver, registryConfig)
}

bsv.prepareTokenRevocation = function(tokenId, revocation, registryConfig) {
  return bsv.LTP.Registry.prepareTokenRevocation(tokenId, revocation, registryConfig)
}

bsv.prepareTokenStatusQuery = function(tokenId, registryConfig) {
  return bsv.LTP.Registry.prepareTokenStatusQuery(tokenId, registryConfig)
}

bsv.prepareTokenSearch = function(criteria, registryConfig) {
  return bsv.LTP.Registry.prepareTokenSearch(criteria, registryConfig)
}

bsv.prepareStatisticsQuery = function(registryConfig) {
  return bsv.LTP.Registry.prepareStatisticsQuery(registryConfig)
}

bsv.prepareAuditLogQuery = function(registryConfig, options) {
  return bsv.LTP.Registry.prepareAuditLogQuery(registryConfig, options)
}

// LTP Blockchain Anchoring Primitives
bsv.prepareTokenCommitment = function(token, options) {
  return bsv.LTP.Anchor.prepareTokenCommitment(token, options)
}

bsv.prepareBatchCommitment = function(tokens, options) {
  return bsv.LTP.Anchor.prepareBatchCommitment(tokens, options)
}

bsv.verifyTokenAnchor = function(token, txid, txData) {
  return bsv.LTP.Anchor.verifyTokenAnchor(token, txid, txData)
}

bsv.formatRevocation = function(tokenId, revocationData) {
  return bsv.LTP.Anchor.formatRevocation(tokenId, revocationData)
}

// Backward Compatibility: Direct LTP Functions (Wrapper Layer)
// These functions provide the old-style direct API that demos expect

bsv.createRightToken = function(rightData, privateKey, options) {
  var ltp = new bsv.LTP()
  return ltp.createRightToken(rightData, privateKey, options)
}

bsv.verifyLegalToken = function(token, publicKey) {
  var ltp = new bsv.LTP()
  return ltp.verifyToken(token, publicKey)
}

bsv.validateLegalClaim = function(claimData, schemaType) {
  var ltp = new bsv.LTP()
  return ltp.validateClaim(claimData, schemaType)
}

bsv.createSelectiveDisclosure = function(token, revealedFields, nonce) {
  var ltp = new bsv.LTP()
  return ltp.createSelectiveDisclosure(token, revealedFields, nonce)
}

bsv.createLegalRegistry = function(config) {
  return bsv.LTP.Registry.prepareRegistry(config)
}

bsv.createLegalValidityProof = function(token, jurisdiction, nonce) {
  var ltp = new bsv.LTP()
  return ltp.createLegalValidityProof(token, jurisdiction, nonce)
}

// LTP Static Data Access (unchanged)
bsv.getRightTypes = function() {
  return bsv.LTP.Right.getRightTypes()
}

bsv.getObligationTypes = function() {
  return bsv.LTP.Obligation.getObligationTypes()
}

bsv.getObligationPriority = function() {
  return bsv.LTP.Obligation.getObligationPriority()
}

bsv.getObligationStatus = function() {
  return bsv.LTP.Obligation.getObligationStatus()
}

bsv.getClaimSchemas = function() {
  return bsv.LTP.Claim.getSchemas()
}

bsv.getClaimSchemaNames = function() {
  return bsv.LTP.Claim.getSchemaNames()
}

bsv.getClaimSchema = function(schemaName) {
  return bsv.LTP.Claim.getSchema(schemaName)
}

bsv.createClaimTemplate = function(schemaName) {
  return bsv.LTP.Claim.createTemplate(schemaName)
}

// LTP Utility Functions
bsv.canonicalizeClaim = function(claim) {
  return bsv.LTP.Claim.canonicalize(claim)
}

bsv.hashClaim = function(claim) {
  return bsv.LTP.Claim.hash(claim)
}

bsv.addCustomClaimSchema = function(name, schema) {
  return bsv.LTP.Claim.addSchema(name, schema)
}

// Internal usage, exposed for testing/advanced tweaking
bsv.Transaction.sighash = require('./lib/transaction/sighash')
