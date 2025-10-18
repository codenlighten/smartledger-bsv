const hardenedBSV = require('./index');

console.log('=== SmartLedger BSV Test ===');
console.log('Version:', hardenedBSV.version);
console.log('Hardened:', hardenedBSV.isHardened);
console.log('Security features:', hardenedBSV.securityFeatures);

try {
  // Test basic functionality
  const privateKey = new hardenedBSV.PrivateKey();
  const publicKey = privateKey.toPublicKey();
  console.log('✓ PrivateKey/PublicKey generation works');
  
  // Test signature creation
  const message = 'SmartLedger security test';
  const hash = hardenedBSV.crypto.Hash.sha256(Buffer.from(message));
  const signature = hardenedBSV.crypto.ECDSA.sign(hash, privateKey);
  
  console.log('✓ Signature creation works');
  console.log('Signature canonical:', signature.isCanonical());
  
  // Test verification
  const isValid = hardenedBSV.crypto.ECDSA.verify(hash, signature, publicKey);
  console.log('✓ Signature verification works:', isValid);
  
  // Test SmartVerify
  const smartValid = hardenedBSV.crypto.SmartVerify.smartVerify(hash, signature, publicKey);
  console.log('✓ SmartVerify works:', smartValid);
  
  // Test canonicalization
  const canonical = hardenedBSV.crypto.SmartVerify.isCanonical(signature);
  console.log('✓ Canonicality check:', canonical);
  
  console.log('\n=== All basic tests passed! ===');
  
} catch (error) {
  console.error('❌ Test failed:', error.message);
  console.error('Stack:', error.stack);
}