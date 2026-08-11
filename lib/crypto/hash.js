'use strict'

// Pick the hashing backend by CAPABILITY, not by `process.browser`.
//
// This file used to read `process.browser`, a Browserify-era convention that is
// undefined in React Native, Deno, Cloudflare Workers and Bun. All of them took the
// node branch and required('crypto'), which in React Native fails outright or — worse —
// resolves to a partial shim. See lib/crypto/random.js for the same bug in the CSPRNG.
//
// Node's implementation is kept as the preferred backend rather than always using
// @noble/hashes, because it is materially faster on the payload sizes this library
// actually hashes in bulk: measured at parity for 32 bytes (1.2x) but ~10x for 64 KB
// and above, which is block parsing and document anchoring.
//
// Two capability checks, not one:
//
//   - The digests must be CORRECT, verified against known-answer vectors. A partial
//     crypto shim that supplies a wrong or stubbed createHash would otherwise silently
//     corrupt every hash in the library. Falling back to the audited pure-JS
//     implementation is always safe; trusting an unknown shim is not.
//   - `ripemd160` must be present. OpenSSL 3 moved it to the legacy provider, so some
//     Node builds have sha256 but throw on ripemd160 — which is what addresses are
//     built from, making this a real failure and not a theoretical one.
//
// The probe costs four hashes of three bytes, once, at module load.

var VECTORS = {
  sha1: 'a9993e364706816aba3e25717850c26c9cd0d89d',
  sha256: 'ba7816bf8f01cfea414140de5dae2223b00361a396177a9cb410ff61f20015ad',
  sha512: 'ddaf35a193617abacc417349ae20413112e6fa4e89a97ea20a9eeee64b55d39a' +
          '2192992a274fc1a836ba3c23a3feebbd454d4423643ce80e2a9ac94fa54ca49f',
  ripemd160: '8eb208f7e05d987a9b044a8e98c6b087f15a0bfc'
}

function nodeHashesAreUsable () {
  var crypto
  try {
    crypto = require('crypto')
  } catch (e) {
    return false
  }
  if (!crypto || typeof crypto.createHash !== 'function') return false

  var algorithms = Object.keys(VECTORS)
  for (var i = 0; i < algorithms.length; i++) {
    var algorithm = algorithms[i]
    try {
      if (crypto.createHash(algorithm).update('abc').digest('hex') !== VECTORS[algorithm]) {
        return false
      }
    } catch (e) {
      return false
    }
  }
  return true
}

module.exports = nodeHashesAreUsable() ? require('./hash.node') : require('./hash.browser')
