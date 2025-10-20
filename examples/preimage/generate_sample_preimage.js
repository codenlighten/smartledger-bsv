#!/usr/bin/env node
/**
 * generate_sample_preimage.js
 * Advanced BIP-143 preimage generator with multiple realistic scenarios
 * 
 * Generates various types of preimages for testing bidirectional extraction:
 * - Standard P2PKH transactions
 * - Multi-signature scenarios  
 * - Custom script patterns
 * - Different value ranges
 */

function createSamplePreimage(type = 'standard') {
  const { Buffer } = require("buffer");
  
  // Base fields (same for all types)
  const baseFields = {
    nVersion: Buffer.from([0x01, 0x00, 0x00, 0x00]), // Version 1
    hashPrevouts: Buffer.alloc(32, 0xab), // Mock hash
    hashSequence: Buffer.alloc(32, 0xcd), // Mock hash  
    outpoint_txid: Buffer.alloc(32, 0x12), // Mock TXID
    outpoint_vout: Buffer.from([0x00, 0x00, 0x00, 0x00]), // Output 0
    nSequence: Buffer.from([0xff, 0xff, 0xff, 0xff]), // Max sequence
    hashOutputs: Buffer.alloc(32, 0xef), // Mock hash
    nLocktime: Buffer.from([0x00, 0x00, 0x00, 0x00]), // No locktime
    sighashType: Buffer.from([0x41, 0x00, 0x00, 0x00]) // SIGHASH_ALL | FORKID
  };
  
  let scriptVariant;
  
  switch (type) {
    case 'standard':
      // Standard P2PKH (25 bytes)
      scriptVariant = {
        scriptLen: Buffer.from([0x19]), // 25 bytes
        scriptCode: Buffer.from([
          0x76, 0xa9, 0x14,  // OP_DUP OP_HASH160 OP_PUSHDATA(20)
          ...Buffer.alloc(20, 0x88),  // 20-byte pubkey hash
          0x88, 0xac  // OP_EQUALVERIFY OP_CHECKSIG
        ]),
        value: Buffer.from([0x00, 0xe1, 0xf5, 0x05, 0x00, 0x00, 0x00, 0x00]) // 100000000 satoshis (1 BSV)
      };
      break;
      
    case 'multisig':
      // 2-of-3 multisig (71 bytes)
      scriptVariant = {
        scriptLen: Buffer.from([0x47]), // 71 bytes
        scriptCode: Buffer.concat([
          Buffer.from([0x52]),  // OP_2 (required signatures)
          Buffer.from([0x21]), Buffer.alloc(33, 0xaa),  // First pubkey (33 bytes)
          Buffer.from([0x21]), Buffer.alloc(33, 0xbb),  // Second pubkey (33 bytes)  
          Buffer.from([0x21]), Buffer.alloc(33, 0xcc),  // Third pubkey (33 bytes)
          Buffer.from([0x53]),  // OP_3 (total pubkeys)
          Buffer.from([0xae])   // OP_CHECKMULTISIG
        ]),
        value: Buffer.from([0x00, 0x40, 0x42, 0x0f, 0x00, 0x00, 0x00, 0x00]) // 2.56 BSV
      };
      break;
      
    case 'custom':
      // Custom script with OP_RETURN data (34 bytes)
      scriptVariant = {
        scriptLen: Buffer.from([0x22]), // 34 bytes
        scriptCode: Buffer.concat([
          Buffer.from([0x6a]),  // OP_RETURN
          Buffer.from([0x20]),  // Push 32 bytes
          Buffer.from('Hello Bitcoin SV - Custom Script Test', 'utf8').slice(0, 32)
        ]),
        value: Buffer.from([0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00]) // 0 satoshis (OP_RETURN output)
      };
      break;
      
    case 'large':
      // Large script (300 bytes) to test CompactSize 3-byte varint (0xFD)
      const scriptSize = 300;
      scriptVariant = {
        scriptLen: Buffer.from([0xfd, scriptSize & 0xff, (scriptSize >> 8) & 0xff]), // 3-byte varint: 0xFD + 2-byte LE
        scriptCode: Buffer.concat([
          Buffer.from([0x76, 0xa9, 0x14]), // OP_DUP OP_HASH160 OP_PUSHDATA(20)
          Buffer.alloc(20, 0x99), // 20-byte pubkey hash
          Buffer.from([0x88, 0xac]), // OP_EQUALVERIFY OP_CHECKSIG  
          Buffer.alloc(275, 0x6a) // Padding with OP_RETURN opcodes to reach 300 bytes
        ]),
        value: Buffer.from([0x00, 0x10, 0xa5, 0xd4, 0xe8, 0x00, 0x00, 0x00]) // 10 BSV
      };
      break;
      
    case 'huge':
      // Huge script (70000 bytes) to test CompactSize 5-byte varint (0xFE) 
      const hugeSize = 70000;
      scriptVariant = {
        scriptLen: Buffer.from([
          0xfe, 
          hugeSize & 0xff, 
          (hugeSize >> 8) & 0xff, 
          (hugeSize >> 16) & 0xff, 
          (hugeSize >> 24) & 0xff
        ]), // 5-byte varint: 0xFE + 4-byte LE
        scriptCode: Buffer.concat([
          Buffer.from([0x6a]), // OP_RETURN
          Buffer.from([0x4c, 0xff, 0xff]), // OP_PUSHDATA2 + 65535 bytes
          Buffer.alloc(65535, 0xaa), // Large data block
          Buffer.alloc(hugeSize - 65539, 0xbb) // Remaining padding
        ]),
        value: Buffer.from([0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00]) // 0 satoshis (data output)
      };
      break;
      
    default:
      throw new Error(`Unknown preimage type: ${type}`);
  }
  
  const fields = { ...baseFields, ...scriptVariant };
  
  // Concatenate all fields
  const preimage = Buffer.concat([
    fields.nVersion,
    fields.hashPrevouts,
    fields.hashSequence,
    fields.outpoint_txid,
    fields.outpoint_vout,
    fields.scriptLen,
    fields.scriptCode,
    fields.value,
    fields.nSequence,
    fields.hashOutputs,
    fields.nLocktime,
    fields.sighashType
  ]);
  
  return preimage.toString('hex');
}

