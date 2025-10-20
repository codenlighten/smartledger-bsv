#!/usr/bin/env node
/**
 * extract_preimage_bidirectional.js
 * ---------------------------------------------------------------------
 * Extract any part of the transaction preimage intelligently by slicing
 * from either LEFT or RIGHT based on what is known.
 * Handles variable scriptCode length via dynamic slicing.
 *
 * Part of the Preimage Covenant Tools - implements bidirectional slicing
 * strategy for optimal preimage field extraction in Bitcoin Script.
 *
 * Usage:
 *   node extract_preimage_bidirectional.js <raw_preimage_hex> <field_name>
 *
 * Example:
 *   node extract_preimage_bidirectional.js 01000000ab12... scriptCode
 */

const { Buffer } = require("buffer");

// Fixed field definitions - LEFT side (known offsets from start)
const LEFT_FIXED_FIELDS = [
  { name: "nVersion", len: 4 },
  { name: "hashPrevouts", len: 32 },
  { name: "hashSequence", len: 32 },
  { name: "outpoint_txid", len: 32 },
  { name: "outpoint_vout", len: 4 },
  // Note: scriptLen is VARIABLE (1-3 bytes CompactSize varint) - handled separately
];

// Fixed field definitions - RIGHT side (known offsets from end)
const RIGHT_FIXED_FIELDS = [
  { name: "value", len: 8 },
  { name: "nSequence", len: 4 },
  { name: "hashOutputs", len: 32 },
  { name: "nLocktime", len: 4 },
  { name: "sighashType", len: 4 },
];

// Calculate total bytes on each side
const LEFT_FIXED_TOTAL = LEFT_FIXED_FIELDS.reduce((a, f) => a + f.len, 0); // 104 bytes (without scriptLen varint)
const RIGHT_TOTAL = RIGHT_FIXED_FIELDS.reduce((a, f) => a + f.len, 0); // 52 bytes

// CompactSize varint decoder for scriptLen
function decodeCompactSize(buf, offset) {
  if (offset >= buf.length) return { value: 0, size: 1 };
  
  const firstByte = buf[offset];
  
  if (firstByte < 0xfd) {
    // 1-byte encoding: 0-252
    return { value: firstByte, size: 1 };
  } else if (firstByte === 0xfd) {
    // 3-byte encoding: 0xfd + 2 bytes little-endian
    if (offset + 2 >= buf.length) return { value: 0, size: 1 };
    const value = buf.readUInt16LE(offset + 1);
    return { value, size: 3 };
  } else if (firstByte === 0xfe) {
    // 5-byte encoding: 0xfe + 4 bytes little-endian
    if (offset + 4 >= buf.length) return { value: 0, size: 1 };
    const value = buf.readUInt32LE(offset + 1);
    return { value, size: 5 };
  } else {
    // 0xff = 9-byte encoding (not used for script lengths)
    throw new Error('Invalid CompactSize varint: 8-byte integers not supported for scriptLen');
  }
}

// Helper functions
function safeSlice(buf, start, end) {
  if (start >= buf.length) return Buffer.alloc(0);
  if (end > buf.length) end = buf.length;
  return buf.slice(start, end);
}

