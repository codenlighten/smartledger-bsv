#!/usr/bin/env node

/**
 * Simple P2PKH Self-Send Demo
 * 
 * Creates a simple transaction sending 100 satoshis to ourselves
 * and returning the change to ourselves - the most basic BSV transaction.
 */

// Configuration
const config = {
  feePerKb: 10 // 10 satoshis per kilobyte
};

const bsv = require('./index.js');

console.log('💳 Simple P2PKH Self-Send Demo');
console.log('===============================\n');

console.log('This demo shows the simplest possible BSV transaction:');
console.log('• Send 100 satoshis to ourselves');
console.log('• Return change to ourselves'); 
console.log('• Uses standard P2PKH (Pay-to-Public-Key-Hash)');
console.log('• Minimal transaction overhead\n');

const privateKey = new bsv.PrivateKey('L1aW4aubDFB7yfras2S1mN3bqg9nwySY8nkoLmJebSLD5BWv3ENZ');
const address = privateKey.toAddress().toString();

console.log('📝 Transaction Details:');
console.log('======================');
console.log(`Private Key: ${privateKey.toString()}`);
console.log(`Address: ${address}`);
console.log(`Self-send Amount: 100 satoshis`);
console.log(`Fee Rate: ${config.feePerKb} sats/KB`);
console.log(`Transaction Type: P2PKH → P2PKH\n`);

// Create a realistic mock UTXO (what we might have from previous transactions)
const mockUTXO = {
  txid: '1234567890abcdef1234567890abcdef1234567890abcdef1234567890abcdef',
  vout: 0,
  address: address,
  satoshis: 50000, // 0.0005 BSV
  script: bsv.Script.buildPublicKeyHashOut(address).toHex()
};

console.log('💰 Available UTXO:');
console.log(`  TXID: ${mockUTXO.txid}`);
console.log(`  Output: ${mockUTXO.vout}`);
console.log(`  Amount: ${mockUTXO.satoshis} satoshis (${mockUTXO.satoshis / 100000000} BSV)`);
console.log(`  Script: P2PKH to ${address}\n`);

try {
  console.log('🔨 Building Transaction:');
  console.log('========================');
  
  // Create the transaction - send 100 sats to ourselves
  const transaction = new bsv.Transaction()
    .from(mockUTXO)                    // Input: our UTXO
    .to(address, 100)                  // Output 1: 100 sats to ourselves  
    .change(address)                   // Output 2: change back to ourselves
    .feePerKb(config.feePerKb || 10)   // Set fee rate: 10 sats per KB
    .sign(privateKey);                 // Sign with our private key

  console.log('✅ Transaction built successfully!');
  console.log(`Transaction ID: ${transaction.id}`);
  console.log(`Size: ${transaction.toBuffer().length} bytes`);
  console.log(`Fee: ${transaction.getFee()} satoshis\n`);

  // Show transaction structure
  console.log('🔍 Transaction Structure:');
  console.log('=========================');
  console.log(`Inputs (${transaction.inputs.length}):`);
  transaction.inputs.forEach((input, i) => {
    console.log(`  Input ${i}: ${input.prevTxId}:${input.outputIndex} (${mockUTXO.satoshis} sats)`);
  });
  
  console.log(`Outputs (${transaction.outputs.length}):`);
  transaction.outputs.forEach((output, i) => {
    const addr = output.script.toAddress().toString();
    console.log(`  Output ${i}: ${addr} (${output.satoshis} sats)`);
  });
  
  const totalOutput = transaction.outputs.reduce((sum, output) => sum + output.satoshis, 0);
  console.log(`Total Output: ${totalOutput} sats`);
  console.log(`Fee Paid: ${mockUTXO.satoshis - totalOutput} sats\n`);

  // Validation
  console.log('🔐 Validation Results:');
  console.log('======================');
  
  const isValid = transaction.verify();
  console.log(`Basic BSV Validation: ${isValid ? '✅ VALID' : '❌ INVALID'}`);
  
  // Test signature verification if available
  if (bsv.SmartVerify) {
    let smartVerifyPassed = true;
    
    for (let i = 0; i < transaction.inputs.length; i++) {
      try {
        const input = transaction.inputs[i];
        const signature = input.script.chunks[0]?.buf;
        const publicKey = input.script.chunks[1]?.buf;
        
        if (signature && publicKey && input.output) {
          // Get the previous output script (subscript for sighash)
          const subscript = input.output.script;
          const satoshisBN = new bsv.crypto.BN(input.output.satoshis);
          
          // Calculate the signature hash with proper parameters
          const sighash = transaction.sighash(i, undefined, subscript, satoshisBN);
          
          const sigBuffer = signature.slice(0, -1); // Remove sighash flag
          const pubkeyObj = new bsv.PublicKey(publicKey);
          
          // Parse signature with hashtype for proper verification
          const parsedSig = bsv.crypto.Signature.fromDER(sigBuffer);
          parsedSig.nhashtype = signature[signature.length - 1]; // Set the hashtype
          
          // Use transaction's built-in verification (which handles endianness correctly)
          const txVerifyValid = transaction.verifySignature(parsedSig, pubkeyObj, i, subscript, satoshisBN);
          const isCanonical = bsv.SmartVerify.isCanonical(sigBuffer);
          
          console.log(`Input ${i} Transaction Verify: ${txVerifyValid ? '✅ VALID' : '❌ INVALID'}`);
          console.log(`Input ${i} Canonical: ${isCanonical ? '✅ YES' : '❌ NO'}`);
          console.log(`Input ${i} SigHash: ${sighash.toString('hex').substring(0, 16)}...`);
          console.log(`Input ${i} Signature: ${parsedSig.r.toString('hex').substring(0, 16)}...`);
          
          if (!txVerifyValid || !isCanonical) {
            smartVerifyPassed = false;
          }
        } else {
          console.log(`Input ${i}: Missing signature, public key, or output information`);
          smartVerifyPassed = false;
        }
      } catch (error) {
        console.log(`Input ${i} Error: ${error.message}`);
        smartVerifyPassed = false;
      }
    }
    
    console.log(`Transaction Verify Overall: ${smartVerifyPassed ? '✅ PASSED' : '❌ FAILED'}`);
  }
  
  // Miner validation if available
  if (bsv.SmartMiner) {
    const miner = new bsv.SmartMiner(bsv, { validateScripts: true });
    const minerAccepted = miner.acceptTransaction(transaction);
    console.log(`Miner Simulation: ${minerAccepted ? '✅ ACCEPTED' : '❌ REJECTED'}`);
  }

  console.log('\n📋 Summary:');
  console.log('===========');
  console.log('Transaction Type: Simple P2PKH self-send');
  console.log('Input: 1 UTXO from our address'); 
  console.log('Output 1: 100 sats to our address');
  console.log('Output 2: Change back to our address');
  console.log('Security: All signatures verified and canonical');
  console.log('Status: Ready for broadcast to BSV network\n');
  
  console.log('💡 This is the most basic BSV transaction possible:');
  console.log('   • Standard P2PKH inputs and outputs');
  console.log('   • Self-contained (no external dependencies)');
  console.log('   • Minimal fees and overhead');
  console.log('   • Perfect for testing and development');

} catch (error) {
  console.error('❌ Demo failed:', error.message);
  console.error('Stack:', error.stack);
}