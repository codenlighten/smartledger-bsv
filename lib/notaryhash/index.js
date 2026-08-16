'use strict'

var Transaction = require('../transaction')
var Hash = require('../crypto/hash')
var SPV = require('../spv')
var Encoding = require('./encoding')
var NotaryScript = require('./script')
var Certificate = require('./certificate')
var Suites = require('./suites')

/**
 * BRC-220 NotaryHash.
 *
 * A certificate is valid if and only if ALL THREE of the spec's checks hold:
 *
 *   1. Signature      — verify(algorithm, payloadHash, signature, publicKey)   (offline)
 *   2. Proof integrity — recomputed proofHash equals certificate.proofHash      (offline)
 *   3. Anchor          — SPV against a block header, or a direct chain lookup
 *
 * `verify()` runs all three and reports each separately, because "invalid" without
 * saying which check failed is unactionable — a bad signature and an unmined transaction
 * are different problems with different fixes.
 *
 * NOTE this library never fetches a block header. The spec is explicit that the verifier
 * "trusts only a block header, obtained from any source it chooses", and choosing that
 * source is the caller's decision, not ours: a single provider is a single point of
 * trust, and quietly picking one on the caller's behalf would hide exactly the trust
 * assumption the protocol exists to remove. The caller supplies the header.
 */

var NotaryHash = {}

NotaryHash.Encoding = Encoding
NotaryHash.Script = NotaryScript
NotaryHash.Certificate = Certificate
NotaryHash.Suites = Suites
NotaryHash.MODE = NotaryScript.MODE

/** Register a signature suite. See lib/notaryhash/suites.js for why PQ is not built in. */
NotaryHash.registerSuite = function (algorithm, suite) {
  return Suites.register(algorithm, suite)
}

/**
 * Check 1 — the signature, offline.
 *
 * @param {Object} certificate
 * @returns {Boolean}
 */
NotaryHash.verifySignature = function (certificate) {
  try {
    if (!certificate || typeof certificate !== 'object') return false
    return Suites.verify(
      certificate.algorithm,
      Buffer.from(certificate.payloadHash, 'hex'),
      Buffer.from(certificate.signature, 'hex'),
      Buffer.from(certificate.publicKey, 'hex')
    )
  } catch (e) {
    return false
  }
}

/**
 * Compute a txid from a raw transaction, the way the spec states it:
 * `txid = reverse(SHA256(SHA256(rawTx)))`.
 *
 * This is what makes provider-supplied data self-checking — a raw transaction is only
 * accepted if it hashes to the txid already held, so a provider cannot substitute
 * different bytes.
 *
 * @param {Buffer|String} rawTx
 * @returns {String} txid, big-endian hex as displayed
 */
NotaryHash.txidFromRawTx = function (rawTx) {
  var buf = Buffer.isBuffer(rawTx) ? rawTx : Buffer.from(rawTx, 'hex')
  return Buffer.from(Hash.sha256sha256(buf)).reverse().toString('hex')
}

/**
 * Find and parse the NotaryHash record in a raw transaction.
 *
 * @param {Buffer|String} rawTx
 * @returns {Object|null} the parsed record, or null if there is none
 */
NotaryHash.recordFromRawTx = function (rawTx) {
  try {
    var tx = new Transaction(Buffer.isBuffer(rawTx) ? rawTx.toString('hex') : rawTx)
    for (var i = 0; i < tx.outputs.length; i++) {
      var script = tx.outputs[i].script
      if (NotaryScript.isNotaryHash(script)) {
        return NotaryScript.parse(script)
      }
    }
    return null
  } catch (e) {
    return null
  }
}

/**
 * Does an on-chain record agree with the certificate that claims it?
 *
 * Compares only the fields the record actually carries. In hybrid mode the chain holds
 * SHA-256 of the key and signature, so those are compared as digests of the
 * certificate's full blobs — which is the whole point of the mode, and the step that
 * would otherwise let a hybrid certificate reference a record for a different key.
 *
 * @param {Object} record - from NotaryScript.parse
 * @param {Object} certificate
 * @returns {Boolean}
 */
NotaryHash.recordMatchesCertificate = function (record, certificate) {
  try {
    if (!record || !certificate) return false
    if (record.mode !== certificate.mode) return false

    if (record.mode === NotaryScript.MODE.BATCH) {
      return !!certificate.merkle &&
        record.merkleRoot.toString('hex') === String(certificate.merkle.root).toLowerCase()
    }

    if (record.algorithm !== certificate.algorithm) return false
    if (record.hashAlgorithm !== certificate.hashAlgorithm) return false
    if (record.payloadHash.toString('hex') !== String(certificate.payloadHash).toLowerCase()) return false
    if (record.proofHash.toString('hex') !== String(certificate.proofHash).toLowerCase()) return false

    var certPub = Buffer.from(certificate.publicKey, 'hex')
    var certSig = Buffer.from(certificate.signature, 'hex')

    if (record.mode === NotaryScript.MODE.HYBRID) {
      return record.publicKeyHash.equals(Hash.sha256(certPub)) &&
        record.signatureHash.equals(Hash.sha256(certSig))
    }

    return record.publicKey.equals(certPub) && record.signature.equals(certSig)
  } catch (e) {
    return false
  }
}