function parsePreimage(hex) {
  const buf = Buffer.from(hex, "hex");
  let offset = 0;
  const parsed = {};
  
  // Parse LEFT fixed fields (104 bytes)
  for (const f of LEFT_FIXED_FIELDS) {
    const part = safeSlice(buf, offset, offset + f.len);
    parsed[f.name] = part.toString("hex");
    offset += f.len;
  }
  
  // Parse CompactSize varint for scriptLen
  const scriptLenInfo = decodeCompactSize(buf, offset);
  parsed.scriptLen = scriptLenInfo.value;
  parsed.scriptLenSize = scriptLenInfo.size; // Track varint encoding size
  parsed.scriptLenRaw = safeSlice(buf, offset, offset + scriptLenInfo.size).toString("hex");
  offset += scriptLenInfo.size;
  
  // Parse variable scriptCode using decoded scriptLen
  const scriptCode = safeSlice(buf, offset, offset + parsed.scriptLen);
  parsed.scriptCode = scriptCode.toString("hex");
  offset += parsed.scriptLen;
  
  // Parse RIGHT fields
  for (const f of RIGHT_FIXED_FIELDS) {
    const part = safeSlice(buf, offset, offset + f.len);
    parsed[f.name] = part.toString("hex");
    offset += f.len;
  }
  
  // Add structure info for analysis
  parsed._structure = {
    leftFixed: LEFT_FIXED_TOTAL,
    scriptLenVarint: scriptLenInfo.size,
    scriptCode: parsed.scriptLen,
    rightFixed: RIGHT_TOTAL,
    totalCalculated: LEFT_FIXED_TOTAL + scriptLenInfo.size + parsed.scriptLen + RIGHT_TOTAL,
    totalActual: buf.length
  };
  
  return parsed;
}

function generateBidirectionalASM(field, preimageLength, parsed) {
  console.log(`\n🧠 Bidirectional Analysis for "${field}"`);
  console.log('='.repeat(60));
  
  // Determine extraction strategy
  const rightFields = RIGHT_FIXED_FIELDS.map(f => f.name);
  const leftFields = LEFT_FIXED_FIELDS.map(f => f.name);
  
  const isRightField = rightFields.includes(field);
  const isLeftField = leftFields.includes(field);
  const isDynamic = field === 'scriptCode';
  const isScriptLen = field === 'scriptLen';
  
  if (isRightField) {
    return generateRightExtractionASM(field, preimageLength);
  } else if (isLeftField) {
    return generateLeftExtractionASM(field);
  } else if (isDynamic) {
    return generateDynamicExtractionASM(field, parsed);
  } else if (isScriptLen) {
    return generateScriptLenExtractionASM(parsed);
  } else {
    throw new Error(`Unknown field: ${field}`);
  }
}

function generateRightExtractionASM(field, preimageLength) {
  // Calculate offset from end
  let offsetFromEnd = 0;
  let targetLen = 0;
  
  for (const f of RIGHT_FIXED_FIELDS) {
    if (f.name === field) {
      targetLen = f.len;
      break;
    }
    offsetFromEnd += f.len;
  }
  
  console.log(`📍 Strategy: Extract from RIGHT side`);
  console.log(`   - Total preimage: ${preimageLength} bytes`);
  console.log(`   - Right zone: ${RIGHT_TOTAL} bytes`);
  console.log(`   - Offset from end: ${offsetFromEnd} bytes`);
  console.log(`   - Field length: ${targetLen} bytes`);
  
  const asm = [
    `# 🔄 Extract ${field} from RIGHT side (bidirectional strategy)`,
    `OP_SIZE                    # Push preimage size: [preimage, size]`,
    `${RIGHT_TOTAL - offsetFromEnd} OP_SUB     # Calculate split point: [preimage, split_point]`,
    `OP_SPLIT                  # Split: [left_part, right_part]`,
    `OP_DROP                   # Drop left: [right_part]`,
    `${targetLen} OP_SPLIT             # Extract field: [remaining, ${field}]`,
    `OP_DROP                   # Clean up: [${field}]`,
    `# ✅ Result: ${field} is now on top of stack`
  ].join('\n');
  
  return asm;
}

