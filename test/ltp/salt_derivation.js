'use strict'
/* global describe, it */

// The salt is the only thing hiding a field a selective disclosure did NOT disclose. Before
// 9.34.0 it was `sha256(nonce + path + index)`, and the nonce ships inside the proof, so the
// salt of every field in the token — disclosed or not — could be recomputed by whoever held
// the proof. The Merkle path of a disclosed field carries its sibling hashes, and a depth-0
// sibling is an undisclosed field's leaf, so a candidate value could be hashed and compared.
//
// Measured on the published 9.33.2 artifact, not on this tree: an undisclosed date of birth
// came back inside 100,000 hashes (scripts/published-version-probes/ltp-salt-brute.js).
//
// What makes the first test below evidence rather than decoration is the second one: the same
// recovery, against the same library, succeeds when the master salt is guessable. A fix that
// merely renamed something would pass the first test and fail the second.

require('chai').should()
var LTP = require('../../lib/ltp/proof')
var LTPClass = require('../../lib/ltp/index')
var PRE_FIX = require('../fixtures/ltp-proof-pre-9.34.0.json')

var NONCE = 'abc123-a-nonce-long-enough-to-be-a-seed'
var SECRET_DOB = '1987-03-14'
var TOKEN = { claim: { name: 'Alice', dob: SECRET_DOB, ssn: '123-45-6789', city: 'Austin' } }
var GOOD_SEED = 'f'.repeat(64)

function disclose (paths, options) {
  var r = LTP.prepareSelectiveDisclosure(TOKEN, paths, NONCE, options)
  r.success.should.equal(true, 'setup: ' + r.error)
  return r.proof || r
}

// The attacker's side. Everything it touches is inside the proof or in the schema: nothing a
// holder would withhold, plus a list of master salts worth guessing.
function recoverDob (proof, seedGuesses) {
  var sib = proof.merkleProofs[0].proof[0].hash
  for (var s = 0; s < seedGuesses.length; s++) {
    for (var y = 1980; y <= 1999; y++) {
      for (var m = 1; m <= 12; m++) {
        for (var d = 1; d <= 31; d++) {
          var cand = y + '-' + ('0' + m).slice(-2) + '-' + ('0' + d).slice(-2)
          for (var i = 0; i < 4; i++) {
            var salt = LTP._deriveSalt(seedGuesses[s], 'claim.dob', i)
            if (LTP._hashField('claim.dob', cand, salt) === sib) return cand
          }
        }
      }
    }
  }
  return null
}

