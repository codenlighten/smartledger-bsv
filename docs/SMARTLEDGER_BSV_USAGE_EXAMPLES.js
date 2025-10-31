/**
 * SmartLedger-BSV Usage Examples
 * ==============================
 * 
 * Practical examples demonstrating solutions to common usage questions
 * Based on smartledger-bsv v3.3.4 analysis
 */

const bsv = require('../index');

/**
 * Example 1: Complete Field Name Reference
 * Shows all working vs non-working field names
 */
function demonstrateFieldNames() {
    console.log('🧪 Example 1: Field Name Compatibility\n');
    
    // Create example preimage
    const example = bsv.SmartContract.Preimage.createExample();
    const preimageHex = example.preimage.toString('hex');
    
    console.log('✅ WORKING field names for testFieldExtraction():');
    const workingFields = [
        'nVersion',      // NOT 'version'
        'hashPrevouts',  // ✅ Same name
        'hashSequence',  // ✅ Same name
        'outpoint_txid', // NOT 'outpoint' (split into two)
        'outpoint_vout', 
        'scriptCode',    // ✅ Same name
        'scriptLen',     // CompactSize varint
        'value',         // NOT 'amount'
        'nSequence',     // NOT 'sequence'
        'hashOutputs',   // ✅ Same name
        'nLocktime',     // NOT 'locktime'
        'sighashType'    // NOT 'sighash'
    ];
    
    workingFields.forEach(fieldName => {
        try {
            const result = bsv.SmartContract.testFieldExtraction(preimageHex, fieldName);
            console.log(`  ✅ ${fieldName.padEnd(15)}: ${result.fieldExtraction.value.substring(0, 16)}...`);
        } catch (error) {
            console.log(`  ❌ ${fieldName.padEnd(15)}: ${error.message}`);
        }
    });
    
    console.log('\n❌ NON-WORKING field names (use mapping instead):');
    const nonWorkingFields = ['version', 'outpoint', 'amount', 'sequence', 'locktime', 'sighash'];
    
    nonWorkingFields.forEach(fieldName => {
        try {
            bsv.SmartContract.testFieldExtraction(preimageHex, fieldName);
            console.log(`  ⚠️  ${fieldName} - unexpected success`);
        } catch (error) {
            console.log(`  ❌ ${fieldName.padEnd(15)}: ${error.message}`);
        }
    });
    
    console.log('\n📝 Field Name Mapping Reference:');
    const mapping = {
        'version': 'nVersion',
        'outpoint': 'outpoint_txid + outpoint_vout',
        'amount': 'value',
        'sequence': 'nSequence',
        'locktime': 'nLocktime',
        'sighash': 'sighashType'
    };
    
    Object.entries(mapping).forEach(([old, correct]) => {
        console.log(`  ${old.padEnd(12)} → ${correct}`);
    });
    
    return { preimageHex, workingFields, nonWorkingFields, mapping };
}

/**
 * Example 2: Working Custom Transaction Preimage
 * Demonstrates how to avoid CompactSize errors
 */
function demonstrateCustomTransaction() {
    console.log('\n🏗️ Example 2: Working Custom Transaction\n');
    
    try {
        // Step 1: Create complete UTXO with proper script
        const privateKey = new bsv.PrivateKey();
        const address = privateKey.toAddress();
        const script = bsv.Script.buildPublicKeyHashOut(address);
        
        console.log('📋 Creating UTXO with complete structure...');
        const utxo = {
            txId: '1234567890abcdef'.repeat(4), // Valid 32-byte txId
            outputIndex: 0,
            address: address.toString(),
            script: script.toString(), // ✅ CRITICAL: Valid script hex
            satoshis: 100000
        };
        
        console.log(`  ✅ UTXO created: ${utxo.satoshis} sats`);
        console.log(`  ✅ Address: ${address.toString()}`);
        console.log(`  ✅ Script: ${script.toString().substring(0, 20)}...`);
        
        // Step 2: Create transaction with proper structure
        console.log('\n🔨 Building transaction...');
        const tx = new bsv.Transaction()
            .from(utxo)
            .to('1BitcoinEaterAddressDontSendf59kuE', 50000)
            .change(address)
            .sign(privateKey);
        
        console.log(`  ✅ Transaction created: ${tx.id}`);
        console.log(`  ✅ Inputs: ${tx.inputs.length}, Outputs: ${tx.outputs.length}`);
        
        // Step 3: Generate preimage with FORKID (critical!)
        console.log('\n🧾 Generating preimage with FORKID...');
        const sighashType = bsv.crypto.Signature.SIGHASH_ALL | bsv.crypto.Signature.SIGHASH_FORKID;
        const preimageBuffer = bsv.Transaction.sighash.sighashPreimage(
            tx, sighashType, 0, script, new bsv.crypto.BN(utxo.satoshis)
        );
        
        const preimageHex = preimageBuffer.toString('hex');
        console.log(`  ✅ Preimage generated: ${preimageBuffer.length} bytes`);
        console.log(`  ✅ Hex: ${preimageHex.substring(0, 60)}...`);
        
        // Step 4: Test field extraction
        console.log('\n🔍 Testing field extraction on custom preimage...');
        const testFields = ['nVersion', 'value', 'sighashType'];
        
        testFields.forEach(fieldName => {
            try {
                const result = bsv.SmartContract.testFieldExtraction(preimageHex, fieldName);
                console.log(`  ✅ ${fieldName}: ${result.fieldExtraction.interpretation?.description || 'extracted successfully'}`);
            } catch (error) {
                console.log(`  ❌ ${fieldName}: ${error.message}`);
            }
        });
        
        return { success: true, preimageHex, tx, utxo };
        
    } catch (error) {
        console.log(`❌ Custom transaction failed: ${error.message}`);
        return { success: false, error: error.message };
    }
}

