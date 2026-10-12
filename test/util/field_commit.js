'use strict'

/* global describe, it */

// The shared field-commitment encoding.
//
// This module exists because the encoding was COPIED. lib/gdaf/zk-prover.js fixed it twice
// (9.22.0 for membership, again for selective disclosure) and lib/ltp/proof.js kept its own
// `path + ':' + JSON.stringify(value) + ':' + salt` with both defects intact. So the tests
// that matter most here are the two that stop it drifting apart again: the encoding is
// pinned to exact bytes, and the permitted domain is pinned to exactly what it refuses.

require('chai').should()
var FieldCommit = require('../../lib/util/field-commit')
var Hash = require('../../lib/crypto/hash')

describe('util/field-commit', function () {
  describe('the encoding is pinned to exact bytes', function () {
    // Moving this encoding moves every credential root and every LTP Merkle root, so it must
    // not be possible to change it inattentively. These are the bytes, written out.
    it('frames each component with its decimal byte length', function () {
      FieldCommit.leafBytes('a', 'x', 'ss').toString('utf8').should.equal('1:a3:"x"2:ss')
      FieldCommit.leafBytes('a.b', 1, 'ss').toString('utf8').should.equal('3:a.b1:12:ss')
      FieldCommit.leafBytes('f', null, 'ss').toString('utf8').should.equal('1:f4:null2:ss')
      FieldCommit.leafBytes('f', true, 'ss').toString('utf8').should.equal('1:f4:true2:ss')
    })

    it('measures the length in BYTES, not characters', function () {
      // 'ü' is two UTF-8 bytes. A character count here would let a multi-byte path shift the
      // frame, which is the whole thing the prefix exists to stop.
      FieldCommit.leafBytes('ü', 'x', 'ss').toString('utf8').should.equal('2:ü3:"x"2:ss')
      FieldCommit.leafBytes('f', 'ü', 'ss').toString('utf8').should.equal('1:f4:"ü"2:ss')
    })

    it('is self-delimiting, so no component can impersonate part of another', function () {
      // The defect this replaced: `path + ':' + value + ':' + salt` let a crafted path move
      // the boundaries. Here the two readings produce different bytes.
      var a = FieldCommit.leafBytes('a:1', 'x', 'ss').toString('utf8')
      var b = FieldCommit.leafBytes('a', '1:x', 'ss').toString('utf8')
      a.should.not.equal(b)
    })

    it('distinguishes values that JSON.stringify renders identically', function () {
      // null / NaN / Infinity all stringify to "null". Rather than encode them apart, the
      // domain refuses the two that are not representable — see below. What must hold here
      // is that no two PERMITTED values collide.
      var seen = {}
      var values = [null, true, false, 0, -1, 1.5, '', 'null', '0', [], {}, [null], { a: null }]
      values.forEach(function (v) {
        var k = FieldCommit.leafBytes('f', v, 'ss').toString('utf8')
        seen.hasOwnProperty(k).should.equal(false, 'collision on ' + JSON.stringify(v))
        seen[k] = true
      })
    })
  })

  describe('the permitted domain', function () {
    it('refuses the values that are not injectively encodable', function () {
      // This is the forgery, at its root: a commitment to `null` must not also be a
      // commitment to NaN or Infinity.
      ;(function () { FieldCommit.leafBytes('f', NaN, 'ss') }).should.throw(/finite number/)
      ;(function () { FieldCommit.leafBytes('f', Infinity, 'ss') }).should.throw(/finite number/)
      ;(function () { FieldCommit.leafBytes('f', -Infinity, 'ss') }).should.throw(/finite number/)
      ;(function () { FieldCommit.leafBytes('f', undefined, 'ss') }).should.throw(/not a permitted type/)
      ;(function () { FieldCommit.leafBytes('f', function () {}, 'ss') }).should.throw(/not a permitted type/)
    })

    it('refuses them nested, not only at the top level', function () {
      ;(function () { FieldCommit.leafBytes('f', [1, NaN], 'ss') }).should.throw(/f\[1\] must be a finite/)
      ;(function () { FieldCommit.leafBytes('f', { a: Infinity }, 'ss') }).should.throw(/f\.a must be a finite/)
      ;(function () { FieldCommit.leafBytes('f', { a: undefined }, 'ss') }).should.throw(/f\.a is undefined/)
      ;(function () { FieldCommit.leafBytes('f', [undefined], 'ss') }).should.throw(/f\[0\] is undefined/)
    })

    it('refuses a non-plain object, which JCS would otherwise flatten', function () {
      ;(function () { FieldCommit.leafBytes('f', new Date(), 'ss') }).should.throw(/plain object/)
      ;(function () { FieldCommit.leafBytes('f', /re/, 'ss') }).should.throw(/plain object/)
    })

    it('requires a non-empty path and salt', function () {
      ;(function () { FieldCommit.leafBytes('', 'x', 'ss') }).should.throw(/path must be a non-empty/)
      ;(function () { FieldCommit.leafBytes('f', 'x', '') }).should.throw(/salt must be a non-empty/)
      ;(function () { FieldCommit.leafBytes('f', 'x') }).should.throw(/salt must be a non-empty/)
    })

    it('is insensitive to key order, so one value has one commitment', function () {
      FieldCommit.leafBytes('f', { a: 1, b: 2 }, 'ss').toString('hex')
        .should.equal(FieldCommit.leafBytes('f', { b: 2, a: 1 }, 'ss').toString('hex'))
    })
  })

  describe('leaf bytes cannot be mistaken for internal Merkle node bytes', function () {
    // Why these constructions survive having no RFC 6962 leaf/node tag: an internal node is
    // hashed over two raw 32-byte digests, while a leaf is hashed over a length-prefixed
    // ASCII frame. The frame must begin with decimal digits followed by ':', and the three
    // declared lengths must consume the buffer exactly.
    //
    // This is a property of THIS framing and NOT a general guarantee. A construction that
    // hashes bare concatenations needs explicit tags, which is what NotaryHash.Merkle uses.
    it('always begins with a decimal length prefix', function () {
      var b = FieldCommit.leafBytes('f', 'x', 'ss').toString('utf8')
      var framed = /^[0-9]+:/
      framed.test(b).should.equal(true)
    })

    it('does not accept a bare 64-byte node preimage as a leaf encoding', function () {
      // A node preimage is two concatenated digests. Nothing about it is a valid frame, and
      // there is no (path, value, salt) this function maps to those bytes for a random pair.
      var node = Buffer.concat([
        Hash.sha256(Buffer.from('left')), Hash.sha256(Buffer.from('right'))
      ])
      node.length.should.equal(64)
      var framed = /^[0-9]+:/
      framed.test(node.toString('utf8')).should.equal(false)
    })
  })
})
