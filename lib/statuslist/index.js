'use strict'

/**
 * StatusList2021 Module
 * W3C StatusList2021 for credential revocation and suspension
 */

var vcjwt = require('../vcjwt')
var crypto = require('crypto')
var zlib = require('zlib')

// Upper bound on the decompressed bitstring to defuse gzip-bomb DoS: a tiny
// crafted payload can otherwise inflate to gigabytes. A StatusList2021 bitstring
// is 1 bit per credential, so 8 MB covers ~64M credentials — far beyond any real
// list — while refusing a malicious blow-up. Override with maxDecompressedBytes.
var MAX_DECOMPRESSED_BYTES = 8 * 1024 * 1024

function _safeGunzip (encodedList, params) {
  var max = (params && params.maxDecompressedBytes) || MAX_DECOMPRESSED_BYTES
  return zlib.gunzipSync(Buffer.from(encodedList, 'base64'), { maxOutputLength: max })
}

/**
 * Verify the status-list JWT signature and issuer BEFORE trusting any bit it
 * carries, then return the verified payload. Without this, anyone who can
 * substitute the list JWT (MITM, stale cache, swapped URL, hand-crafted token)
 * can flip a revoked credential back to "valid", defeating StatusList2021.
 *
 * Fails closed: throws unless the signature verifies against the PINNED issuer's
 * key. Requires params.expectedIssuerDid plus a key source (params.didResolver,
 * params.issuerJwks, or params.issuerPublicJwk).
 */
async function _verifyAndDecode (listVcJwt, params) {
  if (!params.expectedIssuerDid) {
    throw new Error('expectedIssuerDid is required to verify a status list (issuer ' +
      'pinning); refusing to read revocation state from an unpinned/unverified JWT')
  }
  var resolver = params.didResolver
  if (!resolver) {
    var jwks = params.issuerJwks ||
      (params.issuerPublicJwk ? { keys: [params.issuerPublicJwk] } : null)
    if (!jwks) {
      throw new Error('Provide params.didResolver, params.issuerJwks, or ' +
        'params.issuerPublicJwk to verify the status list signature')
    }
    resolver = async function () { return { jwks: jwks } }
  }
  var result = await vcjwt.verifyVcJwt(listVcJwt, {
    didResolver: resolver,
    expectedIssuerDid: params.expectedIssuerDid,
    allowedAlgs: params.allowedAlgs,
    allowLegacyDER: params.allowLegacyDER,
    clockToleranceSec: params.clockToleranceSec
  })
  if (!result.valid) {
    throw new Error('Status list signature verification failed: ' +
      (result.error || 'invalid signature'))
  }
  return result.payload
}

// Create a new status list
async function createStatusList(params) {
  if (!params.issuerDid || !params.privateJwk) {
    throw new Error('issuerDid and privateJwk are required')
  }

  var listId = params.listId || params.issuerDid + '/status/' + Date.now()
  
  // Create a bitstring for 100,000 credentials (default size)
  var listSize = params.listSize || 100000
  var byteSize = Math.ceil(listSize / 8)
  var bitstringBuffer = Buffer.alloc(byteSize, 0)

  // Compress with gzip
  var zlib = require('zlib')
  var compressed = zlib.gzipSync(bitstringBuffer)
  var encodedCompressed = compressed.toString('base64')

  // Create StatusList2021 credential
  var statusListCredential = {
    '@context': [
      'https://www.w3.org/2018/credentials/v1',
      'https://w3id.org/vc/status-list/2021/v1'
    ],
    type: ['VerifiableCredential', 'StatusList2021Credential'],
    issuer: params.issuerDid,
    issuanceDate: new Date().toISOString(),
    credentialSubject: {
      id: listId,
      type: 'StatusList2021',
      statusPurpose: 'revocation',
      encodedList: encodedCompressed
    }
  }

  // Issue as JWT
  var result = await vcjwt.issueVcJwt({
    issuerDid: params.issuerDid,
    subjectId: listId,
    types: ['VerifiableCredential', 'StatusList2021Credential'],
    credentialSubject: statusListCredential.credentialSubject,
    privateJwk: params.privateJwk,
    alg: params.privateJwk.alg || 'ES256'
  })

  return {
    listVcJwt: result.jwt,
    listId: listId
  }
}

