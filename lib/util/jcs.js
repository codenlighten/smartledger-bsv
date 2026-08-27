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
  return serialize(value, [])
}

/**
 * `stack` carries the containers currently being serialized, so a cycle throws a
 * typed error instead of recursing until the call stack is exhausted. That matters
 * now the function is public API reachable from a verifier: verification input is by
 * definition untrusted, and a RangeError raised at an arbitrary depth is a worse
 * failure than a deliberate one. A linear scan beats a Set here because these
 * structures are shallow and the array avoids the allocation entirely for the common
 * acyclic case.
 *
 * No acyclic input changes behaviour, so nothing already signed is affected.
 */
function serialize (value, stack) {
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

  if (type === 'bigint') {
    // JSON has no bigint form and coercing one would silently canonicalize a
    // different document than the caller supplied. Carry it as a string.
    throw new Error('Cannot canonicalize bigint; represent it as a string')
  }

  if (Array.isArray(value) || type === 'object') {
    if (stack.indexOf(value) !== -1) {
      throw new Error('Cannot canonicalize a circular structure')
    }
    stack.push(value)

    var out
    if (Array.isArray(value)) {
      // Arrays are order-significant. `undefined` has no JSON form and becomes null in an
      // array, matching JSON.stringify.
      out = '[' + value.map(function (item) {
        return item === undefined ? 'null' : serialize(item, stack)
      }).join(',') + ']'
    } else {
      // Absent and explicitly-undefined are indistinguishable in JSON, so both are dropped.
      var keys = Object.keys(value).filter(function (key) {
        return value[key] !== undefined && typeof value[key] !== 'function'
      }).sort()

      out = '{' + keys.map(function (key) {
        return JSON.stringify(key) + ':' + serialize(value[key], stack)
      }).join(',') + '}'
    }

    stack.pop()
    return out
  }

  throw new Error('Cannot canonicalize value of type: ' + type)
}

module.exports = JCS