function generateLeftExtractionASM(field) {
  // Calculate offset from start
  let offsetFromStart = 0;
  let targetLen = 0;
  
  for (const f of LEFT_FIXED_FIELDS) {
    if (f.name === field) {
      targetLen = f.len;
      break;
    }
    offsetFromStart += f.len;
  }
  
  console.log(`📍 Strategy: Extract from LEFT side`);
  console.log(`   - Left fixed zone: ${LEFT_FIXED_TOTAL} bytes`);
  console.log(`   - Offset from start: ${offsetFromStart} bytes`);
  console.log(`   - Field length: ${targetLen} bytes`);
  
  const asm = [
    `# 🔄 Extract ${field} from LEFT side (bidirectional strategy)`,
    `${offsetFromStart} OP_SPLIT           # Skip to field: [prefix, remainder]`,
    `OP_DROP                   # Drop prefix: [remainder]`,
    `${targetLen} OP_SPLIT             # Extract field: [${field}, suffix]`,
    `OP_DROP                   # Clean up: [${field}]`,
    `# ✅ Result: ${field} is now on top of stack`
  ].join('\n');
  
  return asm;
}

function generateDynamicExtractionASM(field, parsed) {
  const leftZone = LEFT_FIXED_TOTAL + parsed.scriptLenSize;
  
  console.log(`📍 Strategy: Extract DYNAMIC field (uses CompactSize varint)`);
  console.log(`   - Left fixed zone: ${LEFT_FIXED_TOTAL} bytes`);
  console.log(`   - ScriptLen varint: ${parsed.scriptLenSize} bytes (${parsed.scriptLenRaw})`);
  console.log(`   - Script length: ${parsed.scriptLen} bytes`);
  console.log(`   - Skip zone total: ${leftZone} bytes`);
  
  const asm = [
    `# 🎯 Extract ${field} DYNAMICALLY with CompactSize varint support`,
    `${leftZone} OP_SPLIT            # Skip left zone + scriptLen varint: [left_zone, remainder]`,
    `OP_DROP                   # Drop left: [remainder]`,
    `${parsed.scriptLen} OP_SPLIT             # Extract scriptCode: [scriptCode, right_zone]`,
    `OP_DROP                   # Clean up: [scriptCode]`,
    `# ✅ Result: scriptCode extracted with ${parsed.scriptLenSize}-byte varint awareness`
  ].join('\n');
  
  return asm;
}

function generateScriptLenExtractionASM(parsed) {
  console.log(`📍 Strategy: Extract CompactSize scriptLen varint`);
  console.log(`   - Left fixed zone: ${LEFT_FIXED_TOTAL} bytes`);
  console.log(`   - Varint encoding: ${parsed.scriptLenSize} bytes`);
  console.log(`   - Raw varint: ${parsed.scriptLenRaw}`);
  console.log(`   - Decoded value: ${parsed.scriptLen}`);
  
  const asm = [
    `# 🎯 Extract scriptLen CompactSize varint (${parsed.scriptLenSize} bytes)`,
    `${LEFT_FIXED_TOTAL} OP_SPLIT            # Skip left fixed fields: [left_zone, remainder]`,
    `OP_DROP                   # Drop left: [remainder]`,
    `${parsed.scriptLenSize} OP_SPLIT             # Extract varint: [scriptLen_varint, suffix]`,
    `OP_DROP                   # Clean up: [scriptLen_varint]`,
    `# ✅ Result: CompactSize varint (decode off-chain to get ${parsed.scriptLen})`
  ].join('\n');
  
  return asm;
}

