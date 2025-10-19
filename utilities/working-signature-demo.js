#!/usr/bin/env node

/**
 * 🔧 BSV Working Script Validation Example
 * 
 * Creates a transaction with properly signed inputs that will pass
 * the BSV script interpreter validation.
 */

const bsv = require('../index.js');
const { acceptTransaction } = require('./miner-simulator');
const { loadConfig } = require('./utxo-manager');

/**
 * Create a properly signed transaction that should pass script validation
 */
function createValidTransaction() {
  console.log('🔧 Creating Valid BSV Transaction');
  console.log('═'.repeat(80));
  
  try {
    // Load wallet config
    const config = loadConfig();
    const wallet = config.wallet;
    const utxo = config.utxo;
    
    // Create recipient
    const recipientKey = new bsv.PrivateKey();
    const recipientAddress = recipientKey.toAddress();
    
    console.log('📋 Transaction Details:');
    console.log(`👛 From: ${wallet.address}`);
    console.log(`🎯 To: ${recipientAddress}`);
    console.log(`💰 Amount: 20,000 satoshis`);
    console.log(`💳 UTXO: ${utxo.txid}:${utxo.vout} (${utxo.satoshis} sats)`);
    
    // Create the transaction step by step
    const tx = new bsv.Transaction();
    
    // Add input
    tx.from({
      txid: utxo.txid,
      vout: utxo.vout,
      scriptPubKey: utxo.script,
      satoshis: utxo.satoshis
    });
    
    // Add outputs
    tx.to(recipientAddress, 20000);
    tx.change(wallet.address);
    tx.fee(1000);
    
    console.log('\n🔐 Signing transaction...');
    console.log(`Private Key: ${wallet.privateKeyWIF}`);
    console.log(`Input Script (before): ${tx.inputs[0].script ? tx.inputs[0].script.toHex() : 'empty'}`);
    
    // Sign with the correct private key and signature type
    const privateKey = bsv.PrivateKey.fromWIF(wallet.privateKeyWIF);
    
    // Sign with SIGHASH_ALL | SIGHASH_FORKID
    const sigType = bsv.crypto.Signature.SIGHASH_ALL | bsv.crypto.Signature.SIGHASH_FORKID;
    tx.sign(privateKey, sigType);
    
    console.log(`Input Script (after): ${tx.inputs[0].script.toHex()}`);
    console.log(`Script ASM: ${tx.inputs[0].script.toASM()}`);
    
    console.log('\n✅ Transaction signed successfully');
    console.log(`🆔 Transaction ID: ${tx.id}`);
    console.log(`📦 Raw Hex: ${tx.toString()}`);
    
    // Verify the signature locally first
    console.log('\n🔍 Local signature verification:');
    try {
      const verified = tx.verify();
      console.log(`Local verification: ${verified ? '✅ VALID' : '❌ INVALID'}`);
    } catch (error) {
      console.log(`Local verification error: ${error.message}`);
    }
    
    return tx;
    
  } catch (error) {
    console.error('❌ Error creating transaction:', error.message);
    return null;
  }
}

/**
 * Test the transaction with our miner
 */
function testWithMiner() {
  console.log('\n' + '═'.repeat(80));
  console.log('🎯 Testing with BSV Script Interpreter Miner');
  console.log('═'.repeat(80));
  
  const tx = createValidTransaction();
  
  if (!tx) {
    console.log('❌ Failed to create transaction');
    return;
  }
  
  // Test with full script validation
  console.log('\n📡 Sending to miner with full BSV script validation...');
  const result = acceptTransaction(tx);
  
  if (result.accepted) {
    console.log('\n🎉 SUCCESS! Transaction accepted by BSV script interpreter!');
    console.log(`✅ TXID: ${result.txid}`);
  } else {
    console.log('\n❌ Transaction rejected');
    console.log('Errors:', result.errors);
  }
  
  return result;
}

/**
 * Debug signature creation process
 */
function debugSignatureCreation() {
  console.log('\n' + '═'.repeat(80));
  console.log('🔍 Debugging Signature Creation');
  console.log('═'.repeat(80));
  
  try {
    const config = loadConfig();
    const wallet = config.wallet;
    const utxo = config.utxo;
    
    console.log('🔑 Wallet Info:');
    console.log(`Address: ${wallet.address}`);
    console.log(`Private Key: ${wallet.privateKeyWIF}`);
    console.log(`Public Key: ${wallet.publicKey}`);
    
    console.log('\n💰 UTXO Info:');
    console.log(`TXID: ${utxo.txid}`);
    console.log(`Vout: ${utxo.vout}`);
    console.log(`Value: ${utxo.satoshis} satoshis`);
    console.log(`Script: ${utxo.script}`);
    
    // Parse the script
    const script = bsv.Script.fromHex(utxo.script);
    console.log(`Script ASM: ${script.toASM()}`);
    
    // Verify the address matches
    const scriptAddress = script.toAddress();
    console.log(`Script Address: ${scriptAddress}`);
    console.log(`Wallet Address: ${wallet.address}`);
    console.log(`Addresses match: ${scriptAddress.toString() === wallet.address ? '✅' : '❌'}`);
    
  } catch (error) {
    console.error('❌ Debug error:', error.message);
  }
}

/**
 * Run all tests
 */
function runTests() {
  debugSignatureCreation();
  const result = testWithMiner();
  
  if (result && result.accepted) {
    console.log('\n🎯 Perfect! The BSV script interpreter accepted our transaction!');
  } else {
    console.log('\n🔧 Need to fix signature creation for script interpreter...');
  }
}

// Run tests if called directly
if (require.main === module) {
  runTests();
}

module.exports = {
  createValidTransaction,
  testWithMiner,
  debugSignatureCreation,
  runTests
};