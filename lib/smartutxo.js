'use strict'

/**
 * SmartLedger UTXO Management System — DEVELOPMENT ONLY
 * =====================================================
 *
 * `SmartUTXOManager` is a file-backed wallet/UTXO simulator intended for
 * local testing and example scripts. It persists state to
 * `<package-root>/utilities/blockchain-state.json`, has no concurrency
 * controls (multiple processes will race on the same file), and ships
 * with an empty seed for npm consumers (the 3.3 MB development fixture
 * is `.npmignore`d). Do NOT use it as a production UTXO manager —
 * production wallets should track UTXOs themselves and never rely on a
 * shared file inside `node_modules`.
 *
 * Supported import path (works in any consumer):
 *
 *   const SmartUTXO = require('@smartledger/bsv/lib/smartutxo')
 *
 * Or, from within the smartledger-bsv repo:
 *
 *   const SmartUTXO = require('./lib/smartutxo')
 *
 * The legacy `bsv.SmartUTXO` namespace export was soft-deprecated in
 * v4.0.1 (logs a one-shot warning on access) and will be removed in
 * v5.0.0.
 */

// Set BSV_DEBUG=1 (Node) or window.BSV_DEBUG = true (browser) to surface
// info/warning output from this module. Matches the gating pattern used
// by lib/browser-utxo-manager-es5.js since v3.4.1.
const debug = function () {
  const enabled = (typeof process !== 'undefined' && process.env && process.env.BSV_DEBUG) ||
                  (typeof window !== 'undefined' && window.BSV_DEBUG)
  if (enabled) console.log.apply(console, arguments)
}

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
    debug('SmartUTXO: Running in browser mode - some features may be limited')
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
      debug('⚠️ Could not load blockchain state:', error.message)
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
      debug(`💾 Saved blockchain state with ${utxoCount} UTXOs`)
    } catch (error) {
      debug('⚠️ Could not save blockchain state:', error.message)
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
      debug('⚠️ Error getting UTXOs:', error.message)
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
      debug('⚠️ Error adding UTXO:', error.message)
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
      debug('⚠️ Error spending UTXOs:', error.message)
    }
  }

  /**
   * Create mock UTXOs for testing. Each mock has a fresh random txid and
   * a P2PKH locking script that actually encodes the provided address
   * (so any private key for `address` can sign against the resulting
   * `script` via the high-level API).
   *
   * This is a pure factory — the returned UTXOs are NOT added to the
   * simulator state. Call `.addUTXO(...)` on each one to persist them.
   *
   * @param {string} address - Target address (livenet or testnet)
   * @param {number} count - Number of UTXOs to create
   * @param {number} satoshis - Satoshis per UTXO
   * @returns {Array} Array of created UTXOs
   */
  createMockUTXOs(address, count = 5, satoshis = 100000) {
    // Use bsv's own RNG so this works in both Node and browser builds
    // (the Node `crypto` import above is undefined in browser context).
    const bsv = require('../')
    const lockingScriptHex = bsv.Script.buildPublicKeyHashOut(
      bsv.Address.fromString(address)
    ).toHex()

    const mockUTXOs = []
    for (let i = 0; i < count; i++) {
      mockUTXOs.push({
        txid: bsv.crypto.Random.getRandomBuffer(32).toString('hex'),
        vout: i,
        address,
        satoshis,
        script: lockingScriptHex
      })
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
      debug('⚠️ Error getting balance:', error.message)
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
      debug('⚠️ Error getting stats:', error.message)
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
        debug('🔄 Blockchain state reset')
      }
    } catch (error) {
      debug('⚠️ Could not reset blockchain state:', error.message)
    }
  }
}

module.exports = SmartUTXOManager