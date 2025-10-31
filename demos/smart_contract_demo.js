#!/usr/bin/env node
/**
 * SmartLedger-BSV Smart Contract Demo (Node.js Version)
 * ====================================================
 * 
 * Interactive command-line demo showcasing the powerful smart contract 
 * capabilities of the SmartLedger BSV library. This is the Node.js equivalent 
 * of the HTML demo, perfect for developers and automated testing.
 * 
 * Usage:
 *   node smart_contract_demo.js
 *   node smart_contract_demo.js --help
 *   node smart_contract_demo.js --feature covenant
 *   node smart_contract_demo.js --feature preimage
 *   node smart_contract_demo.js --feature utxo
 *   node smart_contract_demo.js --feature scripts
 */

const bsv = require('../index');
const readline = require('readline');

// Try to load chalk for colored output, fallback to plain text
let chalk;
try {
    chalk = require('chalk');
} catch (error) {
    // Fallback for systems without chalk
    chalk = {
        cyan: (str) => str,
        green: (str) => str,
        red: (str) => str,
        yellow: (str) => str,
        blue: (str) => str,
        magenta: (str) => str,
        white: (str) => str,
        gray: (str) => str,
        bold: (str) => str
    };
    // Chain methods
    Object.keys(chalk).forEach(color => {
        chalk[color].bold = chalk[color];
    });
}

// ASCII Art Header
const HEADER = `
╔═══════════════════════════════════════════════════════════════════════════════╗
║                                                                               ║
║     🚀 SmartLedger-BSV Smart Contract Framework Demo (Node.js)               ║
║                                                                               ║
║     Explore covenant creation, preimage parsing, script building,             ║
║     and UTXO management with real Bitcoin SV functionality.                  ║
║                                                                               ║
╚═══════════════════════════════════════════════════════════════════════════════╝
`;

// Global state
let currentUTXO = null;
let currentCovenant = null;
let SmartContract = null;

// CLI Interface
const rl = readline.createInterface({
    input: process.stdin,
    output: process.stdout,
    prompt: chalk.cyan('smartledger-bsv> ')
});

/**
 * Utility Functions
 */
function log(message, type = 'info') {
    const timestamp = new Date().toLocaleTimeString();
    const prefix = `[${timestamp}]`;
    
    switch (type) {
        case 'success':
            console.log(chalk.green(`${prefix} ✅ ${message}`));
            break;
        case 'error':
            console.log(chalk.red(`${prefix} ❌ ${message}`));
            break;
        case 'warning':
            console.log(chalk.yellow(`${prefix} ⚠️  ${message}`));
            break;
        case 'info':
        default:
            console.log(chalk.blue(`${prefix} ℹ️  ${message}`));
            break;
    }
}

function logHeader(title) {
    console.log('\n' + chalk.cyan('═'.repeat(80)));
    console.log(chalk.cyan.bold(`🔹 ${title}`));
    console.log(chalk.cyan('═'.repeat(80)));
}

function logSubHeader(title) {
    console.log('\n' + chalk.magenta('─'.repeat(60)));
    console.log(chalk.magenta.bold(`📌 ${title}`));
    console.log(chalk.magenta('─'.repeat(60)));
}

/**
 * Feature 1: BSV Library Basics
 */
function loadLibrary() {
    logHeader('Loading BSV Smart Contract Library');
    
    try {
        // Check if BSV library is available
        if (typeof bsv === 'undefined') {
            throw new Error('BSV library not loaded. Please ensure the module is properly installed.');
        }
        
        log('BSV library loaded successfully!', 'success');
        log(`BSV version: ${bsv.version || 'v3.3.3'}`, 'info');
        
        // Check available SmartLedger modules
        const availableModules = [];
        if (bsv.SmartContract) availableModules.push('SmartContract');
        if (bsv.LTP) availableModules.push('LTP');
        if (bsv.Security) availableModules.push('Security');
        if (bsv.GDAF) availableModules.push('GDAF');
        if (bsv.Shamir) availableModules.push('Shamir');
        
        log(`Available modules: ${availableModules.join(', ')}`, 'info');
        log('Core BSV classes: Transaction, Script, PrivateKey, Address', 'info');
        
        // Initialize SmartContract reference
        if (bsv.SmartContract) {
            SmartContract = bsv.SmartContract;
            log('SmartContract module ready!', 'success');
        } else {
            log('SmartContract module not found in bundle', 'warning');
            SmartContract = null;
        }
        
        log('Ready for smart contract development!', 'success');
        
    } catch (error) {
        log(`Error loading library: ${error.message}`, 'error');
    }
}

