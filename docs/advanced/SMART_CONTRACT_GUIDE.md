# SmartContract Module Documentation

## Overview

The SmartContract module is a production-ready covenant framework for Bitcoin SV (BSV) that provides comprehensive tools for creating, testing, and deploying smart contracts on the BSV blockchain. It implements BIP-143 transaction preimage parsing, covenant operations, and advanced script utilities.

## Table of Contents

- [Quick Start](#quick-start)
- [Core Components](#core-components)
- [Covenant Development](#covenant-development)
- [Preimage Operations](#preimage-operations)
- [Script Building](#script-building)
- [Testing & Debugging](#testing--debugging)
- [Advanced Features](#advanced-features)
- [API Reference](#api-reference)
- [Examples](#examples)
- [Best Practices](#best-practices)

## Quick Start

### Installation

```javascript
const bsv = require('@smartledger/bsv');
const SmartContract = require('@smartledger/bsv/lib/smart_contract');
```

### Basic Usage

```javascript
// Generate authentic UTXOs for testing
const utxoGenerator = new SmartContract.UTXOGenerator();
const utxos = utxoGenerator.createRealUTXOs(2, 100000); // 2 UTXOs, 100k satoshis each
const keypair = utxos[0].keypair; // Get keypair from first UTXO

console.log('Generated UTXO:', utxos[0].txid);
console.log('Keypair address:', keypair.addressString);
console.log('Private key (WIF):', keypair.wif);

// Create transaction and generate BIP-143 preimage
const bsv = require('@smartledger/bsv');
const privateKey = new bsv.PrivateKey(keypair.wif);
const address = new bsv.Address(keypair.addressString);

const tx = new bsv.Transaction()
    .from({
        txId: utxos[0].txid,
        outputIndex: utxos[0].vout,
        script: utxos[0].script,
        satoshis: utxos[0].satoshis
    })
    .to(address, 95000)
    .sign(privateKey);

// Generate preimage and extract fields
const sighashType = bsv.crypto.Signature.SIGHASH_ALL | bsv.crypto.Signature.SIGHASH_FORKID;
const preimageBuffer = bsv.Transaction.sighash.sighashPreimage(
    tx, sighashType, 0, bsv.Script.buildPublicKeyHashOut(address), new bsv.crypto.BN(utxos[0].satoshis)
);

const preimage = new SmartContract.Preimage(preimageBuffer.toString('hex'));
const amount = preimage.getField('amount');
console.log('Extracted amount:', amount.readBigUInt64LE(0).toString(), 'satoshis');

// Build a covenant using extracted field
const builder = SmartContract.createCovenantBuilder();
const covenant = builder
    .comment('Value lock covenant - requires minimum 50000 satoshis')
    .extractField('amount')
    .push(50000)
    .greaterThanOrEqual()
    .verify()
    .build();

console.log('Covenant script:', covenant.asm);
```

## Core Components

### 🏗️ **SmartContract Architecture**

The module consists of several interconnected components:

| Component | Purpose | Key Features |
|-----------|---------|--------------|
| **Covenant** | Core covenant logic and workflow management | P2PKH→Covenant→Spending, UTXO tracking |
| **Preimage** | BIP-143 preimage parsing and field extraction | Bidirectional extraction, SIGHASH detection |
| **CovenantBuilder** | High-level JavaScript-to-Script translation | Template patterns, conditional logic |
| **UTXOGenerator** | Authentic UTXO creation for testing | Real BSV keys, covenant-ready UTXOs |
| **ScriptTester** | Local script execution and verification | No blockchain required, full validation |
| **SIGHASH** | SIGHASH flag analysis and detection | Zero hash warnings, multi-type support |

### 🎯 **Key Features**

- ✅ **BIP-143 Preimage Support** - Complete transaction preimage parsing
- ✅ **Covenant Workflows** - End-to-end covenant creation and spending
- ✅ **Script Generation** - JavaScript to Bitcoin Script translation
- ✅ **Local Testing** - Comprehensive testing without blockchain
- ✅ **UTXO Management** - Authentic test UTXO generation
- ✅ **Debug Tools** - Step-by-step script execution analysis
- ✅ **Production Ready** - Enterprise-grade error handling and validation

## Covenant Development

### Creating Covenants

#### Method 1: Using CovenantBuilder (Recommended)

```javascript
const SmartContract = require('@smartledger/bsv/lib/smart_contract');

// Create a value-lock covenant
const valueLockCovenant = SmartContract.createQuickCovenant('value_lock', {
    value: 100000  // Minimum 100,000 satoshis required
});

console.log('Value Lock Covenant:');
console.log('ASM:', valueLockCovenant.asm);
console.log('Hex:', valueLockCovenant.hex);
console.log('Size:', valueLockCovenant.size, 'bytes');

// Create a hash-lock covenant
const hashLockCovenant = SmartContract.createQuickCovenant('hash_lock', {
    hash: 'abcdef1234567890abcdef1234567890abcdef1234567890abcdef1234567890'
});

// Create a time-lock covenant
const timeLockCovenant = SmartContract.createQuickCovenant('time_lock', {
    timestamp: 1640995200  // Unix timestamp
});
```

#### Method 2: Manual Covenant Building

```javascript
const builder = SmartContract.createCovenantBuilder();

const customCovenant = builder
    .comment('Multi-condition covenant')
    
    // Condition 1: Check minimum value
    .extractField('value')
    .push(50000)
    .greaterThanOrEqual()
    .verify('Value must be >= 50000 sats')
    
    // Condition 2: Check output count
    .extractField('outputCount') 
    .push(2)
    .equal()
    .verify('Must have exactly 2 outputs')
    
    // Condition 3: Signature verification
    .extractField('publicKey')
    .checkSig()
    
    .build();

console.log('Custom covenant script:', customCovenant.asm);
```

#### Method 3: Complete Covenant Workflow

```javascript
const bsv = require('@smartledger/bsv');

async function createCovenantWorkflow() {
    // 1. Generate keypair for covenant
    const privateKey = new bsv.PrivateKey();
    const covenant = SmartContract.createCovenant(privateKey);
    
    // 2. Create mock P2PKH UTXO for testing
    const mockUtxo = {
        txid: 'mock_' + Date.now(),
        vout: 0,
        satoshis: 100000,
        script: bsv.Script.buildPublicKeyHashOut(privateKey.toAddress()).toString()
    };
    
    // 3. Create covenant from P2PKH
    const covenantResult = covenant.createFromP2PKH(mockUtxo);
    
    console.log('Covenant Creation Result:');
    console.log('Transaction ID:', covenantResult.transaction.id);
    console.log('Covenant UTXO:', covenantResult.covenantUtxo);
    
    return covenantResult;
}

createCovenantWorkflow().catch(console.error);
```

## UTXO Generation

### Creating Authentic Test UTXOs

The UTXOGenerator creates real, blockchain-valid UTXOs for testing and development:

```javascript
const SmartContract = require('@smartledger/bsv/lib/smart_contract');

function demonstrateUTXOGeneration() {
    // Create UTXOGenerator instance
    const generator = new SmartContract.UTXOGenerator({
        network: 'livenet', // or 'testnet'
        count: 3,           // number of UTXOs to generate
        satoshis: 150000    // satoshis per UTXO
    });
    
    // Generate authentic UTXOs
    const utxos = generator.createRealUTXOs(3, 150000);
    
    console.log(`Generated ${utxos.length} UTXOs:`);
    utxos.forEach((utxo, index) => {
        console.log(`\nUTXO ${index + 1}:`);
        console.log(`  TXID: ${utxo.txid}`);
        console.log(`  VOUT: ${utxo.vout}`);
        console.log(`  Amount: ${utxo.satoshis.toLocaleString()} satoshis`);
        console.log(`  Address: ${utxo.address}`);
        console.log(`  Script: ${utxo.script}`);
        console.log(`  Private Key: ${utxo.keypair.wif}`);
        console.log(`  Script Type: ${utxo.scriptType}`);
    });
    
    // UTXOs are ready for transactions
    const firstUTXO = utxos[0];
    console.log('\nFirst UTXO ready for spending:');
    console.log(`  Can be used in transactions: ${firstUTXO.txid}:${firstUTXO.vout}`);
    console.log(`  Signed with key: ${firstUTXO.keypair.wif}`);
    
    return utxos;
}

// Generate UTXOs for covenant testing
function generateCovenantUTXOs() {
    const generator = new SmartContract.UTXOGenerator();
    
    // Create multiple UTXOs for complex covenant scenarios
    const smallUTXOs = generator.createRealUTXOs(5, 50000);   // 5x 50k sat UTXOs
    const largeUTXOs = generator.createRealUTXOs(2, 200000);  // 2x 200k sat UTXOs
    
    console.log('Generated covenant test UTXOs:');
    console.log(`  Small UTXOs: ${smallUTXOs.length} × 50,000 sat`);
    console.log(`  Large UTXOs: ${largeUTXOs.length} × 200,000 sat`);
    console.log(`  Total: ${smallUTXOs.length + largeUTXOs.length} UTXOs`);
    
    return [...smallUTXOs, ...largeUTXOs];
}

demonstrateUTXOGeneration();
```

### UTXOGenerator API Reference

```javascript
// Constructor options
const generator = new SmartContract.UTXOGenerator(options);

// Main methods
generator.createRealUTXOs(count, satoshis)     // Generate UTXOs
generator.createTestTransaction(options)        // Create test transaction
generator.createCovenantTest(options)          // Covenant-specific test setup
generator.getUTXOs()                          // Get generated UTXOs
generator.reset()                             // Reset generator state

// UTXO Structure
const utxo = {
    txid: 'string',           // Transaction ID
    vout: 0,                  // Output index  
    satoshis: 100000,         // Amount in satoshis
    address: 'string',        // Base58 address
    script: 'string',         // Script hex
    scriptType: 'P2PKH',      // Script type
    keypair: {                // Associated keypair
        privateKey: PrivateKey,
        publicKey: PublicKey,
        address: Address,
        wif: 'string',
        addressString: 'string'
    },
    created: 'ISO date'       // Creation timestamp
};
```

## Preimage Operations

### BIP-143 Preimage Parsing

The SmartContract module provides comprehensive BIP-143 preimage parsing capabilities with multiple extraction strategies:

```javascript
const SmartContract = require('@smartledger/bsv/lib/smart_contract');
const bsv = require('@smartledger/bsv');

function demonstratePreimageExtraction() {
    // Generate authentic UTXO using UTXOGenerator
    const generator = new SmartContract.UTXOGenerator();
    const utxos = generator.createRealUTXOs(1, 100000);
    const utxo = utxos[0];
    
    // Create transaction using real UTXO
    const privateKey = new bsv.PrivateKey(utxo.keypair.wif);
    const address = new bsv.Address(utxo.address);
    
    const tx = new bsv.Transaction()
        .from({
            txId: utxo.txid,
            outputIndex: utxo.vout,
            script: utxo.script,
            satoshis: utxo.satoshis
        })
        .to(address, 95000)
        .sign(privateKey);
    
    // Generate BIP-143 preimage
    const sighashType = bsv.crypto.Signature.SIGHASH_ALL | bsv.crypto.Signature.SIGHASH_FORKID;
    const preimageBuffer = bsv.Transaction.sighash.sighashPreimage(
        tx, sighashType, 0, bsv.Script.buildPublicKeyHashOut(address), new bsv.crypto.BN(utxo.satoshis)
    );
    
    // Create preimage parser instance
    const preimage = new SmartContract.Preimage(preimageBuffer.toString('hex'));
    
    console.log('Preimage Analysis:');
    console.log('Length:', preimageBuffer.length, 'bytes');
    console.log('Hex:', preimageBuffer.toString('hex'));
    
    // Test different extraction strategies
    const strategies = ['LEFT', 'RIGHT', 'DYNAMIC'];
    strategies.forEach(strategy => {
        try {
            const extracted = preimage.extract(strategy);
            console.log(`${strategy} extraction: ${Object.keys(extracted).length} fields`);
        } catch (error) {
            console.log(`${strategy} extraction failed:`, error.message);
        }
    });
    
    // Access individual BIP-143 fields
    const fieldNames = ['version', 'hashPrevouts', 'hashSequence', 'outpoint', 'scriptCode', 
                       'amount', 'sequence', 'hashOutputs', 'locktime', 'sighash'];
    
    fieldNames.forEach(fieldName => {
        try {
            const fieldBuffer = preimage.getField(fieldName);
            console.log(`${fieldName}: ${fieldBuffer.toString('hex')} (${fieldBuffer.length} bytes)`);
            
            // Interpret common fields
            if (fieldName === 'amount') {
                const satoshis = fieldBuffer.readBigUInt64LE(0);
                console.log(`  → ${satoshis} satoshis`);
            } else if (fieldName === 'version') {
                const version = fieldBuffer.readUInt32LE(0);
                console.log(`  → Version ${version}`);
            } else if (fieldName === 'outpoint') {
                const txid = fieldBuffer.slice(0, 32).reverse().toString('hex');
                const vout = fieldBuffer.slice(32).readUInt32LE(0);
                console.log(`  → ${txid}:${vout}`);
            }
        } catch (error) {
            console.log(`${fieldName}: extraction failed`);
        }
    });
    
    // Get SIGHASH analysis
    const sighashInfo = preimage.getSighashInfo();
    console.log('SIGHASH Analysis:', {
        hasZeroHashes: sighashInfo.hasZeroHashes,
        type: sighashInfo.type,
        isStandard: sighashInfo.isStandard
    });
    
    return preimage;
}

demonstratePreimageExtraction();
```

### Field Extraction for Covenants

```javascript
function extractSpecificFields(preimageHex) {
    const preimage = new SmartContract.Preimage(preimageHex);
    
    // BIP-143 defines these 10 fields in order
    const fieldNames = [
        'version',      // 4 bytes - nVersion
        'hashPrevouts', // 32 bytes - hashPrevouts  
        'hashSequence', // 32 bytes - hashSequence
        'outpoint',     // 36 bytes - outpoint (32 byte hash + 4 byte index)
        'scriptCode',   // Variable - scriptCode with length prefix
        'amount',       // 8 bytes - value in satoshis
        'sequence',     // 4 bytes - nSequence
        'hashOutputs',  // 32 bytes - hashOutputs
        'locktime',     // 4 bytes - nLockTime
        'sighash'       // 4 bytes - sighash flags
    ];
    
    console.log('🔍 BIP-143 Preimage Field Extraction:');
    console.log('='.repeat(50));
    
    const extractedFields = {};
    let offset = 0;
    
    fieldNames.forEach((fieldName, index) => {
        try {
            const fieldBuffer = preimage.getField(fieldName);
            extractedFields[fieldName] = fieldBuffer;
            
            console.log(`\n${(index + 1).toString().padStart(2)}. ${fieldName.toUpperCase()}:`);
            console.log(`    Offset: ${offset}-${offset + fieldBuffer.length - 1} (${fieldBuffer.length} bytes)`);
            console.log(`    Hex:    ${fieldBuffer.toString('hex')}`);
            
            // Interpret field values
            switch (fieldName) {
                case 'version':
                    console.log(`    Value:  Version ${fieldBuffer.readUInt32LE(0)}`);
                    break;
                case 'amount':
                    const satoshis = fieldBuffer.readBigUInt64LE(0);
                    console.log(`    Value:  ${satoshis} satoshis (${(Number(satoshis) / 100000000).toFixed(8)} BSV)`);
                    break;
                case 'outpoint':
                    const txid = fieldBuffer.slice(0, 32).reverse().toString('hex');
                    const vout = fieldBuffer.slice(32).readUInt32LE(0);
                    console.log(`    Value:  ${txid}:${vout}`);
                    break;
                case 'sequence':
                    const seq = fieldBuffer.readUInt32LE(0);
                    console.log(`    Value:  ${seq} (0x${seq.toString(16)})`);
                    break;
                case 'locktime':
                    const locktime = fieldBuffer.readUInt32LE(0);
                    console.log(`    Value:  ${locktime} ${locktime < 500000000 ? '(block height)' : '(timestamp)'}`);
                    break;
                case 'sighash':
                    const sighash = fieldBuffer.readUInt32LE(0);
                    const flags = [];
                    if (sighash & 0x01) flags.push('SIGHASH_ALL');
                    if (sighash & 0x02) flags.push('SIGHASH_NONE');
                    if (sighash & 0x03) flags.push('SIGHASH_SINGLE');
                    if (sighash & 0x40) flags.push('SIGHASH_FORKID');
                    if (sighash & 0x80) flags.push('SIGHASH_ANYONECANPAY');
                    console.log(`    Value:  0x${sighash.toString(16)} (${flags.join(' | ')})`);
                    break;
                case 'scriptCode':
                    console.log(`    Value:  P2PKH script (${fieldBuffer.length} bytes)`);
                    break;
                default:
                    console.log(`    Value:  32-byte hash`);
            }
            
            offset += fieldBuffer.length;
            
        } catch (error) {
            console.log(`    ERROR:  ${error.message}`);
        }
    });
    
    // Test extraction strategies
    console.log('\n🧪 Testing Extraction Strategies:');
    ['LEFT', 'RIGHT', 'DYNAMIC'].forEach(strategy => {
        try {
            const result = preimage.extract(strategy);
            console.log(`✅ ${strategy}: ${Object.keys(result).length} fields extracted`);
        } catch (error) {
            console.log(`❌ ${strategy}: ${error.message}`);
        }
    });
    
    console.log(`\n📊 Summary: ${Object.keys(extractedFields).length}/10 fields extracted, ${offset} bytes processed`);
    
    return extractedFields;
}

// Complete UTXO to Preimage workflow
function completeUTXOToPreimageWorkflow() {
    console.log('🚀 Complete UTXO → Transaction → Preimage → Field Extraction Workflow\n');
    
    // Step 1: Generate UTXO
    const generator = new SmartContract.UTXOGenerator();
    const utxos = generator.createRealUTXOs(1, 100000);
    const utxo = utxos[0];
    console.log(`✅ UTXO Generated: ${utxo.txid}:${utxo.vout} (${utxo.satoshis} sats)`);
    
    // Step 2: Create transaction
    const bsv = require('@smartledger/bsv');
    const privateKey = new bsv.PrivateKey(utxo.keypair.wif);
    const address = new bsv.Address(utxo.address);
    
    const tx = new bsv.Transaction()
        .from({ txId: utxo.txid, outputIndex: utxo.vout, script: utxo.script, satoshis: utxo.satoshis })
        .to(address, 95000)
        .sign(privateKey);
    
    console.log(`✅ Transaction Created: ${tx.id}`);
    
    // Step 3: Generate preimage
    const sighashType = bsv.crypto.Signature.SIGHASH_ALL | bsv.crypto.Signature.SIGHASH_FORKID;
    const preimageBuffer = bsv.Transaction.sighash.sighashPreimage(
        tx, sighashType, 0, bsv.Script.buildPublicKeyHashOut(address), new bsv.crypto.BN(utxo.satoshis)
    );
    
    console.log(`✅ Preimage Generated: ${preimageBuffer.length} bytes`);
    
    // Step 4: Extract fields
    const fields = extractSpecificFields(preimageBuffer.toString('hex'));
    
    console.log(`✅ Workflow Complete: UTXO → TX → Preimage → ${Object.keys(fields).length} Fields`);
    
    return { utxo, transaction: tx, preimage: preimageBuffer, fields };
}
```

## Script Building

### High-Level Script Construction

```javascript
const SmartContract = require('@smartledger/bsv/lib/smart_contract');

function buildAdvancedCovenants() {
    const builder = SmartContract.createCovenantBuilder();
    
    // Example 1: Multi-signature with value constraints
    const multisigValueCovenant = builder
        .comment('2-of-3 multisig with minimum value requirement')
        
        // Check minimum value (100,000 satoshis)
        .extractField('amount')
        .push(100000)
        .greaterThanOrEqual()
        .verify()
        
        // Multisig verification (simplified)
        .push(2) // Required signatures
        .push('pubkey1_placeholder')
        .push('pubkey2_placeholder')  
        .push('pubkey3_placeholder')
        .push(3) // Total keys
        .checkMultisig()
        
        .build();
    
    // Example 2: Time-locked with hash verification
    const timeHashCovenant = builder
        .comment('Time-locked covenant with secret hash')
        
        // Time lock check (must be after timestamp)
        .extractField('locktime')
        .push(1640995200) // Future timestamp
        .greaterThan()
        .verify()
        
        // Hash verification
        .push('secret_preimage_placeholder')
        .sha256()
        .push('expected_hash_placeholder')
        .equalVerify()
        
        // Signature check
        .push('pubkey_placeholder')
        .checkSig()
        
        .build();
    
    // Example 3: Conditional spending paths
    const conditionalCovenant = builder
        .comment('Conditional covenant - multiple spending paths')
        
        // Path selection (simplified IF/ELSE structure)
        .if()
            // Path 1: Owner spending with signature
            .push('owner_pubkey_placeholder')
            .checkSig()
        .else()
            // Path 2: Anyone after timelock
            .extractField('locktime')
            .push(1641081600) // Later timestamp
            .greaterThan()
            .verify()
        .endif()
        
        .build();
    
    return {
        multisigValue: multisigValueCovenant,
        timeHash: timeHashCovenant,
        conditional: conditionalCovenant
    };
}

const covenants = buildAdvancedCovenants();
console.log('Advanced Covenants Created:');
Object.entries(covenants).forEach(([type, covenant]) => {
    console.log(`${type}: ${covenant.size} bytes`);
});
```

### Script Conversion and Analysis

```javascript
function scriptUtilities() {
    // Convert between ASM and hex formats
    const asmScript = 'OP_DUP OP_HASH160 0x14 0x1234567890123456789012345678901234567890 OP_EQUALVERIFY OP_CHECKSIG';
    
    console.log('Script Conversion:');
    console.log('ASM:', asmScript);
    
    const hexScript = SmartContract.asmToHex(asmScript);
    console.log('Hex:', hexScript);
    
    const backToASM = SmartContract.hexToASM(hexScript);
    console.log('Back to ASM:', backToASM);
    
    // Validate scripts
    const validation = SmartContract.validateASM(asmScript);
    console.log('Validation:', validation);
    
    // Get script metrics (if available)
    try {
        const metrics = SmartContract.scriptMetrics(asmScript);
        console.log('Metrics:', metrics);
    } catch (error) {
        console.log('Metrics not available:', error.message);
    }
}

scriptUtilities();
```

## Testing & Debugging

### Local Script Testing

```javascript
function testScriptLocally() {
    console.log('Local Script Testing:');
    
    // Test 1: Simple arithmetic script
    const unlockingScript = 'OP_2 OP_3';
    const lockingScript = 'OP_ADD OP_5 OP_EQUAL';
    
    try {
        const result = SmartContract.testScript(unlockingScript, lockingScript);
        console.log('Arithmetic test result:');
        console.log('  Valid:', result.valid);
        console.log('  Success:', result.success);
        if (result.stack) {
            console.log('  Final stack:', result.stack.join(', '));
        }
    } catch (error) {
        console.log('Test failed:', error.message);
    }
    
    // Test 2: Hash validation script  
    const secretPreimage = 'hello world';
    const secretHash = require('crypto').createHash('sha256').update(secretPreimage).digest('hex');
    
    const hashUnlocking = secretPreimage; // In hex: Buffer.from(secretPreimage).toString('hex')
    const hashLocking = `OP_SHA256 0x20 0x${secretHash} OP_EQUAL`;
    
    try {
        const hashResult = SmartContract.testScript(hashUnlocking, hashLocking);
        console.log('Hash validation test result:');
        console.log('  Success:', hashResult.success);
    } catch (error) {
        console.log('Hash test failed:', error.message);
    }
}

testScriptLocally();
```

### Covenant Testing Environment

```javascript
function createComprehensiveTestEnv() {
    // Create test environment with covenant support
    const testEnv = SmartContract.createTestEnvironment({
        utxoCount: 3,
        satoshis: 150000,
        covenantAmount: 120000
    });
    
    console.log('Comprehensive Test Environment:');
    console.log('Generator available:', !!testEnv.generator);
    console.log('Test setup available:', !!testEnv.test);
    
    // Get test components
    const keypair = testEnv.getKeypair();
    const preimage = testEnv.getPreimage();
    
    console.log('Test Environment Details:');
    console.log('  Keypair address:', keypair.addressString);
    console.log('  Private key (WIF):', keypair.wif);
    console.log('  Preimage length:', preimage.length / 2, 'bytes');
    
    // Extract specific fields for testing
    try {
        const extractedValue = testEnv.extractField('amount');
        console.log('  Extracted amount field:', extractedValue);
    } catch (error) {
        console.log('  Field extraction not available:', error.message);
    }
    
    return testEnv;
}

const testEnv = createComprehensiveTestEnv();
```

### Debug Script Execution

```javascript
function debugScriptExecution() {
    console.log('Script Debugging:');
    
    // Create debug configuration
    const debugConfig = {
        unlockingScript: 'OP_1 OP_2',
        lockingScript: 'OP_ADD OP_3 OP_EQUAL',
        stepByStep: true
    };
    
    try {
        const debugResult = SmartContract.debugScriptExecution(
            debugConfig.unlockingScript,
            debugConfig.lockingScript,
            { stepMode: false }
        );
        
        console.log('Debug execution result:');
        console.log('  Success:', debugResult.success);
        console.log('  Final result:', debugResult.result);
        
        if (debugResult.stack) {
            console.log('  Final stack:', debugResult.stack);
        }
        
    } catch (error) {
        console.log('Debug execution failed:', error.message);
    }
}

debugScriptExecution();
```

## Advanced Features

### SIGHASH Analysis

```javascript
function sighashAnalysis() {
    console.log('SIGHASH Analysis:');
    
    // Get all available SIGHASH types
    const sighashTypes = SmartContract.getAllSIGHASHTypes();
    console.log('Available SIGHASH types:', Object.keys(sighashTypes).length);
    
    // Display first few types
    Object.entries(sighashTypes).slice(0, 5).forEach(([flag, info]) => {
        console.log(`  ${flag}: ${info.name} - ${info.description || 'Standard SIGHASH type'}`);
    });
    
    // Get educational resources
    const resources = SmartContract.getEducationalResources();
    console.log('Educational resources available:');
    console.log('  Zero hash mystery info:', !!resources.zeroHashMystery);
    console.log('  Example demonstrations:', resources.exampleDemonstrations.length);
    
    // Demonstrate SIGHASH analysis
    try {
        const sighashDemo = SmartContract.demonstrateAllSIGHASH();
        console.log('SIGHASH demonstrations generated:', sighashDemo.length);
    } catch (error) {
        console.log('SIGHASH demo generation failed:', error.message);
    }
}

sighashAnalysis();
```

### Opcode Mapping and Simulation

```javascript
function opcodeOperations() {
    console.log('Opcode Operations:');
    
    // Get opcode map
    const opcodeMap = SmartContract.getOpcodeMap();
    console.log('Available opcodes:', Object.keys(opcodeMap).length);
    
    // Show some common opcodes
    const commonOpcodes = ['OP_DUP', 'OP_HASH160', 'OP_EQUALVERIFY', 'OP_CHECKSIG'];
    commonOpcodes.forEach(opcode => {
        if (opcodeMap[opcode]) {
            console.log(`  ${opcode}: 0x${opcodeMap[opcode].toString(16)}`);
        }
    });
    
    // Simulate script execution (if available)
    try {
        const operations = ['OP_1', 'OP_2', 'OP_ADD'];
        const simulation = SmartContract.simulateScript(operations, []);
        console.log('Script simulation result:', simulation);
    } catch (error) {
        console.log('Script simulation not available:', error.message);
    }
}

opcodeOperations();
```

## API Reference

### Core Classes

#### SmartContract.Covenant

```javascript
const covenant = new SmartContract.Covenant(privateKey, options);

// Methods
covenant.createFromP2PKH(utxo)          // Create covenant from P2PKH UTXO
covenant.spendCovenant(covenantUtxo)    // Spend existing covenant
covenant.completeFlow(utxo, callback)   // Complete workflow
```

#### SmartContract.Preimage

```javascript
const preimage = new SmartContract.Preimage(preimageHex, options);

// Core Methods
preimage.extract(strategy)              // Extract all fields ('LEFT'/'RIGHT'/'DYNAMIC')
preimage.getField(fieldName)            // Get specific BIP-143 field
preimage.extractField(fieldName)        // Alternative field extraction
preimage.getSighashInfo()               // Get SIGHASH analysis and warnings
preimage.validate()                     // Validate preimage structure
preimage.toObject()                     // Convert to plain object

// Static Methods
SmartContract.Preimage.fromTransaction(tx, inputIndex, sighashType)  // Create from transaction
SmartContract.Preimage.extractFromHex(hex)                          // Quick extraction
SmartContract.Preimage.analyzeFromHex(hex)                          // Analysis without instance

// BIP-143 Field Names
// 'version', 'hashPrevouts', 'hashSequence', 'outpoint', 'scriptCode', 
// 'amount', 'sequence', 'hashOutputs', 'locktime', 'sighash'
```

#### SmartContract.UTXOGenerator

```javascript
const generator = new SmartContract.UTXOGenerator(options);

// Core Methods
generator.createRealUTXOs(count, satoshis)    // Generate authentic UTXOs
generator.createTestTransaction(options)       // Create test transaction  
generator.createCovenantTest(options)         // Covenant-specific setup
generator.getUTXOs()                         // Get all generated UTXOs
generator.getKeypairs()                      // Get associated keypairs (may return undefined)
generator.reset()                            // Reset generator state

// Generated UTXO Structure
{
  txid: 'string',                    // Transaction ID
  vout: number,                      // Output index
  satoshis: number,                  // Amount in satoshis
  address: 'string',                 // Base58 address
  script: 'string',                  // Script hex
  scriptType: 'P2PKH',               // Script type
  keypair: {                         // Associated keypair
    privateKey: PrivateKey,
    publicKey: PublicKey,  
    address: Address,
    wif: 'string',
    addressString: 'string'
  },
  created: 'ISO string'              // Creation timestamp
}
```

#### SmartContract.CovenantBuilder

```javascript
const builder = new SmartContract.CovenantBuilder();

// Chainable methods
builder.comment(text)                   // Add documentation
builder.push(value)                     // Push value to stack
builder.extractField(fieldName)         // Extract preimage field
builder.add()                           // Arithmetic operations
builder.equal()                         // Comparison operations
builder.verify()                        // Validation operations
builder.if() / builder.else() / builder.endif()  // Control flow
builder.build()                         // Generate final script
```

### Utility Functions

```javascript
// Quick covenant creation
SmartContract.createQuickCovenant(type, params)

// Test environment setup
SmartContract.createTestEnvironment(options)

// Script testing
SmartContract.testScript(unlocking, locking, options)

// Script conversion
SmartContract.asmToHex(asmString)
SmartContract.hexToASM(hexString)
SmartContract.validateASM(asmString)

// Educational resources
SmartContract.getEducationalResources()
SmartContract.getAllSIGHASHTypes()
SmartContract.explainZeroHashes()
```

## Examples

### Example 1: Simple Value Lock

```javascript
// Create a covenant that requires minimum 100,000 satoshis
const valueLock = SmartContract.createQuickCovenant('value_lock', {
    value: 100000
});

console.log('Value Lock Covenant:');
console.log('Script:', valueLock.asm);
console.log('Size:', valueLock.size, 'bytes');

// Test the covenant
const testResult = SmartContract.testCovenant(
    'mock_preimage_hex',
    { minValue: 100000 },
    { validate: true }
);
```

### Example 2: Multi-Condition Covenant

```javascript
// Create covenant with multiple conditions
const multiCovenant = SmartContract.createQuickCovenant('multi_condition', {
    conditions: [
        { type: 'value', value: 50000 },
        { type: 'time', timestamp: 1640995200 },
        { type: 'hash', hash: 'abcdef...' }
    ]
});

console.log('Multi-condition Covenant:', multiCovenant.asm);
```

### Example 3: Custom Covenant Logic

```javascript
const builder = SmartContract.createCovenantBuilder();

const escrowCovenant = builder
    .comment('Escrow covenant - 2-of-3 with timeout')
    
    // Check if timeout reached
    .extractField('locktime')
    .push(1641081600) // Timeout timestamp
    .greaterThan()
    
    .if()
        // After timeout: refund to buyer
        .push('buyer_pubkey')
        .checkSig()
    .else()
        // Before timeout: require 2-of-3 signatures
        .push(2)
        .push('buyer_pubkey')
        .push('seller_pubkey')
        .push('arbiter_pubkey')
        .push(3)
        .checkMultisig()
    .endif()
    
    .build();

console.log('Escrow Covenant:', escrowCovenant.asm);
```

### Example 4: UTXO Generator + Preimage Separation Workflow

```javascript
async function completeUTXOPreimageWorkflow() {
    console.log('🚀 Complete UTXO Generation + Preimage Separation Workflow');
    
    // 1. Generate authentic UTXOs
    const generator = new SmartContract.UTXOGenerator();
    const utxos = generator.createRealUTXOs(1, 100000);
    const utxo = utxos[0];
    
    console.log('✅ UTXO Generated:');
    console.log(`   TXID: ${utxo.txid}`);
    console.log(`   Amount: ${utxo.satoshis.toLocaleString()} satoshis`);
    console.log(`   Address: ${utxo.address}`);
    
    // 2. Create transaction from UTXO
    const bsv = require('@smartledger/bsv');
    const privateKey = new bsv.PrivateKey(utxo.keypair.wif);
    const address = new bsv.Address(utxo.address);
    
    const tx = new bsv.Transaction()
        .from({
            txId: utxo.txid,
            outputIndex: utxo.vout,
            script: utxo.script,
            satoshis: utxo.satoshis
        })
        .to(address, 95000)
        .sign(privateKey);
    
    console.log('✅ Transaction Created:', tx.id);
    
    // 3. Generate BIP-143 preimage
    const sighashType = bsv.crypto.Signature.SIGHASH_ALL | bsv.crypto.Signature.SIGHASH_FORKID;
    const preimageBuffer = bsv.Transaction.sighash.sighashPreimage(
        tx, sighashType, 0, bsv.Script.buildPublicKeyHashOut(address), new bsv.crypto.BN(utxo.satoshis)
    );
    
    console.log('✅ Preimage Generated:', preimageBuffer.length, 'bytes');
    
    // 4. Extract and analyze preimage fields
    const preimage = new SmartContract.Preimage(preimageBuffer.toString('hex'));
    
    console.log('✅ Preimage Field Analysis:');
    
    // Extract all 10 BIP-143 fields
    const fieldNames = ['version', 'hashPrevouts', 'hashSequence', 'outpoint', 'scriptCode', 
                       'amount', 'sequence', 'hashOutputs', 'locktime', 'sighash'];
    
    fieldNames.forEach(fieldName => {
        try {
            const fieldBuffer = preimage.getField(fieldName);
            console.log(`   ${fieldName}: ${fieldBuffer.length} bytes`);
            
            // Show interpreted values for key fields
            if (fieldName === 'amount') {
                const sats = fieldBuffer.readBigUInt64LE(0);
                console.log(`     → ${sats} satoshis`);
            } else if (fieldName === 'outpoint') {
                const txid = fieldBuffer.slice(0, 32).reverse().toString('hex');
                const vout = fieldBuffer.slice(32).readUInt32LE(0);
                console.log(`     → ${txid}:${vout}`);
            }
        } catch (error) {
            console.log(`   ${fieldName}: extraction failed`);
        }
    });
    
    // 5. Test extraction strategies
    console.log('✅ Testing Extraction Strategies:');
    ['LEFT', 'RIGHT', 'DYNAMIC'].forEach(strategy => {
        try {
            const result = preimage.extract(strategy);
            console.log(`   ${strategy}: ${Object.keys(result).length} fields extracted`);
        } catch (error) {
            console.log(`   ${strategy}: failed (${error.message})`);
        }
    });
    
    // 6. SIGHASH analysis
    const sighashInfo = preimage.getSighashInfo();
    console.log('✅ SIGHASH Analysis:', {
        hasZeroHashes: sighashInfo.hasZeroHashes,
        isStandard: sighashInfo.isStandard
    });
    
    console.log('🎉 Complete workflow successful!');
    console.log('   • Authentic UTXO generated ✅');
    console.log('   • Transaction created ✅'); 
    console.log('   • BIP-143 preimage extracted ✅');
    console.log('   • All 10 fields separated ✅');
    console.log('   • Multiple extraction strategies tested ✅');
    
    return {
        utxo: utxo,
        transaction: tx,
        preimage: preimageBuffer,
        fields: fieldNames.length
    };
}

// Run the workflow
completeUTXOPreimageWorkflow()
    .then(result => {
        console.log(`\n✨ Workflow completed: ${result.fields} fields extracted from ${result.preimage.length}-byte preimage`);
    })
    .catch(error => {
        console.error('❌ Workflow failed:', error.message);
    });
```

## Best Practices

### 🔒 **Security Guidelines**

1. **Always Test Locally First**
   ```javascript
   // Test script execution before deployment
   const testResult = SmartContract.testScript(unlockingScript, lockingScript);
   if (!testResult.success) {
       throw new Error('Script validation failed');
   }
   ```

2. **Validate Preimage Fields**
   ```javascript
   // Ensure preimage extraction is successful
   const preimage = SmartContract.extractPreimage(preimageHex);
   const sighashInfo = preimage.getSighashInfo();
   if (sighashInfo.hasZeroHashes) {
       console.warn('⚠️ Zero hashes detected - verify SIGHASH type');
   }
   ```

3. **Use Testnet for Development**
   ```javascript
   // Configure for testnet
   const testEnv = SmartContract.createTestEnvironment({
       network: 'testnet',
       utxoCount: 3,
       satoshis: 100000
   });
   ```

### ⚡ **Performance Optimization**

1. **Minimize Script Size**
   ```javascript
   // Find optimization opportunities
   const optimizations = SmartContract.findOptimizations(scriptASM);
   console.log('Potential savings:', optimizations.potentialSavings, 'bytes');
   ```

2. **Efficient Opcode Usage**
   ```javascript
   const builder = SmartContract.createCovenantBuilder();
   
   // Use efficient opcodes
   const optimizedScript = builder
       .push(1)           // Instead of OP_1, use direct push for larger numbers
       .dup()            // Use OP_DUP instead of redundant operations
       .verify()         // Use OP_VERIFY for boolean checks
       .build();
   ```

### 📚 **Development Workflow**

1. **Design → Test → Deploy**
   ```javascript
   // 1. Design covenant logic
   const covenant = SmartContract.createQuickCovenant('value_lock', { value: 100000 });
   
   // 2. Test locally
   const testResult = SmartContract.testScript('test_unlock', covenant.asm);
   
   // 3. Deploy to testnet first
   // 4. Deploy to mainnet after thorough testing
   ```

2. **Use Educational Resources**
   ```javascript
   // Learn about SIGHASH types
   const resources = SmartContract.getEducationalResources();
   console.log('Zero hash mystery:', resources.zeroHashMystery);
   
   // Understand available SIGHASH types
   const sighashTypes = SmartContract.getAllSIGHASHTypes();
   ```

### 🛠️ **Debugging Tips**

1. **Step-by-Step Execution**
   ```javascript
   // Enable detailed debugging
   const debugResult = SmartContract.debugScriptExecution(
       unlockingScript,
       lockingScript,
       { stepMode: true }
   );
   ```

2. **Stack Examination**
   ```javascript
   // Examine stack state during execution
   const stackResult = SmartContract.examineStack(lockingHex, unlockingHex);
   console.log('Stack progression:', stackResult.steps);
   ```

3. **Script Validation**
   ```javascript
   // Validate scripts before testing
   const validation = SmartContract.validateASM(scriptASM);
   if (!validation.valid) {
       console.error('Script errors:', validation.errors);
   }
   ```

## Module Features

The SmartContract module includes **23 production-ready features**:

- ✅ BIP143_PREIMAGE - Complete BIP-143 preimage parsing
- ✅ COMPACT_SIZE_VARINT - Varint encoding/decoding support  
- ✅ BIDIRECTIONAL_EXTRACTION - Left/right/dynamic field extraction
- ✅ SIGHASH_DETECTION - Automatic SIGHASH flag detection
- ✅ ZERO_HASH_WARNINGS - Zero hash detection and warnings
- ✅ MULTI_FIELD_VALIDATION - Multi-field preimage validation
- ✅ REAL_UTXO_GENERATION - Authentic UTXO generation for testing
- ✅ SCRIPT_TESTING - Local script execution and validation
- ✅ LOCAL_VERIFICATION - No blockchain required for testing
- ✅ JAVASCRIPT_TO_SCRIPT - JavaScript to Bitcoin Script translation
- ✅ OPCODE_MAPPING - Comprehensive opcode mapping utilities
- ✅ COVENANT_BUILDER - High-level covenant construction
- ✅ SCRIPT_ANALYSIS - Script metrics and complexity analysis
- ✅ SCRIPT_OPTIMIZATION - Optimization suggestions and improvements
- ✅ SCRIPT_CONVERSION - ASM/hex/script format conversion
- ✅ BATCH_TESTING - Batch script testing capabilities
- ✅ QUICK_COVENANTS - Template-based quick covenant creation
- ✅ SCRIPT_EXPLANATIONS - Human-readable script explanations
- ✅ STACK_EXAMINATION - Stack state examination and debugging
- ✅ SCRIPT_DEBUGGING - Interactive script debugging tools
- ✅ STEP_BY_STEP_EXECUTION - Step-by-step execution analysis
- ✅ INTERACTIVE_DEBUGGING - Interactive debugging support
- ✅ PRODUCTION_READY - Enterprise-grade error handling

## Conclusion

The SmartContract module provides a comprehensive, production-ready framework for Bitcoin SV smart contract development. Whether you're building simple value locks or complex multi-condition covenants, the module offers the tools and utilities needed for secure, efficient smart contract development.

### Next Steps

1. **Explore Examples** - Review the `/examples/smart_contract/` directory for more detailed examples
2. **Test Locally** - Use the testing utilities to validate your covenant logic
3. **Deploy Safely** - Always test on testnet before mainnet deployment
4. **Join Community** - Contribute to the SmartLedger BSV project on GitHub

For advanced usage and additional examples, see the [SmartLedger BSV repository](https://github.com/codenlighten/smartledger-bsv).

---

*Documentation for SmartContract Module v1.0.0 - Last updated: October 2025*