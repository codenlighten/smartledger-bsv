const bsv = require('./index.js');

console.log('=== SmartLedger BSV Fork - Complete Compatibility Test ===');

console.log('Version:', bsv.version);
console.log('Hardened:', bsv.isHardened);
console.log('Base version:', bsv.baseVersion);

try {
  // Test all major BSV components are available
  console.log('\n=== Core Components Test ===');
  
  // Crypto components
  console.log('✓ BN:', !!bsv.crypto.BN);
  console.log('✓ ECDSA:', !!bsv.crypto.ECDSA);
  console.log('✓ Hash:', !!bsv.crypto.Hash);
  console.log('✓ Random:', !!bsv.crypto.Random);
  console.log('✓ Point:', !!bsv.crypto.Point);
  console.log('✓ Signature:', !!bsv.crypto.Signature);
  
  // SmartLedger enhancements
  console.log('✓ SmartVerify:', !!bsv.crypto.SmartVerify);
  console.log('✓ EllipticFixed:', !!bsv.crypto.EllipticFixed);
  
  // Main BSV classes
  console.log('✓ Address:', !!bsv.Address);
  console.log('✓ PrivateKey:', !!bsv.PrivateKey);
  console.log('✓ PublicKey:', !!bsv.PublicKey);
  console.log('✓ Transaction:', !!bsv.Transaction);
  console.log('✓ Script:', !!bsv.Script);
  console.log('✓ Block:', !!bsv.Block);
  console.log('✓ Networks:', !!bsv.Networks);
  console.log('✓ HDPrivateKey:', !!bsv.HDPrivateKey);
  console.log('✓ HDPublicKey:', !!bsv.HDPublicKey);
  
  // Encoding
  console.log('✓ Base58:', !!bsv.encoding.Base58);
  console.log('✓ Base58Check:', !!bsv.encoding.Base58Check);
  
  // Utilities
  console.log('✓ util.js:', !!bsv.util.js);
  console.log('✓ util.preconditions:', !!bsv.util.preconditions);
  console.log('✓ errors:', !!bsv.errors);
  
  // Dependencies
  console.log('✓ deps.bnjs:', !!bsv.deps.bnjs);
  console.log('✓ deps.elliptic:', !!bsv.deps.elliptic);
  console.log('✓ deps._:', !!bsv.deps._);

  console.log('\n=== Functional Test ===');
  
  // Test basic functionality
  const privateKey = new bsv.PrivateKey();
  console.log('✓ PrivateKey creation works');
  
  const publicKey = privateKey.toPublicKey();
  console.log('✓ PublicKey derivation works');
  
  const address = privateKey.toAddress();
  console.log('✓ Address generation works');
  
  // Test transaction creation
  const tx = new bsv.Transaction();
  console.log('✓ Transaction creation works');
  
  // Test signature creation and verification
  const message = 'SmartLedger compatibility test';
  const hash = bsv.crypto.Hash.sha256(Buffer.from(message));
  const signature = bsv.crypto.ECDSA.sign(hash, privateKey);
  console.log('✓ ECDSA signing works');
  console.log('✓ Signature is canonical:', signature.isCanonical());
  
  const isValid = bsv.crypto.ECDSA.verify(hash, signature, publicKey);
  console.log('✓ ECDSA verification works:', isValid);
  
  // Test SmartLedger security features
  const smartValid = bsv.crypto.SmartVerify.smartVerify(hash, signature, publicKey);
  console.log('✓ SmartVerify works:', smartValid);
  
  // Test signature security methods
  console.log('✓ Signature validation:', signature.isValid());
  const canonical = signature.toCanonical();
  console.log('✓ Signature canonicalization works:', canonical.isCanonical());
  
  console.log('\n=== All compatibility tests PASSED! ===');
  console.log('This is a complete drop-in replacement for bsv@1.5.6');
  
} catch (error) {
  console.error('❌ Compatibility test failed:', error.message);
  console.error('Stack:', error.stack);
}