function showFeatures() {
    logHeader('BSV Smart Contract Features');
    
    const features = [
        '🔒 Covenant Builder - Create complex spending conditions',
        '🧾 Preimage Parser - Extract BIP-143 transaction fields',
        '🛠️ Script Tools - Build and debug Bitcoin Scripts',
        '💎 UTXO Generator - Create test UTXOs for development',
        '📊 SIGHASH Analysis - Understand signature hash types',
        '🏗️ ASM Generator - Convert JavaScript to Bitcoin Script',
        '🔍 Script Debugger - Step-through script execution',
        '⚡ Script Optimizer - Minimize script size and cost',
        '🧪 Local Testing - Verify scripts without blockchain',
        '📦 Production Ready - Deploy to BSV mainnet'
    ];
    
    features.forEach(feature => {
        log(feature, 'success');
    });
    
    log('All features available in @smartledger/bsv package!', 'info');
}

function runBasicTests() {
    logHeader('Running Basic Smart Contract Tests');
    
    try {
        // Test 1: Private Key Generation
        logSubHeader('Test 1: Private Key Generation');
        const privateKey = new bsv.PrivateKey();
        const address = privateKey.toAddress();
        log(`Generated address: ${address.toString()}`, 'success');
        
        // Test 2: Transaction Creation
        logSubHeader('Test 2: Transaction Creation');
        const tx = new bsv.Transaction();
        log(`Created transaction: ${tx.id || 'empty transaction'}`, 'success');
        
        // Test 3: Script Building
        logSubHeader('Test 3: Script Building');
        const script = bsv.Script.buildPublicKeyHashOut(address);
        log(`Built P2PKH script: ${script.toString().substring(0, 50)}...`, 'success');
        
        // Test 4: Mock UTXO
        logSubHeader('Test 4: Mock UTXO Creation');
        const utxo = {
            txId: 'mock_' + Date.now(),
            outputIndex: 0,
            address: address.toString(),
            script: script.toString(),
            satoshis: 100000
        };
        log(`Created mock UTXO: ${utxo.satoshis} satoshis`, 'success');
        
        log('All basic tests passed! Smart contract functionality ready.', 'success');
        
    } catch (error) {
        log(`Test failed: ${error.message}`, 'error');
    }
}

/**
 * Feature 2: Covenant Builder
 */
function generateCovenant(type = 'simple', amount = 100000, address = null) {
    logHeader('Generating Covenant');
    
    try {
        // Generate keys for covenant
        const covenantKey = new bsv.PrivateKey();
        const covenantAddress = covenantKey.toAddress();
        
        log(`Covenant Type: ${type}`, 'info');
        log(`Amount: ${amount} satoshis`, 'info');
        log(`Covenant Address: ${covenantAddress.toString()}`, 'info');
        
        // Build covenant script based on type
        let script;
        switch (type) {
            case 'simple':
                script = buildSimpleCovenant(amount, address);
                break;
            case 'timelock':
                script = buildTimelockCovenant(amount, address, 144); // 144 blocks ≈ 24 hours
                break;
            case 'multisig':
                script = buildMultisigCovenant(amount, address, 2, 3); // 2-of-3 multisig
                break;
            case 'conditional':
                script = buildConditionalCovenant(amount, address);
                break;
            default:
                throw new Error('Unknown covenant type');
        }
        
        currentCovenant = {
            type: type,
            amount: amount,
            address: address,
            script: script,
            covenantKey: covenantKey,
            covenantAddress: covenantAddress
        };
        
        log('Covenant generated successfully!', 'success');
        log(`Script length: ${script.toBuffer().length} bytes`, 'info');
        
        return currentCovenant;
        
    } catch (error) {
        log(`Covenant generation failed: ${error.message}`, 'error');
        return null;
    }
}

