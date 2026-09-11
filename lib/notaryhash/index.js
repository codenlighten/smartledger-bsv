'use strict'

var Transaction = require('../transaction')
var Hash = require('../crypto/hash')
var SPV = require('../spv')
var Encoding = require('./encoding')
var NotaryScript = require('./script')
var Certificate = require('./certificate')
var Suites = require('./suites')
var Merkle = require('./merkle')

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
 * Certificates are in the reference implementation's format — see
 * lib/notaryhash/certificate.js. Every check below normalises first, so a certificate
 * written by 8.3.0–9.8.0 still verifies.
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
NotaryHash.Merkle = Merkle
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
    var f = Certificate.toProofInput(certificate)
    return Suites.verify(f.algorithm, f.payloadHash, f.signature, f.publicKey)
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
    var c = Certificate.normalize(certificate)
    var recordIsBatch = record.mode === NotaryScript.MODE.BATCH
    var certIsBatch = !!(c.anchor && c.anchor.type === Certificate.ANCHOR_TYPE.BATCH)

    if (recordIsBatch || certIsBatch) {
      // Both sides must agree it is a batch: a batch certificate pointed at a single
      // proof's record, or the reverse, is a mismatch however the fields line up.
      if (!recordIsBatch || !certIsBatch || !c.merkle) return false
      if (!record.merkleRoot.equals(Certificate.decodeBytes(c.merkle.root, 'hex', 'merkle.root'))) {
        return false
      }
      // leafCount is compared because the inclusion proof cannot be relied on to catch a
      // wrong one: for most indices the fold is identical across neighbouring counts.
      // The on-chain u32be is authoritative.
      return record.leafCount === c.merkle.leafCount
    }

    var expected = c.mode === Certificate.MODE.FULL ? NotaryScript.MODE.FULL
      : c.mode === Certificate.MODE.HYBRID ? NotaryScript.MODE.HYBRID : -1
    if (record.mode !== expected) return false

    var f = Certificate.toProofInput(c)
    if (record.algorithm !== f.algorithm) return false
    if (record.hashAlgorithm !== f.hashAlgorithm) return false
    if (!record.payloadHash.equals(f.payloadHash)) return false
    if (!record.proofHash.equals(Certificate.decodeBytes(c.proofHash, 'hex', 'proofHash'))) return false

    if (record.mode === NotaryScript.MODE.HYBRID) {
      return record.publicKeyHash.equals(Hash.sha256(f.publicKey)) &&
        record.signatureHash.equals(Hash.sha256(f.signature))
    }
    return record.publicKey.equals(f.publicKey) && record.signature.equals(f.signature)
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
    var c = Certificate.normalize(certificate)
    var spv = c && c.spv
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
    if (!c.anchor || txid !== String(c.anchor.txid).toLowerCase()) {
      errors.push('rawTx does not hash to anchor.txid')
    }

    var record = NotaryHash.recordFromRawTx(spv.rawTx)
    if (!record) {
      errors.push('no NotaryHash record found in rawTx')
    } else if (!NotaryHash.recordMatchesCertificate(record, c)) {
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

    // The spec anchors the certificate in "the block header for spv.blockHash". A header
    // the proof folds to, that is not that block, proves inclusion somewhere else — and the
    // certificate's own statement of where would go unchecked. The reference compares
    // the header's hash against the envelope; so does this.
    if (spv.blockHash !== undefined &&
      String(spv.blockHash).toLowerCase() !== String(inclusion.blockHash).toLowerCase()) {
      errors.push('the supplied header is not the block the SPV envelope names')
    }

    return { valid: errors.length === 0, errors: errors }
  } catch (e) {
    return { valid: false, errors: ['anchor verification error: ' + e.message] }
  }
}

/**
 * Batch inclusion — the extra step a batched certificate needs.
 *
 * The on-chain record for a batch carries only a root and a leaf count, so the
 * certificate's own `merkle` proof is what ties it to that root. Folding is RFC 6962,
 * NOT the Bitcoin tree in lib/spv — see lib/notaryhash/merkle.js for why the difference
 * matters and why reusing the other one would be silently wrong.
 *
 * The leaf data is the certificate's proofHash. The spec does not state what a leaf
 * contains; the reference implementation uses proofHash, and a batch it built verifies
 * here leaf for leaf — see test/notaryhash/reference_certs.js.
 *
 * The path is folded by the sides it carries, as the reference folds it. `leafIndex` is
 * not used to re-derive them: the reference does not, and a verifier that refused
 * certificates the reference accepts would not be a BRC-220 verifier.
 *
 * @param {Object} certificate
 * @returns {Object} { valid, errors }
 */
