#!/usr/bin/env node

const bsv = require('./index.js');

// Test the exact static method call
const privateKey = new bsv.PrivateKey('L1aW4aubDFB7yfras2S1mN3bqg9nwySY8nkoLmJebSLD5BWv3ENZ');
const publicKey = privateKey.publicKey;
const message = Buffer.from('hello world', 'utf8');
const hash = bsv.crypto.Hash.sha256(message);

console.log('🔍 Debug Static ECDSA.verify Method');
console.log('===================================\n');

// Create signature
const signature = bsv.crypto.ECDSA.sign(hash, privateKey);
const derSig = signature.toDER();

console.log('Input data:');
console.log('- hash:', hash.toString('hex'));
console.log('- derSig:', derSig.toString('hex'));
console.log('- pubkey:', publicKey.toString());

// Test what type of object the static method expects for 'sig'
console.log('\n🧪 Testing Static Method Signature Types:');

// Test 1: Pass DER buffer directly
console.log('Test 1 - DER Buffer:');
try {
  const result1 = bsv.crypto.ECDSA.verify(hash, derSig, publicKey);
  console.log('Result:', result1);
} catch (e) {
  console.log('Error:', e.message);
}

// Test 2: Pass Signature object
console.log('\nTest 2 - Signature Object:');
try {
  const result2 = bsv.crypto.ECDSA.verify(hash, signature, publicKey);
  console.log('Result:', result2);
} catch (e) {
  console.log('Error:', e.message);
}

// Test 3: Parse DER to Signature first
console.log('\nTest 3 - Parsed Signature:');
try {
  const parsedSig = bsv.crypto.Signature.fromDER(derSig);
  const result3 = bsv.crypto.ECDSA.verify(hash, parsedSig, publicKey);
  console.log('Result:', result3);
} catch (e) {
  console.log('Error:', e.message);
}

// Test what the static method is actually doing
console.log('\n🔍 Manual Static Method Simulation:');
const ecdsa = new bsv.crypto.ECDSA();
ecdsa.set({
  hashbuf: hash,
  sig: derSig,  // This is what the static method does
  pubkey: publicKey
});

console.log('ECDSA object created with DER buffer');
console.log('sig type:', typeof ecdsa.sig);
console.log('sig is Buffer:', Buffer.isBuffer(ecdsa.sig));
console.log('sig has .r property:', ecdsa.sig && typeof ecdsa.sig.r !== 'undefined');

// The verify method calls sigError, so let's see what happens
console.log('\nCalling sigError() directly:');
try {
  const errorResult = ecdsa.sigError();
  console.log('sigError result:', errorResult);
} catch (e) {
  console.log('sigError threw:', e.message);
}