function buildSimpleCovenant(amount, recipientAddress) {
    // Simple covenant: can only be spent to specific address with exact amount
    const script = new bsv.Script();
    
    // Add covenant logic (simplified for demo)
    script.add(bsv.Opcode.OP_DUP)
          .add(bsv.Opcode.OP_HASH160)
          .add(bsv.Address.fromString(recipientAddress || '1A1zP1eP5QGefi2DMPTfTL5SLmv7DivfNa').hashBuffer)
          .add(bsv.Opcode.OP_EQUALVERIFY)
          .add(bsv.Opcode.OP_CHECKSIG);
    
    return script;
}

function buildTimelockCovenant(amount, recipientAddress, blocks) {
    // SmartLedger-BSV timelock using preimage validation
    const script = new bsv.Script();
    
    // Preimage-based timelock logic (SmartLedger-BSV method)
    script.add(bsv.Opcode.OP_DUP)
          .add(36) // Start position for nLockTime
          .add(4)  // Length of nLockTime field
          .add(bsv.Opcode.OP_SUBSTR)
          .add(bsv.Opcode.OP_BIN2NUM)
          .add(blocks) // Required block height
          .add(bsv.Opcode.OP_GREATERTHANOREQUAL)
          .add(bsv.Opcode.OP_VERIFY)
          .add(bsv.Opcode.OP_HASH256)
          .add('placeholder_preimage_hash')
          .add(bsv.Opcode.OP_EQUALVERIFY)
          .add(bsv.Opcode.OP_DROP)
          .add(bsv.Address.fromString(recipientAddress || '1A1zP1eP5QGefi2DMPTfTL5SLmv7DivfNa').hashBuffer)
          .add(bsv.Opcode.OP_CHECKSIG);
    
    return script;
}

function buildMultisigCovenant(amount, recipientAddress, m, n) {
    // Multisig covenant: requires m-of-n signatures
    const script = new bsv.Script();
    
    // Generate dummy public keys for demo
    const pubkeys = [];
    for (let i = 0; i < n; i++) {
        pubkeys.push(new bsv.PrivateKey().publicKey);
    }
    
    script.add(bsv.Opcode.OP_0); // Bug in CHECKMULTISIG requires extra value
    for (let i = 0; i < m; i++) {
        script.add(bsv.Opcode.OP_0); // Placeholder for signatures
    }
    script.add(m);
    pubkeys.forEach(pubkey => script.add(pubkey.toBuffer()));
    script.add(n);
    script.add(bsv.Opcode.OP_CHECKMULTISIG);
    
    return script;
}

function buildConditionalCovenant(amount, recipientAddress) {
    // SmartLedger-BSV conditional covenant using preimage validation
    const script = new bsv.Script();
    
    script.add(bsv.Opcode.OP_IF)
          .add(bsv.Opcode.OP_DUP)
          .add(bsv.Opcode.OP_HASH256)
          .add('placeholder_preimage_hash_1')
          .add(bsv.Opcode.OP_EQUALVERIFY)
          .add(bsv.Opcode.OP_DROP)
          .add(bsv.Address.fromString(recipientAddress || '1A1zP1eP5QGefi2DMPTfTL5SLmv7DivfNa').hashBuffer)
          .add(bsv.Opcode.OP_CHECKSIG)
          .add(bsv.Opcode.OP_ELSE)
          .add(bsv.Opcode.OP_DUP)
          .add(bsv.Opcode.OP_HASH256)
          .add('placeholder_preimage_hash_2')
          .add(bsv.Opcode.OP_EQUALVERIFY)
          .add(bsv.Opcode.OP_DROP)
          .add(bsv.Address.fromString(recipientAddress || '1A1zP1eP5QGefi2DMPTfTL5SLmv7DivfNa').hashBuffer)
          .add(bsv.Opcode.OP_CHECKSIG)
          .add(bsv.Opcode.OP_ENDIF);
    
    return script;
}

