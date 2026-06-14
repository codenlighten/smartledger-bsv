'use strict'

/**
 * VC-JWT Module
 * W3C Verifiable Credentials using JWT/JWS
 * Supports ES256 (P-256) and ES256K (secp256k1)
 *
 * Signatures are emitted and verified as raw r||s (IEEE P1363) per the JOSE
 * specs (RFC 7515/7518; RFC 8812 for ES256K). This is what every standards
 * compliant JWT/JWS library (jose, jsonwebtoken, ...) expects. Tokens issued
 * by versions <= 4.6.0 used Node's default DER encoding and are NOT JOSE
 * compatible; pass `{ allowLegacyDER: true }` to verifyVcJwt to accept them
 * during migration.
 */

var crypto = require('crypto')

// Supported JWS algorithms mapped to their expected JWK curve.
// (RFC 7518 §3.1 for ES256/P-256; RFC 8812 for ES256K/secp256k1.)
var ALG_TO_CRV = {
  ES256: 'P-256',
  ES256K: 'secp256k1'
}

var DEFAULT_ALLOWED_ALGS = ['ES256', 'ES256K']

// Base64URL encoding
function base64UrlEncode (buffer) {
  return buffer.toString('base64')
    .replace(/\+/g, '-')
    .replace(/\//g, '_')
    .replace(/=/g, '')
}

// Base64URL decoding
function base64UrlDecode (str) {
  str = str.replace(/-/g, '+').replace(/_/g, '/')
  while (str.length % 4) {
    str += '='
  }
  return Buffer.from(str, 'base64')
}

// Issue a Verifiable Credential as JWT
async function issueVcJwt (params) {
  if (!params.issuerDid || !params.subjectId || !params.credentialSubject || !params.privateJwk) {
    throw new Error('issuerDid, subjectId, credentialSubject, and privateJwk are required')
  }

  var alg = params.alg || 'ES256'
  if (!ALG_TO_CRV[alg]) {
    throw new Error('Unsupported algorithm: ' + alg)
  }
  if (params.privateJwk.crv && params.privateJwk.crv !== ALG_TO_CRV[alg]) {
    throw new Error('Key curve ' + params.privateJwk.crv + ' does not match alg ' + alg)
  }

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

  // Sign with private key.
  var privateKey = crypto.createPrivateKey({
    key: params.privateJwk,
    format: 'jwk'
  })

  // JWS (RFC 7515/7518) requires ECDSA signatures as the raw r||s concatenation
  // (IEEE P1363), NOT the DER encoding Node emits by default. Without
  // dsaEncoding:'ieee-p1363' the token fails verification in every standards
  // compliant JOSE library.
  var signature = crypto.sign('sha256', Buffer.from(signingInput), {
    key: privateKey,
    dsaEncoding: 'ieee-p1363'
  })

  var signatureB64 = base64UrlEncode(signature)
  var jwt = signingInput + '.' + signatureB64

  return { jwt: jwt }
}

// Verify a VC-JWT
async function verifyVcJwt (jwt, opts) {
  opts = opts || {}

  try {
    // Parse JWT
    if (typeof jwt !== 'string') {
      return { valid: false, error: 'Invalid JWT format' }
    }
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

    // Pin the algorithm: never trust header.alg blindly. Reject anything
    // outside the supported set (or outside opts.allowedAlgs when provided).
    // This is the primary defense against JWT algorithm-substitution attacks.
    var allowedAlgs = opts.allowedAlgs || DEFAULT_ALLOWED_ALGS
    if (!header.alg || allowedAlgs.indexOf(header.alg) === -1 || !ALG_TO_CRV[header.alg]) {
      return { valid: false, error: 'Algorithm not allowed: ' + header.alg, header: header, payload: payload }
    }

    // Check expiration
    var now = Math.floor(Date.now() / 1000)
    var clockTolerance = opts.clockToleranceSec || 60

    if (payload.exp && payload.exp < (now - clockTolerance)) {
      return { valid: false, error: 'JWT expired', header: header, payload: payload }
    }

    // Reject not-yet-valid tokens (nbf), if present.
    if (payload.nbf && payload.nbf > (now + clockTolerance)) {
      return { valid: false, error: 'JWT not yet valid', header: header, payload: payload }
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
      var matchingKey = resolved.jwks.keys.find(function (k) {
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

    // Ensure the resolving key's curve matches the pinned algorithm, so an
    // ES256K signature can't be checked against a P-256 key or vice versa.
    if (publicKey.crv && publicKey.crv !== ALG_TO_CRV[header.alg]) {
      return { valid: false, error: 'Key curve does not match algorithm', header: header, payload: payload }
    }

    // Verify signature
    var signingInput = headerB64 + '.' + payloadB64
    var pubKey = crypto.createPublicKey({
      key: publicKey,
      format: 'jwk'
    })

    // Signature is raw r||s (IEEE P1363) per JWS — decode it as such.
    var isValid = crypto.verify(
      'sha256',
      Buffer.from(signingInput),
      { key: pubKey, dsaEncoding: 'ieee-p1363' },
      signature
    )

    // Migration path: tokens issued by <= 4.6.0 carry a DER-encoded signature.
    // Only accepted when the caller explicitly opts in.
    if (!isValid && opts.allowLegacyDER) {
      try {
        isValid = crypto.verify(
          'sha256',
          Buffer.from(signingInput),
          { key: pubKey, dsaEncoding: 'der' },
          signature
        )
      } catch (e) {
        isValid = false
      }
    }

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
  base64UrlDecode: base64UrlDecode,
  ALG_TO_CRV: ALG_TO_CRV
}
