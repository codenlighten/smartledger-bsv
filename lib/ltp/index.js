'use strict'

var LTPRight = require('./right')
var LTPClaim = require('./claim')
var LTPAnchor = require('./anchor')
var LTPProof = require('./proof')
var LTPRegistry = require('./registry')
var LTPObligation = require('./obligation')

var bsv = require('../../')
var PrivateKey = bsv.PrivateKey
var $ = bsv.util.preconditions

/**
 * Legal Token Protocol (LTP) - Main Interface
 * 
 * The Legal Token Protocol provides a framework for creating, managing,
 * and validating legally interpretable digital tokens that represent
 * rights, obligations, and attestations with cryptographic proof and
 * blockchain anchoring.
 * 
 * This interface combines all LTP components to provide a unified API
 * for legal token operations with compliance and audit capabilities.
 */

var LTP = function(config) {
  if (!(this instanceof LTP)) {
    return new LTP(config)
  }
  
  this.config = config || {}
  this.registry = null
  
  // Initialize registry if specified
  if (this.config.registry) {
    this.registry = LTPRegistry.createRegistry(this.config.registry)
  }
  
  return this
}

/**
 * Create legal right token
 * @param {Object} rightData - Right token data
 * @param {PrivateKey} privateKey - Signing private key
 * @param {Object} options - Creation options
 * @returns {Object} Created right token
 */
LTP.prototype.createRightToken = function(rightData, privateKey, options) {
  $.checkArgument(rightData && typeof rightData === 'object', 'Invalid right data')
  $.checkArgument(privateKey instanceof PrivateKey, 'Invalid private key')
  
  options = options || {}
  
  try {
    // Create the right token
    var token = LTPRight.create(rightData.type, rightData.owner, rightData.owner, rightData, privateKey, options)
    
    if (!token) {
      return {
        success: false,
        error: 'Failed to create token'
      }
    }
    
    // Add cryptographic proof
    if (options.addProof !== false) {
      var proofResult = LTPProof.createSignature(token, privateKey, {
        purpose: 'assertionMethod'
      })
      
      if (proofResult.success) {
        token.proof = proofResult.proof
        token.tokenHash = proofResult.tokenHash
      }
    }
    
    // Anchor to blockchain if requested
    if (options.anchor) {
      var anchorResult = LTPAnchor.anchorToken(token, options.anchor)
      if (anchorResult.success) {
        token.anchorTx = anchorResult.txid
        token.anchorBlock = anchorResult.blockHeight
      }
    }
    
    // Register token if registry is available
    if (this.registry && options.register !== false) {
      var regResult = LTPRegistry.registerToken(this.registry, token, {
        registeredBy: options.registeredBy || 'SYSTEM'
      })
      
      if (regResult.success) {
        token.registrationId = regResult.registrationId
        token.registrationStatus = regResult.status
      }
    }
    
    return {
      success: true,
      token: token,
      type: 'LegalRightToken'
    }
    
  } catch (error) {
    return {
      success: false,
      error: error.message
    }
  }
}

/**
 * Validate legal claim
 * @param {Object} claimData - Claim data to validate
 * @param {String} schemaType - Schema type for validation
 * @returns {Object} Validation result
 */
LTP.prototype.validateClaim = function(claimData, schemaType) {
  return LTPClaim.validate(claimData, schemaType)
}

/**
 * Create selective disclosure proof
 * @param {Object} token - Token for disclosure
 * @param {Array} revealedFields - Fields to reveal
 * @param {String} nonce - Proof nonce
 * @returns {Object} Selective disclosure proof
 */
LTP.prototype.createSelectiveDisclosure = function(token, revealedFields, nonce) {
  return LTPProof.createSelectiveDisclosure(token, revealedFields, nonce)
}

/**
 * Verify token signature
 * @param {Object} token - Token to verify
 * @param {String} publicKey - Signer's public key
 * @returns {Object} Verification result
 */
LTP.prototype.verifyToken = function(token, publicKey) {
  if (!token || !token.proof) {
    return {
      valid: false,
      error: 'No proof found in token'
    }
  }
  
  return LTPProof.verifySignature(token, publicKey)
}

