'use strict'
/**
 * `Message#verify(address, sig, { lowS: true })` refuses the malleable twin.
 *
 * The default still accepts it, because sign() has only ever emitted low-s but other
 * implementations may legitimately emit high-s — so refusing by default is a compatibility
 * break, not a bug fix. Per STABILITY.md the behaviour is marked now and 10.0.0 flips it.
 * test/message/high_s_malleability.js pins the current default; this file pins the opt-out.
 */
require('chai').should()
var bsv = require('../..')
var BN = bsv.crypto.BN
var Point = bsv.crypto.Point

var priv = bsv.PrivateKey.fromBuffer(Buffer.from('6d'.repeat(32), 'hex'))
var address = priv.toAddress().toString()
var message = 'authority: release funds to alice'

function twinOf (sigString) {
  var raw = Buffer.from(sigString, 'base64')
  var recid = (raw[0] - 31) & 3
  var s = BN.fromBuffer(raw.slice(33, 65))
  // stay inside the valid 31..34 header range: a mutation outside it measures the parser,
  // not the rule under test
  var header = Buffer.from([31 + (recid ^ 1)])
  return Buffer.concat([header, raw.slice(1, 33), Point.getN().sub(s).toBuffer({ size: 32 })]).toString('base64')
}
function isHighS (sigString) {
  var s = BN.fromBuffer(Buffer.from(sigString, 'base64').slice(33, 65))
  return s.muln(2).cmp(Point.getN().subn(1)) > 0
}

describe('Message#verify low-s option', function () {
  var signed = bsv.Message(message).sign(priv)
  var twin = twinOf(signed)

  it('the twin is a different string, is high-s, and the original is not', function () {
    twin.should.not.equal(signed)
    isHighS(signed).should.equal(false)
    isHighS(twin).should.equal(true)
  })

  it('without the option, both verify — the documented default', function () {
    bsv.Message(message).verify(address, signed).should.equal(true)
    bsv.Message(message).verify(address, twin).should.equal(true)
  })

  it('with { lowS: true } the twin is refused and the original still verifies', function () {
    bsv.Message(message).verify(address, signed, { lowS: true }).should.equal(true)
    bsv.Message(message).verify(address, twin, { lowS: true }).should.equal(false)
  })

  it('sets an error naming the reason, so a caller can tell it from a wrong-key failure', function () {
    var m = bsv.Message(message)
    m.verify(address, twin, { lowS: true }).should.equal(false)
    m.error.should.match(/canonical/)
    m.error.should.not.match(/did not match the message digest/)
  })

  it('refuses nothing sign() produces, which is why the option is safe to adopt', function () {
    // The whole argument for this being adoptable is that it is not a false reject. Measured
    // rather than asserted, across fresh keys and messages.
    for (var i = 0; i < 40; i++) {
      var k = bsv.PrivateKey.fromRandom()
      var a = k.toAddress().toString()
      var text = 'message number ' + i
      var sig = bsv.Message(text).sign(k)
      isHighS(sig).should.equal(false, 'sign() emitted high-s at iteration ' + i)
      bsv.Message(text).verify(a, sig, { lowS: true }).should.equal(true,
        'strict mode rejected a signature this library produced, at iteration ' + i)
    }
  })

  it('the static forwarder carries the option through', function () {
    // A delegating wrapper that silently drops an argument is how a signature change goes to
    // die: the documented call compiles, runs, and quietly does the old thing.
    bsv.Message.verify(message, address, twin).should.equal(true)
    bsv.Message.verify(message, address, twin, { lowS: true }).should.equal(false)
    bsv.Message.verify(message, address, signed, { lowS: true }).should.equal(true)
  })

  it('an explicit { lowS: false } behaves as the default rather than throwing', function () {
    bsv.Message(message).verify(address, twin, { lowS: false }).should.equal(true)
  })

  it('registers the behaviour change against 10.0.0, so the release ledger sees it', function () {
    var src = require('fs').readFileSync(require.resolve('../../lib/message/message.js'), 'utf8')
    src.should.match(/removeIn: '10\.0\.0'/)
    src.should.match(/high-s/)
  })

  describe('the notice fires on the accept, and only then', function () {
    // A warning naming a condition the caller does not have is noise, and noise gets silenced.
    // Observed on `deprecate.fired()`, which is the thing the notice actually writes to —
    // not on a count of console.warn calls, which any other deprecation in the process would
    // also move.
    var deprecate = require('../../lib/util/deprecate')
    var matching = function () {
      return deprecate.fired().filter(function (f) { return /high-s/.test(f.what) })
    }

    beforeEach(function () { deprecate.reset() })
    after(function () { deprecate.reset() })

    it('does not fire when a low-s signature verifies, however many times', function () {
      for (var i = 0; i < 5; i++) bsv.Message(message).verify(address, signed)
      matching().length.should.equal(0, 'a canonical signature raised the notice')
    })

    it('fires when a high-s signature is accepted, naming 10.0.0 and the option', function () {
      bsv.Message(message).verify(address, twin).should.equal(true)
      var f = matching()
      f.length.should.equal(1)
      f[0].removeIn.should.equal('10.0.0')
      f[0].use.should.match(/lowS/)
    })

    it('fires once per process, not once per call', function () {
      for (var i = 0; i < 4; i++) bsv.Message(message).verify(address, twin)
      matching().length.should.equal(1, 'the notice repeated')
    })

    it('does not fire when { lowS: true } refuses the signature', function () {
      // There is nothing to warn about: the caller already has the 10.0.0 behaviour.
      bsv.Message(message).verify(address, twin, { lowS: true }).should.equal(false)
      matching().length.should.equal(0)
    })
  })
})
