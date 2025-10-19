#!/usr/bin/env node

/**
 * Test SmartVerify DER Buffer Handling
 * 
 * Tests SmartVerify with different input types to isolate the DER parsing issue
 */

const bsv = require('./index.js');

console.log('🔍 Test SmartVerify DER Buffer Handling');
console.log('=======================================\n');

// Simple signature test like minimal reproduction
const privateKey = new bsv.PrivateKey('L1aW4aubDFB7yfras2S1mN3bqg9nwySY8nkoLmJebSLD5BWv3ENZ');
const publicKey = privateKey.publicKey;
const message = Buffer.from('hello world', 'utf8');
const hash = bsv.crypto.Hash.sha256(message);

console.log('Creating signature...');
const signature = bsv.crypto.ECDSA.sign(hash, privateKey);
const derSig = signature.toDER();

console.log(`Original signature r: ${signature.r.toString('hex')}`);
console.log(`Original signature s: ${signature.s.toString('hex')}`);
console.log(`DER buffer: ${derSig.toString('hex')}`);
console.log(`DER length: ${derSig.length}`);

console.log('\n🧪 SmartVerify Test Matrix:');
console.log('===========================');

// Test 1: Signature object
const smartVerifyObj = bsv.SmartVerify.smartVerify(hash, signature, publicKey);
console.log(`SmartVerify(hash, sigObject, pubkey): ${smartVerifyObj ? '✅ VALID' : '❌ INVALID'}`);

// Test 2: DER buffer
const smartVerifyBuffer = bsv.SmartVerify.smartVerify(hash, derSig, publicKey);
console.log(`SmartVerify(hash, derBuffer, pubkey): ${smartVerifyBuffer ? '✅ VALID' : '❌ INVALID'}`);

// Test 3: Manually parsed DER
try {
  const parsedFromDER = bsv.crypto.Signature.fromDER(derSig);
  console.log(`Parsed from DER r: ${parsedFromDER.r.toString('hex')}`);
  console.log(`Parsed from DER s: ${parsedFromDER.s.toString('hex')}`);
  
  const smartVerifyParsed = bsv.SmartVerify.smartVerify(hash, parsedFromDER, publicKey);
  console.log(`SmartVerify(hash, parsedSig, pubkey): ${smartVerifyParsed ? '✅ VALID' : '❌ INVALID'}`);
  
  console.log('\n🔍 Compare r,s values:');
  console.log('======================');
  console.log(`Original r: ${signature.r.toString('hex')}`);
  console.log(`Parsed r  : ${parsedFromDER.r.toString('hex')}`);
  console.log(`r matches : ${signature.r.eq(parsedFromDER.r) ? '✅ YES' : '❌ NO'}`);
  
  console.log(`Original s: ${signature.s.toString('hex')}`);
  console.log(`Parsed s  : ${parsedFromDER.s.toString('hex')}`);  
  console.log(`s matches : ${signature.s.eq(parsedFromDER.s) ? '✅ YES' : '❌ NO'}`);
  
} catch (error) {
  console.log(`❌ DER parsing failed: ${error.message}`);
}

console.log('\n🔧 Debug SmartVerify DER Parsing:');
console.log('==================================');

// Let's manually step through what SmartVerify does with DER buffers
try {
  console.log('Step 1: Input validation...');
  console.log(`  Hash is Buffer: ${Buffer.isBuffer(hash)}`);
  console.log(`  Hash length: ${hash.length}`);
  console.log(`  DER is Buffer: ${Buffer.isBuffer(derSig)}`);
  
  console.log('Step 2: DER parsing in SmartVerify...');
  
  // This replicates what SmartVerify does internally
  const Signature = bsv.crypto.Signature;
  const testParsed = Signature.fromDER(derSig);
  console.log(`  Parsed successfully: ✅`);
  console.log(`  Parsed r: ${testParsed.r.toString('hex')}`);
  console.log(`  Parsed s: ${testParsed.s.toString('hex')}`);
  
  const BN = bsv.crypto.BN;
  const r = BN.isBN(testParsed.r) ? testParsed.r : new BN(testParsed.r);
  const s = BN.isBN(testParsed.s) ? testParsed.s : new BN(testParsed.s);
  console.log(`  r as BN: ${r.toString('hex')}`);
  console.log(`  s as BN: ${s.toString('hex')}`);
  
  // Check canonicalization  
  const Point = bsv.crypto.Point;
  const n = Point.getN();
  const nh = n.shrn(1);
  console.log(`  s > n/2: ${s.gt(nh)}`);
  
  const canonicalS = s.gt(nh) ? n.sub(s) : s;
  console.log(`  canonical s: ${canonicalS.toString('hex')}`);
  
  // Test final ECDSA call
  const canonicalSig = new Signature({
    r: r,
    s: canonicalS
  });
  
  const ECDSA = bsv.crypto.ECDSA;
  const finalResult = ECDSA.verify(hash, canonicalSig, publicKey, 'little');
  console.log(`  Final ECDSA result: ${finalResult ? '✅ VALID' : '❌ INVALID'}`);
  
} catch (error) {
  console.log(`❌ Debug failed: ${error.message}`);
  console.log(`Stack: ${error.stack}`);
}