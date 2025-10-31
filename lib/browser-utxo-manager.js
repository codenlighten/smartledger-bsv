'use strict'

/**
 * Browser-Compatible UTXO Manager
 * Lightweight UTXO management for browser environments with configurable storage
 */

/**
 * Storage types available for browser UTXO management
 */
var STORAGE_TYPES = {
  MEMORY: 'memory',        // In-memory only (lost on page reload)
  SESSION: 'session',      // sessionStorage (lost when tab closes)
  LOCAL: 'local'          // localStorage (persists until cleared)
}

/**
 * Browser-compatible UTXO Manager
 * Provides UTXO tracking and management for browser applications
 */
function BrowserUTXOManager(options) {
  options = options || {}
  /**
   * Create a new browser UTXO manager
   * @param {Object} options - Configuration options
   * @param {string} options.storage - Storage type: 'memory', 'session', or 'local' (default: 'memory')
   * @param {string} options.storageKey - Key for browser storage (default: 'smartledger-utxos')
   * @param {boolean} options.autoSave - Auto-save after each operation (default: true)
   * @param {number} options.maxUTXOs - Maximum UTXOs to store (default: 1000)
   */
  constructor(options = {}) {
    this.options = {
      storage: options.storage || STORAGE_TYPES.MEMORY,
      storageKey: options.storageKey || 'smartledger-utxos',
      autoSave: options.autoSave !== false,
      maxUTXOs: options.maxUTXOs || 1000,
      ...options
    }

    // Validate storage type
    if (!Object.values(STORAGE_TYPES).includes(this.options.storage)) {
      throw new Error(`Invalid storage type: ${this.options.storage}. Must be one of: ${Object.values(STORAGE_TYPES).join(', ')}`)
    }

    // Initialize storage
    this.utxos = new Map() // Main UTXO store: key = "txid:vout", value = utxo object
    this.addressIndex = new Map() // Address index: key = address, value = Set of utxo keys
    this.spentUTXOs = new Map() // Spent UTXO tracking
    this.metadata = {
      totalUTXOs: 0,
      totalValue: 0,
      createdAt: new Date().toISOString(),
      lastUpdated: new Date().toISOString()
    }

    // Load existing data
    this.loadFromStorage()
  }

  /**
   * Get storage interface based on configuration
   * @returns {Object} Storage interface (memory, sessionStorage, or localStorage)
   * @private
   */
  _getStorage() {
    switch (this.options.storage) {
      case STORAGE_TYPES.MEMORY:
        return null // Memory storage handled by class properties
      case STORAGE_TYPES.SESSION:
        return typeof sessionStorage !== 'undefined' ? sessionStorage : null
      case STORAGE_TYPES.LOCAL:
        return typeof localStorage !== 'undefined' ? localStorage : null
      default:
        return null
    }
  }

  /**
   * Load UTXOs from configured storage
   */
  loadFromStorage() {
    try {
      if (this.options.storage === STORAGE_TYPES.MEMORY) {
        // Memory storage - nothing to load, start fresh
        return
      }

      const storage = this._getStorage()
      if (!storage) {
        console.warn('BrowserUTXOManager: Storage not available, using memory mode')
        return
      }

      const stored = storage.getItem(this.options.storageKey)
      if (!stored) {
        return // No existing data
      }

      const data = JSON.parse(stored)
      
      // Restore UTXOs
      if (data.utxos) {
        data.utxos.forEach(utxoData => {
          const key = `${utxoData.txid}:${utxoData.vout}`
          this.utxos.set(key, utxoData)
        })
      }

      // Restore address index
      if (data.addressIndex) {
        Object.entries(data.addressIndex).forEach(([address, utxoKeys]) => {
          this.addressIndex.set(address, new Set(utxoKeys))
        })
      }

      // Restore spent UTXOs
      if (data.spentUTXOs) {
        data.spentUTXOs.forEach(spentData => {
          const key = `${spentData.txid}:${spentData.vout}`
          this.spentUTXOs.set(key, spentData)
        })
      }

      // Restore metadata
      if (data.metadata) {
        this.metadata = { ...this.metadata, ...data.metadata }
      }

      this._updateMetadata()
      console.log(`✅ BrowserUTXOManager: Loaded ${this.utxos.size} UTXOs from ${this.options.storage} storage`)

    } catch (error) {
      console.error('BrowserUTXOManager: Error loading from storage:', error.message)
      // Continue with empty state
    }
  }

  /**
   * Save UTXOs to configured storage
   */
  saveToStorage() {
    try {
      if (this.options.storage === STORAGE_TYPES.MEMORY) {
        return // Memory storage - nothing to persist
      }

      const storage = this._getStorage()
      if (!storage) {
        return // Storage not available
      }

      // Prepare data for serialization
      const data = {
        utxos: Array.from(this.utxos.values()),
        addressIndex: {},
        spentUTXOs: Array.from(this.spentUTXOs.values()),
        metadata: this.metadata
      }

      // Convert address index to serializable format
      this.addressIndex.forEach((utxoKeys, address) => {
        data.addressIndex[address] = Array.from(utxoKeys)
      })

      storage.setItem(this.options.storageKey, JSON.stringify(data))
      console.log(`💾 BrowserUTXOManager: Saved ${this.utxos.size} UTXOs to ${this.options.storage} storage`)

    } catch (error) {
      console.error('BrowserUTXOManager: Error saving to storage:', error.message)
    }
  }

  /**
   * Add a UTXO to the manager
   * @param {Object} utxo - UTXO object {txid, vout, address, satoshis, script}
   * @returns {boolean} - true if added, false if already exists or limit exceeded
   */
  addUTXO(utxo) {
    try {
      // Validate UTXO
      if (!utxo.txid || typeof utxo.vout !== 'number' || !utxo.address || typeof utxo.satoshis !== 'number') {
        throw new Error('Invalid UTXO: missing required fields (txid, vout, address, satoshis)')
      }

      const key = `${utxo.txid}:${utxo.vout}`

      // Check if already exists
      if (this.utxos.has(key)) {
        console.log(`⚠️ UTXO already exists: ${key}`)
        return false
      }

      // Check limits
      if (this.utxos.size >= this.options.maxUTXOs) {
        console.warn(`⚠️ Maximum UTXO limit reached (${this.options.maxUTXOs})`)
        return false
      }

      // Add timestamp
      const utxoWithMeta = {
        ...utxo,
        addedAt: new Date().toISOString()
      }

      // Store UTXO
      this.utxos.set(key, utxoWithMeta)

      // Update address index
      if (!this.addressIndex.has(utxo.address)) {
        this.addressIndex.set(utxo.address, new Set())
      }
      this.addressIndex.get(utxo.address).add(key)

      this._updateMetadata()

      if (this.options.autoSave) {
        this.saveToStorage()
      }

      console.log(`✅ UTXO added: ${key} (${utxo.satoshis} sats)`)
      return true

    } catch (error) {
      console.error('BrowserUTXOManager: Error adding UTXO:', error.message)
      return false
    }
  }

  /**
   * Get all UTXOs for a specific address
   * @param {string} address - Bitcoin address
   * @returns {Array} Array of UTXO objects
   */
  getUTXOsForAddress(address) {
    try {
      const utxoKeys = this.addressIndex.get(address)
      if (!utxoKeys) {
        return []
      }

      const utxos = []
      utxoKeys.forEach(key => {
        const utxo = this.utxos.get(key)
        if (utxo) {
          utxos.push(utxo)
        }
      })

      return utxos.sort((a, b) => b.satoshis - a.satoshis) // Sort by value descending

    } catch (error) {
      console.error('BrowserUTXOManager: Error getting UTXOs for address:', error.message)
      return []
    }
  }

  /**
   * Get total balance for an address
   * @param {string} address - Bitcoin address
   * @returns {number} Total satoshis
   */
  getBalance(address) {
    const utxos = this.getUTXOsForAddress(address)
    return utxos.reduce((total, utxo) => total + utxo.satoshis, 0)
  }

  /**
   * Spend UTXOs (mark as spent and remove from available set)
   * @param {Array} inputs - Array of input objects {txid, vout} or {txid, vout, spentInTx}
   * @param {string} spentInTx - Optional transaction ID where UTXOs were spent
   * @returns {Array} Array of spent UTXO objects
   */
  spendUTXOs(inputs, spentInTx = 'browser-spend') {
    const spentUTXOs = []

    try {
      inputs.forEach(input => {
        const key = `${input.txid}:${input.vout}`
        const utxo = this.utxos.get(key)

        if (!utxo) {
          console.warn(`⚠️ UTXO not found: ${key}`)
          return
        }

        // Mark as spent
        const spentUTXO = {
          ...utxo,
          spentAt: new Date().toISOString(),
          spentInTx: input.spentInTx || spentInTx
        }

        this.spentUTXOs.set(key, spentUTXO)
        spentUTXOs.push(spentUTXO)

        // Remove from available UTXOs
        this.utxos.delete(key)

        // Update address index
        const addressSet = this.addressIndex.get(utxo.address)
        if (addressSet) {
          addressSet.delete(key)
          if (addressSet.size === 0) {
            this.addressIndex.delete(utxo.address)
          }
        }

        console.log(`❌ UTXO spent: ${key} in ${spentUTXO.spentInTx}`)
      })

      this._updateMetadata()

      if (this.options.autoSave) {
        this.saveToStorage()
      }

    } catch (error) {
      console.error('BrowserUTXOManager: Error spending UTXOs:', error.message)
    }

    return spentUTXOs
  }

  /**
   * Check if a UTXO is available (unspent)
   * @param {string} txid - Transaction ID
   * @param {number} vout - Output index
   * @returns {boolean} True if UTXO is available
   */
  isUTXOAvailable(txid, vout) {
    const key = `${txid}:${vout}`
    return this.utxos.has(key)
  }

  /**
   * Get UTXO details
   * @param {string} txid - Transaction ID
   * @param {number} vout - Output index
   * @returns {Object|null} UTXO object or null if not found
   */
  getUTXO(txid, vout) {
    const key = `${txid}:${vout}`
    
    // Check if available
    if (this.utxos.has(key)) {
      return { status: 'available', utxo: this.utxos.get(key) }
    }

    // Check if spent
    if (this.spentUTXOs.has(key)) {
      return { status: 'spent', utxo: this.spentUTXOs.get(key) }
    }

    return { status: 'not_found', utxo: null }
  }

  /**
   * Create mock UTXOs for testing (browser-compatible)
   * @param {string} address - Target address
   * @param {number} count - Number of UTXOs to create
   * @param {number} satoshis - Satoshis per UTXO
   * @returns {Array} Array of created UTXOs
   */
  createMockUTXOs(address, count = 5, satoshis = 100000) {
    const mockUTXOs = []

    try {
      for (let i = 0; i < count; i++) {
        // Generate random txid using Web Crypto API
        const txidArray = new Uint8Array(32)
        if (typeof window !== 'undefined' && window.crypto && window.crypto.getRandomValues) {
          window.crypto.getRandomValues(txidArray)
        } else {
          // Fallback for environments without Web Crypto
          for (let j = 0; j < 32; j++) {
            txidArray[j] = Math.floor(Math.random() * 256)
          }
        }
        
        const txid = Array.from(txidArray).map(b => b.toString(16).padStart(2, '0')).join('')
        const script = `76a914${Array.from(new Uint8Array(20)).map(b => Math.floor(Math.random() * 256).toString(16).padStart(2, '0')).join('')}88ac`

        const utxo = {
          txid,
          vout: i,
          address,
          satoshis,
          script,
          isMock: true
        }

        if (this.addUTXO(utxo)) {
          mockUTXOs.push(utxo)
        }
      }

    } catch (error) {
      console.error('BrowserUTXOManager: Error creating mock UTXOs:', error.message)
    }

    return mockUTXOs
  }

  /**
   * Get manager statistics
   * @returns {Object} Statistics object
   */
  getStats() {
    const addresses = Array.from(this.addressIndex.keys())
    const balancesByAddress = {}
    
    addresses.forEach(address => {
      balancesByAddress[address] = this.getBalance(address)
    })

    return {
      totalUTXOs: this.utxos.size,
      totalSpent: this.spentUTXOs.size,
      totalValue: this.metadata.totalValue,
      totalAddresses: addresses.length,
      storageType: this.options.storage,
      storageKey: this.options.storageKey,
      balancesByAddress,
      createdAt: this.metadata.createdAt,
      lastUpdated: this.metadata.lastUpdated
    }
  }

  /**
   * Clear all UTXOs and reset state
   * @param {boolean} clearStorage - Also clear browser storage (default: true)
   */
  reset(clearStorage = true) {
    this.utxos.clear()
    this.addressIndex.clear()
    this.spentUTXOs.clear()
    
    this.metadata = {
      totalUTXOs: 0,
      totalValue: 0,
      createdAt: new Date().toISOString(),
      lastUpdated: new Date().toISOString()
    }

    if (clearStorage && this.options.storage !== STORAGE_TYPES.MEMORY) {
      const storage = this._getStorage()
      if (storage) {
        storage.removeItem(this.options.storageKey)
        console.log(`🔄 Cleared ${this.options.storage} storage`)
      }
    }

    console.log('🔄 BrowserUTXOManager reset complete')
  }

  /**
   * Update internal metadata
   * @private
   */
  _updateMetadata() {
    this.metadata.totalUTXOs = this.utxos.size
    this.metadata.totalValue = Array.from(this.utxos.values())
      .reduce((total, utxo) => total + utxo.satoshis, 0)
    this.metadata.lastUpdated = new Date().toISOString()
  }

  /**
   * Export UTXOs as JSON
   * @returns {string} JSON string of all data
   */
  exportData() {
    const data = {
      utxos: Array.from(this.utxos.values()),
      spentUTXOs: Array.from(this.spentUTXOs.values()),
      metadata: this.metadata,
      exportedAt: new Date().toISOString()
    }
    return JSON.stringify(data, null, 2)
  }

  /**
   * Import UTXOs from JSON
   * @param {string} jsonData - JSON string to import
   * @param {boolean} merge - Merge with existing data (default: false)
   * @returns {boolean} Success status
   */
  importData(jsonData, merge = false) {
    try {
      const data = JSON.parse(jsonData)

      if (!merge) {
        this.reset(false) // Don't clear storage yet
      }

      // Import UTXOs
      if (data.utxos && Array.isArray(data.utxos)) {
        data.utxos.forEach(utxo => {
          this.addUTXO(utxo)
        })
      }

      // Import spent UTXOs
      if (data.spentUTXOs && Array.isArray(data.spentUTXOs)) {
        data.spentUTXOs.forEach(spentUTXO => {
          const key = `${spentUTXO.txid}:${spentUTXO.vout}`
          this.spentUTXOs.set(key, spentUTXO)
        })
      }

      this._updateMetadata()

      if (this.options.autoSave) {
        this.saveToStorage()
      }

      console.log('✅ BrowserUTXOManager: Imported ' + (data.utxos && data.utxos.length || 0) + ' UTXOs')
      return true

    } catch (error) {
      console.error('BrowserUTXOManager: Error importing data:', error.message)
      return false
    }
  }
}

// Export for both CommonJS and ES modules
if (typeof module !== 'undefined' && module.exports) {
  module.exports = BrowserUTXOManager
  module.exports.STORAGE_TYPES = STORAGE_TYPES
} else if (typeof window !== 'undefined') {
  window.BrowserUTXOManager = BrowserUTXOManager
  window.BrowserUTXOManager.STORAGE_TYPES = STORAGE_TYPES
}