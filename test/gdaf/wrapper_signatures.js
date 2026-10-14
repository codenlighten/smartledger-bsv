'use strict'
/* global describe,it */

// The GDAF class exposes "Direct Access Methods (for easier developer experience)" that forward
// to the ZKProver module. Those wrappers drifted from the module they delegate to and nothing
// caught it, because every proof test called the module directly.
//
// Two drifts had shipped, and they are DIFFERENT IN KIND. The distinction was measured against
// the published artifacts (9.16.1, 9.19.0, 9.20.0, 9.22.0, 9.22.1 installed from the registry),
// not read off the diff, and the first description of it here was wrong in both directions.
//
//   DROPPED ARGUMENTS — inert for every caller, because the argument never reaches the module:
//     verifyMembershipProof: wrapper (proof, validSet) -> module (proof, opening, set) from
//       9.20.0, so the module got `set` as undefined and answered false for EVERY proof.
//     verifyRangeProof: wrapper (proof, min, max) -> module (proof, min, max, opening). The
//       module has taken `opening` since 8.2.0, NOT since 9.20.0 as first written here, so the
//       class-path range verifier answered false for every proof across a much longer window.
//
//   MISNAMED ARGUMENTS — forwarded positionally and intact, so the behaviour depends on what
//   the caller passed rather than on the wrapper:
//     generateMembershipProof: wrapper (value, validSet, nonce) -> module (set, value, salt).
//       A caller following the wrapper's names got "Set must be array"; a caller passing the
//       module's order got a real proof. Measured: `g.generateMembershipProof(set, value)`
//       returns a MembershipProof at 9.20.0 through 9.22.1. So "no proof could be generated
//       through the class at any version" was false — it was false for the DOCUMENTED call.
//     verifyAgeProof: the third parameter was named and typed `issuerDID` while the module
//       reads that position as `opening`. A caller following the docs passed a string and got
//       false; a caller passing an opening object got a correct true.
//
// Nothing was accepted that should have been refused, in either group, measured on each of
// those artifacts with a positive control. But the reason differs: the dropped-argument pair
// cannot be called correctly at all, while the misnamed pair are safe only because the module
// refuses the WRONG-TYPED value that the documentation told callers to pass.
//
// Which is why the first test — the general guard — compares every delegating wrapper to its
// target BY PARAMETER NAME rather than by arity. Arity would have caught only the dropped pair;
// the two misnamed drifts forward the right number of arguments and are invisible to it.

require('chai').should()
var fs = require('fs')
var path = require('path')
var bsv = require('../..')

// Parse `Name.prototype.x = function (a, b)` / `Obj.x = function (a, b)` into {name: [params]}.
function declaredParams (file, re) {
  var src = fs.readFileSync(path.join(__dirname, '..', '..', file), 'utf8')
  var out = {}
  var m
  while ((m = re.exec(src)) !== null) {
    out[m[1]] = m[2].split(',').map(function (s) { return s.trim() }).filter(Boolean)
  }
  return out
}

// The body of one assignment, up to the next line that closes it at column 0.
function bodyOf (src, decl) {
  var i = src.indexOf(decl)
  if (i < 0) return ''
  var end = src.indexOf('\n}', i)
  return src.slice(i, end < 0 ? src.length : end)
}

