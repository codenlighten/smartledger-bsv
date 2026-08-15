'use strict'

/* global describe, it */

// This module had ZERO test coverage, and carried three defects that coverage would have
// caught immediately. Each is pinned below as the attack that worked, not as a paraphrase
// of the fix, so a regression reproduces the exploit rather than merely failing a check.
//
// It is also not zero-knowledge, and the tests say so where it matters: the range and age
// commitments can only be verified by opening them, which reveals the committed value.

require('chai').should()
var bsv = require('../..')
var ZK = require('../../lib/gdaf/zk-prover')
var Hash = require('../../lib/crypto/hash')

var CRED = {
  id: 'urn:x',
  credentialSubject: { name: 'Alice', partyAffiliation: 'DEM', eligible: true }
}

describe('ZKProver', function () {
  describe('range proofs', function () {
    // The original read `return proof.inRange === true` — a boolean the prover writes
    // about itself. valueCommitment was never consulted, so this forgery verified.
    it('rejects a forged proof that merely claims inRange', function () {
      var forged = {
        type: 'RangeProof',
        range: { min: 18, max: 120 },
        valueCommitment: '00'.repeat(32),
        proofHash: 'de'.repeat(32),
        inRange: true
      }
      ZK.verifyRangeProof(forged, 18, 120).should.equal(false)
    })

    it('rejects an honest proof presented without its opening', function () {
      var proof = ZK.generateRangeProof(41, 18, 120)
      ZK.verifyRangeProof(proof, 18, 120).should.equal(false)
    })

    it('accepts an honest proof with its opening', function () {
      var proof = ZK.generateRangeProof(41, 18, 120)
      ZK.verifyRangeProof(proof, 18, 120, proof.opening).should.equal(true)
    })

    // The commitment must actually bind the value: a lie about what was committed to
    // has to fail even though the range and structure are right.
    it('rejects an opening that does not match the commitment', function () {
      var proof = ZK.generateRangeProof(41, 18, 120)
      var lie = { value: 12, salt: proof.opening.salt }
      ZK.verifyRangeProof(proof, 18, 120, lie).should.equal(false)
    })

    it('rejects a value outside the stated range even if the commitment opens', function () {
      var proof = ZK.generateRangeProof(41, 18, 120)
      ZK.verifyRangeProof(proof, 50, 120, proof.opening).should.equal(false)
    })

    it('returns a strict boolean', function () {
      var proof = ZK.generateRangeProof(41, 18, 120)
      ZK.verifyRangeProof(proof, 18, 120, proof.opening).should.be.a('boolean')
      ZK.verifyRangeProof({}, 18, 120).should.be.a('boolean')
    })
  })

  describe('age proofs', function () {
    var BIRTH = new Date('1985-01-01T00:00:00Z')

    it('rejects a forged proof that merely claims meetsRequirement', function () {
      var forged = {
        type: 'AgeProof',
        minimumAge: 18,
        meetsRequirement: true,
        birthDateCommitment: '00'.repeat(32),
        challengeResponse: 'anything-non-empty'
      }
      ZK.verifyAgeProof(forged, 18).should.equal(false)
    })

    it('rejects an honest proof presented without its opening', function () {
      var proof = ZK.generateAgeProof(BIRTH, 18)
      ZK.verifyAgeProof(proof, 18).should.equal(false)
    })

    it('accepts an honest proof with its opening', function () {
      var proof = ZK.generateAgeProof(BIRTH, 18)
      ZK.verifyAgeProof(proof, 18, proof.opening).should.equal(true)
    })

    it('rejects an opening that does not match the commitment', function () {
      var proof = ZK.generateAgeProof(BIRTH, 18)
      ZK.verifyAgeProof(proof, 18, { birthDate: '2015-01-01', salt: proof.opening.salt })
        .should.equal(false)
    })
  })

  describe('selective disclosure', function () {
    // THE LEAK. One salt covered every leaf and travelled in the proof, so the sibling
    // hashes on the Merkle path could be brute-forced back into the withheld fields.
    // Disclosing only the name recovered id, partyAffiliation and eligible.
    it('does not leak the withheld fields to someone holding the proof', function () {
      var proof = ZK.generateSelectiveProof(CRED, ['credentialSubject.name'], 'aa'.repeat(16))

      // Everything an attacker gets: the proof's salts and the Merkle path.
      var salts = proof.disclosedFields.map(function (f) { return f.salt })
      var siblings = []
      proof.merkleProofs.forEach(function (mp) {
        mp.proof.forEach(function (n) { siblings.push(n.hash) })
      })

      function leaf (p, v, s) {
        return Hash.sha256(Buffer.from(p + ':' + JSON.stringify(v) + ':' + s, 'utf8')).toString('hex')
      }
      function node (a, b) {
        return Hash.sha256(Buffer.from(a + b, 'hex')).toString('hex')
      }

      var paths = ['id', 'credentialSubject.partyAffiliation', 'credentialSubject.eligible']
      var values = ['urn:x', 'DEM', 'REP', 'IND', true, false]
      var recovered = []

      salts.forEach(function (s) {
        // Direct leaf siblings.
        paths.forEach(function (p) {
          values.forEach(function (v) {
            if (siblings.indexOf(leaf(p, v, s)) !== -1) recovered.push(p)
          })
        })
        // Internal nodes: brute-force the pair beneath them.
        paths.forEach(function (p1) {
          values.forEach(function (v1) {
            paths.forEach(function (p2) {
              values.forEach(function (v2) {
                if (siblings.indexOf(node(leaf(p1, v1, s), leaf(p2, v2, s))) !== -1) {
                  recovered.push(p1, p2)
                }
              })
            })
          })
        })
      })

      recovered.should.deep.equal([], 'recovered withheld fields: ' + recovered.join(', '))
    })

    it('never ships the master salt, which would reopen every leaf', function () {
      var proof = ZK.generateSelectiveProof(CRED, ['credentialSubject.name'], 'aa'.repeat(16))
      ;(proof.salt === undefined).should.equal(true)
    })

    // The generated salt used to be dropped on the floor: the proof returned the
    // (undefined) `salt` ARGUMENT rather than the one createMerkleTree produced, so a
    // proof made without an explicit salt could never verify.
    it('verifies a proof generated without an explicit salt', function () {
      var proof = ZK.generateSelectiveProof(CRED, ['credentialSubject.name'])
      var result = ZK.verifySelectiveProof(proof, proof.credentialRoot)
      result.valid.should.equal(true, JSON.stringify(result.errors))
    })

    it('verifies a proof generated with an explicit salt', function () {
      var proof = ZK.generateSelectiveProof(CRED, ['credentialSubject.name'], 'aa'.repeat(16))
      ZK.verifySelectiveProof(proof, proof.credentialRoot).valid.should.equal(true)
    })

    it('rejects a tampered disclosed value', function () {
      var proof = ZK.generateSelectiveProof(CRED, ['credentialSubject.name'], 'aa'.repeat(16))
      proof.disclosedFields[0].value = 'Mallory'
      ZK.verifySelectiveProof(proof, proof.credentialRoot).valid.should.equal(false)
    })

    it('rejects a proof checked against the wrong root', function () {
      var proof = ZK.generateSelectiveProof(CRED, ['credentialSubject.name'], 'aa'.repeat(16))
      ZK.verifySelectiveProof(proof, '00'.repeat(32)).valid.should.equal(false)
    })

    it('rejects a field whose salt has been stripped', function () {
      var proof = ZK.generateSelectiveProof(CRED, ['credentialSubject.name'], 'aa'.repeat(16))
      delete proof.disclosedFields[0].salt
      ZK.verifySelectiveProof(proof, proof.credentialRoot).valid.should.equal(false)
    })

    // Deterministic trees are still available for callers that need them, without the
    // single-salt weakness that made them dangerous.
    it('is deterministic given the same master salt', function () {
      var a = ZK.generateSelectiveProof(CRED, ['credentialSubject.name'], 'bb'.repeat(16))
      var b = ZK.generateSelectiveProof(CRED, ['credentialSubject.name'], 'bb'.repeat(16))
      a.credentialRoot.should.equal(b.credentialRoot)
    })

    it('gives different roots for different master salts', function () {
      var a = ZK.generateSelectiveProof(CRED, ['credentialSubject.name'], 'bb'.repeat(16))
      var b = ZK.generateSelectiveProof(CRED, ['credentialSubject.name'], 'cc'.repeat(16))
      a.credentialRoot.should.not.equal(b.credentialRoot)
    })
  })

  // The module is reachable from the public GDAF surface, so the fixes above are not
  // internal-only.
  it('is exposed on the GDAF instance', function () {
    var g = new bsv.GDAF()
    ;(typeof g.zkProver.verifyRangeProof).should.equal('function')
  })
})
