#!/usr/bin/env node

/**
 * Test ECDSA.verify with 'little' endianness
 * 
 * Tests if adding 'little' parameter fixes ECDSA.verify too
 */

const bsv = require('./index.js');

console.log('🔍 Test ECDSA.verify with little endianness');
console.log('============================================\n');

// Simple signature test
const privateKey = new bsv.PrivateKey('L1aW4aubDFB7yfras2S1mN3bqg9nwySY8nkoLmJebSLD5BWv3ENZ');
const publicKey = privateKey.publicKey;
const message = Buffer.from('hello world', 'utf8');
const hash = bsv.crypto.Hash.sha256(message);

console.log('Creating signature...');
const signature = bsv.crypto.ECDSA.sign(hash, privateKey);
const derSig = signature.toDER();

console.log('\n🧪 ECDSA.verify Test Matrix:');
console.log('============================');

// Test without 'little'
const ecdsaWithoutLittle = bsv.crypto.ECDSA.verify(hash, signature, publicKey);
console.log(`ECDSA.verify(hash, sig, pubkey): ${ecdsaWithoutLittle ? '✅ VALID' : '❌ INVALID'}`);

// Test with 'little' 
const ecdsaWithLittle = bsv.crypto.ECDSA.verify(hash, signature, publicKey, 'little');
console.log(`ECDSA.verify(hash, sig, pubkey, 'little'): ${ecdsaWithLittle ? '✅ VALID' : '❌ INVALID'}`);

// Test with DER buffer without 'little'
const ecdsaDerWithoutLittle = bsv.crypto.ECDSA.verify(hash, derSig, publicKey);
console.log(`ECDSA.verify(hash, derSig, pubkey): ${ecdsaDerWithoutLittle ? '✅ VALID' : '❌ INVALID'}`);

// Test with DER buffer with 'little'
const ecdsaDerWithLittle = bsv.crypto.ECDSA.verify(hash, derSig, publicKey, 'little');
console.log(`ECDSA.verify(hash, derSig, pubkey, 'little'): ${ecdsaDerWithLittle ? '✅ VALID' : '❌ INVALID'}`);

console.log('\n🔍 Compare with SmartVerify:');
console.log('============================');

// Test SmartVerify 
const smartVerifyObj = bsv.SmartVerify.smartVerify(hash, signature, publicKey);
console.log(`SmartVerify(hash, sig, pubkey): ${smartVerifyObj ? '✅ VALID' : '❌ INVALID'}`);

const smartVerifyDer = bsv.SmartVerify.smartVerify(hash, derSig, publicKey);
console.log(`SmartVerify(hash, derSig, pubkey): ${smartVerifyDer ? '✅ VALID' : '❌ INVALID'}`);

console.log('\n🔧 Signature Details:');
console.log('=====================');
console.log(`Signature r: ${signature.r.toString('hex')}`);
console.log(`Signature s: ${signature.s.toString('hex')}`);
console.log(`Is canonical: ${signature.isCanonical()}`);

// Check if this is a canonicalization issue
const canonicalSig = signature.toCanonical();
console.log(`Canonical r: ${canonicalSig.r.toString('hex')}`);
console.log(`Canonical s: ${canonicalSig.s.toString('hex')}`);
console.log(`Same as original: ${signature.r.eq(canonicalSig.r) && signature.s.eq(canonicalSig.s)}`);

// Test with canonical signature
const ecdsaCanonical = bsv.crypto.ECDSA.verify(hash, canonicalSig, publicKey, 'little');
console.log(`ECDSA.verify(hash, canonicalSig, pubkey, 'little'): ${ecdsaCanonical ? '✅ VALID' : '❌ INVALID'}`);

const smartVerifyCanonical = bsv.SmartVerify.smartVerify(hash, canonicalSig, publicKey);
console.log(`SmartVerify(hash, canonicalSig, pubkey): ${smartVerifyCanonical ? '✅ VALID' : '❌ INVALID'}`);