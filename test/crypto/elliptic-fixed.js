'use strict'

/* global describe, it */

var assert = require('assert')
var ec = require('../../lib/crypto/elliptic-fixed')

describe('elliptic-fixed (hardened secp256k1)', function () {
  var key = ec.keyFromPrivate(
    '0101010101010101010101010101010101010101010101010101010101010101', 'hex'
  )
  var msg = 'deadbeef'.repeat(8) // 32-byte hash, hex

  it('produces low-S canonical signatures', function () {
    for (var i = 0; i < 20; i++) {
      var m = (i.toString(16).padStart(2, '0')).repeat(32)
      var sig = ec.sign(m, key)
      var halfN = ec.curve.n.ushrn(1)
      assert.ok(sig.s.cmp(halfN) <= 0, 's must be <= n/2 (low-S)')
    }
  })

  it('keeps recoveryParam consistent so the pubkey recovers correctly', function () {
    // Regression guard: a manual s-flip without flipping recoveryParam (the
    // pre-fix behaviour) recovers the WRONG public key whenever s was high —
    // which is ~50% of signatures. Use buffer messages for both sign and
    // recover so the encoding is identical on each side.
    var pub = key.getPublic()
    for (var i = 1; i <= 40; i++) {
      var m = Buffer.from(i.toString(16).padStart(2, '0').repeat(32), 'hex')
      var sig = ec.sign(m, key)
      assert.notStrictEqual(sig.recoveryParam, null)
      var recovered = ec.recoverPubKey(m, sig, sig.recoveryParam)
      assert.ok(recovered.eq(pub), 'recovered pubkey must match signer (iter ' + i + ')')
    }
  })

  it('still verifies its own canonical signatures', function () {
    var sig = ec.sign(msg, key)
    assert.strictEqual(ec.verify(msg, sig, key), true)
  })

  it('rejects zero r or s', function () {
    var sig = ec.sign(msg, key)
    var BN = sig.r.constructor // bn.js
    assert.strictEqual(ec.verify(msg, { r: new BN(0), s: sig.s }, key), false)
    assert.strictEqual(ec.verify(msg, { r: sig.r, s: new BN(0) }, key), false)
  })

  it('rejects out-of-range r or s (>= n)', function () {
    var sig = ec.sign(msg, key)
    assert.strictEqual(ec.verify(msg, { r: ec.curve.n, s: sig.s }, key), false)
    assert.strictEqual(ec.verify(msg, { r: sig.r, s: ec.curve.n }, key), false)
  })

  it('returns false (never throws) on malformed signatures', function () {
    assert.strictEqual(ec.verify(msg, null, key), false)
    assert.strictEqual(ec.verify(msg, {}, key), false)
    assert.strictEqual(ec.verify(msg, { r: 'x', s: 'y' }, key), false)
  })
})
