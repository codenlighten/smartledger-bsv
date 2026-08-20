'use strict'

/* global describe, it */

// BRC-220 signature interoperability.
//
// Every other test in this directory signs with `lib/crypto/ecdsa.js` and verifies
// through `lib/notaryhash/suites.js`, which also uses `lib/crypto/ecdsa.js`. That
// proves the module agrees with itself. It cannot prove the module agrees with the
// spec, and in 8.3.0 it did not: the suite set `endian: 'little'` before verifying,
// so it rejected any signature produced the way BRC-220 describes and accepted only
// signatures made with bsv's own byte-reversed convention. Twenty-odd passing tests
// said nothing about it, because they all signed the same wrong way.
//
// So this file verifies against `@noble/curves` instead — a separate implementation
// that shares no verification code with ours. It is the only test here that can fail
// when our code and our tests are wrong together.
//
// One trap worth naming, because it cost real time when this was diagnosed: noble v2
// PREHASHES by default. `secp256k1.sign(digest, key)` signs `sha256(digest)`, and
// `secp256k1.verify` prehashes to match, so noble looks self-consistent while
// disagreeing with everyone. BRC-220 signs the payloadHash itself, so every call
// below passes `{ prehash: false }`. Omit it and these tests compare the wrong things
// and "pass" for the wrong reason.

require('chai').should()
var bsv = require('../..')
var Suites = require('../../lib/notaryhash/suites')
var Hash = require('../../lib/crypto/hash')
var { secp256k1 } = require('@noble/curves/secp256k1.js')

var PAYLOAD_HASH = Hash.sha256(Buffer.from('the document nobody sees'))

// A fixed key, so a failure is reproducible rather than one-in-N flaky.
var SECRET = Buffer.from('c0ffee00c0ffee00c0ffee00c0ffee00c0ffee00c0ffee00c0ffee00c0ffee01', 'hex')
var PUBLIC_KEY = Buffer.from(secp256k1.getPublicKey(SECRET, true))

function rawSig (sig) {
  return Buffer.concat([
    sig.r.toArrayLike(Buffer, 'be', 32),
    sig.s.toArrayLike(Buffer, 'be', 32)
  ])
}

describe('BRC-220 signature interop', function () {
  it('agrees with @noble/curves on the public key for a given secret', function () {
    // If this fails nothing below means anything — the two libraries would be
    // signing under different keys.
    var ours = bsv.PrivateKey.fromBuffer(SECRET).toPublicKey().toBuffer()
    ours.toString('hex').should.equal(PUBLIC_KEY.toString('hex'))
  })

  it('ACCEPTS a signature made the way the spec describes', function () {
    // This is the regression. Under 8.3.0 this assertion fails.
    var conformant = Buffer.from(secp256k1.sign(PAYLOAD_HASH, SECRET, { prehash: false }))
    Suites.verify('ECDSA-secp256k1', PAYLOAD_HASH, conformant, PUBLIC_KEY)
      .should.equal(true, 'a conformant BRC-220 signature must verify')
  })

  it('emits signatures an independent implementation accepts', function () {
    var key = bsv.PrivateKey.fromBuffer(SECRET)
    var ecdsa = bsv.crypto.ECDSA().set({ hashbuf: PAYLOAD_HASH, privkey: key })
    ecdsa.sign()
    secp256k1.verify(rawSig(ecdsa.sig), PAYLOAD_HASH, PUBLIC_KEY, { prehash: false })
      .should.equal(true, 'our signature must verify under @noble/curves')
  })

  it('REJECTS a signature over the byte-reversed digest', function () {
    // The 8.3.0 convention. It must now fail: accepting both would mean two valid
    // signatures exist for one signing act, and both are inside proofHash.
    var key = bsv.PrivateKey.fromBuffer(SECRET)
    var ecdsa = bsv.crypto.ECDSA().set({ hashbuf: PAYLOAD_HASH, endian: 'little', privkey: key })
    ecdsa.sign()
    Suites.verify('ECDSA-secp256k1', PAYLOAD_HASH, rawSig(ecdsa.sig), PUBLIC_KEY)
      .should.equal(false, 'the pre-8.3.1 little-endian convention must not verify')
  })

  it('round-trips both ways over many payloads, not just one', function () {
    // A single vector can pass by coincidence — the reversal of a digest whose bytes
    // happen to be near-palindromic still differs, but a lucky scalar could mask a
    // subtler bug. Twenty payloads with distinct digests makes that implausible.
    var key = bsv.PrivateKey.fromBuffer(SECRET)
    for (var i = 0; i < 20; i++) {
      var h = Hash.sha256(Buffer.from('payload ' + i))

      var theirs = Buffer.from(secp256k1.sign(h, SECRET, { prehash: false }))
      Suites.verify('ECDSA-secp256k1', h, theirs, PUBLIC_KEY)
        .should.equal(true, 'noble sig ' + i + ' rejected by our suite')

      var ecdsa = bsv.crypto.ECDSA().set({ hashbuf: h, privkey: key })
      ecdsa.sign()
      secp256k1.verify(rawSig(ecdsa.sig), h, PUBLIC_KEY, { prehash: false })
        .should.equal(true, 'our sig ' + i + ' rejected by noble')
    }
  })

  it('still rejects a signature over a DIFFERENT payload', function () {
    // Guards against the fix degenerating into "accept anything". A verifier that
    // returns true unconditionally would pass every test above.
    var other = Hash.sha256(Buffer.from('a different document'))
    var sig = Buffer.from(secp256k1.sign(other, SECRET, { prehash: false }))
    Suites.verify('ECDSA-secp256k1', PAYLOAD_HASH, sig, PUBLIC_KEY)
      .should.equal(false)
  })

  it('still rejects a signature from a DIFFERENT key', function () {
    var otherSecret = Buffer.from('a11ce00a11ce00a11ce00a11ce00a11ce00a11ce00a11ce00a11ce00a11ce001', 'hex')
    var sig = Buffer.from(secp256k1.sign(PAYLOAD_HASH, otherSecret, { prehash: false }))
    Suites.verify('ECDSA-secp256k1', PAYLOAD_HASH, sig, PUBLIC_KEY)
      .should.equal(false)
  })
})
