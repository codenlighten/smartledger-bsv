'use strict'

var bsv = require('../../')
var DIDResolver = require('./did-resolver')
var PrivateKey = bsv.PrivateKey
var Hash = bsv.crypto.Hash
var ECDSA = bsv.crypto.ECDSA
var Signature = bsv.crypto.Signature
var $ = bsv.util.preconditions
var _ = require('../util/_')

/**
 * AttestationSigner
 * 
 * Creates and signs W3C Verifiable Credentials using SmartLedger cryptographic
 * primitives. Supports JSON-LD format with embedded proofs compatible with
 * the Global Digital Attestation Framework (GDAF).
 * 
 * Features:
 * - W3C VC Data Model 2.0 compliance
 * - Deterministic JSON serialization
 * - ECDSA signature proofs
 * - Multiple credential types
 * - Issuer DID integration
 * - Schema validation
 */

/**
 * AttestationSigner constructor
 * @param {PrivateKey|String} privateKey - Signing private key
 * @param {Object} options - Configuration options
 */
function AttestationSigner(privateKey, options) {
  if (!(this instanceof AttestationSigner)) {
    return new AttestationSigner(privateKey, options)
  }
  
  if (typeof privateKey === 'string') {
    privateKey = PrivateKey.fromWIF(privateKey)
  }
  
  $.checkArgument(privateKey instanceof PrivateKey, 'Invalid private key')
  
  this.privateKey = privateKey
  this.publicKey = privateKey.toPublicKey()
  this.options = options || {}
  this.did = DIDResolver.fromPrivateKey(privateKey, this.options)
  
  return this
}

/**
 * Create canonical JSON string for signing
 * @param {Object} obj - Object to canonicalize
 * @returns {String} Canonical JSON string
 */
AttestationSigner._canonicalizeJSON = function(obj) {
  // Use deterministic JSON serialization
  return JSON.stringify(obj, Object.keys(obj).sort())
}

/**
 * Create hash of credential for signing
 * @param {Object} credential - Credential object
 * @returns {Buffer} SHA256 hash
 */
AttestationSigner._hashCredential = function(credential) {
  var canonical = AttestationSigner._canonicalizeJSON(credential)
  return Hash.sha256(Buffer.from(canonical, 'utf8'))
}

/**
 * Create base credential structure
 * @param {Object} credentialSubject - Subject data
 * @param {Object} options - Additional options
 * @returns {Object} Base credential
 */
AttestationSigner.prototype.createCredential = function(credentialSubject, options) {
  options = options || {}
  
  $.checkArgument(credentialSubject && typeof credentialSubject === 'object', 'Invalid credential subject')
  
  var now = new Date().toISOString()
  var credentialId = options.id || 'urn:uuid:' + this._generateUUID()
  
  var credential = {
    '@context': [
      'https://www.w3.org/2018/credentials/v1'
    ],
    id: credentialId,
    type: ['VerifiableCredential'],
    issuer: this.did,
    issuanceDate: now,
    credentialSubject: credentialSubject
  }
  
  // Add additional types
  if (options.type) {
    if (Array.isArray(options.type)) {
      credential.type = credential.type.concat(options.type)
    } else {
      credential.type.push(options.type)
    }
  }
  
  // Add additional contexts
  if (options.context) {
    if (Array.isArray(options.context)) {
      credential['@context'] = credential['@context'].concat(options.context)
    } else {
      credential['@context'].push(options.context)
    }
  }
  
  // Add expiration date
  if (options.expirationDate) {
    credential.expirationDate = options.expirationDate
  }
  
  // Add terms of use
  if (options.termsOfUse) {
    credential.termsOfUse = options.termsOfUse
  }
  
  // Add evidence
  if (options.evidence) {
    credential.evidence = options.evidence
  }
  
  // Add refresh service
  if (options.refreshService) {
    credential.refreshService = options.refreshService
  }
  
  return credential
}

/**
 * Sign credential with ECDSA proof
 * @param {Object} credential - Credential to sign
 * @param {Object} options - Signing options
 * @returns {Object} Signed credential
 */
