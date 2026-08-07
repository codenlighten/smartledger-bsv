'use strict'

/* global describe, it */

// Runtime half of a field review that found declarations disagreeing with the code.
// The declarations themselves are gated by dts_drift.js and by the tsc check in CI; the
// cases below are the ones where the RUNTIME also had to change, because a declaration
// that merely matched the old behaviour would have been documenting a bug.

var should = require('chai').should()
var bsv = require('../..')
var SC = bsv.SmartContract

describe('public surface tells the truth about itself', function () {
  describe('SmartContract.ownershipToken forwards its authorizer', function () {
    it('is not a two-argument alias that drops the third', function () {
      // The top-level alias took (fee, ownerPubKeyHash) and called through with only
      // those two, so a co-signed token built via this path came out single-key — the
      // authorizer was accepted and silently discarded.
      var auth = SC.Authorizers.multisig(2, 3)
      var withAuth = SC.ownershipToken(1, Buffer.alloc(20), auth).toHex()
      var without = SC.ownershipToken(1, Buffer.alloc(20)).toHex()
      withAuth.should.not.equal(without)
    })

    it('agrees with SmartContract.Token.ownershipToken', function () {
      var auth = SC.Authorizers.multisig(2, 3)
      SC.ownershipToken(1, Buffer.alloc(20), auth).toHex()
        .should.equal(SC.Token.ownershipToken(1, Buffer.alloc(20), auth).toHex())
    })
  })

  describe('Authorizers.multisig takes a key COUNT', function () {
    it('rejects an array of keys instead of silently building a broken authorizer', function () {
      // `m > nKeys` compared a number to an array, which coerces to NaN, so the guard
      // passed and the array was interpolated into the authorizer's name.
      var keys = [1, 2, 3].map(function () {
        return bsv.PrivateKey.fromRandom().toPublicKey().toBuffer()
      })
      ;(function () { SC.Authorizers.multisig(2, keys) }).should.throw(/NUMBER of keys/)
      // The message names the fix.
      ;(function () { SC.Authorizers.multisig(2, keys) }).should.throw(/pass 3 instead/)
    })

    it('still accepts the documented count form', function () {
      SC.Authorizers.multisig(2, 3).n.should.equal(3)
      SC.Authorizers.multisig(2, 3).m.should.equal(2)
    })

    it('rejects non-integer m', function () {
      (function () { SC.Authorizers.multisig('2', 3) }).should.throw(/m must be an integer/)
    })
  })

  describe('StatusList refuses to record a suspension as a revocation', function () {
    it('throws on status: suspended rather than setting the revocation bit', function () {
      // Both statuses set the SAME bit and read back as 'revoked', so a suspension was
      // silently recorded — and later reported — as a permanent revocation.
      return bsv.StatusList.updateStatusList({
        listVcJwt: 'x', index: 1, status: 'suspended', privateJwk: {}
      }).then(
        function () { throw new Error('should not have accepted suspended') },
        function (err) { err.message.should.match(/'suspended' is not supported/) }
      )
    })
  })

  describe('securityFeatures describes what is actually shipped', function () {
    it('no longer claims elliptic patches, since elliptic is not a dependency', function () {
      var pkg = require('../../package.json')
      var deps = Object.keys(pkg.dependencies || {})
      deps.indexOf('elliptic').should.equal(-1)
      bsv.securityFeatures.indexOf('elliptic-patches').should.equal(-1)
      bsv.securityFeatures.should.be.an('array')
      bsv.securityFeatures.length.should.be.above(0)
    })
  })

  describe('documented sub-path entry points resolve', function () {
    // Every one of these was MODULE_NOT_FOUND: the package `exports` map had no aliases
    // for the *-entry.js files, so a documented deep import could not be loaded at all.
    var SUBPATHS = ['didweb', 'vcjwt', 'gdaf', 'ltp', 'statuslist', 'shamir',
      'anchor', 'covenant', 'security', 'smartcontract', 'script-helper']

    SUBPATHS.forEach(function (name) {
      it('@smartledger/bsv/' + name, function () {
        var mod = require('@smartledger/bsv/' + name)
        // Some entry points export a class (a function), others a namespace object.
        var t = typeof mod
        t.should.be.oneOf(['object', 'function'])
        should.exist(mod)
      })
    })

    it('still resolves the package root and lib deep imports', function () {
      require('@smartledger/bsv').should.be.an('object')
      require('@smartledger/bsv/version').should.be.a('string')
      // Directory deep-imports need the explicit file — a documented 7.0 exports break.
      require('@smartledger/bsv/lib/ordinals/index.js').should.be.an('object')
    })
  })
})
