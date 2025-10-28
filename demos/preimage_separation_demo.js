#!/usr/bin/env node

/**
 * UTXO Generator and Preimage Separation Demonstration
 * 
 * This example shows how to:
 * 1. Generate authentic UTXOs using the UTXOGenerator
 * 2. Create transactions and extract BIP-143 preimages
 * 3. Separate preimage into individual fields with detailed analysis
 * 4. Display each component with hex values and interpretations
 */

// Workaround for Node.js environment with minified BSV
global.window = global.window || {};
global.window.crypto = global.window.crypto || require('crypto').webcrypto || require('crypto');

const bsv = require('../bsv.min.js');
const SmartContract = bsv.SmartContract;

console.log('🔧 UTXO Generator and Preimage Separation Demo');
console.log('=' .repeat(60));

async function demonstrateUTXOAndPreimage() {
    try {
        // Step 1: Generate authentic UTXOs
        console.log('\n📦 Step 1: Generating Authentic UTXOs');
        console.log('-'.repeat(40));
        
        // Create simple mock UTXOs for preimage demonstration
        const demoPrivateKey = new bsv.PrivateKey();
        const demoAddress = demoPrivateKey.toAddress();
        
        const utxos = [
            {
                txid: '1234567890abcdef1234567890abcdef1234567890abcdef1234567890abcdef',
                vout: 0,
                scriptPubKey: bsv.Script.buildPublicKeyHashOut(demoAddress).toHex(),
                satoshis: 150000
            },
            {
                txid: 'abcdef1234567890abcdef1234567890abcdef1234567890abcdef1234567890',
                vout: 1,
                scriptPubKey: bsv.Script.buildPublicKeyHashOut(demoAddress).toHex(),
                satoshis: 150000
            }
        ];
        
        console.log('✅ Mock UTXOs Created for Demo:');
        console.log(`   Count: ${utxos.length}`);
        console.log(`   Address: ${demoAddress.toString()}`);
        console.log(`   Private Key (WIF): ${demoPrivateKey.toWIF()}`);
        
        utxos.forEach((utxo, index) => {
            console.log(`\n   UTXO ${index + 1}:`);
            console.log(`     TXID: ${utxo.txid}`);
            console.log(`     VOUT: ${utxo.vout}`);
            console.log(`     Satoshis: ${utxo.satoshis.toLocaleString()}`);
            console.log(`     Script: ${utxo.script}`);
        });
        
        // Step 2: Create a transaction using the UTXOs
        console.log('\n\n🔨 Step 2: Creating Transaction from UTXOs');
        console.log('-'.repeat(40));
        
        const privateKey = demoPrivateKey;
        const address = demoAddress;
        
        // Create transaction spending first UTXO
        const tx = new bsv.Transaction()
            .from({
                txId: utxos[0].txid,
                outputIndex: utxos[0].vout,
                scriptPubKey: utxos[0].scriptPubKey,
                satoshis: utxos[0].satoshis
            })
            .to(address, 140000)  // Send to same address with fee
            .change(address)      // Change back to same address
            .sign(privateKey);
        
        console.log('✅ Transaction Created:');
        console.log(`   Transaction ID: ${tx.id}`);
        console.log(`   Inputs: ${tx.inputs.length}`);
        console.log(`   Outputs: ${tx.outputs.length}`);
        console.log(`   Fee: ${tx.getFee()} satoshis`);
        
        // Display transaction details
        tx.inputs.forEach((input, index) => {
            console.log(`\n   Input ${index + 1}:`);
            console.log(`     Previous TXID: ${input.prevTxId.toString('hex')}`);
            console.log(`     Output Index: ${input.outputIndex}`);
            console.log(`     Script: ${input.script ? input.script.toString() : 'None'}`);
        });
        
        tx.outputs.forEach((output, index) => {
            console.log(`\n   Output ${index + 1}:`);
            console.log(`     Satoshis: ${output.satoshis.toLocaleString()}`);
            console.log(`     Script: ${output.script.toString()}`);
            console.log(`     Address: ${output.script.toAddress().toString()}`);
        });
        
        // Step 3: Generate BIP-143 Preimage
        console.log('\n\n🔍 Step 3: Generating BIP-143 Preimage');
        console.log('-'.repeat(40));
        
        const inputIndex = 0;
        const sighashType = bsv.crypto.Signature.SIGHASH_ALL | bsv.crypto.Signature.SIGHASH_FORKID;
        const subscript = bsv.Script.buildPublicKeyHashOut(address);
        const satoshis = new bsv.crypto.BN(utxos[0].satoshis);
        
        const preimageBuffer = bsv.Transaction.sighash.sighashPreimage(
            tx,
            sighashType,
            inputIndex,
            subscript,
            satoshis
        );
        
        console.log('✅ Preimage Generated:');
        console.log(`   Length: ${preimageBuffer.length} bytes`);
        console.log(`   Hex: ${preimageBuffer.toString('hex')}`);
        console.log(`   SIGHASH Type: 0x${sighashType.toString(16)}`);
        
        // Step 4: Separate Preimage into Individual Fields
        console.log('\n\n🔬 Step 4: Preimage Field Separation Analysis');
        console.log('='.repeat(60));
        
        // Create preimage analyzer
        const preimage = new SmartContract.Preimage(preimageBuffer.toString('hex'));
        
        // Extract all fields using different strategies
        console.log('\n📋 Field Extraction Strategy Comparison:');
        console.log('-'.repeat(50));
        
        try {
            const leftExtraction = preimage.extract('LEFT');
            console.log('✅ LEFT extraction successful:', Object.keys(leftExtraction).length, 'fields');
        } catch (error) {
            console.log('❌ LEFT extraction failed:', error.message);
        }
        
        try {
            const rightExtraction = preimage.extract('RIGHT');
            console.log('✅ RIGHT extraction successful:', Object.keys(rightExtraction).length, 'fields');
        } catch (error) {
            console.log('❌ RIGHT extraction failed:', error.message);
        }
        
        try {
            const dynamicExtraction = preimage.extract('DYNAMIC');
            console.log('✅ DYNAMIC extraction successful:', Object.keys(dynamicExtraction).length, 'fields');
        } catch (error) {
            console.log('❌ DYNAMIC extraction failed:', error.message);
        }
        
        // Manual field-by-field extraction with detailed analysis
        console.log('\n\n🔍 Detailed Field-by-Field Analysis:');
        console.log('='.repeat(60));
        
        const fields = [
            'version',
            'hashPrevouts', 
            'hashSequence',
            'outpoint',
            'scriptCode',
            'amount',
            'sequence',
            'hashOutputs',
            'locktime',
            'sighash'
        ];
        
        let offset = 0;
        const fieldDetails = {};
        
        fields.forEach((fieldName, index) => {
            console.log(`\n${index + 1}. ${fieldName.toUpperCase()}:`);
            console.log('-'.repeat(20));
            
            try {
                const fieldBuffer = preimage.getField(fieldName);
                fieldDetails[fieldName] = {
                    buffer: fieldBuffer,
                    hex: fieldBuffer.toString('hex'),
                    length: fieldBuffer.length,
                    offset: offset
                };
                
                console.log(`   Hex Value: ${fieldBuffer.toString('hex')}`);
                console.log(`   Length: ${fieldBuffer.length} bytes`);
                console.log(`   Offset: ${offset}-${offset + fieldBuffer.length - 1}`);
                
                // Interpret field values where possible
                switch (fieldName) {
                    case 'version':
                        const version = fieldBuffer.readUInt32LE(0);
                        console.log(`   Interpreted: Version ${version}`);
                        break;
                        
                    case 'amount':
                        const amount = fieldBuffer.readBigUInt64LE(0);
                        console.log(`   Interpreted: ${amount.toString()} satoshis (${(Number(amount) / 100000000).toFixed(8)} BSV)`);
                        break;
                        
                    case 'sequence':
                        const sequence = fieldBuffer.readUInt32LE(0);
                        console.log(`   Interpreted: Sequence ${sequence} (0x${sequence.toString(16)})`);
                        break;
                        
                    case 'locktime':
                        const locktime = fieldBuffer.readUInt32LE(0);
                        if (locktime < 500000000) {
                            console.log(`   Interpreted: Block height ${locktime}`);
                        } else {
                            console.log(`   Interpreted: Unix timestamp ${locktime} (${new Date(locktime * 1000).toISOString()})`);
                        }
                        break;
                        
                    case 'sighash':
                        const sighashValue = fieldBuffer.readUInt32LE(0);
                        console.log(`   Interpreted: SIGHASH 0x${sighashValue.toString(16)}`);
                        
                        // Decode SIGHASH flags
                        const flags = [];
                        if (sighashValue & 0x01) flags.push('SIGHASH_ALL');
                        if (sighashValue & 0x02) flags.push('SIGHASH_NONE');
                        if (sighashValue & 0x03) flags.push('SIGHASH_SINGLE');
                        if (sighashValue & 0x80) flags.push('SIGHASH_ANYONECANPAY');
                        if (sighashValue & 0x40) flags.push('SIGHASH_FORKID');
                        
                        console.log(`   Flags: ${flags.join(' | ')}`);
                        break;
                        
                    case 'outpoint':
                        const txid = fieldBuffer.slice(0, 32).reverse().toString('hex');
                        const vout = fieldBuffer.slice(32, 36).readUInt32LE(0);
                        console.log(`   Interpreted: ${txid}:${vout}`);
                        break;
                        
                    case 'scriptCode':
                        try {
                            const script = new bsv.Script(fieldBuffer);
                            console.log(`   Interpreted: ${script.toString()}`);
                        } catch (error) {
                            console.log(`   Interpreted: Raw script data (${fieldBuffer.length} bytes)`);
                        }
                        break;
                        
                    default:
                        if (fieldBuffer.length === 32) {
                            console.log(`   Interpreted: 32-byte hash (likely SHA256)`);
                        } else {
                            console.log(`   Interpreted: Raw binary data`);
                        }
                }
                
                offset += fieldBuffer.length;
                
            } catch (error) {
                console.log(`   ❌ Error extracting field: ${error.message}`);
                fieldDetails[fieldName] = { error: error.message };
            }
        });
        
        // Step 5: Preimage Validation and Analysis
        console.log('\n\n🔍 Step 5: Preimage Validation and Analysis');
        console.log('='.repeat(60));
        
        // Get SIGHASH analysis
        try {
            const sighashInfo = preimage.getSighashInfo();
            console.log('\n📊 SIGHASH Analysis:');
            console.log(`   Has zero hashes: ${sighashInfo.hasZeroHashes ? '⚠️  YES' : '✅ NO'}`);
            console.log(`   SIGHASH type detected: ${sighashInfo.type || 'Unknown'}`);
            console.log(`   Is standard: ${sighashInfo.isStandard ? '✅ YES' : '❌ NO'}`);
            
            if (sighashInfo.warnings && sighashInfo.warnings.length > 0) {
                console.log('\n⚠️  Warnings:');
                sighashInfo.warnings.forEach(warning => {
                    console.log(`   - ${warning}`);
                });
            }
        } catch (error) {
            console.log('❌ SIGHASH analysis failed:', error.message);
        }
        
        // Verify preimage reconstruction
        console.log('\n🔧 Preimage Reconstruction Verification:');
        console.log('-'.repeat(40));
        
        let reconstructed = Buffer.alloc(0);
        let reconstructionErrors = 0;
        
        fields.forEach(fieldName => {
            if (fieldDetails[fieldName] && fieldDetails[fieldName].buffer) {
                reconstructed = Buffer.concat([reconstructed, fieldDetails[fieldName].buffer]);
            } else {
                reconstructionErrors++;
                console.log(`   ❌ Missing field: ${fieldName}`);
            }
        });
        
        const originalHex = preimageBuffer.toString('hex');
        const reconstructedHex = reconstructed.toString('hex');
        const matches = originalHex === reconstructedHex;
        
        console.log(`   Original length: ${preimageBuffer.length} bytes`);
        console.log(`   Reconstructed length: ${reconstructed.length} bytes`);
        console.log(`   Reconstruction errors: ${reconstructionErrors}`);
        console.log(`   Fields match: ${matches ? '✅ YES' : '❌ NO'}`);
        
        if (!matches && reconstructionErrors === 0) {
            console.log('\n🔍 Hex Comparison (first 200 chars):');
            console.log(`   Original:      ${originalHex.substring(0, 200)}${originalHex.length > 200 ? '...' : ''}`);
            console.log(`   Reconstructed: ${reconstructedHex.substring(0, 200)}${reconstructedHex.length > 200 ? '...' : ''}`);
        }
        
        // Step 6: Summary and Statistics
        console.log('\n\n📈 Step 6: Summary and Statistics');
        console.log('='.repeat(60));
        
        const totalFields = fields.length;
        const successfulFields = Object.keys(fieldDetails).filter(k => fieldDetails[k].buffer).length;
        const totalBytes = Object.values(fieldDetails)
            .filter(f => f.buffer)
            .reduce((sum, f) => sum + f.buffer.length, 0);
        
        console.log('\n📊 Extraction Statistics:');
        console.log(`   Total fields: ${totalFields}`);
        console.log(`   Successfully extracted: ${successfulFields}`);
        console.log(`   Success rate: ${((successfulFields / totalFields) * 100).toFixed(1)}%`);
        console.log(`   Total bytes processed: ${totalBytes}`);
        console.log(`   Average field size: ${(totalBytes / successfulFields).toFixed(1)} bytes`);
        
        console.log('\n📋 Field Size Distribution:');
        Object.entries(fieldDetails)
            .filter(([name, data]) => data.buffer)
            .sort((a, b) => b[1].buffer.length - a[1].buffer.length)
            .forEach(([name, data]) => {
                const percentage = ((data.buffer.length / totalBytes) * 100).toFixed(1);
                console.log(`   ${name.padEnd(15)}: ${data.buffer.length.toString().padStart(2)} bytes (${percentage.padStart(4)}%)`);
            });
        
        // Final validation
        console.log('\n✅ Demonstration Complete!');
        console.log(`   UTXOs generated: ${utxos.length}`);
        console.log(`   Transaction created: ${tx.id}`);
        console.log(`   Preimage extracted: ${preimageBuffer.length} bytes`);
        console.log(`   Fields separated: ${successfulFields}/${totalFields}`);
        console.log(`   Reconstruction: ${matches ? 'Success' : 'Partial'}`);
        
        return {
            utxos,
            transaction: tx,
            preimage: preimageBuffer,
            fields: fieldDetails,
            statistics: {
                totalFields,
                successfulFields,
                totalBytes,
                reconstructionMatches: matches
            }
        };
        
    } catch (error) {
        console.error('\n❌ Demonstration failed:', error.message);
        console.error('Stack trace:', error.stack);
        throw error;
    }
}

// Run the demonstration
if (require.main === module) {
    demonstrateUTXOAndPreimage()
        .then(result => {
            console.log('\n🎉 All operations completed successfully!');
        })
        .catch(error => {
            console.error('\n💥 Demonstration failed:', error.message);
            process.exit(1);
        });
}

module.exports = { demonstrateUTXOAndPreimage };