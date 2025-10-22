'use strict'

var bsv = require('../../')
var Transaction = bsv.Transaction
var Script = bsv.Script
var PrivateKey = bsv.PrivateKey
var Address = bsv.Address
var Hash = bsv.crypto.Hash
var $ = bsv.util.preconditions

/**
 * SmartLedgerAnchor
 * 
 * Blockchain anchoring system for credential root hashes and attestations.
 * Provides immutable timestamping and proof of existence on the BSV blockchain
 * using OP_RETURN outputs with structured metadata.
 * 
 * Features:
 * - Credential hash anchoring
 * - Batch anchoring for efficiency
 * - DID registration on-chain
 * - Revocation list management
 * - Timestamped proof of existence
 * - Cost-effective anchoring strategies
 */

/**
 * SmartLedgerAnchor constructor
 * @param {PrivateKey|String} privateKey - Private key for transactions
 * @param {Object} options - Configuration options
 */
function SmartLedgerAnchor(privateKey, options) {
  if (!(this instanceof SmartLedgerAnchor)) {
    return new SmartLedgerAnchor(privateKey, options)
  }
  
  if (typeof privateKey === 'string') {
    privateKey = PrivateKey.fromWIF(privateKey)
  }
  
  // Allow null private key for query-only operations
  if (privateKey !== null) {
    $.checkArgument(privateKey instanceof PrivateKey, 'Invalid private key')
    this.privateKey = privateKey
    this.address = privateKey.toAddress()
  } else {
    this.privateKey = null
    this.address = null
  }
  
  this.options = options || {}
  this.network = this.options.network || 'mainnet'
  
  // Protocol identifier
  this.PROTOCOL_ID = 'SMARTLEDGER.ATTEST'
  this.VERSION = 1
  
  return this
}

/**
 * Anchor credential hash to blockchain
 * @param {String|Buffer} credentialHash - Hash to anchor
 * @param {Object} metadata - Additional metadata
 * @param {Array} utxos - UTXOs for transaction
 * @returns {Promise<Object>} Anchor result
 */
SmartLedgerAnchor.prototype.anchorCredential = async function(credentialHash, metadata, utxos) {
  metadata = metadata || {}
  
  if (typeof credentialHash === 'string') {
    credentialHash = Buffer.from(credentialHash, 'hex')
  }
  
  $.checkArgument(Buffer.isBuffer(credentialHash), 'Invalid credential hash')
  $.checkArgument(credentialHash.length === 32, 'Hash must be 32 bytes')
  
  // Create anchor payload
  var anchorData = this._createAnchorPayload('CREDENTIAL', credentialHash, metadata)
  
  // Create transaction
  var tx = await this._createAnchorTransaction(anchorData, utxos)
  
  return {
    txid: tx.hash,
    transaction: tx,
    anchorHash: credentialHash.toString('hex'),
    metadata: metadata,
    timestamp: new Date().toISOString(),
    blockchainProof: {
      protocol: this.PROTOCOL_ID,
      version: this.VERSION,
      type: 'CREDENTIAL'
    }
  }
}

/**
 * Anchor multiple credentials in batch
 * @param {Array} credentialHashes - Array of hashes to anchor
 * @param {Object} metadata - Batch metadata
 * @param {Array} utxos - UTXOs for transaction
 * @returns {Promise<Object>} Batch anchor result
 */
SmartLedgerAnchor.prototype.anchorBatch = async function(credentialHashes, metadata, utxos) {
  metadata = metadata || {}
  
  $.checkArgument(Array.isArray(credentialHashes), 'Credential hashes must be array')
  $.checkArgument(credentialHashes.length > 0, 'Must provide at least one hash')
  
  // Create Merkle tree from hashes
  var merkleRoot = this._createMerkleRoot(credentialHashes)
  
  // Create batch anchor payload
  var anchorData = this._createAnchorPayload('BATCH', merkleRoot, {
    ...metadata,
    batchSize: credentialHashes.length,
    merkleRoot: merkleRoot.toString('hex')
  })
  
  // Create transaction
  var tx = await this._createAnchorTransaction(anchorData, utxos)
  
  return {
    txid: tx.hash,
    transaction: tx,
    merkleRoot: merkleRoot.toString('hex'),
    batchSize: credentialHashes.length,
    credentialHashes: credentialHashes.map(h => Buffer.isBuffer(h) ? h.toString('hex') : h),
    metadata: metadata,
    timestamp: new Date().toISOString(),
    blockchainProof: {
      protocol: this.PROTOCOL_ID,
      version: this.VERSION,
      type: 'BATCH'
    }
  }
}

/**
 * Register DID on blockchain
 * @param {String} did - DID to register
 * @param {Object} didDocument - DID Document
 * @param {Array} utxos - UTXOs for transaction
 * @returns {Promise<Object>} Registration result
 */
