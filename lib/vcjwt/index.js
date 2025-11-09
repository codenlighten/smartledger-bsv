'use strict'

/**
 * VC-JWT Module
 * W3C Verifiable Credentials using JWT/JWS
 * Supports ES256 (P-256) and ES256K (secp256k1)
 */

var crypto = require('crypto')

// Base64URL encoding
function base64UrlEncode(buffer) {
  return buffer.toString('base64')
    .replace(/\+/g, '-')
    .replace(/\//g, '_')
    .replace(/=/g, '')
}

// Base64URL decoding
function base64UrlDecode(str) {
  str = str.replace(/-/g, '+').replace(/_/g, '/')
  while (str.length % 4) {
    str += '='
  }
  return Buffer.from(str, 'base64')
}

// Issue a Verifiable Credential as JWT
async function issueVcJwt(params) {
  if (!params.issuerDid || !params.subjectId || !params.credentialSubject || !params.privateJwk) {
    throw new Error('issuerDid, subjectId, credentialSubject, and privateJwk are required')
  }

  var alg = params.alg || 'ES256'
  var kid = params.kid || params.privateJwk.kid
  var types = params.types || ['VerifiableCredential']
  var expSeconds = params.expSeconds || (365 * 24 * 60 * 60) // 1 year default

  var now = Math.floor(Date.now() / 1000)
  var issuedAt = new Date().toISOString()

  // Build VC payload
  var vcPayload = {
    '@context': [
      'https://www.w3.org/2018/credentials/v1'
    ],
    type: types,
    issuer: params.issuerDid,
    issuanceDate: issuedAt,
    credentialSubject: Object.assign({
      id: params.subjectId
    }, params.credentialSubject)
  }

  // Build JWT claims
  var jwtPayload = {
    iss: params.issuerDid,
    sub: params.subjectId,
    iat: now,
    exp: now + expSeconds,
    vc: vcPayload
  }

  // Build JWT header
  var header = {
    alg: alg,
    typ: 'JWT',
    kid: kid
  }

  // Encode header and payload
  var headerB64 = base64UrlEncode(Buffer.from(JSON.stringify(header)))
  var payloadB64 = base64UrlEncode(Buffer.from(JSON.stringify(jwtPayload)))
  var signingInput = headerB64 + '.' + payloadB64

  // Sign with private key
  var privateKey = crypto.createPrivateKey({
    key: params.privateJwk,
    format: 'jwk'
  })

  var signature
  if (alg === 'ES256') {
    signature = crypto.sign('sha256', Buffer.from(signingInput), privateKey)
  } else if (alg === 'ES256K') {
    signature = crypto.sign('sha256', Buffer.from(signingInput), privateKey)
  } else {
    throw new Error('Unsupported algorithm: ' + alg)
  }

  var signatureB64 = base64UrlEncode(signature)
  var jwt = signingInput + '.' + signatureB64

  return { jwt: jwt }
}

// Verify a VC-JWT
async function verifyVcJwt(jwt, opts) {
  opts = opts || {}

  try {
    // Parse JWT
    var parts = jwt.split('.')
    if (parts.length !== 3) {
      return { valid: false, error: 'Invalid JWT format' }
    }

    var headerB64 = parts[0]
    var payloadB64 = parts[1]
    var signatureB64 = parts[2]

    var header = JSON.parse(base64UrlDecode(headerB64).toString())
    var payload = JSON.parse(base64UrlDecode(payloadB64).toString())
    var signature = base64UrlDecode(signatureB64)

    // Check expiration
    var now = Math.floor(Date.now() / 1000)
    var clockTolerance = opts.clockToleranceSec || 60
    
    if (payload.exp && payload.exp < (now - clockTolerance)) {
      return { valid: false, error: 'JWT expired', header: header, payload: payload }
    }

    // Check issuer if expected
    if (opts.expectedIssuerDid && payload.iss !== opts.expectedIssuerDid) {
      return { valid: false, error: 'Unexpected issuer', header: header, payload: payload }
    }

    // Get public key from DID resolver or use default resolver
    var publicKey
    if (opts.didResolver) {
      var resolved = await opts.didResolver(payload.iss)
      if (!resolved || !resolved.jwks || !resolved.jwks.keys) {
        return { valid: false, error: 'Failed to resolve issuer DID', header: header, payload: payload }
      }
      
      // Find matching key by kid
      var matchingKey = resolved.jwks.keys.find(function(k) {
        return k.kid === header.kid
      })
      
      if (!matchingKey) {
        return { valid: false, error: 'Key not found in JWKS', header: header, payload: payload }
      }
      
      publicKey = matchingKey
    } else {
      // Without resolver, verification cannot proceed
      return { valid: false, error: 'DID resolver required for verification', header: header, payload: payload }
    }

    // Verify signature
    var signingInput = headerB64 + '.' + payloadB64
    var pubKey = crypto.createPublicKey({
      key: publicKey,
      format: 'jwk'
    })

    var isValid = crypto.verify(
      'sha256',
      Buffer.from(signingInput),
      pubKey,
      signature
    )

    if (!isValid) {
      return { valid: false, error: 'Invalid signature', header: header, payload: payload }
    }

    return {
      valid: true,
      header: header,
      payload: payload
    }

  } catch (error) {
    return {
      valid: false,
      error: error.message || 'Verification failed'
    }
  }
}

module.exports = {
  issueVcJwt: issueVcJwt,
  verifyVcJwt: verifyVcJwt,
  base64UrlEncode: base64UrlEncode,
  base64UrlDecode: base64UrlDecode
}