// Update status list (revoke/suspend/activate)
async function updateStatusList(params) {
  if (!params.listVcJwt || params.index === undefined || !params.status || !params.privateJwk) {
    throw new Error('listVcJwt, index, status, and privateJwk are required')
  }
  if (params.status === 'suspended') {
    throw new Error("status 'suspended' is not supported by this list: its statusPurpose " +
      "is 'revocation', and suspension would be written to the same bit and read back as " +
      "'revoked'. Maintain a separate list for suspension until statusPurpose is configurable.")
  }

  // Verify the existing list's signature+issuer before building on top of it —
  // an unverified base list lets an attacker seed forged revocation state.
  var payload = await _verifyAndDecode(params.listVcJwt, params)
  var encodedList = payload.vc.credentialSubject.encodedList

  // Decompress (bounded to defuse gzip bombs)
  var bitstring = _safeGunzip(encodedList, params)

  // Update the bit at the given index
  var byteIndex = Math.floor(params.index / 8)
  var bitIndex = params.index % 8
  
  if (byteIndex >= bitstring.length) {
    throw new Error('Index out of range')
  }

  // StatusList2021 uses 2 bits per credential for 4 states; this implementation uses a
  // single bit (0 = valid, 1 = revoked) and hardcodes statusPurpose: 'revocation'.
  // 'suspended' therefore has nowhere to go: it used to set the SAME bit as 'revoked' and
  // read back as 'revoked', so a suspension was silently recorded — and reported — as a
  // permanent revocation. Fail closed rather than lie about which state was written.
  var statusBit = params.status === 'revoked' ? 1 : 0
  
  if (statusBit === 1) {
    bitstring[byteIndex] |= (1 << bitIndex)
  } else {
    bitstring[byteIndex] &= ~(1 << bitIndex)
  }

  // Recompress
  var recompressed = zlib.gzipSync(bitstring)
  var newEncodedList = recompressed.toString('base64')

  // Create updated credential
  var updatedCredentialSubject = {
    id: payload.vc.credentialSubject.id,
    type: 'StatusList2021',
    statusPurpose: 'revocation',
    encodedList: newEncodedList
  }

  // Re-issue as JWT
  var result = await vcjwt.issueVcJwt({
    issuerDid: payload.iss,
    subjectId: payload.vc.credentialSubject.id,
    types: ['VerifiableCredential', 'StatusList2021Credential'],
    credentialSubject: updatedCredentialSubject,
    privateJwk: params.privateJwk,
    alg: params.privateJwk.alg || 'ES256'
  })

  return {
    listVcJwt: result.jwt
  }
}

// Get credential status entry.
// ASYNC + fail-closed: the status list JWT signature and issuer are verified
// before any bit is read. Reading revocation state from an unverified JWT is a
// revocation bypass (a forged/substituted list can un-revoke a credential).
async function getCredentialStatusEntry(params) {
  if (!params.listVcJwt || params.index === undefined) {
    throw new Error('listVcJwt and index are required')
  }

  // Verify signature + pinned issuer, then read from the VERIFIED payload.
  var payload = await _verifyAndDecode(params.listVcJwt, params)
  var encodedList = payload.vc.credentialSubject.encodedList

  // Decompress (bounded to defuse gzip bombs)
  var bitstring = _safeGunzip(encodedList, params)

  // Check the bit at the given index
  var byteIndex = Math.floor(params.index / 8)
  var bitIndex = params.index % 8
  
  if (byteIndex >= bitstring.length) {
    throw new Error('Index out of range')
  }

  var bit = (bitstring[byteIndex] >> bitIndex) & 1
  
  return bit === 1 ? 'revoked' : 'valid'
}

module.exports = {
  createStatusList: createStatusList,
  updateStatusList: updateStatusList,
  getCredentialStatusEntry: getCredentialStatusEntry
}