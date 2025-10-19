#!/usr/bin/env node

/**
 * 🔄 BSV Transaction Examples
 * 
 * Demonstrates the complete transaction flow:
 * 1. Create transaction
 * 2. Broadcast to miner
 * 3. Miner validates and processes
 * 4. UTXO set updates
 */

const bsv = require('../index.js');
const fs = require('fs');
const path = require('path');

// Import our utilities
const { 
  loadBlockchainState, 
  importWalletFromFile,
  getBlockchainStats 
} = require('./blockchain-state');
const { 
  acceptTransaction, 
  getMempoolStatus 
} = require('./miner-simulator');
const {
  loadConfig,
  updateUTXOFromTransaction
} = require('./utxo-manager');

/**
 * Initialize the blockchain with our test wallet
 */
async function initializeBlockchain() {
  console.log('🚀 Initializing blockchain with test wallet...\n');
  
  // Import wallet from wallet.json into blockchain state
  const imported = importWalletFromFile();
  
  if (!imported) {
    console.log('❌ Failed to import wallet. Run wallet-setup.js first!');
    return false;
  }
  
  console.log('');
  getBlockchainStats();
  return true;
}

/**
 * Create a simple P2PKH transaction
 */
function createSimpleTransaction(fromAddress, toAddress, amount, privateKey, utxo) {
  console.log(`\n💸 Creating P2PKH transaction:`);
  console.log(`From: ${fromAddress}`);
  console.log(`To: ${toAddress}`);
  console.log(`Amount: ${amount} satoshis\n`);
  
  try {
    // Create transaction with proper SIGHASH_FORKID
    const tx = new bsv.Transaction()
      .from(utxo)
      .to(toAddress, amount)
      .change(fromAddress)
      .fee(1000) // 1000 sat fee
      .sign(privateKey, bsv.crypto.Signature.SIGHASH_ALL | bsv.crypto.Signature.SIGHASH_FORKID);
    
    console.log(`✅ Transaction created: ${tx.id}`);
    console.log(`Inputs: ${tx.inputs.length}`);
    console.log(`Outputs: ${tx.outputs.length}`);
    console.log(`Fee: ${tx.getFee()} satoshis\n`);
    
    return tx;
  } catch (error) {
    console.error('❌ Error creating transaction:', error.message);
    return null;
  }
}

/**
 * Example 1: Simple P2PKH payment
 */
async function exampleSimplePayment() {
  console.log('\n' + '='.repeat(80));
  console.log('📝 EXAMPLE 1: Simple P2PKH Payment');
  console.log('='.repeat(80));
  
  // Load wallet config
  const config = loadConfig();
  const wallet = config.wallet;
  
  // Create recipient address (just generate a new one for demo)
  const recipientKey = new bsv.PrivateKey();
  const recipientAddress = recipientKey.toAddress().toString();
  
  console.log(`👛 Sender: ${wallet.address}`);
  console.log(`🎯 Recipient: ${recipientAddress}`);
  
  // Use the primary UTXO
  const utxo = config.utxo;
  console.log(`💰 Using UTXO: ${utxo.txid}:${utxo.vout} (${utxo.satoshis} sats)`);
  
  // Create transaction (send 15,000 sats)
  const amount = 15000;
  const tx = createSimpleTransaction(
    wallet.address,
    recipientAddress,
    amount,
    bsv.PrivateKey.fromWIF(wallet.privateKeyWIF),
    utxo
  );
  
  if (!tx) {
    console.log('❌ Failed to create transaction');
    return;
  }
  
  // Broadcast to miner
  console.log('📡 Broadcasting transaction to miner...');
  const result = acceptTransaction(tx);
  
  if (result.accepted) {
    console.log('\n🎉 Transaction accepted and processed!');
    
    // Update local wallet
    updateUTXOFromTransaction(tx, utxo);
    
    console.log('\n📊 Updated blockchain state:');
    getBlockchainStats();
  } else {
    console.log('\n❌ Transaction rejected by miner');
    console.log('Errors:', result.errors);
  }
}

/**
 * Example 2: Chain multiple transactions
 */
async function exampleTransactionChain() {
  console.log('\n' + '='.repeat(80));
  console.log('🔗 EXAMPLE 2: Transaction Chain');
  console.log('='.repeat(80));
  
  const config = loadConfig();
  const wallet = config.wallet;
  
  // Find an available UTXO for the second transaction
  const availableUTXOs = config.availableUTXOs || [];
  
  if (availableUTXOs.length === 0) {
    console.log('❌ No available UTXOs for chaining. Run example 1 first.');
    return;
  }
  
  // Use the first available UTXO
  const utxo = availableUTXOs[0];
  console.log(`💰 Using UTXO: ${utxo.txid}:${utxo.vout} (${utxo.satoshis} sats)`);
  
  // Create another recipient
  const recipientKey = new bsv.PrivateKey();
  const recipientAddress = recipientKey.toAddress().toString();
  
  console.log(`👛 Sender: ${wallet.address}`);
  console.log(`🎯 Recipient: ${recipientAddress}`);
  
  // Create second transaction
  const amount = Math.min(5000, utxo.satoshis - 1000); // Leave room for fee
  const tx = createSimpleTransaction(
    wallet.address,
    recipientAddress,
    amount,
    bsv.PrivateKey.fromWIF(wallet.privateKeyWIF),
    utxo
  );
  
  if (!tx) {
    console.log('❌ Failed to create transaction');
    return;
  }
  
  // Broadcast to miner
  console.log('📡 Broadcasting transaction to miner...');
  const result = acceptTransaction(tx);
  
  if (result.accepted) {
    console.log('\n🎉 Transaction accepted and processed!');
    
    // Update local wallet
    updateUTXOFromTransaction(tx, utxo);
    
    console.log('\n📊 Updated blockchain state:');
    getBlockchainStats();
  } else {
    console.log('\n❌ Transaction rejected by miner');
    console.log('Errors:', result.errors);
  }
}

