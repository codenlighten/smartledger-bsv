'use strict'

var bsv = require('../../')
var DIDResolver = require('./did-resolver')
var AttestationSigner = require('./attestation-signer')
var PublicKey = bsv.PublicKey
var Hash = bsv.crypto.Hash
var ECDSA = bsv.crypto.ECDSA
var Signature = bsv.crypto.Signature
var $ = bsv.util.preconditions

/**
 * AttestationVerifier
 * 
 * Verifies W3C Verifiable Credentials and Presentations created by
 * AttestationSigner. Provides comprehensive validation including:
 * - Signature verification
 * - DID resolution and validation
 * - Schema compliance checking
 * - Temporal validity (expiration, issuance dates)
 * - Trust chain validation
 */

/**
 * AttestationVerifier constructor
 * @param {Object} options - Configuration options
 */
function AttestationVerifier(options) {
  if (!(this instanceof AttestationVerifier)) {
    return new AttestationVerifier(options)
  }
  
  this.options = options || {}
  this.trustedIssuers = this.options.trustedIssuers || []
  
  return this
}

/**
 * Verify a Verifiable Credential
 * @param {Object} credential - Credential to verify
 * @param {Object} options - Verification options
 * @returns {Promise<Object>} Verification result
 */
AttestationVerifier.verifyCredential = async function(credential, options) {
  options = options || {}
  
  try {
    $.checkArgument(credential && typeof credential === 'object', 'Invalid credential')
    
    var result = {
      valid: false,
      errors: [],
      warnings: [],
      checks: {
        structure: false,
        signature: false,
        issuer: false,
        temporal: false,
        schema: false
      }
    }
    
    // 1. Structure validation
    var structureCheck = AttestationVerifier._validateStructure(credential)
    result.checks.structure = structureCheck.valid
    if (!structureCheck.valid) {
      result.errors = result.errors.concat(structureCheck.errors)
    }
    
    // 2. Signature verification
    var signatureCheck = await AttestationVerifier._verifySignature(credential)
    result.checks.signature = signatureCheck.valid
    if (!signatureCheck.valid) {
      result.errors = result.errors.concat(signatureCheck.errors)
    } else {
      result.issuerDID = signatureCheck.issuerDID
      result.verificationMethod = signatureCheck.verificationMethod
    }
    
    // 3. Issuer validation
    var issuerCheck = await AttestationVerifier._validateIssuer(credential, options)
    result.checks.issuer = issuerCheck.valid
    if (!issuerCheck.valid) {
      result.errors = result.errors.concat(issuerCheck.errors)
    }
    if (issuerCheck.warnings) {
      result.warnings = result.warnings.concat(issuerCheck.warnings)
    }
    
    // 4. Temporal validation
    var temporalCheck = AttestationVerifier._validateTemporal(credential)
    result.checks.temporal = temporalCheck.valid
    if (!temporalCheck.valid) {
      result.errors = result.errors.concat(temporalCheck.errors)
    }
    if (temporalCheck.warnings) {
      result.warnings = result.warnings.concat(temporalCheck.warnings)
    }
    
    // 5. Schema validation (if schema provided)
    if (options.schema) {
      var schemaCheck = AttestationVerifier._validateSchema(credential, options.schema)
      result.checks.schema = schemaCheck.valid
      if (!schemaCheck.valid) {
        result.errors = result.errors.concat(schemaCheck.errors)
      }
    } else {
      result.checks.schema = true // Skip if no schema provided
    }
    
    // Overall validity
    result.valid = Object.values(result.checks).every(check => check === true)
    
    return result
    
  } catch (error) {
    return {
      valid: false,
      errors: ['Verification failed: ' + error.message],
      warnings: [],
      checks: {
        structure: false,
        signature: false,
        issuer: false,
        temporal: false,
        schema: false
      }
    }
  }
}

/**
 * Verify a Verifiable Presentation
 * @param {Object} presentation - Presentation to verify
 * @param {Object} options - Verification options
 * @returns {Promise<Object>} Verification result
 */