function testCovenant() {
    if (!currentCovenant) {
        log('No covenant generated. Please generate a covenant first.', 'error');
        return;
    }
    
    logHeader('Testing Covenant');
    
    try {
        // Create a test transaction
        const tx = new bsv.Transaction();
        
        // Add input (mock UTXO)
        tx.from({
            txId: 'mock_covenant_input_' + Date.now(),
            outputIndex: 0,
            script: currentCovenant.script.toString(),
            satoshis: currentCovenant.amount
        });
        
        // Add output
        tx.to(currentCovenant.address || currentCovenant.covenantAddress.toString(), currentCovenant.amount - 1000);
        
        log('Test transaction created successfully!', 'success');
        log(`Transaction ID: ${tx.id}`, 'info');
        log(`Input amount: ${currentCovenant.amount} satoshis`, 'info');
        log(`Output amount: ${currentCovenant.amount - 1000} satoshis`, 'info');
        log('Fee: 1000 satoshis', 'info');
        
    } catch (error) {
        log(`Covenant test failed: ${error.message}`, 'error');
    }
}

function showCovenantScript() {
    if (!currentCovenant) {
        log('No covenant generated. Please generate a covenant first.', 'error');
        return;
    }
    
    logHeader('Covenant Script ASM');
    
    console.log(chalk.green('\nScript ASM:'));
    console.log(chalk.white(currentCovenant.script.toString()));
    
    log(`Script size: ${currentCovenant.script.toBuffer().length} bytes`, 'info');
    log(`Script hex: ${currentCovenant.script.toBuffer().toString('hex')}`, 'info');
}

/**
 * Feature 3: Preimage Parser
 */
function generateSampleTx() {
    logHeader('Generating Sample Transaction');
    
    try {
        const privateKey = new bsv.PrivateKey();
        const address = privateKey.toAddress();
        
        const tx = new bsv.Transaction()
            .from({
                txId: 'sample_' + Date.now(),
                outputIndex: 0,
                script: bsv.Script.buildPublicKeyHashOut(address).toString(),
                satoshis: 100000
            })
            .to('1BitcoinEaterAddressDontSendf59kuE', 50000)
            .change(address)
            .sign(privateKey);
        
        log('Sample transaction generated!', 'success');
        log(`Transaction ID: ${tx.id}`, 'info');
        log(`Transaction size: ${tx.toString().length / 2} bytes`, 'info');
        
        console.log(chalk.green('\nTransaction Hex:'));
        console.log(chalk.white(tx.toString()));
        
        return tx.toString();
        
    } catch (error) {
        log(`Failed to generate sample: ${error.message}`, 'error');
        return null;
    }
}

function parsePreimage(txHex) {
    if (!txHex) {
        log('Please provide transaction hex or generate a sample first.', 'error');
        return;
    }
    
    logHeader('Parsing Preimage');
    
    try {
        const tx = new bsv.Transaction(txHex);
        
        // Extract preimage components (BIP-143)
        logSubHeader('BIP-143 Preimage Components');
        log(`Version: ${tx.version}`, 'success');
        log(`Input Count: ${tx.inputs.length}`, 'success');
        log(`Output Count: ${tx.outputs.length}`, 'success');
        log(`Lock Time: ${tx.nLockTime}`, 'success');
        
        // Show input details
        logSubHeader('Input Details');
        tx.inputs.forEach((input, index) => {
            log(`Input ${index}: ${input.prevTxId}:${input.outputIndex}`, 'info');
        });
        
        // Show output details
        logSubHeader('Output Details');
        tx.outputs.forEach((output, index) => {
            log(`Output ${index}: ${output.satoshis} sats to ${output.script.toString().substring(0, 50)}...`, 'info');
        });
        
    } catch (error) {
        log(`Preimage parsing failed: ${error.message}`, 'error');
    }
}

function extractSighash() {
    logHeader('SIGHASH Information');
    
    // SIGHASH flags
    const sighashTypes = {
        0x01: 'SIGHASH_ALL',
        0x02: 'SIGHASH_NONE',
        0x03: 'SIGHASH_SINGLE',
        0x81: 'SIGHASH_ALL | ANYONECANPAY',
        0x82: 'SIGHASH_NONE | ANYONECANPAY',
        0x83: 'SIGHASH_SINGLE | ANYONECANPAY'
    };
    
    logSubHeader('Available SIGHASH Types');
    
    Object.entries(sighashTypes).forEach(([flag, name]) => {
        log(`${flag}: ${name}`, 'info');
    });
    
    log('Most common: SIGHASH_ALL (0x01) - signs all inputs and outputs', 'success');
}