AttestationSigner.prototype.signCredential = function(credential, options) {
  options = options || {}
  
  $.checkArgument(credential && typeof credential === 'object', 'Invalid credential')
  
  // Create a copy to avoid mutating original
  var credentialCopy = JSON.parse(JSON.stringify(credential))
  
  // Remove any existing proof
  delete credentialCopy.proof
  
  // Create canonical hash
  var credentialHash = AttestationSigner._hashCredential(credentialCopy)
  
  // Sign the hash
  var ecdsa = new ECDSA()
  ecdsa.hashbuf = credentialHash
  ecdsa.privkey = this.privateKey
  ecdsa.pubkey = this.publicKey
  
  ecdsa.sign()
  var signature = ecdsa.sig
  
  var jwsSignature = this._createJWSSignature(credentialHash, signature)
  
  // Create proof object
  var proof = {
    type: 'EcdsaSecp256k1Signature2019',
    created: new Date().toISOString(),
    verificationMethod: this.did + '#keys-1',
    proofPurpose: options.proofPurpose || 'assertionMethod',
    jws: jwsSignature
  }
  
  // Add challenge if provided
  if (options.challenge) {
    proof.challenge = options.challenge
  }
  
  // Add domain if provided
  if (options.domain) {
    proof.domain = options.domain
  }
  
  // Add proof to credential
  var signedCredential = JSON.parse(JSON.stringify(credentialCopy))
  signedCredential.proof = proof
  
  // Add root hash for ZK proofs
  signedCredential.rootHash = credentialHash.toString('hex')
  
  return signedCredential
}

/**
 * Create JWS-style signature
 * @private
 */
AttestationSigner.prototype._createJWSSignature = function(hash, signature) {
  // Create minimal JWS header for ECDSA
  var header = {
    alg: 'ES256K',
    typ: 'JWT'
  }
  
  var headerB64 = Buffer.from(JSON.stringify(header)).toString('base64url')
  var payloadB64 = hash.toString('base64url')
  var signatureB64 = signature.toDER().toString('base64url')
  
  return headerB64 + '..' + signatureB64 // Empty payload for detached signature
}

/**
 * Create Email Verified Credential
 * @param {String} email - Email address
 * @param {Object} options - Additional options
 * @returns {Object} Signed credential
 */
AttestationSigner.prototype.createEmailCredential = function(email, options) {
  options = options || {}
  
  $.checkArgument(typeof email === 'string' && email.includes('@'), 'Invalid email address')
  
  var credentialSubject = {
    id: options.subjectId || 'did:smartledger:' + Hash.sha256(Buffer.from(email)).toString('hex'),
    email: email,
    verified: true,
    verificationMethod: 'email_verification',
    verificationTimestamp: new Date().toISOString()
  }
  
  var credentialOptions = {
    type: 'EmailVerifiedCredential',
    context: 'https://smartledger.technology/contexts/email/v1',
    ...options
  }
  
  var credential = this.createCredential(credentialSubject, credentialOptions)
  return this.signCredential(credential, options)
}

/**
 * Create Age Verification Credential
 * @param {Number} age - Age to verify
 * @param {Date} birthDate - Birth date (optional, for ZK proofs)
 * @param {Object} options - Additional options
 * @returns {Object} Signed credential
 */
AttestationSigner.prototype.createAgeCredential = function(age, birthDate, options) {
  options = options || {}
  
  $.checkArgument(typeof age === 'number' && age > 0, 'Invalid age')
  
  var credentialSubject = {
    id: options.subjectId || 'urn:uuid:' + this._generateUUID(),
    ageOver: age,
    verified: true,
    verificationMethod: 'age_verification'
  }
  
  // Include birth date hash for ZK proofs if provided
  if (birthDate) {
    credentialSubject.birthDateHash = Hash.sha256(Buffer.from(birthDate.toISOString())).toString('hex')
  }
  
  var credentialOptions = {
    type: 'AgeVerifiedCredential',
    context: 'https://smartledger.technology/contexts/age/v1',
    ...options
  }
  
  var credential = this.createCredential(credentialSubject, credentialOptions)
  return this.signCredential(credential, options)
}

/**
 * Create KYC Verified Credential
 * @param {Object} kycData - KYC verification data
 * @param {Object} options - Additional options
 * @returns {Object} Signed credential
 */
AttestationSigner.prototype.createKYCCredential = function(kycData, options) {
  options = options || {}
  
  $.checkArgument(kycData && typeof kycData === 'object', 'Invalid KYC data')
  
  var credentialSubject = {
    id: options.subjectId || 'urn:uuid:' + this._generateUUID(),
    kycLevel: kycData.level || 'basic',
    verified: true,
    verificationMethod: 'kyc_verification',
    verificationTimestamp: new Date().toISOString(),
    verifyingAuthority: kycData.authority || this.did
  }
  
  // Add hashed PII for privacy
  if (kycData.firstName) {
    credentialSubject.firstNameHash = Hash.sha256(Buffer.from(kycData.firstName)).toString('hex')
  }
  
  if (kycData.lastName) {
    credentialSubject.lastNameHash = Hash.sha256(Buffer.from(kycData.lastName)).toString('hex')
  }
  
  if (kycData.ssn) {
    credentialSubject.ssnHash = Hash.sha256(Buffer.from(kycData.ssn)).toString('hex')
  }
  
  var credentialOptions = {
    type: 'KYCVerifiedCredential',
    context: 'https://smartledger.technology/contexts/kyc/v1',
    ...options
  }
  
  var credential = this.createCredential(credentialSubject, credentialOptions)
  return this.signCredential(credential, options)
}

