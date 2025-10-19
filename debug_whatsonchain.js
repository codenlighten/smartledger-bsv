#!/usr/bin/env node

/**
 * Debug WhatsOnChain UTXO Fetching
 */

const bsv = require('./index.js');

console.log('🔍 Debug WhatsOnChain UTXO Fetching');
console.log('===================================\n');

const address = '11gECtvDapMj5ZuwpvnP6Wv9MTRGxnFRs';

// Test the P2PKH script generation
console.log('Testing P2PKH Script Generation:');
try {
  const addr = bsv.Address.fromString(address);
  console.log(`Address hash buffer: ${addr.hashBuffer.toString('hex')}`);
  const p2pkhScript = `76a914${addr.hashBuffer.toString('hex')}88ac`;
  console.log(`Generated P2PKH script: ${p2pkhScript}`);
  
  // Test with BSV Script builder
  const script = bsv.Script.buildPublicKeyHashOut(address);
  console.log(`BSV Script builder result: ${script.toHex()}`);
  console.log(`Scripts match: ${p2pkhScript === script.toHex()}`);
} catch (error) {
  console.log(`❌ Script generation error: ${error.message}`);
}

// Test direct API call
console.log('\n🌐 Direct API Test:');

const https = require('https');

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

async function testAPI() {
  try {
    const url = `https://api.whatsonchain.com/v1/bsv/main/address/${address}/unspent`;
    console.log(`Fetching: ${url}`);
    
    const utxos = await makeRequest(url);
    console.log(`Raw response: ${JSON.stringify(utxos, null, 2)}`);
    
    console.log('\nProcessed UTXOs:');
    const processed = utxos.map(utxo => {
      const addr = bsv.Address.fromString(address);
      const p2pkhScript = `76a914${addr.hashBuffer.toString('hex')}88ac`;
      
      return {
        txid: utxo.tx_hash,
        vout: utxo.tx_pos,
        address: address,
        satoshis: utxo.value,
        script: utxo.script || p2pkhScript,
        height: utxo.height
      };
    });
    
    console.log(JSON.stringify(processed, null, 2));
    console.log(`\nProcessed ${processed.length} UTXOs`);
    
  } catch (error) {
    console.log(`❌ API test failed: ${error.message}`);
  }
}

testAPI();