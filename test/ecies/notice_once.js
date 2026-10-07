'use strict'
/* global describe,it,beforeEach,afterEach */

// A library must not print on every call.
//
// decrypt() emitted `console.log('Notice: Overriding PublicKey in message…')` every time a caller
// had set `fixedPublicKey`, so a wallet decrypting a page of messages got one line per message on
// a channel it could not silence. Reported from production by the smartledger-wallet session,
// which had been seeing it and was not sure it was intended.
//
// The advice is worth giving once, so it now follows the same idiom as the interpreter's era hint:
// console.warn, once per process, with a documented switch and an env escape.

require('chai').should()
var bsv = require('../..')

describe('ECIES fixedPublicKey notice', function () {
  var warns, logs, realWarn, realLog

  beforeEach(function () {
    warns = []
    logs = []
    realWarn = console.warn
    realLog = console.log
    console.warn = function () { warns.push(Array.prototype.join.call(arguments, ' ')) }
    console.log = function () { logs.push(Array.prototype.join.call(arguments, ' ')) }
  })

  afterEach(function () {
    console.warn = realWarn
    console.log = realLog
    delete bsv.ECIES.notices
    delete process.env.BSV_NO_ECIES_NOTICE
  })

  function roundTrip (times) {
    var a = bsv.PrivateKey.fromRandom()
    var b = bsv.PrivateKey.fromRandom()
    var enc = new bsv.ECIES().privateKey(a).publicKey(b.toPublicKey()).encrypt('hello')
    var out = []
    for (var i = 0; i < times; i++) {
      out.push(new bsv.ECIES({ fixedPublicKey: true })
        .privateKey(b).publicKey(a.toPublicKey()).decrypt(enc).toString())
    }
    return out
  }

  it('never writes to console.log', function () {
    roundTrip(3)
    logs.should.deep.equal([])
  })

  it('still decrypts correctly every time', function () {
    roundTrip(3).should.deep.equal(['hello', 'hello', 'hello'])
  })

  it('is silenced by ECIES.notices = false', function () {
    bsv.ECIES.notices = false
    roundTrip(2)
    warns.join(' ').should.not.match(/fixedPublicKey/)
  })

  it('is silenced by BSV_NO_ECIES_NOTICE', function () {
    process.env.BSV_NO_ECIES_NOTICE = '1'
    roundTrip(2)
    warns.join(' ').should.not.match(/fixedPublicKey/)
  })
})

describe('ECDSA recovery-id search', function () {
  // calci() tries all four recovery ids; most do not yield a point, and the throw IS the signal
  // that an id is wrong. It printed those expected exceptions with console.error, so ordinary
  // message signing wrote stack traces to stderr.
  it('signs a message without writing expected failures to stderr', function () {
    var errs = []
    var real = console.error
    console.error = function () { errs.push(Array.prototype.join.call(arguments, ' ')) }
    try {
      var k = bsv.PrivateKey.fromRandom()
      var sig = bsv.Message('test').sign(k)
      bsv.Message('test').verify(k.toAddress(), sig).should.equal(true)
    } finally {
      console.error = real
    }
    errs.should.deep.equal([])
  })
})
