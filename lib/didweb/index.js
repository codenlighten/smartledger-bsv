'use strict'

/**
 * DID:web Module
 * Legally-recognizable DID (did:web) generation and management
 * Supports ES256 (P-256) and ES256K (secp256k1) keys
 */

var crypto = require('crypto')

// Generate issuer keys (ES256 or ES256K)
async function generateIssuerKeys(opts) {
  opts = opts || {}
  var alg = opts.alg || 'ES256'
  var kid = opts.kid || 'key-' + Date.now()

  if (alg !== 'ES256' && alg !== 'ES256K') {
    throw new Error('Invalid algorithm. Must be ES256 or ES256K')
  }

  var keyPair
  if (alg === 'ES256') {
    // P-256 (NIST curve)
    keyPair = crypto.generateKeyPairSync('ec', {
      namedCurve: 'P-256',
      publicKeyEncoding: { type: 'spki', format: 'pem' },
      privateKeyEncoding: { type: 'pkcs8', format: 'pem' }
    })
  } else {
    // secp256k1
    keyPair = crypto.generateKeyPairSync('ec', {
      namedCurve: 'secp256k1',
      publicKeyEncoding: { type: 'spki', format: 'pem' },
      privateKeyEncoding: { type: 'pkcs8', format: 'pem' }
    })
  }

  // Convert to JWK format
  var publicJwk = crypto.createPublicKey(keyPair.publicKey).export({ format: 'jwk' })
  var privateJwk = crypto.createPrivateKey(keyPair.privateKey).export({ format: 'jwk' })

  // Add required JWK fields
  publicJwk.kid = kid
  publicJwk.alg = alg
  publicJwk.use = 'sig'
  publicJwk.kty = 'EC'
  
  privateJwk.kid = kid
  privateJwk.alg = alg
  privateJwk.use = 'sig'
  privateJwk.kty = 'EC'

  return {
    privateJwk: privateJwk,
    publicJwk: publicJwk,
    kid: kid,
    alg: alg
  }
}

// Build did:web documents (did.json and jwks.json)
function buildDidWebDocuments(params) {
  if (!params.domain) {
    throw new Error('domain is required')
  }

  var domain = params.domain
  var did = 'did:web:' + domain.replace(/:/g, '%3A')
  
  var verificationMethods = []
  var publicKeys = []

  // Add P-256 key if provided
  if (params.p256) {
    var p256Method = {
      id: did + '#' + params.p256.kid,
      type: 'JsonWebKey2020',
      controller: did,
      publicKeyJwk: params.p256.jwk
    }
    verificationMethods.push(p256Method)
    publicKeys.push(params.p256.jwk)
  }

  // Add secp256k1 key if provided
  if (params.k1) {
    var k1Method = {
      id: did + '#' + params.k1.kid,
      type: 'JsonWebKey2020',
      controller: did,
      publicKeyJwk: params.k1.jwk
    }
    verificationMethods.push(k1Method)
    publicKeys.push(params.k1.jwk)
  }

  if (verificationMethods.length === 0) {
    throw new Error('At least one key (p256 or k1) must be provided')
  }

  // Build DID Document
  var didDocument = {
    '@context': [
      'https://www.w3.org/ns/did/v1',
      'https://w3id.org/security/suites/jws-2020/v1'
    ],
    id: did,
    verificationMethod: verificationMethods,
    authentication: verificationMethods.map(function(vm) { return vm.id }),
    assertionMethod: verificationMethods.map(function(vm) { return vm.id })
  }

  if (params.controllerName) {
    didDocument.controller = params.controllerName
  }

  // Build JWKS
  var jwks = {
    keys: publicKeys
  }

  return {
    did: did,
    didDocument: didDocument,
    jwks: jwks
  }
}

// Rotate issuer key
function rotateIssuerKey(params) {
  if (!params.domain || !params.newKey) {
    throw new Error('domain and newKey are required')
  }

  var domain = params.domain
  var did = 'did:web:' + domain.replace(/:/g, '%3A')
  var keepOldForDays = params.keepOldForDays || 30

  // Create verification method for new key
  var newMethod = {
    id: did + '#' + params.newKey.kid,
    type: 'JsonWebKey2020',
    controller: did,
    publicKeyJwk: params.newKey.jwk
  }

  // Build updated DID Document with new key as primary
  var didDocument = {
    '@context': [
      'https://www.w3.org/ns/did/v1',
      'https://w3id.org/security/suites/jws-2020/v1'
    ],
    id: did,
    verificationMethod: [newMethod],
    authentication: [newMethod.id],
    assertionMethod: [newMethod.id],
    rotationInfo: {
      rotatedAt: new Date().toISOString(),
      gracePeriodDays: keepOldForDays
    }
  }

  var jwks = {
    keys: [params.newKey.jwk]
  }

  return {
    didDocument: didDocument,
    jwks: jwks
  }
}

module.exports = {
  generateIssuerKeys: generateIssuerKeys,
  buildDidWebDocuments: buildDidWebDocuments,
  rotateIssuerKey: rotateIssuerKey
}