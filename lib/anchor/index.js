'use strict'

/**
 * BSV Anchor Module
 * Hash anchoring helpers for on-chain evidence (no PII)
 */

var crypto = require('crypto')

// SHA-256 hex hash
function sha256Hex(data) {
  var buffer
  if (typeof data === 'string') {
    buffer = Buffer.from(data, 'utf8')
  } else if (Buffer.isBuffer(data)) {
    buffer = data
  } else if (data instanceof Uint8Array) {
    buffer = Buffer.from(data)
  } else {
    throw new Error('Data must be string, Buffer, or Uint8Array')
  }
  
  return crypto.createHash('sha256').update(buffer).digest('hex')
}

// Build anchor payload for OP_RETURN
function buildAnchorPayload(params) {
  if (!params.kind || !params.hash || !params.issuerDid) {
    throw new Error('kind, hash, and issuerDid are required')
  }

  var validKinds = ['VC_ANCHOR_SHA256', 'STATUSLIST_SHA256', 'PRESENTATION_SHA256']
  if (validKinds.indexOf(params.kind) === -1) {
    throw new Error('Invalid kind. Must be one of: ' + validKinds.join(', '))
  }

  // Validate hash format (64 hex characters)
  if (!/^[a-fA-F0-9]{64}$/.test(params.hash)) {
    throw new Error('Invalid hash format. Must be 64 hex characters')
  }

  var payload = {
    protocol: 'SmartLedger',
    version: '1.0',
    type: params.kind,
    hash: params.hash,
    issuer: params.issuerDid,
    timestamp: params.issuedAt || new Date().toISOString()
  }

  return {
    json: JSON.stringify(payload)
  }
}

// Verify anchor hash against original data
function verifyAnchorHash(originalData, anchorHash) {
  var computed = sha256Hex(originalData)
  return computed === anchorHash
}

// Extract anchor info from OP_RETURN data
function parseAnchorPayload(opReturnData) {
  try {
    var parsed = JSON.parse(opReturnData)
    
    if (parsed.protocol !== 'SmartLedger') {
      return { valid: false, error: 'Invalid protocol' }
    }

    var validTypes = ['VC_ANCHOR_SHA256', 'STATUSLIST_SHA256', 'PRESENTATION_SHA256']
    if (validTypes.indexOf(parsed.type) === -1) {
      return { valid: false, error: 'Invalid anchor type' }
    }

    if (!/^[a-fA-F0-9]{64}$/.test(parsed.hash)) {
      return { valid: false, error: 'Invalid hash format' }
    }

    return {
      valid: true,
      protocol: parsed.protocol,
      version: parsed.version,
      type: parsed.type,
      hash: parsed.hash,
      issuer: parsed.issuer,
      timestamp: parsed.timestamp
    }
  } catch (error) {
    return {
      valid: false,
      error: 'Failed to parse anchor payload: ' + error.message
    }
  }
}

module.exports = {
  sha256Hex: sha256Hex,
  buildAnchorPayload: buildAnchorPayload,
  verifyAnchorHash: verifyAnchorHash,
  parseAnchorPayload: parseAnchorPayload
}