#!/usr/bin/env node

/**
 * 🔄 BSV UTXO Manager
 * 
 * Updates the wallet.json file with new UTXOs after transactions.
 * Tracks which UTXOs are spent and which are available for BSV development.
 */

const bsv = require('../index.js');
const fs = require('fs');
const path = require('path');

function loadConfig() {
  const configPath = path.join(__dirname, 'wallet.json');
  return JSON.parse(fs.readFileSync(configPath, 'utf8'));
}

function saveConfig(config) {
  const configPath = path.join(__dirname, 'wallet.json');
  fs.writeFileSync(configPath, JSON.stringify(config, null, 2));
  console.log('💾 Updated wallet.json');
}

function updateUTXOFromTransaction(tx, spentUTXO = null) {
  console.log('🔄 Updating UTXO set from transaction...\n');
  
  const config = loadConfig();
  
  console.log('📋 Transaction Analysis:');
  console.log(`Transaction ID: ${tx.id}`);
  console.log(`Inputs: ${tx.inputs.length}`);
  console.log(`Outputs: ${tx.outputs.length}\n`);
  
  // Mark spent UTXO
  if (spentUTXO) {
    console.log('❌ Spent UTXO:');
    console.log(`  TXID: ${spentUTXO.txid}`);
    console.log(`  Vout: ${spentUTXO.vout}`);
    console.log(`  Amount: ${spentUTXO.satoshis} satoshis\n`);
    
    // Add to spent UTXOs list
    if (!config.spentUTXOs) config.spentUTXOs = [];
    config.spentUTXOs.push({
      txid: spentUTXO.txid,
      vout: spentUTXO.vout,
      satoshis: spentUTXO.satoshis,
      spentInTx: tx.id,
      spentAt: new Date().toISOString()
    });
  }
  
  // Add new UTXOs from outputs
  const newUTXOs = [];
  
  for (let i = 0; i < tx.outputs.length; i++) {
    const output = tx.outputs[i];
    const outputAddress = output.script.toAddress();
    
    // Only track UTXOs that go to our wallet address
    if (outputAddress.toString() === config.wallet.address) {
      const newUTXO = {
        txid: tx.id,
        vout: i,
        outputIndex: i,
        script: output.script.toHex(),
        scriptPubKey: output.script.toHex(),
        satoshis: output.satoshis,
        address: outputAddress.toString(),
        createdAt: new Date().toISOString()
      };
      
      newUTXOs.push(newUTXO);
      
      console.log(`✅ New UTXO ${i}:`);
      console.log(`  TXID: ${newUTXO.txid}`);
      console.log(`  Vout: ${newUTXO.vout}`);
      console.log(`  Amount: ${newUTXO.satoshis} satoshis`);
      console.log(`  Address: ${newUTXO.address}`);
    }
  }
  
  // Update config with new UTXOs
  if (!config.availableUTXOs) config.availableUTXOs = [];
  config.availableUTXOs = config.availableUTXOs.concat(newUTXOs);
  
  // Update the main UTXO to the largest available UTXO
  if (newUTXOs.length > 0) {
    const largestUTXO = newUTXOs.reduce((max, utxo) => 
      utxo.satoshis > max.satoshis ? utxo : max
    );
    
    config.utxo = largestUTXO;
    console.log(`\n🎯 Primary UTXO updated to: ${largestUTXO.satoshis} satoshis`);
  }
  
  // Update metadata
  config.metadata.lastUpdated = new Date().toISOString();
  config.metadata.transactionCount = (config.metadata.transactionCount || 0) + 1;
  
  saveConfig(config);
  
  return {
    newUTXOs,
    totalValue: newUTXOs.reduce((sum, utxo) => sum + utxo.satoshis, 0),
    config
  };
}

function getAvailableBalance() {
  const config = loadConfig();
  
  const balance = config.availableUTXOs 
    ? config.availableUTXOs.reduce((sum, utxo) => sum + utxo.satoshis, 0)
    : config.utxo.satoshis;
    
  return balance;
}

function listUTXOs() {
  const config = loadConfig();
  
  console.log('💰 Current UTXO Set:');
  console.log('═══════════════════════════════════════════\n');
  
  console.log('🎯 Primary UTXO:');
  console.log(`  TXID: ${config.utxo.txid}`);
  console.log(`  Vout: ${config.utxo.vout}`);
  console.log(`  Amount: ${config.utxo.satoshis} satoshis\n`);
  
  if (config.availableUTXOs && config.availableUTXOs.length > 0) {
    console.log('📝 All Available UTXOs:');
    config.availableUTXOs.forEach((utxo, index) => {
      console.log(`  ${index + 1}. ${utxo.txid}:${utxo.vout} - ${utxo.satoshis} sats`);
    });
  }
  
  if (config.spentUTXOs && config.spentUTXOs.length > 0) {
    console.log('\n❌ Spent UTXOs:');
    config.spentUTXOs.forEach((utxo, index) => {
      console.log(`  ${index + 1}. ${utxo.txid}:${utxo.vout} - ${utxo.satoshis} sats (spent in ${utxo.spentInTx})`);
    });
  }
  
  const totalBalance = getAvailableBalance();
  console.log(`\n💰 Total Available Balance: ${totalBalance} satoshis`);
  
  return config;
}

// If called directly, list current UTXOs
if (require.main === module) {
  listUTXOs();
}

module.exports = {
  updateUTXOFromTransaction,
  getAvailableBalance,
  listUTXOs,
  loadConfig,
  saveConfig
};