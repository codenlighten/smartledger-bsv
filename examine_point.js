const bsv = require('bsv');
const BN = bsv.crypto.BN;

console.log('=== BSV Point Analysis (Fixed) ===');

const Point = bsv.crypto.Point;
const n = Point.getN();
console.log('n =', n.toString(16));

// Calculate n/2 correctly
const nh = n.shrn(1); // Right shift by 1 (divide by 2)
console.log('nh (n/2) =', nh.toString(16));

// Verify the calculation
console.log('nh * 2 should equal n:', nh.shln(1).eq(n));

// Check if BN methods we need exist
console.log('\n=== BN Methods Analysis ===');
const testBN = new BN(42);
console.log('BN.isZero exists:', typeof testBN.isZero === 'function');
console.log('BN.gte exists:', typeof testBN.gte === 'function');
console.log('BN.gt exists:', typeof testBN.gt === 'function');
console.log('BN.lt exists:', typeof testBN.lt === 'function');
console.log('BN.lte exists:', typeof testBN.lte === 'function');
console.log('BN.sub exists:', typeof testBN.sub === 'function');

// Test signature and ECDSA structure
console.log('\n=== ECDSA/Signature Analysis ===');
const ECDSA = bsv.crypto.ECDSA;
const Signature = bsv.crypto.Signature;

console.log('ECDSA.verify type:', typeof ECDSA.verify);
console.log('Signature.prototype methods:', Object.getOwnPropertyNames(Signature.prototype));