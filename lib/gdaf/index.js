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
var $ = require('../util/preconditions')

/**
 * Main GDAF class
 */
function GDAF (options) {
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
GDAF.prototype.createDID = function (publicKey) {
  return this.didResolver.fromPublicKey(publicKey)
}

/**
 * Resolve DID document
 * @param {String} did - DID identifier
 * @returns {Object} DID document
 */
GDAF.prototype.resolveDID = function (did) {
  return this.didResolver.resolve(did)
}

/**
 * Verify DID ownership
 * @param {String} did - DID identifier
 * @param {PrivateKey} privateKey - Private key for verification
 * @returns {Boolean} Verification result
 */
GDAF.prototype.verifyDIDOwnership = function (did, privateKey) {
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
GDAF.prototype.createEmailCredential = function (issuerDID, subjectDID, email, issuerPrivateKey) {
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
GDAF.prototype.createAgeCredential = function (issuerDID, subjectDID, ageThreshold, birthDate, issuerPrivateKey) {
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
GDAF.prototype.createKYCCredential = function (issuerDID, subjectDID, level, piiHashes, issuerPrivateKey) {
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
GDAF.prototype.createOrganizationCredential = function (issuerDID, subjectDID, orgData, issuerPrivateKey) {
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
GDAF.prototype.createPresentation = function (credentials, holderDID, holderPrivateKey, options) {
  var signer = new AttestationSigner(holderPrivateKey, this._attestationSignerOptions)
  return signer.createPresentation(credentials, holderDID, holderPrivateKey, options)
}

/**
 * Sign credential
 * @param {Object} credential - Credential to sign
 * @param {PrivateKey} privateKey - Signing private key
 * @returns {Object} Signed credential
 */
GDAF.prototype.signCredential = function (credential, privateKey) {
  var signer = new AttestationSigner(privateKey, this._attestationSignerOptions)
  return signer.signCredential(credential, privateKey)
}

/**
 * Verification Methods
 */

/**
 * Verify credential.
 *
 * ASYNC — this returns a Promise. `if (verifyCredential(c))` is ALWAYS true, because a Promise is
 * truthy, so a missing `await` turns this into an authorisation bypass.
 *
 * `valid: true` MEANS THE CREDENTIAL IS INTERNALLY CONSISTENT. It does NOT mean the credential
 * came from anyone you trust. A tampered subject, a removed proof and an issuer field that
 * disagrees with the signing key are all rejected — but anyone can mint a key, issue a credential
 * to themselves claiming any attribute, and that credential verifies `valid: true` with their own
 * DID as the issuer. That is correct for a self-contained DID method, and it is a trap:
 *
 *     const r = await verifyCredential(credential)
 *     if (!r.valid) reject()
 *     if (r.issuerDID !== OUR_TRUST_ANCHOR) reject()   // <- this line is yours, not ours
 *
 * Compare `issuerDID` against your own trust anchor. A public endpoint returning this result
 * without that comparison tells the world a self-issued claim is verified — the gap the vg-wallet
 * session found in its own verify route, and asked us to document so the next consumer does not
 * repeat it.
 *
 * @param {Object} credential - Credential to verify
 * @param {Object} [options] - Verification options
 * @returns {Promise<Object>} { valid, errors, warnings, checks, issuerDID } — `valid` is internal
 *   consistency only; see above.
 */
GDAF.prototype.verifyCredential = function (credential, options) {
  return this.attestationVerifier.verifyCredential(credential, options)
}

/**
 * Verify presentation
 * @param {Object} presentation - Presentation to verify
 * @param {Object} options - Verification options
 * @returns {Object} Verification result
 */
GDAF.prototype.verifyPresentation = function (presentation, options) {
  return this.attestationVerifier.verifyPresentation(presentation, options)
}

/**
 * Extract claims from credentials
 * @param {Array} credentials - Array of credentials
 * @returns {Object} Extracted claims
 */
GDAF.prototype.extractClaims = function (credentials) {
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
GDAF.prototype.generateSelectiveProof = function (credential, disclosePaths, salt) {
  return this.zkProver.generateSelectiveProof(credential, disclosePaths, salt)
}

/**
 * Verify selective disclosure proof
 * @param {Object} proof - ZK proof
 * @param {Object} publicData - Public verification data
 * @returns {Boolean} Verification result
 */
GDAF.prototype.verifySelectiveProof = function (proof, expectedRoot) {
  return this.zkProver.verifySelectiveProof(proof, expectedRoot)
}

/**
 * Coerce the birth date an age proof commits to, or throw.
 *
 * This exists because the wrapper below USED TO IGNORE ITS ARGUMENT. It took an
 * `ageCredential`, discarded it, and committed to a hardcoded `new Date('1995-06-15')` behind
 * the comment "in a real implementation, this would extract from the credential". Every caller
 * therefore got a proof about the same fictitious person: measured on published 9.35.0, two
 * credentials for subjects born 2015 and 1960 produced byte-identical commitments and openings,
 * and a credential for a subject born 2015-03-01 produced a proof that verified TRUE for every
 * `minimumAge` from 1 to 31 (32 and above threw "Age requirement not met" for everyone).
 *
 * It cannot be "finished" as written, and that is the part worth stating plainly.
 * `createAgeCredential` stores only `credentialSubject.birthDateHash =
 * sha256(birthDate.toISOString())`; the credential never carries the date. The proof commits to
 * `sha256('YYYY-MM-DD' + ':' + salt)`. There is no function from the credential to the proof —
 * not a missing one, an impossible one — so the declared signature promised something the
 * credential format cannot supply.
 *
 * So this takes the birth date itself, and REFUSES A CREDENTIAL rather than reading a date out
 * of one. Reading an unverified `credentialSubject.birthDate` would have been the tempting fix
 * and is the wrong one: it swaps a hardcoded date for a caller-supplied one while still looking
 * like a statement about an authenticated credential. Nothing here checks an issuer signature,
 * a subject binding or a status list. A caller who wants that must verify the credential first
 * and pass the date it establishes.
 *
 * What the resulting proof means is therefore narrow, and the same as the module's: it shows a
 * commitment consistent with the date the caller supplied. It attests nothing about whose date
 * it is. See the `verifyAgeProof` note in lib/gdaf/zk-prover.js.
 */
function ageProofBirthDate (value) {
  $.checkArgument(value !== undefined && value !== null, 'Birth date is required')

  if (value instanceof Date) {
    $.checkArgument(!isNaN(value.getTime()), 'Birth date is an invalid Date')
  } else if (typeof value === 'string') {
    // Strict calendar parsing. `new Date('2015-3-1')` and `new Date('March 2015')` both
    // "work" and mean different things in different runtimes, and a bare `YYYY-MM-DD` is
    // parsed as UTC while `YYYY-MM-DDT00:00:00` is local — a day of drift either way. So
    // only the one unambiguous form is accepted, and it must round-trip: that is what
    // rejects 2015-02-30, which Date would otherwise roll forward to March 2nd.
    var m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(value)
    $.checkArgument(m, 'Birth date string must be YYYY-MM-DD')
    var parsed = new Date(Date.UTC(+m[1], +m[2] - 1, +m[3]))
    $.checkArgument(
      !isNaN(parsed.getTime()) && parsed.toISOString().slice(0, 10) === value,
      'Birth date is not a real calendar date'
    )
    value = parsed
  } else {
    // An object reaching here is almost always a credential, because that is what the old
    // signature asked for. Say so, rather than failing a type check it cannot act on.
    $.checkArgument(
      typeof value !== 'object',
      'Birth date must be a Date or a YYYY-MM-DD string, not a credential. A GDAF age ' +
      'credential carries only birthDateHash, so no age proof can be derived from it; verify ' +
      'the credential yourself and pass the birth date it establishes.'
    )
    $.checkArgument(false, 'Birth date must be a Date or a YYYY-MM-DD string')
  }

  $.checkArgument(value.getTime() <= Date.now(), 'Birth date is in the future')
  return value
}

/**
 * Generate age verification proof
 * @param {Date|String} birthDate - the subject's birth date, as a Date or a YYYY-MM-DD string.
 *   A credential is refused: see ageProofBirthDate above for why it cannot be accepted.
 * @param {Number} minimumAge - Minimum age requirement
 * @param {String} salt - Proof salt
 * @returns {Object} ZK proof
 */
GDAF.prototype.generateAgeProof = function (birthDate, minimumAge, salt) {
  return this.zkProver.generateAgeProof(ageProofBirthDate(birthDate), minimumAge, salt)
}

/**
 * Verify age proof
 * @param {Object} proof - Age proof
 * @param {Number} minimumAge - Minimum age requirement
 * @param {String} issuerDID - Issuer DID
 * @returns {Boolean} Verification result
 */
GDAF.prototype.verifyAgeProof = function (proof, requiredAge, opening) {
  return this.zkProver.verifyAgeProof(proof, requiredAge, opening)
}

/**
 * Generate range proof
 * @param {Number} value - Value to prove
 * @param {Number} min - Minimum value
 * @param {Number} max - Maximum value
 * @param {String} nonce - Proof nonce
 * @returns {Object} Range proof
 */
GDAF.prototype.generateRangeProof = function (value, min, max, salt) {
  return this.zkProver.generateRangeProof(value, min, max, salt)
}

/**
 * Verify range proof
 * @param {Object} proof - Range proof
 * @param {Number} min - Minimum value
 * @param {Number} max - Maximum value
 * @returns {Boolean} Verification result
 */
GDAF.prototype.verifyRangeProof = function (proof, min, max, opening) {
  return this.zkProver.verifyRangeProof(proof, min, max, opening)
}

/**
 * Generate membership proof
 * @param {String} value - Value to prove membership
 * @param {Array} validSet - Set of valid values
 * @param {String} nonce - Proof nonce
 * @returns {Object} Membership proof
 */
GDAF.prototype.generateMembershipProof = function (set, value, salt) {
  return this.zkProver.generateMembershipProof(set, value, salt)
}

/**
 * Verify membership proof
 * @param {Object} proof - Membership proof
 * @param {Array} validSet - Set of valid values
 * @returns {Boolean} Verification result
 */
GDAF.prototype.verifyMembershipProof = function (proof, opening, set) {
  return this.zkProver.verifyMembershipProof(proof, opening, set)
}

/**
 * Blockchain Anchoring Methods
 */

/**
 * Normalise the `options` argument of the anchoring wrappers to `{ metadata, utxos }`.
 *
 * These wrappers take (payload, privateKey, options) while the underlying anchor methods
 * take (payload, metadata, utxos) — so every one of them forwarded `privateKey` into a
 * slot that is not a key. For registerDID/revokeCredential that landed in `utxos` and died
 * on `utxos.reduce`; for anchorCredential/anchorBatch it landed in `metadata`, which is
 * JSON.stringify-ed straight into the OP_RETURN, publishing the secret scalar on chain.
 *
 * A bare array is still accepted as the UTXO list, because that was the only shape that
 * previously produced a transaction at all.
 */
function _anchorOpts (options) {
  if (Array.isArray(options)) return { metadata: undefined, utxos: options }
  options = options || {}
  return { metadata: options.metadata, utxos: options.utxos }
}

/**
 * Anchor credential to blockchain
 * @param {Object} credential - Credential to anchor
 * @param {PrivateKey} privateKey - Private key for transaction
 * @param {Object} options - Anchoring options
 * @returns {Object} Anchor result
 */
GDAF.prototype.anchorCredential = function (credentialHash, privateKey, options) {
  var anchor = new SmartLedgerAnchor(privateKey, this._anchorOptions)
  var opts = _anchorOpts(options)
  // `privateKey` is NOT forwarded: the anchor already holds it, and its second parameter
  // is `metadata`, which is JSON-serialised into the OP_RETURN. Passing the key here
  // published it on chain. See the note above _anchorOpts.
  return anchor.anchorCredential(credentialHash, opts.metadata, opts.utxos)
}

/**
 * Anchor credentials in batch
 * @param {Array} credentials - Array of credentials
 * @param {PrivateKey} privateKey - Private key for transaction
 * @param {Object} options - Anchoring options
 * @returns {Object} Batch anchor result
 */
GDAF.prototype.anchorBatch = function (credentialHashes, privateKey, options) {
  var anchor = new SmartLedgerAnchor(privateKey, this._anchorOptions)
  var opts = _anchorOpts(options)
  return anchor.anchorBatch(credentialHashes, opts.metadata, opts.utxos)
}

/**
 * Register DID on blockchain
 * @param {String} did - DID to register
 * @param {Object} didDocument - DID document
 * @param {PrivateKey} privateKey - Private key for transaction
 * @param {Object} options - Registration options
 * @returns {Object} Registration result
 */
GDAF.prototype.registerDID = function (did, didDocument, privateKey, options) {
  var anchor = new SmartLedgerAnchor(privateKey, this._anchorOptions)
  return anchor.registerDID(did, didDocument, _anchorOpts(options).utxos)
}

/**
 * Revoke credential on blockchain
 * @param {String} credentialId - Credential ID to revoke
 * @param {String} reason - Revocation reason
 * @param {PrivateKey} privateKey - Private key for transaction
 * @param {Object} options - Revocation options
 * @returns {Object} Revocation result
 */
GDAF.prototype.revokeCredential = function (credentialId, reason, privateKey, options) {
  var anchor = new SmartLedgerAnchor(privateKey, this._anchorOptions)
  return anchor.revokeCredential(credentialId, reason, _anchorOpts(options).utxos)
}

/**
 * Query anchored data
 * @param {String} hash - Content hash to query
 * @returns {Object} Query result
 */
GDAF.prototype.queryAnchoredData = function (hash) {
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
GDAF.prototype.validateCredential = function (credential, schema) {
  return this.schemaValidator.validate(credential, schema)
}

/**
 * Get schema definition
 * @param {String} credentialType - Type of credential
 * @returns {Object} Schema definition
 */
GDAF.prototype.getSchema = function (credentialType) {
  return this.schemaValidator.getSchema(credentialType)
}

/**
 * Get all available schemas
 * @returns {Object} All schema definitions
 */
GDAF.prototype.getAllSchemas = function () {
  return this.schemaValidator.getAllSchemas()
}

/**
 * Add custom schema
 * @param {String} name - Schema name
 * @param {Object} definition - Schema definition
 */
GDAF.prototype.addSchema = function (name, definition) {
  return this.schemaValidator.addSchema(name, definition)
}

/**
 * Create credential template
 * @param {String} credentialType - Type of credential
 * @returns {Object} Template credential
 */
GDAF.prototype.createTemplate = function (credentialType) {
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
GDAF.prototype.generateNonce = function (length) {
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
GDAF.prototype.hashData = function (data, salt) {
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
GDAF.prototype.getVersion = function () {
  return '1.0.0'
}

/**
 * Get framework info
 * @returns {Object} Framework information
 */
GDAF.prototype.getInfo = function () {
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
