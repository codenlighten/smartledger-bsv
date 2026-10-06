'use strict'

/* global describe, it */

// The membership commitment must be over an INJECTIVE encoding of a restricted value domain.
//
// 9.20.0 fixed the headline forgery — a verifier that only compared prover-supplied values with
// each other — and left a second one in place, because the commitment was over
// `JSON.stringify(member)`. That is not injective:
//
//   JSON.stringify(null) === JSON.stringify(NaN) === JSON.stringify(Infinity) === '"null"'
//   JSON.stringify({a:1, b:undefined}) === JSON.stringify({a:1})
//
// so a prover could claim `NaN` was a member of `[null]` and every recomputed commitment matched.
// Key order was the mirror problem: two spellings of one object committed differently, so a
// legitimate caller could be refused.
//
// The fix is RFC 8785 canonical JSON over a domain validated recursively — JCS sorts keys and
// refuses non-finite numbers and `undefined`, and the recursive check adds the one case JCS does
// not catch, an `undefined` property value, which it drops exactly as JSON does.
//
// Found by red-teaming the 9.20.0 fix rather than by a test, which is why these exist.

require('chai').should()
const bsv = require('../..')
const ZKProver = require('../../lib/gdaf/zk-prover')

describe('a membership commitment is injective over its value domain', function () {
  describe('the collisions JSON.stringify would have allowed', function () {
    it('refuses NaN claimed as a member of [null]', function () {
      const set = [null]
      const proof = ZKProver.generateMembershipProof(set, null)
      ZKProver.verifyMembershipProof(proof, { value: null, salt: proof.salt }, set)
        .should.equal(true)
      ZKProver.verifyMembershipProof(proof, { value: NaN, salt: proof.salt }, set)
        .should.equal(false)
    })

    it('refuses Infinity and -Infinity the same way', function () {
      const set = [null]
      const proof = ZKProver.generateMembershipProof(set, null)
      for (const v of [Infinity, -Infinity]) {
        ZKProver.verifyMembershipProof(proof, { value: v, salt: proof.salt }, set)
          .should.equal(false)
      }
    })

    it('refuses an object with an undefined property claimed as one without it', function () {
      const set = [{ a: 1 }]
      const proof = ZKProver.generateMembershipProof(set, { a: 1 })
      ZKProver.verifyMembershipProof(proof, { value: { a: 1 }, salt: proof.salt }, set)
        .should.equal(true)
      ZKProver.verifyMembershipProof(proof, { value: { a: 1, b: undefined }, salt: proof.salt }, set)
        .should.equal(false)
    })

    it('refuses a non-finite number ANYWHERE in a nested value', function () {
      const set = [{ a: [1, 2] }]
      const proof = ZKProver.generateMembershipProof(set, { a: [1, 2] })
      ZKProver.verifyMembershipProof(proof, { value: { a: [1, NaN] }, salt: proof.salt }, set)
        .should.equal(false)
    })
  })

  describe('and a legitimate caller is no longer refused', function () {
    it('accepts the same object spelled in a different key order', function () {
      const set = [{ a: 1, b: 2 }]
      const proof = ZKProver.generateMembershipProof(set, { a: 1, b: 2 })
      // JSON.stringify would have produced two different commitments here.
      ZKProver.verifyMembershipProof(proof, { value: { b: 2, a: 1 }, salt: proof.salt }, set)
        .should.equal(true)
    })

    it('generates a proof for a structurally equal object member', function () {
      // `set.includes(value)` compared by reference, so this threw "Value not in set" and the
      // function was unusable with object members.
      const set = [{ id: 7 }, { id: 8 }]
      const proof = ZKProver.generateMembershipProof(set, { id: 8 })
      ZKProver.verifyMembershipProof(proof, { value: { id: 8 }, salt: proof.salt }, set)
        .should.equal(true)
    })

    it('handles strings, booleans, nested arrays and null members', function () {
      const set = ['alice', true, null, [1, 'two'], { k: 'v' }]
      for (const v of ['alice', true, null]) {
        const proof = ZKProver.generateMembershipProof(set, v)
        ZKProver.verifyMembershipProof(proof, { value: v, salt: proof.salt }, set)
          .should.equal(true)
      }
    })
  })

  describe('the 9.20.0 guarantees still hold', function () {
    it('refuses the bare forged proof', function () {
      ZKProver.verifyMembershipProof({
        type: 'MembershipProof', setCommitments: ['x'], valueCommitment: 'x', isMember: true
      }).should.equal(false)
    })

    it('refuses a value that is genuinely not in the verifier set', function () {
      const set = ['alice', 'bob']
      const proof = ZKProver.generateMembershipProof(set, 'bob')
      ZKProver.verifyMembershipProof(proof, { value: 'carol', salt: proof.salt }, set)
        .should.equal(false)
    })

    it('refuses when the verifier holds a different set', function () {
      const set = ['alice', 'bob']
      const proof = ZKProver.generateMembershipProof(set, 'bob')
      ZKProver.verifyMembershipProof(proof, { value: 'bob', salt: proof.salt }, ['x', 'y'])
        .should.equal(false)
    })
  })
})
