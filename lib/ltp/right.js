'use strict'

var bsv = require('../../')
var Hash = bsv.crypto.Hash
var ECDSA = bsv.crypto.ECDSA
var PrivateKey = bsv.PrivateKey
var $ = bsv.util.preconditions
var _ = require('../util/_')

/**
 * Legal Token Protocol - Right Creation Primitives
 * 
 * Provides primitives for legal rights token creation, validation, and transfer
 * without direct blockchain publishing. External systems handle token storage
 * and blockchain anchoring operations.
 */

/**
 * Right Token Types
 */
var RightTypes = {
  PROPERTY_TITLE: 'PropertyTitle',
  VEHICLE_TITLE: 'VehicleTitle', 
  INTELLECTUAL_PROPERTY: 'IntellectualProperty',
  MUSIC_LICENSE: 'MusicLicense',
  SOFTWARE_LICENSE: 'SoftwareLicense',
  FINANCIAL_INSTRUMENT: 'FinancialInstrument',
  PROMISSORY_NOTE: 'PromissoryNote',
  BOND: 'Bond',
  EQUITY_SHARE: 'EquityShare',
  PROFESSIONAL_LICENSE: 'ProfessionalLicense',
  REGULATORY_PERMIT: 'RegulatoryPermit',
  ACCESS_RIGHT: 'AccessRight',
  VOTING_RIGHT: 'VotingRight',
  ROYALTY_RIGHT: 'RoyaltyRight',
  USAGE_RIGHT: 'UsageRight'
}

/**
 * Legal Right Token
 */