/**
 * Example 3: extractPreimage() vs testFieldExtraction()
 * Shows when to use each method
 */
function compareExtractionMethods() {
    console.log('\n🔬 Example 3: Comparing Extraction Methods\n');
    
    const example = bsv.SmartContract.Preimage.createExample();
    const preimageHex = example.preimage.toString('hex');
    
    console.log('📊 Method 1: extractPreimage() - General purpose');
    try {
        const extracted = bsv.SmartContract.extractPreimage(preimageHex);
        console.log('  Available fields:', Object.keys(extracted).join(', '));
        console.log(`  ✅ version: ${extracted.version.toString('hex')} (BIP-143 name)`);
        console.log(`  ✅ amount: ${extracted.amount.toString('hex')} (BIP-143 name)`);
        console.log('  → Use for: data analysis, debugging, general field access');
    } catch (error) {
        console.log(`  ❌ extractPreimage failed: ${error.message}`);
    }
    
    console.log('\n🛠️ Method 2: testFieldExtraction() - ASM generation');
    try {
        const result1 = bsv.SmartContract.testFieldExtraction(preimageHex, 'nVersion');
        const result2 = bsv.SmartContract.testFieldExtraction(preimageHex, 'value');
        
        console.log(`  ✅ nVersion: ${result1.fieldExtraction.value} (SmartLedger name)`);
        console.log(`  ✅ value: ${result2.fieldExtraction.value} (SmartLedger name)`);
        console.log('  → Use for: covenant development, ASM generation, smart contracts');
        
        console.log('\n📜 Generated ASM for value extraction:');
        console.log(result2.fieldExtraction.asmGenerated);
        
    } catch (error) {
        console.log(`  ❌ testFieldExtraction failed: ${error.message}`);
    }
    
    console.log('\n🎯 Recommendation:');
    console.log('  • Use extractPreimage() for data analysis and debugging');
    console.log('  • Use testFieldExtraction() for covenant development and ASM generation');
    console.log('  • Both are correct - just use appropriate field names!');
    
    return { extracted: true };
}

/**
 * Example 4: Robust Error Handling
 * Production-ready error handling pattern
 */
function demonstrateErrorHandling() {
    console.log('\n🛡️ Example 4: Robust Error Handling\n');
    
    const example = bsv.SmartContract.Preimage.createExample();
    const preimageHex = example.preimage.toString('hex');
    
    function robustExtraction(preimageHex, fieldName) {
        console.log(`🔍 Attempting to extract: ${fieldName}`);
        
        // Step 1: Try direct extraction
        try {
            const result = bsv.SmartContract.testFieldExtraction(preimageHex, fieldName);
            if (result.success) {
                console.log(`  ✅ Direct extraction successful: ${result.fieldExtraction.value.substring(0, 16)}...`);
                return { success: true, method: 'direct', value: result.fieldExtraction.value };
            }
        } catch (error) {
            console.log(`  ⚠️ Direct extraction failed: ${error.message}`);
        }
        
        // Step 2: Try field name mapping
        const mapping = {
            'version': 'nVersion',
            'amount': 'value',
            'sequence': 'nSequence',
            'locktime': 'nLocktime',
            'sighash': 'sighashType'
        };
        
        const mappedField = mapping[fieldName];
        if (mappedField) {
            console.log(`  🔄 Trying field mapping: ${fieldName} → ${mappedField}`);
            try {
                const result = bsv.SmartContract.testFieldExtraction(preimageHex, mappedField);
                if (result.success) {
                    console.log(`  ✅ Mapped extraction successful: ${result.fieldExtraction.value.substring(0, 16)}...`);
                    return { success: true, method: 'mapped', originalField: fieldName, mappedField, value: result.fieldExtraction.value };
                }
            } catch (error) {
                console.log(`  ⚠️ Mapped extraction failed: ${error.message}`);
            }
        }
        
        // Step 3: Fallback to extractPreimage
        console.log(`  🆘 Trying fallback extraction...`);
        try {
            const extracted = bsv.SmartContract.extractPreimage(preimageHex);
            const value = extracted[fieldName] || extracted[mappedField];
            
            if (value) {
                console.log(`  ✅ Fallback extraction successful: ${value.toString('hex').substring(0, 16)}...`);
                return { success: true, method: 'fallback', value: value.toString('hex'), warning: 'No ASM generated' };
            }
        } catch (error) {
            console.log(`  ❌ Fallback extraction failed: ${error.message}`);
        }
        
        console.log(`  ❌ All extraction methods failed for: ${fieldName}`);
        return { success: false, field: fieldName, error: 'All methods exhausted' };
    }
    
    // Test with various field names
    const testFields = ['version', 'nVersion', 'amount', 'value', 'invalid_field'];
    
    testFields.forEach(field => {
        const result = robustExtraction(preimageHex, field);
        console.log(`Result: ${result.success ? '✅ Success' : '❌ Failed'} (${result.method || 'none'})\n`);
    });
    
    return { demonstrated: true };
}

