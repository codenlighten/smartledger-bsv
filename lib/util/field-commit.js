'use strict'

/**
 * The permitted value domain shared by every proof system in this library, and the
 * length-prefixed leaf framing the GDAF prover uses.
 *
 * It lives here because the DOMAIN is what makes a commitment injective, and the domain was
 * duplicated. `lib/gdaf/zk-prover.js` fixed it (9.22.0 for membership, again for selective
 * disclosure) while `lib/ltp/proof.js` kept its own `_hashField`:
 *
 *     path + ':' + JSON.stringify(value) + ':' + salt
 *
 * which still carried the defect. Measured against 9.31.0 on the public `LTP.Proof`
 * disclosure path: a proof disclosing `null` VERIFIED after the disclosed value was changed
 * to `NaN`, and again after it was changed to `Infinity`. A verified disclosure of a value
 * the issuer never committed to.
 *
 * The cause is that `JSON.stringify` IS NOT INJECTIVE: `null`, `NaN` and `Infinity` all
 * render as `"null"`, so three values share one commitment. The answer is not a wider
 * serializer but a VALIDATED DOMAIN — `NaN`, `Infinity` and `undefined` are refused outright,
 * because a value that cannot be encoded unambiguously must not be committed to at all.
 * `canonicalMember` is that domain, and both modules now call it.
 *
 * NOTE THE TWO FRAMINGS, which is deliberate and not an oversight. `leafBytes` below gives
 * each component a decimal byte-length prefix, so the framing is self-delimiting and no
 * component can impersonate part of another; that is what the GDAF prover commits to. The LTP
 * module still joins with `':'`, because moving its framing would move every Merkle root it
 * has ever produced and `STABILITY.md` promises 9.x will not break callers before
 * 2027-09-01 — with one narrow exception, for APIs that can lose funds, which that is not.
 * Validating the domain closes the forgery WITHOUT touching a single commitment: RFC 8785 is
 * byte-identical to `JSON.stringify` for every value that can reach an LTP leaf, since
 * `_traverseObject` recurses into objects and arrays alike and so a leaf value is always a
 * primitive. Verified commitment-by-commitment against the 9.31.0 code. Unifying the framing
 * is a 10.0.0 change.
 *
 * One more property of `leafBytes` worth stating, because it is easy to look at this code and
 * see a missing RFC 6962 tag: a leaf's bytes are a length-prefixed ASCII frame, while an
 * internal Merkle node's bytes are two raw 32-byte hashes. Those input spaces do not overlap
 * for any input the framing accepts, which is what makes presenting an internal node as a
 * leaf infeasible there. That is a property of THIS framing, not a general guarantee — a
 * construction hashing bare concatenations needs explicit leaf/node tags, which is what
 * `NotaryHash.Merkle` uses.
 */

var JCS = require('./jcs')

/**
 * Validate a value against the permitted domain and return its canonical RFC 8785 form.
 *
 * Throws on anything that cannot be encoded injectively, naming the path so a caller can
 * tell WHICH field is unrepresentable rather than getting a bare type error.
 *
 * @param {*} value - the value to canonicalize
 * @param {String} [path] - where it sits, for the error message
 * @returns {String} the canonical JSON form
 */
function canonicalMember (value, path) {
  var where = path || 'value'
  var t = typeof value
  if (value === null || t === 'boolean' || t === 'string') {
    // fine
  } else if (t === 'number') {
    if (!isFinite(value)) throw new Error(where + ' must be a finite number')
  } else if (Array.isArray(value)) {
    for (var i = 0; i < value.length; i++) {
      if (value[i] === undefined) throw new Error(where + '[' + i + '] is undefined')
      canonicalMember(value[i], where + '[' + i + ']')
    }
  } else if (t === 'object') {
    if (Object.getPrototypeOf(value) !== Object.prototype &&
        Object.getPrototypeOf(value) !== null) {
      throw new Error(where + ' must be a plain object')
    }
    var keys = Object.keys(value)
    for (var k = 0; k < keys.length; k++) {
      if (value[keys[k]] === undefined) {
        throw new Error(where + '.' + keys[k] + ' is undefined')
      }
      canonicalMember(value[keys[k]], where + '.' + keys[k])
    }
  } else {
    throw new Error(where + ' is not a permitted type: ' + t)
  }
  return JCS.stringify(value)
}

/**
 * The bytes a (path, value, salt) commitment is taken over. Used by BOTH the generator and
 * the verifier in every consumer — they must agree byte for byte or nothing verifies.
 *
 * @param {String} path - field path, non-empty
 * @param {*} value - field value, within the permitted domain
 * @param {String} salt - per-field salt, non-empty
 * @returns {Buffer}
 */
function leafBytes (path, value, salt) {
  if (typeof path !== 'string' || !path) throw new Error('field path must be a non-empty string')
  if (typeof salt !== 'string' || !salt) throw new Error('field salt must be a non-empty string')
  var parts = [path, canonicalMember(value, path), salt].map(function (part) {
    return Buffer.byteLength(part, 'utf8') + ':' + part
  })
  return Buffer.from(parts.join(''), 'utf8')
}

module.exports = {
  canonicalMember: canonicalMember,
  leafBytes: leafBytes
}
