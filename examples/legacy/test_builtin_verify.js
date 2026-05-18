#!/usr/bin/env node

/**
 * Test Transaction VerifySignature Method
 * 
 * Tests the transaction's built-in verifySignature method
 */

const bsv = require('./index.js');

console.log('🔍 Test Transaction VerifySignature Method');
console.log('==========================================\n');

const privateKey = new bsv.PrivateKey('L1aW4aubDFB7yfras2S1mN3bqg9nwySY8nkoLmJebSLD5BWv3ENZ');
const address = privateKey.toAddress().toString();

// Create and sign transaction
const mockUTXO = {
  txid: '1234567890abcdef1234567890abcdef1234567890abcdef1234567890abcdef',
  vout: 0,
  address: address,
  satoshis: 50000,
  script: bsv.Script.buildPublicKeyHashOut(address).toHex()
};

const transaction = new bsv.Transaction()
  .from(mockUTXO)
  .to(address, 100)
  .change(address)
  .feePerKb(10)
  .sign(privateKey);

console.log('✅ Transaction created and signed');
console.log(`Transaction ID: ${transaction.id}`);
console.log(`Basic verify(): ${transaction.verify()}`);

// Extract signature details
const input = transaction.inputs[0];
const signature = input.script.chunks[0]?.buf;
const publicKey = input.script.chunks[1]?.buf;

if (signature && publicKey) {
  console.log('\n🧪 Transaction VerifySignature Method Test:');
  console.log('==========================================');
  
  const sigWithoutHashtype = signature.slice(0, -1);
  const pubkeyObj = new bsv.PublicKey(publicKey);
  const subscript = input.output.script;
  const satoshisBN = new bsv.crypto.BN(input.output.satoshis);
  
  try {
    // Parse the signature first
    const parsedSig = bsv.crypto.Signature.fromDER(sigWithoutHashtype);
    parsedSig.nhashtype = signature[signature.length - 1]; // Set the hashtype
    
    console.log(`Parsed signature r: ${parsedSig.r.toString('hex')}`);
    console.log(`Parsed signature s: ${parsedSig.s.toString('hex')}`);
    console.log(`Signature hashtype: 0x${parsedSig.nhashtype.toString(16)}`);
    
    // Test transaction's built-in verifySignature method
    const builtinVerify = transaction.verifySignature(parsedSig, pubkeyObj, 0, subscript, satoshisBN);
    console.log(`transaction.verifySignature(): ${builtinVerify ? '✅ VALID' : '❌ INVALID'}`);
    
    // Test with default flags
    const builtinVerifyWithFlags = transaction.verifySignature(parsedSig, pubkeyObj, 0, subscript, satoshisBN, 
      bsv.Script.Interpreter.SCRIPT_ENABLE_SIGHASH_FORKID);
    console.log(`transaction.verifySignature() with flags: ${builtinVerifyWithFlags ? '✅ VALID' : '❌ INVALID'}`);
    
    console.log('\n🔍 Manual Sighash.verify Test:');
    console.log('==============================');
    
    // Test the Sighash.verify method directly
    const sighashVerify = bsv.Transaction.Sighash.verify(transaction, parsedSig, pubkeyObj, 0, subscript, satoshisBN);
    console.log(`Sighash.verify(): ${sighashVerify ? '✅ VALID' : '❌ INVALID'}`);
    
    const sighashVerifyWithFlags = bsv.Transaction.Sighash.verify(transaction, parsedSig, pubkeyObj, 0, subscript, satoshisBN,
      bsv.Script.Interpreter.SCRIPT_ENABLE_SIGHASH_FORKID);
    console.log(`Sighash.verify() with flags: ${sighashVerifyWithFlags ? '✅ VALID' : '❌ INVALID'}`);
    
    console.log('\n🔧 Compare Sighash Calculation:');
    console.log('===============================');
    
    // Get the sighash that Sighash.verify would calculate
    const officialSighash = bsv.Transaction.Sighash.sighash(
      transaction, 
      parsedSig.nhashtype, 
      0, 
      subscript, 
      satoshisBN,
      bsv.Script.Interpreter.SCRIPT_ENABLE_SIGHASH_FORKID
    );
    
    console.log(`Official Sighash.sighash(): ${officialSighash.toString('hex')}`);
    
    // Compare with our transaction.sighash method
    const ourSighash = transaction.sighash(0, parsedSig.nhashtype, subscript, satoshisBN);
    console.log(`Our transaction.sighash(): ${ourSighash.toString('hex')}`);
    console.log(`Sighashes match: ${officialSighash.equals(ourSighash) ? '✅ YES' : '❌ NO'}`);
    
    // Test verification with the official sighash
    console.log('\n🎯 Verification with Official Sighash:');
    console.log('=====================================');
    
    const ecdsaWithOfficial = bsv.crypto.ECDSA.verify(officialSighash, parsedSig, pubkeyObj);
    console.log(`ECDSA.verify(officialSighash): ${ecdsaWithOfficial ? '✅ VALID' : '❌ INVALID'}`);
    
    const smartVerifyWithOfficial = bsv.SmartVerify.smartVerify(officialSighash, parsedSig, pubkeyObj);
    console.log(`SmartVerify(officialSighash): ${smartVerifyWithOfficial ? '✅ VALID' : '❌ INVALID'}`);
    
  } catch (error) {
    console.log('❌ Test failed:', error.message);
    console.log('Stack:', error.stack);
  }
  
} else {
  console.log('❌ Could not extract signature or public key');
}