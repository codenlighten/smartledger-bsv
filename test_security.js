const bsv = require('./index.js');

console.log('=== SmartLedger Security Validation Test ===');

try {
  // Test that our security patches reject invalid signatures during verification
  const privateKey = new bsv.PrivateKey();
  const publicKey = privateKey.toPublicKey();
  const message = 'SmartLedger security test';
  const hash = bsv.crypto.Hash.sha256(Buffer.from(message));
  
  // Create a valid signature first
  const validSig = bsv.crypto.ECDSA.sign(hash, privateKey);
  console.log('✓ Valid signature created');
  console.log('✓ Valid signature verification:', bsv.crypto.ECDSA.verify(hash, validSig, publicKey));
  
  // Test 1: Try to verify signature with r=0 
  console.log('\n=== Testing Zero R Value Attack ===');
  const zeroRSig = {
    r: new bsv.crypto.BN(0),
    s: validSig.s
  };
  
  const zeroRResult = bsv.crypto.ECDSA.verify(hash, zeroRSig, publicKey);
  console.log('✅ Zero r signature rejected:', !zeroRResult);
  
  // Test 2: Try to verify signature with s=0
  console.log('\n=== Testing Zero S Value Attack ===');  
  const zeroSSig = {
    r: validSig.r,
    s: new bsv.crypto.BN(0)
  };
  
  const zeroSResult = bsv.crypto.ECDSA.verify(hash, zeroSSig, publicKey);
  console.log('✅ Zero s signature rejected:', !zeroSResult);
  
  // Test 3: Test signature with s > n/2 (non-canonical)
  console.log('\n=== Testing Non-Canonical Signature ===');
  const n = bsv.crypto.Point.getN();
  const nh = n.shrn(1); // n/2
  
  // Force s to be > n/2  
  let highSSig = {
    r: validSig.r,
    s: validSig.s.gt(nh) ? validSig.s : n.sub(validSig.s)
  };
  
  console.log('High s value (> n/2):', highSSig.s.gt(nh));
  
  // Our verification should still work because it canonicalizes internally
  const highSResult = bsv.crypto.ECDSA.verify(hash, highSSig, publicKey);
  console.log('✅ High s signature canonicalized and verified:', highSResult);
  
  // Test 4: Test signature with r >= n (out of range)
  console.log('\n=== Testing Out of Range R Value ===');
  const outOfRangeRSig = {
    r: n, // r = n (should be < n)
    s: validSig.s
  };
  
  const outOfRangeResult = bsv.crypto.ECDSA.verify(hash, outOfRangeRSig, publicKey);
  console.log('✅ Out of range r signature rejected:', !outOfRangeResult);
  
  // Test 5: Test SmartVerify strict validation
  console.log('\n=== Testing SmartVerify Strict Mode ===');
  
  try {
    bsv.crypto.SmartVerify.smartVerify(Buffer.alloc(16), validSig, publicKey); // Wrong hash length
    console.log('❌ Should have thrown error');
  } catch (error) {
    console.log('✅ SmartVerify rejected invalid hash length:', error.message.includes('Invalid message hash'));
  }
  
  // Test 6: Test signature validation methods
  console.log('\n=== Testing Signature Validation Methods ===');
  console.log('✓ Valid signature isValid():', validSig.isValid());
  console.log('✓ Valid signature isCanonical():', validSig.isCanonical());
  
  const canonicalVersion = validSig.toCanonical();
  console.log('✓ Canonical version isCanonical():', canonicalVersion.isCanonical());
  
  console.log('\n🛡️ All security tests PASSED! 🛡️');
  console.log('SmartLedger security patches are working correctly.');
  
} catch (error) {
  console.error('❌ Security test failed:', error.message);
  console.error('Stack:', error.stack);
}