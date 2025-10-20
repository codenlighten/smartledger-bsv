#!/usr/bin/env node
/**
 * generate_sighash_examples.js  
 * Generate preimages demonstrating SIGHASH flag behavior that causes "zero hashes"
 * This explains the "extra zeros" that confuse developers in multi-input scenarios
 */

const { Buffer } = require("buffer");

function createSighashPreimage(sighashType = 'ALL_FORKID') {
  // SIGHASH type mappings
  const sighashTypes = {
    'ALL': 0x01,
    'ALL_FORKID': 0x41,
    'NONE_FORKID': 0x42, 
    'SINGLE_FORKID': 0x43,
    'ALL_ANYONECANPAY_FORKID': 0xc1,
    'NONE_ANYONECANPAY_FORKID': 0xc2,
    'SINGLE_ANYONECANPAY_FORKID': 0xc3
  };
  
  const sigType = sighashTypes[sighashType];
  if (!sigType) {
    throw new Error(`Unknown sighash type: ${sighashType}`);
  }
  
  // Base preimage components
  const nVersion = Buffer.from([0x01, 0x00, 0x00, 0x00]);
  const outpoint_txid = Buffer.alloc(32, 0xaa);
  const outpoint_vout = Buffer.from([0x00, 0x00, 0x00, 0x00]);
  const scriptCode = Buffer.from([
    0x76, 0xa9, 0x14,  // OP_DUP OP_HASH160 OP_PUSHDATA(20)
    ...Buffer.alloc(20, 0x88),  // 20-byte pubkey hash
    0x88, 0xac  // OP_EQUALVERIFY OP_CHECKSIG
  ]);
  const scriptLen = Buffer.from([scriptCode.length]);
  const value = Buffer.from([0x00, 0xe1, 0xf5, 0x05, 0x00, 0x00, 0x00, 0x00]);
  const nSequence = Buffer.from([0xff, 0xff, 0xff, 0xff]);
  const nLocktime = Buffer.from([0x00, 0x00, 0x00, 0x00]);
  const sighashTypeBuffer = Buffer.from([sigType, 0x00, 0x00, 0x00]);
  
  // Apply SIGHASH rules for hash fields
  let hashPrevouts, hashSequence, hashOutputs;
  
  if (sigType & 0x80) { // ANYONECANPAY flag
    hashPrevouts = Buffer.alloc(32, 0x00); // Zero hash
    hashSequence = Buffer.alloc(32, 0x00); // Zero hash
  } else {
    hashPrevouts = Buffer.alloc(32, 0xab); // Normal hash
    hashSequence = Buffer.alloc(32, 0xcd); // Normal hash
  }
  
  if ((sigType & 0x1f) === 0x02) { // SIGHASH_NONE
    hashOutputs = Buffer.alloc(32, 0x00); // Zero hash
  } else if ((sigType & 0x1f) === 0x03) { // SIGHASH_SINGLE  
    hashOutputs = Buffer.alloc(32, 0x00); // Zero hash (simplified)
  } else {
    hashOutputs = Buffer.alloc(32, 0xef); // Normal hash
  }
  
  // Construct preimage
  const preimage = Buffer.concat([
    nVersion,
    hashPrevouts,
    hashSequence,
    outpoint_txid,
    outpoint_vout,
    scriptLen,
    scriptCode,
    value,
    nSequence,
    hashOutputs,
    nLocktime,
    sighashTypeBuffer
  ]);
  
  return {
    hex: preimage.toString('hex'),
    analysis: {
      sighashType: sighashType,
      sighashValue: `0x${sigType.toString(16).padStart(2, '0')}`,
      hashPrevouts: hashPrevouts.equals(Buffer.alloc(32, 0x00)) ? 'ZERO (ANYONECANPAY)' : 'NORMAL',
      hashSequence: hashSequence.equals(Buffer.alloc(32, 0x00)) ? 'ZERO (ANYONECANPAY)' : 'NORMAL',  
      hashOutputs: hashOutputs.equals(Buffer.alloc(32, 0x00)) ? 'ZERO (NONE/SINGLE)' : 'NORMAL'
    }
  };
}

// CLI Interface
if (require.main === module) {
  const sighashType = process.argv[2] || 'ALL_FORKID';
  
  if (sighashType === '--help' || sighashType === '-h') {
    console.log("🔏 SIGHASH Flag Preimage Generator");
    console.log("=================================");
    console.log("Demonstrates how SIGHASH flags create 'zero hashes' in BIP-143 preimages");
    console.log("");
    console.log("Usage: node generate_sighash_examples.js [sighash_type]");
    console.log("");
    console.log("Available SIGHASH types:");
    console.log("  ALL_FORKID                - Standard: all inputs/outputs (0x41) - DEFAULT");
    console.log("  NONE_FORKID               - Zero hashOutputs (0x42)");
    console.log("  SINGLE_FORKID             - Zero hashOutputs for single mode (0x43)");
    console.log("  ALL_ANYONECANPAY_FORKID   - Zero hashPrevouts + hashSequence (0xC1)");
    console.log("  NONE_ANYONECANPAY_FORKID  - Zero all hash fields (0xC2)");
    console.log("");
    console.log("Examples:");
    console.log("  node generate_sighash_examples.js ALL_FORKID");
    console.log("  node generate_sighash_examples.js ALL_ANYONECANPAY_FORKID");
    console.log("  node generate_sighash_examples.js NONE_FORKID");
    process.exit(0);
  }
  
  try {
    console.log("🔏 SIGHASH Flag Preimage Analysis");
    console.log("=================================");
    console.log(`📋 SIGHASH Type: ${sighashType}`);
    
    const result = createSighashPreimage(sighashType);
    
    console.log(`📊 Generated: ${result.hex.length / 2} bytes`);
    console.log(`🔍 SIGHASH Value: ${result.analysis.sighashValue}`);
    console.log("");
    console.log("🧬 Hash Field Analysis:");
    console.log(`   hashPrevouts: ${result.analysis.hashPrevouts}`);
    console.log(`   hashSequence: ${result.analysis.hashSequence}`);  
    console.log(`   hashOutputs:  ${result.analysis.hashOutputs}`);
    console.log("");
    
    if (result.analysis.hashPrevouts === 'ZERO' || 
        result.analysis.hashSequence === 'ZERO' || 
        result.analysis.hashOutputs === 'ZERO') {
      console.log("⚠️  ZERO HASH DETECTED!");
      console.log("   This explains 'extra zeros' developers see in multi-input preimages.");
      console.log("   These are NOT bugs - they're required by BIP-143 SIGHASH rules.");
    }
    
    console.log(`📦 Preimage: ${result.hex}`);
    console.log("");
    console.log("🧪 Test Commands:");
    console.log(`   node extract_preimage_bidirectional.js ${result.hex} hashPrevouts`);
    console.log(`   node extract_preimage_bidirectional.js ${result.hex} hashOutputs`);
    console.log(`   node extract_preimage_bidirectional.js ${result.hex} sighashType`);
    
  } catch (error) {
    console.error("❌ Error:", error.message);
    console.log("💡 Use --help to see available SIGHASH types");
    process.exit(1);
  }
}

module.exports = { createSighashPreimage };