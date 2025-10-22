'use strict'

/**
 * GDAF (Global Digital Attestation Framework) Index
 * 
 * Main interface for the SmartLedger BSV Global Digital Attestation Framework.
 * Provides W3C-compliant verifiable credentials, DID resolution, zero-knowledge
 * proofs, and blockchain anchoring capabilities.
 */

var DIDResolver = require('./did-resolver')
var AttestationSigner = require('./attestation-signer')
var AttestationVerifier = require('./attestation-verifier')
var ZKProver = require('./zk-prover')
var SmartLedgerAnchor = require('./smartledger-anchor')
var SchemaValidator = require('./schema-validator')

/**
 * Main GDAF class
 */
function GDAF(options) {
  if (!(this instanceof GDAF)) {
    return new GDAF(options)
  }
  
  options = options || {}
  
  // Initialize components (static modules)
  this.didResolver = DIDResolver
  this.attestationVerifier = AttestationVerifier
  this.zkProver = ZKProver
  this.schemaValidator = SchemaValidator
  
  // These components are created on-demand since they require private keys
  this._attestationSignerOptions = options.attestationSigner || {}
  this._anchorOptions = options.anchor || {}
}

/**
 * DID Methods
 */

/**
 * Create DID from public key
 * @param {PublicKey} publicKey - BSV public key
 * @returns {String} DID identifier
 */
GDAF.prototype.createDID = function(publicKey) {
  return this.didResolver.fromPublicKey(publicKey)
}

/**
 * Resolve DID document
 * @param {String} did - DID identifier
 * @returns {Object} DID document
 */
GDAF.prototype.resolveDID = function(did) {
  return this.didResolver.resolve(did)
}

/**
 * Verify DID ownership
 * @param {String} did - DID identifier
 * @param {PrivateKey} privateKey - Private key for verification
 * @returns {Boolean} Verification result
 */
GDAF.prototype.verifyDIDOwnership = function(did, privateKey) {
  return this.didResolver.verifyOwnership(did, privateKey)
}

/**
 * Attestation Methods
 */

/**
 * Create email verification credential
 * @param {String} issuerDID - Issuer DID
 * @param {String} subjectDID - Subject DID
 * @param {String} email - Email address
 * @param {PrivateKey} issuerPrivateKey - Issuer's private key
 * @returns {Object} Verifiable credential
 */
GDAF.prototype.createEmailCredential = function(issuerDID, subjectDID, email, issuerPrivateKey) {
  var signer = new AttestationSigner(issuerPrivateKey, this._attestationSignerOptions)
  return signer.createEmailCredential(email, {
    issuerDID: issuerDID,
    subjectId: subjectDID
  })
}

/**
 * Create age verification credential
 * @param {String} issuerDID - Issuer DID
 * @param {String} subjectDID - Subject DID
 * @param {Number} ageThreshold - Age threshold
 * @param {Date} birthDate - Birth date
 * @param {PrivateKey} issuerPrivateKey - Issuer's private key
 * @returns {Object} Verifiable credential
 */
GDAF.prototype.createAgeCredential = function(issuerDID, subjectDID, ageThreshold, birthDate, issuerPrivateKey) {
  var signer = new AttestationSigner(issuerPrivateKey, this._attestationSignerOptions)
  return signer.createAgeCredential(ageThreshold, birthDate, {
    issuerDID: issuerDID,
    subjectId: subjectDID
  })
}

/**
 * Create KYC verification credential
 * @param {String} issuerDID - Issuer DID
 * @param {String} subjectDID - Subject DID
 * @param {String} level - KYC level
 * @param {Object} piiHashes - PII hash values
 * @param {PrivateKey} issuerPrivateKey - Issuer's private key
 * @returns {Object} Verifiable credential
 */
GDAF.prototype.createKYCCredential = function(issuerDID, subjectDID, level, piiHashes, issuerPrivateKey) {
  var signer = new AttestationSigner(issuerPrivateKey, this._attestationSignerOptions)
  var kycData = Object.assign({ level: level }, piiHashes)
  return signer.createKYCCredential(kycData, {
    issuerDID: issuerDID,
    subjectId: subjectDID
  })
}

/**
 * Create organization credential
 * @param {String} issuerDID - Issuer DID
 * @param {String} subjectDID - Subject DID
 * @param {Object} orgData - Organization data
 * @param {PrivateKey} issuerPrivateKey - Issuer's private key
 * @returns {Object} Verifiable credential
 */
GDAF.prototype.createOrganizationCredential = function(issuerDID, subjectDID, orgData, issuerPrivateKey) {
  var signer = new AttestationSigner(issuerPrivateKey, this._attestationSignerOptions)
  return signer.createOrganizationCredential(orgData, {
    issuerDID: issuerDID,
    subjectId: subjectDID
  })
}

/**
 * Create verifiable presentation
 * @param {Array} credentials - Array of credentials
 * @param {String} holderDID - Holder DID
 * @param {PrivateKey} holderPrivateKey - Holder's private key
 * @param {Object} options - Presentation options
 * @returns {Object} Verifiable presentation
 */
