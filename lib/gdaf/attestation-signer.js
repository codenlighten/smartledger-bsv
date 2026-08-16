'use strict'

var Random = require('../crypto/random')
var DIDResolver = require('./did-resolver')
var PrivateKey = require('../privatekey')
var Hash = require('../crypto/hash')
var ECDSA = require('../crypto/ecdsa')
var Signature = require('../crypto/signature')
var $ = require('../util/preconditions')
var JCS = require('../util/jcs')
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
 * Recursively produce a value with all object keys sorted, so that
 * JSON.stringify yields a deterministic, fully-covering serialization.
 *
 * IMPORTANT: this replaces a previous implementation that called
 * `JSON.stringify(obj, Object.keys(obj).sort())`. That used the JSON.stringify
 * *replacer array* form, which whitelists keys at EVERY nesting level to the
 * top-level key set. The result was that nested objects (notably
 * `credentialSubject`) serialized to `{}` and were therefore NOT covered by the
 * signature -- a forger could rewrite the subject's claims without invalidating
 * the proof. This recursive sort includes every key at every depth.
 *
 * Note: keys are ordered with Array.prototype.sort (UTF-16 code-unit order) and
 * inserted in that order. Credential keys are non-integer strings, so insertion
 * order is preserved by JSON.stringify; do not feed integer-like keys here.
 *
 * @param {*} value - Value to canonicalize
 * @returns {*} Value with all nested object keys sorted
 * @private
 */
AttestationSigner._sortValue = function(value) {
  if (Array.isArray(value)) {
    // Arrays are order-significant: preserve order, canonicalize each element.
    return value.map(function(item) { return AttestationSigner._sortValue(item) })
  }
  if (value !== null && typeof value === 'object') {
    return Object.keys(value).sort().reduce(function(sorted, key) {
      sorted[key] = AttestationSigner._sortValue(value[key])
      return sorted
    }, {})
  }
  // Primitives (string, number, boolean, null) are returned unchanged.
  return value
}

/**
 * Create canonical JSON string for signing
 * @param {Object} obj - Object to canonicalize
 * @returns {String} Canonical JSON string
 */
AttestationSigner._canonicalizeJSON = function(obj) {
  // Deterministic serialization that covers every nested key at every depth.
  return JSON.stringify(AttestationSigner._sortValue(obj))
}

/**
 * RFC 8785 (JCS) canonical JSON.
 *
 * `_canonicalizeJSON` above sorts keys and then REBUILDS an object, which loses the
 * sort: V8 orders integer-like own properties numerically ahead of string keys whatever
 * order they were inserted in. So `{ '10': …, '2': … }` serialized as
 *
 *     ours   {"2":"two","10":"ten"}
 *     JCS    {"10":"ten","2":"two"}      (UTF-16 code-unit order)
 *
 * Within this library that is merely deterministic-but-nonstandard: signing and
 * verification agree, and no forgery follows from it. Across implementations it is a
 * verification failure — GDAF credentials exist to be checked by other parties, and a
 * JCS-conformant verifier in any language computes a different hash and rejects a valid
 * signature. The previous implementation acknowledged this with "do not feed integer-like
 * keys here", which is a constraint the data cannot be relied upon to honour.
 *
 * This serializes directly instead of round-tripping through an object, so the order
 * actually survives. Array.prototype.sort already compares strings by UTF-16 code unit,
 * which is exactly what JCS specifies; the bug was never the sort.
 *
 * JSON.stringify is used for the leaf types on purpose: for finite numbers it produces
 * ECMAScript Number::toString, which is what JCS mandates, and since ES2019 it emits
 * well-formed output for lone surrogates. Both are hard to reproduce by hand and easy to
 * get subtly wrong.
 *
 * @param {*} value - Value to serialize
 * @returns {String} RFC 8785 canonical JSON
 */
AttestationSigner._canonicalizeJCS = function (value) {
  return JCS.stringify(value)
}

/**
 * Create hash of credential for signing
 * @param {Object} credential - Credential object
 * @returns {Buffer} SHA256 hash
 */
AttestationSigner._hashCredential = function (credential, canonicalization) {
  // RFC 8785 by default. `'legacy'` selects the pre-JCS sorted-key form, which is kept
  // ONLY so credentials signed before the change still verify — see
  // AttestationSigner.CANONICALIZATION. New signatures must never use it.
  var canonical = canonicalization === AttestationSigner.CANONICALIZATION.LEGACY
    ? AttestationSigner._canonicalizeJSON(credential)
    : AttestationSigner._canonicalizeJCS(credential)
  return Hash.sha256(Buffer.from(canonical, 'utf8'))
}

/**
 * Canonicalization forms understood when hashing a credential.
 *
 * JCS is RFC 8785 and is what everything signs with now. LEGACY is the sorted-key form
 * this library used before, retained so existing credentials keep verifying: it is
 * deterministic but not interoperable, because rebuilding the object let V8 reorder
 * integer-like keys ahead of the sort.
 */
AttestationSigner.CANONICALIZATION = {
  JCS: 'jcs',
  LEGACY: 'legacy'
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
  var random = Random.getRandomBuffer(16)
  
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