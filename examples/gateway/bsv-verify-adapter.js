'use strict'

// A reference BSV verification adapter for a multi-chain gateway.
//
// Written for the block-penn-station gateway, whose BSV side calls the NotaryHash service to
// create records and needs to VERIFY them offline. Copy it; it is a worked example, not a
// supported API, and it deliberately does no network I/O of its own.
//
// Two design rules it exists to demonstrate:
//
//  1. A verifier never fetches. The caller supplies the block header, so the gateway — not this
//     module — owns the question "which chain am I on, and whom do I believe about it". Burying a
//     fetch in here is how a verifier ends up unable to tell a network failure from a bad proof.
//
//  2. The verdict has THREE states, not two. `valid` and `invalid` are claims about the
//     certificate; `indeterminate` says "I could not look" and is NOT a rejection. Collapsing it
//     into `invalid` makes a flaky explorer look like a forgery; collapsing it into `valid` is
//     worse. Every verification bug worth finding in this library came from that distinction
//     being lost, so it is the shape of the return value here.
//
// Verified against two real mainnet certificates; see examples/gateway/README.md.

var bsv = require('../..')
var NotaryHash = bsv.NotaryHash

var VERDICT = { VALID: 'valid', INVALID: 'invalid', INDETERMINATE: 'indeterminate' }

/**
 * Verify a NotaryHash certificate with a header the caller supplies.
 *
 * @param {Object} certificate - the `certificate` object from the service
 * @param {Object} [opts]
 * @param {String} [opts.header] - the 80-byte block header as hex, obtained INDEPENDENTLY of the
 *   party that gave you the certificate. Omit it to get `indeterminate` rather than a guess.
 * @param {String} [opts.blockHashAtHeight] - the block hash YOUR chain source has at
 *   `certificate.spv.blockHeight`. Required alongside the header, and the reason is worth
 *   understanding: a header carries its own difficulty bits, so a header alone is only checked
 *   against the proof-of-work limit. That rules out a FREE forgery (difficulty 1 is about 4.3e9
 *   hashes against a real mainnet header's ~1e20) and nothing more. A header is never believed
 *   about its own difficulty; it is believed because an independent source puts that hash at that
 *   height. Passing the header alone is deprecated in the library since 9.13.0.
 * @returns {Object} { verdict, ok, reasons, checks, legacy }
 *   `ok` is true only for VALID, so `if (!r.ok)` fails closed on indeterminate.
 */
function verifyCertificate (certificate, opts) {
  opts = opts || {}
  var reasons = []

  if (!certificate || typeof certificate !== 'object') {
    return result(VERDICT.INVALID, ['certificate is missing or not an object'], null, false)
  }

  // Structure and signature first: these need nothing from the chain, so a malformed or
  // unsigned certificate is INVALID even with no header available. Answering "indeterminate"
  // here would let a forgery hide behind a network outage.
  // One exception, and it is the three-state rule applied to structure rather than to the
  // network: a certificate with NO spv member has not been mined yet. The service issues it in
  // that state and fills the envelope when a block arrives. "There is no proof of inclusion
  // yet" is `indeterminate` — the same "I could not look" as a missing header. This example
  // called it `invalid` until the block-penn-station session pointed out that the contract it
  // ships with said otherwise.
  if (!certificate.spv || typeof certificate.spv !== 'object') {
    return result(VERDICT.INDETERMINATE, [
      'the certificate has no SPV envelope, so it has not been mined yet; re-fetch it once its ' +
        'transaction is in a block. This is not a rejection.'
    ], null, false)
  }

  var triage
  try {
    triage = NotaryHash.verify(certificate, { skipAnchor: true })
  } catch (e) {
    return result(VERDICT.INVALID, ['certificate could not be parsed: ' + e.message], null, false)
  }

  if (triage.signature === false) reasons.push('signature does not verify')
  if (triage.proofIntegrity === false) reasons.push('proof does not reconstruct the record')
  if (triage.shape === false) reasons.push('certificate shape is not recognised')
  if (reasons.length) {
    return result(VERDICT.INVALID, reasons, triage, triage.legacy)
  }

  // The anchor is the only part that needs the chain. No header means the record's presence in a
  // block is UNCHECKED — which is not the same as absent.
  if (typeof opts.header !== 'string' || opts.header.length !== 160) {
    return result(VERDICT.INDETERMINATE, [
      'no block header supplied, so the anchor is unchecked; pass opts.header as the 80-byte ' +
      'header in hex (160 characters) from a source you trust independently'
    ], triage, triage.legacy)
  }

  // Refuse the weak form rather than quietly accepting it. Without an independent block hash at
  // the height, a pass would mean only "this header was not free to make", which is not a
  // statement a gateway should record as verified.
  if (typeof opts.blockHashAtHeight !== 'string' || opts.blockHashAtHeight.length !== 64) {
    return result(VERDICT.INDETERMINATE, [
      'no independent block hash supplied for the height, so the header is only checked against ' +
      'the proof-of-work limit; pass opts.blockHashAtHeight as the hash your own chain source ' +
      'has at certificate.spv.blockHeight'
    ], triage, triage.legacy)
  }

  var full
  try {
    full = NotaryHash.verify(certificate, {
      header: opts.header,
      blockHashAtHeight: opts.blockHashAtHeight,
      // Every other option the caller passed goes through. The library grows options — today
      // allowUncheckedSeal and allowUnknownSpvFormat — and an adapter that enumerates only the
      // ones it knew about silently disables each new one. Dropping an opt-out is how a caller
      // ends up unable to turn off a refusal it understands better than we do.
      allowUncheckedSeal: opts.allowUncheckedSeal,
      allowUnknownSpvFormat: opts.allowUnknownSpvFormat,
      network: opts.network
    })
  } catch (e) {
    // A throw here is our inability to complete the check, not a verdict about the certificate.
    return result(VERDICT.INDETERMINATE, ['anchor check could not complete: ' + e.message], triage, triage.legacy)
  }

  if (full.valid === true) {
    return result(VERDICT.VALID, [], full, full.legacy)
  }

  var errs = (full.errors || []).slice()
  if (!errs.length) errs.push('anchor did not verify against the supplied header')
  return result(VERDICT.INVALID, errs, full, full.legacy)
}

function result (verdict, reasons, checks, legacy) {
  return {
    verdict: verdict,
    ok: verdict === VERDICT.VALID,
    reasons: reasons,
    checks: checks,
    legacy: !!legacy
  }
}

module.exports = { verifyCertificate: verifyCertificate, VERDICT: VERDICT }
