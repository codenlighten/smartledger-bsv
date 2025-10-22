'use strict'

var BN = require('./bn')
var Random = require('./random')
var Hash = require('./hash')
var _ = require('../util/_')

/**
 * Shamir Secret Sharing implementation for secure secret distribution
 * Based on Shamir's Secret Sharing algorithm using finite field arithmetic
 * 
 * Features:
 * - Split secrets into N shares with K threshold
 * - Reconstruct secret from any K shares
 * - Cryptographically secure random polynomial generation
 * - Support for arbitrary secret sizes via byte-level processing
 * - Compatible with BSV cryptographic primitives
 */

/**
 * Prime number for finite field operations
 * Using a large prime that's suitable for byte operations (2^31 - 1)
 */
var PRIME = new BN(2147483647) // Mersenne prime 2^31 - 1

/**
 * Shamir Secret Sharing constructor
 * @param {Object} options - Configuration options
 */
function Shamir(options) {
  if (!(this instanceof Shamir)) {
    return new Shamir(options)
  }
  
  this.options = options || {}
  return this
}

/**
 * Split a secret into shares using Shamir's Secret Sharing
 * @param {Buffer|String} secret - The secret to split
 * @param {Number} threshold - Minimum number of shares needed to reconstruct
 * @param {Number} shares - Total number of shares to generate
 * @param {Object} options - Additional options
 * @returns {Array} Array of share objects with {x, y} coordinates
 */
Shamir.split = function(secret, threshold, shares, options) {
  options = options || {}
  
  if (!secret) {
    throw new Error('Secret is required')
  }
  
  if (threshold < 2) {
    throw new Error('Threshold must be at least 2')
  }
  
  if (shares < threshold) {
    throw new Error('Number of shares must be at least threshold')
  }
  
  if (threshold > 255 || shares > 255) {
    throw new Error('Threshold and shares must be <= 255')
  }
  
  // Convert secret to buffer if string
  var secretBuffer = Buffer.isBuffer(secret) ? secret : Buffer.from(secret, 'utf8')
  
  // Process each byte of the secret
  var allShares = []
  
  for (var i = 0; i < secretBuffer.length; i++) {
    var byte = secretBuffer[i]
    var byteShares = Shamir._splitByte(byte, threshold, shares)
    allShares.push(byteShares)
  }
  
  // Combine shares across bytes
  var result = []
  for (var j = 0; j < shares; j++) {
    var shareData = {
      id: j + 1,
      threshold: threshold,
      shares: shares,
      length: secretBuffer.length,
      bytes: []
    }
    
    for (var k = 0; k < allShares.length; k++) {
      shareData.bytes.push(allShares[k][j])
    }
    
    result.push(shareData)
  }
  
  return result
}

/**
 * Combine shares to reconstruct the original secret
 * @param {Array} shares - Array of share objects
 * @returns {Buffer} The reconstructed secret
 */
Shamir.combine = function(shares) {
  if (!shares || shares.length === 0) {
    throw new Error('Shares array is required')
  }
  
  // Validate shares
  var threshold = shares[0].threshold
  var totalShares = shares[0].shares
  var secretLength = shares[0].length
  
  if (shares.length < threshold) {
    throw new Error('Insufficient shares: need ' + threshold + ', got ' + shares.length)
  }
  
  // Verify all shares have same parameters
  for (var i = 0; i < shares.length; i++) {
    if (shares[i].threshold !== threshold || shares[i].shares !== totalShares) {
      throw new Error('Shares have inconsistent parameters')
    }
    if (shares[i].length !== secretLength) {
      throw new Error('Shares have different secret lengths')
    }
  }
  
  var reconstructedBytes = []
  
  // Reconstruct each byte
  for (var j = 0; j < secretLength; j++) {
    var byteShares = []
    for (var k = 0; k < Math.min(shares.length, threshold); k++) {
      byteShares.push(shares[k].bytes[j])
    }
    
    var byte = Shamir._combineByte(byteShares)
    reconstructedBytes.push(byte)
  }
  
  // Create buffer from reconstructed bytes
  return Buffer.from(reconstructedBytes)
}

/**
 * Split a single byte using polynomial interpolation
 * @private
 */
Shamir._splitByte = function(secretByte, threshold, shares) {
  // Convert byte to big number
  var secret = new BN(secretByte)
  
  // Generate random polynomial coefficients
  var coefficients = [secret] // a0 = secret
  
  for (var i = 1; i < threshold; i++) {
    var coeff = Shamir._randomFieldElement()
    coefficients.push(coeff)
  }
  
  // Generate shares by evaluating polynomial at different points
  var result = []
  for (var x = 1; x <= shares; x++) {
    var y = Shamir._evaluatePolynomial(coefficients, new BN(x))
    result.push({
      x: x,
      y: y.toString(16)
    })
  }
  
  return result
}

/**
 * Combine shares for a single byte using Lagrange interpolation
 * @private
 */