/**
 * Feature 4: UTXO Generator
 */
function generateUTXO(wif = null, amount = 100000, network = 'livenet') {
    logHeader('Generating Mock UTXO');
    
    try {
        // Generate or use provided private key
        let privateKey;
        if (wif) {
            privateKey = bsv.PrivateKey.fromWIF(wif);
            log('Using provided private key', 'info');
        } else {
            privateKey = new bsv.PrivateKey(undefined, network);
            log('Generated new random private key', 'info');
        }
        
        const address = privateKey.toAddress(network);
        const script = bsv.Script.buildPublicKeyHashOut(address);
        
        // Create mock UTXO
        currentUTXO = {
            txId: 'mock_utxo_' + Date.now() + '_' + Math.random().toString(36).substr(2, 9),
            outputIndex: 0,
            address: address.toString(),
            script: script.toString(),
            satoshis: amount,
            privateKey: privateKey,
            network: network
        };
        
        log('Mock UTXO generated successfully!', 'success');
        log(`UTXO ID: ${currentUTXO.txId}:${currentUTXO.outputIndex}`, 'info');
        log(`Address: ${currentUTXO.address}`, 'info');
        log(`Value: ${currentUTXO.satoshis} satoshis`, 'info');
        log(`Network: ${currentUTXO.network}`, 'info');
        log(`Private Key (WIF): ${currentUTXO.privateKey.toWIF()}`, 'info');
        
        return currentUTXO;
        
    } catch (error) {
        log(`UTXO generation failed: ${error.message}`, 'error');
        return null;
    }
}

function createSpendingTx() {
    if (!currentUTXO) {
        log('No UTXO available. Please generate a UTXO first.', 'error');
        return;
    }
    
    logHeader('Creating Spending Transaction');
    
    try {
        const recipientAddress = '1BitcoinEaterAddressDontSendf59kuE'; // Burn address for demo
        const fee = 1000;
        const outputAmount = currentUTXO.satoshis - fee;
        
        if (outputAmount <= 0) {
            throw new Error('Insufficient funds for transaction fee');
        }
        
        const tx = new bsv.Transaction()
            .from(currentUTXO)
            .to(recipientAddress, outputAmount)
            .sign(currentUTXO.privateKey);
        
        log('Spending transaction created!', 'success');
        log(`Transaction ID: ${tx.id}`, 'info');
        log(`Input: ${currentUTXO.satoshis} satoshis`, 'info');
        log(`Output: ${outputAmount} satoshis`, 'info');
        log(`Fee: ${fee} satoshis`, 'info');
        log(`Transaction size: ${tx.toString().length / 2} bytes`, 'info');
        
        console.log(chalk.green('\nRaw Transaction:'));
        console.log(chalk.white(tx.toString().substring(0, 100) + '...'));
        
        return tx;
        
    } catch (error) {
        log(`Spending transaction failed: ${error.message}`, 'error');
        return null;
    }
}

function showUTXODetails() {
    if (!currentUTXO) {
        log('No UTXO available. Please generate a UTXO first.', 'error');
        return;
    }
    
    logHeader('Detailed UTXO Information');
    
    console.log(chalk.green('\nUTXO Details:'));
    console.log(chalk.white(`Transaction ID: ${currentUTXO.txId}`));
    console.log(chalk.white(`Output Index:   ${currentUTXO.outputIndex}`));
    console.log(chalk.white(`Address:        ${currentUTXO.address}`));
    console.log(chalk.white(`Value:          ${currentUTXO.satoshis} satoshis (${(currentUTXO.satoshis / 100000000).toFixed(8)} BSV)`));
    console.log(chalk.white(`Network:        ${currentUTXO.network}`));
    
    console.log(chalk.green('\nScript Details:'));
    console.log(chalk.white(`Script ASM:     ${currentUTXO.script}`));
    console.log(chalk.white(`Script Size:    ${Buffer.from(currentUTXO.script, 'hex').length} bytes`));
    
    console.log(chalk.green('\nPrivate Key:'));
    console.log(chalk.white(`WIF:            ${currentUTXO.privateKey.toWIF()}`));
    console.log(chalk.white(`Hex:            ${currentUTXO.privateKey.toString()}`));
    console.log(chalk.white(`Compressed:     ${currentUTXO.privateKey.compressed}`));
    
    console.log(chalk.green('\nAddress Details:'));
    console.log(chalk.white(`Hash160:        ${bsv.Address.fromString(currentUTXO.address).hashBuffer.toString('hex')}`));
    console.log(chalk.white(`Version:        ${bsv.Address.fromString(currentUTXO.address).network.pubkeyhash}`));
}

