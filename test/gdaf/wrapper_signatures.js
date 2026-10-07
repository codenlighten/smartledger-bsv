'use strict'
/* global describe,it */

// The GDAF class exposes "Direct Access Methods (for easier developer experience)" that forward
// to the ZKProver module. Those wrappers drifted from the module they delegate to and nothing
// caught it, because every proof test called the module directly.
//
// Two separate drifts had shipped:
//   generateMembershipProof — the wrapper took (value, validSet, nonce) while the module took
//     (set, value, salt) since v5.4.0, so the class path threw "Set must be array" and a proof
//     could not be generated through it at all.
//   verifyMembershipProof / verifyRangeProof — 9.20.0 added the verifier-supplied set and the
//     opening to the module signatures and left the wrappers behind, so the verifier received
//     `set`/`opening` as undefined and answered false for EVERY proof, genuine or forged.
//
// Both failed closed, so neither accepted anything it should have refused. They made the
// documented class API inert instead, which is why no test noticed.
//
// The first test is the general guard: it compares every delegating wrapper to its target by
// parameter name, so any future signature change on one side fails here rather than silently
// disabling a verifier.

require('chai').should()
var fs = require('fs')
var path = require('path')
var bsv = require('../..')

function wrappers () {
  var src = fs.readFileSync(path.join(__dirname, '..', '..', 'lib', 'gdaf', 'index.js'), 'utf8')
  var re = /GDAF\.prototype\.(\w+)\s*=\s*function\s*\(([^)]*)\)\s*\{\s*return this\.zkProver\.(\w+)\(([^)]*)\)/g
  var out = []
  var m
  while ((m = re.exec(src)) !== null) {
    out.push({
      name: m[1],
      target: m[3],
      forwards: m[4].split(',').map(function (s) { return s.trim() }).filter(Boolean)
    })
  }
  return out
}

function moduleParams () {
  var src = fs.readFileSync(path.join(__dirname, '..', '..', 'lib', 'gdaf', 'zk-prover.js'), 'utf8')
  var re = /ZKProver\.(\w+)\s*=\s*function\s*\(([^)]*)\)/g
  var out = {}
  var m
  while ((m = re.exec(src)) !== null) {
    out[m[1]] = m[2].split(',').map(function (s) { return s.trim() }).filter(Boolean)
  }
  return out
}

describe('GDAF wrapper signatures', function () {
  it('every delegating wrapper forwards exactly its module parameters, by name', function () {
    var mod = moduleParams()
    var found = wrappers()
    found.length.should.be.above(5)
    var wrong = found.filter(function (w) {
      var want = mod[w.target]
      return want && JSON.stringify(want) !== JSON.stringify(w.forwards)
    }).map(function (w) {
      return w.name + ': module(' + mod[w.target].join(', ') + ') <- forwards(' + w.forwards.join(', ') + ')'
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
})