/**
 * Example 3: Multi-output transaction
 */
async function exampleMultiOutput() {
  console.log('\n' + '='.repeat(80));
  console.log('🎭 EXAMPLE 3: Multi-Output Transaction');
  console.log('='.repeat(80));
  
  const config = loadConfig();
  const wallet = config.wallet;
  
  // Find an available UTXO
  const availableUTXOs = config.availableUTXOs || [];
  
  if (availableUTXOs.length === 0) {
    console.log('❌ No available UTXOs. Run example 1 first.');
    return;
  }
  
  // Use the largest available UTXO
  const utxo = availableUTXOs.reduce((max, current) => 
    current.satoshis > max.satoshis ? current : max
  );
  
  console.log(`💰 Using UTXO: ${utxo.txid}:${utxo.vout} (${utxo.satoshis} sats)`);
  
  // Create multiple recipients
  const recipient1 = new bsv.PrivateKey().toAddress().toString();
  const recipient2 = new bsv.PrivateKey().toAddress().toString();
  const recipient3 = new bsv.PrivateKey().toAddress().toString();
  
  console.log(`👛 Sender: ${wallet.address}`);
  console.log(`🎯 Recipients: ${recipient1.slice(0, 10)}... ${recipient2.slice(0, 10)}... ${recipient3.slice(0, 10)}...`);
  
  try {
    // Create multi-output transaction with proper SIGHASH_FORKID
    const tx = new bsv.Transaction()
      .from(utxo)
      .to(recipient1, 3000)
      .to(recipient2, 4000)
      .to(recipient3, 5000)
      .change(wallet.address)
      .fee(1000)
      .sign(bsv.PrivateKey.fromWIF(wallet.privateKeyWIF), bsv.crypto.Signature.SIGHASH_ALL | bsv.crypto.Signature.SIGHASH_FORKID);
    
    console.log(`\n✅ Multi-output transaction created: ${tx.id}`);
    console.log(`Inputs: ${tx.inputs.length}`);
    console.log(`Outputs: ${tx.outputs.length}`);
    console.log(`Total sent: 12,000 satoshis to 3 recipients`);
    
    // Broadcast to miner
    console.log('\n📡 Broadcasting transaction to miner...');
    const result = acceptTransaction(tx);
    
    if (result.accepted) {
      console.log('\n🎉 Transaction accepted and processed!');
      
      // Update local wallet
      updateUTXOFromTransaction(tx, utxo);
      
      console.log('\n📊 Updated blockchain state:');
      getBlockchainStats();
    } else {
      console.log('\n❌ Transaction rejected by miner');
      console.log('Errors:', result.errors);
    }
  } catch (error) {
    console.error('❌ Error creating multi-output transaction:', error.message);
  }
}

/**
 * Run all examples
 */
async function runAllExamples() {
  console.log('🚀 BSV Transaction Examples');
  console.log('🌟 Demonstrating complete transaction flow with miner simulation\n');
  
  // Initialize blockchain state
  const initialized = await initializeBlockchain();
  if (!initialized) {
    return;
  }
  
  // Show initial miner status
  console.log('\n📊 Initial miner status:');
  getMempoolStatus();
  
  // Run examples
  await exampleSimplePayment();
  await new Promise(resolve => setTimeout(resolve, 1000)); // Small delay
  
  await exampleTransactionChain();
  await new Promise(resolve => setTimeout(resolve, 1000)); // Small delay
  
  await exampleMultiOutput();
  
  // Final status
  console.log('\n📊 Final miner status:');
  getMempoolStatus();
  
  console.log('\n🎯 Examples completed!');
  console.log('Check blockchain-state.json to see the global UTXO set');
  console.log('Check wallet.json to see your local wallet state');
}

// If called directly, run examples
if (require.main === module) {
  const args = process.argv.slice(2);
  
  if (args[0] === '1') {
    initializeBlockchain().then(() => exampleSimplePayment());
  } else if (args[0] === '2') {
    exampleTransactionChain();
  } else if (args[0] === '3') {
    exampleMultiOutput();
  } else {
    runAllExamples();
  }
}

module.exports = {
  initializeBlockchain,
  createSimpleTransaction,
  exampleSimplePayment,
  exampleTransactionChain,
  exampleMultiOutput,
  runAllExamples
};