SmartLedgerAnchor.prototype.registerDID = async function(did, didDocument, utxos) {
  $.checkArgument(typeof did === 'string', 'DID must be string')
  $.checkArgument(didDocument && typeof didDocument === 'object', 'Invalid DID document')
  
  // Create hash of DID document
  var documentHash = Hash.sha256(Buffer.from(JSON.stringify(didDocument), 'utf8'))
  
  // Create DID registration payload
  var anchorData = this._createAnchorPayload('DID_REG', documentHash, {
    did: did,
    operation: 'create',
    documentHash: documentHash.toString('hex')
  })
  
  // Create transaction
  var tx = await this._createAnchorTransaction(anchorData, utxos)
  
  return {
    txid: tx.hash,
    transaction: tx,
    did: did,
    documentHash: documentHash.toString('hex'),
    timestamp: new Date().toISOString(),
    blockchainProof: {
      protocol: this.PROTOCOL_ID,
      version: this.VERSION,
      type: 'DID_REG'
    }
  }
}

/**
 * Revoke credential on blockchain
 * @param {String} credentialId - Credential ID to revoke
 * @param {String} reason - Revocation reason
 * @param {Array} utxos - UTXOs for transaction
 * @returns {Promise<Object>} Revocation result
 */
SmartLedgerAnchor.prototype.revokeCredential = async function(credentialId, reason, utxos) {
  $.checkArgument(typeof credentialId === 'string', 'Credential ID must be string')
  
  reason = reason || 'unspecified'
  
  // Create revocation hash
  var revocationData = {
    credentialId: credentialId,
    reason: reason,
    timestamp: new Date().toISOString(),
    issuer: this.address.toString()
  }
  
  var revocationHash = Hash.sha256(Buffer.from(JSON.stringify(revocationData), 'utf8'))
  
  // Create revocation payload
  var anchorData = this._createAnchorPayload('REVOKE', revocationHash, {
    credentialId: credentialId,
    reason: reason
  })
  
  // Create transaction
  var tx = await this._createAnchorTransaction(anchorData, utxos)
  
  return {
    txid: tx.hash,
    transaction: tx,
    credentialId: credentialId,
    reason: reason,
    revocationHash: revocationHash.toString('hex'),
    timestamp: new Date().toISOString(),
    blockchainProof: {
      protocol: this.PROTOCOL_ID,
      version: this.VERSION,
      type: 'REVOKE'
    }
  }
}

/**
 * Create anchor payload
 * @private
 */
SmartLedgerAnchor.prototype._createAnchorPayload = function(type, hash, metadata) {
  var timestamp = Math.floor(Date.now() / 1000) // Unix timestamp
  
  // Create structured payload
  var payload = Buffer.concat([
    Buffer.from(this.PROTOCOL_ID, 'utf8'),        // Protocol identifier
    Buffer.from([this.VERSION]),                  // Version
    Buffer.from(type.padEnd(10, '\0'), 'utf8'),  // Type (padded to 10 bytes)
    Buffer.from([timestamp >> 24, timestamp >> 16, timestamp >> 8, timestamp]), // Timestamp (4 bytes)
    hash,                                         // Hash (32 bytes)
    Buffer.from(JSON.stringify(metadata), 'utf8') // Metadata (variable)
  ])
  
  return payload
}

/**
 * Create anchor transaction
 * @private
 */
SmartLedgerAnchor.prototype._createAnchorTransaction = async function(anchorData, utxos) {
  if (!utxos || utxos.length === 0) {
    throw new Error('UTXOs required for anchor transaction')
  }
  
  // Calculate required fee (simplified)
  var estimatedSize = 200 + anchorData.length // Base size + OP_RETURN data
  var feeRate = this.options.feeRate || 1 // satoshis per byte
  var fee = estimatedSize * feeRate
  
  // Calculate total input value
  var totalInput = utxos.reduce((sum, utxo) => sum + utxo.satoshis, 0)
  
  if (totalInput < fee) {
    throw new Error('Insufficient funds for anchor transaction')
  }
  
  // Create transaction
  var tx = new Transaction()
  
  // Add inputs
  utxos.forEach(utxo => {
    tx.from(utxo)
  })
  
  // Add OP_RETURN output with anchor data
  var opReturnScript = Script.buildDataOut(anchorData)
  tx.addOutput(new Transaction.Output({
    script: opReturnScript,
    satoshis: 0
  }))
  
  // Add change output if needed
  var change = totalInput - fee
  if (change > 546) { // Dust limit
    tx.to(this.address, change)
  }
  
  // Sign transaction
  tx.sign(this.privateKey)
  
  return tx
}

/**
 * Create Merkle root from array of hashes
 * @private
 */
SmartLedgerAnchor.prototype._createMerkleRoot = function(hashes) {
  if (hashes.length === 0) {
    throw new Error('Cannot create Merkle root from empty array')
  }
  
  // Convert to buffers if needed
  var hashBuffers = hashes.map(hash => {
    return Buffer.isBuffer(hash) ? hash : Buffer.from(hash, 'hex')
  })
  
  // Build Merkle tree
  while (hashBuffers.length > 1) {
    var nextLevel = []
    
    for (var i = 0; i < hashBuffers.length; i += 2) {
      var left = hashBuffers[i]
      var right = i + 1 < hashBuffers.length ? hashBuffers[i + 1] : left
      
      var combined = Buffer.concat([left, right])
      var hash = Hash.sha256(combined)
      nextLevel.push(hash)
    }
    
    hashBuffers = nextLevel
  }
  
  return hashBuffers[0]
}