describe('LTP selective disclosure salts', function () {
  this.timeout(120000)

  describe('an undisclosed field cannot be recovered from the proof', function () {
    it('does not yield claim.dob to anything derivable from the proof', function () {
      var proof = disclose(['claim.name'])
      // Everything a holder could reach for: the nonce, the root, the disclosed salt.
      var guesses = [proof.nonce, proof.merkleRoot, proof.disclosures[0].salt, NONCE]
      ;(recoverDob(proof, guesses) === null).should.equal(true,
        'an undisclosed field was recovered from the proof alone')
    })

    it('does yield it when the master salt is guessable, so the recovery is real', function () {
      // The seed passes the length floor and is still in a dictionary. A floor on length is
      // not a measure of entropy, which is why this case exists and why the option is
      // documented as needing a CSPRNG.
      var weak = 'correct horse battery staple-aaaaa'
      var proof = disclose(['claim.name'], { saltSeed: weak })
      recoverDob(proof, ['password', weak, 'hunter2']).should.equal(SECRET_DOB)
    })

    it('does not put a disclosed field\'s salt within reach of the nonce', function () {
      var proof = disclose(['claim.name'])
      proof.disclosures[0].salt.should.not.equal(LTP._deriveSalt(NONCE, 'claim.name', 0))
    })
  })

  describe('the salt derivation is injective in (path, index)', function () {
    it('separates a path ending in a digit from the index that follows it', function () {
      // `nonce + path + index` gave path `a1` at index 2 and path `a` at index 12 the same
      // input bytes. The path is length-prefixed now.
      LTP._deriveSalt(GOOD_SEED, 'a1', 2).should.not.equal(LTP._deriveSalt(GOOD_SEED, 'a', 12))
      LTP._deriveSalt(GOOD_SEED, 'a', 1).should.not.equal(LTP._deriveSalt(GOOD_SEED, 'a1', ''))
    })

    it('depends on the master salt', function () {
      LTP._deriveSalt('a'.repeat(64), 'claim.x', 0)
        .should.not.equal(LTP._deriveSalt('b'.repeat(64), 'claim.x', 0))
    })
  })

  describe('the default salt is unpredictable', function () {
    it('gives two disclosures of one token different roots and different salts', function () {
      var a = disclose(['claim.name'])
      var b = disclose(['claim.name'])
      a.merkleRoot.should.not.equal(b.merkleRoot)
      a.disclosures[0].salt.should.not.equal(b.disclosures[0].salt)
    })

    it('leaves both of them verifying', function () {
      ;[disclose(['claim.name']), disclose(['claim.dob', 'claim.city'])].forEach(function (p) {
        var r = LTP.prepareSelectiveDisclosureVerification(p, NONCE)
        r.success.should.equal(true)
        r.verification.valid.should.equal(true, JSON.stringify(r.verification.errors))
      })
    })

    it('still refuses a value substituted for the one committed', function () {
      // The 9.32.0 domain check and the 9.34.0 salt must both hold at once.
      var p = disclose(['claim.dob'])
      p.disclosures[0].value = NaN
      LTP.prepareSelectiveDisclosureVerification(p, NONCE).verification.valid.should.equal(false)
    })
  })

  describe('a caller that needs a reproducible root can have one', function () {
    it('reproduces the root and the salts from its own secret seed', function () {
      var a = disclose(['claim.name'], { saltSeed: GOOD_SEED })
      var b = disclose(['claim.name'], { saltSeed: GOOD_SEED })
      a.merkleRoot.should.equal(b.merkleRoot)
      a.disclosures[0].salt.should.equal(b.disclosures[0].salt)
      LTP.prepareSelectiveDisclosureVerification(a, NONCE).verification.valid.should.equal(true)
    })

    it('refuses the nonce as the seed, which is published in the proof', function () {
      ;(function () {
        LTP.prepareSelectiveDisclosure(TOKEN, ['claim.name'], NONCE, { saltSeed: NONCE })
      }).should.throw(/must not be the nonce/)
    })

    it('refuses a seed too short to stand in for 32 random bytes', function () {
      ;[123, '', {}, true, 'a'.repeat(31)].forEach(function (bad) {
        ;(function () {
          LTP.prepareSelectiveDisclosure(TOKEN, ['claim.name'], NONCE, { saltSeed: bad })
        }).should.throw(/saltSeed/, 'accepted ' + JSON.stringify(bad) + ' as a seed')
      })
    })

    it('treats an absent, null or undefined seed as "generate one"', function () {
      ;[undefined, {}, { saltSeed: null }, { saltSeed: undefined }].forEach(function (opts) {
        var r = LTP.prepareSelectiveDisclosure(TOKEN, ['claim.name'], NONCE, opts)
        r.success.should.equal(true, JSON.stringify(opts))
      })
    })

    it('accepts exactly 32 characters, the floor', function () {
      var r = LTP.prepareSelectiveDisclosure(TOKEN, ['claim.name'], NONCE, { saltSeed: 'a'.repeat(32) })
      r.success.should.equal(true)
    })
  })

  describe('the class wrapper forwards the option', function () {
    // A delegating wrapper that drops a new argument is how the GDAF class API went inert for
    // four releases: the function had the parameter and no caller could reach it.
    it('reaches the seed through LTP#createSelectiveDisclosure', function () {
      var ltp = new LTPClass()
      var a = ltp.createSelectiveDisclosure(TOKEN, ['claim.name'], NONCE, { saltSeed: GOOD_SEED })
      var b = LTP.prepareSelectiveDisclosure(TOKEN, ['claim.name'], NONCE, { saltSeed: GOOD_SEED })
      ;(a.proof || a).merkleRoot.should.equal((b.proof || b).merkleRoot)
    })

    it('and still works without one', function () {
      var ltp = new LTPClass()
      var r = ltp.createSelectiveDisclosure(TOKEN, ['claim.name'], NONCE)
      var p = r.proof || r
      LTP.prepareSelectiveDisclosureVerification(p, NONCE).verification.valid.should.equal(true)
    })
  })

  describe('proofs already issued still verify', function () {
    // Not a reconstruction: this proof was minted by @smartledger/bsv@9.33.2 installed from the
    // registry, under the old nonce-derived salts, and committed as a fixture. A proof carries
    // its own root and its own disclosed salts, and verification re-derives neither, so the
    // change of derivation cannot reach it.
    it('accepts one minted by the published 9.33.2 artifact', function () {
      PRE_FIX._mintedBy.should.equal('9.33.2')
      var r = LTP.prepareSelectiveDisclosureVerification(PRE_FIX.proof, PRE_FIX._nonce)
      r.success.should.equal(true)
      r.verification.valid.should.equal(true, JSON.stringify(r.verification.errors))
      r.verification.disclosures.length.should.equal(2)
    })

    it('and its salts are the ones the old derivation produced', function () {
      // So the fixture is evidence about the old scheme, not about this one.
      var Hash = require('../../lib/crypto/hash')
      PRE_FIX.proof.disclosures[0].salt.should.equal(
        Hash.sha256(Buffer.from(PRE_FIX._nonce + 'claim.name' + 0)).toString('hex'))
    })
  })
})