Shamir._combineByte = function(shares) {
  if (shares.length === 0) {
    throw new Error('No shares provided')
  }
  
  var result = new BN(0)
  
  for (var i = 0; i < shares.length; i++) {
    var xi = new BN(shares[i].x)
    var yi = new BN(shares[i].y, 16)
    
    // Calculate Lagrange basis polynomial
    var numerator = new BN(1)
    var denominator = new BN(1)
    
    for (var j = 0; j < shares.length; j++) {
      if (i !== j) {
        var xj = new BN(shares[j].x)
        // For Lagrange interpolation at x=0 (to get the constant term)
        var numFactor = new BN(0).sub(xj)
        if (numFactor.lt(new BN(0))) {
          numFactor = numFactor.add(PRIME)
        }
        numerator = numerator.mul(numFactor).mod(PRIME)
        
        var denFactor = xi.sub(xj)
        if (denFactor.lt(new BN(0))) {
          denFactor = denFactor.add(PRIME)
        }
        denominator = denominator.mul(denFactor).mod(PRIME)
      }
    }
    
    // Calculate modular inverse of denominator
    var inverse = Shamir._modInverse(denominator, PRIME)
    var lagrange = numerator.mul(inverse).mod(PRIME)
    
    // Add to result
    result = result.add(yi.mul(lagrange)).mod(PRIME)
  }
  
  // Convert back to byte (0-255) - ensure positive result
  var finalResult = result.mod(PRIME).mod(new BN(256))
  return finalResult.toNumber()
}

/**
 * Evaluate polynomial at given point
 * @private
 */
Shamir._evaluatePolynomial = function(coefficients, x) {
  var result = new BN(0)
  var xPower = new BN(1)
  
  for (var i = 0; i < coefficients.length; i++) {
    result = result.add(coefficients[i].mul(xPower)).mod(PRIME)
    xPower = xPower.mul(x).mod(PRIME)
  }
  
  return result
}

/**
 * Generate random field element
 * @private
 */
Shamir._randomFieldElement = function() {
  var bytes = Random.getRandomBuffer(32)
  var num = new BN(bytes)
  return num.mod(PRIME.sub(new BN(1))).add(new BN(1))
}

/**
 * Calculate modular inverse using extended Euclidean algorithm
 * @private
 */
Shamir._modInverse = function(a, m) {
  if (a.lt(new BN(0))) {
    a = a.mod(m).add(m)
  }
  
  var g = Shamir._extendedGCD(a, m)
  
  if (!g.gcd.eq(new BN(1))) {
    throw new Error('Modular inverse does not exist')
  }
  
  return g.x.mod(m).add(m).mod(m)
}

/**
 * Extended Euclidean algorithm
 * @private
 */
Shamir._extendedGCD = function(a, b) {
  if (a.eq(new BN(0))) {
    return { gcd: b, x: new BN(0), y: new BN(1) }
  }
  
  var g = Shamir._extendedGCD(b.mod(a), a)
  
  return {
    gcd: g.gcd,
    x: g.y.sub(b.div(a).mul(g.x)),
    y: g.x
  }
}

/**
 * Verify share integrity
 * @param {Object} share - Share to verify
 * @returns {Boolean} True if share is valid
 */
Shamir.verifyShare = function(share) {
  try {
    if (!share || typeof share !== 'object') {
      return false
    }
    
    if (!share.id || !share.threshold || !share.shares || !share.bytes || typeof share.length !== 'number') {
      return false
    }
    
    if (share.threshold < 2 || share.shares < share.threshold) {
      return false
    }
    
    if (!Array.isArray(share.bytes) || share.bytes.length !== share.length) {
      return false
    }
    
    // Verify each byte share
    for (var i = 0; i < share.bytes.length; i++) {
      var byteShare = share.bytes[i]
      if (!byteShare.x || !byteShare.y) {
        return false
      }
      
      if (byteShare.x < 1 || byteShare.x > share.shares) {
        return false
      }
      
      // Verify y is valid hex
      try {
        var testHex = byteShare.y
        if (!/^[0-9a-fA-F]+$/.test(testHex)) {
          return false
        }
        new BN(testHex, 16)
      } catch (e) {
        return false
      }
    }
    
    return true
  } catch (e) {
    return false
  }
}

/**
 * Generate test vectors for validation
 * @returns {Object} Test data
 */
Shamir.generateTestVectors = function() {
  var secret = 'Hello, Bitcoin SV!'
  var threshold = 3
  var shares = 5
  
  var splitShares = Shamir.split(secret, threshold, shares)
  var reconstructed = Shamir.combine(splitShares.slice(0, threshold))
  
  return {
    secret: secret,
    threshold: threshold,
    totalShares: shares,
    shares: splitShares,
    reconstructed: reconstructed.toString('utf8'),
    valid: reconstructed.toString('utf8') === secret
  }
}

module.exports = Shamir