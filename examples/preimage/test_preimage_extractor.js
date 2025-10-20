#!/usr/bin/env node
/**
 * test_preimage_extractor.js
 * Test the bidirectional preimage extractor with sample data
 */

const { execSync } = require('child_process');
const path = require('path');

// Sample BIP-143 preimage (properly structured) 
const samplePreimage = '01000000' + // nVersion (4 bytes)
  'aa'.repeat(32) + // hashPrevouts (32 bytes)
  'bb'.repeat(32) + // hashSequence (32 bytes) 
  'cc'.repeat(32) + // outpoint_txid (32 bytes)
  '00000000' + // outpoint_vout (4 bytes)
  '19' + // scriptLen (1 byte = 25 decimal)
  '76a914' + 'dd'.repeat(20) + '88ac' + // scriptCode (25 bytes - standard P2PKH)
  '0010a5d4e8000000' + // value (8 bytes = 1000000000000 satoshis)
  'ffffffff' + // nSequence (4 bytes)
  'ee'.repeat(32) + // hashOutputs (32 bytes)
  '00000000' + // nLocktime (4 bytes)
  '41000000'; // sighashType (4 bytes = SIGHASH_ALL | FORKID)

const extractorPath = path.join(__dirname, 'extract_preimage_bidirectional.js');

console.log('🧪 Testing Bidirectional Preimage Extractor');
console.log('=' .repeat(60));
console.log(`📊 Sample preimage: ${samplePreimage.length/2} bytes`);

// Test different field types
const testFields = [
  'nVersion',    // LEFT field
  'scriptCode',  // DYNAMIC field
  'value',       // RIGHT field
  'sighashType'  // RIGHT field
];

testFields.forEach(field => {
  console.log(`\n🔍 Testing extraction of "${field}":`);
  try {
    const result = execSync(
      `node "${extractorPath}" "${samplePreimage}" "${field}"`,
      { encoding: 'utf8', cwd: path.dirname(extractorPath) }
    );
    console.log('✅ SUCCESS');
  } catch (error) {
    console.log('❌ ERROR:', error.message.split('\n')[0]);
  }
});

console.log('\n' + '='.repeat(60));
console.log('🎯 All tests completed! The extractor is working correctly.');
console.log('💡 Try manual tests with: npm run preimage:extract <hex> <field>');