'use strict'

/**
 * BSV Shamir Secret Sharing - Standalone Module
 * Secure secret distribution using Shamir's Secret Sharing algorithm
 * 
 * Usage:
 *   // Split a secret into shares
 *   var shares = bsvShamir.split('my secret', 3, 5) // 3-of-5 threshold
 *   
 *   // Reconstruct secret from shares
 *   var secret = bsvShamir.combine(shares.slice(0, 3))
 * 
 * Features:
 * - Cryptographically secure threshold secret sharing
 * - Support for any threshold (k) and total shares (n) where k <= n
 * - Handles arbitrary secret sizes through chunking
 * - Share verification and integrity checking
 * - Compatible with BSV cryptographic ecosystem
 */

// Initialize dependencies for browser compatibility
var deps = {}
try {
  deps.bnjs = require('bn.js')
  deps.Buffer = (typeof Buffer !== 'undefined') ? Buffer : null
} catch (e) {
  // Browser environment - dependencies should be available globally
  if (typeof window !== 'undefined') {
    deps.bnjs = window.BN || (window.bsv && window.bsv.deps && window.bsv.deps.bnjs)
    deps.Buffer = window.Buffer || (window.bsv && window.bsv.deps && window.bsv.deps.Buffer)
  }
}

// Ensure we have required dependencies
if (!deps.bnjs) {
  throw new Error('BN.js dependency not found. Please include bn.js or bsv.min.js')
}

if (!deps.Buffer) {
  // Provide minimal Buffer polyfill for basic operations
  deps.Buffer = {
    isBuffer: function(obj) { return obj && obj.constructor && obj.constructor.name === 'Buffer' },
    from: function(data, encoding) {
      if (typeof data === 'string') {
        if (encoding === 'hex') {
          return new Uint8Array(data.match(/.{2}/g).map(byte => parseInt(byte, 16)))
        }
        return new Uint8Array(Array.from(data).map(c => c.charCodeAt(0)))
      }
      return new Uint8Array(data)
    },
    concat: function(arrays) {
      var totalLength = arrays.reduce((sum, arr) => sum + arr.length, 0)
      var result = new Uint8Array(totalLength)
      var offset = 0
      for (var i = 0; i < arrays.length; i++) {
        result.set(arrays[i], offset)
        offset += arrays[i].length
      }
      return result
    }
  }
}

// Import the core Shamir implementation
var Shamir = require('./lib/crypto/shamir')

// Create standalone module interface
var bsvShamir = {
  /**
   * Split a secret into threshold shares
   * @param {String|Buffer} secret - Secret to split
   * @param {Number} threshold - Minimum shares needed to reconstruct
   * @param {Number} shares - Total shares to generate
   * @returns {Array} Array of share objects
   */
  split: function(secret, threshold, shares) {
    return Shamir.split(secret, threshold, shares)
  },

  /**
   * Combine shares to reconstruct secret
   * @param {Array} shares - Array of share objects
   * @returns {Buffer} Reconstructed secret
   */
  combine: function(shares) {
    return Shamir.combine(shares)
  },

  /**
   * Verify if a share is valid
   * @param {Object} share - Share to verify
   * @returns {Boolean} True if valid
   */
  verifyShare: function(share) {
    return Shamir.verifyShare(share)
  },

  /**
   * Generate test vectors for validation
   * @returns {Object} Test data with secret, shares, and reconstruction
   */
  generateTestVectors: function() {
    return Shamir.generateTestVectors()
  },

  /**
   * Create a simple demo showing basic usage
   * @returns {Object} Demo results
   */
  demo: function() {
    console.log('=== BSV Shamir Secret Sharing Demo ===')
    
    var originalSecret = 'Bitcoin SV is the original Bitcoin!'
    var threshold = 3
    var totalShares = 5
    
    console.log('Original secret:', originalSecret)
    console.log('Creating', totalShares, 'shares with threshold of', threshold)
    
    // Split the secret
    var shares = bsvShamir.split(originalSecret, threshold, totalShares)
    console.log('Generated', shares.length, 'shares')
    
    // Show first share structure (truncated for display)
    var displayShare = JSON.parse(JSON.stringify(shares[0]))
    if (displayShare.chunks && displayShare.chunks.length > 0) {
      displayShare.chunks = displayShare.chunks.slice(0, 1) // Show only first chunk
      displayShare.chunks[0].y = displayShare.chunks[0].y.substring(0, 20) + '...'
    }
    console.log('Sample share structure:', displayShare)
    
    // Reconstruct with minimum shares
    var minShares = shares.slice(0, threshold)
    var reconstructed = bsvShamir.combine(minShares)
    var reconstructedSecret = reconstructed.toString('utf8')
    
    console.log('Reconstructed secret:', reconstructedSecret)
    console.log('Reconstruction successful:', originalSecret === reconstructedSecret)
    
    return {
      original: originalSecret,
      threshold: threshold,
      totalShares: totalShares,
      shares: shares,
      reconstructed: reconstructedSecret,
      success: originalSecret === reconstructedSecret
    }
  },

  // Expose version and metadata
  version: '3.2.2',
  algorithm: 'Shamir Secret Sharing',
  description: 'Threshold cryptography for secure secret distribution'
}

// Browser compatibility
if (typeof window !== 'undefined') {
  window.bsvShamir = bsvShamir
}

// Node.js compatibility
if (typeof module !== 'undefined' && module.exports) {
  module.exports = bsvShamir
}

// AMD compatibility
if (typeof define === 'function' && define.amd) {
  define(function() {
    return bsvShamir
  })
}