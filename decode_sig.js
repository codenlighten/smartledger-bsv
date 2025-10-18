const sig = '300602010002010001';
console.log('Hex:', sig);
const buf = Buffer.from(sig, 'hex');
console.log('Buffer:', buf);
console.log('DER structure:');
console.log('  0x30 (sequence):', buf[0].toString(16));
console.log('  Length:', buf[1]);
console.log('  0x02 (integer):', buf[2].toString(16));
console.log('  r length:', buf[3]);
console.log('  r value:', buf[4]);
console.log('  0x02 (integer):', buf[5].toString(16));
console.log('  s length:', buf[6]);
console.log('  s value:', buf[7]);
console.log('This signature has r=0, s=1 which should be rejected by our security patch!');

// Let's also test with our BSV fork
const bsv = require('./index.js');
try {
  const signature = bsv.crypto.Signature.fromDER(buf);
  console.log('Signature parsed:', signature);
} catch (error) {
  console.log('✅ Our security patch correctly rejected this invalid signature:', error.message);
}