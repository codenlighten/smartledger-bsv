'use strict'

/**
 * SmartLedger UTXO Management System
 * Provides blockchain state management and UTXO tracking for testing and development
 */

// Browser-compatible imports
let fs, path, crypto, blockchainState

// Only require Node.js modules in Node.js environment
if (typeof window === 'undefined' && typeof require === 'function') {
  try {
    fs = require('fs')
    path = require('path')
    crypto = require('crypto')
    blockchainState = require('../utilities/blockchain-state')
  } catch (e) {
    // Fallback for environments where these modules aren't available
    console.warn('SmartUTXO: Running in browser mode - some features may be limited')
  }
}

/**
 * Comprehensive UTXO Management System for BSV development
 */
class SmartUTXOManager {
  constructor(options = {}) {
    this.options = options || {}
    
    // Initialize blockchain state - this creates the file if needed
    this.loadState()
  }

  /**
   * Load blockchain state from file (initializes if needed)
   */
  loadState() {
    try {
      const state = blockchainState.loadBlockchainState()
      return state
    } catch (error) {
      console.log('⚠️ Could not load blockchain state:', error.message)
      return null
    }
  }

  /**
   * Save blockchain state to file  
   */
  saveState() {
    try {
      const state = blockchainState.loadBlockchainState()
      blockchainState.saveBlockchainState(state)
      const utxoCount = Object.keys(state.globalUTXOSet || {}).length
      console.log(`💾 Saved blockchain state with ${utxoCount} UTXOs`)
    } catch (error) {
      console.log('⚠️ Could not save blockchain state:', error.message)
    }
  }

  /**
   * Get all UTXOs for a given address
   * @param {string} address - Bitcoin address
   * @returns {Array} Array of UTXO objects
   */
  getUTXOsForAddress(address) {
    try {
      const state = blockchainState.loadBlockchainState()
      
      // Check if wallet exists
      if (!state.wallets || !state.wallets[address]) {
        return []
      }
      
      // Return the wallet's UTXOs
      return state.wallets[address].utxos || []
    } catch (error) {
      console.log('⚠️ Error getting UTXOs:', error.message)
      return []
    }
  }

  /**
   * Add a new UTXO to the system
   * @param {Object} utxo - UTXO object {txid, vout, address, satoshis, script}
   */
  addUTXO(utxo) {
    try {
      // Use the correct API: addUTXO(utxo, ownerAddress)
      blockchainState.addUTXO(utxo, utxo.address)
    } catch (error) {
      console.log('⚠️ Error adding UTXO:', error.message)
    }
  }

  /**
   * Spend UTXOs (remove from available set)
   * @param {Array} inputs - Array of input objects {txid, vout}
   * @param {string} spentInTx - Optional transaction ID where UTXO was spent
   */
  spendUTXOs(inputs, spentInTx = 'manual-spend') {
    try {
      for (const input of inputs) {
        // Use the correct API: spendUTXO(txid, vout, spentInTx)
        blockchainState.spendUTXO(input.txid, input.vout, spentInTx)
      }
    } catch (error) {
      console.log('⚠️ Error spending UTXOs:', error.message)
    }
  }

  /**
   * Create mock UTXOs for testing
   * @param {string} address - Target address
   * @param {number} count - Number of UTXOs to create
   * @param {number} satoshis - Satoshis per UTXO
   * @returns {Array} Array of created UTXOs
   */
  createMockUTXOs(address, count = 5, satoshis = 100000) {
    const mockUTXOs = []
    
    for (let i = 0; i < count; i++) {
      const txid = crypto.randomBytes(32).toString('hex')
      const vout = i
      const script = `76a914${crypto.randomBytes(20).toString('hex')}88ac` // Mock P2PKH script
      
      const utxo = {
        txid,
        vout,
        address,
        satoshis,
        script
      }
      
      mockUTXOs.push(utxo)
    }
    
    return mockUTXOs
  }

  /**
   * Get total balance for an address
   * @param {string} address - Bitcoin address
   * @returns {number} Total satoshis
   */
  getBalance(address) {
    try {
      const state = blockchainState.loadBlockchainState()
      
      // Check if wallet exists
      if (!state.wallets || !state.wallets[address]) {
        return 0
      }
      
      // Return the wallet's total value
      return state.wallets[address].totalValue || 0
    } catch (error) {
      console.log('⚠️ Error getting balance:', error.message)
      return 0
    }
  }

  /**
   * Get blockchain statistics
   * @returns {Object} Stats object
   */
  getStats() {
    try {
      const state = blockchainState.getBlockchainStats() // This returns the full state
      return {
        totalUTXOs: state.metadata.totalUTXOs,
        totalValue: state.metadata.totalValue,
        totalWallets: state.metadata.totalWallets,
        blockHeight: state.metadata.blockHeight,
        lastUpdated: state.metadata.lastUpdated
      }
    } catch (error) {
      console.log('⚠️ Error getting stats:', error.message)
      return { totalUTXOs: 0, totalValue: 0, totalWallets: 0, blockHeight: 0 }
    }
  }

  /**
   * Reset blockchain state
   */
  reset() {
    try {
      const statePath = path.join(__dirname, '../utilities/blockchain-state.json')
      if (fs.existsSync(statePath)) {
        fs.unlinkSync(statePath)
        console.log('🔄 Blockchain state reset')
      }
    } catch (error) {
      console.log('⚠️ Could not reset blockchain state:', error.message)
    }
  }
}

module.exports = SmartUTXOManager