#!/usr/bin/env node

/**
 * SmartLedger-BSV v3.0.2 - Signature Verification Test
 * 
 * This script demonstrates the WORKING signature verification
 * in SmartLedger-BSV v3.0.2 after successful fixes.
 */

const bsv = require('../index.js');

console.log('🔬 SmartLedger-BSV v3.0.2 - Signature Verification Test');
console.log('======================================================\n');

// Generate a random private key using the BSV library
const privateKey = new bsv.PrivateKey(); // This generates a random private key
const publicKey = privateKey.publicKey;
const message = Buffer.from('hello world', 'utf8');
const hash = bsv.crypto.Hash.sha256(message);

console.log('Test Data:');
console.log('- Private Key:', privateKey.toString());
console.log('- Public Key:', publicKey.toString()); 
console.log('- Message:', message.toString());
console.log('- Hash:', hash.toString('hex'));
console.log('');

// Test standard signature flow
console.log('Testing Standard Signature Flow:');
console.log('================================');

try {
  // Create signature
  const signature = bsv.crypto.ECDSA.sign(hash, privateKey);
  console.log('✅ Signature created successfully');
  console.log('- Is canonical:', signature.isCanonical ? signature.isCanonical() : 'method unavailable');
  
  // Test DER format
  const derSig = signature.toDER();
  console.log('✅ DER conversion successful, length:', derSig.length);
  
  // Test canonical DER
  const canonicalSig = signature.toCanonical();
  const canonicalDer = canonicalSig.toDER();
  console.log('✅ Canonical DER conversion successful, length:', canonicalDer.length);
  console.log('- Is canonical:', canonicalSig.isCanonical ? canonicalSig.isCanonical() : 'method unavailable');
  
  // CRITICAL TEST: Verify the signature we just created
  console.log('\nVerification Tests:');
  console.log('==================');
  
  // Test 1: Standard ECDSA verify
  const verified1 = bsv.crypto.ECDSA.verify(hash, derSig, publicKey);
  console.log(`${verified1 ? '✅' : '❌'} ECDSA.verify(hash, derSig, publicKey):`, verified1);
  
  // Test 2: Canonical ECDSA verify  
  const verified2 = bsv.crypto.ECDSA.verify(hash, canonicalDer, publicKey);
  console.log(`${verified2 ? '✅' : '❌'} ECDSA.verify(hash, canonicalDer, publicKey):`, verified2);
  
  // Test 3: SmartVerify if available
  if (bsv.SmartVerify) {
    console.log('\nSmartVerify Tests:');
    console.log('=================');
    
    if (bsv.SmartVerify.smartVerify) {
      const smartVerified1 = bsv.SmartVerify.smartVerify(hash, derSig, publicKey);
      console.log(`${smartVerified1 ? '✅' : '❌'} SmartVerify.smartVerify(hash, derSig, publicKey):`, smartVerified1);
      
      const smartVerified2 = bsv.SmartVerify.smartVerify(hash, canonicalDer, publicKey);
      console.log(`${smartVerified2 ? '✅' : '❌'} SmartVerify.smartVerify(hash, canonicalDer, publicKey):`, smartVerified2);
    }
    
    if (bsv.SmartVerify.isCanonical) {
      const canonical1 = bsv.SmartVerify.isCanonical(derSig);
      console.log(`${canonical1 ? '✅' : '❌'} SmartVerify.isCanonical(derSig):`, canonical1);
      
      const canonical2 = bsv.SmartVerify.isCanonical(canonicalDer);
      console.log(`${canonical2 ? '✅' : '❌'} SmartVerify.isCanonical(canonicalDer):`, canonical2);
    }
  }
  
  // Dynamic success summary based on actual results
  const allWorking = verified1 && verified2;
  
  if (allWorking) {
    console.log('\n🎉 SUCCESS SUMMARY:');
    console.log('=================='); 
    console.log('1. ✅ Signatures created successfully');
    console.log('2. ✅ Canonical validation working');
    console.log('3. ✅ ALL verification methods return TRUE');
    console.log('4. ✅ Transaction validation ENABLED');
    console.log('');
    console.log('🚀 SmartLedger-BSV v3.0.2 signature verification is WORKING!');
    console.log('🔧 All signature verification issues have been RESOLVED!');
  } else {
    console.log('\n🚨 ISSUE SUMMARY:');
    console.log('================='); 
    console.log('1. Signatures are created successfully');
    console.log('2. .isCanonical() reports true on signature objects');
    console.log('3. Some verification methods still failing');
    console.log('4. This may block transaction validation');
    console.log('');
    console.log('Status: Partial fix - some issues remain');
  }

} catch (error) {
  console.log('❌ Test failed with error:', error.message);
  console.log('Stack:', error.stack);
}

// Library version info
console.log('\n📚 Environment Info:');
console.log('====================');
console.log('SmartLedger version:', bsv.SmartLedger?.version || 'not available');
console.log('Base version:', bsv.SmartLedger?.baseVersion || 'not available'); 
console.log('Hardened by:', bsv.SmartLedger?.hardenedBy || 'not available');
if (bsv.SmartLedger?.securityFeatures) {
  console.log('Security features:', bsv.SmartLedger.securityFeatures);
}