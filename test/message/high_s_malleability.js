'use strict'

/* global describe, it */

// Message.verify ACCEPTS the high-s twin of a signature it produced. This file PINS that, it
// does not endorse it.
//
// The compact signature is `byte0 || r(32) || s(32)` with `byte0 = 31 + recid` for a compressed
// key. Replacing `s` with `n - s` flips the recovered point's y parity, so the recid's low bit
// flips with it. Both encodings then recover the same public key and both verify:
//
//   A  byte0 31, recid 0, low-s      <- what sign() emits (RFC 6979, canonical low-s)
//   B  byte0 32, recid 1, s = n - s  <- a different base64 string, verifies identically
//
// Measured on published artifacts across the whole range — 1.5.6-fix1 (the first ever published),
// 7.0.0, 9.16.1, 9.31.0 and 9.37.0 — all accept B. This is longstanding behaviour and matches
// what several other Bitcoin message-signing implementations do; low-s is a CONSENSUS rule for
// script signatures (SCRIPT_VERIFY_LOW_S) and has never been one for signed messages.
//
// WHY IT IS PINNED RATHER THAN FIXED. Enforcing low-s here would be a compatibility break, not a
// bug fix: sign() has only ever emitted low-s, but another implementation may legitimately emit
// high-s and would stop verifying against us. That is a decision for the maintainer, so this
// file records the behaviour and makes any change to it deliberate — if someone "fixes" it, this
// test fails and the conversation happens before a release rather than after.
//
// WHAT CALLERS MUST NOT DO, which is the part that matters. The signature still proves the key
// signed the message, so authority is intact. But a signature is NOT an identifier: never use
// the signature bytes as a replay-cache key, a dedupe or idempotency key, or an audit-log
// primary key, because the twin is a different string that verifies identically. A protocol that
// needs uniqueness must refuse high-s ITSELF, on the RECEIVED bytes, before the signature is
// hashed into anything — otherwise the twin becomes a second valid entry for one authorisation.
//
// HOW THIS WAS MISSED, recorded because the shape recurs. It was first measured by mutating
// `byte0 ^ 1`. 31 is odd, so that yields 30 — outside the valid 31..34 range — and the library
// threw. A throw was recorded as a rejection, and the claim "not malleable" was reported to two
// consumers, one of whom wrote it into a protocol specification. In a must-fail test an exception
// is not a false, and the mutation has to stay inside the valid encoding or the test measures the
// parser rather than the property. (The in-domain flip is `31 + (recid ^ 1)`.) Confirmed
// independently afterwards by a pure-Python implementation sharing no code with this one.

require('chai').should()
var bsv = require('../..')
var BN = bsv.crypto.BN
var N = bsv.crypto.Point.getN()

// A fixed vector, so this is reproducible rather than merely self-consistent.
var PRIV = '6d6d6d6d6d6d6d6d6d6d6d6d6d6d6d6d6d6d6d6d6d6d6d6d6d6d6d6d6d6d6d6d'
var MESSAGE = 'authority: release funds to alice'
var EXPECTED = {
  pubkey: '0368bca1bdc0c97d299223321eb63e8d47779d776db73963c193c763bbe0cb44c8',
  address: '17mKXfVLBhiusjSzwyrM8Yxnjb5hiYAqxD',
  magicHash: 'b606a11b71b5a1019a790f3ff7bbfe8de8b0c728df63a47e84a4b465b1bd19ed',
  sigA: 'H5yoMJLTxFCcOxRdE+QKNFbBzrUgB60WsToF2HGGwlUZGLv+FehwJnC12V8gXjhkCp19B6VWQ9+0HB5Q4/JH/cY=',
  sigB: 'IJyoMJLTxFCcOxRdE+QKNFbBzrUgB60WsToF2HGGwlUZ50QB6heP2Y9KJqDfoceb9B0x1UFZBMCHo7QNqN3uQ3s='
}

