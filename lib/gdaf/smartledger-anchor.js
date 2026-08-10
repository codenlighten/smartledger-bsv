'use strict'

var HDPrivateKey = require('../hdprivatekey')
var Mnemonic = require('../mnemonic')
var Transaction = require('../transaction')
var Script = require('../script')
var PrivateKey = require('../privatekey')
var Address = require('../address')
var Hash = require('../crypto/hash')
var SPV = require('../spv')
var $ = require('../util/preconditions')

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
/**
 * Refuse to serialise anything that looks like key material.
 *
 * Defence in depth for the argument-order defect that put a private key in the `metadata`
 * slot: even if a caller reaches this with a key, the anchor fails loudly instead of
 * broadcasting the secret. Checks the shape rather than the class, because a key that has
 * already been through JSON is a plain object by then.
 */
// Field names that mean key material whatever they contain.
var SECRET_KEYS = ['bn', 'privateKey', 'privkey', 'privKey', 'wif', 'privateJwk', 'xpriv', 'xprv', 'mnemonic']
// Field names that are only suspicious when the VALUE also looks secret. `d` is the JWK
// private exponent but also the most common short field name there is (a date, a delta);
// `seed` is a BIP39 seed but also a campaign seed. Refusing these on the name alone
// rejected `{ d: '2026-01-01' }` and told the caller their date looked like a key.
var AMBIGUOUS_KEYS = ['d', 'seed', 'secret', 'key']

/** A WIF that actually decodes to a key — the checksum makes false positives negligible. */
function isWIF (str) {
  if (typeof str !== 'string' || str.length < 50 || str.length > 53) return false
  try {
    PrivateKey.fromWIF(str)
    return true
  } catch (e) { return false }
}

/** An extended PRIVATE key (xprv/tprv). The public xpub is not secret and is allowed. */
function isXprv (str) {
  if (typeof str !== 'string' || !/^(xprv|tprv)/.test(str)) return false
  try {
    HDPrivateKey.fromString(str)
    return true
  } catch (e) { return false }
}

/** A valid BIP39 phrase. Checked against the wordlist + checksum, not just word count. */
function isMnemonic (str) {
  if (typeof str !== 'string') return false
  var words = str.trim().split(/\s+/)
  if ([12, 15, 18, 21, 24].indexOf(words.length) === -1) return false
  try {
    return Mnemonic.isValid(str.trim())
  } catch (e) { return false }
}

/** 64 hex characters that are a valid secp256k1 scalar — i.e. usable as a private key. */
function isHexScalar (str) {
  if (typeof str !== 'string' || !/^[0-9a-fA-F]{64}$/.test(str)) return false
  try {
    PrivateKey.fromHex(str)
    return true
  } catch (e) { return false }
}

/**
 * Self-identifying secrets: formats whose own encoding says "this is a private key".
 * These are refused under ANY field name, because naming a WIF `note` does not make it
 * safe to publish. A bare 64-hex scalar is deliberately NOT here — it is indistinguishable
 * from a SHA-256 hash, and anchoring a document hash is the module's whole purpose.
 */
function isSelfIdentifyingSecret (str) {
  return isWIF(str) || isXprv(str) || isMnemonic(str)
}

/**
 * Refuse to serialise anything that looks like key material.
 *
 * Defence in depth for the argument-order defect that put a private key in the `metadata`
 * slot: even if a caller reaches this with a key, the anchor fails loudly instead of
 * broadcasting the secret. Checks shape rather than class, because a key that has already
 * been through JSON is a plain object by then.
 *
 * Three independent signals, because name alone was both too strict and too loose — it
 * rejected `{ d: '2026-01-01' }` while happily publishing `{ note: '<a real WIF>' }`:
 *
 *   1. the value IS this anchor's own signing key, in any representation;
 *   2. the value is a self-identifying secret (WIF / xprv / BIP39) under any name;
 *   3. the field name means key material — always for `wif`/`bn`/`xprv`/…, and for
 *      ambiguous names like `d`/`seed` only when the value looks secret too.
 *
 * @param {object} metadata  the object about to be published in the OP_RETURN
 * @param {PrivateKey} [ownKey]  this anchor's key, so leaking it is caught by value
 */
