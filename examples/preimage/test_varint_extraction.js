#!/usr/bin/env node
/**
 * test_varint_extraction.js
 * Test CompactSize varint extraction with various sizes
 */

const { execSync } = require('child_process');
const path = require('path');

// Create test preimages with different varint sizes
const createTestPreimage = (scriptSize) => {
  let scriptLen;
  
  if (scriptSize < 253) {
    // 1-byte encoding
    scriptLen = Buffer.from([scriptSize]);
  } else if (scriptSize <= 65535) {
    // 3-byte encoding: 0xFD + 2-byte little-endian
    scriptLen = Buffer.from([0xfd, scriptSize & 0xff, (scriptSize >> 8) & 0xff]);
  } else {
    // 5-byte encoding: 0xFE + 4-byte little-endian
    scriptLen = Buffer.from([
      0xfe, 
      scriptSize & 0xff, 
      (scriptSize >> 8) & 0xff, 
      (scriptSize >> 16) & 0xff, 
      (scriptSize >> 24) & 0xff
    ]);
  }
  
  // Fixed components
  const leftFixed = Buffer.concat([
    Buffer.from([0x01, 0x00, 0x00, 0x00]), // nVersion
    Buffer.alloc(32, 0xaa), // hashPrevouts
    Buffer.alloc(32, 0xbb), // hashSequence
    Buffer.alloc(32, 0xcc), // outpoint_txid
    Buffer.from([0x00, 0x00, 0x00, 0x00]) // outpoint_vout
  ]);
  
  const scriptCode = Buffer.alloc(scriptSize, 0x6a); // Fill with OP_RETURN
  
  const rightFixed = Buffer.concat([
    Buffer.from([0x00, 0xe1, 0xf5, 0x05, 0x00, 0x00, 0x00, 0x00]), // value
    Buffer.from([0xff, 0xff, 0xff, 0xff]), // nSequence
    Buffer.alloc(32, 0xee), // hashOutputs
    Buffer.from([0x00, 0x00, 0x00, 0x00]), // nLocktime
    Buffer.from([0x41, 0x00, 0x00, 0x00]) // sighashType
  ]);
  
  const preimage = Buffer.concat([leftFixed, scriptLen, scriptCode, rightFixed]);
  return preimage.toString('hex');
};

const testCases = [
  { name: "1-byte varint", size: 25 },
  { name: "1-byte varint (max)", size: 252 },
  { name: "3-byte varint (min)", size: 253 },
  { name: "3-byte varint", size: 300 },
  { name: "3-byte varint (large)", size: 1000 },
  { name: "3-byte varint (max)", size: 65535 }
];

console.log('🧪 CompactSize Varint Extraction Test Suite');
console.log('=' .repeat(60));

testCases.forEach(test => {
  console.log(`\n🔍 Testing ${test.name} (${test.size} bytes):`);
  
  const preimageHex = createTestPreimage(test.size);
  const totalSize = preimageHex.length / 2;
  
  console.log(`   📏 Total preimage: ${totalSize} bytes`);
  
  try {
    const extractorPath = path.join(__dirname, 'extract_preimage_bidirectional.js');
    const result = execSync(
      `node "${extractorPath}" "${preimageHex}" "scriptLen"`,
      { encoding: 'utf8', cwd: __dirname }
    );
    
    // Extract the decoded value from output
    const match = result.match(/Decoded value: (\d+)/);
    if (match && parseInt(match[1]) === test.size) {
      console.log(`   ✅ SUCCESS: Correctly decoded ${test.size} bytes`);
    } else {
      console.log(`   ❌ FAILED: Expected ${test.size}, got ${match ? match[1] : 'unknown'}`);
    }
  } catch (error) {
    console.log(`   ❌ ERROR: ${error.message.split('\n')[0]}`);
  }
});

console.log('\n' + '='.repeat(60));
console.log('🎯 Varint extraction test completed!');
console.log('💡 This validates BIP-143 CompactSize compliance for multi-input transactions.');