function twin (b64) {
  var raw = Buffer.from(b64, 'base64')
  var recid = raw[0] - 31
  var s = BN.fromBuffer(raw.slice(33, 65))
  // in-domain parity flip: 31 <-> 32, 33 <-> 34. NEVER `raw[0] ^ 1`.
  return Buffer.concat([
    Buffer.from([31 + (recid ^ 1)]),
    raw.slice(1, 33),
    N.sub(s).toArrayLike(Buffer, 'be', 32)
  ]).toString('base64')
}

describe('Message signatures are malleable, and this pins it', function () {
  var key = bsv.PrivateKey.fromBuffer(Buffer.from(PRIV, 'hex'))
  var addr = key.toAddress().toString()

  it('reproduces the fixed vector exactly', function () {
    key.toPublicKey().toHex().should.equal(EXPECTED.pubkey)
    addr.should.equal(EXPECTED.address)
    bsv.Message(MESSAGE).magicHash().toString('hex').should.equal(EXPECTED.magicHash)
    bsv.Message(MESSAGE).sign(key).should.equal(EXPECTED.sigA)
  })

  it('emits low-s and the twin is a DIFFERENT string', function () {
    var raw = Buffer.from(EXPECTED.sigA, 'base64')
    var s = BN.fromBuffer(raw.slice(33, 65))
    s.cmp(N.div(new BN(2))).should.be.below(1, 'sign() must emit low-s')
    raw[0].should.equal(31)
    twin(EXPECTED.sigA).should.equal(EXPECTED.sigB)
    EXPECTED.sigB.should.not.equal(EXPECTED.sigA)
  })

  it('ACCEPTS the high-s twin — the behaviour this file exists to pin', function () {
    bsv.Message(MESSAGE).verify(addr, EXPECTED.sigA).should.equal(true)
    bsv.Message(MESSAGE).verify(addr, EXPECTED.sigB).should.equal(true, 'the twin is accepted; see this file\'s header before changing it')
  })

  it('and both encodings recover the same key, so it is one signature in two forms', function () {
    function recover (b64) {
      var raw = Buffer.from(b64, 'base64')
      var e = new bsv.crypto.ECDSA()
      e.hashbuf = bsv.Message(MESSAGE).magicHash()
      e.sig = new bsv.crypto.Signature({
        r: BN.fromBuffer(raw.slice(1, 33)),
        s: BN.fromBuffer(raw.slice(33, 65)),
        i: raw[0] - 31,
        compressed: true
      })
      return e.toPublicKey().toHex()
    }
    recover(EXPECTED.sigA).should.equal(EXPECTED.pubkey)
    recover(EXPECTED.sigB).should.equal(EXPECTED.pubkey)
  })

  it('the out-of-domain mutation throws, which is NOT a rejection', function () {
    // The exact mistake the header describes, kept as a test so the distinction survives:
    // `raw[0] ^ 1` leaves the valid header range and the library raises. A must-fail test that
    // passes this way has measured the parser, not malleability.
    var raw = Buffer.from(EXPECTED.sigA, 'base64')
    var outOfDomain = Buffer.concat([
      Buffer.from([raw[0] ^ 1]),
      raw.slice(1, 33),
      N.sub(BN.fromBuffer(raw.slice(33, 65))).toArrayLike(Buffer, 'be', 32)
    ]).toString('base64')
    ;(raw[0] ^ 1).should.equal(30)
    ;(function () { bsv.Message(MESSAGE).verify(addr, outOfDomain) }).should.throw()
  })

  it('a verifier needing uniqueness must refuse high-s itself, in two lines', function () {
    // What a consumer should do, asserted so the recipe in the header is known to work.
    function strictVerify (message, address, b64) {
      var raw = Buffer.from(b64, 'base64')
      if (raw.length !== 65) return false
      if (raw[0] < 31 || raw[0] > 34) return false
      if (BN.fromBuffer(raw.slice(33, 65)).cmp(N.div(new BN(2))) > 0) return false // low-s
      return bsv.Message(message).verify(address, b64)
    }
    strictVerify(MESSAGE, addr, EXPECTED.sigA).should.equal(true)
    strictVerify(MESSAGE, addr, EXPECTED.sigB).should.equal(false)
  })
})
