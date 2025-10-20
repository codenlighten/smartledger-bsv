#!/usr/bin/env node

/**
 * Demonstration of Preimage Covenant Utils
 * 
 * Shows the clean API for proper covenant flow
 */

const bsv = require('../../index.js');
const PreimageCovenantUtils = require('./preimage_covenant_utils');
const fs = require('fs');
const path = require('path');

console.log('🚀 Preimage Covenant Utils Demonstration');
console.log('=======================================\n');

// Initialize with private key
const privateKey = bsv.PrivateKey.fromWIF('L5JREiiMfP5enqsRuhyNEv8SRjrjnMXNhkQEgNvzDRhGTaHG9ZFm');
const covenantUtils = new PreimageCovenantUtils(privateKey);

console.log('Wallet:', covenantUtils.address.toString());
console.log('');

// Load a P2PKH UTXO (from WhatsOnChain in real scenario)
function getP2pkhUtxo() {
  const utxoPath = path.join(__dirname, '../data/utxos.json');
  const utxos = JSON.parse(fs.readFileSync(utxoPath, 'utf8'));
  
  const utxo = utxos.find(u => u.status === 'confirmed' && u.satoshis >= 10000);
  if (!utxo) {
    throw new Error('No suitable P2PKH UTXO found');
  }
  
  return utxo;
}

// Example broadcast callback (would integrate with WhatsOnChain/etc in production)
function broadcastCallback(tx, phase) {
  console.log(`📡 Would broadcast ${phase} transaction:`, tx.id);
  
  try {
    console.log('- Size:', tx.toString('hex').length / 2, 'bytes');  // ✅ Using toString('hex')
    console.log('- Fee:', tx.getFee(), 'satoshis');
    console.log('- Valid:', tx.verify());
  } catch (error) {
    console.log('- Validation pending (custom script)');
  }
  console.log('');
  
  // In production: POST to WhatsOnChain or other broadcast service
  // fetch('https://api.whatsonchain.com/v1/bsv/main/tx/raw', {
  //   method: 'POST',
  //   body: tx.toString('hex')  // ✅ Using toString('hex')
  // });
}

try {
  console.log('Example 1: Complete Covenant Flow');
  console.log('=================================');

  const p2pkhUtxo = getP2pkhUtxo();
  console.log('📦 Using P2PKH UTXO:', p2pkhUtxo.txid);
  console.log('');

  const result = covenantUtils.completeCovenantFlow(p2pkhUtxo, broadcastCallback);

  if (result.success) {
    console.log('🎉 Complete success!\n');
  }

  console.log('Example 2: Working with Stored Covenant UTXOs');
  console.log('=============================================');

  // List all stored covenant UTXOs
  const storedUtxos = covenantUtils.listCovenantUtxos();
  console.log('📋 Stored covenant UTXOs:', storedUtxos.length);

  storedUtxos.forEach((utxo, i) => {
    console.log(`- UTXO ${i + 1}:`);
    console.log(`  - TXID: ${utxo.txid}`);
    console.log(`  - Satoshis: ${utxo.satoshis}`);
    console.log(`  - Created: ${utxo.createdAt}`);
    console.log(`  - Status: ${utxo.status}`);
  });

  console.log('');

  console.log('Example 3: Spending Existing Covenant UTXO');
  console.log('==========================================');

  // Load and spend the most recent covenant UTXO
  if (storedUtxos.length > 0) {
    const latestUtxo = storedUtxos[storedUtxos.length - 1];
    console.log('🔓 Spending covenant UTXO:', latestUtxo.txid);

    const spendingTx = covenantUtils.createCovenantSpendingTx(latestUtxo);
    const validation = covenantUtils.validateCovenantTx(spendingTx, latestUtxo);

    console.log('- Spending TX:', spendingTx.id);
    console.log('- Valid:', validation.valid ? '✅ SUCCESS' : '❌ FAILED');
    console.log('- Error:', validation.error || 'none');

    if (validation.valid) {
      broadcastCallback(spendingTx, 'covenant spending');
    }
  }

  console.log('\n🎯 Production Integration Notes:');
  console.log('==============================');
  console.log('✅ P2PKH UTXOs: Fetch from WhatsOnChain API');
  console.log('✅ Script Reconstruction: Built-in with address');
  console.log('✅ Covenant Storage: Local JSON with custom scripts');
  console.log('✅ Broadcasting: Integrate with WhatsOnChain/other APIs');
  console.log('✅ Preimage Validation: Automatic with original preimage');
  console.log('✅ Signature Context: Proper covenant script signing');

} catch (error) {
  console.log('❌ Error:', error.message);
  console.log('Stack:', error.stack);
}