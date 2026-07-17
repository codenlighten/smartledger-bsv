'use strict'

/* global describe, it */

require('chai').should()
var expect = require('chai').expect

var Id = require('../../lib/util/id')

var UUID_V4 = /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/

describe('util/id', function () {
  describe('#uuid4', function () {
    it('produces a well-formed RFC 4122 v4 uuid', function () {
      Id.uuid4().should.match(UUID_V4)
    })

    it('sets the version and variant bits on every draw', function () {
      for (var i = 0; i < 200; i++) {
        Id.uuid4().should.match(UUID_V4)
      }
    })

    it('does not repeat', function () {
      var seen = {}
      for (var i = 0; i < 2000; i++) {
        var id = Id.uuid4()
        expect(seen[id], 'duplicate uuid: ' + id).to.equal(undefined)
        seen[id] = true
      }
    })
  })

  describe('#randomHex', function () {
    it('returns the requested number of hex characters', function () {
      Id.randomHex(16).should.match(/^[0-9a-f]{16}$/)
      Id.randomHex(12).should.match(/^[0-9a-f]{12}$/)
      Id.randomHex(1).should.match(/^[0-9a-f]$/)
    })

    it('does not repeat', function () {
      var seen = {}
      for (var i = 0; i < 2000; i++) {
        var id = Id.randomHex(16)
        expect(seen[id], 'duplicate id: ' + id).to.equal(undefined)
        seen[id] = true
      }
    })
  })

  describe('entropy source', function () {
    // Identifiers must come from the CSPRNG. Freezing the engine PRNG must not
    // affect them; if it does, they are predictable from observed output.
    var withFrozenMathRandom = function (fn) {
      var original = Math.random
      Math.random = function () { return 0.5 }
      try { return fn() } finally { Math.random = original }
    }

    it('uuid4 is unaffected by the engine PRNG', function () {
      withFrozenMathRandom(function () {
        Id.uuid4().should.not.equal(Id.uuid4())
      })
    })

    it('randomHex is unaffected by the engine PRNG', function () {
      withFrozenMathRandom(function () {
        Id.randomHex(16).should.not.equal(Id.randomHex(16))
      })
    })
  })
})