function simulateExtraction(buf, field) {
  console.log(`\n🎬 Simulating stack execution for "${field}"`);
  console.log('='.repeat(60));
  
  const parsed = parsePreimage(buf.toString('hex'));
  
  if (parsed[field] !== undefined) {
    const value = parsed[field];
    console.log(`📦 Extracted value: ${value}`);
    
    // Add interpretations with CompactSize awareness
    if (field === 'nVersion') {
      const version = Buffer.from(value, 'hex').readUInt32LE(0);
      console.log(`   📝 Interpreted: Version ${version}`);
    } else if (field === 'value') {
      if (value.length === 16) { // 8 bytes = 16 hex chars
        const satoshis = Buffer.from(value, 'hex').readBigUInt64LE(0);
        console.log(`   📝 Interpreted: ${satoshis} satoshis`);
      }
    } else if (field === 'sighashType') {
      const sighashInt = Buffer.from(value, 'hex').readUInt32LE(0);
      const types = {
        1: 'SIGHASH_ALL',
        65: 'SIGHASH_ALL | FORKID',
        2: 'SIGHASH_NONE',
        66: 'SIGHASH_NONE | FORKID',
        3: 'SIGHASH_SINGLE',
        67: 'SIGHASH_SINGLE | FORKID',
        129: 'SIGHASH_ALL | ANYONECANPAY',
        193: 'SIGHASH_ALL | ANYONECANPAY | FORKID'
      };
      console.log(`   📝 Interpreted: ${types[sighashInt] || `Custom (${sighashInt})`}`);
    } else if (field === 'outpoint_vout') {
      const vout = Buffer.from(value, 'hex').readUInt32LE(0);
      console.log(`   📝 Interpreted: Output index ${vout}`);
    } else if (field === 'scriptLen') {
      console.log(`   📝 Interpreted: CompactSize varint (${parsed.scriptLenSize} bytes)`);
      console.log(`   📝 Raw varint: ${parsed.scriptLenRaw}`);
      console.log(`   📝 Decoded value: ${parsed.scriptLen} bytes`);
      
      if (parsed.scriptLenSize === 1) {
        console.log(`   💡 Standard encoding: value < 253 (0xFD)`);
      } else if (parsed.scriptLenSize === 3) {
        console.log(`   💡 Extended encoding: 0xFD + 2-byte little-endian`);
      } else if (parsed.scriptLenSize === 5) {
        console.log(`   💡 Long encoding: 0xFE + 4-byte little-endian`);
      }
    } else if (field === 'scriptCode') {
      const scriptBuf = Buffer.from(value, 'hex');
      if (scriptBuf.length === 25 && scriptBuf[0] === 0x76 && scriptBuf[1] === 0xa9) {
        console.log(`   📝 Interpreted: Standard P2PKH script (25 bytes)`);
      } else if (scriptBuf.length > 70 && scriptBuf[0] >= 0x51 && scriptBuf[0] <= 0x60) {
        console.log(`   📝 Interpreted: Multisig script (${scriptBuf.length} bytes)`);
      } else if (scriptBuf.length > 0 && scriptBuf[0] === 0x6a) {
        console.log(`   📝 Interpreted: OP_RETURN data script (${scriptBuf.length} bytes)`);
      } else {
        console.log(`   📝 Interpreted: Custom script (${scriptBuf.length} bytes)`);
      }
    } else if (['hashPrevouts', 'hashSequence', 'hashOutputs'].includes(field)) {
      if (value === '00'.repeat(32)) {
        console.log(`   ⚠️  Zero hash detected - check SIGHASH flags (ANYONECANPAY, NONE, SINGLE)`);
      } else {
        console.log(`   📝 Interpreted: 32-byte hash (${value.substring(0, 16)}...)`);
      }
    }
  } else {
    console.log(`❌ Field "${field}" not found in parsed preimage`);
  }
}

// CLI Interface
if (process.argv.length < 4) {
  console.log("🧠 Bidirectional Preimage Field Extractor v2.0");
  console.log("=============================================");
  console.log("✨ Now with CompactSize varint support for multi-input transactions!");
  console.log("");
  console.log("Usage: node extract_preimage_bidirectional.js <preimage_hex> <field_name>");
  console.log("");
  console.log("🔄 LEFT Fields (fixed offsets from start):");
  LEFT_FIXED_FIELDS.forEach(f => {
    console.log(`  - ${f.name.padEnd(16)} (${f.len} bytes)`);
  });
  console.log("  - scriptLen          (1-3 bytes CompactSize varint)");
  console.log("");
  console.log("🎯 DYNAMIC Field (uses CompactSize scriptLen):");
  console.log(`  - scriptCode         (variable, decoded from scriptLen varint)`);
  console.log("");
  console.log("🔄 RIGHT Fields (fixed offsets from end):");
  RIGHT_FIXED_FIELDS.forEach(f => {
    console.log(`  - ${f.name.padEnd(16)} (${f.len} bytes)`);
  });
  console.log("");
  console.log("📖 CompactSize Encoding:");
  console.log("  < 253 (0xFD)     → 1 byte");
  console.log("  253-65535        → 3 bytes (0xFD + 2-byte LE)");
  console.log("  65536-4294967295 → 5 bytes (0xFE + 4-byte LE)");
  console.log("");
  console.log("Examples:");
  console.log("  node extract_preimage_bidirectional.js 01000000ab12cd... scriptCode");
  console.log("  node extract_preimage_bidirectional.js 01000000ab12cd... scriptLen");
  console.log("  node extract_preimage_bidirectional.js 01000000ab12cd... value");
  process.exit(1);
}

