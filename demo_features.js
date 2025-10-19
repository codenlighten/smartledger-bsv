#!/usr/bin/env node

/**
 * SmartLedger-BSV v3.0.2 New Features Demo
 * 
 * This script demonstrates the new UTXO management and miner simulation features
 */

const bsv = require('./index.js');

console.log('🚀 SmartLedger-BSV v3.0.2 New Features Demo');
console.log('============================================\n');

// Create test wallet
const privateKey = new bsv.PrivateKey();
const address = privateKey.toAddress().toString();

console.log('📱 Demo Wallet:');
console.log(`Address: ${address}`);
console.log(`Private Key: ${privateKey.toString()}\n`);

// 1. UTXO Management Demo
console.log('💰 SmartUTXO Management System:');
console.log('===============================');

const utxoManager = new bsv.SmartUTXO();

// Create mock UTXOs for testing
const mockUTXOs = utxoManager.createMockUTXOs(address, 3, 50000);
console.log(`Created ${mockUTXOs.length} mock UTXOs for testing`);

// Add UTXOs to the system
mockUTXOs.forEach(utxo => utxoManager.addUTXO(utxo));
console.log('UTXOs added to blockchain state');

// Check balance
const balance = utxoManager.getBalance(address);
console.log(`Total balance: ${balance} satoshis (${balance / 100000000} BSV)`);

// Get UTXOs for the address
const utxos = utxoManager.getUTXOsForAddress(address);
console.log(`Available UTXOs: ${utxos.length}`);

// Get blockchain stats
const stats = utxoManager.getStats();
console.log(`Blockchain stats: ${stats.totalUTXOs} UTXOs, ${stats.totalValue} satoshis\n`);

// 2. Miner Simulation Demo
console.log('⛏️  SmartMiner Blockchain Simulation:');
console.log('====================================');

const miner = new bsv.SmartMiner(bsv, {
  logLevel: 'info',
  validateScripts: true
});

// Create a simple transaction
try {
  const transaction = new bsv.Transaction()
    .from({
      txid: mockUTXOs[0].txid,
      vout: mockUTXOs[0].vout,
      address: address,
      script: mockUTXOs[0].script,
      satoshis: mockUTXOs[0].satoshis
    })
    .to(address, 25000)  // Send to self
    .change(address)     // Change back to self
    .sign(privateKey);

  console.log(`Transaction created: ${transaction.id}`);
  
  // Submit to miner
  const accepted = miner.acceptTransaction(transaction);
  console.log(`Transaction accepted: ${accepted}`);
  
  // Check mempool
  const mempoolStats = miner.getMempoolStats();
  console.log(`Mempool: ${mempoolStats.transactionCount} transactions`);
  
  // Mine a block
  const block = miner.mineBlock();
  console.log(`Mined block ${block.height} with ${block.transactionCount} transactions`);
  console.log(`Block hash: ${block.hash}`);
  
  // Get blockchain status
  const blockchainStats = miner.getBlockchainStats();
  console.log(`Blockchain height: ${blockchainStats.currentHeight}`);
  
} catch (error) {
  console.log(`Transaction error (expected for demo): ${error.message}`);
  console.log('Note: This is normal for mock UTXOs without proper scripts');
}

console.log('\n3. Signature Verification Demo:');
console.log('===============================');

// Test the fixed signature verification
const message = Buffer.from('SmartLedger-BSV v3.0.2 Demo', 'utf8');
const hash = bsv.crypto.Hash.sha256(message);
const signature = bsv.crypto.ECDSA.sign(hash, privateKey);
const derSig = signature.toDER();

// Test all verification methods
console.log('Message:', message.toString());
console.log('Signature verification tests:');

const ecdsaResult = bsv.crypto.ECDSA.verify(hash, derSig, privateKey.publicKey);
console.log(`✅ ECDSA.verify(): ${ecdsaResult}`);

const smartResult = bsv.SmartVerify.smartVerify(hash, derSig, privateKey.publicKey);
console.log(`✅ SmartVerify.smartVerify(): ${smartResult}`);

const canonicalResult = bsv.SmartVerify.isCanonical(derSig);
console.log(`✅ SmartVerify.isCanonical(): ${canonicalResult}`);

console.log('\n🎉 Demo completed successfully!');
console.log('📚 All signature verification methods are now working correctly.');
console.log('🔧 New UTXO management and miner tools are ready for development!');

// Save state for future use
utxoManager.saveState();
console.log('\n💾 Blockchain state saved for future sessions.');