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

// The five verification relationships DID Core defines. They exist to be DISTINCT:
// `authentication` proves who you are right now, `assertionMethod` makes a claim that
// outlives the session. Keeping them apart is what stops a low-friction login signature
// from being redeemed as a signed statement.
//
// This module used to cross-list every key into both, which erased the distinction and
// left a caller unable to express "this key may log in but may not make assertions".
var VERIFICATION_RELATIONSHIPS = [
  'authentication',
  'assertionMethod',
  'keyAgreement',
  'capabilityInvocation',
  'capabilityDelegation'
]

// Preserves the historical output when a key does not say otherwise.
var DEFAULT_RELATIONSHIPS = ['authentication', 'assertionMethod']

/**
 * Resolve the verification relationships for a key descriptor.
 *
 * @param {object} key - `{ kid, jwk, relationships? }`
 * @returns {Array<string>}
 */
function relationshipsFor (key) {
  var rels = key.relationships || DEFAULT_RELATIONSHIPS
  if (!Array.isArray(rels) || rels.length === 0) {
    throw new Error('relationships must be a non-empty array of DID Core verification relationships')
  }
  rels.forEach(function (rel) {
    if (VERIFICATION_RELATIONSHIPS.indexOf(rel) === -1) {
      throw new Error('unknown verification relationship: ' + rel +
        ' (expected one of ' + VERIFICATION_RELATIONSHIPS.join(', ') + ')')
    }
  })
  return rels
}

// Build did:web documents (did.json and jwks.json)
function buildDidWebDocuments(params) {
  if (!params.domain) {
    throw new Error('domain is required')
  }

  var domain = params.domain
  var did = 'did:web:' + domain.replace(/:/g, '%3A')
  
  var verificationMethods = []
  var methodRelationships = []
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
    methodRelationships.push(relationshipsFor(params.p256))
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
    methodRelationships.push(relationshipsFor(params.k1))
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
    verificationMethod: verificationMethods
  }

  // Scope each key to the relationships it was given. Omitting `relationships`
  // reproduces the previous output exactly (every key in both authentication and
  // assertionMethod), so existing callers are unaffected.
  VERIFICATION_RELATIONSHIPS.forEach(function (rel) {
    var ids = verificationMethods
      .filter(function (vm, i) { return methodRelationships[i].indexOf(rel) !== -1 })
      .map(function (vm) { return vm.id })
    if (ids.length) didDocument[rel] = ids
  })

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

  // Which relationships this rotation actually replaces. Defaults to both, which is
  // the historical behaviour.
  var rotating = relationshipsFor(params.newKey)
  var current = params.currentDocument || null

  // Build updated DID Document with new key as primary
  var didDocument = {
    '@context': [
      'https://www.w3.org/ns/did/v1',
      'https://w3id.org/security/suites/jws-2020/v1'
    ],
    id: did,
    verificationMethod: [newMethod]
  }

  // A rotation must not silently reach beyond the relationship being rotated.
  // Replacing a compromised `authentication` key used to rewrite `assertionMethod`
  // too, which invalidates every statement the issuer has ever signed. Relationships
  // outside `rotating` are carried across from `currentDocument` untouched; without a
  // `currentDocument` there is nothing to carry, and the result matches the old output.
  VERIFICATION_RELATIONSHIPS.forEach(function (rel) {
    if (rotating.indexOf(rel) !== -1) {
      didDocument[rel] = [newMethod.id]
    } else if (current && Array.isArray(current[rel]) && current[rel].length) {
      didDocument[rel] = current[rel].slice()
    }
  })

  // Keep the verification methods those carried-over relationships still point at,
  // otherwise the document references key ids it does not define. The rotated-out key
  // drops out here automatically: nothing references it any more.
  if (current && Array.isArray(current.verificationMethod)) {
    var referenced = {}
    VERIFICATION_RELATIONSHIPS.forEach(function (rel) {
      (didDocument[rel] || []).forEach(function (id) { referenced[id] = true })
    })
    current.verificationMethod.forEach(function (vm) {
      if (referenced[vm.id] && vm.id !== newMethod.id) didDocument.verificationMethod.push(vm)
    })
  }

  didDocument.rotationInfo = {
    rotatedAt: new Date().toISOString(),
    gracePeriodDays: keepOldForDays
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