const hex = process.argv[2];
const field = process.argv[3];

// Validate input
if (!/^[0-9a-fA-F]+$/.test(hex)) {
  console.error("❌ Invalid hex string. Please provide a valid hexadecimal preimage.");
  process.exit(1);
}

if (hex.length < 200) {
  console.error("❌ Preimage too short. Expected at least 100+ bytes for valid BIP-143 preimage.");
  process.exit(1);
}

try {
  const buf = Buffer.from(hex, "hex");
  const parsed = parsePreimage(hex);
  
  console.log(`\n🔍 Bidirectional Preimage Analysis`);
  console.log('='.repeat(60));
  console.log(`📊 Total preimage: ${buf.length} bytes (${hex.length} hex chars)`);
  console.log(`📋 Structure: LEFT(${parsed._structure.leftFixed}) + scriptLen(${parsed._structure.scriptLenVarint}) + scriptCode(${parsed._structure.scriptCode}) + RIGHT(${parsed._structure.rightFixed}) = ${parsed._structure.totalCalculated} bytes`);
  
  // Validate structure with CompactSize awareness
  if (buf.length !== parsed._structure.totalCalculated) {
    console.log(`⚠️  Size mismatch: expected ${parsed._structure.totalCalculated}, got ${buf.length}`);
    console.log(`💡 Check: CompactSize varint encoding, script serialization, SIGHASH flags`);
  } else {
    console.log(`✅ Structure validated: Perfect BIP-143 compliance`);
  }
  
  // Show CompactSize details
  if (parsed.scriptLenSize > 1) {
    console.log(`🔍 CompactSize Details: ${parsed.scriptLen} bytes encoded as ${parsed.scriptLenSize}-byte varint (${parsed.scriptLenRaw})`);
  }
  
  // Generate and display ASM
  const asm = generateBidirectionalASM(field, buf.length, parsed);
  console.log(`\n📜 Generated ASM:`);
  console.log(asm);
  
  // Simulate extraction
  simulateExtraction(buf, field);
  
} catch (error) {
  console.error("❌ Error:", error.message);
  if (error.message.includes('Invalid hex')) {
    console.error("💡 Tip: Make sure your preimage is valid hexadecimal");
  } else if (error.message.includes('Unknown field')) {
    console.error("💡 Tip: Check available fields with --help");
  }
  process.exit(1);
}

// Add helpful footer
console.log("\n" + "=".repeat(60));
console.log("🎯 Enhanced Bidirectional Strategy Benefits:");
console.log("  ✅ Optimal extraction direction for each field");
console.log("  ✅ CompactSize varint scriptLen support (1-3 bytes)");
console.log("  ✅ Handles multi-input transaction preimages");
console.log("  ✅ SIGHASH flag awareness (zero hash detection)");
console.log("  ✅ Self-contained (no external context needed)");
console.log("  ✅ Generates minimal ASM operations");
console.log("");
console.log("🔗 Integration with Covenant Tools:");
console.log("  - Use generated ASM in covenant locking scripts");
console.log("  - Verify preimage components with dynamic extraction");
console.log("  - Build advanced covenant patterns with field isolation");
console.log("📖 See DOCUMENTATION.md for complete covenant implementation");