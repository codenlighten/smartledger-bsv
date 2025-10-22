'use strict'

var bsv = require('../../')
var Hash = bsv.crypto.Hash
var $ = bsv.util.preconditions

/**
 * Legal Token Protocol - Blockchain Anchoring Primitives
 * 
 * Provides primitives for preparing legal tokens for blockchain anchoring
 * without directly publishing to blockchain. External services handle
 * the actual transaction broadcasting and confirmation.
 */

var LTPAnchor = {
  
  /**
   * Prepare token commitment for blockchain anchoring
   * @param {Object} token - Token to prepare for anchoring
   * @param {Object} options - Anchoring options
   * @returns {Object} Prepared anchor data
   */
  prepareTokenCommitment: function(token, options) {
    options = options || {}
    
    $.checkArgument(token && typeof token === 'object', 'Invalid token')
    
    try {
      // Create commitment hash
      var commitment = this._createCommitment(token, options)
      
      // Prepare OP_RETURN data
      var opReturnData = this._formatOpReturn(commitment, options)
      
      // Create transaction template
      var txTemplate = this._createTxTemplate(opReturnData, options)
      
      return {
        success: true,
        commitment: commitment,
        opReturnData: opReturnData,
        txTemplate: txTemplate,
        preparedAt: new Date().toISOString(),
        metadata: {
          tokenId: token.id,
          purpose: options.purpose || 'legal_token_anchor',
          version: 'LTP.v1'
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
   * Prepare batch of tokens for anchoring
   * @param {Array} tokens - Tokens to prepare for anchoring
   * @param {Object} options - Anchoring options
   * @returns {Object} Prepared batch anchor data
   */
  prepareBatchCommitment: function(tokens, options) {
    options = options || {}
    
    $.checkArgument(Array.isArray(tokens), 'Tokens must be array')
    
    try {
      // Create batch commitment
      var batchCommitment = this._createBatchCommitment(tokens, options)
      
      // Prepare OP_RETURN data for batch
      var opReturnData = this._formatOpReturn(batchCommitment, options)
      
      // Create transaction template
      var txTemplate = this._createTxTemplate(opReturnData, options)
      
      return {
        success: true,
        batchCommitment: batchCommitment,
        opReturnData: opReturnData,
        txTemplate: txTemplate,
        tokenCount: tokens.length,
        preparedAt: new Date().toISOString(),
        metadata: {
          purpose: options.purpose || 'legal_token_batch_anchor',
          version: 'LTP.v1'
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
   * Verify token anchor using external transaction data
   * @param {Object} token - Token to verify
   * @param {String} txid - Transaction ID from external anchor
   * @param {Object} txData - Transaction data from blockchain
   * @returns {Object} Verification result
   */
  verifyTokenAnchor: function(token, txid, txData) {
    $.checkArgument(token && typeof token === 'object', 'Invalid token')
    $.checkArgument(typeof txid === 'string', 'Transaction ID must be string')
    
    try {
      // Recreate expected commitment
      var expectedCommitment = this._createCommitment(token, {})
      
      // Extract OP_RETURN data from transaction
      var opReturnData = this._extractOpReturn(txData)
      
      if (!opReturnData) {
        return {
          valid: false,
          error: 'No OP_RETURN data found in transaction'
        }
      }
      
      // Verify commitment matches
      var commitmentValid = this._verifyCommitment(expectedCommitment, opReturnData)
      
      return {
        valid: commitmentValid,
        txid: txid,
        commitment: expectedCommitment,
        anchorData: opReturnData,
        verifiedAt: new Date().toISOString()
      }
      
    } catch (error) {
      return {
        valid: false,
        error: error.message
      }
    }
  },
  
  /**
   * Format revocation data for external registry
   * @param {String} tokenId - Token ID to revoke
   * @param {Object} revocationData - Revocation details
   * @returns {Object} Formatted revocation data
   */
  formatRevocation: function(tokenId, revocationData) {
    $.checkArgument(typeof tokenId === 'string', 'Token ID must be string')
    $.checkArgument(revocationData && typeof revocationData === 'object', 'Invalid revocation data')
    
    try {
      var revocation = {
        type: 'LTP_REVOCATION',
        tokenId: tokenId,
        reason: revocationData.reason || 'UNSPECIFIED',
        revokedBy: revocationData.revokedBy || 'UNKNOWN',
        revokedAt: new Date().toISOString(),
        effectiveDate: revocationData.effectiveDate || new Date().toISOString(),
        legalBasis: revocationData.legalBasis || null,
        evidence: revocationData.evidence || null
      }
      
      // Create revocation hash
      var revocationHash = Hash.sha256(Buffer.from(JSON.stringify(revocation))).toString('hex')
      
      return {
        success: true,
        revocation: revocation,
        revocationHash: revocationHash,
        opReturnData: this._formatOpReturn({ hash: revocationHash, type: 'REVOCATION' }, {})
      }
      
    } catch (error) {
      return {
        success: false,
        error: error.message
      }
    }
  },
  
  /**
   * Create commitment hash from token
   * @private
   */
  _createCommitment: function(token, options) {
    // Create canonical representation
    var canonical = this._canonicalizeToken(token)
    
    // Create commitment object
    var commitment = {
      type: 'LTP_TOKEN',
      tokenHash: Hash.sha256(Buffer.from(canonical)).toString('hex'),
      tokenId: token.id,
      timestamp: new Date().toISOString(),
      purpose: options.purpose || 'legal_token'
    }
    
    // Hash the commitment
    var commitmentHash = Hash.sha256(Buffer.from(JSON.stringify(commitment))).toString('hex')
    
    return {
      hash: commitmentHash,
      data: commitment,
      canonical: canonical
    }
  },
  
  /**
   * Create batch commitment from multiple tokens
   * @private
   */
  _createBatchCommitment: function(tokens, options) {
    var tokenHashes = []
    var tokenIds = []
    
    tokens.forEach(function(token) {
      var commitment = this._createCommitment(token, options)
      tokenHashes.push(commitment.hash)
      tokenIds.push(token.id)
    }.bind(this))
    
    // Create Merkle tree
    var merkleRoot = this._createMerkleRoot(tokenHashes)
    
    var batchCommitment = {
      type: 'LTP_BATCH',
      merkleRoot: merkleRoot,
      tokenCount: tokens.length,
      tokenIds: tokenIds,
      timestamp: new Date().toISOString(),
      purpose: options.purpose || 'batch_anchor'
    }
    
    var batchHash = Hash.sha256(Buffer.from(JSON.stringify(batchCommitment))).toString('hex')
    
    return {
      hash: batchHash,
      data: batchCommitment,
      merkleRoot: merkleRoot,
      tokenHashes: tokenHashes
    }
  },
  
  /**
   * Format OP_RETURN data
   * @private
   */
  _formatOpReturn: function(commitment, options) {
    var prefix = options.prefix || 'LTP.v1'
    var data = commitment.hash
    
    return {
      prefix: prefix,
      data: data,
      full: prefix + '.' + data,
      bytes: Buffer.from(prefix + '.' + data, 'utf8'),
      size: Buffer.from(prefix + '.' + data, 'utf8').length
    }
  },
  
  /**
   * Create transaction template
   * @private
   */
  _createTxTemplate: function(opReturnData, options) {
    try {
      // Create basic transaction structure
      var tx = {
        version: 1,
        inputs: [], // To be filled by implementing application
        outputs: [
          {
            satoshis: 0,
            script: 'OP_RETURN ' + opReturnData.data
          }
        ],
        locktime: 0
      }
      
      // Add fee output if specified
      if (options.feeOutput) {
        tx.outputs.push(options.feeOutput)
      }
      
      return {
        template: tx,
        opReturn: opReturnData,
        estimatedSize: this._estimateSize(tx),
        instructions: {
          step1: 'Add input UTXOs to cover fees',
          step2: 'Add change output if needed',
          step3: 'Sign transaction with appropriate keys',
          step4: 'Broadcast to BSV network'
        }
      }
      
    } catch (error) {
      throw new Error('Failed to create transaction template: ' + error.message)
    }
  },
  
  /**
   * Extract OP_RETURN data from transaction
   * @private
   */
  _extractOpReturn: function(txData) {
    try {
      if (!txData || !txData.outputs) {
        return null
      }
      
      for (var i = 0; i < txData.outputs.length; i++) {
        var output = txData.outputs[i]
        if (output.script && output.script.startsWith('OP_RETURN')) {
          var data = output.script.replace('OP_RETURN ', '')
          return {
            raw: data,
            decoded: Buffer.from(data, 'hex').toString('utf8')
          }
        }
      }
      
      return null
    } catch (error) {
      return null
    }
  },
  
  /**
   * Verify commitment matches OP_RETURN data
   * @private
   */
  _verifyCommitment: function(commitment, opReturnData) {
    try {
      if (!opReturnData || !opReturnData.decoded) {
        return false
      }
      
      // Check if our commitment hash appears in the OP_RETURN
      return opReturnData.decoded.includes(commitment.hash)
    } catch (error) {
      return false
    }
  },
  
  /**
   * Canonicalize token for hashing
   * @private
   */
  _canonicalizeToken: function(token) {
    // Remove dynamic fields
    var canonical = JSON.parse(JSON.stringify(token))
    delete canonical.proof
    delete canonical.tokenHash
    delete canonical.anchorTx
    delete canonical.anchorBlock
    
    // Sort keys recursively
    return JSON.stringify(this._sortObjectKeys(canonical))
  },
  
  /**
   * Create Merkle root from array of hashes
   * @private
   */
  _createMerkleRoot: function(hashes) {
    if (hashes.length === 0) {
      return null
    }
    
    if (hashes.length === 1) {
      return hashes[0]
    }
    
    var level = hashes.slice()
    
    while (level.length > 1) {
      var nextLevel = []
      
      for (var i = 0; i < level.length; i += 2) {
        var left = level[i]
        var right = level[i + 1] || left
        
        var combined = Buffer.concat([
          Buffer.from(left, 'hex'),
          Buffer.from(right, 'hex')
        ])
        
        var hash = Hash.sha256(combined).toString('hex')
        nextLevel.push(hash)
      }
      
      level = nextLevel
    }
    
    return level[0]
  },
  
  /**
   * Estimate transaction size
   * @private
   */
  _estimateSize: function(tx) {
    // Basic estimation - actual size depends on inputs
    var baseSize = 10 // version + locktime + input/output counts
    var outputSize = tx.outputs.length * 34 // approximate output size
    var estimatedInputSize = 148 // approximate input size with signature
    
    return {
      base: baseSize + outputSize,
      withOneInput: baseSize + outputSize + estimatedInputSize,
      bytesPerInput: estimatedInputSize
    }
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
  }
}

module.exports = LTPAnchor