AttestationVerifier.verifyPresentation = async function(presentation, options) {
  options = options || {}
  
  try {
    $.checkArgument(presentation && typeof presentation === 'object', 'Invalid presentation')
    
    var result = {
      valid: false,
      errors: [],
      warnings: [],
      credentialResults: [],
      presentationValid: false
    }
    
    // Verify presentation structure
    if (!presentation.type || !presentation.type.includes('VerifiablePresentation')) {
      result.errors.push('Invalid presentation type')
      return result
    }
    
    if (!presentation.holder) {
      result.errors.push('Missing presentation holder')
      return result
    }
    
    // Verify presentation signature
    var presentationCheck = await AttestationVerifier._verifyPresentationSignature(presentation)
    result.presentationValid = presentationCheck.valid
    if (!presentationCheck.valid) {
      result.errors = result.errors.concat(presentationCheck.errors)
    }
    
    // Verify each credential in the presentation
    if (presentation.verifiableCredential && Array.isArray(presentation.verifiableCredential)) {
      for (var i = 0; i < presentation.verifiableCredential.length; i++) {
        var credential = presentation.verifiableCredential[i]
        var credentialResult = await AttestationVerifier.verifyCredential(credential, options)
        result.credentialResults.push({
          index: i,
          result: credentialResult
        })
        
        if (!credentialResult.valid) {
          result.errors.push('Credential ' + i + ' is invalid')
        }
      }
    }
    
    // Overall validity
    var allCredentialsValid = result.credentialResults.every(cr => cr.result.valid)
    result.valid = result.presentationValid && allCredentialsValid
    
    return result
    
  } catch (error) {
    return {
      valid: false,
      errors: ['Presentation verification failed: ' + error.message],
      warnings: [],
      credentialResults: [],
      presentationValid: false
    }
  }
}

/**
 * Validate credential structure
 * @private
 */
AttestationVerifier._validateStructure = function(credential) {
  var errors = []
  
  // Required fields
  if (!credential['@context']) {
    errors.push('Missing @context')
  } else if (!Array.isArray(credential['@context'])) {
    errors.push('@context must be an array')
  } else if (!credential['@context'].includes('https://www.w3.org/2018/credentials/v1')) {
    errors.push('Missing required W3C credentials context')
  }
  
  if (!credential.type) {
    errors.push('Missing type')
  } else if (!Array.isArray(credential.type)) {
    errors.push('type must be an array')
  } else if (!credential.type.includes('VerifiableCredential')) {
    errors.push('Must include VerifiableCredential type')
  }
  
  if (!credential.issuer) {
    errors.push('Missing issuer')
  }
  
  if (!credential.issuanceDate) {
    errors.push('Missing issuanceDate')
  }
  
  if (!credential.credentialSubject) {
    errors.push('Missing credentialSubject')
  }
  
  if (!credential.proof) {
    errors.push('Missing proof')
  }
  
  return {
    valid: errors.length === 0,
    errors: errors
  }
}

/**
 * Verify credential signature
 * @private
 */
AttestationVerifier._verifySignature = async function(credential) {
  try {
    var proof = credential.proof
    if (!proof) {
      return { valid: false, errors: ['Missing proof'] }
    }
    
    if (proof.type !== 'EcdsaSecp256k1Signature2019') {
      return { valid: false, errors: ['Unsupported proof type: ' + proof.type] }
    }
    
    if (!proof.verificationMethod) {
      return { valid: false, errors: ['Missing verification method'] }
    }
    
    if (!proof.jws) {
      return { valid: false, errors: ['Missing JWS signature'] }
    }
    
    // Extract DID from verification method
    var verificationMethod = proof.verificationMethod
    var did = verificationMethod.split('#')[0]
    
    // Get public key from DID
    var publicKey = DIDResolver.getPublicKey(did)
    
    // Recreate credential without proof for verification
    var credentialCopy = JSON.parse(JSON.stringify(credential))
    delete credentialCopy.proof
    delete credentialCopy.rootHash
    
    // Create hash
    var credentialHash = AttestationSigner._hashCredential(credentialCopy)
    
    // Verify signature
    var signature = AttestationVerifier._parseJWSSignature(proof.jws)
    
    var ecdsa = new ECDSA()
    ecdsa.hashbuf = credentialHash
    ecdsa.pubkey = publicKey
    ecdsa.sig = signature
    
    var valid = ecdsa.verify()
    
    if (valid) {
      return {
        valid: true,
        issuerDID: did,
        verificationMethod: verificationMethod
      }
    } else {
      return { valid: false, errors: ['Signature verification failed'] }
    }
    
  } catch (error) {
    return { valid: false, errors: ['Signature verification error: ' + error.message] }
  }
}

