#!/usr/bin/env node

/**
 * Message Signing and Verification Demo
 * =====================================
 * 
 * Demonstrates BSV message signing and verification capabilities
 * using SmartLedger-BSV's message module.
 * 
 * Features demonstrated:
 * - Message signing with private keys
 * - Signature verification with addresses
 * - Bitcoin message format compliance
 * - Multi-signature validation
 * - Error handling and edge cases
 */

const bsv = require('../index.js');

console.log('✍️  SmartLedger-BSV Message Signing Demo');
console.log('========================================\n');

// Demonstrate message signing and verification
async function demonstrateMessageSigning() {
  try {
    // Generate keypairs for demonstration
    console.log('🔑 Generating keypairs...');
    const privateKey = bsv.PrivateKey.fromRandom();
    const publicKey = privateKey.publicKey;
    const address = privateKey.toAddress();
    
    console.log('👤 Address:', address.toString());
    console.log('🔑 Private Key (WIF):', privateKey.toWIF());
    console.log('🔐 Public Key:', publicKey.toString());
    console.log('');

    // Test 1: Basic message signing
    console.log('📝 Test 1: Basic Message Signing');
    console.log('--------------------------------');
    
    const message = 'Hello BSV! This message was signed with SmartLedger-BSV.';
    console.log('📄 Message:', message);
    
    // Sign the message
    const signature = bsv.Message(message).sign(privateKey);
    console.log('✅ Message signed successfully');
    console.log('✍️  Signature:', signature);
    console.log('📏 Signature length:', signature.length, 'characters');
    console.log('');

    // Verify the signature
    console.log('🔍 Verifying signature...');
    const isValid = bsv.Message(message).verify(address, signature);
    console.log('🎯 Verification result:', isValid ? '✅ VALID' : '❌ INVALID');
    console.log('');

    // Test 2: Different message types
    console.log('📊 Test 2: Different Message Types');
    console.log('---------------------------------');
    
    const testMessages = [
      'Short message',
      'This is a much longer message that contains multiple words and punctuation marks! Does it still work?',
      '{"type":"json","data":{"amount":12345,"address":"1A1zP1eP5QGefi2DMPTfTL5SLmv7DivfNa"}}',
      '🚀 Unicode message with emojis! 💎 BSV rocks! 🔐',
      '0123456789abcdef' // Hex-like data
    ];
    
    testMessages.forEach((msg, index) => {
      console.log(`📝 Message ${index + 1}:`, msg.substring(0, 50) + (msg.length > 50 ? '...' : ''));
      
      const sig = bsv.Message(msg).sign(privateKey);
      const valid = bsv.Message(msg).verify(address, sig);
      
      console.log(`   ✍️  Signature: ${sig.substring(0, 20)}...`);
      console.log(`   🎯 Valid: ${valid ? '✅' : '❌'}`);
      console.log('');
    });

    // Test 3: Multiple addresses verification
    console.log('👥 Test 3: Multiple Addresses');
    console.log('-----------------------------');
    
    const addresses = [];
    const signatures = [];
    const testMessage = 'Multi-signature test message for SmartLedger-BSV';
    
    // Create 3 different keypairs and sign the same message
    for (let i = 0; i < 3; i++) {
      const key = bsv.PrivateKey.fromRandom();
      const addr = key.toAddress();
      const sig = bsv.Message(testMessage).sign(key);
      
      addresses.push(addr);
      signatures.push(sig);
      
      console.log(`👤 Address ${i + 1}: ${addr.toString()}`);
      console.log(`   ✍️  Signature: ${sig.substring(0, 30)}...`);
      
      // Verify each signature
      const valid = bsv.Message(testMessage).verify(addr, sig);
      console.log(`   🎯 Valid: ${valid ? '✅' : '❌'}`);
    }
    console.log('');

    // Test 4: Cross-verification (should fail)
    console.log('🔄 Test 4: Cross-Verification (Should Fail)');
    console.log('-------------------------------------------');
    
    // Try to verify signature from address 1 with address 2
    const crossValid = bsv.Message(testMessage).verify(addresses[1], signatures[0]);
    console.log('🎯 Cross-verification result:', crossValid ? '❌ UNEXPECTED SUCCESS' : '✅ CORRECTLY FAILED');
    console.log('');

    // Test 5: Modified message verification (should fail)
    console.log('🔧 Test 5: Modified Message Verification');
    console.log('---------------------------------------');
    
    const originalMsg = 'Original message for modification test';
    const modifiedMsg = 'Modified message for modification test';
    
    const originalSig = bsv.Message(originalMsg).sign(privateKey);
    console.log('📝 Original message:', originalMsg);
    console.log('📝 Modified message:', modifiedMsg);
    
    const originalValid = bsv.Message(originalMsg).verify(address, originalSig);
    const modifiedValid = bsv.Message(modifiedMsg).verify(address, originalSig);
    
    console.log('🎯 Original verification:', originalValid ? '✅ VALID' : '❌ INVALID');
    console.log('🎯 Modified verification:', modifiedValid ? '❌ UNEXPECTED SUCCESS' : '✅ CORRECTLY FAILED');
    console.log('');

    // Test 6: Performance benchmarking
    console.log('📊 Test 6: Performance Benchmarking');
    console.log('-----------------------------------');
    
    const iterations = 100;
    const benchMessage = 'Performance benchmark message for BSV message signing';
    
    // Signing benchmark
    const signStart = Date.now();
    for (let i = 0; i < iterations; i++) {
      bsv.Message(benchMessage).sign(privateKey);
    }
    const signEnd = Date.now();
    const signTime = signEnd - signStart;
    
    // Verification benchmark
    const benchSig = bsv.Message(benchMessage).sign(privateKey);
    const verifyStart = Date.now();
    for (let i = 0; i < iterations; i++) {
      bsv.Message(benchMessage).verify(address, benchSig);
    }
    const verifyEnd = Date.now();
    const verifyTime = verifyEnd - verifyStart;
    
    console.log(`⏱️  ${iterations} signatures: ${signTime}ms (${(signTime/iterations).toFixed(2)}ms avg)`);
    console.log(`🚀 Signing rate: ${(iterations*1000/signTime).toFixed(0)} signatures/second`);
    console.log(`⏱️  ${iterations} verifications: ${verifyTime}ms (${(verifyTime/iterations).toFixed(2)}ms avg)`);
    console.log(`🚀 Verification rate: ${(iterations*1000/verifyTime).toFixed(0)} verifications/second`);
    console.log('');

    // Test 7: Message format analysis
    console.log('🔍 Test 7: Message Format Analysis');
    console.log('---------------------------------');
    
    const analysisMsg = 'Format analysis test';
    const analysisSig = bsv.Message(analysisMsg).sign(privateKey);
    
    console.log('📄 Message:', analysisMsg);
    console.log('📏 Message length:', analysisMsg.length, 'characters');
    console.log('✍️  Signature:', analysisSig);
    console.log('📏 Signature length:', analysisSig.length, 'characters');
    console.log('🔐 Signature format: Base64-encoded Bitcoin message signature');
    
    // Demonstrate signature components
    try {
      const sigBuffer = Buffer.from(analysisSig, 'base64');
      console.log('🔢 Signature bytes:', sigBuffer.length);
      console.log('🎯 Recovery flag:', sigBuffer[0]);
      console.log('📊 Signature data:', sigBuffer.slice(1).toString('hex').substring(0, 20) + '...');
    } catch (e) {
      console.log('ℹ️  Signature analysis requires additional parsing');
    }

  } catch (error) {
    console.error('❌ Demo error:', error.message);
    console.error('📋 Stack:', error.stack);
  }
}

// Run the demo
demonstrateMessageSigning().then(() => {
  console.log('\n🎉 Message Signing Demo completed!');
  console.log('');
  console.log('💡 Use Cases:');
  console.log('  • Identity verification with BSV addresses');
  console.log('  • Proof of ownership for digital assets');
  console.log('  • Secure authentication without passwords');
  console.log('  • Smart contract authorization');
  console.log('  • Timestamped message attestation');
  console.log('  • Multi-party agreement signatures');
  console.log('');
  console.log('🔧 Integration Tips:');
  console.log('  • Store signatures with messages for later verification');
  console.log('  • Use message signing for API authentication');
  console.log('  • Combine with timestamps for audit trails');
  console.log('  • Integrate with web apps for wallet-based login');
});