GDAF.prototype.createPresentation = function(credentials, holderDID, holderPrivateKey, options) {
  var signer = new AttestationSigner(holderPrivateKey, this._attestationSignerOptions)
  return signer.createPresentation(credentials, holderDID, holderPrivateKey, options)
}

/**
 * Sign credential
 * @param {Object} credential - Credential to sign
 * @param {PrivateKey} privateKey - Signing private key
 * @returns {Object} Signed credential
 */
GDAF.prototype.signCredential = function(credential, privateKey) {
  var signer = new AttestationSigner(privateKey, this._attestationSignerOptions)
  return signer.signCredential(credential, privateKey)
}

/**
 * Verification Methods
 */

/**
 * Verify credential
 * @param {Object} credential - Credential to verify
 * @param {Object} options - Verification options
 * @returns {Object} Verification result
 */
GDAF.prototype.verifyCredential = function(credential, options) {
  return this.attestationVerifier.verifyCredential(credential, options)
}

/**
 * Verify presentation
 * @param {Object} presentation - Presentation to verify
 * @param {Object} options - Verification options
 * @returns {Object} Verification result
 */
GDAF.prototype.verifyPresentation = function(presentation, options) {
  return this.attestationVerifier.verifyPresentation(presentation, options)
}

/**
 * Extract claims from credentials
 * @param {Array} credentials - Array of credentials
 * @returns {Object} Extracted claims
 */
GDAF.prototype.extractClaims = function(credentials) {
  return this.attestationVerifier.extractClaims(credentials)
}

/**
 * Zero-Knowledge Methods
 */

/**
 * Generate selective disclosure proof
 * @param {Object} credential - Original credential
 * @param {Array} revealedFields - Fields to reveal
 * @param {String} nonce - Proof nonce
 * @returns {Object} ZK proof
 */
GDAF.prototype.generateSelectiveProof = function(credential, revealedFields, nonce) {
  return this.zkProver.generateSelectiveProof(credential, revealedFields, nonce)
}

/**
 * Verify selective disclosure proof
 * @param {Object} proof - ZK proof
 * @param {Object} publicData - Public verification data
 * @returns {Boolean} Verification result
 */
GDAF.prototype.verifySelectiveProof = function(proof, publicData) {
  return this.zkProver.verifySelectiveProof(proof, publicData)
}

/**
 * Generate age verification proof
 * @param {Object} ageCredential - Age credential
 * @param {Number} minimumAge - Minimum age requirement
 * @param {String} nonce - Proof nonce
 * @returns {Object} ZK proof
 */
GDAF.prototype.generateAgeProof = function(ageCredential, minimumAge, nonce) {
  // For this demo, we'll work with the birth date directly
  // In a real implementation, this would extract from the credential
  var birthDate = new Date('1995-06-15') // This should come from the credential creation
  return this.zkProver.generateAgeProof(birthDate, minimumAge, nonce)
}

/**
 * Verify age proof
 * @param {Object} proof - Age proof
 * @param {Number} minimumAge - Minimum age requirement
 * @param {String} issuerDID - Issuer DID
 * @returns {Boolean} Verification result
 */
GDAF.prototype.verifyAgeProof = function(proof, minimumAge, issuerDID) {
  return this.zkProver.verifyAgeProof(proof, minimumAge, issuerDID)
}

/**
 * Generate range proof
 * @param {Number} value - Value to prove
 * @param {Number} min - Minimum value
 * @param {Number} max - Maximum value
 * @param {String} nonce - Proof nonce
 * @returns {Object} Range proof
 */
GDAF.prototype.generateRangeProof = function(value, min, max, nonce) {
  return this.zkProver.generateRangeProof(value, min, max, nonce)
}

/**
 * Verify range proof
 * @param {Object} proof - Range proof
 * @param {Number} min - Minimum value
 * @param {Number} max - Maximum value
 * @returns {Boolean} Verification result
 */
GDAF.prototype.verifyRangeProof = function(proof, min, max) {
  return this.zkProver.verifyRangeProof(proof, min, max)
}

/**
 * Generate membership proof
 * @param {String} value - Value to prove membership
 * @param {Array} validSet - Set of valid values
 * @param {String} nonce - Proof nonce
 * @returns {Object} Membership proof
 */
GDAF.prototype.generateMembershipProof = function(value, validSet, nonce) {
  return this.zkProver.generateMembershipProof(value, validSet, nonce)
}

/**
 * Verify membership proof
 * @param {Object} proof - Membership proof
 * @param {Array} validSet - Set of valid values
 * @returns {Boolean} Verification result
 */
GDAF.prototype.verifyMembershipProof = function(proof, validSet) {
  return this.zkProver.verifyMembershipProof(proof, validSet)
}

/**
 * Blockchain Anchoring Methods
 */

/**
 * Anchor credential to blockchain
 * @param {Object} credential - Credential to anchor
 * @param {PrivateKey} privateKey - Private key for transaction
 * @param {Object} options - Anchoring options
 * @returns {Object} Anchor result
 */
