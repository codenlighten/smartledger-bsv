'use strict'

/* global describe, it */

// The honest holder's proof must verify for EVERY field, at every field count.
//
// It did not. `_buildMerkleTree` pairs a last odd node with ITSELF, and
// `_generateMerkleProof` pushed nothing for it, so the verifier skipped a level the builder
// had hashed. Measured on 9.31.0 with the correct root and an untampered proof:
//
//   3 fields -> f2 fails          6 fields -> f4 AND f5 fail
//   5 fields -> f4 fails          9 fields -> f8 fails
//
// so selective disclosure worked only when every level was even, i.e. a field count that is
// a power of two. The reason eleven existing tests passed over it: the fixture credential in
// test/gdaf/zk_prover.js has exactly 4 fields, and every selective-disclosure test discloses
// the SAME one of them. Coverage that varies neither the count nor the field cannot see this.
//
// So this file sweeps both axes, and keeps the negative controls alongside — a fix that made
// everything verify would be far worse than the bug.

require('chai').should()
var ZK = require('../../lib/gdaf/zk-prover')

var MASTER = 'aa'.repeat(16)

function credOf (n) {
  var c = {}
  for (var i = 0; i < n; i++) c['f' + i] = 'v' + i
  return c
}

describe('ZKProver selective disclosure at every field count', function () {
  this.timeout(30000)

  it('verifies every single-field disclosure for 1..40 fields', function () {
    var failures = []
    for (var n = 1; n <= 40; n++) {
      var cred = credOf(n)
      var root = ZK.createMerkleTree(cred, MASTER).root
      Object.keys(cred).forEach(function (p) {
        var r = ZK.verifySelectiveProof(ZK.generateSelectiveProof(cred, [p], MASTER), root)
        if (!r.valid) failures.push(n + ':' + p + ' [' + r.errors.join(';') + ']')
      })
    }
    failures.should.deep.equal([])
  })

  it('verifies the all-fields disclosure for 1..40 fields', function () {
    for (var n = 1; n <= 40; n++) {
      var cred = credOf(n)
      var root = ZK.createMerkleTree(cred, MASTER).root
      var r = ZK.verifySelectiveProof(
        ZK.generateSelectiveProof(cred, Object.keys(cred), MASTER), root)
      r.valid.should.equal(true, n + ' fields: ' + r.errors.join(';'))
      r.verifiedFields.length.should.equal(n)
    }
  })

  it('names the counts that used to fail, so a regression is unmistakable', function () {
    // The specific shapes measured above, called out individually.
    ;[[3, 'f2'], [5, 'f4'], [6, 'f4'], [6, 'f5'], [7, 'f6'], [9, 'f8']].forEach(function (pair) {
      var cred = credOf(pair[0])
      var root = ZK.createMerkleTree(cred, MASTER).root
      ZK.verifySelectiveProof(ZK.generateSelectiveProof(cred, [pair[1]], MASTER), root)
        .valid.should.equal(true, pair[0] + ' fields, disclosing ' + pair[1])
    })
  })

  describe('the fix must not have made everything verify', function () {
    var cred = credOf(3) // 3 fields: f2 is the self-paired node, the interesting one

    it('still rejects the wrong root', function () {
      ZK.verifySelectiveProof(ZK.generateSelectiveProof(cred, ['f2'], MASTER), '00'.repeat(32))
        .valid.should.equal(false)
    })

    it('still rejects a tampered self-pair step', function () {
      var root = ZK.createMerkleTree(cred, MASTER).root
      var p = ZK.generateSelectiveProof(cred, ['f2'], MASTER)
      p.merkleProofs[0].proof[0].hash = 'ff'.repeat(32)
      ZK.verifySelectiveProof(p, root).valid.should.equal(false)
    })

    it('still rejects a tampered disclosed value', function () {
      var root = ZK.createMerkleTree(cred, MASTER).root
      var p = ZK.generateSelectiveProof(cred, ['f2'], MASTER)
      p.disclosedFields[0].value = 'forged'
      ZK.verifySelectiveProof(p, root).valid.should.equal(false)
    })

    it('still rejects a dropped self-pair step — the bug itself, as a proof', function () {
      // Removing the step reproduces exactly what the generator used to emit.
      var root = ZK.createMerkleTree(cred, MASTER).root
      var p = ZK.generateSelectiveProof(cred, ['f2'], MASTER)
      p.merkleProofs[0].proof.shift()
      ZK.verifySelectiveProof(p, root).valid.should.equal(false)
    })
  })

  describe('the roots did not move', function () {
    // The fix is confined to proof GENERATION, deliberately: the self-pair step is encoded as
    // the node's own hash in the sibling position, which `_verifyMerkleProof` already handled
    // for `isLeft: false`. So the VERIFIER is untouched, every proof an older verifier
    // accepted it still accepts, and no root moves. Had a root moved, every credential
    // already issued would have stopped verifying — much more expensive than the bug.
    //
    // These digests were read out of the PRE-FIX 9.31.0 builder, so they are evidence about
    // the past, not a restatement of present behaviour.
    var PRE_FIX_ROOTS = {
      1: 'e592cfa859a12dede944c7890c0e2bc544e0fc783af929ab67f5ae0b9e91c2c8',
      2: 'ecc1d2f63b84840511e84f6e7e052eb310e330a0d3c4e51dd492e9f2cfd60013',
      3: '59c53bf1364c63a741b6c2af05129515fe5b44a48b6c3edd82c397ae630df48b',
      4: 'b628c89879b7851a63ae19c4049218c3d23729f21fdfe56c05e1517cf32fe66f',
      5: 'affe34317346826465f4ad1f14845f9c7ca67e4d133e16bc42163e20c02b7d7c',
      6: '01c1235cdade990abbfe8aacbecc2d257bcf732dfd3849d34c9ef2a2b5aebf97',
      7: '352ff8fd279e1647ca1df9a38bc8f1f23b03c808c53fd5c353fb604173356a5c',
      8: 'd0971d800a3e386433c40cd91d394d9d55d273d330e5f0b2eb6d268b697292ad',
      9: '99aab2f52f48df04ecd7a79c2b481ee6b45b13f4cdc75bfb6978311f2576670a'
    }

    it('reproduces the pre-fix root at every count, including the odd ones', function () {
      Object.keys(PRE_FIX_ROOTS).forEach(function (n) {
        ZK.createMerkleTree(credOf(parseInt(n, 10)), MASTER).root
          .should.equal(PRE_FIX_ROOTS[n], n + ' fields')
      })
    })

    it('reproduces the pre-fix root for the library fixture', function () {
      ZK.createMerkleTree({
        id: 'urn:x',
        credentialSubject: { name: 'Alice', partyAffiliation: 'DEM', eligible: true }
      }, MASTER).root.should.equal(
        '6b2bf2d8f9341c08df03664f5959dff8d687e49d274135d18d8aad0aa917615e')
    })
  })
})
