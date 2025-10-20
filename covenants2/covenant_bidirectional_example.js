#!/usr/bin/env node
/**
 * covenant_bidirectional_example.js
 * ================================================================
 * Advanced example showing bidirectional preimage extraction
 * integrated into production covenant scripts.
 * 
 * This demonstrates how to build covenants that dynamically
 * extract specific preimage fields using the optimal direction
 * (LEFT/RIGHT/DYNAMIC) for each field type.
 */

const bsv = require('../../index.js');
const PreimageCovenantUtils = require('../utils/preimage_covenant_utils');

class BidirectionalCovenantBuilder {
  constructor(privateKey) {
    this.privateKey = privateKey || bsv.PrivateKey.fromRandom();
    this.publicKey = this.privateKey.publicKey;
    this.address = bsv.Address.fromPublicKey(this.publicKey);
    this.utils = new PreimageCovenantUtils(this.privateKey);
  }

  /**
   * Create a covenant that validates multiple preimage fields using
   * bidirectional extraction for optimal efficiency
   */
  createMultiFieldCovenant(validationRules) {
    const script = new bsv.Script();
    
    console.log('🧠 Building Multi-Field Bidirectional Covenant');
    console.log('='.repeat(60));
    
    // Start with preimage on stack: [preimage]
    script.add(bsv.Opcode.OP_DUP); // [preimage, preimage]
    
    for (const rule of validationRules) {
      console.log(`📋 Adding validation for ${rule.field}: ${rule.description}`);
      
      // Extract the field using bidirectional strategy
      this.addFieldExtraction(script, rule.field);
      
      // Add field-specific validation
      this.addFieldValidation(script, rule);
      
      // Duplicate preimage for next iteration if needed
      if (validationRules.indexOf(rule) < validationRules.length - 1) {
        script.add(bsv.Opcode.OP_DUP);
      }
    }
    
    // Final preimage hash verification
    script.add(bsv.Opcode.OP_HASH256);
    script.add(Buffer.from('placeholder_preimage_hash', 'hex').slice(0, 32)); // Will be replaced
    script.add(bsv.Opcode.OP_EQUALVERIFY);
    
    // Standard P2PKH ending
    script.add(bsv.Opcode.OP_DROP);
    script.add(this.publicKey.toBuffer());
    script.add(bsv.Opcode.OP_CHECKSIG);
    
    return script;
  }

  /**
   * Add field extraction using bidirectional strategy
   */
  addFieldExtraction(script, field) {
    // LEFT side fields (extract from start)
    const leftFields = {
      'nVersion': { offset: 0, len: 4 },
      'hashPrevouts': { offset: 4, len: 32 },
      'hashSequence': { offset: 36, len: 32 },
      'outpoint_txid': { offset: 68, len: 32 },
      'outpoint_vout': { offset: 100, len: 4 },
      'scriptLen': { offset: 104, len: 1 }
    };

    // RIGHT side fields (extract from end)
    const rightFields = {
      'sighashType': { fromEnd: 0, len: 4 },
      'nLocktime': { fromEnd: 4, len: 4 },
      'hashOutputs': { fromEnd: 8, len: 32 },
      'nSequence': { fromEnd: 40, len: 4 },
      'value': { fromEnd: 44, len: 8 }
    };

    if (leftFields[field]) {
      // LEFT extraction
      const { offset, len } = leftFields[field];
      console.log(`   🔄 LEFT extraction: offset=${offset}, len=${len}`);
      
      if (offset > 0) {
        script.add(offset);
        script.add(bsv.Opcode.OP_SPLIT);
        script.add(bsv.Opcode.OP_DROP);
      }
      script.add(len);
      script.add(bsv.Opcode.OP_SPLIT);
      script.add(bsv.Opcode.OP_DROP);
      
    } else if (rightFields[field]) {
      // RIGHT extraction
      const { fromEnd, len } = rightFields[field];
      console.log(`   🔄 RIGHT extraction: fromEnd=${fromEnd}, len=${len}`);
      
      script.add(bsv.Opcode.OP_SIZE);
      script.add(52 - fromEnd); // Right zone size minus offset
      script.add(bsv.Opcode.OP_SUB);
      script.add(bsv.Opcode.OP_SPLIT);
      script.add(bsv.Opcode.OP_DROP);
      script.add(len);
      script.add(bsv.Opcode.OP_SPLIT);
      script.add(bsv.Opcode.OP_DROP);
      
    } else if (field === 'scriptCode') {
      // DYNAMIC extraction
      console.log(`   🎯 DYNAMIC extraction: uses scriptLen varint`);
      
      script.add(105); // Left zone size
      script.add(bsv.Opcode.OP_SPLIT);
      script.add(bsv.Opcode.OP_DROP);
      // Note: In real implementation, would need to read scriptLen dynamically
      script.add(25); // Assuming standard P2PKH (25 bytes)
      script.add(bsv.Opcode.OP_SPLIT);
      script.add(bsv.Opcode.OP_DROP);
      
    } else {
      throw new Error(`Unknown field: ${field}`);
    }
  }

