#!/usr/bin/env node

/**
 * 🎯 Simple Transaction Success Demo
 *
 * Demonstrates a successful transaction flow with simplified validation
 * to show the complete mining process working.
 */

const bsv = require('../index.js')
const {
  loadBlockchainState,
  saveBlockchainState,
  getUTXO,
  spendUTXO,
  addUTXO,
  getBlockchainStats
} = require('./blockchain-state')
const {
  loadConfig,
  updateUTXOFromTransaction
} = require('./utxo-manager')

/**
 * Simplified miner that accepts valid transaction structure
 */
function acceptTransactionSimplified (transaction) {
  console.log('\n📡 SIMPLIFIED MINER: Transaction received')
  console.log(`Transaction ID: ${transaction.id}`)
  console.log(`Inputs: ${transaction.inputs.length}`)
  console.log(`Outputs: ${transaction.outputs.length}`)

  // Basic validation only
  let isValid = true
  const errors = []

  // Check UTXO existence
  for (const input of transaction.inputs) {
    const prevTxId = input.prevTxId.toString('hex')
    const outputIndex = input.outputIndex
    const utxoResult = getUTXO(prevTxId, outputIndex)

    if (!utxoResult.exists) {
      isValid = false
      errors.push(`UTXO ${prevTxId}:${outputIndex} does not exist`)
    } else {
      console.log(`✅ UTXO ${prevTxId}:${outputIndex} exists (${utxoResult.utxo.satoshis} sats)`)
    }
  }

  // Check basic transaction structure
  if (transaction.inputs.length === 0) {
    isValid = false
    errors.push('No inputs provided')
  }

  if (transaction.outputs.length === 0) {
    isValid = false
    errors.push('No outputs provided')
  }

  if (isValid) {
    console.log('✅ Basic validation passed - Processing transaction...')

    // Process the transaction
    const state = loadBlockchainState()

    // Spend input UTXOs
    for (const input of transaction.inputs) {
      const prevTxId = input.prevTxId.toString('hex')
      const outputIndex = input.outputIndex
      spendUTXO(prevTxId, outputIndex, transaction.id)
    }

    // Create new UTXOs
    for (let i = 0; i < transaction.outputs.length; i++) {
      const output = transaction.outputs[i]
      try {
        const outputAddress = output.script.toAddress()
        const newUTXO = {
          txid: transaction.id,
          vout: i,
          outputIndex: i,
          script: output.script.toHex(),
          scriptPubKey: output.script.toHex(),
          satoshis: output.satoshis,
          address: outputAddress.toString()
        }

        addUTXO(newUTXO, outputAddress.toString())
        console.log(`✅ Created UTXO ${transaction.id}:${i} -> ${outputAddress} (${output.satoshis} sats)`)
      } catch (error) {
        console.error(`❌ Error creating output ${i}: ${error.message}`)
      }
    }

    // Update block height
    state.metadata.blockHeight += 1
    state.transactionHistory.push({
      txid: transaction.id,
      processedAt: new Date().toISOString(),
      inputCount: transaction.inputs.length,
      outputCount: transaction.outputs.length
    })

    saveBlockchainState(state)

    console.log('🎉 Transaction processed successfully!')
    console.log(`🏗️  New block height: ${state.metadata.blockHeight}`)

    return { accepted: true, txid: transaction.id, errors: [] }
  } else {
    console.log('❌ Transaction rejected')
    errors.forEach(error => console.log(`  - ${error}`))
    return { accepted: false, txid: transaction.id, errors }
  }
}

/**
 * Demo successful transaction
 */
function demoSuccessfulTransaction () {
  console.log('🎯 BSV Successful Transaction Demo')
  console.log('═'.repeat(80))

  try {
    // Load wallet config
    const config = loadConfig()
    const wallet = config.wallet

    // Create recipient
    const recipientKey = new bsv.PrivateKey()
    const recipientAddress = recipientKey.toAddress().toString()

    // Get UTXO
    const utxo = config.utxo

    console.log('📋 Transaction Setup:')
    console.log(`👛 From: ${wallet.address}`)
    console.log(`🎯 To: ${recipientAddress}`)
    console.log(`💰 Amount: 15,000 satoshis`)
    console.log(`💳 UTXO: ${utxo.txid}:${utxo.vout} (${utxo.satoshis} sats)`)
    console.log(`💵 Fee: 1,000 satoshis`)
    console.log(`🔄 Change: ${utxo.satoshis - 15000 - 1000} satoshis\n`)

    // Create transaction
    const tx = new bsv.Transaction()
      .from(utxo)
      .to(recipientAddress, 15000)
      .change(wallet.address)
      .fee(1000)
      .sign(bsv.PrivateKey.fromWIF(wallet.privateKeyWIF))

    console.log('✅ Transaction created:')
    console.log(`🆔 TXID: ${tx.id}`)
    console.log(`📦 Raw hex: ${tx.toString()}`)
    console.log(`📏 Size: ${tx.toString().length / 2} bytes\n`)

    // Show blockchain state before
    console.log('📊 Blockchain state BEFORE transaction:')
    getBlockchainStats()

    // Process with simplified miner
    const result = acceptTransactionSimplified(tx)

    if (result.accepted) {
      // Update local wallet too
      updateUTXOFromTransaction(tx, utxo)

      console.log('\n📊 Blockchain state AFTER transaction:')
      getBlockchainStats()

      console.log('\n💰 Local wallet state:')
      const { loadConfig } = require('./utxo-manager')
      const updatedConfig = loadConfig()
      console.log(`Available UTXOs: ${updatedConfig.availableUTXOs ? updatedConfig.availableUTXOs.length : 0}`)
      console.log(`Total balance: ${updatedConfig.availableUTXOs ? updatedConfig.availableUTXOs.reduce((sum, u) => sum + u.satoshis, 0) : 0} sats`)
    }
  } catch (error) {
    console.error('❌ Error:', error.message)
  }
}

// Run if called directly
if (require.main === module) {
  demoSuccessfulTransaction()
}

module.exports = {
  acceptTransactionSimplified,
  demoSuccessfulTransaction
}
