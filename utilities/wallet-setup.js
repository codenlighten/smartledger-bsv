#!/usr/bin/env node

/**
 * 🎯 BSV Wallet Setup Utility
 *
 * Creates a test wallet with mock UTXO for BSV development and testing.
 * Generates a consistent environment with private keys, addresses, and UTXOs.
 */

const bsv = require('../index.js')
const fs = require('fs')
const path = require('path')

// Import the mock UTXO functionality from mock-utxo-generator.js
function randomHex (len) {
  const crypto = require('crypto')
  return crypto.randomBytes(len).toString('hex')
}

function createMockTxId () {
  return randomHex(32)
}

function buildP2pkhScriptHex (address) {
  return bsv.Script.buildPublicKeyHashOut(address).toHex()
}

function mkUtxo (privateKey, sats = 100000) {
  const address = privateKey.toAddress().toString()
  const txid = createMockTxId()
  const vout = 0
  const scriptHex = buildP2pkhScriptHex(address)

  return {
    txId: txid,
    txid: txid,
    vout: vout,
    outputIndex: vout,
    satoshis: sats,
    value: sats,
    script: scriptHex,
    scriptPubKey: scriptHex,
    address
  }
}

function createTestWallet () {
  console.log('🔧 Creating test wallet...\n')

  // Generate a new private key for testing
  const privateKey = new bsv.PrivateKey()
  const publicKey = privateKey.toPublicKey()
  const address = privateKey.toAddress()

  console.log('📋 Test Wallet Details:')
  console.log(`Private Key (WIF): ${privateKey.toWIF()}`)
  console.log(`Private Key (Hex): ${privateKey.toString('hex')}`)
  console.log(`Public Key: ${publicKey.toString()}`)
  console.log(`Address: ${address.toString()}`)
  console.log(`Pubkey Hash160: ${bsv.crypto.Hash.sha256ripemd160(publicKey.toBuffer()).toString('hex')}\n`)

  // Create a mock UTXO with sufficient funds for testing
  const utxo = mkUtxo(privateKey, 50000) // 50,000 satoshis

  console.log('💰 Mock UTXO Created:')
  console.log(`TXID: ${utxo.txid}`)
  console.log(`Vout: ${utxo.vout}`)
  console.log(`Satoshis: ${utxo.satoshis}`)
  console.log(`Script: ${utxo.script}\n`)

  // Create test environment config
  const testConfig = {
    wallet: {
      privateKeyWIF: privateKey.toWIF(),
      privateKeyHex: privateKey.toString('hex'),
      publicKey: publicKey.toString(),
      address: address.toString(),
      pubkeyHash160: bsv.crypto.Hash.sha256ripemd160(publicKey.toBuffer()).toString('hex')
    },
    utxo: {
      txid: utxo.txid,
      vout: utxo.vout,
      outputIndex: utxo.outputIndex,
      script: utxo.script,
      scriptPubKey: utxo.scriptPubKey,
      satoshis: utxo.satoshis,
      address: utxo.address
    },
    testParams: {
      nLockTimeTarget: 1000,
      sighashType: bsv.crypto.Signature.SIGHASH_ALL | bsv.crypto.Signature.SIGHASH_FORKID,
      covenantAmount: 40000, // Amount for covenant output
      fee: 1000, // Transaction fee
      changeAmount: 9000 // Remaining change
    },
    metadata: {
      created: new Date().toISOString(),
      description: 'Test wallet and UTXO for BSV preimage covenant testing',
      version: '1.0'
    }
  }

  return testConfig
}

function saveTestConfig (config) {
  const configPath = path.join(__dirname, 'wallet.json')

  console.log('💾 Saving wallet configuration...')
  fs.writeFileSync(configPath, JSON.stringify(config, null, 2))

  console.log(`✅ Wallet configuration saved to: ${configPath}\n`)

  return configPath
}

function displaySetupSummary (config) {
  console.log('📊 Test Environment Summary:')
  console.log('═══════════════════════════════════════════')
  console.log(`Address: ${config.wallet.address}`)
  console.log(`Balance: ${config.utxo.satoshis} satoshis`)
  console.log(`Mock TXID: ${config.utxo.txid.substring(0, 16)}...`)
  console.log(`nLockTime Target: ${config.testParams.nLockTimeTarget}`)
  console.log(`Covenant Amount: ${config.testParams.covenantAmount} satoshis`)
  console.log(`Fee: ${config.testParams.fee} satoshis`)
  console.log('═══════════════════════════════════════════\n')

  console.log('\n🎯 Next Steps:')
  console.log('1. Use the wallet credentials in your tests')
  console.log('2. Import wallet.json in your test files')
  console.log('3. Call updateUTXOFromTransaction() after each transaction\n')
}

// Main execution
function main () {
  console.log('🚀 BSV Preimage Covenant - Test Wallet Setup\n')

  try {
    // Create test wallet and configuration
    const testConfig = createTestWallet()

    // Save configuration to file
    const configPath = saveTestConfig(testConfig)

    // Display summary
    displaySetupSummary(testConfig)

    console.log('✅ Test wallet setup complete!')
    console.log(`📁 Configuration file: ${path.basename(configPath)}`)
  } catch (error) {
    console.error('❌ Error setting up test wallet:', error.message)
    process.exit(1)
  }
}

// Run if called directly
if (require.main === module) {
  main()
}

// Export functions for use in other files
module.exports = {
  createTestWallet,
  mkUtxo,
  saveTestConfig
}
