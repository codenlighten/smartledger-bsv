'use strict'

require('chai').should()

var JCS = require('../../lib/util/jcs')
var bsv = require('../..')

/**
 * RFC 8785 conformance.
 *
 * These cases are the shared conformance vectors from @smartledger/attest-vectors,
 * transcribed rather than imported so this package keeps its dependency-free test
 * suite. The expected strings are fixed by the RFC, not by this implementation: if a
 * change here makes one fail, the change is wrong, not the vector.
 *
 * The load-bearing case is `integer-like keys`. Sorting keys and then REBUILDING an
 * object loses the sort, because V8 orders integer-like own properties numerically
 * ahead of string keys whatever order they were inserted in. That defect is why this
 * module exists, and why bsv.canonicalizeClaim's legacy form is not interoperable.
 */
describe('JCS (RFC 8785)', function () {
  describe('conformance vectors', function () {
    var cases = [
      ['integer-like keys sort by code unit, not numerically',
        { 2: 'two', 10: 'ten' },
        '{"10":"ten","2":"two"}'],

      ['nested integer-like keys',
        { set: { 10: 'x', 9: 'y', 1: 'z' }, name: 'n' },
        '{"name":"n","set":{"1":"z","10":"x","9":"y"}}'],

      ['a map keyed by card number — how this reaches a real payload',
        { setId: 'base-1999', cards: { 10: { grade: 9.5 }, 2: { grade: 8 }, 1: { grade: 10 } } },
        '{"cards":{"1":{"grade":10},"10":{"grade":9.5},"2":{"grade":8}},"setId":"base-1999"}'],

      ['array order is preserved',
        { z: [3, 1, 2], a: 1 },
        '{"a":1,"z":[3,1,2]}'],

      ['sort is by UTF-16 code unit, so A < _ < a',
        { a: 1, A: 2, b: 3, B: 4, _: 5 },
        '{"A":2,"B":4,"_":5,"a":1,"b":3}'],

      ['empty containers are distinct and representable',
        { o: {}, a: [], s: '' },
        '{"a":[],"o":{},"s":""}'],

      ['numbers use ECMAScript Number::toString',
        { a: 1, b: -0.5, c: 1e21, d: 0, e: 1.0, f: -0 },
        '{"a":1,"b":-0.5,"c":1e+21,"d":0,"e":1,"f":0}'],

      ['objects inside arrays inside objects',
        { b: [{ y: 1, x: 2 }, [1, { n: null }]], a: { d: true, c: false } },
        '{"a":{"c":false,"d":true},"b":[{"x":2,"y":1},[1,{"n":null}]]}'],

      ['numeric string VALUES are untouched — the defect is about keys',
        { a: '10', b: '2' },
        '{"a":"10","b":"2"}']
    ]

    cases.forEach(function (c) {
      it(c[0], function () {
        JCS.stringify(c[1]).should.equal(c[2])
      })
    })

    it('output does not depend on the key order it receives', function () {
      JCS.stringify({ b: 1, a: 2 }).should.equal(JCS.stringify({ a: 2, b: 1 }))
    })
  })

  describe('refuses what it cannot represent', function () {
    it('throws on non-finite numbers rather than emitting null', function () {
      // JSON.stringify turns these into null, which silently canonicalizes a
      // different document than the caller supplied.
      ;(function () { JCS.stringify({ a: NaN }) }).should.throw(/non-finite/)
      ;(function () { JCS.stringify({ a: Infinity }) }).should.throw(/non-finite/)
    })

    it('throws on bigint rather than coercing it', function () {
      ;(function () { JCS.stringify({ a: BigInt(1) }) }).should.throw(/bigint/)
    })

    it('throws on a circular object instead of exhausting the stack', function () {
      // Public API reachable from a verifier, so the input is untrusted. A typed
      // error beats a RangeError raised at an arbitrary depth.
      var o = { a: 1 }
      o.self = o
      ;(function () { JCS.stringify(o) }).should.throw(/circular/)
    })

    it('throws on a circular array', function () {
      var a = [1, 2]
      a.push(a)
      ;(function () { JCS.stringify(a) }).should.throw(/circular/)
    })

    it('still serializes a value referenced twice without a cycle', function () {
      // The cycle guard tracks the path being serialized, not every value seen. A
      // `seen` set would wrongly reject this perfectly ordinary shape.
      var shared = { x: 1 }
      JCS.stringify({ p: shared, q: shared }).should.equal('{"p":{"x":1},"q":{"x":1}}')
    })

    it('throws on a function at the top level', function () {
      ;(function () { JCS.stringify(function () {}) }).should.throw(/Cannot canonicalize/)
    })
  })

  describe('reachability', function () {
    it('is exposed on the namespace as bsv.JCS', function () {
      bsv.JCS.stringify({ 2: 'a', 10: 'b' }).should.equal('{"10":"b","2":"a"}')
    })

    it('is exposed as the subpath entry point', function () {
      var viaEntry = require('../../jcs-entry')
      viaEntry.stringify.should.equal(JCS.stringify)
    })

    it('is the same implementation GDAF signs credentials with', function () {
      var AttestationSigner = require('../../lib/gdaf/attestation-signer')
      var value = { 2: 'two', 10: 'ten', z: 1 }
      AttestationSigner._canonicalizeJCS(value).should.equal(JCS.stringify(value))
    })
  })
})