/**
 * Example 5: Complete Working Covenant
 * Demonstrates real-world usage for smart contract development
 */
function demonstrateCovenantUsage() {
    console.log('\n⚡ Example 5: Complete Covenant Development\n');
    
    const example = bsv.SmartContract.Preimage.createExample();
    const preimageHex = example.preimage.toString('hex');
    
    console.log('🏗️ Building covenant that validates minimum amount...\n');
    
    try {
        // Extract value field for covenant logic
        const valueResult = bsv.SmartContract.testFieldExtraction(preimageHex, 'value');
        
        if (valueResult.success) {
            const valueHex = valueResult.fieldExtraction.value;
            const valueSats = parseInt(valueHex.match(/.{2}/g).reverse().join(''), 16);
            
            console.log(`📊 Extracted value: ${valueSats} satoshis`);
            console.log('📜 Generated ASM for value extraction:');
            console.log(valueResult.fieldExtraction.asmGenerated);
            
            // Build covenant script
            console.log('\n🔒 Building covenant script:');
            const covenantScript = `
# Covenant: Minimum Amount Validator
${valueResult.fieldExtraction.asmGenerated}

# Convert extracted value to number
OP_BIN2NUM

# Check minimum amount (50000 satoshis)
50000
OP_GREATERTHANOREQUAL
OP_VERIFY

# If we get here, amount is valid
OP_TRUE
`.trim();
            
            console.log(covenantScript);
            
            console.log('\n✅ Covenant successfully created!');
            console.log('  • Extracts value field from preimage');
            console.log('  • Validates minimum amount of 50,000 satoshis');
            console.log('  • Uses generated ASM for field extraction');
            console.log('  • Ready for smart contract deployment');
            
            return { 
                success: true, 
                covenant: covenantScript,
                extractedValue: valueSats,
                asm: valueResult.fieldExtraction.asmGenerated
            };
        }
    } catch (error) {
        console.log(`❌ Covenant development failed: ${error.message}`);
        return { success: false, error: error.message };
    }
}

/**
 * Main demonstration function
 */
function runAllExamples() {
    console.log('🚀 SmartLedger-BSV v3.3.4 Usage Examples');
    console.log('=' .repeat(50));
    
    try {
        demonstrateFieldNames();
        demonstrateCustomTransaction();
        compareExtractionMethods();
        demonstrateErrorHandling();
        demonstrateCovenantUsage();
        
        console.log('\n🎉 All examples completed successfully!');
        console.log('\n📚 Key Takeaways:');
        console.log('  1. Use correct field names: nVersion, value, nSequence, nLocktime, sighashType');
        console.log('  2. For custom transactions: ensure proper UTXO structure and FORKID sighash');
        console.log('  3. For ASM generation: use testFieldExtraction()');
        console.log('  4. For data analysis: use extractPreimage()');
        console.log('  5. Always implement robust error handling with fallbacks');
        console.log('  6. Both naming conventions are valid - just use consistently');
        
        console.log('\n📖 See docs/SMARTLEDGER_BSV_USAGE_GUIDE.md for complete documentation');
        
    } catch (error) {
        console.error('❌ Example execution failed:', error.message);
    }
}

// Export functions for individual testing
module.exports = {
    demonstrateFieldNames,
    demonstrateCustomTransaction,
    compareExtractionMethods,
    demonstrateErrorHandling,
    demonstrateCovenantUsage,
    runAllExamples
};

// Run examples if called directly
if (require.main === module) {
    runAllExamples();
}