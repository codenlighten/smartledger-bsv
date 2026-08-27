'use strict'

require('chai').should()

var bsv = require('../..')
var JCS = require('../../lib/util/jcs')
var deprecate = require('../../lib/util/deprecate')

var Claim = bsv.LTP.Claim
var JCS_FORM = Claim.CANONICALIZATION.JCS
var LEGACY = Claim.CANONICALIZATION.LEGACY

/**
 * LTP claim canonicalization.
 *
 * The legacy form sorts keys and then rebuilds the object, which loses the sort for
 * integer-like keys. It is deterministic, so nothing already hashed is wrong or
 * forgeable — but it is not RFC 8785, so an implementation in any other language
 * computes a different claim hash and cannot check ours.
 *
 * STABILITY.md commits 9.x through 2027-09-01, so the default cannot change here.
 * It stays LEGACY and warns; 10.0.0 flips it. These tests pin both halves of that,
 * because the value of the promise is entirely in it being kept.
 */
describe('LTP claim canonicalization', function () {
  // The claim that discriminates the two forms. Integer-like keys are ordinary in
  // claim data — lot numbers, unit numbers, years.
  var claim = { 2: 'two', 10: 'ten', name: 'x' }

  var warned

  beforeEach(function () {
    deprecate.reset()
    warned = []
    this.origWarn = console.warn
    console.warn = function (m) { warned.push(m) }
  })

  afterEach(function () {
    console.warn = this.origWarn
    deprecate.reset()
  })

  describe('the two forms differ, which is the whole point', function () {
    it('legacy rebuilds the object and loses the sort', function () {
      Claim.canonicalize(claim, LEGACY).should.equal('{"2":"two","10":"ten","name":"x"}')
    })

    it('jcs serializes in sorted order and keeps it', function () {
      Claim.canonicalize(claim, JCS_FORM).should.equal('{"10":"ten","2":"two","name":"x"}')
    })

    it('jcs agrees with the standalone canonicalizer', function () {
      Claim.canonicalize(claim, JCS_FORM).should.equal(JCS.stringify(claim))
    })

    it('the forms agree when no key is integer-like', function () {
      // Which is why this went unnoticed: almost all real claims are unaffected.
      var plain = { b: 1, a: 2, c: { z: 3, y: 4 } }
      Claim.canonicalize(plain, LEGACY).should.equal(Claim.canonicalize(plain, JCS_FORM))
    })

    it('hash follows canonicalize', function () {
      Claim.hash(claim, JCS_FORM).should.not.equal(Claim.hash(claim, LEGACY))
      Claim.hash(claim, JCS_FORM).should.match(/^[0-9a-f]{64}$/)
    })
  })

  describe('the 9.x default is unchanged', function () {
    it('canonicalize with no argument still returns the legacy bytes', function () {
      Claim.canonicalize(claim).should.equal(Claim.canonicalize(claim, LEGACY))
    })

    it('hash with no argument still returns the legacy hash', function () {
      Claim.hash(claim).should.equal(Claim.hash(claim, LEGACY))
    })

    it('the top-level wrappers pass the argument through', function () {
      bsv.canonicalizeClaim(claim, JCS_FORM).should.equal(JCS.stringify(claim))
      bsv.hashClaim(claim, JCS_FORM).should.equal(Claim.hash(claim, JCS_FORM))
    })

    it('the top-level wrappers default to legacy too', function () {
      bsv.canonicalizeClaim(claim).should.equal(Claim.canonicalize(claim, LEGACY))
    })
  })

  describe('the default is deprecated, not changed', function () {
    it('warns when no canonicalization is given, naming replacement and removal', function () {
      Claim.canonicalize(claim)
      warned.length.should.equal(1)
      warned[0].should.match(/LTP\.Claim\.canonicalize/)
      warned[0].should.match(/CANONICALIZATION\.JCS/)
      warned[0].should.match(/10\.0\.0/)
    })

    it('warns once per process, not once per call', function () {
      Claim.canonicalize(claim)
      Claim.canonicalize(claim)
      Claim.canonicalize(claim)
      warned.length.should.equal(1)
    })

    it('does not warn when the caller has chosen explicitly', function () {
      Claim.canonicalize(claim, LEGACY)
      Claim.canonicalize(claim, JCS_FORM)
      warned.should.deep.equal([])
    })

    it('never throws — a deprecation that throws is a breaking change', function () {
      ;(function () { Claim.canonicalize(claim) }).should.not.throw()
    })

    it('records the notice for tooling', function () {
      Claim.hash(claim)
      var fired = deprecate.fired().filter(function (f) {
        return f.what.indexOf('LTP.Claim.hash') === 0
      })
      fired.length.should.equal(1)
      fired[0].removeIn.should.equal('10.0.0')
      fired[0].since.should.equal('9.2.0')
    })
  })

  describe('an unrecognised form is refused', function () {
    it('throws rather than silently falling back to legacy', function () {
      // A typo that quietly produced differently-hashed claims would recreate the
      // exact failure this change exists to remove.
      ;(function () { Claim.canonicalize(claim, 'JCS') }).should.throw(/Unknown canonicalization/)
      ;(function () { Claim.canonicalize(claim, 'rfc8785') }).should.throw(/Unknown canonicalization/)
    })

    it('names the accepted values', function () {
      ;(function () { Claim.canonicalize(claim, 'nope') }).should.throw(/'jcs' or 'legacy'/)
    })

    it('still rejects a non-object claim', function () {
      ;(function () { Claim.canonicalize(null, JCS_FORM) }).should.throw(/Invalid claim/)
    })
  })

  describe('stored hashes are pinned, not silently migrated', function () {
    // prepareClaimValidation / prepareClaimAttestation / prepareClaimDispute emit
    // hashes that callers store as identifiers, and those callers cannot pass a
    // canonicalization. They stay on legacy for all of 9.x so no stored identifier
    // moves under anyone.
    var integerKeyed = {
      propertyId: 'p1',
      address: { street: 's', city: 'c', state: 'st', country: 'co' },
      ownershipType: 'fee_simple',
      2: 'a',
      10: 'b'
    }

    it('prepareClaimValidation keeps emitting the legacy canonical form', function () {
      var res = bsv.LTP.Claim.prepareClaimValidation(integerKeyed, 'PropertyTitle')
      res.success.should.equal(true)
      res.validation.canonical.should.equal(Claim.canonicalize(integerKeyed, LEGACY))
      res.validation.claimHash.should.equal(Claim.hash(integerKeyed, LEGACY))
    })

    it('does not warn for paths the caller cannot control', function () {
      // A warning telling you to pass an argument to a function you did not call is
      // noise. The 10.0.0 move for these paths is documented in the CHANGELOG.
      bsv.LTP.Claim.prepareClaimValidation(integerKeyed, 'PropertyTitle')
      warned.should.deep.equal([])
    })
  })
})
