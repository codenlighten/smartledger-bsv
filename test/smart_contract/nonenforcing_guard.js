'use strict'

/* global describe, it */

// Phase 1 consolidation guard: the two NON-ENFORCING covenant builders
// (SmartContract.Covenant and SmartContract.Builder) reduce to plain P2PK and
// bind nothing about the spend. They must fail loud rather than silently hand back
// a fake covenant — callers are redirected to the enforcing OP_PUSH_TX API
// (policy() / PushTx / Token). Explicit { allowNonEnforcing: true } opts in.

require('chai').should()
var bsv = require('../..')
var SC = bsv.SmartContract
var PrivateKey = bsv.PrivateKey

describe('Non-enforcing covenant builders fail loud (Phase 1)', function () {
  var key = PrivateKey.fromRandom()

  it('SmartContract.Covenant.createFromP2PKH throws by default', function () {
    ;(function () {
      new SC.Covenant(key).createFromP2PKH({ satoshis: 1000, script: '00' })
    }).should.throw(/NON-ENFORCING|allowNonEnforcing/)
  })

  it('SmartContract.Builder.buildLockingScript throws by default but works with allowNonEnforcing', function () {
    ;(function () {
      new SC.Builder(key).buildLockingScript({})
    }).should.throw(/NON-ENFORCING|allowNonEnforcing/)

    var script = new SC.Builder(key, { allowNonEnforcing: true }).buildLockingScript({})
    script.toBuffer().length.should.be.greaterThan(0)
  })

  it('SmartContract.Builder.createCovenant throws by default', function () {
    ;(function () {
      new SC.Builder(key).createCovenant({ satoshis: 1000, script: '00' })
    }).should.throw(/NON-ENFORCING|allowNonEnforcing/)
  })

  it('the enforcing path (ordinalLock / valueCovenant) still produces scripts', function () {
    SC.ordinalLock(bsv.SmartContract.Token.ownerId(key)).toBuffer().length.should.be.greaterThan(0)
    SC.valueCovenant(Buffer.alloc(32)).toBuffer().length.should.be.greaterThan(0)
  })
})
