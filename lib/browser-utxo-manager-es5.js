'use strict'

/**
 * Browser-Compatible UTXO Manager (ES5 Compatible)
 * Lightweight UTXO management for browser environments with configurable storage
 */

var STORAGE_TYPES = {
  MEMORY: 'memory',
  SESSION: 'session',
  LOCAL: 'local'
}

function BrowserUTXOManager(options) {
  options = options || {}
  
  this.options = {
    storage: options.storage || STORAGE_TYPES.MEMORY,
    storageKey: options.storageKey || 'smartledger-utxos',
    autoSave: options.autoSave !== false,
    maxUTXOs: options.maxUTXOs || 1000
  }

  // Validate storage type
  var validTypes = [STORAGE_TYPES.MEMORY, STORAGE_TYPES.SESSION, STORAGE_TYPES.LOCAL]
  if (validTypes.indexOf(this.options.storage) === -1) {
    throw new Error('Invalid storage type: ' + this.options.storage)
  }

  this.utxos = new Map()
  this.addressIndex = new Map()
  this.spentUTXOs = new Map()
  this.metadata = {
    totalUTXOs: 0,
    totalValue: 0,
    createdAt: new Date().toISOString(),
    lastModified: new Date().toISOString()
  }

  this.loadFromStorage()
}

BrowserUTXOManager.prototype.getStorage = function() {
  if (this.options.storage === STORAGE_TYPES.SESSION) {
    return typeof sessionStorage !== 'undefined' ? sessionStorage : null
  } else if (this.options.storage === STORAGE_TYPES.LOCAL) {
    return typeof localStorage !== 'undefined' ? localStorage : null
  }
  return null
}

BrowserUTXOManager.prototype.loadFromStorage = function() {
  var storage = this.getStorage()
  if (!storage) return

  try {
    var data = storage.getItem(this.options.storageKey)
    if (!data) return

    var parsed = JSON.parse(data)
    if (!parsed.utxos) return

    var self = this
    parsed.utxos.forEach(function(utxoData) {
      var key = utxoData.txid + ':' + utxoData.vout
      self.utxos.set(key, utxoData)
      
      if (!self.addressIndex.has(utxoData.address)) {
        self.addressIndex.set(utxoData.address, new Set())
      }
      self.addressIndex.get(utxoData.address).add(key)
    })

    if (parsed.metadata) {
      this.metadata = parsed.metadata
    }

    console.log('✅ BrowserUTXOManager: Loaded ' + this.utxos.size + ' UTXOs from ' + this.options.storage + ' storage')
  } catch (e) {
    console.error('Failed to load UTXOs from storage:', e)
  }
}

BrowserUTXOManager.prototype.saveToStorage = function() {
  if (this.options.storage === STORAGE_TYPES.MEMORY) return

  var storage = this.getStorage()
  if (!storage) return

  try {
    var data = {
      utxos: Array.from(this.utxos.values()),
      metadata: this.metadata,
      version: '1.0.0',
      timestamp: new Date().toISOString()
    }

    storage.setItem(this.options.storageKey, JSON.stringify(data))
    console.log('💾 BrowserUTXOManager: Saved ' + this.utxos.size + ' UTXOs to ' + this.options.storage + ' storage')
  } catch (e) {
    console.error('Failed to save UTXOs to storage:', e)
  }
}

BrowserUTXOManager.prototype.addUTXO = function(utxo) {
  if (!utxo || !utxo.txid || typeof utxo.vout !== 'number') {
    throw new Error('Invalid UTXO: missing txid or vout')
  }

  var key = utxo.txid + ':' + utxo.vout

  if (this.utxos.has(key)) {
    console.log('⚠️ UTXO already exists: ' + key)
    return false
  }

  // Add required fields
  var utxoData = {
    txid: utxo.txid,
    vout: utxo.vout,
    address: utxo.address || '',
    satoshis: utxo.satoshis || 0,
    script: utxo.script || '',
    status: 'available',
    addedAt: new Date().toISOString()
  }

  this.utxos.set(key, utxoData)

  // Update address index
  if (utxoData.address) {
    if (!this.addressIndex.has(utxoData.address)) {
      this.addressIndex.set(utxoData.address, new Set())
    }
    this.addressIndex.get(utxoData.address).add(key)
  }

  this.updateMetadata()
  if (this.options.autoSave) {
    this.saveToStorage()
  }

  return true
}