NotaryHash.verifyBatchInclusion = function (certificate) {
  try {
    var c = Certificate.normalize(certificate)
    if (!c || !c.anchor || c.anchor.type !== Certificate.ANCHOR_TYPE.BATCH) {
      return { valid: false, errors: ['certificate is not batch-anchored (anchor.type is not "batch")'] }
    }
    if (!c.merkle) return { valid: false, errors: ['batch certificate has no merkle proof'] }
    return merkleFolds(c, 'merkle inclusion proof does not fold to the batch root')
  } catch (e) {
    return { valid: false, errors: ['batch inclusion error: ' + e.message] }
  }
}

/**
 * Does the certificate's merkle proof fold its proofHash to the root it states?
 *
 * The same question for a batch anchor and for a proof carried on a direct one; only
 * what a failure means differs, so the caller supplies the message.
 */
function merkleFolds (c, failure) {
  try {
    var m = c.merkle

    // THE LEAF IS proofHash, NOT canonicalBytes.
    //
    // BRC-220 writes the batch tree as `leaf = SHA256(0x00 ‖ d)` without binding `d`, and
    // the two readings — proofHash or canonicalBytes — are equally sound and produce
    // different roots. proofHash is what the reference implementation's batcher uses
    // (`leaves = batch.map(e => e.proofHash)`), and bsv-blockchain/BRCs#246 proposes
    // stating it in the spec. test/notaryhash/batch_leaf.js checks that a
    // canonicalBytes-leaf tree is rejected rather than trusting this comment.
    var leafData = Certificate.decodeBytes(c.proofHash, 'hex', 'proofHash')
    var root = Certificate.decodeBytes(m.root, 'hex', 'merkle.root')

    // Folded by side, as the reference folds it. The sides are what the certificate
    // carries; a legacy bare-hash path had them derived from leafIndex and leafCount when
    // it was normalised.
    return Merkle.verifyAuditPath(leafData, m.path, root)
      ? { valid: true, errors: [] }
      : { valid: false, errors: [failure] }
  } catch (e) {
    return { valid: false, errors: ['batch inclusion error: ' + e.message] }
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
 * @returns {Object} { valid, signature, proofIntegrity, anchor, batchInclusion, shape,
 *   legacy, errors } — `legacy` is true when the certificate was written by 8.3.0–9.8.0
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

  // Legacy certificates are translated once, here, and the translation is reported so a
  // caller holding one knows to re-issue it in the current format.
  report.legacy = !!(certificate && typeof certificate === 'object' &&
    certificate.version === Certificate.LEGACY_VERSION)
  certificate = Certificate.normalize(certificate)

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

  // A batched certificate has a fourth thing to prove: that this proof is actually one
  // of the ones the on-chain root commits to. Without it, any certificate could point at
  // any batch anchor and the anchor check alone would not notice.
  //
  // A merkle proof is checked whenever one is present, not only on a batch anchor, as the
  // reference checks it: a certificate whose path does not fold to its stated root fails
  // even when nothing else relies on it. On a direct anchor that is the whole of it — the
  // record is compared directly, so a proof that folds adds nothing and is accepted.
  report.batchInclusion = true
  var batchAnchored = !!(certificate.anchor && certificate.anchor.type === Certificate.ANCHOR_TYPE.BATCH)
  if (batchAnchored || certificate.merkle !== undefined) {
    var batch = batchAnchored
      ? NotaryHash.verifyBatchInclusion(certificate)
      : merkleFolds(certificate, 'merkle proof does not fold to its stated root')
    report.batchInclusion = batch.valid
    batch.errors.forEach(function (e) { report.errors.push(e) })
  }

  report.valid = report.signature && report.proofIntegrity && report.anchor &&
    report.batchInclusion
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