// EVERY GDAF method that delegates to the module, by searching for the delegation itself
// rather than for one syntactic shape of it. The first version of this guard matched only
// `function (...) { return this.zkProver.x(...) }` on a single line, so `generateAgeProof`
// — whose body had three lines and a hardcoded date — was never examined, and the count
// assertion (`above(5)`) passed at 7 of 8. A guard that silently skips the one method that
// does something unusual is worse than no guard: it reports success over a partial view.
// Hence `accountedFor` below, which fails if any delegating method goes uninspected.
// Returns BOTH the methods whose delegation could be read and the ones that merely mention
// the module. The split matters: a method in `unreadable` is one this guard cannot check, and
// the test below FAILS on it rather than passing over it. A first attempt at the no-skip
// assertion used the same narrow pattern as the parser it was meant to audit, so a delegation
// written as `zk.generateAgeProof.apply(zk, args)` escaped both — the check could not see the
// blind spot it existed to find. Detection is therefore by the loose `zkProver` mention and
// parsing is the strict step, never the other way round.
function delegating () {
  var src = fs.readFileSync(path.join(__dirname, '..', '..', 'lib', 'gdaf', 'index.js'), 'utf8')
  var params = declaredParams('lib/gdaf/index.js', /GDAF\.prototype\.(\w+)\s*=\s*function\s*\(([^)]*)\)/g)
  var readable = []
  var unreadable = []
  Object.keys(params).forEach(function (name) {
    var body = bodyOf(src, 'GDAF.prototype.' + name + ' = function')
    // `this.zkProver`, with no trailing dot required: that is what catches a delegation
    // routed through a local alias. A bare `zkProver` would also match `getInfo`, which
    // merely names the component in a description object.
    if (!/this\.zkProver\b/.test(body)) return
    var call = /this\.zkProver\.(\w+)\(([^)]*\)?[^)]*)\)/.exec(body)
    if (!call) { unreadable.push(name); return }
    readable.push({
      name: name,
      declares: params[name],
      target: call[1],
      forwards: call[2].split(/,(?![^(]*\))/).map(function (s) { return s.trim() }).filter(Boolean)
    })
  })
  return { readable: readable, unreadable: unreadable }
}

function moduleParams () {
  return declaredParams('lib/gdaf/zk-prover.js', /ZKProver\.(\w+)\s*=\s*function\s*\(([^)]*)\)/g)
}

// A wrapper may transform an argument, but only where this test says so and says exactly how.
// That keeps a deliberate coercion from looking like drift AND keeps drift from hiding behind
// "it's probably deliberate".
var ALLOWED_COERCIONS = {
  // Refuses a credential and strictly parses a date. The argument it stands in for is the
  // module's `birthDate`, and the whole point is that the old code passed neither.
  'generateAgeProof:birthDate': 'ageProofBirthDate(birthDate)'
}

// Top-level `bsv.x` forwarders to a GDAF method of the same name. 9.23.0 fixed the class
// wrappers and left this layer behind, so `bsv.verifyAgeProof` kept its `issuerDID` parameter
// for two more minors while the class method had been corrected to `opening`.
function topLevelForwarders () {
  var src = fs.readFileSync(path.join(__dirname, '..', '..', 'index.js'), 'utf8')
  var params = declaredParams('index.js', /bsv\.(\w+)\s*=\s*function\s*\(([^)]*)\)/g)
  var out = []
  Object.keys(params).forEach(function (name) {
    var body = bodyOf(src, 'bsv.' + name + ' = function')
    if (!new RegExp('gdaf\\.' + name + '\\(').test(body)) return
    out.push({ name: name, declares: params[name] })
  })
  return out
}

