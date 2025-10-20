#!/usr/bin/env node
/**
 * parse_preimage.js
 *
 * Extracts all parts of a Bitcoin (BSV/BTC-style) preimage from a raw hex string.
 * Works for preimages that follow the standard structure:
 *
 *  1. nVersion (4 bytes)
 *  2. hashPrevouts (32 bytes)
 *  3. hashSequence (32 bytes)
 *  4. outpoint (32 bytes + 4 bytes)
 *  5. scriptCode (variable length)
 *  6. value (8 bytes)
 *  7. nSequence (4 bytes)
 *  8. hashOutputs (32 bytes)
 *  9. nLocktime (4 bytes)
 * 10. sighashType (4 bytes)
 */

const Buffer = require('buffer').Buffer;
// =============================
// Helper Functions
// =============================
function readLE(buffer, offset, length) {
  return buffer.slice(offset, offset + length).reverse().toString('hex');
}

function readBE(buffer, offset, length) {
  return buffer.slice(offset, offset + length).toString('hex');
}

function readUInt32LE(buffer, offset) {
  return buffer.readUInt32LE(offset);
}

function readUInt64LE(buffer, offset) {
  // Node.js Buffer has no readUInt64LE natively
  const lo = buffer.readUInt32LE(offset);
  const hi = buffer.readUInt32LE(offset + 4);
  return hi * 0x100000000 + lo;
}

// =============================
// Main Parse Function
// =============================
function parsePreimage(hex) {
  const buf = Buffer.from(hex, 'hex');
  let offset = 0;
  const result = {};

  result.nVersion = buf.readUInt32LE(offset);
  offset += 4;

  result.hashPrevouts = readBE(buf, offset, 32);
  offset += 32;

  result.hashSequence = readBE(buf, offset, 32);
  offset += 32;

  result.outpoint = {
    txid: readBE(buf, offset, 32),
    vout: buf.readUInt32LE(offset + 32),
  };
  offset += 36;

  // NOTE: scriptCode is variable length; next byte(s) determine its length
  const scriptLen = buf[offset];
  offset += 1;
  result.scriptCode = readBE(buf, offset, scriptLen);
  offset += scriptLen;

  result.value = readUInt64LE(buf, offset);
  offset += 8;

  result.nSequence = buf.readUInt32LE(offset);
  offset += 4;

  result.hashOutputs = readBE(buf, offset, 32);
  offset += 32;

  result.nLocktime = buf.readUInt32LE(offset);
  offset += 4;

  result.sighashType = buf.readUInt32LE(offset);
  offset += 4;

  return result;
}

// =============================
// Example Usage
// =============================

if (process.argv.length < 3) {
  console.log("Usage: node parse_preimage.js <raw_preimage_hex>");
  process.exit(1);
}

// CLI usage
if (require.main === module) {
  const hex = process.argv[2];
  const parsed = parsePreimage(hex);

  console.log("🔍 Parsed Transaction Preimage:\n");
  for (const [key, value] of Object.entries(parsed)) {
    console.log(`${key}:`, value);
  }
}

// Module exports for programmatic use
module.exports = {
  parsePreimage,
  readLE,
  readBE,
  readUInt32LE,
  readUInt64LE
};
