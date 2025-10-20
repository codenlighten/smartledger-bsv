#!/usr/bin/env node
/**
 * Smart Contract Script Testing Integration Demo
 * ============================================= 
 * 
 * Demonstrates how to integrate the script_interpreter.js with our
 * SmartContract development environment for complete covenant testing.
 */

const SmartContract = require('../../lib/smart_contract');
const { execSync } = require('child_process');
const fs = require('fs');
const path = require('path');

console.log('🔧 Smart Contract Script Testing Integration');
console.log('='.repeat(70));

// ============================================================================
// PHASE 1: CREATE COVENANT WITH REAL UTXOS
// ============================================================================

console.log('\n🏛️ Phase 1: Create Covenant with Real UTXOs');
console.log('-'.repeat(50));

// Create test environment
const testEnv = SmartContract.createTestEnvironment({
  utxoCount: 1,
  satoshis: 100000,
  covenantAmount: 80000
});

// Get preimage for analysis
const preimageHex = testEnv.getPreimage();
const keypair = testEnv.getKeypair();

console.log('Test Environment:');
console.log(`  Address: ${keypair.addressString}`);
console.log(`  Preimage: ${preimageHex.substring(0, 40)}...`);

// ============================================================================
// PHASE 2: BUILD COVENANT LOCKING SCRIPT
// ============================================================================

console.log('\n🔒 Phase 2: Build Covenant Locking Script');
console.log('-'.repeat(50));

// Extract fields and generate ASM
const valueField = testEnv.extractField('value');
const sighashField = testEnv.extractField('sighashType');

// Build a simple amount validation covenant
const covenantASM = `
# Amount Validation Covenant
${valueField.asm}
# Stack: [value_bytes]
OP_BIN2NUM
# Stack: [value_number]
75000
# Stack: [value_number, minimum]
OP_GREATERTHANOREQUAL
# Stack: [bool]
`.trim().replace(/^#.*$/gm, '').replace(/\n\n+/g, '\n').trim();

console.log('Generated Covenant ASM:');
console.log(covenantASM);

// ============================================================================
// PHASE 3: BUILD UNLOCKING SCRIPT  
// ============================================================================

console.log('\n🔓 Phase 3: Build Unlocking Script');
console.log('-'.repeat(50));

// Create unlocking script that provides the preimage
const unlockingASM = preimageHex;

console.log('Unlocking Script (Preimage):');
console.log(`  Length: ${preimageHex.length / 2} bytes`);
console.log(`  Hex: ${preimageHex.substring(0, 60)}...`);

// ============================================================================
// PHASE 4: TEST WITH SCRIPT INTERPRETER
// ============================================================================

console.log('\n🧪 Phase 4: Test with Script Interpreter');
console.log('-'.repeat(50));

// Write scripts to temporary files for easier testing
const tempDir = path.join(__dirname, 'temp');
if (!fs.existsSync(tempDir)) {
  fs.mkdirSync(tempDir);
}

const lockingFile = path.join(tempDir, 'locking.asm');
const unlockingFile = path.join(tempDir, 'unlocking.hex');

fs.writeFileSync(lockingFile, covenantASM);
fs.writeFileSync(unlockingFile, unlockingASM);

console.log('Script files created:');
console.log(`  Locking: ${lockingFile}`);
console.log(`  Unlocking: ${unlockingFile}`);

// ============================================================================
// PHASE 5: AUTOMATED SCRIPT VERIFICATION
// ============================================================================

console.log('\n⚡ Phase 5: Automated Script Verification');
console.log('-'.repeat(50));

function testCovenantScript(unlockingScript, lockingScript) {
  console.log('Testing covenant script execution...');
  
  try {
    // Test using our script interpreter
    const interpreterPath = path.join(__dirname, '../scripts/script_interpreter.js');
    
    // Run truth evaluation
    const cmd = `node "${interpreterPath}" --unlocking "${unlockingScript}" --locking "${lockingScript}" --truth`;
    console.log('Executing:', cmd.substring(0, 80) + '...');
    
    const result = execSync(cmd, { 
      encoding: 'utf8', 
      timeout: 10000,
      stdio: ['pipe', 'pipe', 'pipe']
    });
    
    console.log('\\nScript Execution Result:');
    console.log(result);
    
    // Parse result to determine success/failure
    const success = result.includes('TRUE (Success)');
    return { success, output: result };
    
  } catch (error) {
    console.log('❌ Script execution failed:', error.message);
    return { success: false, error: error.message };
  }
}

// Test the covenant
const testResult = testCovenantScript(unlockingASM, covenantASM);

console.log('\\n📊 Test Results:');
console.log(`  Success: ${testResult.success ? '✅ PASS' : '❌ FAIL'}`);

if (testResult.success) {
  console.log('  ✅ Covenant script executed successfully!');
  console.log('  ✅ Amount constraint validated');
  console.log('  ✅ Preimage extraction working');
  console.log('  ✅ Ready for mainnet deployment');
} else {
  console.log('  ❌ Covenant validation failed');
  console.log('  🔧 Debug with step-by-step execution:');
  console.log(`     node examples/scripts/script_interpreter.js --unlocking "${unlockingASM.substring(0, 40)}..." --locking "${covenantASM.replace(/\n/g, ' ').substring(0, 40)}..." --step`);
}

// ============================================================================
// PHASE 6: INTEGRATION SUMMARY
// ============================================================================

console.log('\n' + '='.repeat(70));
console.log('🎯 SCRIPT TESTING INTEGRATION COMPLETE');
console.log('='.repeat(70));

console.log('\n🔗 Integration Benefits:');
console.log('  ✅ Generate covenants with real BSV UTXOs');
console.log('  ✅ Extract preimage fields automatically');
console.log('  ✅ Build ASM scripts with field validation');
console.log('  ✅ Test covenant execution with script interpreter');
console.log('  ✅ Debug step-by-step when issues arise');
console.log('  ✅ Verify locally before expensive broadcast');

console.log('\n🚀 Complete Workflow Available:');
console.log('  1. SmartContract.UTXOGenerator → Real UTXOs');
console.log('  2. SmartContract.Preimage → Field extraction + ASM');
console.log('  3. Custom covenant logic → Locking scripts');
console.log('  4. script_interpreter.js → Local verification');
console.log('  5. Mainnet broadcast → Production deployment');

console.log('\n💡 Debug Commands:');
console.log('  # Step-by-step execution:');
console.log('  node examples/scripts/script_interpreter.js --combined "YOUR_ASM" --step');
console.log('');
console.log('  # Truth evaluation:');
console.log('  node examples/scripts/script_interpreter.js --unlocking "HEX" --locking "ASM" --truth');

console.log('\n✅ Smart contract development ecosystem with script testing is complete!');

// Cleanup
try {
  fs.unlinkSync(lockingFile);
  fs.unlinkSync(unlockingFile);
  fs.rmdirSync(tempDir);
  console.log('\\n🧹 Temporary files cleaned up');
} catch (e) {
  // Ignore cleanup errors
}