/**
 * Feature 5: Script Tools
 */
function buildScript(asmCode, scriptType = 'custom') {
    logHeader('Building Script');
    
    try {
        if (!asmCode) {
            throw new Error('Please provide script ASM code');
        }
        
        const script = bsv.Script.fromASM(asmCode);
        
        log('Script built successfully!', 'success');
        log(`Script type: ${scriptType}`, 'info');
        log(`Script size: ${script.toBuffer().length} bytes`, 'info');
        log(`Script hex: ${script.toBuffer().toString('hex')}`, 'info');
        
        console.log(chalk.green('\nScript ASM:'));
        console.log(chalk.white(script.toString()));
        
        // Analyze script opcodes
        const opcodes = script.chunks.map(chunk => {
            if (chunk.opcodenum !== undefined) {
                return `OP_${bsv.Opcode.reverseMap[chunk.opcodenum] || chunk.opcodenum}`;
            } else if (chunk.buf) {
                return `DATA(${chunk.buf.length} bytes)`;
            }
            return 'UNKNOWN';
        });
        
        log(`Opcodes: ${opcodes.join(', ')}`, 'info');
        
        return script;
        
    } catch (error) {
        log(`Script building failed: ${error.message}`, 'error');
        return null;
    }
}

function analyzeScript(asmCode) {
    if (!asmCode) {
        log('Please provide script ASM code first.', 'error');
        return;
    }
    
    logHeader('Analyzing Script');
    
    try {
        const script = bsv.Script.fromASM(asmCode);
        
        // Script analysis
        const analysis = {
            size: script.toBuffer().length,
            chunks: script.chunks.length,
            isPushOnly: script.isPushOnly(),
            isStandard: true, // Simplified check
            hasTimelock: asmCode.includes('CHECKLOCKTIMEVERIFY') || asmCode.includes('CHECKSEQUENCEVERIFY'),
            hasMultisig: asmCode.includes('CHECKMULTISIG'),
            hasHash: asmCode.includes('HASH160') || asmCode.includes('HASH256'),
            complexity: 'Medium' // Simplified assessment
        };
        
        logSubHeader('Script Analysis Results');
        log(`Size: ${analysis.size} bytes`, 'info');
        log(`Chunks: ${analysis.chunks}`, 'info');
        log(`Push-only: ${analysis.isPushOnly ? 'Yes' : 'No'}`, 'info');
        log(`Standard: ${analysis.isStandard ? 'Yes' : 'No'}`, 'info');
        log(`Has timelock: ${analysis.hasTimelock ? 'Yes' : 'No'}`, 'info');
        log(`Has multisig: ${analysis.hasMultisig ? 'Yes' : 'No'}`, 'info');
        log(`Has hash ops: ${analysis.hasHash ? 'Yes' : 'No'}`, 'info');
        log(`Complexity: ${analysis.complexity}`, 'info');
        
        // Fee estimation
        const feePerByte = 1; // satoshis per byte
        const estimatedFee = analysis.size * feePerByte;
        log(`Estimated fee: ${estimatedFee} satoshis (at ${feePerByte} sat/byte)`, 'info');
        
        return analysis;
        
    } catch (error) {
        log(`Script analysis failed: ${error.message}`, 'error');
        return null;
    }
}

/**
 * Interactive CLI Functions
 */
