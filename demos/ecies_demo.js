#!/usr/bin/env node

/**
 * ECIES Encryption/Decryption Demo
 * ================================
 * 
 * Demonstrates ECIES (Elliptic Curve Integrated Encryption Scheme) capabilities
 * using SmartLedger-BSV's bsv-ecies module.
 * 
 * Features demonstrated:
 * - ECIES encryption with public keys
 * - ECIES decryption with private keys
 * - Message encryption/decryption
 * - File-like data encryption
 * - Error handling and validation
 */

const bsv = require('../index.js');

console.log('🔐 SmartLedger-BSV ECIES Demo');
console.log('==============================\n');

// Test ECIES functionality
async function demonstrateECIES() {
  try {
    // Generate sender and receiver keypairs
    console.log('🔑 Generating keypairs...');
    const senderPrivateKey = bsv.PrivateKey.fromRandom();
    const receiverPrivateKey = bsv.PrivateKey.fromRandom();
    
    console.log('👤 Sender Address:', senderPrivateKey.toAddress().toString());
    console.log('👤 Receiver Address:', receiverPrivateKey.toAddress().toString());
    console.log('');

    // Test 1: Basic message encryption
    console.log('📝 Test 1: Basic Message Encryption');
    console.log('-----------------------------------');
    
    const message = 'Hello, this is a secret message from SmartLedger-BSV ECIES demo!';
    console.log('Original message:', message);
    
    // Encrypt with receiver's public key
    const encrypted = bsv.ECIES()
      .privateKey(senderPrivateKey)
      .publicKey(receiverPrivateKey.publicKey)
      .encrypt(message);
    
    console.log('✅ Message encrypted successfully');
    console.log('📦 Encrypted data length:', encrypted.length, 'bytes');
    console.log('🔐 Encrypted (hex):', encrypted.toString('hex').substring(0, 64) + '...');
    
    // Decrypt with receiver's private key
    const decrypted = bsv.ECIES()
      .privateKey(receiverPrivateKey)
      .publicKey(senderPrivateKey.publicKey)
      .decrypt(encrypted);
    
    console.log('✅ Message decrypted successfully');
    console.log('📖 Decrypted message:', decrypted.toString());
    console.log('🎯 Match:', message === decrypted.toString() ? '✅ SUCCESS' : '❌ FAILED');
    console.log('');

    // Test 2: JSON data encryption
    console.log('📊 Test 2: JSON Data Encryption');
    console.log('-------------------------------');
    
    const jsonData = {
      wallet: {
        balance: 0.12345678,
        transactions: ['tx1', 'tx2', 'tx3'],
        lastUpdated: new Date().toISOString()
      },
      user: {
        name: 'SmartLedger User',
        preferences: { currency: 'BSV', notifications: true }
      }
    };
    
    const jsonString = JSON.stringify(jsonData);
    console.log('📄 Original JSON:', jsonString.substring(0, 100) + '...');
    
    const encryptedJson = bsv.ECIES()
      .privateKey(senderPrivateKey)
      .publicKey(receiverPrivateKey.publicKey)
      .encrypt(jsonString);
    
    const decryptedJson = bsv.ECIES()
      .privateKey(receiverPrivateKey)
      .publicKey(senderPrivateKey.publicKey)
      .decrypt(encryptedJson);
    
    const parsedData = JSON.parse(decryptedJson.toString());
    console.log('💰 Decrypted wallet balance:', parsedData.wallet.balance);
    console.log('👤 Decrypted user name:', parsedData.user.name);
    console.log('🎯 JSON integrity:', JSON.stringify(jsonData) === decryptedJson.toString() ? '✅ SUCCESS' : '❌ FAILED');
    console.log('');

    // Test 3: Binary data encryption
    console.log('🔢 Test 3: Binary Data Encryption');
    console.log('---------------------------------');
    
    const binaryData = Buffer.from([0x48, 0x65, 0x6c, 0x6c, 0x6f, 0x20, 0x42, 0x69, 0x6e, 0x61, 0x72, 0x79]);
    console.log('📊 Original binary data:', binaryData.toString('hex'));
    
    const encryptedBinary = bsv.ECIES()
      .privateKey(senderPrivateKey)
      .publicKey(receiverPrivateKey.publicKey)
      .encrypt(binaryData);
    
    const decryptedBinary = bsv.ECIES()
      .privateKey(receiverPrivateKey)
      .publicKey(senderPrivateKey.publicKey)
      .decrypt(encryptedBinary);
    
    console.log('📊 Decrypted binary data:', decryptedBinary.toString('hex'));
    console.log('🎯 Binary integrity:', binaryData.equals(decryptedBinary) ? '✅ SUCCESS' : '❌ FAILED');
    console.log('');

    // Test 4: Error handling
    console.log('⚠️  Test 4: Error Handling');
    console.log('-------------------------');
    
    try {
      // Try to decrypt with wrong key
      const wrongKey = bsv.PrivateKey.fromRandom();
      bsv.ECIES()
        .privateKey(wrongKey)
        .publicKey(senderPrivateKey.publicKey)
        .decrypt(encrypted);
      console.log('❌ Should have thrown error for wrong key');
    } catch (error) {
      console.log('✅ Correctly caught decryption error:', error.message.substring(0, 50) + '...');
    }
    
    console.log('');
    
    // Performance metrics
    console.log('📊 Performance Metrics');
    console.log('---------------------');
    
    const iterations = 100;
    const testMessage = 'Performance test message for ECIES encryption/decryption benchmarking.';
    
    const startTime = Date.now();
    
    for (let i = 0; i < iterations; i++) {
      const enc = bsv.ECIES()
        .privateKey(senderPrivateKey)
        .publicKey(receiverPrivateKey.publicKey)
        .encrypt(testMessage);
      
      const dec = bsv.ECIES()
        .privateKey(receiverPrivateKey)
        .publicKey(senderPrivateKey.publicKey)
        .decrypt(enc);
    }
    
    const endTime = Date.now();
    const totalTime = endTime - startTime;
    const avgTime = totalTime / iterations;
    
    console.log(`⏱️  ${iterations} encrypt/decrypt cycles: ${totalTime}ms`);
    console.log(`📊 Average per cycle: ${avgTime.toFixed(2)}ms`);
    console.log(`🚀 Operations per second: ${(1000 / avgTime).toFixed(0)}`);

  } catch (error) {
    console.error('❌ Demo error:', error.message);
    console.error('📋 Stack:', error.stack);
  }
}

// Run the demo
demonstrateECIES().then(() => {
  console.log('\n🎉 ECIES Demo completed!');
  console.log('');
  console.log('💡 Use Cases:');
  console.log('  • Secure messaging between BSV addresses');
  console.log('  • Encrypted data storage with public key access');
  console.log('  • Secure API communication');
  console.log('  • Privacy-preserving smart contracts');
  console.log('  • Encrypted blockchain data anchoring');
});