'use strict'

/**
 * RFC 8785 — JSON Canonicalization Scheme.
 *
 * Extracted from lib/gdaf/attestation-signer.js, where it was added in 8.2.0. Two
 * unrelated things now need it — GDAF credential signatures and BRC-220 certificates —
 * and a notarization module reaching into the credentials module for it would be the
 * wrong direction. JCS is a general serialization concern, not a GDAF concept.
 *
 * The behaviour is unchanged; `AttestationSigner._canonicalizeJCS` delegates here.
 *
 * The point of JCS is that two independent implementations produce identical bytes, so
 * everything below is fixed by the RFC rather than by local preference:
 *
 *   - Object keys sort by UTF-16 code unit, which is what Array.prototype.sort already
 *     does for strings. The sort is applied DURING serialization rather than by
 *     rebuilding an object, because V8 orders integer-like own properties numerically
 *     ahead of string keys and would silently undo it — `{"2":…,"10":…}` where the RFC
 *     requires `{"10":…,"2":…}`. That was a real defect in this codebase before 8.2.0.
 *   - JSON.stringify supplies the leaf types deliberately: for finite numbers it produces
 *     ECMAScript Number::toString, which the RFC mandates, and since ES2019 it emits
 *     well-formed output for lone surrogates. Both are easy to get subtly wrong by hand.
 *   - Non-finite numbers throw rather than serializing as `null`, which is what
 *     JSON.stringify does and which would silently canonicalize a different document than
 *     the one supplied.
 */

var JCS = {}

/**
 * Serialize a value as RFC 8785 canonical JSON.
 *
 * @param {*} value
 * @returns {String}
 */
JCS.stringify = function (value) {
  if (value === null) return 'null'

  var type = typeof value

  if (type === 'boolean') return value ? 'true' : 'false'

  if (type === 'number') {
    if (!isFinite(value)) {
      throw new Error('Cannot canonicalize non-finite number: ' + value)
    }
    return JSON.stringify(value)
  }

  if (type === 'string') return JSON.stringify(value)

  if (Array.isArray(value)) {
    // Arrays are order-significant. `undefined` has no JSON form and becomes null in an
    // array, matching JSON.stringify.
    return '[' + value.map(function (item) {
      return item === undefined ? 'null' : JCS.stringify(item)
    }).join(',') + ']'
  }

  if (type === 'object') {
    // Absent and explicitly-undefined are indistinguishable in JSON, so both are dropped.
    var keys = Object.keys(value).filter(function (key) {
      return value[key] !== undefined && typeof value[key] !== 'function'
    }).sort()

    return '{' + keys.map(function (key) {
      return JSON.stringify(key) + ':' + JCS.stringify(value[key])
    }).join(',') + '}'
  }

  throw new Error('Cannot canonicalize value of type: ' + type)
}

module.exports = JCS
