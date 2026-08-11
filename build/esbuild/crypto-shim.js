'use strict'
// Minimal browser polyfill for Node's `crypto`, replacing `crypto-browserify`.
//
// crypto-browserify is a faithful shim for the whole of Node's crypto module, which
// means it drags AES, DES, Diffie-Hellman, RSA public-encrypt and an ASN.1 parser into
// every browser bundle. We call none of it. It also depends on browserify-sign and
// create-ecdh, whose `elliptic` carries an advisory with no patched version — the build
// already had to stub those two out by hand to keep elliptic out of the output.
//
// The bundles need exactly three entry points, established by reading the graph rather
// than by guessing:
//
//   createHash   lib/crypto/hash.node.js and the didweb / vcjwt / statuslist / anchor /
//                gdaf modules, which require('crypto') unconditionally
//   createHmac   lib/mnemonic/pbkdf2.node.js
//   randomBytes  secrets.js-grempe's Shamir CSPRNG
//
// Deliberately NOT exported:
//
//   getRandomValues  secrets.js prefers it over randomBytes when present, so adding it
//                    would silently switch the Shamir CSPRNG to a different code path.
//                    crypto-browserify does not expose it either; omitting it keeps the
//                    selection identical to what shipped before.
//   everything else  an unimplemented member of Node's crypto surface should fail loudly
//                    at the call site rather than resolve to undefined. Modules that use
//                    createPublicKey / generateKeyPairSync / sign / verify are Node-only
//                    already: crypto-browserify never implemented those either, so this
//                    changes nothing for them.
//
// Note that lib/crypto/random.js does not come through here — its browser branch reads
// window.crypto directly.

exports.createHash = require('create-hash')
exports.createHmac = require('create-hmac')
exports.randomBytes = require('randombytes')
