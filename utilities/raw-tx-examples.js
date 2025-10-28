#!/usr/bin/env node

/**
 * 🔧 BSV Raw Transaction Hex Validation Example
 *
 * Demonstrates sending raw transaction hex to the miner for validation
 * using the BSV script interpreter for proper signature verification.
 */

const bsv = require('../index.js')
const {
  acceptTransaction,
  acceptRawTransaction
} = require('./miner-simulator')
const {
  loadConfig
} = require('./utxo-manager')

/**
 * Example: Create and validate raw transaction hex
 */
function exampleRawTransactionValidation () {
  console.log('🔧 BSV Raw Transaction Hex Validation Example')
  console.log('═'.repeat(80))

  try {
    // Load wallet config
    const config = loadConfig()
    const wallet = config.wallet

    // Create recipient
    const recipientKey = new bsv.PrivateKey()
    const recipientAddress = recipientKey.toAddress().toString()

    // Get available UTXO
    const utxo = config.utxo

    console.log('📋 Transaction Details:')
    console.log(`👛 From: ${wallet.address}`)
    console.log(`🎯 To: ${recipientAddress}`)
    console.log(`💰 Amount: 10,000 satoshis`)
    console.log(`💳 Using UTXO: ${utxo.txid}:${utxo.vout} (${utxo.satoshis} sats)\n`)

    // Create transaction with proper SIGHASH_FORKID
    const tx = new bsv.Transaction()
      .from(utxo)
      .to(recipientAddress, 10000)
      .change(wallet.address)
      .fee(1000)
      .sign(bsv.PrivateKey.fromWIF(wallet.privateKeyWIF), bsv.crypto.Signature.SIGHASH_ALL | bsv.crypto.Signature.SIGHASH_FORKID)

    console.log('✅ Transaction created successfully')
    console.log(`🆔 Transaction ID: ${tx.id}`)

    // Get raw transaction hex
    const rawHex = tx.toString()
    console.log(`\n📦 Raw Transaction Hex (${rawHex.length} chars):`)
    console.log(`${rawHex.substring(0, 80)}...`)
    console.log(`...${rawHex.substring(rawHex.length - 80)}`)

    // Method 1: Send transaction object
    console.log('\n' + '─'.repeat(60))
    console.log('🔄 Method 1: Sending Transaction Object')
    console.log('─'.repeat(60))

    const result1 = acceptTransaction(tx)
    console.log(`\nResult: ${result1.accepted ? '✅ ACCEPTED' : '❌ REJECTED'}`)
    if (result1.errors.length > 0) {
      console.log('Errors:', result1.errors)
    }

    // Method 2: Send raw transaction hex
    console.log('\n' + '─'.repeat(60))
    console.log('🔄 Method 2: Sending Raw Transaction Hex')
    console.log('─'.repeat(60))

    const result2 = acceptRawTransaction(rawHex)
    console.log(`\nResult: ${result2.accepted ? '✅ ACCEPTED' : '❌ REJECTED'}`)
    if (result2.errors.length > 0) {
      console.log('Errors:', result2.errors)
    }

    console.log('\n🎯 Both methods should produce identical validation results!')
  } catch (error) {
    console.error('❌ Error in example:', error.message)
  }
}

/**
 * Example: Test invalid raw transaction hex
 */
function exampleInvalidRawHex () {
  console.log('\n' + '═'.repeat(80))
  console.log('🚫 Testing Invalid Raw Transaction Hex')
  console.log('═'.repeat(80))

  // Test various invalid hex scenarios
  const invalidHexExamples = [
    {
      name: 'Too short hex',
      hex: '01000000',
      description: 'Transaction hex too short'
    },
    {
      name: 'Invalid characters',
      hex: '0100000001INVALID_HEX_CHARACTERS',
      description: 'Contains non-hex characters'
    },
    {
      name: 'Malformed structure',
      hex: '01000000010000000000000000000000000000000000000000000000000000000000000000',
      description: 'Valid hex but malformed transaction structure'
    }
  ]

  invalidHexExamples.forEach((example, index) => {
    console.log(`\n${index + 1}. ${example.name}:`)
    console.log(`   Description: ${example.description}`)
    console.log(`   Hex: ${example.hex}`)

    const result = acceptRawTransaction(example.hex)
    console.log(`   Result: ${result.accepted ? '✅ ACCEPTED' : '❌ REJECTED'} (Expected: REJECTED)`)

    if (result.errors.length > 0) {
      console.log(`   Error: ${result.errors[0]}`)
    }
  })
}

/**
 * Example: Parse and analyze transaction components
 */
function exampleTransactionAnalysis () {
  console.log('\n' + '═'.repeat(80))
  console.log('🔍 Transaction Component Analysis')
  console.log('═'.repeat(80))

  try {
    const config = loadConfig()
    const wallet = config.wallet
    const utxo = config.utxo

    // Create simple transaction with proper SIGHASH_FORKID
    const tx = new bsv.Transaction()
      .from(utxo)
      .to(new bsv.PrivateKey().toAddress(), 5000)
      .change(wallet.address)
      .fee(500)
      .sign(bsv.PrivateKey.fromWIF(wallet.privateKeyWIF), bsv.crypto.Signature.SIGHASH_ALL | bsv.crypto.Signature.SIGHASH_FORKID)

    const rawHex = tx.toString()

    console.log('📋 Transaction Analysis:')
    console.log(`🆔 TXID: ${tx.id}`)
    console.log(`📦 Raw Hex: ${rawHex}`)
    console.log(`📏 Size: ${rawHex.length / 2} bytes`)
    console.log(`💰 Fee: ${tx.getFee()} satoshis`)

    console.log('\n🔍 Input Details:')
    tx.inputs.forEach((input, i) => {
      console.log(`  Input ${i}:`)
      console.log(`    Previous TXID: ${input.prevTxId.toString('hex')}`)
      console.log(`    Output Index: ${input.outputIndex}`)
      console.log(`    Script: ${input.script.toHex()}`)
      console.log(`    Script ASM: ${input.script.toASM()}`)
    })

    console.log('\n📤 Output Details:')
    tx.outputs.forEach((output, i) => {
      console.log(`  Output ${i}:`)
      console.log(`    Value: ${output.satoshis} satoshis`)
      console.log(`    Script: ${output.script.toHex()}`)
      console.log(`    Script ASM: ${output.script.toASM()}`)
      try {
        console.log(`    Address: ${output.script.toAddress()}`)
      } catch (e) {
        console.log(`    Address: [Non-standard script]`)
      }
    })
  } catch (error) {
    console.error('❌ Error in analysis:', error.message)
  }
}

/**
 * Run all raw transaction examples
 */
function runAllExamples () {
  exampleRawTransactionValidation()
  exampleInvalidRawHex()
  exampleTransactionAnalysis()

  console.log('\n🎯 Raw transaction validation examples completed!')
  console.log('💡 The miner now validates transactions using:')
  console.log('   - Raw hex format validation')
  console.log('   - UTXO existence checking')
  console.log('   - BSV script interpreter for signature verification')
  console.log('   - Transaction balance and structure validation')
}

// Run examples if called directly
if (require.main === module) {
  runAllExamples()
}

module.exports = {
  exampleRawTransactionValidation,
  exampleInvalidRawHex,
  exampleTransactionAnalysis,
  runAllExamples
}