/**
 * Parse JWS signature
 * @private
 */
AttestationVerifier._parseJWSSignature = function(jws) {
  var parts = jws.split('.')
  if (parts.length !== 3) {
    throw new Error('Invalid JWS format')
  }
  
  var signatureB64 = parts[2]
  var signatureBuffer = Buffer.from(signatureB64, 'base64url')
  
  return Signature.fromDER(signatureBuffer)
}

/**
 * Verify presentation signature
 * @private
 */
AttestationVerifier._verifyPresentationSignature = async function(presentation) {
  try {
    var proof = presentation.proof
    if (!proof) {
      return { valid: false, errors: ['Missing presentation proof'] }
    }
    
    // Extract holder DID
    var holderDID = presentation.holder
    var publicKey = DIDResolver.getPublicKey(holderDID)
    
    // Recreate presentation without proof
    var presentationCopy = JSON.parse(JSON.stringify(presentation))
    delete presentationCopy.proof
    
    // Create hash
    var presentationHash = AttestationSigner._hashCredential(presentationCopy)
    
    // Verify signature
    var signature = AttestationVerifier._parseJWSSignature(proof.jws)
    
    var ecdsa = new ECDSA()
    ecdsa.hashbuf = presentationHash
    ecdsa.pubkey = publicKey
    ecdsa.sig = signature
    
    var valid = ecdsa.verify()
    
    return {
      valid: valid,
      errors: valid ? [] : ['Presentation signature verification failed']
    }
    
  } catch (error) {
    return { valid: false, errors: ['Presentation signature error: ' + error.message] }
  }
}

/**
 * Validate issuer
 * @private
 */
AttestationVerifier._validateIssuer = async function(credential, options) {
  var errors = []
  var warnings = []
  
  try {
    var issuer = credential.issuer
    
    // Validate DID format
    if (!DIDResolver.isValidDID(issuer)) {
      errors.push('Invalid issuer DID format')
      return { valid: false, errors: errors }
    }
    
    // Resolve DID document
    var resolution = await DIDResolver.resolve(issuer)
    if (!resolution.didDocument) {
      errors.push('Unable to resolve issuer DID')
      return { valid: false, errors: errors }
    }
    
    // Check if issuer is in trusted list
    if (options.trustedIssuers && Array.isArray(options.trustedIssuers)) {
      if (!options.trustedIssuers.includes(issuer)) {
        warnings.push('Issuer not in trusted list')
      }
    }
    
    return {
      valid: errors.length === 0,
      errors: errors,
      warnings: warnings
    }
    
  } catch (error) {
    return {
      valid: false,
      errors: ['Issuer validation error: ' + error.message],
      warnings: warnings
    }
  }
}

/**
 * Validate temporal constraints
 * @private
 */
AttestationVerifier._validateTemporal = function(credential) {
  var errors = []
  var warnings = []
  var now = new Date()
  
  // Validate issuance date
  if (credential.issuanceDate) {
    var issuanceDate = new Date(credential.issuanceDate)
    if (isNaN(issuanceDate.getTime())) {
      errors.push('Invalid issuanceDate format')
    } else if (issuanceDate > now) {
      errors.push('Credential issued in the future')
    }
  }
  
  // Validate expiration date
  if (credential.expirationDate) {
    var expirationDate = new Date(credential.expirationDate)
    if (isNaN(expirationDate.getTime())) {
      errors.push('Invalid expirationDate format')
    } else if (expirationDate <= now) {
      errors.push('Credential has expired')
    } else if (expirationDate <= new Date(now.getTime() + 24 * 60 * 60 * 1000)) {
      warnings.push('Credential expires within 24 hours')
    }
  }
  
  return {
    valid: errors.length === 0,
    errors: errors,
    warnings: warnings
  }
}

