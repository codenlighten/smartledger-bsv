const bsv = require('bsv');

console.log('BSV util keys:', Object.keys(bsv.util));
console.log('BSV errors available:', !!bsv.errors);

// Check if buffer util is available
console.log('BufferUtil available:', !!bsv.util.buffer);
console.log('Preconditions available:', !!bsv.util.preconditions);

// Try direct require
try {
  const BufferUtil = require('bsv/lib/util/buffer');
  console.log('Direct BufferUtil require works');
} catch (e) {
  console.log('Direct BufferUtil require failed:', e.message);
}

try {
  const $ = require('bsv/lib/util/preconditions');
  console.log('Direct preconditions require works');
} catch (e) {
  console.log('Direct preconditions require failed:', e.message);
}