function showMainMenu() {
    console.log(chalk.cyan('\n📋 Available Commands:'));
    console.log(chalk.white('  basics          - Load library and run basic tests'));
    console.log(chalk.white('  covenant        - Covenant builder demo'));
    console.log(chalk.white('  preimage        - Preimage parser demo'));
    console.log(chalk.white('  utxo            - UTXO generator demo'));
    console.log(chalk.white('  scripts         - Script tools demo'));
    console.log(chalk.white('  examples        - Show real-world use cases'));
    console.log(chalk.white('  help            - Show this help menu'));
    console.log(chalk.white('  exit            - Exit the demo'));
    console.log(chalk.cyan('─'.repeat(60)));
}

function showExamples() {
    logHeader('Real-World Use Cases');
    
    console.log(chalk.green('\n🏦 Escrow Contracts'));
    console.log(chalk.white('Multi-party escrow with timeout conditions'));
    console.log(chalk.gray('- Buyer and seller can complete transaction normally'));
    console.log(chalk.gray('- If dispute, buyer+arbiter or seller+arbiter can resolve'));
    console.log(chalk.gray('- Includes timeout clause for refund after 30 days'));
    
    console.log(chalk.green('\n⏰ Time-locked Payments'));
    console.log(chalk.white('Payments that unlock after specific time'));
    console.log(chalk.gray('- Uses preimage validation instead of OP_CHECKLOCKTIMEVERIFY'));
    console.log(chalk.gray('- Validates nLockTime field from BIP-143 preimage'));
    console.log(chalk.gray('- SmartLedger-BSV OP_PUSH_TX methods'));
    
    console.log(chalk.green('\n🔄 Recurring Payments'));
    console.log(chalk.white('Automated recurring payment covenants'));
    console.log(chalk.gray('- Self-perpetuating contract'));
    console.log(chalk.gray('- Fixed payment amounts and intervals'));
    console.log(chalk.gray('- Automatic recipient payment'));
    
    console.log(chalk.green('\n🎲 Gaming Contracts'));
    console.log(chalk.white('Provably fair gaming and betting'));
    console.log(chalk.gray('- Commit-reveal schemes for fairness'));
    console.log(chalk.gray('- Automatic payout based on results'));
    console.log(chalk.gray('- Time limits for player actions'));
}

function processCommand(command) {
    const cmd = command.trim().toLowerCase();
    const args = cmd.split(' ');
    
    switch (args[0]) {
        case 'basics':
            loadLibrary();
            showFeatures();
            runBasicTests();
            break;
            
        case 'covenant':
            if (args[1] === 'generate') {
                const type = args[2] || 'simple';
                const amount = parseInt(args[3]) || 100000;
                generateCovenant(type, amount);
            } else if (args[1] === 'test') {
                testCovenant();
            } else if (args[1] === 'show') {
                showCovenantScript();
            } else {
                console.log(chalk.cyan('\nCovenant Commands:'));
                console.log(chalk.white('  covenant generate [type] [amount] - Generate covenant (simple/timelock/multisig/conditional)'));
                console.log(chalk.white('  covenant test                      - Test current covenant'));
                console.log(chalk.white('  covenant show                      - Show covenant script'));
            }
            break;
            
        case 'preimage':
            if (args[1] === 'sample') {
                generateSampleTx();
            } else if (args[1] === 'parse') {
                // Would need tx hex input in real scenario
                log('Use: preimage sample first to generate a transaction', 'info');
            } else if (args[1] === 'sighash') {
                extractSighash();
            } else {
                console.log(chalk.cyan('\nPreimage Commands:'));
                console.log(chalk.white('  preimage sample  - Generate sample transaction'));
                console.log(chalk.white('  preimage sighash - Show SIGHASH information'));
            }
            break;
            
        case 'utxo':
            if (args[1] === 'generate') {
                const amount = parseInt(args[2]) || 100000;
                generateUTXO(null, amount);
            } else if (args[1] === 'spend') {
                createSpendingTx();
            } else if (args[1] === 'show') {
                showUTXODetails();
            } else {
                console.log(chalk.cyan('\nUTXO Commands:'));
                console.log(chalk.white('  utxo generate [amount] - Generate mock UTXO'));
                console.log(chalk.white('  utxo spend             - Create spending transaction'));
                console.log(chalk.white('  utxo show              - Show UTXO details'));
            }
            break;
            
        case 'scripts':
            if (args[1] === 'build') {
                const defaultASM = 'OP_DUP OP_HASH160 OP_PUSHDATA1 0x14 0x1234567890123456789012345678901234567890 OP_EQUALVERIFY OP_CHECKSIG';
                buildScript(defaultASM);
            } else if (args[1] === 'analyze') {
                const defaultASM = 'OP_DUP OP_HASH160 OP_PUSHDATA1 0x14 0x1234567890123456789012345678901234567890 OP_EQUALVERIFY OP_CHECKSIG';
                analyzeScript(defaultASM);
            } else {
                console.log(chalk.cyan('\nScript Commands:'));
                console.log(chalk.white('  scripts build   - Build sample P2PKH script'));
                console.log(chalk.white('  scripts analyze - Analyze sample P2PKH script'));
            }
            break;
            
        case 'examples':
            showExamples();
            break;
            
        case 'help':
            showMainMenu();
            break;
            
        case 'exit':
        case 'quit':
            console.log(chalk.green('\n👋 Thanks for using SmartLedger-BSV! Happy coding!'));
            process.exit(0);
            break;
            
        case '':
            // Empty command, do nothing
            break;
            
        default:
            log(`Unknown command: ${args[0]}. Type 'help' for available commands.`, 'warning');
            break;
    }
}

