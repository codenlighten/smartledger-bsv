'use strict'

/**
 * GDAF (Global Digital Attestation Framework) Standalone Bundle
 * 
 * Entry point for creating standalone distribution of the Global Digital
 * Attestation Framework. This module can be built with webpack to create
 * a standalone bundle for browser use.
 */

// Core BSV dependencies for GDAF
var PublicKey = require('./lib/publickey')
var PrivateKey = require('./lib/privatekey')
var Address = require('./lib/address')
var Transaction = require('./lib/transaction')
var Script = require('./lib/script')
var Hash = require('./lib/crypto/hash')
var ECDSA = require('./lib/crypto/ecdsa')
var Signature = require('./lib/crypto/signature')

// GDAF modules
var GDAF = require('./lib/gdaf')

// Create minimal BSV context for GDAF
var bsvContext = {
  PublicKey: PublicKey,
  PrivateKey: PrivateKey,
  Address: Address,
  Transaction: Transaction,
  Script: Script,
  crypto: {
    Hash: Hash,
    ECDSA: ECDSA,
    Signature: Signature
  }
}

// Export GDAF with BSV context
module.exports = {
  GDAF: GDAF,
  bsv: bsvContext,
  
  // Direct access to GDAF classes for convenience
  DIDResolver: require('./lib/gdaf/did-resolver'),
  AttestationSigner: require('./lib/gdaf/attestation-signer'),
  AttestationVerifier: require('./lib/gdaf/attestation-verifier'),
  ZKProver: require('./lib/gdaf/zk-prover'),
  SmartLedgerAnchor: require('./lib/gdaf/smartledger-anchor'),
  SchemaValidator: require('./lib/gdaf/schema-validator'),
  
  // Utility functions
  version: '1.0.0',
  description: 'SmartLedger BSV Global Digital Attestation Framework'
}