#!/usr/bin/env node
/**
 * Test Script for Debug Tools Integration
 * =======================================
 * Tests the newly integrated StackExaminer and ScriptInterpreter tools
 * in the SmartContract interface
 */

const SmartContract = require('./lib/smart_contract/index.js');

console.log("🧪 Testing SmartContract Debug Tools Integration");
console.log("=================================================\n");

// Test 1: Check if modules are loaded
console.log("1. Module Loading Test:");
console.log("   StackExaminer loaded:", !!SmartContract.StackExaminer);
console.log("   ScriptInterpreter loaded:", !!SmartContract.ScriptInterpreter);
console.log("   examineStack method:", typeof SmartContract.examineStack);
console.log("   debugScriptExecution method:", typeof SmartContract.debugScriptExecution);
console.log("   parseScript method:", typeof SmartContract.parseScript);

// Test 2: Feature flags
console.log("\n2. Feature Flags Test:");
console.log("   STACK_EXAMINATION:", SmartContract.features.STACK_EXAMINATION);
console.log("   SCRIPT_DEBUGGING:", SmartContract.features.SCRIPT_DEBUGGING);
console.log("   STEP_BY_STEP_EXECUTION:", SmartContract.features.STEP_BY_STEP_EXECUTION);
console.log("   INTERACTIVE_DEBUGGING:", SmartContract.features.INTERACTIVE_DEBUGGING);

// Test 3: Simple script parsing
console.log("\n3. Script Parsing Test:");
try {
  const parsedASM = SmartContract.parseScript("OP_DUP OP_HASH160");
  console.log("   ✅ ASM parsing successful");
  console.log("   Script length:", parsedASM.chunks.length);
} catch (err) {
  console.log("   ❌ ASM parsing failed:", err.message);
}

try {
  const parsedHex = SmartContract.parseScript("76a914");
  console.log("   ✅ HEX parsing successful");
  console.log("   Script length:", parsedHex.chunks.length);
} catch (err) {
  console.log("   ❌ HEX parsing failed:", err.message);
}

// Test 4: Stack examination (non-interactive)
console.log("\n4. Stack Examination Test:");
try {
  // Use simple valid scripts for testing
  const result = SmartContract.examineStack("51", "51"); // OP_1, OP_1
  console.log("   ✅ Stack examination completed, result:", result);
} catch (err) {
  console.log("   ⚠️ Stack examination had issues:", err.message);
}

console.log("\n=================================================");
console.log("🎉 Debug Tools Integration Test Complete!");
console.log("=================================================");

// Count total methods in SmartContract
const methodCount = Object.keys(SmartContract).filter(key => 
  typeof SmartContract[key] === 'function'
).length;

console.log(`\n📊 SmartContract Interface Summary:`);
console.log(`   Total Methods: ${methodCount}`);
console.log(`   Total Modules: ${Object.keys(SmartContract).filter(key => 
  typeof SmartContract[key] === 'object' && SmartContract[key].constructor.name !== 'Object'
).length}`);
console.log(`   Feature Flags: ${Object.keys(SmartContract.features).length}`);