function assertNoKeyMaterial (metadata, ownKey) {
  // Every representation of our own key. Addresses and public keys are omitted on
  // purpose: they are public, and an anchor legitimately references them.
  var ownForms = []
  if (ownKey && typeof ownKey.toWIF === 'function') {
    try {
      ownForms = [ownKey.toWIF(), ownKey.toString(), ownKey.bn && ownKey.bn.toString(16)]
        .filter(function (f) { return typeof f === 'string' && f.length })
        .map(function (f) { return f.toLowerCase() })
    } catch (e) { ownForms = [] }
  }

  function refuse (path, why) {
    throw new Error('Refusing to anchor: ' + (path || 'metadata') + ' ' + why +
      ', and anchor metadata is published in the OP_RETURN where it is permanent and public.')
  }

  function checkString (str, path) {
    if (ownForms.length && ownForms.indexOf(str.toLowerCase()) !== -1) {
      refuse(path, "is this anchor's own private key")
    }
    if (isWIF(str)) refuse(path, 'is a WIF private key')
    if (isXprv(str)) refuse(path, 'is an extended private key')
    if (isMnemonic(str)) refuse(path, 'is a BIP39 mnemonic phrase')
  }

  function walk (value, path, depth) {
    if (typeof value === 'string') { checkString(value, path); return }
    if (!value || typeof value !== 'object' || depth > 6) return
    if (typeof value.toWIF === 'function' && value.bn) {
      refuse(path, 'is a PrivateKey')
    }
    if (Array.isArray(value)) {
      value.forEach(function (v, i) { walk(v, (path || 'metadata') + '[' + i + ']', depth + 1) })
      return
    }
    Object.keys(value).forEach(function (k) {
      var v = value[k]
      var here = path ? path + '.' + k : k
      if (v != null && typeof v !== 'object') {
        var s = String(v)
        if (SECRET_KEYS.indexOf(k) !== -1) refuse(here, 'is a field that holds key material')
        if (AMBIGUOUS_KEYS.indexOf(k) !== -1 && (isSelfIdentifyingSecret(s) || isHexScalar(s))) {
          refuse(here, 'holds something that decodes as a private key')
        }
      }
      walk(v, here, depth + 1)
    })
  }
  walk(metadata, '', 0)
}

