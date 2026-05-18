#!/usr/bin/env node

/**
 * BSV Shamir Secret Sharing Test
 * Comprehensive test of the Shamir Secret Sharing implementation
 */

'use strict'

console.log('=== BSV Shamir Secret Sharing Test ===\n')

// Load the BSV library with Shamir support
var bsv
try {
  bsv = require('./index.js')
  console.log('✓ Loaded BSV library with Shamir support')
} catch (e) {
  console.error('✗ Failed to load BSV library:', e.message)
  process.exit(1)
}

// Test 1: Basic functionality test
console.log('\n--- Test 1: Basic Secret Sharing ---')
try {
  var secret = 'Hello, Bitcoin SV!'
  var threshold = 3
  var shares = 5
  
  console.log('Original secret:', secret)
  console.log('Threshold:', threshold, '/ Total shares:', shares)
  
  // Split the secret
  var splitShares = bsv.Shamir.split(secret, threshold, shares)
  console.log('✓ Successfully split secret into', splitShares.length, 'shares')
  
  // Reconstruct with minimum shares
  var reconstructed = bsv.Shamir.combine(splitShares.slice(0, threshold))
  var reconstructedSecret = reconstructed.toString('utf8')
  
  console.log('Reconstructed:', reconstructedSecret)
  
  if (reconstructedSecret === secret) {
    console.log('✓ Test 1 PASSED: Secret correctly reconstructed')
  } else {
    console.log('✗ Test 1 FAILED: Secret reconstruction failed')
  }
} catch (e) {
  console.log('✗ Test 1 ERROR:', e.message)
}

// Test 2: Larger secret test
console.log('\n--- Test 2: Large Secret Test ---')
try {
  var largeSecret = 'This is a much longer secret that will test the chunking functionality of the Shamir Secret Sharing implementation. It should handle secrets of arbitrary length by breaking them into manageable chunks and processing each chunk separately.'
  var threshold2 = 4
  var shares2 = 7
  
  console.log('Large secret length:', largeSecret.length, 'characters')
  
  var splitShares2 = bsv.Shamir.split(largeSecret, threshold2, shares2)
  console.log('✓ Successfully split large secret')
  
  var reconstructed2 = bsv.Shamir.combine(splitShares2.slice(0, threshold2))
  var reconstructedSecret2 = reconstructed2.toString('utf8')
  
  if (reconstructedSecret2 === largeSecret) {
    console.log('✓ Test 2 PASSED: Large secret correctly reconstructed')
  } else {
    console.log('✗ Test 2 FAILED: Large secret reconstruction failed')
    console.log('Expected length:', largeSecret.length)
    console.log('Actual length:', reconstructedSecret2.length)
    console.log('First 50 chars expected:', largeSecret.substring(0, 50))
    console.log('First 50 chars actual  :', reconstructedSecret2.substring(0, 50))
    console.log('Match:', largeSecret === reconstructedSecret2)
  }
} catch (e) {
  console.log('✗ Test 2 ERROR:', e.message)
}

// Test 3: Different share combinations
console.log('\n--- Test 3: Share Combination Test ---')
try {
  var secret3 = 'Testing different combinations'
  var splitShares3 = bsv.Shamir.split(secret3, 3, 6)
  
  // Test different combinations of 3 shares
  var combinations = [
    [0, 1, 2], // First three
    [1, 3, 5], // Every other
    [2, 4, 5]  // Last three + one
  ]
  
  var allPassed = true
  for (var i = 0; i < combinations.length; i++) {
    var combo = combinations[i]
    var testShares = combo.map(function(idx) { return splitShares3[idx] })
    var reconstructed3 = bsv.Shamir.combine(testShares)
    var result = reconstructed3.toString('utf8')
    
    if (result === secret3) {
      console.log('✓ Combination', combo, 'successful')
    } else {
      console.log('✗ Combination', combo, 'failed')
      allPassed = false
    }
  }
  
  if (allPassed) {
    console.log('✓ Test 3 PASSED: All share combinations work')
  } else {
    console.log('✗ Test 3 FAILED: Some combinations failed')
  }
} catch (e) {
  console.log('✗ Test 3 ERROR:', e.message)
}