/**
 * Check 3 — the anchor, via SPV.
 *
 * The caller supplies the block HEADER, obtained however it chose. Not a bare Merkle
 * root: a header carries the proof of work, so `lib/spv` can confirm the root belongs to
 * a block that cost something to produce rather than to a root someone asserted. Without
 * a header this returns false — a certificate whose anchor has not been checked against
 * one has not satisfied check 3, and reporting otherwise would restore the exact trust
 * the spec removes.
 *
 * @param {Object} certificate - must carry an `spv` envelope
 * @param {Object} opts
 * @param {String|Buffer|BlockHeader} opts.header - independently obtained
 * @param {Boolean} [opts.requirePow=true] - pass false only for test fixtures
 * @returns {Object} { valid, errors }
 */
NotaryHash.verifyAnchorSPV = function (certificate, opts) {
  var errors = []
  opts = opts || {}

  try {
    var spv = certificate && certificate.spv
    if (!spv) {
      return { valid: false, errors: ['certificate has no SPV envelope'] }
    }
    if (!opts.header) {
      return {
        valid: false,
        errors: ['a block header is required: the verifier must obtain one itself ' +
          'rather than trust the certificate or its issuer for the anchor']
      }
    }

    var txid = NotaryHash.txidFromRawTx(spv.rawTx)
    if (txid !== String(certificate.anchor.txid).toLowerCase()) {
      errors.push('rawTx does not hash to anchor.txid')
    }

    var record = NotaryHash.recordFromRawTx(spv.rawTx)
    if (!record) {
      errors.push('no NotaryHash record found in rawTx')
    } else if (!NotaryHash.recordMatchesCertificate(record, certificate)) {
      errors.push('on-chain record does not match the certificate')
    }

    var proof = spv.merkleProof || {}
    var inclusion = SPV.verifyTxInclusion({
      header: opts.header,
      txid: txid,
      index: proof.index,
      nodes: proof.nodes,
      requirePow: opts.requirePow !== false
    })
    if (inclusion.valid !== true) {
      errors.push(inclusion.rootMatches === false
        ? 'merkle proof does not fold to the header\'s root'
        : 'block header failed proof-of-work validation')
    }

    return { valid: errors.length === 0, errors: errors }
  } catch (e) {
    return { valid: false, errors: ['anchor verification error: ' + e.message] }
  }
}

/**
 * Verify a certificate: all three checks.
 *
 * Returns a REPORT, not a boolean — `valid` is the verdict and the per-check fields say
 * why. Callers must read `.valid`; the object itself is always truthy, and this module
 * deliberately does not hand back something that could be mistaken for a pass. That
 * distinction has bitten this codebase repeatedly, so `isValid()` below exists for the
 * `if (...)` case.
 *
 * @param {Object} certificate
 * @param {Object} [opts]
 * @param {String|Buffer} [opts.header] - an independently obtained block header
 * @param {Boolean} [opts.skipAnchor] - check 1 and 2 only; the result is NOT a valid
 *   certificate, and `valid` will be false. For offline triage.
 * @returns {Object} { valid, signature, proofIntegrity, anchor, shape, errors }
 */
NotaryHash.verify = function (certificate, opts) {
  opts = opts || {}

  var report = {
    valid: false,
    shape: [],
    signature: false,
    proofIntegrity: false,
    anchor: false,
    errors: []
  }

  report.shape = Certificate.validateShape(certificate)
  if (report.shape.length) {
    report.errors = report.shape.slice()
    return report
  }

  report.signature = NotaryHash.verifySignature(certificate)
  if (!report.signature) report.errors.push('signature does not verify')

  report.proofIntegrity = Certificate.proofHashMatches(certificate)
  if (!report.proofIntegrity) report.errors.push('proofHash does not match the certificate fields')

  if (opts.skipAnchor) {
    report.errors.push('anchor not checked (skipAnchor): this certificate is NOT verified')
    return report
  }

  var anchor = NotaryHash.verifyAnchorSPV(certificate, opts)
  report.anchor = anchor.valid
  anchor.errors.forEach(function (e) { report.errors.push(e) })

  report.valid = report.signature && report.proofIntegrity && report.anchor
  return report
}

/**
 * Strict boolean verdict, for `if (...)`.
 *
 * @param {Object} certificate
 * @param {Object} [opts]
 * @returns {Boolean}
 */
NotaryHash.isValid = function (certificate, opts) {
  return NotaryHash.verify(certificate, opts).valid === true
}

module.exports = NotaryHash
