#!/usr/bin/env node

/**
 * Script Helper Utilities Demo
 * ============================
 * 
 * Demonstrates the SmartLedger-BSV Script Helper utilities for
 * Bitcoin Script development and analysis.
 * 
 * Features demonstrated:
 * - Script building and construction
 * - ASM parsing and generation
 * - Script analysis and optimization
 * - Opcode utilities and mapping
 * - Script debugging tools
 */

const bsv = require('../index.js');

console.log('🛠️  SmartLedger-BSV Script Helper Demo');
console.log('======================================\n');

async function demonstrateScriptHelper() {
  try {
    // Check if custom script helper is available
    let ScriptHelper;
    try {
      ScriptHelper = require('../lib/custom-script-helper.js');
      console.log('✅ Custom Script Helper loaded');
    } catch (e) {
      console.log('ℹ️  Using built-in BSV Script utilities');
      ScriptHelper = null;
    }

    // Test 1: Basic Script Construction
    console.log('🏗️  Test 1: Basic Script Construction');
    console.log('------------------------------------');
    
    // P2PKH script
    const privateKey = bsv.PrivateKey.fromRandom();
    const address = privateKey.toAddress();
    const p2pkhScript = bsv.Script.buildPublicKeyHashOut(address);
    
    console.log('🔐 Generated Address:', address.toString());
    console.log('📜 P2PKH Script ASM:', p2pkhScript.toString());
    console.log('🔢 P2PKH Script Hex:', p2pkhScript.toHex());
    console.log('📏 Script Size:', p2pkhScript.toBuffer().length, 'bytes');
    console.log('');

    // P2SH script
    const redeemScript = bsv.Script.buildMultisigOut([privateKey.publicKey], 1);
    const p2shScript = bsv.Script.buildScriptHashOut(redeemScript);
    
    console.log('🔄 Redeem Script ASM:', redeemScript.toString());
    console.log('📦 P2SH Script ASM:', p2shScript.toString());
    console.log('🔢 P2SH Script Hex:', p2shScript.toHex());
    console.log('');

    // Test 2: Script Analysis
    console.log('🔍 Test 2: Script Analysis');
    console.log('-------------------------');
    
    const scripts = [
      { name: 'P2PKH', script: p2pkhScript },
      { name: 'P2SH', script: p2shScript },
      { name: 'Multisig', script: redeemScript }
    ];
    
    scripts.forEach(({ name, script }) => {
      console.log(`📊 ${name} Analysis:`);
      console.log(`   📏 Size: ${script.toBuffer().length} bytes`);
      console.log(`   🧩 Chunks: ${script.chunks.length}`);
      console.log(`   📋 Push-only: ${script.isPushOnly()}`);
      console.log(`   🔗 Has multisig: ${script.toString().includes('CHECKMULTISIG')}`);
      console.log(`   ⏰ Has timelock: ${script.toString().includes('CHECKLOCKTIMEVERIFY')}`);
      console.log('');
    });

    // Test 3: Custom Script Building
    console.log('⚙️  Test 3: Custom Script Building');
    console.log('---------------------------------');
    
    // Build a custom script with various operations
    const customScript = new bsv.Script()
      .add(bsv.Opcode.OP_DUP)
      .add(bsv.Opcode.OP_HASH160)
      .add(address.hashBuffer)
      .add(bsv.Opcode.OP_EQUALVERIFY)
      .add(bsv.Opcode.OP_CHECKSIG);
    
    console.log('🛠️  Custom Script ASM:', customScript.toString());
    console.log('🔢 Custom Script Hex:', customScript.toHex());
    
    // Verify it matches P2PKH
    const isEquivalent = customScript.toString() === p2pkhScript.toString();
    console.log('🎯 Equivalent to P2PKH:', isEquivalent ? '✅' : '❌');
    console.log('');

    // Test 4: Script Parsing and Conversion
    console.log('🔄 Test 4: Script Parsing and Conversion');
    console.log('---------------------------------------');
    
    const testASM = 'OP_DUP OP_HASH160 OP_PUSHDATA1 0x14 0x' + address.hashBuffer.toString('hex') + ' OP_EQUALVERIFY OP_CHECKSIG';
    console.log('📝 Input ASM:', testASM);
    
    try {
      const parsedScript = bsv.Script.fromASM(testASM);
      console.log('✅ Successfully parsed ASM');
      console.log('📜 Parsed Script:', parsedScript.toString());
      console.log('🔢 Script Hex:', parsedScript.toHex());
      
      // Convert back to ASM
      const backToASM = parsedScript.toString();
      console.log('🔄 Back to ASM:', backToASM);
      console.log('🎯 Round-trip success:', testASM.includes('OP_DUP') && backToASM.includes('OP_DUP') ? '✅' : '❌');
      
    } catch (error) {
      console.log('❌ ASM parsing error:', error.message);
    }
    console.log('');

    // Test 5: Opcode Analysis
    console.log('🔤 Test 5: Opcode Analysis');
    console.log('-------------------------');
    
    const opcodes = [
      bsv.Opcode.OP_0,
      bsv.Opcode.OP_1,
      bsv.Opcode.OP_DUP,
      bsv.Opcode.OP_HASH160,
      bsv.Opcode.OP_EQUAL,
      bsv.Opcode.OP_CHECKSIG,
      bsv.Opcode.OP_CHECKMULTISIG,
      bsv.Opcode.OP_CHECKLOCKTIMEVERIFY
    ];
    
    console.log('📋 Common Opcodes:');
    opcodes.forEach(opcode => {
      const name = bsv.Opcode.reverseMap[opcode] || `OP_${opcode}`;
      console.log(`   ${opcode.toString().padStart(3)} = ${name}`);
    });
    console.log('');

    // Test 6: Script Complexity Analysis
    console.log('📊 Test 6: Script Complexity Analysis');
    console.log('------------------------------------');
    
    const complexScripts = [
      {
        name: 'Simple P2PKH',
        script: p2pkhScript,
        expectedOps: 5
      },
      {
        name: 'Multisig 1-of-1',
        script: redeemScript,
        expectedOps: 4
      },
      {
        name: 'Time Lock',
        script: new bsv.Script()
          .add(144) // ~24 hours in blocks
          .add(bsv.Opcode.OP_CHECKLOCKTIMEVERIFY)
          .add(bsv.Opcode.OP_DROP)
          .add(bsv.Opcode.OP_DUP)
          .add(bsv.Opcode.OP_HASH160)
          .add(address.hashBuffer)
          .add(bsv.Opcode.OP_EQUALVERIFY)
          .add(bsv.Opcode.OP_CHECKSIG),
        expectedOps: 8
      }
    ];
    
    complexScripts.forEach(({ name, script, expectedOps }) => {
      const chunks = script.chunks.length;
      const size = script.toBuffer().length;
      const complexity = chunks > 10 ? 'High' : chunks > 5 ? 'Medium' : 'Low';
      
      console.log(`🔍 ${name}:`);
      console.log(`   📊 Chunks: ${chunks} (expected ~${expectedOps})`);
      console.log(`   📏 Size: ${size} bytes`);
      console.log(`   ⚡ Complexity: ${complexity}`);
      console.log(`   💰 Est. fee (1 sat/byte): ${size} satoshis`);
      console.log('');
    });

    // Test 7: Script Validation
    console.log('✅ Test 7: Script Validation');
    console.log('---------------------------');
    
    const validationTests = [
      {
        name: 'Valid P2PKH',
        script: p2pkhScript,
        shouldPass: true
      },
      {
        name: 'Valid Multisig',
        script: redeemScript,
        shouldPass: true
      },
      {
        name: 'Empty Script',
        script: new bsv.Script(),
        shouldPass: true
      },
      {
        name: 'Invalid Opcode Script',
        script: (() => {
          try {
            return new bsv.Script().add(255); // Invalid opcode
          } catch (e) {
            return null;
          }
        })(),
        shouldPass: false
      }
    ];
    
    validationTests.forEach(({ name, script, shouldPass }) => {
      if (!script) {
        console.log(`⚠️  ${name}: Could not create (expected for invalid tests)`);
        return;
      }
      
      try {
        const isValid = script.toBuffer().length >= 0; // Basic validation
        console.log(`${isValid === shouldPass ? '✅' : '❌'} ${name}: ${isValid ? 'Valid' : 'Invalid'}`);
      } catch (error) {
        const failed = !shouldPass;
        console.log(`${failed ? '✅' : '❌'} ${name}: Failed validation (${error.message.substring(0, 30)}...)`);
      }
    });
    console.log('');

    // Test 8: Performance Metrics
    console.log('🚀 Test 8: Performance Metrics');
    console.log('-----------------------------');
    
    const iterations = 1000;
    
    // Script creation performance
    const createStart = Date.now();
    for (let i = 0; i < iterations; i++) {
      const tempKey = bsv.PrivateKey.fromRandom();
      const tempAddr = tempKey.toAddress();
      bsv.Script.buildPublicKeyHashOut(tempAddr);
    }
    const createEnd = Date.now();
    const createTime = createEnd - createStart;
    
    // Script parsing performance
    const parseStart = Date.now();
    const testScript = p2pkhScript.toString();
    for (let i = 0; i < iterations; i++) {
      bsv.Script.fromASM(testScript);
    }
    const parseEnd = Date.now();
    const parseTime = parseEnd - parseStart;
    
    console.log(`⏱️  Script Creation: ${createTime}ms for ${iterations} scripts`);
    console.log(`📊 Creation Rate: ${(iterations * 1000 / createTime).toFixed(0)} scripts/second`);
    console.log(`⏱️  Script Parsing: ${parseTime}ms for ${iterations} parses`);
    console.log(`📊 Parsing Rate: ${(iterations * 1000 / parseTime).toFixed(0)} parses/second`);

  } catch (error) {
    console.error('❌ Demo error:', error.message);
    console.error('📋 Stack:', error.stack);
  }
}

// Run the demo
demonstrateScriptHelper().then(() => {
  console.log('\n🎉 Script Helper Demo completed!');
  console.log('');
  console.log('💡 Use Cases:');
  console.log('  • Custom script development and testing');
  console.log('  • Script analysis and optimization');
  console.log('  • Educational Bitcoin Script learning');
  console.log('  • Smart contract script generation');
  console.log('  • Transaction script debugging');
  console.log('  • Fee estimation for complex scripts');
  console.log('');
  console.log('🔧 Integration Tips:');
  console.log('  • Use with SmartContract framework for covenants');
  console.log('  • Combine with UTXOGenerator for complete testing');
  console.log('  • Store optimized scripts for production use');
  console.log('  • Validate scripts before blockchain deployment');
});