var RightToken = {
  
  /**
   * Prepare legal right token for external processing
   * @param {String} type - Right type (from RightTypes)
   * @param {String} issuerDID - Issuer DID
   * @param {String} subjectDID - Subject DID  
   * @param {Object} claim - Legal claim object
   * @param {PrivateKey} issuerPrivateKey - Issuer's private key
   * @param {Object} options - Additional options
   * @returns {Object} Prepared legal right token data
   */
  prepareRightToken: function(type, issuerDID, subjectDID, claim, issuerPrivateKey, options) {
    options = options || {}
    
    $.checkArgument(typeof type === 'string', 'Right type must be string')
    $.checkArgument(typeof issuerDID === 'string', 'Issuer DID must be string')
    $.checkArgument(typeof subjectDID === 'string', 'Subject DID must be string')
    $.checkArgument(claim && typeof claim === 'object', 'Claim must be object')
    $.checkArgument(issuerPrivateKey instanceof PrivateKey, 'Invalid issuer private key')
    
    // Validate right type
    var validTypes = Object.values(RightTypes)
    $.checkArgument(validTypes.includes(type), 'Invalid right type: ' + type)
    
    try {
      var rightToken = {
        '@context': [
          'https://www.w3.org/2018/credentials/v1',
          'https://smartledger.technology/contexts/ltp/v1'
        ],
        id: 'urn:uuid:' + this._generateUUID(),
        type: ['VerifiableCredential', 'LegalRightToken', type],
        issuer: issuerDID,
        issuanceDate: new Date().toISOString(),
        credentialSubject: {
          id: subjectDID,
          rightType: type,
          claim: claim,
          jurisdiction: options.jurisdiction || 'US',
          purpose: options.purpose || 'legal_right',
          validFrom: options.validFrom || new Date().toISOString(),
          validUntil: options.validUntil || null,
          transferable: options.transferable !== false,
          revocable: options.revocable !== false
        }
      }
      
      // Add metadata
      if (options.metadata) {
        rightToken.credentialSubject.metadata = options.metadata
      }
      
      // Sign the token
      var signedToken = this._signToken(rightToken, issuerPrivateKey)
      
      return {
        success: true,
        rightToken: signedToken,
        tokenHash: signedToken.tokenHash,
        metadata: {
          type: type,
          issuer: issuerDID,
          subject: subjectDID,
          transferable: rightToken.credentialSubject.transferable,
          revocable: rightToken.credentialSubject.revocable,
          jurisdiction: rightToken.credentialSubject.jurisdiction
        },
        externalOperations: {
          storeToken: {
            endpoint: 'POST /rights/tokens',
            data: {
              token: signedToken,
              metadata: {
                type: type,
                issuer: issuerDID,
                subject: subjectDID,
                transferable: rightToken.credentialSubject.transferable,
                revocable: rightToken.credentialSubject.revocable,
                jurisdiction: rightToken.credentialSubject.jurisdiction
              }
            }
          },
          indexToken: {
            endpoint: 'POST /rights/index',
            data: {
              tokenId: signedToken.id,
              tokenHash: signedToken.tokenHash,
              type: type,
              issuer: issuerDID,
              subject: subjectDID,
              issuedAt: signedToken.issuanceDate
            }
          },
          notifyParties: {
            endpoint: 'POST /notifications/right-issued',
            data: {
              tokenId: signedToken.id,
              issuer: issuerDID,
              subject: subjectDID,
              rightType: type
            }
          }
        }
      }
      
    } catch (error) {
      return {
        success: false,
        error: error.message
      }
    }
  },
  
  /**
   * Prepare right token verification for external processing
   * @param {Object} token - Right token to verify
   * @param {Object} options - Verification options
   * @returns {Object} Prepared verification data
   */
  prepareRightTokenVerification: function(token, options) {
    options = options || {}
    
    try {
      var errors = []
      var warnings = []
      
      // Basic structure validation
      this._validateTokenStructure(token, errors)
      
      // Signature verification
      this._verifyTokenSignature(token, errors)
      
      // Temporal validation
      this._validateTokenTemporal(token, errors, warnings)
      
      // Type validation
      this._validateRightType(token, errors)
      
      // Jurisdiction validation
      if (options.requireJurisdiction) {
        this._validateJurisdiction(token, options.allowedJurisdictions, errors)
      }
      
      var verification = {
        valid: errors.length === 0,
        errors: errors,
        warnings: warnings,
        issuerDID: token.issuer,
        subjectDID: token.credentialSubject ? token.credentialSubject.id : null,
        rightType: token.credentialSubject ? token.credentialSubject.rightType : null,
        transferable: token.credentialSubject ? token.credentialSubject.transferable : null,
        revocable: token.credentialSubject ? token.credentialSubject.revocable : null,
        verifiedAt: new Date().toISOString()
      }
      
      return {
        success: true,
        verification: verification,
        externalOperations: {
          recordVerification: {
            endpoint: 'POST /rights/verification-record',
            data: {
              tokenId: token.id,
              result: verification.valid,
              errors: errors,
              warnings: warnings,
              verifiedAt: verification.verifiedAt
            }
          },
          auditVerification: {
            endpoint: 'POST /audit/right-verification',
            data: {
              tokenId: token.id,
              rightType: verification.rightType,
              issuer: verification.issuerDID,
              subject: verification.subjectDID,
              result: verification.valid,
              verifiedAt: verification.verifiedAt
            }
          },
          updateTokenStatus: verification.valid ? {
            endpoint: 'PUT /rights/tokens/' + token.id + '/status',
            data: {
              status: 'VERIFIED',
              verifiedAt: verification.verifiedAt
            }
          } : null
        }
      }
      
    } catch (error) {
      return {
        success: false,
        error: 'Verification preparation failed: ' + error.message
      }
    }
  },
  
  /**
   * Prepare right token transfer for external processing
   * @param {Object} token - Original right token
   * @param {String} newOwnerDID - New owner DID
   * @param {PrivateKey} currentOwnerKey - Current owner's private key
   * @param {Object} options - Transfer options
   * @returns {Object} Prepared transfer data
   */
  prepareRightTokenTransfer: function(token, newOwnerDID, currentOwnerKey, options) {
    options = options || {}
    
    $.checkArgument(token && typeof token === 'object', 'Invalid token')
    $.checkArgument(typeof newOwnerDID === 'string', 'New owner DID must be string')
    $.checkArgument(currentOwnerKey instanceof PrivateKey, 'Invalid current owner key')
    
    try {
      // Verify current token
      var verification = this.prepareRightTokenVerification(token, {})
      if (!verification.success || !verification.verification.valid) {
        return {
          success: false,
          error: 'Cannot transfer invalid token: ' + verification.verification.errors.join(', ')
        }
      }
      
      // Check transferability
      if (!token.credentialSubject.transferable) {
        return {
          success: false,
          error: 'Token is not transferable'
        }
      }
      
      // Create transfer record
      var transfer = {
        '@context': [
          'https://www.w3.org/2018/credentials/v1',
          'https://smartledger.technology/contexts/ltp/v1'
        ],
        id: 'urn:uuid:' + this._generateUUID(),
        type: ['VerifiableCredential', 'LegalRightTransfer'],
        issuer: token.credentialSubject.id, // Current owner
        issuanceDate: new Date().toISOString(),
        credentialSubject: {
          id: newOwnerDID,
          originalToken: token.id,
          transferFrom: token.credentialSubject.id,
          transferTo: newOwnerDID,
          transferDate: new Date().toISOString(),
          transferReason: options.reason || 'ownership_transfer',
          consideration: options.consideration || null
        }
      }
      
      // Sign transfer with current owner key
      var signedTransfer = this._signToken(transfer, currentOwnerKey)
      
      // Create new token for new owner
      var newToken = JSON.parse(JSON.stringify(token))
      newToken.id = 'urn:uuid:' + this._generateUUID()
      newToken.issuanceDate = new Date().toISOString()
      newToken.credentialSubject.id = newOwnerDID
      newToken.credentialSubject.transferHistory = newToken.credentialSubject.transferHistory || []
      newToken.credentialSubject.transferHistory.push({
        transferId: signedTransfer.id,
        transferDate: signedTransfer.issuanceDate,
        from: token.credentialSubject.id,
        to: newOwnerDID
      })
      
      // Re-sign with current owner key (transfer authority)
      delete newToken.proof
      var newSignedToken = this._signToken(newToken, currentOwnerKey)
      
      return {
        success: true,
        newToken: newSignedToken,
        transferProof: signedTransfer,
        transferId: signedTransfer.id,
        externalOperations: {
          recordTransfer: {
            endpoint: 'POST /rights/transfers',
            data: {
              originalTokenId: token.id,
              newTokenId: newSignedToken.id,
              transferProof: signedTransfer,
              fromOwner: token.credentialSubject.id,
              toOwner: newOwnerDID,
              transferDate: signedTransfer.issuanceDate
            }
          },
          updateOwnership: {
            endpoint: 'PUT /rights/tokens/' + token.id + '/ownership',
            data: {
              newOwner: newOwnerDID,
              transferId: signedTransfer.id,
              transferDate: signedTransfer.issuanceDate,
              previousOwner: token.credentialSubject.id
            }
          },
          notifyParties: {
            endpoint: 'POST /notifications/right-transferred',
            data: {
              originalTokenId: token.id,
              newTokenId: newSignedToken.id,
              fromOwner: token.credentialSubject.id,
              toOwner: newOwnerDID,
              rightType: token.credentialSubject.rightType
            }
          },
          auditTransfer: {
            endpoint: 'POST /audit/right-transfer',
            data: {
              originalTokenId: token.id,
              newTokenId: newSignedToken.id,
              transferId: signedTransfer.id,
              fromOwner: token.credentialSubject.id,
              toOwner: newOwnerDID,
              transferredAt: signedTransfer.issuanceDate
            }
          }
        }
      }
      
    } catch (error) {
      return {
        success: false,
        error: error.message
      }
    }
  },
  
  /**
   * Prepare obligation token for external processing
   * @param {Object} rightToken - Original right token
   * @param {String} obligorDID - Who has the obligation
   * @param {Object} obligation - Obligation details
   * @param {PrivateKey} issuerKey - Issuer private key
   * @returns {Object} Prepared obligation token data
   */
  prepareObligationToken: function(rightToken, obligorDID, obligation, issuerKey) {
    $.checkArgument(rightToken && typeof rightToken === 'object', 'Invalid right token')
    $.checkArgument(typeof obligorDID === 'string', 'Obligor DID must be string')
    $.checkArgument(obligation && typeof obligation === 'object', 'Obligation must be object')
    $.checkArgument(issuerKey instanceof PrivateKey, 'Invalid issuer key')
    
    try {
      var obligationToken = {
        '@context': [
          'https://www.w3.org/2018/credentials/v1',
          'https://smartledger.technology/contexts/ltp/v1'
        ],
        id: 'urn:uuid:' + this._generateUUID(),
        type: ['VerifiableCredential', 'LegalObligationToken'],
        issuer: rightToken.issuer,
        issuanceDate: new Date().toISOString(),
        credentialSubject: {
          id: obligorDID,
          obligationType: 'correlative_obligation',
          correlativeRight: rightToken.id,
          rightHolder: rightToken.credentialSubject.id,
          obligation: obligation,
          jurisdiction: rightToken.credentialSubject.jurisdiction,
          purpose: rightToken.credentialSubject.purpose
        }
      }
      
      var signedObligation = this._signToken(obligationToken, issuerKey)
      
      return {
        success: true,
        obligationToken: signedObligation,
        correlativeRight: rightToken.id,
        externalOperations: {
          storeObligation: {
            endpoint: 'POST /obligations/tokens',
            data: {
              obligationToken: signedObligation,
              correlativeRightId: rightToken.id,
              obligor: obligorDID,
              rightHolder: rightToken.credentialSubject.id
            }
          },
          linkToRight: {
            endpoint: 'POST /rights/tokens/' + rightToken.id + '/obligations',
            data: {
              obligationId: signedObligation.id,
              obligor: obligorDID,
              obligationType: 'correlative_obligation'
            }
          },
          notifyObligor: {
            endpoint: 'POST /notifications/obligation-created',
            data: {
              obligationId: signedObligation.id,
              obligor: obligorDID,
              rightHolder: rightToken.credentialSubject.id,
              correlativeRight: rightToken.id
            }
          }
        }
      }
      
    } catch (error) {
      return {
        success: false,
        error: error.message
      }
    }
  },
  
  /**
   * Prepare right type validation for external systems
   * @param {String} type - Right type to validate
   * @returns {Object} Validation data
   */
  prepareRightTypeValidation: function(type) {
    $.checkArgument(typeof type === 'string', 'Right type must be string')
    
    var validTypes = Object.values(RightTypes)
    var isValid = validTypes.includes(type)
    
    return {
      success: true,
      validation: {
        type: type,
        valid: isValid,
        availableTypes: validTypes,
        category: this._categorizeRightType(type),
        description: this._getRightTypeDescription(type)
      },
      externalOperations: {
        validateType: {
          endpoint: 'POST /rights/validate-type',
          data: {
            type: type,
            valid: isValid
          }
        }
      }
    }
  },
  
  /**
   * Categorize right type
   * @private
   */
  _categorizeRightType: function(type) {
    var categories = {
      'PropertyTitle': 'PROPERTY_RIGHT',
      'VehicleTitle': 'PROPERTY_RIGHT',
      'IntellectualProperty': 'IP_RIGHT',
      'MusicLicense': 'IP_RIGHT',
      'SoftwareLicense': 'IP_RIGHT',
      'FinancialInstrument': 'FINANCIAL_RIGHT',
      'PromissoryNote': 'FINANCIAL_RIGHT',
      'Bond': 'FINANCIAL_RIGHT',
      'EquityShare': 'FINANCIAL_RIGHT',
      'ProfessionalLicense': 'LICENSE_RIGHT',
      'RegulatoryPermit': 'LICENSE_RIGHT',
      'AccessRight': 'ACCESS_RIGHT',
      'VotingRight': 'GOVERNANCE_RIGHT',
      'RoyaltyRight': 'IP_RIGHT',
      'UsageRight': 'ACCESS_RIGHT'
    }
    
    return categories[type] || 'UNKNOWN'
  },
  
  /**
   * Get right type description
   * @private
   */
  _getRightTypeDescription: function(type) {
    var descriptions = {
      'PropertyTitle': 'Legal ownership of real estate property',
      'VehicleTitle': 'Legal ownership of motor vehicle',
      'IntellectualProperty': 'Rights to intellectual property assets',
      'MusicLicense': 'License for music performance and usage',
      'SoftwareLicense': 'License for software usage and distribution',
      'FinancialInstrument': 'Rights related to financial instruments',
      'PromissoryNote': 'Promise to pay a specified amount',
      'Bond': 'Debt security representing loan',
      'EquityShare': 'Ownership stake in company',
      'ProfessionalLicense': 'License for professional practice',
      'RegulatoryPermit': 'Permit for regulated activities',
      'AccessRight': 'Right to access resources or locations',
      'VotingRight': 'Right to participate in governance',
      'RoyaltyRight': 'Right to receive royalty payments',
      'UsageRight': 'Right to use specific assets or services'
    }
    
    return descriptions[type] || 'Unknown right type'
  },
  
  /**
   * Get available right types
   * @returns {Object} Right types
   */
  getRightTypes: function() {
    return RightTypes
  },
  
  /**
   * Sign a token with private key
   * @private
   */
  _signToken: function(token, privateKey) {
    // Create canonical hash
    var canonicalToken = this._canonicalizeToken(token)
    var tokenHash = Hash.sha256(Buffer.from(canonicalToken))
    
    // Sign with ECDSA
    var ecdsa = new ECDSA()
    ecdsa.hashbuf = tokenHash
    ecdsa.privkey = privateKey
    ecdsa.pubkey = privateKey.toPublicKey()
    
    ecdsa.sign()
    var signature = ecdsa.sig
    
    // Create proof
    var proof = {
      type: 'EcdsaSecp256k1Signature2019',
      created: new Date().toISOString(),
      verificationMethod: 'did:smartledger:' + privateKey.toPublicKey().toString() + '#keys-1',
      proofPurpose: 'assertionMethod',
      jws: this._createJWS(tokenHash, signature)
    }
    
    // Add proof to token
    var signedToken = JSON.parse(JSON.stringify(token))
    signedToken.proof = proof
    signedToken.tokenHash = tokenHash.toString('hex')
    
    return signedToken
  },
  
  /**
   * Sign a token with private key
   * @private
   */
  _signToken: function(token, privateKey) {
    var header = {
      alg: 'ES256K',
      typ: 'JWT'
    }
    
    var headerB64 = Buffer.from(JSON.stringify(header)).toString('base64url')
    var payloadB64 = hash.toString('base64url')
    var signatureB64 = signature.toDER().toString('base64url')
    
    return headerB64 + '..' + signatureB64
  },
  
  /**
   * Canonicalize token for hashing
   * @private
   */
  _canonicalizeToken: function(token) {
    // Remove proof and hash fields
    var canonical = JSON.parse(JSON.stringify(token))
    delete canonical.proof
    delete canonical.tokenHash
    
    // Sort keys recursively
    return JSON.stringify(this._sortObjectKeys(canonical))
  },
  
  /**
   * Sort object keys recursively
   * @private
   */
  _sortObjectKeys: function(obj) {
    if (Array.isArray(obj)) {
      return obj.map(this._sortObjectKeys.bind(this))
    } else if (obj !== null && typeof obj === 'object') {
      var sorted = {}
      Object.keys(obj).sort().forEach(function(key) {
        sorted[key] = this._sortObjectKeys(obj[key])
      }.bind(this))
      return sorted
    }
    return obj
  },
  
  /**
   * Validate token structure
   * @private
   */
  _validateTokenStructure: function(token, errors) {
    if (!token['@context']) {
      errors.push('Missing @context')
    }
    
    if (!token.id) {
      errors.push('Missing id')
    }
    
    if (!token.type || !Array.isArray(token.type)) {
      errors.push('Missing or invalid type')
    }
    
    if (!token.issuer) {
      errors.push('Missing issuer')
    }
    
    if (!token.issuanceDate) {
      errors.push('Missing issuanceDate')
    }
    
    if (!token.credentialSubject) {
      errors.push('Missing credentialSubject')
    }
    
    if (!token.proof) {
      errors.push('Missing proof')
    }
  },
  
  /**
   * Verify token signature
   * @private
   */
  _verifyTokenSignature: function(token, errors) {
    try {
      if (!token.proof || !token.proof.jws) {
        errors.push('Missing signature proof')
        return
      }
      
      // Recreate canonical hash
      var canonicalToken = this._canonicalizeToken(token)
      var expectedHash = Hash.sha256(Buffer.from(canonicalToken))
      
      // Compare with stored hash if available
      if (token.tokenHash && token.tokenHash !== expectedHash.toString('hex')) {
        errors.push('Token hash mismatch')
        return
      }
      
      // TODO: Verify JWS signature with issuer's public key
      // This would require DID resolution to get the public key
      
    } catch (error) {
      errors.push('Signature verification failed: ' + error.message)
    }
  },
  
  /**
   * Validate temporal aspects
   * @private
   */
  _validateTokenTemporal: function(token, errors, warnings) {
    var now = new Date()
    var issuanceDate = new Date(token.issuanceDate)
    
    if (issuanceDate > now) {
      errors.push('Token issued in the future')
    }
    
    if (token.credentialSubject.validFrom) {
      var validFrom = new Date(token.credentialSubject.validFrom)
      if (now < validFrom) {
        warnings.push('Token not yet valid')
      }
    }
    
    if (token.credentialSubject.validUntil) {
      var validUntil = new Date(token.credentialSubject.validUntil)
      if (now > validUntil) {
        errors.push('Token expired')
      }
    }
  },
  
  /**
   * Validate right type
   * @private
   */
  _validateRightType: function(token, errors) {
    if (!token.credentialSubject.rightType) {
      errors.push('Missing rightType')
      return
    }
    
    var validTypes = Object.values(RightTypes)
    if (!validTypes.includes(token.credentialSubject.rightType)) {
      errors.push('Invalid right type: ' + token.credentialSubject.rightType)
    }
  },
  
  /**
   * Validate jurisdiction
   * @private
   */
  _validateJurisdiction: function(token, allowedJurisdictions, errors) {
    if (!token.credentialSubject.jurisdiction) {
      errors.push('Missing jurisdiction')
      return
    }
    
    if (allowedJurisdictions && Array.isArray(allowedJurisdictions)) {
      if (!allowedJurisdictions.includes(token.credentialSubject.jurisdiction)) {
        errors.push('Jurisdiction not allowed: ' + token.credentialSubject.jurisdiction)
      }
    }
  },
  
  /**
   * Generate UUID
   * @private
   */
  _generateUUID: function() {
    return 'xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx'.replace(/[xy]/g, function(c) {
      var r = Math.random() * 16 | 0
      var v = c === 'x' ? r : (r & 0x3 | 0x8)
      return v.toString(16)
    })
  }
}

// Export both the object and static methods for compatibility
RightToken.RightTypes = RightTypes
module.exports = RightToken