BrowserUTXOManager.prototype.getUTXOsForAddress = function(address) {
  var utxoKeys = this.addressIndex.get(address)
  if (!utxoKeys) return []

  var results = []
  var self = this
  utxoKeys.forEach(function(key) {
    var utxo = self.utxos.get(key)
    if (utxo && utxo.status === 'available') {
      results.push(utxo)
    }
  })

  return results
}

BrowserUTXOManager.prototype.getBalance = function(address) {
  var utxos = this.getUTXOsForAddress(address)
  return utxos.reduce(function(sum, utxo) {
    return sum + (utxo.satoshis || 0)
  }, 0)
}

BrowserUTXOManager.prototype.spendUTXOs = function(inputs, spentInTx) {
  spentInTx = spentInTx || 'browser-spend'
  var spentUTXOs = []

  for (var i = 0; i < inputs.length; i++) {
    var input = inputs[i]
    var key = input.txid + ':' + input.vout
    var utxo = this.utxos.get(key)

    if (utxo && utxo.status === 'available') {
      utxo.status = 'spent'
      utxo.spentAt = new Date().toISOString()
      utxo.spentInTx = spentInTx

      this.spentUTXOs.set(key, {
        txid: utxo.txid,
        vout: utxo.vout,
        spentInTx: spentInTx,
        spentAt: utxo.spentAt
      })

      spentUTXOs.push(utxo)
    }
  }

  this.updateMetadata()
  if (this.options.autoSave) {
    this.saveToStorage()
  }

  return spentUTXOs
}

BrowserUTXOManager.prototype.getUTXO = function(txid, vout) {
  var key = txid + ':' + vout
  var utxo = this.utxos.get(key)
  
  return {
    exists: !!utxo,
    utxo: utxo,
    status: utxo ? utxo.status : 'not-found'
  }
}

BrowserUTXOManager.prototype.createMockUTXOs = function(address, count, satoshis) {
  count = count || 5
  satoshis = satoshis || 100000
  var mockUTXOs = []

  for (var i = 0; i < count; i++) {
    // Generate random-like txid
    var txid = ''
    for (var j = 0; j < 64; j++) {
      txid += Math.floor(Math.random() * 16).toString(16)
    }

    var mockUTXO = {
      txid: txid,
      vout: i,
      address: address,
      satoshis: satoshis + Math.floor(Math.random() * 10000),
      script: '',
      status: 'available'
    }

    this.addUTXO(mockUTXO)
    mockUTXOs.push(mockUTXO)
  }

  return mockUTXOs
}

BrowserUTXOManager.prototype.getStats = function() {
  var totalValue = 0
  var availableCount = 0
  var spentCount = 0

  this.utxos.forEach(function(utxo) {
    totalValue += utxo.satoshis || 0
    if (utxo.status === 'available') {
      availableCount++
    } else if (utxo.status === 'spent') {
      spentCount++
    }
  })

  return {
    totalUTXOs: this.utxos.size,
    totalAvailable: availableCount,
    totalSpent: spentCount,
    totalValue: totalValue,
    totalAddresses: this.addressIndex.size,
    storageType: this.options.storage,
    metadata: this.metadata
  }
}

BrowserUTXOManager.prototype.updateMetadata = function() {
  var stats = this.getStats()
  this.metadata.totalUTXOs = stats.totalUTXOs
  this.metadata.totalValue = stats.totalValue
  this.metadata.lastModified = new Date().toISOString()
}

BrowserUTXOManager.prototype.exportData = function() {
  return JSON.stringify({
    utxos: Array.from(this.utxos.values()),
    metadata: this.metadata,
    version: '1.0.0',
    exportedAt: new Date().toISOString()
  })
}

BrowserUTXOManager.prototype.importData = function(jsonData, merge) {
  merge = merge || false
  
  try {
    var data = JSON.parse(jsonData)
    
    if (!merge) {
      this.utxos.clear()
      this.addressIndex.clear()
      this.spentUTXOs.clear()
    }

    if (data.utxos && Array.isArray(data.utxos)) {
      var self = this
      data.utxos.forEach(function(utxo) {
        self.addUTXO(utxo)
      })
    }

    console.log('✅ BrowserUTXOManager: Imported ' + (data.utxos && data.utxos.length || 0) + ' UTXOs')
    return true
  } catch (e) {
    console.error('Failed to import UTXO data:', e)
    return false
  }
}

// Export
if (typeof module !== 'undefined' && module.exports) {
  module.exports = BrowserUTXOManager
  module.exports.STORAGE_TYPES = STORAGE_TYPES
} else if (typeof window !== 'undefined') {
  window.BrowserUTXOManager = BrowserUTXOManager
  window.BrowserUTXOManager.STORAGE_TYPES = STORAGE_TYPES
}