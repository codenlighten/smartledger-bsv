'use strict'

// WebCrypto refuses more than 65,536 bytes in a single getRandomValues() call, so large
// requests are filled in chunks. Node's randomBytes has no such limit, which is why this
// only matters on the WebCrypto path.
var MAX_GET_RANDOM_VALUES = 65536

function Random () {
}

/**
 * Cryptographically secure random bytes.
 *
 * Backend selection is by FEATURE DETECTION, not by environment guess. This previously
 * branched on `process.browser` — a Browserify-era convention that is undefined in React
 * Native, Deno, Cloudflare Workers, Bun, and any bundler that does not shim it. All of
 * those fell through to `require('crypto').randomBytes`. In React Native that is a hard
 * failure at best; at worst a partial crypto shim (rn-nodeify and several RN starter
 * templates register one) supplies a weak `randomBytes`, and `PrivateKey.fromRandom()`
 * silently produces guessable keys.
 *
 * `globalThis.crypto.getRandomValues` covers browsers, Node >= 19, Deno, Workers, Bun,
 * and React Native with react-native-get-random-values, so it is tried first.
 *
 * If no CSPRNG can be found this THROWS. That is as important as the detection: a key
 * library must never return bytes it cannot vouch for.
 *
 * @param {number} size - number of bytes
 * @returns {Buffer}
 */
Random.getRandomBuffer = function (size) {
  var webcrypto = typeof globalThis !== 'undefined' ? globalThis.crypto : undefined
  if (webcrypto && typeof webcrypto.getRandomValues === 'function') {
    return Random._fromGetRandomValues(webcrypto, size)
  }

  // Node < 19 has no global crypto. Kept as a fallback rather than the default.
  try {
    var nodeCrypto = require('crypto')
    if (nodeCrypto && typeof nodeCrypto.randomBytes === 'function') {
      return nodeCrypto.randomBytes(size)
    }
  } catch (e) { /* no node crypto in this environment */ }

  throw new Error('bsv: no CSPRNG available in this environment (needs globalThis.crypto.getRandomValues or node crypto)')
}

/**
 * Fill `size` bytes from a WebCrypto instance, respecting the per-call limit.
 * @private
 */
Random._fromGetRandomValues = function (webcrypto, size) {
  var buf = Buffer.alloc(size)
  for (var offset = 0; offset < size; offset += MAX_GET_RANDOM_VALUES) {
    var chunk = new Uint8Array(Math.min(MAX_GET_RANDOM_VALUES, size - offset))
    webcrypto.getRandomValues(chunk)
    Buffer.from(chunk).copy(buf, offset)
  }
  return buf
}

/**
 * Node-specific CSPRNG. Retained as public API; `getRandomBuffer` no longer routes
 * here by default.
 */
Random.getRandomBufferNode = function (size) {
  var crypto = require('crypto')
  return crypto.randomBytes(size)
}

/**
 * WebCrypto CSPRNG. Retained as public API.
 *
 * Reads `globalThis` rather than a bare `window`, which does not exist in Web Workers,
 * Node, or React Native.
 */
Random.getRandomBufferBrowser = function (size) {
  var g = typeof globalThis !== 'undefined' ? globalThis : {}
  var crypto = null

  if (g.crypto && typeof g.crypto.getRandomValues === 'function') {
    crypto = g.crypto
  } else if (g.msCrypto && typeof g.msCrypto.getRandomValues === 'function') { // internet explorer
    crypto = g.msCrypto
  }

  if (!crypto) {
    throw new Error('window.crypto.getRandomValues not available')
  }

  return Random._fromGetRandomValues(crypto, size)
}

module.exports = Random
