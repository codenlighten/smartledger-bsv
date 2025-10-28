#!/usr/bin/env node

/**
 * Debug Signature Parsing
 * 
 * Tests if the signature we extract from the transaction is properly formatted
 */

const bsv = require('./index.js');

console.log('🔍 Debug Signature Parsing');
console.log('===========================\n');

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

// Extract signature details
const input = transaction.inputs[0];
const signature = input.script.chunks[0]?.buf;
const publicKey = input.script.chunks[1]?.buf;

if (signature && publicKey) {
  console.log('\n📋 Raw Signature Analysis:');
  console.log('===========================');
  
  console.log(`Full signature: ${signature.toString('hex')}`);
  console.log(`Signature length: ${signature.length}`);
  console.log(`Last byte (sighash): 0x${signature[signature.length - 1].toString(16)}`);
  
  const sigWithoutHashtype = signature.slice(0, -1);
  console.log(`Signature without hashtype: ${sigWithoutHashtype.toString('hex')}`);
  console.log(`Length without hashtype: ${sigWithoutHashtype.length}`);
  
  console.log('\n🔍 DER Signature Parsing:');
  console.log('=========================');
  
  try {
    // Try to parse the signature (without hashtype) as DER
    const parsedSig = bsv.crypto.Signature.fromDER(sigWithoutHashtype);
    console.log('✅ DER parsing successful');
    console.log(`Parsed r: ${parsedSig.r.toString('hex')}`);
    console.log(`Parsed s: ${parsedSig.s.toString('hex')}`);
    console.log(`Is canonical (parsed): ${parsedSig.isCanonical()}`);
    
    // Test verification with the parsed signature object
    const sigHashType = bsv.crypto.Signature.SIGHASH_ALL | bsv.crypto.Signature.SIGHASH_FORKID;
    const subscript = input.output.script;
    const satoshisBN = new bsv.crypto.BN(input.output.satoshis);
    const sighash = transaction.sighash(0, sigHashType, subscript, satoshisBN);
    const pubkeyObj = new bsv.PublicKey(publicKey);
    
    console.log('\n🧪 Verification with Parsed Signature:');
    console.log('======================================');
    
    // Test with signature object instead of buffer
    const verifyWithObject = bsv.crypto.ECDSA.verify(sighash, parsedSig, pubkeyObj);
    console.log(`ECDSA.verify(hash, sigObject, pubkey): ${verifyWithObject ? '✅ VALID' : '❌ INVALID'}`);
    
    // Test SmartVerify with signature object
    const smartVerifyWithObject = bsv.SmartVerify.smartVerify(sighash, parsedSig, pubkeyObj);
    console.log(`SmartVerify(hash, sigObject, pubkey): ${smartVerifyWithObject ? '✅ VALID' : '❌ INVALID'}`);
    
    // Test with DER buffer
    const verifyWithBuffer = bsv.crypto.ECDSA.verify(sighash, sigWithoutHashtype, pubkeyObj);
    console.log(`ECDSA.verify(hash, sigBuffer, pubkey): ${verifyWithBuffer ? '✅ VALID' : '❌ INVALID'}`);
    
    // Test SmartVerify with DER buffer
    const smartVerifyWithBuffer = bsv.SmartVerify.smartVerify(sighash, sigWithoutHashtype, pubkeyObj);
    console.log(`SmartVerify(hash, sigBuffer, pubkey): ${smartVerifyWithBuffer ? '✅ VALID' : '❌ INVALID'}`);
    
  } catch (error) {
    console.log('❌ DER parsing failed:', error.message);
  }
  
  console.log('\n🔧 Manual Signature Creation Test:');
  console.log('==================================');
  
  // Let's create a signature manually and see if it matches
  const sigHashType = bsv.crypto.Signature.SIGHASH_ALL | bsv.crypto.Signature.SIGHASH_FORKID;
  const subscript = input.output.script;
  const satoshisBN = new bsv.crypto.BN(input.output.satoshis);
  const sighash = transaction.sighash(0, sigHashType, subscript, satoshisBN);
  
  console.log(`Sighash for manual test: ${sighash.toString('hex')}`);
  
  // Create signature manually
  const manualSig = bsv.crypto.ECDSA.sign(sighash, privateKey);
  console.log(`Manual signature r: ${manualSig.r.toString('hex')}`);
  console.log(`Manual signature s: ${manualSig.s.toString('hex')}`);
  
  const manualDER = manualSig.toDER();
  console.log(`Manual DER: ${manualDER.toString('hex')}`);
  console.log(`Transaction DER: ${sigWithoutHashtype.toString('hex')}`);
  console.log(`DER matches: ${manualDER.equals(sigWithoutHashtype) ? '✅ YES' : '❌ NO'}`);
  
  // Test manual signature verification
  const manualVerify = bsv.crypto.ECDSA.verify(sighash, manualSig, privateKey.publicKey);
  console.log(`Manual signature verifies: ${manualVerify ? '✅ VALID' : '❌ INVALID'}`);
  
  const manualSmartVerify = bsv.SmartVerify.smartVerify(sighash, manualSig, privateKey.publicKey);
  console.log(`Manual SmartVerify: ${manualSmartVerify ? '✅ VALID' : '❌ INVALID'}`);
  
} else {
  console.log('❌ Could not extract signature or public key');
}