SmartLedgerAnchor.prototype._createAnchorPayload = function(type, hash, metadata) {
  var timestamp = Math.floor(Date.now() / 1000) // Unix timestamp

  // This payload goes on chain, permanently and publicly. Pass our own key so that
  // leaking *it* — the exact defect this guard exists for — is caught by value and not
  // only by field name.
  assertNoKeyMaterial(metadata, this.privateKey)

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
 * Verify an anchor proof against the chain.
 *
 * SECURITY: this MUST NOT fabricate a result. An attestation/legal-token system
 * that reports `verified: true` for an unverified txid silently validates a bogus
 * anchor — the worst possible failure mode. Real verification requires querying a
 * trusted BSV source (SPV proof, full node, or block explorer) for the transaction,
 * confirming it is mined, and checking that one of its OP_RETURN outputs actually
 * commits to `expectedHash`. There is no built-in chain access here, so the caller
 * must inject a `chainProvider`; without one we fail closed by throwing rather than
 * returning a stub.
 *
 * @param {String} txid - Transaction ID to verify.
 * @param {String} expectedHash - Hex hash the anchor is expected to commit to.
 * @param {Object} [options]
 * @param {Function} options.chainProvider - async (txid) => {
 *     confirmations:Number, blockHeight:Number, opReturns:String[] (hex payloads) }
 *     backed by a trusted BSV source.
 * @param {Number} [options.minConfirmations=1] - required confirmations.
 * @returns {Promise<Object>} Verification result with `verified` reflecting the
 *   real inclusion + commitment check.
 */
SmartLedgerAnchor.verifyAnchor = async function(txid, expectedHash, options) {
  options = options || {}
  if (!txid || !expectedHash) {
    throw new Error('verifyAnchor requires both txid and expectedHash')
  }

  // Path A — TRUSTLESS SPV: a Merkle proof + block header proves the tx is mined,
  // and the raw tx (bound to txid by its hash) proves it commits to expectedHash.
  // No trust in the data provider: a forged branch cannot hash to a PoW-backed root.
  // Optionally pass a headerChain (tx's block first, then descendants) to also prove
  // confirmations under real work.
  if (options.spvProof && (options.header || options.headerChain) && options.rawTx) {
    return SmartLedgerAnchor._verifyAnchorSPV(txid, expectedHash, options)
  }

  // Path B — a caller-injected TRUSTED chain provider (full node / SPV service).
  if (typeof options.chainProvider !== 'function') {
    throw new Error(
      'verifyAnchor needs either a trustless SPV proof — { spvProof: { index, nodes }, ' +
      'header, rawTx } — or a trusted options.chainProvider(txid) returning ' +
      '{ confirmations, blockHeight, opReturns }. Refusing to fabricate a result.'
    )
  }

  var minConfirmations = options.minConfirmations != null ? options.minConfirmations : 1
  var chain = await options.chainProvider(txid)

  var confirmations = (chain && chain.confirmations) || 0
  var opReturns = (chain && chain.opReturns) || []
  var wanted = String(expectedHash).toLowerCase()
  // The anchor is valid only if a real OP_RETURN on this mined tx commits to the
  // expected hash. Match on the hash payload, not on substring of the whole tx.
  var committed = opReturns.some(function(payload) {
    return String(payload).toLowerCase().indexOf(wanted) !== -1
  })

  var verified = confirmations >= minConfirmations && committed

  return {
    verified: verified,
    txid: txid,
    hash: expectedHash,
    committed: committed,
    confirmations: confirmations,
    blockHeight: (chain && chain.blockHeight) || null,
    timestamp: new Date().toISOString(),
    proof: {
      type: 'blockchain_anchor',
      protocol: 'SMARTLEDGER.ATTEST',
      network: options.network || 'mainnet'
    }
  }
}

/**
 * Trustless SPV anchor verification: prove the anchoring tx is mined AND commits to
 * expectedHash, using only a Merkle proof, a block header, and the raw tx bytes.
 * @private
 */
SmartLedgerAnchor._verifyAnchorSPV = function(txid, expectedHash, options) {
  var proof = options.spvProof || {}

  // Optional confirmations proof: a header chain with the tx's block first, then its
  // descendants. The block containing the tx is the chain anchor.
  var chainResult = null
  var inclusionHeader = options.header
  if (options.headerChain) {
    chainResult = SPV.verifyHeaderChain(options.headerChain, {
      requirePow: options.requirePow !== false,
      trustedHash: options.trustedHash
    })
    inclusionHeader = options.headerChain[0]
  }

  var inclusion = SPV.verifyTxInclusion({
    txid: txid,
    index: proof.index,
    nodes: proof.nodes,
    header: inclusionHeader,
    requirePow: options.requirePow !== false
  })

  // Bind the raw tx to the proven txid (double-SHA256, reversed to display order),
  // then confirm one of its OP_RETURN outputs commits to expectedHash.
  var raw = Buffer.isBuffer(options.rawTx) ? options.rawTx : Buffer.from(options.rawTx, 'hex')
  var computedTxid = Buffer.from(Hash.sha256sha256(raw)).reverse().toString('hex')
  var txidBound = computedTxid.toLowerCase() === String(txid).toLowerCase()
  var committed = txidBound && SmartLedgerAnchor._rawTxCommitsTo(raw, expectedHash)

  // Confirmations: number of blocks in the supplied chain (tx's block + descendants).
  var confirmations = chainResult ? chainResult.count : (options.header ? 1 : 0)
  var minConfirmations = options.minConfirmations != null ? options.minConfirmations : 1
  var chainOk = chainResult ? chainResult.valid : true
  var enoughConfirmations = confirmations >= minConfirmations

  return {
    verified: inclusion.valid && txidBound && committed && chainOk && enoughConfirmations,
    chainVerified: inclusion.valid, // a real, PoW-backed inclusion proof passed
    committed: committed,
    txidBound: txidBound,
    powValid: inclusion.powValid,
    confirmations: confirmations,
    headerChainValid: chainResult ? chainResult.valid : null,
    headerChainReason: chainResult ? (chainResult.reason || null) : null,
    tipHash: chainResult ? chainResult.tipHash : null,
    txid: txid,
    hash: expectedHash,
    blockHash: inclusion.blockHash,
    merkleRoot: inclusion.merkleRoot,
    timestamp: new Date().toISOString(),
    proof: {
      type: chainResult ? 'spv_merkle_inclusion_with_confirmations' : 'spv_merkle_inclusion',
      protocol: 'SMARTLEDGER.ATTEST',
      network: options.network || 'mainnet'
    }
  }
}

/**
 * True if any OP_RETURN output of the raw tx carries a data push equal to (or
 * containing) `expectedHash`.
 * @private
 */
SmartLedgerAnchor._rawTxCommitsTo = function(rawTx, expectedHash) {
  var wanted = String(expectedHash).toLowerCase()
  var tx
  try {
    tx = new Transaction(rawTx)
  } catch (e) {
    return false
  }
  return tx.outputs.some(function(out) {
    var script = out.script
    if (!script || !script.chunks || !script.chunks.length) return false
    // OP_RETURN (0x6a) or OP_FALSE OP_RETURN (0x00 0x6a) data carrier.
    var isOpReturn = script.chunks[0].opcodenum === 0x6a ||
      (script.chunks[0].opcodenum === 0x00 && script.chunks[1] && script.chunks[1].opcodenum === 0x6a)
    if (!isOpReturn) return false
    return script.chunks.some(function(chunk) {
      return chunk.buf && chunk.buf.toString('hex').toLowerCase().indexOf(wanted) !== -1
    })
  })
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