/**
 * Validate schema compliance
 * @private
 */
AttestationVerifier._validateSchema = function(credential, schema) {
  var errors = []
  
  // Basic schema validation (can be extended with JSON Schema validator)
  if (schema.requiredFields) {
    schema.requiredFields.forEach(function(field) {
      if (!AttestationVerifier._getNestedProperty(credential, field)) {
        errors.push('Missing required field: ' + field)
      }
    })
  }
  
  if (schema.requiredTypes) {
    var hasRequiredType = schema.requiredTypes.some(function(type) {
      return credential.type && credential.type.includes(type)
    })
    
    if (!hasRequiredType) {
      errors.push('Missing required credential type')
    }
  }
  
  return {
    valid: errors.length === 0,
    errors: errors
  }
}

/**
 * Get nested property from object
 * @private
 */
AttestationVerifier._getNestedProperty = function(obj, path) {
  return path.split('.').reduce(function(current, prop) {
    return current && current[prop]
  }, obj)
}

/**
 * Verify credential hash integrity
 * @param {Object} credential - Credential to verify
 * @returns {Boolean} True if hash matches
 */
AttestationVerifier.verifyCredentialHash = function(credential) {
  try {
    if (!credential.rootHash) {
      return false
    }
    
    var credentialCopy = JSON.parse(JSON.stringify(credential))
    delete credentialCopy.proof
    delete credentialCopy.rootHash
    
    var computedHash = AttestationSigner._hashCredential(credentialCopy)
    var storedHash = Buffer.from(credential.rootHash, 'hex')
    
    return Buffer.compare(computedHash, storedHash) === 0
  } catch (error) {
    return false
  }
}

/**
 * Extract claims from credential
 * @param {Object} credential - Credential
 * @returns {Object} Extracted claims
 */
AttestationVerifier.extractClaims = function(credential) {
  try {
    var claims = {
      issuer: credential.issuer,
      subject: credential.credentialSubject.id || 'unknown',
      types: credential.type || [],
      issuanceDate: credential.issuanceDate,
      expirationDate: credential.expirationDate,
      claims: {}
    }
    
    // Extract subject claims
    Object.keys(credential.credentialSubject).forEach(function(key) {
      if (key !== 'id') {
        claims.claims[key] = credential.credentialSubject[key]
      }
    })
    
    return claims
  } catch (error) {
    return null
  }
}

/**
 * Create verification report
 * @param {Object} verificationResult - Result from verifyCredential
 * @returns {String} Human-readable report
 */
AttestationVerifier.createReport = function(verificationResult) {
  var report = []
  
  report.push('=== Credential Verification Report ===')
  report.push('Overall Status: ' + (verificationResult.valid ? 'VALID' : 'INVALID'))
  report.push('')
  
  // Checks
  report.push('Verification Checks:')
  Object.keys(verificationResult.checks).forEach(function(check) {
    var status = verificationResult.checks[check] ? '✓' : '✗'
    report.push('  ' + status + ' ' + check.charAt(0).toUpperCase() + check.slice(1))
  })
  report.push('')
  
  // Errors
  if (verificationResult.errors.length > 0) {
    report.push('Errors:')
    verificationResult.errors.forEach(function(error) {
      report.push('  • ' + error)
    })
    report.push('')
  }
  
  // Warnings
  if (verificationResult.warnings.length > 0) {
    report.push('Warnings:')
    verificationResult.warnings.forEach(function(warning) {
      report.push('  • ' + warning)
    })
    report.push('')
  }
  
  // Issuer info
  if (verificationResult.issuerDID) {
    report.push('Issuer: ' + verificationResult.issuerDID)
  }
  
  if (verificationResult.verificationMethod) {
    report.push('Verification Method: ' + verificationResult.verificationMethod)
  }
  
  return report.join('\n')
}

module.exports = AttestationVerifier