'use strict'

// Pick the PBKDF2 backend by CAPABILITY, not by `process.browser`. Same reasoning as
// lib/crypto/hash.js: that flag is undefined in React Native, Deno, Workers and Bun, so
// all of them took the node branch and required('crypto') — failing outright, or
// resolving to a partial shim.
//
// The node variant needs `createHmac('sha512')`, so that is what is probed, and the
// result is checked against RFC 4231 test case 1 rather than merely existing. A shim
// that returns a wrong or stubbed HMAC would otherwise silently corrupt every seed
// derived from a mnemonic — and unlike a crash, that failure is invisible until funds
// are missing. The pure-JS fallback is audited and always safe.

var RFC4231_CASE1 = '87aa7cdea5ef619d4ff0b4241a1d6cb02379f4e2ce4ec2787ad0b30545e17cdedaa833b7d6b8a702038b274eaea3f4e4be9d914eeb61f1702e696c203a126854'

function nodeHmacIsUsable () {
  var crypto
  try {
    crypto = require('crypto')
  } catch (e) {
    return false
  }
  if (!crypto || typeof crypto.createHmac !== 'function') return false

  try {
    var mac = crypto.createHmac('sha512', Buffer.alloc(20, 0x0b))
      .update('Hi There')
      .digest('hex')
    return mac === RFC4231_CASE1
  } catch (e) {
    return false
  }
}

module.exports = nodeHmacIsUsable() ? require('./pbkdf2.node') : require('./pbkdf2.browser')
