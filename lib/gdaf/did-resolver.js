'use strict'

var bsv = require('../../')
var PublicKey = bsv.PublicKey
var PrivateKey = bsv.PrivateKey
var Hash = bsv.crypto.Hash
var $ = bsv.util.preconditions
var errors = bsv.errors

/**
 * SmartLedger DID Resolver
 * 
 * Implements the did:smartledger DID method for decentralized identity
 * management on the Bitcoin SV blockchain.
 * 
 * DID Format: did:smartledger:<pubkey>[:<network>][:<path>]
 * 
 * Features:
 * - Generate DIDs from private/public keys
 * - Resolve DID documents
 * - Verify DID authenticity
 * - Support for key rotation and service endpoints
 * - Integration with SmartLedger attestation framework
 */

/**
 * DID Resolver constructor
 * @param {Object} options - Configuration options
 */
function DIDResolver(options) {
  if (!(this instanceof DIDResolver)) {
    return new DIDResolver(options)
  }
  
  this.options = options || {}
  this.network = this.options.network || 'mainnet'
  this.registry = this.options.registry || null
  
  return this
}

/**
 * Generate DID from public key
 * @param {PublicKey|String} publicKey - Public key
 * @param {Object} options - Additional options
 * @returns {String} DID string
 */
DIDResolver.fromPublicKey = function(publicKey, options) {
  options = options || {}
  
  if (typeof publicKey === 'string') {
    publicKey = PublicKey.fromString(publicKey)
  }
  
  $.checkArgument(publicKey instanceof PublicKey, 'Invalid public key')
  
  var pubkeyHex = publicKey.toString('hex')
  var network = options.network || 'mainnet'
  var path = options.path || ''
  
  var did = 'did:smartledger:' + pubkeyHex
  
  if (network !== 'mainnet') {
    did += ':' + network
  }
  
  if (path) {
    did += ':' + path
  }
  
  return did
}

/**
 * Generate DID from private key
 * @param {PrivateKey|String} privateKey - Private key
 * @param {Object} options - Additional options
 * @returns {String} DID string
 */
DIDResolver.fromPrivateKey = function(privateKey, options) {
  if (typeof privateKey === 'string') {
    privateKey = PrivateKey.fromWIF(privateKey)
  }
  
  $.checkArgument(privateKey instanceof PrivateKey, 'Invalid private key')
  
  return DIDResolver.fromPublicKey(privateKey.toPublicKey(), options)
}

/**
 * Parse DID string into components
 * @param {String} did - DID string
 * @returns {Object} DID components
 */
DIDResolver.parseDID = function(did) {
  $.checkArgument(typeof did === 'string', 'DID must be a string')
  
  if (!did.startsWith('did:smartledger:')) {
    throw new Error('Invalid SmartLedger DID format')
  }
  
  var parts = did.split(':')
  
  if (parts.length < 3) {
    throw new Error('Invalid DID format')
  }
  
  var result = {
    method: 'smartledger',
    identifier: parts[2],
    network: 'mainnet',
    path: ''
  }
  
  // Parse optional network
  if (parts.length > 3 && parts[3] !== '') {
    result.network = parts[3]
  }
  
  // Parse optional path
  if (parts.length > 4) {
    result.path = parts.slice(4).join(':')
  }
  
  return result
}

/**
 * Validate DID format
 * @param {String} did - DID string
 * @returns {Boolean} True if valid
 */
DIDResolver.isValidDID = function(did) {
  try {
    var parsed = DIDResolver.parseDID(did)
    
    // Validate public key format
    if (!/^[0-9a-fA-F]{66}$/.test(parsed.identifier) && 
        !/^[0-9a-fA-F]{130}$/.test(parsed.identifier)) {
      return false
    }
    
    // Validate network
    if (!['mainnet', 'testnet', 'regtest'].includes(parsed.network)) {
      return false
    }
    
    return true
  } catch (e) {
    return false
  }
}

/**
 * Extract public key from DID
 * @param {String} did - DID string
 * @returns {PublicKey} Public key
 */
DIDResolver.getPublicKey = function(did) {
  var parsed = DIDResolver.parseDID(did)
  return PublicKey.fromString(parsed.identifier)
}

/**
 * Create DID Document
 * @param {String} did - DID string
 * @param {Object} options - Document options
 * @returns {Object} DID Document
 */
DIDResolver.createDocument = function(did, options) {
  options = options || {}
  
  $.checkArgument(DIDResolver.isValidDID(did), 'Invalid DID')
  
  var publicKey = DIDResolver.getPublicKey(did)
  var keyId = did + '#keys-1'
  
  var document = {
    '@context': [
      'https://www.w3.org/ns/did/v1',
      'https://w3id.org/security/suites/secp256k1-2019/v1'
    ],
    id: did,
    verificationMethod: [{
      id: keyId,
      type: 'EcdsaSecp256k1VerificationKey2019',
      controller: did,
      publicKeyHex: publicKey.toString('hex')
    }],
    authentication: [keyId],
    assertionMethod: [keyId],
    keyAgreement: [keyId],
    capabilityInvocation: [keyId],
    capabilityDelegation: [keyId]
  }
  
  // Add service endpoints if provided
  if (options.services && Array.isArray(options.services)) {
    document.service = options.services
  }
  
  // Add additional verification methods
  if (options.verificationMethods) {
    document.verificationMethod = document.verificationMethod.concat(options.verificationMethods)
  }
  
  // Add metadata
  if (options.created) {
    document.created = options.created
  }
  
  if (options.updated) {
    document.updated = options.updated
  }
  
  return document
}

