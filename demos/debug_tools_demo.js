#!/usr/bin/env node
/**
 * Debug Tools Integration Demo
 * ============================
 * Demonstrates the newly integrated debugging tools in SmartContract interface
 */

const bsv = require('../bsv.min.js');
const SmartContract = bsv.SmartContract;

console.log("🎯 SmartContract Debug Tools Demo");
console.log("==================================\n");

// Demo 1: Script Parsing
console.log("1. 📝 Script Parsing:");
const asmScript = SmartContract.parseScript("OP_1 OP_DUP OP_ADD");
const hexScript = SmartContract.parseScript("5176935393");

console.log("   ASM -> Chunks:", asmScript.chunks.length);
console.log("   HEX -> Chunks:", hexScript.chunks.length);
console.log("   ASM Script:", asmScript.toASM());
console.log("   HEX Script:", hexScript.toASM());

// Demo 2: Stack Analysis Tools  
console.log("\n2. 🔍 Stack Analysis:");
const testStacks = [
  [Buffer.from('01', 'hex')],
  [Buffer.from('01', 'hex'), Buffer.from('02', 'hex')],
  [Buffer.from('ff', 'hex')]
];

testStacks.forEach((stack, i) => {
  console.log(`   Stack ${i + 1}:`);
  SmartContract.printStack(stack);
});

// Demo 3: Script Utilities Integration
console.log("\n3. 🛠️ Script Utilities:");
const testScript = SmartContract.parseScript("OP_DUP OP_HASH160");

console.log("   Script to ASM:", SmartContract.scriptToASM(testScript.toBuffer()));
console.log("   Script to HEX:", SmartContract.scriptToHex(testScript));
console.log("   Script size:", SmartContract.estimateScriptSize(testScript), "bytes");

const validation = SmartContract.validateScript(testScript);
console.log("   Validation:", validation.valid ? "✅ Valid" : "❌ Invalid");

// Demo 4: Feature Flags
console.log("\n4. 🏳️ Debug Feature Flags:");
const debugFeatures = [
  'STACK_EXAMINATION',
  'SCRIPT_DEBUGGING', 
  'STEP_BY_STEP_EXECUTION',
  'INTERACTIVE_DEBUGGING',
  'SCRIPT_ANALYSIS',
  'SCRIPT_OPTIMIZATION'
];

debugFeatures.forEach(feature => {
  const status = SmartContract.features[feature] ? '✅' : '❌';
  console.log(`   ${status} ${feature}`);
});

// Demo 5: Simple Script Analysis
console.log("\n5. 🧠 Script Analysis:");
const complexScript = SmartContract.parseScript("OP_DUP OP_DUP OP_DROP OP_HASH160 OP_SWAP OP_DROP");

try {
  const explanation = SmartContract.explainScript(complexScript);
  console.log("   Script explanation:", explanation);
  
  const metrics = SmartContract.scriptMetrics(complexScript);
  console.log("   Script metrics:");
  console.log("     - Length:", metrics.length);
  console.log("     - Opcodes:", metrics.opcodeCount);
  console.log("     - Complexity:", metrics.complexity);
} catch (err) {
  console.log("   ⚠️ Analysis error:", err.message);
}

console.log("\n==================================");
console.log("🎉 Debug Tools Demo Complete!");
console.log("==================================");

console.log(`\n📊 SmartContract now has ${Object.keys(SmartContract).filter(k => 
  typeof SmartContract[k] === 'function'
).length} total methods with advanced debugging capabilities!`);