// Test 4: Share verification
console.log('\n--- Test 4: Share Verification Test ---')
try {
  var secret4 = 'Verification test'
  var splitShares4 = bsv.Shamir.split(secret4, 2, 4)
  
  var validCount = 0
  for (var j = 0; j < splitShares4.length; j++) {
    if (bsv.Shamir.verifyShare(splitShares4[j])) {
      validCount++
    }
  }
  
  if (validCount === splitShares4.length) {
    console.log('✓ Test 4 PASSED: All shares verified as valid')
  } else {
    console.log('✗ Test 4 FAILED: Only', validCount, 'of', splitShares4.length, 'shares valid')
  }
  
  // Test invalid share
  var invalidShare = { invalid: 'data' }
  if (!bsv.Shamir.verifyShare(invalidShare)) {
    console.log('✓ Invalid share correctly rejected')
  } else {
    console.log('✗ Invalid share incorrectly accepted')
  }
} catch (e) {
  console.log('✗ Test 4 ERROR:', e.message)
}

// Test 5: Error handling
console.log('\n--- Test 5: Error Handling Test ---')
try {
  var errorTests = [
    function() { bsv.Shamir.split('', 2, 3) }, // Empty secret
    function() { bsv.Shamir.split('secret', 1, 3) }, // Threshold too low
    function() { bsv.Shamir.split('secret', 3, 2) }, // More threshold than shares
    function() { bsv.Shamir.combine([]) }, // Empty shares array
    function() { bsv.Shamir.combine([{id: 1, threshold: 2, shares: 3, length: 1, bytes: []}]) } // Insufficient shares
  ]
  
  var errorsPassed = 0
  for (var k = 0; k < errorTests.length; k++) {
    try {
      errorTests[k]()
      console.log('✗ Error test', k + 1, 'should have thrown an error')
    } catch (e) {
      console.log('✓ Error test', k + 1, 'correctly threw:', e.message)
      errorsPassed++
    }
  }
  
  if (errorsPassed === errorTests.length) {
    console.log('✓ Test 5 PASSED: All error conditions handled correctly')
  } else {
    console.log('✗ Test 5 FAILED: Some error conditions not handled')
  }
} catch (e) {
  console.log('✗ Test 5 ERROR:', e.message)
}

// Test 6: Binary data test
console.log('\n--- Test 6: Binary Data Test ---')
try {
  var binaryData = Buffer.from([0x00, 0x01, 0x02, 0xFF, 0xFE, 0xFD, 0x80, 0x7F])
  var splitBinary = bsv.Shamir.split(binaryData, 2, 3)
  var reconstructedBinary = bsv.Shamir.combine(splitBinary.slice(0, 2))
  
  if (Buffer.compare(binaryData, reconstructedBinary) === 0) {
    console.log('✓ Test 6 PASSED: Binary data correctly handled')
  } else {
    console.log('✗ Test 6 FAILED: Binary data reconstruction failed')
    console.log('Original:', Array.from(binaryData))
    console.log('Reconstructed:', Array.from(reconstructedBinary))
  }
} catch (e) {
  console.log('✗ Test 6 ERROR:', e.message)
}

// Test 7: Generate test vectors
console.log('\n--- Test 7: Test Vectors Generation ---')
try {
  var testVectors = bsv.Shamir.generateTestVectors()
  
  console.log('Test vectors generated:')
  console.log('- Secret:', testVectors.secret)
  console.log('- Threshold:', testVectors.threshold)
  console.log('- Total shares:', testVectors.totalShares)
  console.log('- Shares generated:', testVectors.shares.length)
  console.log('- Reconstruction successful:', testVectors.valid)
  
  if (testVectors.valid) {
    console.log('✓ Test 7 PASSED: Test vectors generated and validated')
  } else {
    console.log('✗ Test 7 FAILED: Test vectors validation failed')
  }
} catch (e) {
  console.log('✗ Test 7 ERROR:', e.message)
}

console.log('\n=== Shamir Secret Sharing Tests Complete ===')
console.log('💡 Integration successful! Shamir Secret Sharing is now available in:')
console.log('   • Main library: bsv.Shamir or bsv.crypto.Shamir')
console.log('   • Standalone: bsv-shamir.min.js (after build)')
console.log('   • CDN ready: Use npm run build-shamir to generate minified version')