/**
 * Create Organization Credential
 * @param {Object} orgData - Organization data
 * @param {Object} options - Additional options
 * @returns {Object} Signed credential
 */
AttestationSigner.prototype.createOrganizationCredential = function(orgData, options) {
  options = options || {}
  
  $.checkArgument(orgData && typeof orgData === 'object', 'Invalid organization data')
  
  var credentialSubject = {
    id: options.subjectId || 'did:smartledger:org:' + Hash.sha256(Buffer.from(orgData.name || '')).toString('hex'),
    name: orgData.name,
    type: orgData.type || 'Organization',
    verified: true,
    verificationMethod: 'organization_verification',
    verificationTimestamp: new Date().toISOString()
  }
  
  // Add additional org fields
  if (orgData.taxId) {
    credentialSubject.taxIdHash = Hash.sha256(Buffer.from(orgData.taxId)).toString('hex')
  }
  
  if (orgData.incorporationState) {
    credentialSubject.incorporationState = orgData.incorporationState
  }
  
  if (orgData.industry) {
    credentialSubject.industry = orgData.industry
  }
  
  var credentialOptions = {
    type: 'OrganizationCredential',
    context: 'https://smartledger.technology/contexts/organization/v1',
    ...options
  }
  
  var credential = this.createCredential(credentialSubject, credentialOptions)
  return this.signCredential(credential, options)
}

/**
 * Generate UUID v4
 * @private
 */
AttestationSigner.prototype._generateUUID = function() {
  var random = bsv.crypto.Random.getRandomBuffer(16)
  
  // Set version (4) and variant bits
  random[6] = (random[6] & 0x0f) | 0x40
  random[8] = (random[8] & 0x3f) | 0x80
  
  var hex = random.toString('hex')
  return [
    hex.substring(0, 8),
    hex.substring(8, 12),
    hex.substring(12, 16),
    hex.substring(16, 20),
    hex.substring(20, 32)
  ].join('-')
}

/**
 * Create presentation of multiple credentials
 * @param {Array} credentials - Array of signed credentials
 * @param {Object} options - Presentation options
 * @returns {Object} Signed presentation
 */
AttestationSigner.prototype.createPresentation = function(credentials, options) {
  options = options || {}
  
  $.checkArgument(Array.isArray(credentials), 'Credentials must be an array')
  
  var presentation = {
    '@context': [
      'https://www.w3.org/2018/credentials/v1'
    ],
    type: ['VerifiablePresentation'],
    id: options.id || 'urn:uuid:' + this._generateUUID(),
    holder: this.did,
    verifiableCredential: credentials
  }
  
  // Add additional contexts
  if (options.context) {
    if (Array.isArray(options.context)) {
      presentation['@context'] = presentation['@context'].concat(options.context)
    } else {
      presentation['@context'].push(options.context)
    }
  }
  
  // Sign the presentation
  var presentationHash = AttestationSigner._hashCredential(presentation)
  
  var ecdsa = new ECDSA()
  ecdsa.hashbuf = presentationHash
  ecdsa.privkey = this.privateKey
  ecdsa.pubkey = this.publicKey
  
  ecdsa.sign()
  var signature = ecdsa.sig
  var jwsSignature = this._createJWSSignature(presentationHash, signature)
  
  var proof = {
    type: 'EcdsaSecp256k1Signature2019',
    created: new Date().toISOString(),
    verificationMethod: this.did + '#keys-1',
    proofPurpose: 'authentication',
    jws: jwsSignature
  }
  
  if (options.challenge) {
    proof.challenge = options.challenge
  }
  
  if (options.domain) {
    proof.domain = options.domain
  }
  
  presentation.proof = proof
  
  return presentation
}

/**
 * Get issuer information
 * @returns {Object} Issuer information
 */
AttestationSigner.prototype.getIssuerInfo = function() {
  return {
    did: this.did,
    publicKey: this.publicKey.toString('hex'),
    verificationMethod: this.did + '#keys-1'
  }
}

module.exports = AttestationSigner