describe('GDAF wrapper signatures', function () {
  it('every delegating wrapper forwards exactly its module parameters, by name', function () {
    var mod = moduleParams()
    var found = delegating().readable
    found.length.should.be.above(5)
    var wrong = []
    found.forEach(function (w) {
      var want = mod[w.target]
      if (!want) { wrong.push(w.name + ': no module function named ' + w.target); return }
      if (want.length !== w.forwards.length) {
        wrong.push(w.name + ': module takes ' + want.length + ', wrapper forwards ' + w.forwards.length)
        return
      }
      want.forEach(function (param, k) {
        var got = w.forwards[k]
        if (got === param) return
        if (ALLOWED_COERCIONS[w.name + ':' + param] === got) return
        wrong.push(w.name + ' arg ' + k + ': module wants `' + param + '`, wrapper passes `' + got + '`')
      })
    })
    wrong.should.deep.equal([])
  })

  // The assertion the first version of this guard was missing. Without it the guard's own
  // blind spot is invisible: it inspected 7 of 8 delegating methods and passed.
  it('inspects every method that delegates to the module, with none skipped', function () {
    var found = delegating()
    found.readable.length.should.be.above(5)
    // Not "there are none I missed" but "there are none I COULD not read". A method that
    // reaches the module by a route this parser does not understand fails here, and the fix
    // is to teach the parser or to simplify the wrapper — never to let it through unchecked.
    found.unreadable.should.deep.equal([])
  })

  it('the top-level bsv.* forwarders agree with the class methods they call, by name', function () {
    var cls = declaredParams('lib/gdaf/index.js', /GDAF\.prototype\.(\w+)\s*=\s*function\s*\(([^)]*)\)/g)
    var found = topLevelForwarders()
    found.length.should.be.above(5)
    var wrong = found.filter(function (f) {
      return cls[f.name] && JSON.stringify(cls[f.name]) !== JSON.stringify(f.declares)
    }).map(function (f) {
      return 'bsv.' + f.name + '(' + f.declares.join(', ') + ') vs class(' + cls[f.name].join(', ') + ')'
    })
    wrong.should.deep.equal([])
  })

  it('generates a membership proof through the class, which used to throw', function () {
    var g = new bsv.GDAF()
    var proof = g.generateMembershipProof(['alice', 'bob', 'carol'], 'bob')
    proof.type.should.equal('MembershipProof')
    proof.salt.should.be.a('string')
  })

  it('verifies a genuine membership proof through the class, which used to answer false', function () {
    var g = new bsv.GDAF()
    var set = ['alice', 'bob', 'carol']
    var proof = g.generateMembershipProof(set, 'bob')
    g.verifyMembershipProof(proof, { value: 'bob', salt: proof.salt }, set).should.equal(true)
  })

  it('still refuses a wrong opening and a set without the value, through the class', function () {
    var g = new bsv.GDAF()
    var set = ['alice', 'bob', 'carol']
    var proof = g.generateMembershipProof(set, 'bob')
    g.verifyMembershipProof(proof, { value: 'dave', salt: proof.salt }, set).should.equal(false)
    g.verifyMembershipProof(proof, { value: 'bob', salt: proof.salt }, ['alice', 'carol']).should.equal(false)
  })

  it('still refuses the 9.19.0 forgery through the class', function () {
    var g = new bsv.GDAF()
    g.verifyMembershipProof({
      type: 'MembershipProof', setCommitments: ['x'], valueCommitment: 'x', isMember: true
    }).should.equal(false)
  })

  // The fourth wrapper's drift was DIFFERENT in kind, and the difference was measured against
  // published 9.22.1 rather than reasoned from the diff. The other three dropped or reordered
  // arguments, so the class path was inert whatever the caller passed. This one forwarded its
  // third argument positionally and intact, so a caller who happened to pass an opening got a
  // correct `true`; what was wrong was the parameter's NAME and its `bsv.d.ts` type, both of
  // which told callers to pass an issuer DID. A DID is a string, and the opening must be an
  // object, so a caller who followed the documentation got `false` for a genuine proof.
  //
  // Which means the fail-closed property here rests on the module refusing a STRING in the
  // opening position. Nothing asserted that — the existing tests omit the opening or pass a
  // wrong object — so the refusal that made a documented, wrong-by-the-docs call safe rather
  // than forgeable was unpinned. It is asserted on both paths, because the point is the
  // module's guard and the wrapper is how a caller reached it.
  // THE GUARD ABOVE COULD NOT HAVE CAUGHT THIS, and that is the point of putting these here.
  // `generateAgeProof` ignored its first argument outright and committed to a hardcoded
  // `new Date('1995-06-15')`. Had the old body merely named its forwarded variable the same as
  // the module's parameter, every signature check in this file would still have passed while
  // the proof was about a fictitious person. A name check cannot see whether an argument is
  // USED. Only behaviour can, so the behaviour is asserted directly.
  //
  // Measured on published 9.35.0 before the fix: a credential for a subject born 2015-03-01
  // produced a proof that verified TRUE for every minimumAge from 1 to 31, and two credentials
  // for subjects born 2015 and 1960 produced byte-identical commitments and openings.
  describe('generateAgeProof commits to the birth date it was given', function () {
    it('gives different commitments for different birth dates', function () {
      var g = new bsv.GDAF()
      var a = g.generateAgeProof('1960-01-01', 18, 'fixed-salt')
      var b = g.generateAgeProof('1970-05-05', 18, 'fixed-salt')
      // Same salt, so a difference can only come from the date actually being used.
      a.birthDateCommitment.should.not.equal(b.birthDateCommitment)
      a.opening.birthDate.should.not.equal(b.opening.birthDate)
    })

    it('carries the date it was given, not a hardcoded one', function () {
      var g = new bsv.GDAF()
      var p = g.generateAgeProof('1960-01-01', 18, 'n')
      String(p.opening.birthDate).should.contain('1960-01-01')
      g.verifyAgeProof(p, 18, p.opening).should.equal(true)
    })

    it('will not produce a passing proof for a subject below the threshold', function () {
      var g = new bsv.GDAF()
      // Born 2015: under 18. This used to return a proof verifying true, because the date
      // was discarded.
      ;(function () { g.generateAgeProof('2015-03-01', 18, 'n') }).should.throw(/Age requirement not met/)
    })

    it('refuses a credential, and says why rather than failing a bare type check', function () {
      var g = new bsv.GDAF()
      var cred = { credentialSubject: { id: 'did:bsv:x', birthDate: '2015-03-01' } }
      ;(function () { g.generateAgeProof(cred, 18, 'n') }).should.throw(/not a credential/)
      // The reason is specific: our own credentials commit to a hash, so no date is recoverable.
      ;(function () { g.generateAgeProof(cred, 18, 'n') }).should.throw(/birthDateHash/)
    })

    it('parses a date string strictly, or not at all', function () {
      var g = new bsv.GDAF()
      ;(function () { g.generateAgeProof('1960-1-1', 18, 'n') }).should.throw(/YYYY-MM-DD/)
      // Date would roll this forward to March 2nd rather than reject it.
      ;(function () { g.generateAgeProof('2015-02-30', 1, 'n') }).should.throw(/not a real calendar date/)
      ;(function () { g.generateAgeProof('2030-01-01', 1, 'n') }).should.throw(/in the future/)
      ;(function () { g.generateAgeProof(new Date('nope'), 18, 'n') }).should.throw(/invalid Date/)
      ;(function () { g.generateAgeProof(undefined, 18, 'n') }).should.throw(/required/)
      ;(function () { g.generateAgeProof(12345, 18, 'n') }).should.throw(/must be a Date or a YYYY-MM-DD string/)
    })

    it('behaves the same through the top-level bsv.generateAgeProof', function () {
      var p = bsv.generateAgeProof('1960-01-01', 18, 'n')
      String(p.opening.birthDate).should.contain('1960-01-01')
      bsv.verifyAgeProof(p, 18, p.opening).should.equal(true)
      ;(function () { bsv.generateAgeProof({ credentialSubject: {} }, 18, 'n') }).should.throw(/not a credential/)
    })
  })

  it('refuses a string in the opening position, which is what the docs told callers to pass', function () {
    var g = new bsv.GDAF()
    var ZK = require('../../lib/gdaf/zk-prover')
    var BIRTH = new Date('1985-01-01T00:00:00Z')
    var proof = ZK.generateAgeProof(BIRTH, 18)

    // The control: the same proof and its real opening verify, so a `false` below is the
    // guard answering and not a broken proof.
    g.verifyAgeProof(proof, 18, proof.opening).should.equal(true)

    g.verifyAgeProof(proof, 18, 'did:bsv:issuer123').should.equal(false)
    ZK.verifyAgeProof(proof, 18, 'did:bsv:issuer123').should.equal(false)
    // An empty string and a non-DID string are the same case, but they are the shapes a
    // caller actually produces when a DID lookup returns nothing.
    g.verifyAgeProof(proof, 18, '').should.equal(false)
  })
})
