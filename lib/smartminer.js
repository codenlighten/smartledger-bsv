'use strict'

/**
 * SmartLedger Miner Simulator
 * Provides BSV blockchain mining simulation for testing and development
 */

/**
 * Comprehensive BSV Miner Simulator for development and testing
 */
class SmartMiner {
  constructor(bsv, options = {}) {
    this.bsv = bsv
    this.options = {
      difficulty: options.difficulty || 1,
      blockTime: options.blockTime || 10000, // 10 seconds for testing
      validateScripts: options.validateScripts !== false, // default true
      logLevel: options.logLevel || 'info',
      ...options
    }
    
    this.currentBlock = {
      height: 0,
      transactions: [],
      timestamp: Date.now()
    }
    
    this.mempool = []
  }

  /**
   * Add a transaction to the mempool for mining
   * @param {Transaction} transaction - BSV transaction object
   * @returns {boolean} - true if accepted, false if rejected
   */
  acceptTransaction(transaction) {
    try {
      // Validate transaction if script validation is enabled
      if (this.options.validateScripts) {
        const isValid = this.validateTransactionSignatures(transaction)
        if (!isValid) {
          this.log('warn', '❌ Transaction rejected: Invalid signatures')
          return false
        }
      }

      // Add to mempool
      this.mempool.push(transaction)
      this.log('info', `✅ Transaction accepted into mempool: ${transaction.id || 'unknown'}`)
      return true

    } catch (error) {
      this.log('error', `❌ Transaction rejected: ${error.message}`)
      return false
    }
  }

  /**
   * Validate transaction signatures using BSV library
   * @param {Transaction} transaction - BSV transaction
   * @returns {boolean} - true if all signatures are valid
   */
  validateTransactionSignatures(transaction) {
    try {
      // Use BSV's built-in transaction verification
      const result = transaction.verify()
      this.log('debug', `📊 Transaction verification result: ${result}`)
      return result === true
    } catch (error) {
      this.log('warn', `⚠️ Signature validation error: ${error.message}`)
      return false
    }
  }

  /**
   * Mine a new block with transactions from mempool
   * @param {number} maxTransactions - Maximum transactions per block
   * @returns {Object} - Mined block object
   */
  mineBlock(maxTransactions = 10) {
    const transactions = this.mempool.splice(0, maxTransactions)
    
    const block = {
      height: this.currentBlock.height + 1,
      timestamp: Date.now(),
      transactions: transactions,
      transactionCount: transactions.length,
      previousBlockHash: this.currentBlock.hash || '0000000000000000000000000000000000000000000000000000000000000000'
    }

    // Simple block hash simulation
    const blockData = JSON.stringify({
      height: block.height,
      timestamp: block.timestamp,
      previousBlockHash: block.previousBlockHash,
      transactions: transactions.map(tx => tx.id || tx.toString())
    })
    
    block.hash = this.bsv.crypto.Hash.sha256(Buffer.from(blockData)).toString('hex')
    
    this.currentBlock = block
    
    this.log('info', `⛏️ Mined block ${block.height} with ${transactions.length} transactions`)
    this.log('debug', `📦 Block hash: ${block.hash}`)
    
    return block
  }

  /**
   * Get mempool status
   * @returns {Object} - Mempool statistics
   */
  getMempoolStats() {
    return {
      transactionCount: this.mempool.length,
      transactions: this.mempool.map(tx => ({
        id: tx.id || 'unknown',
        size: tx.toBuffer ? tx.toBuffer().length : 0,
        inputs: tx.inputs ? tx.inputs.length : 0,
        outputs: tx.outputs ? tx.outputs.length : 0
      }))
    }
  }

  /**
   * Get current blockchain status
   * @returns {Object} - Blockchain statistics
   */
  getBlockchainStats() {
    return {
      currentHeight: this.currentBlock.height,
      currentBlockHash: this.currentBlock.hash,
      currentBlockTimestamp: this.currentBlock.timestamp,
      mempoolSize: this.mempool.length,
      difficulty: this.options.difficulty,
      blockTime: this.options.blockTime
    }
  }

  /**
   * Reset the miner state
   */
  reset() {
    this.currentBlock = {
      height: 0,
      transactions: [],
      timestamp: Date.now()
    }
    this.mempool = []
    this.log('info', '🔄 Miner reset to genesis state')
  }

  /**
   * Logging utility
   * @param {string} level - Log level
   * @param {string} message - Log message
   */
  log(level, message) {
    const levels = { error: 0, warn: 1, info: 2, debug: 3 }
    const currentLevel = levels[this.options.logLevel] || 2
    
    if (levels[level] <= currentLevel) {
      const timestamp = new Date().toISOString()
      console.log(`[${timestamp}] [${level.toUpperCase()}] ${message}`)
    }
  }
}

module.exports = SmartMiner