/**
 * Transfer right token
 * @param {Object} token - Token to transfer
 * @param {String} newOwner - New owner identifier
 * @param {PrivateKey} ownerKey - Current owner's private key
 * @param {Object} options - Transfer options
 * @returns {Object} Transfer result
 */
LTP.prototype.transferRight = function(token, newOwner, ownerKey, options) {
  $.checkArgument(token && typeof token === 'object', 'Invalid token')
  $.checkArgument(typeof newOwner === 'string', 'New owner must be string')
  $.checkArgument(ownerKey instanceof PrivateKey, 'Invalid owner key')
  
  options = options || {}
  
  try {
    // Verify current ownership
    var verification = this.verifyToken(token, ownerKey.toPublicKey().toString())
    if (!verification.valid) {
      return {
        success: false,
        error: 'Invalid token or ownership proof'
      }
    }
    
    // Create transfer
    var transferResult = LTPRight.transfer(token, newOwner, ownerKey, options)
    
    var transferredToken = transferResult.newToken
    var transferProof = transferResult.transferProof
    
    // Add new proof with new owner
    var proofResult = LTPProof.createSignature(transferredToken, ownerKey, {
      purpose: 'authentication'
    })
    
    if (proofResult.success) {
      transferredToken.proof = proofResult.proof
      transferredToken.tokenHash = proofResult.tokenHash
    }
    
    // Anchor transfer if requested
    if (options.anchor) {
      var anchorResult = LTPAnchor.anchorToken(transferredToken, options.anchor)
      if (anchorResult.success) {
        transferredToken.transferAnchorTx = anchorResult.txid
      }
    }
    
    // Update registry if available
    if (this.registry) {
      // Register the new token state
      var regResult = LTPRegistry.registerToken(this.registry, transferredToken, {
        registeredBy: options.registeredBy || newOwner,
        metadata: {
          transferFrom: token.owner,
          transferTo: newOwner,
          originalTokenId: token.id
        }
      })
      
      if (regResult.success) {
        transferredToken.registrationId = regResult.registrationId
      }
    }
    
    return {
      success: true,
      token: transferredToken,
      transferId: transferProof.id,
      transferredAt: transferProof.issuanceDate,
      transferProof: transferProof
    }
    
  } catch (error) {
    return {
      success: false,
      error: error.message
    }
  }
}

/**
 * Create obligation from right
 * @param {Object} rightToken - Right token
 * @param {Object} obligationData - Obligation details
 * @param {PrivateKey} privateKey - Signing key
 * @returns {Object} Created obligation
 */
LTP.prototype.createObligation = function(rightToken, obligationData, privateKey) {
  $.checkArgument(rightToken && typeof rightToken === 'object', 'Invalid right token')
  $.checkArgument(obligationData && typeof obligationData === 'object', 'Invalid obligation data')
  $.checkArgument(privateKey instanceof PrivateKey, 'Invalid private key')
  
  try {
    // Create obligation token
    var obligation = LTPRight.createObligation(rightToken, obligationData.obligor, obligationData, privateKey)
    
    if (!obligation) {
      return {
        success: false,
        error: 'Failed to create obligation'
      }
    }
    
    // Add proof
    var proofResult = LTPProof.createSignature(obligation, privateKey, {
      purpose: 'assertionMethod'
    })
    
    if (proofResult.success) {
      obligation.proof = proofResult.proof
      obligation.tokenHash = proofResult.tokenHash
    }
    
    return {
      success: true,
      obligation: obligation,
      rightTokenId: rightToken.id
    }
    
  } catch (error) {
    return {
      success: false,
      error: error.message
    }
  }
}

/**
 * Revoke token
 * @param {String} tokenId - Token ID to revoke
 * @param {Object} revocationData - Revocation details
 * @param {String} authority - Revoking authority
 * @returns {Object} Revocation result
 */
LTP.prototype.revokeToken = function(tokenId, revocationData, authority) {
  $.checkArgument(typeof tokenId === 'string', 'Token ID must be string')
  $.checkArgument(revocationData && typeof revocationData === 'object', 'Invalid revocation data')
  $.checkArgument(typeof authority === 'string', 'Authority must be string')
  
  if (!this.registry) {
    return {
      success: false,
      error: 'No registry available for revocation'
    }
  }
  
  return LTPRegistry.revokeToken(this.registry, tokenId, {
    reason: revocationData.reason,
    revokedBy: authority,
    legalBasis: revocationData.legalBasis,
    evidence: revocationData.evidence
  })
}

