'use strict'
/* global describe,it */

// The selective-disclosure leaf encoding, and the two defects it had.
//
// It was `path + ':' + JSON.stringify(value) + ':' + salt`. Both halves were wrong in the same
// family as the 9.22.0 membership fix, which I made and then did not apply to its siblings:
//
//   JSON.stringify IS NOT INJECTIVE. `null`, `NaN` and `Infinity` all render as "null", so a
//   genuine proof disclosing `null` verified with `valid: true` after the disclosed value was
//   changed in-process to `NaN` or `Infinity` — a verdict about a value the issuer never
//   committed to. Reported WITH A WORKING REPRODUCTION by the aumtoken session against 9.26.2,
//   the same session that reported the 9.19.0 membership forgery, and reproduced here before the
//   fix was written.
//
//   ':' IS A SEPARATOR THAT CAN OCCUR IN A PATH, so a crafted path could move the boundary
//   between the three components. Their suggested fix, taken: length-prefix each part.
//
// Nothing in this suite pinned the old encoding, which is why 5,314 tests passed through a change
// that alters every credential root. That gap is what these tests close.

require('chai').should()
var z = require('../../lib/gdaf/zk-prover')

var CRED = {
  '@context': ['https://www.w3.org/2018/credentials/v1'],
  id: 'urn:uuid:1',
  type: ['VerifiableCredential'],
  issuer: 'did:smartledger:issuer',
  issuanceDate: '2026-01-01T00:00:00.000Z',
  credentialSubject: { id: 'did:smartledger:subject', score: null, name: 'alice' }
}

function proofFor (paths, salt) {
  return z.generateSelectiveProof(CRED, paths || ['credentialSubject.score'], salt || 'fixed-salt')
}

describe('selective disclosure leaf encoding', function () {
  it('verifies a genuine proof that discloses null', function () {
    var p = proofFor()
    z.verifySelectiveProof(p, p.credentialRoot).valid.should.equal(true)
  })

  it('refuses NaN and Infinity swapped in for a disclosed null', function () {
    // The reported defect. These are not reachable over JSON — NaN does not survive it — so this
    // needs an in-process object or a non-JSON transport, which is exactly how a library used in
    // the same process as its caller is used.
    var p = proofFor()
    ;[NaN, Infinity, -Infinity].forEach(function (v) {
      var t = JSON.parse(JSON.stringify(p))
      t.disclosedFields[0].value = v
      var r = z.verifySelectiveProof(t, p.credentialRoot)
      r.valid.should.equal(false)
      r.errors.join(' | ').should.match(/not a permitted type/)
    })
  })

  it('refuses a wrong value of a permitted type, with the other reason', function () {
    // Two distinct errors, and the distinction is the point: "I cannot commit to that type" is
    // not the same finding as "that is not the value that was committed".
    var p = proofFor()
    ;['a string', 0, false, true].forEach(function (v) {
      var t = JSON.parse(JSON.stringify(p))
      t.disclosedFields[0].value = v
      var r = z.verifySelectiveProof(t, p.credentialRoot)
      r.valid.should.equal(false)
      r.errors.join(' | ').should.match(/hash mismatch/)
    })
  })

  it('refuses a field whose salt is missing or not a string', function () {
    var p = proofFor()
    ;[undefined, null, '', 7].forEach(function (s) {
      var t = JSON.parse(JSON.stringify(p))
      t.disclosedFields[0].salt = s
      z.verifySelectiveProof(t, p.credentialRoot).valid.should.equal(false)
    })
  })

  it('handles a path containing the old separator', function () {
    // With ':' no longer delimiting, a colon in a path is ordinary data.
    var cred = { credentialSubject: { 'a:b': '1', c: '2:3' } }
    var p = z.generateSelectiveProof(cred, ['credentialSubject.a:b', 'credentialSubject.c'], 'm')
    var r = z.verifySelectiveProof(p, p.credentialRoot)
    r.valid.should.equal(true)
    r.verifiedFields.length.should.equal(2)
  })

  it('is deterministic for a fixed master salt', function () {
    proofFor(['credentialSubject.name'], 'same').credentialRoot
      .should.equal(proofFor(['credentialSubject.name'], 'same').credentialRoot)
  })

  it('keeps the root stable across different disclosed sets, and distinct per credential',
    function () {
      // I first asserted the opposite here and the test caught me. The root commits to the WHOLE
      // credential, so a stable root across disclosures is the property that makes selective
      // disclosure work at all — a verifier holding the root can accept any subset. What must
      // differ is the root for a different credential.
      var a = proofFor(['credentialSubject.name'], 'same')
      var b = proofFor(['credentialSubject.score'], 'same')
      a.credentialRoot.should.equal(b.credentialRoot)
      a.disclosedFields.length.should.equal(1)
      a.disclosedFields[0].path.should.equal('credentialSubject.name')
      b.disclosedFields[0].path.should.equal('credentialSubject.score')

      var other = z.generateSelectiveProof(
        { credentialSubject: { id: 'did:smartledger:subject', score: null, name: 'bob' } },
        ['credentialSubject.name'], 'same')
      a.credentialRoot.should.not.equal(other.credentialRoot)
    })
})
