'use strict'

/**
 * StatusList2021 Module
 * W3C StatusList2021 for credential revocation and suspension
 */

var vcjwt = require('../vcjwt')
var crypto = require('crypto')

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

  // Decode the existing status list JWT
  var parts = params.listVcJwt.split('.')
  if (parts.length !== 3) {
    throw new Error('Invalid JWT format')
  }

  var payload = JSON.parse(vcjwt.base64UrlDecode(parts[1]).toString())
  var encodedList = payload.vc.credentialSubject.encodedList

  // Decompress
  var zlib = require('zlib')
  var compressed = Buffer.from(encodedList, 'base64')
  var bitstring = zlib.gunzipSync(compressed)

  // Update the bit at the given index
  var byteIndex = Math.floor(params.index / 8)
  var bitIndex = params.index % 8
  
  if (byteIndex >= bitstring.length) {
    throw new Error('Index out of range')
  }

  // StatusList2021 uses 2 bits per credential for 4 states
  // For simplicity, we'll use single bit: 0=valid, 1=revoked/suspended
  var statusBit = (params.status === 'revoked' || params.status === 'suspended') ? 1 : 0
  
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

// Get credential status entry
function getCredentialStatusEntry(params) {
  if (!params.listVcJwt || params.index === undefined) {
    throw new Error('listVcJwt and index are required')
  }

  // Decode the status list JWT
  var parts = params.listVcJwt.split('.')
  if (parts.length !== 3) {
    throw new Error('Invalid JWT format')
  }

  var payload = JSON.parse(vcjwt.base64UrlDecode(parts[1]).toString())
  var encodedList = payload.vc.credentialSubject.encodedList

  // Decompress
  var zlib = require('zlib')
  var compressed = Buffer.from(encodedList, 'base64')
  var bitstring = zlib.gunzipSync(compressed)

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