/**
 * Check token status
 * @param {String} tokenId - Token ID to check
 * @returns {Object} Token status
 */
LTP.prototype.checkTokenStatus = function(tokenId) {
  $.checkArgument(typeof tokenId === 'string', 'Token ID must be string')
  
  if (!this.registry) {
    return {
      found: false,
      error: 'No registry available'
    }
  }
  
  return LTPRegistry.checkTokenStatus(this.registry, tokenId)
}

/**
 * Search tokens
 * @param {Object} criteria - Search criteria
 * @returns {Object} Search results
 */
LTP.prototype.searchTokens = function(criteria) {
  if (!this.registry) {
    return {
      success: false,
      error: 'No registry available'
    }
  }
  
  return LTPRegistry.searchTokens(this.registry, criteria)
}

/**
 * Get registry statistics
 * @returns {Object} Registry statistics
 */
LTP.prototype.getRegistryStats = function() {
  if (!this.registry) {
    return {
      error: 'No registry available'
    }
  }
  
  return LTPRegistry.getStatistics(this.registry)
}

/**
 * Create legal validity proof
 * @param {Object} token - Token to prove
 * @param {Object} jurisdiction - Jurisdiction rules
 * @param {String} nonce - Proof nonce
 * @returns {Object} Legal validity proof
 */
LTP.prototype.createLegalValidityProof = function(token, jurisdiction, nonce) {
  return LTPProof.createLegalValidityProof(token, jurisdiction, nonce)
}

/**
 * Anchor multiple tokens in batch
 * @param {Array} tokens - Tokens to anchor
 * @param {Object} options - Anchoring options
 * @returns {Object} Batch anchor result
 */
LTP.prototype.anchorTokenBatch = function(tokens, options) {
  return LTPAnchor.anchorBatch(tokens, options)
}

/**
 * Verify blockchain anchor
 * @param {Object} token - Token with anchor
 * @param {String} txid - Transaction ID
 * @returns {Object} Verification result
 */
LTP.prototype.verifyAnchor = function(token, txid) {
  return LTPAnchor.verifyAnchor(token, txid)
}

/**
 * Get supported right types
 * @returns {Object} Right types
 */
LTP.prototype.getRightTypes = function() {
  return LTPRight.getRightTypes()
}

/**
 * Get supported claim schemas
 * @returns {Object} Claim schemas
 */
LTP.prototype.getClaimSchemas = function() {
  return LTPClaim.getSchemas()
}

/**
 * Create registry
 * @param {Object} config - Registry configuration
 * @returns {Object} Created registry
 */
LTP.prototype.createRegistry = function(config) {
  this.registry = LTPRegistry.createRegistry(config)
  return this.registry
}

/**
 * Set registry
 * @param {Object} registry - Registry instance
 */
LTP.prototype.setRegistry = function(registry) {
  $.checkArgument(registry && typeof registry === 'object', 'Invalid registry')
  this.registry = registry
}

// Static methods for direct access without instantiation

/**
 * Create LTP instance
 * @param {Object} config - Configuration
 * @returns {LTP} LTP instance
 */
LTP.create = function(config) {
  return new LTP(config)
}

/**
 * Create right token (static)
 */
LTP.createRightToken = function(rightData, privateKey, options) {
  var ltp = new LTP()
  return ltp.createRightToken(rightData, privateKey, options)
}

/**
 * Validate claim (static)
 */
LTP.validateClaim = function(claimData, schemaType) {
  return LTPClaim.validate(claimData, schemaType)
}

/**
 * Verify token (static)
 */
LTP.verifyToken = function(token, publicKey) {
  var ltp = new LTP()
  return ltp.verifyToken(token, publicKey)
}

/**
 * Create registry (static)
 */
LTP.createRegistry = function(config) {
  return LTPRegistry.createRegistry(config)
}

// Export component modules for advanced usage
LTP.Right = LTPRight
LTP.Claim = LTPClaim
LTP.Anchor = LTPAnchor
LTP.Proof = LTPProof
LTP.Registry = LTPRegistry
LTP.Obligation = LTPObligation

module.exports = LTP