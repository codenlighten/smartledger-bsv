#!/usr/bin/env node

const bsv = require('./index.js');

// Test the signature parsing and verification process
const privateKey = new bsv.PrivateKey('L1aW4aubDFB7yfras2S1mN3bqg9nwySY8nkoLmJebSLD5BWv3ENZ');
const publicKey = privateKey.publicKey;
const message = Buffer.from('hello world', 'utf8');
const hash = bsv.crypto.Hash.sha256(message);

console.log('🔍 Debug Signature Processing');
console.log('==============================\n');

// Create signature
const signature = bsv.crypto.ECDSA.sign(hash, privateKey);
console.log('Original signature r:', signature.r.toString(16));
console.log('Original signature s:', signature.s.toString(16));
console.log('Original signature is canonical:', signature.isCanonical());

// Get DER format
const derSig = signature.toDER();
console.log('DER length:', derSig.length);
console.log('DER hex:', derSig.toString('hex'));

// Parse DER back to signature
const parsedSig = bsv.crypto.Signature.fromDER(derSig);
console.log('Parsed signature r:', parsedSig.r.toString(16));
console.log('Parsed signature s:', parsedSig.s.toString(16));
console.log('Parsed signature is canonical:', parsedSig.isCanonical());

// Test direct ECDSA verification (bypassing DER)
console.log('\n📊 Direct Signature Verification:');
const directEcdsa = new bsv.crypto.ECDSA({
  hashbuf: hash,
  sig: signature,  // Use signature object directly
  pubkey: publicKey
});

const directError = directEcdsa.sigError();
console.log('Direct sigError result:', directError);
console.log('Direct verification:', !directError);

// Test DER-based verification
console.log('\n📊 DER-based Verification:');
const derEcdsa = new bsv.crypto.ECDSA({
  hashbuf: hash,
  sig: parsedSig,  // Use parsed signature
  pubkey: publicKey
});

const derError = derEcdsa.sigError();
console.log('DER sigError result:', derError);
console.log('DER verification:', !derError);

// Compare r,s values
console.log('\n🔄 Signature Comparison:');
console.log('Original r equals parsed r:', signature.r.cmp(parsedSig.r) === 0);
console.log('Original s equals parsed s:', signature.s.cmp(parsedSig.s) === 0);