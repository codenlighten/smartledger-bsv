'use strict'

/* global describe, it */

require('chai').should()
var expect = require('chai').expect

var bsv = require('../../index.js')

var UUID_V4 = /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/

// A token id is covered by the credential's signature, keys the registry's
// registration/revocation maps, and feeds proof material — so it must be
// unpredictable, not merely distinct.
describe('LTP identifiers', function () {
  var generators = [
    { name: 'Right._generateUUID', fn: function () { return bsv.LTP.Right._generateUUID() }, format: UUID_V4 },
    { name: 'Obligation._generateUUID', fn: function () { return bsv.LTP.Obligation._generateUUID() }, format: UUID_V4 },
    { name: 'Registry._generateRegistryId', fn: function () { return bsv.LTP.Registry._generateRegistryId() }, format: /^reg_[0-9a-f]{16}$/ },
    { name: 'Registry._generateAuditId', fn: function () { return bsv.LTP.Registry._generateAuditId() }, format: /^audit_[0-9a-f]{12}$/ },
    { name: 'Claim._generateBatchId', fn: function () { return bsv.LTP.Claim._generateBatchId() }, format: /^[0-9a-f]{16}$/ }
  ]

  var withFrozenMathRandom = function (fn) {
    var original = Math.random
    Math.random = function () { return 0.5 }
    try { return fn() } finally { Math.random = original }
  }

  generators.forEach(function (g) {
    describe(g.name, function () {
      it('keeps its documented format', function () {
        g.fn().should.match(g.format)
      })

      it('does not repeat', function () {
        var seen = {}
        for (var i = 0; i < 500; i++) {
          var id = g.fn()
          expect(seen[id], 'duplicate id: ' + id).to.equal(undefined)
          seen[id] = true
        }
      })

      it('does not draw from the engine PRNG', function () {
        withFrozenMathRandom(function () {
          var seen = {}
          for (var i = 0; i < 100; i++) {
            var id = g.fn()
            expect(seen[id], 'id is predictable from the engine PRNG: ' + id).to.equal(undefined)
            seen[id] = true
          }
        })
      })
    })
  })

  it('issues unpredictable ids on real tokens', function () {
    var type = Object.values(bsv.LTP.Right.RightTypes)[0]
    var ids = {}
    for (var i = 0; i < 25; i++) {
      var token = bsv.LTP.Right.create(
        type,
        'did:example:issuer',
        'did:example:subject',
        { description: 'test right' }
      )
      token.id.should.match(/^urn:uuid:/)
      token.id.replace('urn:uuid:', '').should.match(UUID_V4)
      expect(ids[token.id], 'duplicate token id').to.equal(undefined)
      ids[token.id] = true
    }
  })
})