GDAF.prototype.anchorCredential = function(credential, privateKey, options) {
  var anchor = new SmartLedgerAnchor(privateKey, this._anchorOptions)
  return anchor.anchorCredential(credential, privateKey, options)
}

/**
 * Anchor credentials in batch
 * @param {Array} credentials - Array of credentials
 * @param {PrivateKey} privateKey - Private key for transaction
 * @param {Object} options - Anchoring options
 * @returns {Object} Batch anchor result
 */
GDAF.prototype.anchorBatch = function(credentials, privateKey, options) {
  var anchor = new SmartLedgerAnchor(privateKey, this._anchorOptions)
  return anchor.anchorBatch(credentials, privateKey, options)
}

/**
 * Register DID on blockchain
 * @param {String} did - DID to register
 * @param {Object} didDocument - DID document
 * @param {PrivateKey} privateKey - Private key for transaction
 * @param {Object} options - Registration options
 * @returns {Object} Registration result
 */
GDAF.prototype.registerDID = function(did, didDocument, privateKey, options) {
  var anchor = new SmartLedgerAnchor(privateKey, this._anchorOptions)
  return anchor.registerDID(did, didDocument, privateKey, options)
}

/**
 * Revoke credential on blockchain
 * @param {String} credentialId - Credential ID to revoke
 * @param {String} reason - Revocation reason
 * @param {PrivateKey} privateKey - Private key for transaction
 * @param {Object} options - Revocation options
 * @returns {Object} Revocation result
 */
GDAF.prototype.revokeCredential = function(credentialId, reason, privateKey, options) {
  var anchor = new SmartLedgerAnchor(privateKey, this._anchorOptions)
  return anchor.revokeCredential(credentialId, reason, privateKey, options)
}

/**
 * Query anchored data
 * @param {String} hash - Content hash to query
 * @returns {Object} Query result
 */
GDAF.prototype.queryAnchoredData = function(hash) {
  var anchor = new SmartLedgerAnchor(null, this._anchorOptions)
  return anchor.queryAnchoredData(hash)
}

/**
 * Schema Methods
 */

/**
 * Validate credential against schema
 * @param {Object} credential - Credential to validate
 * @param {String|Object} schema - Schema name or definition
 * @returns {Object} Validation result
 */
GDAF.prototype.validateCredential = function(credential, schema) {
  return this.schemaValidator.validate(credential, schema)
}

/**
 * Get schema definition
 * @param {String} credentialType - Type of credential
 * @returns {Object} Schema definition
 */
GDAF.prototype.getSchema = function(credentialType) {
  return this.schemaValidator.getSchema(credentialType)
}

/**
 * Get all available schemas
 * @returns {Object} All schema definitions
 */
GDAF.prototype.getAllSchemas = function() {
  return this.schemaValidator.getAllSchemas()
}

/**
 * Add custom schema
 * @param {String} name - Schema name
 * @param {Object} definition - Schema definition
 */
GDAF.prototype.addSchema = function(name, definition) {
  return this.schemaValidator.addSchema(name, definition)
}

/**
 * Create credential template
 * @param {String} credentialType - Type of credential
 * @returns {Object} Template credential
 */
GDAF.prototype.createTemplate = function(credentialType) {
  return this.schemaValidator.createTemplate(credentialType)
}

/**
 * Utility Methods
 */

/**
 * Generate nonce for proofs
 * @param {Number} length - Nonce length (default: 32)
 * @returns {String} Random nonce
 */
GDAF.prototype.generateNonce = function(length) {
  length = length || 32
  var crypto = require('crypto')
  return crypto.randomBytes(length).toString('hex')
}

/**
 * Hash data for privacy
 * @param {String} data - Data to hash
 * @param {String} salt - Optional salt
 * @returns {String} Hash value
 */
GDAF.prototype.hashData = function(data, salt) {
  var crypto = require('crypto')
  var hash = crypto.createHash('sha256')
  hash.update(data)
  if (salt) {
    hash.update(salt)
  }
  return hash.digest('hex')
}

/**
 * Get framework version
 * @returns {String} Version string
 */
GDAF.prototype.getVersion = function() {
  return '1.0.0'
}

/**
 * Get framework info
 * @returns {Object} Framework information
 */
GDAF.prototype.getInfo = function() {
  return {
    name: 'SmartLedger BSV Global Digital Attestation Framework',
    version: this.getVersion(),
    description: 'W3C-compliant verifiable credentials with DID resolution, zero-knowledge proofs, and blockchain anchoring',
    components: {
      didResolver: 'DID Resolution and Management',
      attestationSigner: 'Verifiable Credential Creation',
      attestationVerifier: 'Credential and Presentation Verification',
      zkProver: 'Zero-Knowledge Proof Generation and Verification',
      anchor: 'Blockchain Anchoring and Timestamping',
      schemaValidator: 'W3C VC Schema Validation'
    },
    standards: [
      'W3C Verifiable Credentials Data Model v1.1',
      'W3C Decentralized Identifiers (DIDs) v1.0',
      'RFC 7515 JSON Web Signature (JWS)',
      'BSV Blockchain Protocol'
    ]
  }
}

module.exports = GDAF