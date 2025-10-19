#!/usr/bin/env node

/**
 * Debug Signature Hash Matching
 * 
 * This script tests whether the sighash we calculate matches
 * what was actually used to create the transaction signature.
 */

const bsv = require('./index.js');

console.log('🔍 Debug Signature Hash Matching');
console.log('=================================\n');

const privateKey = new bsv.PrivateKey('L1aW4aubDFB7yfras2S1mN3bqg9nwySY8nkoLmJebSLD5BWv3ENZ');
const address = privateKey.toAddress().toString();

// Create mock UTXO
const mockUTXO = {
  txid: '1234567890abcdef1234567890abcdef1234567890abcdef1234567890abcdef',
  vout: 0,
  address: address,
  satoshis: 50000,
  script: bsv.Script.buildPublicKeyHashOut(address).toHex()
};

console.log('Creating transaction...');
const transaction = new bsv.Transaction()
  .from(mockUTXO)
  .to(address, 100)
  .change(address)
  .feePerKb(10);

console.log('✅ Transaction created (unsigned)');
console.log(`Transaction ID (unsigned): ${transaction.id}`);

// Now let's manually sign and see what signature hash is used
console.log('\n🔐 Manual Signing Process:');
console.log('==========================');

const input = transaction.inputs[0];
const subscript = input.output.script;
const satoshisBN = new bsv.crypto.BN(input.output.satoshis);

// Calculate the signature hash BEFORE signing
const sigHashType = bsv.crypto.Signature.SIGHASH_ALL | bsv.crypto.Signature.SIGHASH_FORKID;
const preSignSighash = transaction.sighash(0, sigHashType, subscript, satoshisBN);

console.log(`Pre-sign sighash: ${preSignSighash.toString('hex')}`);
console.log(`Subscript: ${subscript.toHex()}`);
console.log(`Satoshis: ${satoshisBN.toString()}`);

// Now sign the transaction
transaction.sign(privateKey);

console.log('✅ Transaction signed');
console.log(`Transaction ID (signed): ${transaction.id}`);

// Calculate the signature hash AFTER signing
const postSignSighash = transaction.sighash(0, sigHashType, subscript, satoshisBN);
console.log(`Post-sign sighash: ${postSignSighash.toString('hex')}`);

// Extract the signature from the signed transaction
const signedInput = transaction.inputs[0];
const signature = signedInput.script.chunks[0]?.buf;
const publicKey = signedInput.script.chunks[1]?.buf;

if (signature && publicKey) {
  const sigBuffer = signature.slice(0, -1); // Remove sighash flag
  const sigHashFlag = signature[signature.length - 1];
  const pubkeyObj = new bsv.PublicKey(publicKey);
  
  console.log(`\nSignature Details:`);
  console.log(`- Full signature length: ${signature.length}`);
  console.log(`- Signature (no flag): ${sigBuffer.toString('hex')}`);
  console.log(`- Sighash flag: 0x${sigHashFlag.toString(16)}`);
  console.log(`- Expected flag: 0x${sigHashType.toString(16)}`);
  console.log(`- Public key: ${pubkeyObj.toString()}`);
  
  console.log('\n🧪 Verification Tests:');
  console.log('======================');
  
  // Test 1: Verify with pre-sign sighash
  const preSignValid = bsv.SmartVerify.smartVerify(preSignSighash, sigBuffer, pubkeyObj);
  console.log(`Pre-sign hash verification: ${preSignValid ? '✅ VALID' : '❌ INVALID'}`);
  
  // Test 2: Verify with post-sign sighash 
  const postSignValid = bsv.SmartVerify.smartVerify(postSignSighash, sigBuffer, pubkeyObj);
  console.log(`Post-sign hash verification: ${postSignValid ? '✅ VALID' : '❌ INVALID'}`);
  
  // Test 3: Let's try to manually recreate the signature hash that was used for signing
  console.log('\n🔧 Manual Signature Hash Recreation:');
  console.log('====================================');
  
  // The signature was created during the .sign() process, let's see what hash was used
  // We can check by looking at how BSV creates signatures internally
  
  const manualSighash = bsv.Transaction.Sighash.sighash(
    transaction, 
    sigHashType, 
    0, 
    subscript, 
    satoshisBN
  );
  
  console.log(`Manual sighash: ${manualSighash.toString('hex')}`);
  
  const manualValid = bsv.SmartVerify.smartVerify(manualSighash, sigBuffer, pubkeyObj);
  console.log(`Manual hash verification: ${manualValid ? '✅ VALID' : '❌ INVALID'}`);
  
  // Test 4: Standard ECDSA verification for comparison
  const ecdsaValid = bsv.crypto.ECDSA.verify(manualSighash, sigBuffer, pubkeyObj);
  console.log(`ECDSA verification: ${ecdsaValid ? '✅ VALID' : '❌ INVALID'}`);
  
  console.log('\n📊 Hash Comparison:');
  console.log('==================');
  console.log(`Pre-sign : ${preSignSighash.toString('hex')}`);
  console.log(`Post-sign: ${postSignSighash.toString('hex')}`);
  console.log(`Manual   : ${manualSighash.toString('hex')}`);
  console.log(`All match: ${preSignSighash.equals(postSignSighash) && postSignSighash.equals(manualSighash) ? '✅ YES' : '❌ NO'}`);
  
} else {
  console.log('❌ Could not extract signature or public key from transaction');
}