// CLI Interface
if (require.main === module) {
  const type = process.argv[2] || 'standard';
  
  if (type === '--help' || type === '-h') {
    console.log("🎯 Advanced BIP-143 Preimage Generator");
    console.log("=====================================");
    console.log("Usage: node generate_sample_preimage.js [type]");
    console.log("");
    console.log("Available types:");
    console.log("  standard   - Standard P2PKH script (25 bytes, 1-byte varint) - DEFAULT");
    console.log("  multisig   - 2-of-3 multisig script (71 bytes, 1-byte varint)");
    console.log("  custom     - Custom OP_RETURN script (34 bytes, 1-byte varint)");
    console.log("  large      - Large script (300 bytes, 3-byte varint 0xFD)");
    console.log("  huge       - Huge script (70000 bytes, 5-byte varint 0xFE)");
    console.log("");
    console.log("Examples:");
    console.log("  node generate_sample_preimage.js");
    console.log("  node generate_sample_preimage.js multisig");
    console.log("  node generate_sample_preimage.js large    # Test 3-byte varint");
    console.log("  node generate_sample_preimage.js huge     # Test 5-byte varint");
    process.exit(0);
  }
  
  try {
    console.log("🎯 Advanced BIP-143 Preimage Generator");
    console.log("=====================================");
    console.log(`📋 Type: ${type}`);
    
    const sampleHex = createSamplePreimage(type);
    const scriptLen = parseInt(sampleHex.substring(208, 210), 16); // Extract scriptLen byte
    
    console.log(`📊 Generated: ${sampleHex.length / 2} bytes total`);
    console.log(`📏 Structure: LEFT(105) + scriptCode(${scriptLen}) + RIGHT(52) bytes`);
    console.log(`📦 Preimage: ${sampleHex}`);
    
    console.log("\n🧪 Test Commands:");
    console.log(`   node extract_preimage_bidirectional.js ${sampleHex} scriptCode`);
    console.log(`   node extract_preimage_bidirectional.js ${sampleHex} value`);
    console.log(`   npm run preimage:extract ${sampleHex} nVersion`);
    
    console.log("\n🔍 Field Analysis:");
    console.log(`   LEFT extraction:    nVersion, hashPrevouts, hashSequence, outpoint_*, scriptLen`);
    console.log(`   DYNAMIC extraction: scriptCode (${scriptLen} bytes)`);
    console.log(`   RIGHT extraction:   value, nSequence, hashOutputs, nLocktime, sighashType`);
    
  } catch (error) {
    console.error("❌ Error:", error.message);
    console.log("💡 Use --help to see available types");
    process.exit(1);
  }
}

// Export functions for programmatic use
function generateAllTypes() {
  return {
    standard: createSamplePreimage('standard'),
    multisig: createSamplePreimage('multisig'), 
    custom: createSamplePreimage('custom'),
    large: createSamplePreimage('large')
  };
}

module.exports = { 
  createSamplePreimage,
  generateAllTypes,
  
  // Convenience functions
  getStandardPreimage: () => createSamplePreimage('standard'),
  getMultisigPreimage: () => createSamplePreimage('multisig'),
  getCustomPreimage: () => createSamplePreimage('custom'),
  getLargePreimage: () => createSamplePreimage('large'),
  getHugePreimage: () => createSamplePreimage('huge')
};