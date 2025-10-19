#!/usr/bin/env node

/**
 * Simple Real BSV Transaction Test
 * 
 * Uses only real UTXOs to create and broadcast a transaction
 */

const bsv = require('./index.js');
const https = require('https');

console.log('🚀 Simple Real BSV Transaction Test');
console.log('===================================\n');

const privateKey = new bsv.PrivateKey('L1aW4aubDFB7yfras2S1mN3bqg9nwySY8nkoLmJebSLD5BWv3ENZ');
const address = privateKey.toAddress().toString();

console.log(`Address: ${address}`);
console.log(`Private Key: ${privateKey.toString()}\n`);

// Simple API call
function makeRequest(url) {
  return new Promise((resolve, reject) => {
    https.get(url, (res) => {
      let data = '';
      res.on('data', chunk => data += chunk);
      res.on('end', () => {
        try {
          resolve(JSON.parse(data));
        } catch (error) {
          reject(new Error(`Failed to parse response: ${error.message}`));
        }
      });
    }).on('error', reject);
  });
}

async function createSimpleTransaction() {
  try {
    // Get real UTXO
    console.log('🔍 Fetching real UTXO...');
    const utxos = await makeRequest(`https://api.whatsonchain.com/v1/bsv/main/address/${address}/unspent`);
    
    if (utxos.length === 0) {
      throw new Error('No UTXOs found');
    }
    
    const utxo = utxos[0]; // Use the first UTXO
    console.log(`Found UTXO: ${utxo.tx_hash}:${utxo.tx_pos} = ${utxo.value} sats`);
    
    // Create P2PKH script for the UTXO
    const addr = bsv.Address.fromString(address);
    const p2pkhScript = bsv.Script.buildPublicKeyHashOut(address);
    
    // Format UTXO for BSV transaction
    const formattedUTXO = {
      txid: utxo.tx_hash,
      vout: utxo.tx_pos,
      address: address,
      satoshis: utxo.value,
      script: p2pkhScript.toHex()
    };
    
    console.log(`UTXO Script: ${p2pkhScript.toHex()}`);
    
    // Create transaction - send smaller amount since we now have the result of previous tx
    const sendAmount = Math.min(500, Math.floor(utxo.value * 0.8)); // Send 80% or 500 sats, whichever is smaller
    const feePerKb = 10; // 10 sats per KB
    
    // Estimate transaction size (typical P2PKH transaction is ~225 bytes)
    const estimatedSize = 225; 
    const fee = Math.ceil((estimatedSize * feePerKb) / 1000);
    const changeAmount = utxo.value - sendAmount - fee;
    
    if (changeAmount < 0) {
      throw new Error(`Insufficient funds. Need ${sendAmount + fee}, have ${utxo.value}`);
    }
    
    console.log(`\n💸 Creating transaction:`);
    console.log(`Send: ${sendAmount} sats`);
    console.log(`Fee rate: ${feePerKb} sats/KB`);
    console.log(`Estimated fee: ${fee} sats`);
    console.log(`Change: ${changeAmount} sats`);
    
    const transaction = new bsv.Transaction()
      .from(formattedUTXO)
      .to(address, sendAmount) // Send to ourselves
      .change(address) // Change back to ourselves
      .feePerKb(feePerKb) // Set fee rate
      .sign(privateKey);
    
    console.log(`\n✅ Transaction created successfully!`);
    console.log(`Transaction ID: ${transaction.id}`);
    console.log(`Transaction size: ${transaction.toBuffer().length} bytes`);
    
    // Validation
    console.log(`\n🔍 Validation:`);
    const isValid = transaction.verify();
    console.log(`Basic BSV validation: ${isValid ? '✅ VALID' : '❌ INVALID'}`);
    
    if (isValid) {
      console.log(`Raw transaction: ${transaction.toString()}`);
      
      // Test broadcast
      if (process.argv.includes('--broadcast')) {
        console.log('\n📡 Broadcasting transaction...');
        
        try {
          const response = await fetch('https://api.whatsonchain.com/v1/bsv/main/tx/raw', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ txhex: transaction.toString() })
          });
          
          if (response.ok) {
            const result = await response.text();
            console.log(`✅ Transaction broadcast successful!`);
            console.log(`Transaction ID: ${result}`);
          } else {
            const error = await response.text();
            console.log(`❌ Broadcast failed: ${response.status} "${error}"`);
          }
        } catch (error) {
          console.log(`❌ Broadcast failed: ${error.message}`);
        }
      } else {
        console.log('\n💡 To broadcast: node simple_real_tx.js --broadcast');
      }
    }
    
  } catch (error) {
    console.log(`❌ Error: ${error.message}`);
  }
}

createSimpleTransaction();