/**
 * Parse anchor data from OP_RETURN output
 * @param {Buffer} data - Raw OP_RETURN data
 * @returns {Object} Parsed anchor data
 */
SmartLedgerAnchor.parseAnchorData = function(data) {
  if (!Buffer.isBuffer(data)) {
    throw new Error('Data must be Buffer')
  }
  
  if (data.length < 50) { // Minimum expected size
    throw new Error('Data too short for SmartLedger anchor')
  }
  
  var offset = 0
  
  // Parse protocol identifier
  var protocolLength = 'SMARTLEDGER.ATTEST'.length
  var protocol = data.slice(offset, offset + protocolLength).toString('utf8')
  offset += protocolLength
  
  if (protocol !== 'SMARTLEDGER.ATTEST') {
    throw new Error('Invalid protocol identifier')
  }
  
  // Parse version
  var version = data[offset]
  offset += 1
  
  // Parse type
  var type = data.slice(offset, offset + 10).toString('utf8').replace(/\0/g, '')
  offset += 10
  
  // Parse timestamp
  var timestamp = (data[offset] << 24) | (data[offset + 1] << 16) | (data[offset + 2] << 8) | data[offset + 3]
  offset += 4
  
  // Parse hash
  var hash = data.slice(offset, offset + 32)
  offset += 32
  
  // Parse metadata
  var metadataBuffer = data.slice(offset)
  var metadata = {}
  
  try {
    metadata = JSON.parse(metadataBuffer.toString('utf8'))
  } catch (e) {
    // Ignore JSON parse errors
  }
  
  return {
    protocol: protocol,
    version: version,
    type: type,
    timestamp: new Date(timestamp * 1000),
    hash: hash.toString('hex'),
    metadata: metadata
  }
}

/**
 * Verify anchor proof
 * @param {String} txid - Transaction ID
 * @param {String} expectedHash - Expected anchored hash
 * @returns {Promise<Object>} Verification result
 */
SmartLedgerAnchor.verifyAnchor = async function(txid, expectedHash) {
  // Note: In production, this would query blockchain APIs
  // For now, return a mock verification result
  
  return {
    verified: true,
    txid: txid,
    hash: expectedHash,
    timestamp: new Date().toISOString(),
    confirmations: 6, // Mock confirmations
    blockHeight: 800000, // Mock block height
    proof: {
      type: 'blockchain_anchor',
      protocol: 'SMARTLEDGER.ATTEST',
      network: 'mainnet'
    }
  }
}

/**
 * Get anchoring cost estimate
 * @param {Number} numHashes - Number of hashes to anchor
 * @param {Object} options - Cost estimation options
 * @returns {Object} Cost estimate
 */
SmartLedgerAnchor.getCostEstimate = function(numHashes, options) {
  options = options || {}
  
  var feeRate = options.feeRate || 1 // satoshis per byte
  var baseSize = 200 // Base transaction size
  var perHashSize = 32 // Bytes per hash in batch
  
  var individualCost = numHashes * (baseSize + perHashSize) * feeRate
  var batchCost = (baseSize + (numHashes * perHashSize)) * feeRate
  
  return {
    individual: {
      totalCost: individualCost,
      costPerHash: baseSize * feeRate,
      transactions: numHashes
    },
    batch: {
      totalCost: batchCost,
      costPerHash: Math.ceil(batchCost / numHashes),
      transactions: 1
    },
    savings: {
      absolute: individualCost - batchCost,
      percentage: Math.round(((individualCost - batchCost) / individualCost) * 100)
    }
  }
}

/**
 * Create UTXO from transaction output
 * @param {String} txid - Transaction ID
 * @param {Number} outputIndex - Output index
 * @param {Number} satoshis - Output value
 * @param {Script} script - Output script
 * @returns {Object} UTXO object
 */
SmartLedgerAnchor.createUTXO = function(txid, outputIndex, satoshis, script) {
  return {
    txid: txid,
    outputIndex: outputIndex,
    satoshis: satoshis,
    script: script
  }
}

/**
 * Generate test anchor data
 * @returns {Object} Test anchor data
 */
SmartLedgerAnchor.generateTestData = function() {
  var privateKey = new PrivateKey()
  var anchor = new SmartLedgerAnchor(privateKey)
  
  var credentialHash = Hash.sha256(Buffer.from('test credential data'))
  var metadata = {
    issuer: 'did:smartledger:test',
    type: 'EmailVerifiedCredential',
    environment: 'test'
  }
  
  return {
    privateKey: privateKey.toWIF(),
    address: privateKey.toAddress().toString(),
    credentialHash: credentialHash.toString('hex'),
    metadata: metadata,
    anchor: anchor
  }
}

module.exports = SmartLedgerAnchor