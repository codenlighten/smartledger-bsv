# UTXO Manager and Mock UTXO Generation Guide

## Overview

The SmartLedger BSV library provides powerful utilities for managing UTXOs (Unspent Transaction Outputs) and generating mock UTXOs for development and testing purposes. This guide covers the complete workflow from UTXO generation to spending transactions.

## Table of Contents

- [Quick Start](#quick-start)
- [UTXO Manager Features](#utxo-manager-features)
- [Mock UTXO Generator](#mock-utxo-generator)
- [Command Line Usage](#command-line-usage)
- [Programmatic Usage](#programmatic-usage)
- [Real-World Examples](#real-world-examples)
- [Best Practices](#best-practices)
- [Troubleshooting](#troubleshooting)

## Quick Start

### Installation

```bash
npm install @smartledger/bsv
```

### Basic Usage

```javascript
const bsv = require('@smartledger/bsv');

// Method 1: Using SmartUTXOManager (recommended)
const SmartUTXOManager = require('@smartledger/bsv/lib/smartutxo');
const utxoManager = new SmartUTXOManager();

// Create mock UTXOs for testing
const testAddress = '1A1zP1eP5QGefi2DMPTfTL5SLmv7DivfNa';
const mockUTXOs = utxoManager.createMockUTXOs(testAddress, 3, 100000);
console.log('Created', mockUTXOs.length, 'mock UTXOs');

// Method 2: Using Smart Contract UTXOGenerator
const UTXOGenerator = require('@smartledger/bsv/lib/smart_contract/utxo_generator');
const generator = new UTXOGenerator();

// Generate real BSV keypair and UTXOs
const keypair = generator.generateKeypair('my-test-wallet');
const realUTXOs = generator.createRealUTXOs({
    count: 2,
    satoshis: 50000,
    keypair: keypair
});

// Create spending transaction
const tx = new bsv.Transaction()
    .from({
        txId: realUTXOs[0].txid,
        outputIndex: realUTXOs[0].vout,
        script: realUTXOs[0].script,
        satoshis: realUTXOs[0].satoshis
    })
    .to('1BitcoinEaterAddressDontSendf59kuE', 40000)
    .sign(keypair.privateKey);

console.log('Transaction created:', tx.id);
```

## UTXO Manager Features

### 🎯 Core Capabilities

- **Mock UTXO Generation** - Create realistic test UTXOs for development
- **Multi-Network Support** - Works with mainnet, testnet, and regtest
- **Flexible Value Management** - Support for any satoshi amount (minimum 546 sats)
- **Key Management** - Generate new keys or use existing WIF private keys
- **Script Flexibility** - Support for P2PKH, P2SH, and custom scripts
- **Transaction Building** - Seamless integration with BSV transaction creation

### 🔧 Supported UTXO Types

| Type | Description | Use Case |
|------|-------------|----------|
| **P2PKH** | Pay-to-Public-Key-Hash | Standard Bitcoin addresses |
| **P2SH** | Pay-to-Script-Hash | Multi-signature and smart contracts |
| **Covenant** | Smart contract UTXOs | Advanced covenant spending conditions |
| **Custom** | User-defined scripts | Experimental and specialized use cases |

## Mock UTXO Generator

### Command Line Tool

The library includes a command-line utility for generating mock UTXOs:

```bash
# Basic usage - generates random UTXO with random private key
node utilities/mock-utxo-generator.js

# Specify satoshi amount (generates random key)
node utilities/mock-utxo-generator.js "" 50000

# Create spending transaction to recipient
node utilities/mock-utxo-generator.js "" 50000 1BitcoinEaterAddressDontSendf59kuE

# Use specific private key (WIF format)
node utilities/mock-utxo-generator.js L1aW4aubDFB7yfras2S1mMEW7bZ1aW4aubD 100000

# Complete example with all parameters
node utilities/mock-utxo-generator.js L1aW4aubDFB7yfras2S1mMEW7bZ1aW4aubD 75000 1A1zP1eP5QGefi2DMPTfTL5SLmv7DivfNa
```

### Parameters

| Parameter | Description | Default | Required |
|-----------|-------------|---------|----------|
| `WIF` | Private key in Wallet Import Format | Random generation | No |
| `satoshis` | UTXO value in satoshis | 100000 | No |
| `recipient` | Target address for spending | Random generation | No |

### Output Format

The generator produces a detailed UTXO report:

```
=== MOCK UTXO ===
{
  "privateKeyWIF": "KxNqRDCi7sKJQw6uPQrEkUhht6AMzRwqEBP9PAcE9b9WKufAsEhv",
  "privateKeyHex": "KxNqRDCi7sKJQw6uPQrEkUhht6AMzRwqEBP9PAcE9b9WKufAsEhv",
  "address": "13hR1jbcgZovT9tRyswMXbyjuEZJGpGseN",
  "utxo": {
    "txid": "efc80a6881d8d7ecb0fb1393a7efdea3bc9b5cf7307bc3f983a532f3356c335a",
    "vout": 0,
    "scriptPubKey": "76a9141d94ef4f13cd354e2fce2ff9ce03303077b75ade88ac",
    "satoshis": 100000
  }
}
=================

=== SIGNED SPEND TX ===  (when recipient provided)
TX HEX: 01000000014acc275ecd667d311a7bc3980efd3bac23e2ec2304a4bb95070c80d5eb1844ef...
TX ID (hash): 249088722ea20f2d7483bdf90d6e43761c31b3b739122bc3750b827c634ea860
fee (mock): 500
sendAmount: 49500
========================
```

## Programmatic Usage

### Basic UTXO Creation

```javascript
const bsv = require('@smartledger/bsv');

// Method 1: Using SmartUTXOManager for simple mock UTXOs
const SmartUTXOManager = require('@smartledger/bsv/lib/smartutxo');

function createMockUTXOs(address, count = 3, satoshis = 100000) {
    const utxoManager = new SmartUTXOManager();
    return utxoManager.createMockUTXOs(address, count, satoshis);
}

// Method 2: Using UTXOGenerator for real BSV keys and UTXOs
const UTXOGenerator = require('@smartledger/bsv/lib/smart_contract/utxo_generator');

function createRealUTXOs(config = {}) {
    const generator = new UTXOGenerator();
    
    // Generate keypair if not provided
    const keypair = config.keypair || generator.generateKeypair('utxo_owner');
    
    // Create real UTXOs with authentic BSV transactions
    const utxos = generator.createRealUTXOs({
        count: config.count || 3,
        satoshis: config.satoshis || 100000,
        keypair: keypair,
        scriptType: config.scriptType || 'P2PKH'
    });
    
    return { keypair, utxos };
}

// Usage examples
const testAddress = '1A1zP1eP5QGefi2DMPTfTL5SLmv7DivfNa';
const mockUTXOs = createMockUTXOs(testAddress, 2, 50000);

const { keypair, utxos } = createRealUTXOs({
    count: 3,
    satoshis: 75000,
    scriptType: 'P2PKH'
});

console.log('Mock UTXOs:', mockUTXOs.length);
console.log('Real UTXOs:', utxos.length);
console.log('Keypair address:', keypair.addressString);
```

### Advanced UTXO Management

```javascript
class UTXOManager {
    constructor() {
        this.utxos = new Map();
    }
    
    // Generate multiple UTXOs
    generateBatch(count, minValue = 10000, maxValue = 100000) {
        const batch = [];
        for (let i = 0; i < count; i++) {
            const satoshis = Math.floor(Math.random() * (maxValue - minValue)) + minValue;
            const utxo = createRandomUTXO(satoshis);
            batch.push(utxo);
            this.utxos.set(utxo.txId + ':' + utxo.outputIndex, utxo);
        }
        return batch;
    }
    
    // Find UTXOs by criteria
    findByAmount(minAmount, maxAmount = Infinity) {
        return Array.from(this.utxos.values()).filter(utxo => 
            utxo.satoshis >= minAmount && utxo.satoshis <= maxAmount
        );
    }
    
    // Create spending transaction
    createSpendingTx(utxo, recipient, amount) {
        const tx = new bsv.Transaction()
            .from(utxo)
            .to(recipient, amount)
            .change(utxo.address)
            .sign(utxo.privateKey);
        
        // Mark UTXO as spent
        this.utxos.delete(utxo.txId + ':' + utxo.outputIndex);
        
        return tx;
    }
    
    // Get total balance
    getTotalBalance() {
        return Array.from(this.utxos.values())
            .reduce((sum, utxo) => sum + utxo.satoshis, 0);
    }
}

// Usage
const manager = new UTXOManager();
const utxos = manager.generateBatch(10, 10000, 50000);
console.log('Generated', utxos.length, 'UTXOs');
console.log('Total balance:', manager.getTotalBalance(), 'satoshis');
```

## Real-World Examples

### Example 1: Development Testing

```javascript
const bsv = require('@smartledger/bsv');
const UTXOGenerator = require('@smartledger/bsv/lib/smart_contract/utxo_generator');

async function testTransactionFlow() {
    console.log('🧪 Testing Transaction Flow');
    
    // 1. Create test environment with real UTXOs
    const generator = new UTXOGenerator();
    const wallet1 = generator.generateKeypair('wallet1');
    const wallet2 = generator.generateKeypair('wallet2');
    
    const utxos1 = generator.createRealUTXOs({ count: 1, satoshis: 100000, keypair: wallet1 });
    const utxos2 = generator.createRealUTXOs({ count: 1, satoshis: 50000, keypair: wallet2 });
    
    console.log('📦 Created UTXOs:');
    console.log(`  UTXO 1: ${utxos1[0].satoshis} sats`);
    console.log(`  UTXO 2: ${utxos2[0].satoshis} sats`);
    
    // 2. Create multi-input transaction
    const recipientKey = new bsv.PrivateKey();
    const recipientAddress = recipientKey.toAddress();
    
    const tx = new bsv.Transaction()
        .from([
            {
                txId: utxos1[0].txid,
                outputIndex: utxos1[0].vout,
                script: utxos1[0].script,
                satoshis: utxos1[0].satoshis
            },
            {
                txId: utxos2[0].txid,
                outputIndex: utxos2[0].vout,
                script: utxos2[0].script,
                satoshis: utxos2[0].satoshis
            }
        ])
        .to(recipientAddress, 120000)
        .change(wallet1.addressString)
        .fee(1000)
        .sign([wallet1.privateKey, wallet2.privateKey]);
    
    console.log('✅ Transaction created:');
    console.log(`  ID: ${tx.id}`);
    console.log(`  Size: ${tx.toString().length / 2} bytes`);
    console.log(`  Fee: ${tx.getFee()} satoshis`);
    
    return tx;
}

testTransactionFlow().catch(console.error);
```

### Example 2: Smart Contract Testing

```javascript
const UTXOGenerator = require('@smartledger/bsv/lib/smart_contract/utxo_generator');

async function testCovenantUTXO() {
    console.log('🔒 Testing Covenant UTXO');
    
    // Create covenant test environment
    const generator = new UTXOGenerator();
    const covenantTest = generator.createCovenantTest({
        utxoCount: 2,
        satoshis: 100000,
        covenantAmount: 80000
    });
    
    console.log('📜 Covenant test created:');
    console.log(`  Keypair address: ${covenantTest.keypair.addressString}`);
    console.log(`  UTXO count: ${covenantTest.utxos.length}`);
    console.log(`  Total value: ${covenantTest.utxos.reduce((sum, utxo) => sum + utxo.satoshis, 0)} sats`);
    console.log(`  Preimage length: ${covenantTest.preimage.length} bytes`);
    
    // Generate preimage for covenant validation
    const preimageHex = covenantTest.preimage.hex;
    console.log(`  Preimage: ${preimageHex.substring(0, 64)}...`);
    
    // Test covenant validation
    const validation = covenantTest.validateCovenant({
        type: 'timelock',
        lockTime: 144
    });
    
    console.log('✅ Covenant validation:', validation.testPassed ? 'PASSED' : 'FAILED');
    
    return covenantTest;
}

testCovenantUTXO().catch(console.error);
```

### Example 3: Batch Processing

```javascript
async function processBatchPayments() {
    console.log('💰 Processing Batch Payments');
    
    // Create funding UTXO
    const fundingUTXO = createRandomUTXO(1000000); // 1M sats
    
    // Define recipients
    const recipients = [
        { address: new bsv.PrivateKey().toAddress(), amount: 100000 },
        { address: new bsv.PrivateKey().toAddress(), amount: 150000 },
        { address: new bsv.PrivateKey().toAddress(), amount: 200000 }
    ];
    
    // Create batch payment transaction
    let tx = new bsv.Transaction().from(fundingUTXO);
    
    recipients.forEach(recipient => {
        tx = tx.to(recipient.address, recipient.amount);
    });
    
    tx = tx.change(fundingUTXO.address)
          .fee(1000)
          .sign(fundingUTXO.privateKey);
    
    console.log('📤 Batch payment created:');
    console.log(`  Recipients: ${recipients.length}`);
    console.log(`  Total sent: ${recipients.reduce((sum, r) => sum + r.amount, 0)} sats`);
    console.log(`  Change: ${tx.getChangeOutput() ? tx.getChangeOutput().satoshis : 0} sats`);
    
    return tx;
}
```

## Network Configuration

### Mainnet Usage

```javascript
// Mainnet UTXOs (use with caution - real money!)
const mainnetUTXO = createRandomUTXO(100000, 'livenet');
```

### Testnet Usage

```javascript
// Testnet UTXOs (safe for testing)
const testnetUTXO = createRandomUTXO(100000, 'testnet');
```

### Regtest Usage

```javascript
// Regtest UTXOs (local development)
const regtestUTXO = createRandomUTXO(100000, 'regtest');
```

## Best Practices

### 🎯 Development Guidelines

1. **Always use testnet or regtest** for development and testing
2. **Validate UTXO values** - minimum 546 satoshis required
3. **Handle private keys securely** - never log or expose in production
4. **Use proper fee estimation** - 1 sat/byte minimum
5. **Test edge cases** - empty UTXOs, large values, network mismatches

### 🔒 Security Considerations

```javascript
// ❌ BAD - Exposing private keys
console.log('Private key:', privateKey.toString());

// ✅ GOOD - Secure key handling
const maskedKey = privateKey.toString().substr(0, 8) + '...';
console.log('Private key (masked):', maskedKey);

// ✅ GOOD - Environment-based configuration
const network = process.env.NODE_ENV === 'production' ? 'livenet' : 'testnet';
```

### 📊 Performance Optimization

```javascript
// Efficient UTXO batch processing
class OptimizedUTXOManager extends UTXOManager {
    // Cache frequently accessed data
    constructor() {
        super();
        this.balanceCache = 0;
        this.sortedUTXOs = [];
    }
    
    addUTXO(utxo) {
        this.utxos.set(utxo.txId + ':' + utxo.outputIndex, utxo);
        this.balanceCache += utxo.satoshis;
        this.invalidateSortCache();
    }
    
    removeUTXO(utxoId) {
        const utxo = this.utxos.get(utxoId);
        if (utxo) {
            this.balanceCache -= utxo.satoshis;
            this.utxos.delete(utxoId);
            this.invalidateSortCache();
        }
    }
    
    getTotalBalance() {
        return this.balanceCache; // O(1) instead of O(n)
    }
    
    invalidateSortCache() {
        this.sortedUTXOs = [];
    }
}
```

## Common Use Cases

### 1. Unit Testing

```javascript
describe('Transaction Tests', () => {
    it('should create valid transaction', () => {
        const utxo = createRandomUTXO(100000);
        const tx = new bsv.Transaction()
            .from(utxo)
            .to('1BitcoinEaterAddressDontSendf59kuE', 50000)
            .sign(utxo.privateKey);
        
        expect(tx.isValidSignature(0)).toBe(true);
        expect(tx.outputs[0].satoshis).toBe(50000);
    });
});
```

### 2. Integration Testing

```javascript
async function testWalletIntegration() {
    const wallet = new MockWallet();
    
    // Add test UTXOs
    const utxos = [
        createRandomUTXO(100000),
        createRandomUTXO(200000),
        createRandomUTXO(50000)
    ];
    
    utxos.forEach(utxo => wallet.addUTXO(utxo));
    
    // Test wallet operations
    const balance = wallet.getBalance();
    const tx = wallet.send('recipient-address', 150000);
    
    assert(balance === 350000);
    assert(tx.outputs[0].satoshis === 150000);
}
```

### 3. Load Testing

```javascript
async function loadTest() {
    console.log('🚀 Starting load test...');
    
    const startTime = Date.now();
    const utxoCount = 1000;
    const utxos = [];
    
    // Generate UTXOs
    for (let i = 0; i < utxoCount; i++) {
        utxos.push(createRandomUTXO(Math.random() * 100000 + 10000));
    }
    
    // Process transactions
    const transactions = [];
    for (let i = 0; i < utxos.length; i += 10) {
        const batch = utxos.slice(i, i + 10);
        const tx = new bsv.Transaction();
        
        batch.forEach(utxo => tx.from(utxo));
        tx.to('1BitcoinEaterAddressDontSendf59kuE', batch.reduce((sum, utxo) => sum + utxo.satoshis, 0) - 10000);
        
        batch.forEach(utxo => tx.sign(utxo.privateKey));
        transactions.push(tx);
    }
    
    const endTime = Date.now();
    console.log(`✅ Processed ${utxoCount} UTXOs in ${endTime - startTime}ms`);
    console.log(`📊 Average: ${((endTime - startTime) / utxoCount).toFixed(2)}ms per UTXO`);
}
```

## Troubleshooting

### Common Issues

#### 1. "Insufficient funds" Error

```javascript
// Problem: UTXO value too small for desired output + fee
const utxo = createRandomUTXO(1000); // Too small!

// Solution: Check available balance
function createSafeTransaction(utxo, recipient, amount) {
    const fee = 1000; // Minimum fee
    const totalNeeded = amount + fee;
    
    if (utxo.satoshis < totalNeeded) {
        throw new Error(`Insufficient funds: need ${totalNeeded}, have ${utxo.satoshis}`);
    }
    
    return new bsv.Transaction()
        .from(utxo)
        .to(recipient, amount)
        .fee(fee)
        .sign(utxo.privateKey);
}
```

#### 2. "Invalid signature" Error

```javascript
// Problem: Wrong private key or UTXO mismatch
const utxo1 = createRandomUTXO(100000);
const utxo2 = createRandomUTXO(100000);

// ❌ Wrong key for UTXO
const badTx = new bsv.Transaction()
    .from(utxo1)
    .to('recipient', 50000)
    .sign(utxo2.privateKey); // Wrong key!

// ✅ Correct key matching
const goodTx = new bsv.Transaction()
    .from(utxo1)
    .to('recipient', 50000)
    .sign(utxo1.privateKey); // Correct key
```

#### 3. Network Mismatch

```javascript
// Problem: Mixing networks
const mainnetKey = new bsv.PrivateKey(undefined, 'livenet');
const testnetAddress = mainnetKey.toAddress('testnet'); // Mismatch!

// Solution: Consistent network usage
function createNetworkConsistentUTXO(network = 'testnet') {
    const privateKey = new bsv.PrivateKey(undefined, network);
    const address = privateKey.toAddress(network);
    
    return {
        txId: 'mock_' + Date.now(),
        outputIndex: 0,
        address: address.toString(),
        script: bsv.Script.buildPublicKeyHashOut(address).toString(),
        satoshis: 100000,
        privateKey: privateKey,
        network: network
    };
}
```

### Debug Utilities

```javascript
// UTXO validation helper
function validateUTXO(utxo) {
    const errors = [];
    
    if (!utxo.txId) errors.push('Missing txId');
    if (utxo.outputIndex === undefined) errors.push('Missing outputIndex');
    if (!utxo.script) errors.push('Missing script');
    if (!utxo.satoshis || utxo.satoshis < 546) errors.push('Invalid satoshi amount');
    
    if (utxo.privateKey) {
        const derivedAddress = utxo.privateKey.toAddress().toString();
        if (derivedAddress !== utxo.address) {
            errors.push('Address/privateKey mismatch');
        }
    }
    
    return errors.length === 0 ? null : errors;
}

// Transaction validation helper
function validateTransaction(tx) {
    const validation = {
        valid: true,
        errors: [],
        warnings: []
    };
    
    if (tx.inputs.length === 0) {
        validation.valid = false;
        validation.errors.push('No inputs');
    }
    
    if (tx.outputs.length === 0) {
        validation.valid = false;
        validation.errors.push('No outputs');
    }
    
    const fee = tx.getFee();
    if (fee < 1) {
        validation.warnings.push('Fee too low');
    }
    
    if (fee > 10000) {
        validation.warnings.push('Fee unusually high');
    }
    
    return validation;
}
```

## API Reference

### SmartUTXOManager Class

| Method | Parameters | Returns | Description |
|--------|------------|---------|-------------|
| `constructor` | `(options)` | `SmartUTXOManager` | Initialize UTXO manager |
| `createMockUTXOs` | `(address, count, satoshis)` | `Array` | Generate mock UTXOs for testing |
| `getUTXOsForAddress` | `(address)` | `Array` | Get all UTXOs for address |
| `addUTXO` | `(utxo)` | `void` | Add UTXO to system |
| `spendUTXOs` | `(inputs, spentInTx)` | `void` | Mark UTXOs as spent |
| `getBalance` | `(address)` | `number` | Get total balance for address |
| `getStats` | `()` | `Object` | Get blockchain statistics |
| `reset` | `()` | `void` | Reset blockchain state |

### UTXOGenerator Class

| Method | Parameters | Returns | Description |
|--------|------------|---------|-------------|
| `constructor` | `(options)` | `UTXOGenerator` | Initialize generator |
| `generateKeypair` | `(label)` | `Object` | Generate BSV keypair |
| `createRealUTXOs` | `(config)` | `Array` | Create authentic UTXOs |
| `createTestTransaction` | `(config)` | `Object` | Create test transaction |
| `createCovenantTest` | `(config)` | `Object` | Create covenant test environment |
| `getKeypairs` | `()` | `Object` | Get all generated keypairs |
| `getUTXOs` | `()` | `Array` | Get all generated UTXOs |
| `reset` | `()` | `void` | Clear all generated data |

### Static Functions

| Function | Parameters | Returns | Description |
|----------|------------|---------|-------------|
| `UTXOGenerator.createTestEnvironment` | `(options)` | `Object` | Create complete test environment |

### UTXO Object Structure

```typescript
interface UTXO {
    txId: string;           // Transaction ID
    outputIndex: number;    // Output index (usually 0)
    address: string;        // Bitcoin address
    script: string;         // Locking script (hex)
    satoshis: number;       // Value in satoshis
    privateKey?: PrivateKey; // Private key (for spending)
    network?: string;       // Network (livenet/testnet/regtest)
}
```

## Integration Examples

### Web Application Integration

```html
<!DOCTYPE html>
<html>
<head>
    <title>UTXO Manager Demo</title>
    <script src="https://cdn.jsdelivr.net/npm/@smartledger/bsv@3.3.3/bsv.min.js"></script>
</head>
<body>
    <script>
        // Generate UTXO in browser
        function generateWebUTXO() {
            const privateKey = new bsv.PrivateKey();
            const address = privateKey.toAddress();
            
            const utxo = {
                txId: 'web_' + Date.now(),
                outputIndex: 0,
                address: address.toString(),
                script: bsv.Script.buildPublicKeyHashOut(address).toString(),
                satoshis: 100000,
                privateKey: privateKey
            };
            
            console.log('Generated web UTXO:', utxo);
            return utxo;
        }
        
        generateWebUTXO();
    </script>
</body>
</html>
```

### Node.js Service Integration

```javascript
const express = require('express');
const bsv = require('@smartledger/bsv');

const app = express();
app.use(express.json());

// UTXO generation endpoint
app.post('/api/utxos/generate', (req, res) => {
    try {
        const { satoshis = 100000, network = 'testnet' } = req.body;
        
        const utxo = createRandomUTXO(satoshis, network);
        
        // Remove private key from response for security
        const safeUTXO = { ...utxo };
        delete safeUTXO.privateKey;
        
        res.json({
            success: true,
            utxo: safeUTXO,
            wif: utxo.privateKey.toWIF() // Return WIF separately
        });
    } catch (error) {
        res.status(400).json({
            success: false,
            error: error.message
        });
    }
});

app.listen(3000, () => {
    console.log('UTXO service running on port 3000');
});
```

## Quick Reference

### Command Line Usage
```bash
# Generate random UTXO
node utilities/mock-utxo-generator.js

# Generate with specific amount and create spending tx
node utilities/mock-utxo-generator.js "" 50000 1BitcoinEaterAddressDontSendf59kuE

# Use specific private key
node utilities/mock-utxo-generator.js KxNqRDCi7sKJQw6uPQrEkUhht6AMzRwqEBP9PAcE9b9WKufAsEhv 25000
```

### Library Usage
```javascript
// SmartUTXOManager - Simple mock UTXOs
const SmartUTXOManager = require('@smartledger/bsv/lib/smartutxo');
const utxoManager = new SmartUTXOManager();
const mockUTXOs = utxoManager.createMockUTXOs(address, 3, 100000);

// UTXOGenerator - Real BSV UTXOs with authentic keys
const UTXOGenerator = require('@smartledger/bsv/lib/smart_contract/utxo_generator');
const generator = new UTXOGenerator();
const keypair = generator.generateKeypair('test-wallet');
const realUTXOs = generator.createRealUTXOs({ count: 2, satoshis: 50000, keypair });

// Covenant Testing
const covenantTest = generator.createCovenantTest({ 
    utxoCount: 2, 
    satoshis: 100000, 
    covenantAmount: 80000 
});
```

## Conclusion

The SmartLedger BSV UTXO Manager provides a comprehensive solution for Bitcoin SV development and testing. Whether you're building wallets, smart contracts, or payment processors, these utilities enable rapid development with realistic test data.

### Key Benefits:
- **🎯 Authentic Testing** - Real BSV keypairs and transaction structures
- **🚀 Rapid Development** - Quick UTXO generation for any scenario
- **🔒 Smart Contract Ready** - Covenant testing with preimage generation
- **📦 Multiple Interfaces** - Command-line tools and programmatic APIs
- **🌐 Network Flexible** - Support for mainnet, testnet, and regtest

### Tested Examples:
All examples in this guide have been tested and verified to work with SmartLedger BSV v3.3.3. The documentation reflects the actual API and behavior of the library modules.

For more examples and advanced usage, see the `/examples` directory in the repository.

## Additional Resources

- [SmartLedger BSV Documentation](https://github.com/codenlighten/smartledger-bsv)
- [Bitcoin SV Documentation](https://wiki.bitcoinsv.io/)
- [BSV Transaction Format](https://wiki.bitcoinsv.io/index.php/Bitcoin_Transactions)
- [Script Reference](https://wiki.bitcoinsv.io/index.php/Script)

---

*Last updated: October 2025*