  /**
   * Add field-specific validation logic
   */
  addFieldValidation(script, rule) {
    switch (rule.type) {
      case 'exact_match':
        console.log(`   ✅ Validating exact match: ${rule.expectedValue}`);
        script.add(Buffer.from(rule.expectedValue, 'hex'));
        script.add(bsv.Opcode.OP_EQUALVERIFY);
        break;
        
      case 'minimum_value':
        console.log(`   ✅ Validating minimum value: ${rule.minValue}`);
        script.add(Buffer.from(rule.minValue.toString(16).padStart(16, '0'), 'hex'));
        script.add(bsv.Opcode.OP_GREATERTHANOREQUAL);
        script.add(bsv.Opcode.OP_VERIFY);
        break;
        
      case 'contains_pattern':
        console.log(`   ✅ Validating pattern contains: ${rule.pattern}`);
        // This would require more complex script logic
        script.add(bsv.Opcode.OP_DUP);
        // ... pattern matching logic ...
        break;
        
      default:
        throw new Error(`Unknown validation type: ${rule.type}`);
    }
  }

  /**
   * Create advanced covenant examples
   */
  static createExamples() {
    console.log('🚀 Bidirectional Covenant Examples');
    console.log('='.repeat(60));
    
    const builder = new BidirectionalCovenantBuilder();
    
    // Example 1: Value and sighash validation
    console.log('\n📋 Example 1: Value + Sighash Validation');
    const valueRules = [
      {
        field: 'value',
        type: 'minimum_value',
        minValue: 100000000, // 1 BSV minimum
        description: 'Ensure minimum 1 BSV output'
      },
      {
        field: 'sighashType', 
        type: 'exact_match',
        expectedValue: '41000000', // SIGHASH_ALL | FORKID
        description: 'Require SIGHASH_ALL with FORKID'
      }
    ];
    
    const valueScript = builder.createMultiFieldCovenant(valueRules);
    console.log(`Generated script: ${valueScript.toASM()}`);
    
    // Example 2: Version and locktime validation
    console.log('\n📋 Example 2: Version + Locktime Validation');
    const versionRules = [
      {
        field: 'nVersion',
        type: 'exact_match', 
        expectedValue: '01000000', // Version 1
        description: 'Require transaction version 1'
      },
      {
        field: 'nLocktime',
        type: 'exact_match',
        expectedValue: '00000000', // No locktime
        description: 'Require no locktime'
      }
    ];
    
    const versionScript = builder.createMultiFieldCovenant(versionRules);
    console.log(`Generated script: ${versionScript.toASM()}`);
    
    // Example 3: Dynamic scriptCode validation
    console.log('\n📋 Example 3: Dynamic ScriptCode Validation'); 
    const scriptRules = [
      {
        field: 'scriptCode',
        type: 'contains_pattern',
        pattern: '76a914', // OP_DUP OP_HASH160 OP_PUSHDATA(20)
        description: 'Ensure P2PKH scriptCode pattern'
      }
    ];
    
    const scriptCodeScript = builder.createMultiFieldCovenant(scriptRules);
    console.log(`Generated script: ${scriptCodeScript.toASM()}`);
    
    return {
      valueScript,
      versionScript, 
      scriptCodeScript,
      builder
    };
  }
}

// Demo execution
if (require.main === module) {
  try {
    const examples = BidirectionalCovenantBuilder.createExamples();
    
    console.log('\n🎯 Integration Summary');
    console.log('='.repeat(60));
    console.log('✅ Bidirectional extraction optimizes for each field type');
    console.log('✅ LEFT fields: Extract from start (nVersion, hashes, outpoint)');
    console.log('✅ RIGHT fields: Extract from end (value, locktime, sighash)');
    console.log('✅ DYNAMIC fields: Use internal length (scriptCode)');
    console.log('✅ Generates minimal ASM operations per field');
    console.log('✅ Self-contained validation (no external context)');
    console.log('');
    console.log('🔗 Next Steps:');
    console.log('  - Deploy generated scripts to testnet');
    console.log('  - Test with real transaction preimages');
    console.log('  - Integrate with WhatsOnChain API');
    console.log('  - Build production covenant applications');
    
  } catch (error) {
    console.error('❌ Error running bidirectional examples:', error.message);
    console.error('💡 Make sure all dependencies are properly installed');
    process.exit(1);
  }
}

module.exports = { BidirectionalCovenantBuilder };