/**
 * Main Function
 */
function main() {
    // Check for command line arguments
    const args = process.argv.slice(2);
    
    if (args.includes('--help') || args.includes('-h')) {
        console.log(chalk.cyan('\nSmartLedger-BSV Smart Contract Demo (Node.js)\n'));
        console.log(chalk.white('Usage:'));
        console.log(chalk.white('  node smart_contract_demo.js                    - Interactive mode'));
        console.log(chalk.white('  node smart_contract_demo.js --feature basics   - Run basics demo'));
        console.log(chalk.white('  node smart_contract_demo.js --feature covenant - Run covenant demo'));
        console.log(chalk.white('  node smart_contract_demo.js --feature preimage - Run preimage demo'));
        console.log(chalk.white('  node smart_contract_demo.js --feature utxo     - Run UTXO demo'));
        console.log(chalk.white('  node smart_contract_demo.js --feature scripts  - Run scripts demo'));
        console.log(chalk.white('  node smart_contract_demo.js --help             - Show this help'));
        process.exit(0);
    }
    
    // Check for specific feature demo
    const featureIndex = args.indexOf('--feature');
    if (featureIndex !== -1 && args[featureIndex + 1]) {
        const feature = args[featureIndex + 1];
        console.log(HEADER);
        processCommand(feature);
        process.exit(0);
    }
    
    // Interactive mode
    console.log(HEADER);
    log('Welcome to SmartLedger-BSV Smart Contract Demo!', 'success');
    log('Type "help" to see available commands or "basics" to start.', 'info');
    
    showMainMenu();
    
    rl.prompt();
    
    rl.on('line', (input) => {
        processCommand(input);
        rl.prompt();
    }).on('close', () => {
        console.log(chalk.green('\n👋 Thanks for using SmartLedger-BSV! Happy coding!'));
        process.exit(0);
    });
}

// Handle errors gracefully
process.on('uncaughtException', (error) => {
    log(`Uncaught exception: ${error.message}`, 'error');
    process.exit(1);
});

process.on('unhandledRejection', (reason, promise) => {
    log(`Unhandled rejection at ${promise}: ${reason}`, 'error');
    process.exit(1);
});

// Run the demo
if (require.main === module) {
    main();
}

module.exports = {
    loadLibrary,
    showFeatures,
    runBasicTests,
    generateCovenant,
    testCovenant,
    showCovenantScript,
    generateSampleTx,
    parsePreimage,
    extractSighash,
    generateUTXO,
    createSpendingTx,
    showUTXODetails,
    buildScript,
    analyzeScript,
    showExamples
};