/**
 * Resolve DID to DID Document
 * @param {String} did - DID string
 * @param {Object} options - Resolution options
 * @returns {Promise<Object>} DID Resolution Result
 */
DIDResolver.resolve = async function(did, options) {
  options = options || {}
  
  try {
    $.checkArgument(DIDResolver.isValidDID(did), 'Invalid DID')
    
    // For now, create a standard document
    // In production, this would query a registry or distributed storage
    var document = DIDResolver.createDocument(did, options)
    
    return {
      '@context': 'https://w3id.org/did-resolution/v1',
      didDocument: document,
      didResolutionMetadata: {
        contentType: 'application/did+ld+json',
        retrieved: new Date().toISOString()
      },
      didDocumentMetadata: {
        method: {
          published: true,
          recoveryCommitment: null,
          updateCommitment: null
        }
      }
    }
  } catch (error) {
    return {
      '@context': 'https://w3id.org/did-resolution/v1',
      didDocument: null,
      didResolutionMetadata: {
        error: 'notFound',
        errorMessage: error.message
      },
      didDocumentMetadata: {}
    }
  }
}

/**
 * Verify DID ownership
 * @param {String} did - DID string
 * @param {String} signature - Signature to verify
 * @param {String|Buffer} message - Original message
 * @returns {Boolean} True if signature is valid
 */
DIDResolver.verifyOwnership = function(did, signature, message) {
  try {
    var publicKey = DIDResolver.getPublicKey(did)
    var messageHash = Hash.sha256(Buffer.isBuffer(message) ? message : Buffer.from(message, 'utf8'))
    
    var sig = bsv.crypto.Signature.fromString(signature)
    var ecdsa = new bsv.crypto.ECDSA()
    ecdsa.hashbuf = messageHash
    ecdsa.pubkey = publicKey
    ecdsa.sig = sig
    
    return ecdsa.verify()
  } catch (e) {
    return false
  }
}

/**
 * Sign message with DID
 * @param {String} message - Message to sign
 * @param {PrivateKey} privateKey - Private key for signing
 * @returns {String} Signature
 */
DIDResolver.signMessage = function(message, privateKey) {
  $.checkArgument(privateKey instanceof PrivateKey, 'Invalid private key')
  
  var messageHash = Hash.sha256(Buffer.isBuffer(message) ? message : Buffer.from(message, 'utf8'))
  
  var ecdsa = new bsv.crypto.ECDSA()
  ecdsa.hashbuf = messageHash
  ecdsa.privkey = privateKey
  ecdsa.pubkey = privateKey.toPublicKey()
  
  return ecdsa.sign().toString()
}

/**
 * Create DID proof of ownership
 * @param {PrivateKey} privateKey - Private key
 * @param {String} challenge - Challenge string
 * @returns {Object} Proof object
 */
DIDResolver.createProofOfOwnership = function(privateKey, challenge) {
  $.checkArgument(privateKey instanceof PrivateKey, 'Invalid private key')
  $.checkArgument(typeof challenge === 'string', 'Challenge must be a string')
  
  var did = DIDResolver.fromPrivateKey(privateKey)
  var timestamp = new Date().toISOString()
  var message = challenge + ':' + timestamp + ':' + did
  var signature = DIDResolver.signMessage(message, privateKey)
  
  return {
    type: 'EcdsaSecp256k1Signature2019',
    created: timestamp,
    verificationMethod: did + '#keys-1',
    proofPurpose: 'authentication',
    challenge: challenge,
    jws: signature
  }
}

/**
 * Verify proof of ownership
 * @param {Object} proof - Proof object
 * @param {String} did - DID string
 * @returns {Boolean} True if proof is valid
 */
DIDResolver.verifyProofOfOwnership = function(proof, did) {
  try {
    $.checkArgument(proof && typeof proof === 'object', 'Invalid proof object')
    $.checkArgument(typeof did === 'string', 'DID must be a string')
    
    var message = proof.challenge + ':' + proof.created + ':' + did
    return DIDResolver.verifyOwnership(did, proof.jws, message)
  } catch (e) {
    return false
  }
}

/**
 * Generate DID URL for specific purposes
 * @param {String} did - Base DID
 * @param {String} fragment - Fragment identifier
 * @returns {String} DID URL
 */
DIDResolver.createDIDURL = function(did, fragment) {
  $.checkArgument(typeof did === 'string', 'DID must be a string')
  $.checkArgument(typeof fragment === 'string', 'Fragment must be a string')
  
  return did + '#' + fragment
}

/**
 * Generate test DID for development
 * @param {Object} options - Generation options
 * @returns {Object} Test DID data
 */
DIDResolver.generateTestDID = function(options) {
  options = options || {}
  
  var privateKey = new PrivateKey()
  var did = DIDResolver.fromPrivateKey(privateKey, options)
  var document = DIDResolver.createDocument(did, options)
  
  return {
    did: did,
    privateKey: privateKey.toWIF(),
    publicKey: privateKey.toPublicKey().toString('hex'),
    document: document
  }
}

module.exports = DIDResolver