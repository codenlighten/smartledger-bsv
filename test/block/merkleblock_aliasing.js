'use strict'

/* global describe, it */

// MerkleBlock must not share mutable state with the object it was built from, or with
// the object it produces.
//
// It used to do both: the constructor stored `arg.hashes` / `arg.flags` directly, and
// toObject() handed the same arrays back out. So a MerkleBlock and its input — or its
// output — were the same arrays, and mutating either changed the other at a distance.
//
// This surfaced as order-dependence in this suite's own fixtures: several tests in
// merkleblock.js mutate a block built from the shared data.JSON[0], which corrupted
// that fixture for every test that ran afterwards. A new test would pass alone and fail
// in the full run. The tests were the messenger; the aliasing is the defect, and a
// caller building a MerkleBlock from their own object hits it the same way.

require('chai').should()
var bsv = require('../..')
var MerkleBlock = bsv.MerkleBlock
var data = require('../data/merkleblocks.js')

function fixture () {
  // A deep copy, so these tests cannot themselves become the thing they test for.
  return JSON.parse(JSON.stringify(data.JSON[0]))
}

describe('MerkleBlock does not alias its caller', function () {
  describe('on the way in', function () {
    it('does not store the caller\'s hashes array', function () {
      var obj = fixture()
      new MerkleBlock(obj).hashes.should.not.equal(obj.hashes)
    })

    it('does not store the caller\'s flags array', function () {
      var obj = fixture()
      new MerkleBlock(obj).flags.should.not.equal(obj.flags)
    })

    it('leaves the source object untouched when the block is mutated', function () {
      // The exact shape that corrupted the shared fixture: a negative test pushes a
      // bad hash onto a block, and every later test sees the longer array.
      var obj = fixture()
      var hashCount = obj.hashes.length
      var flagCount = obj.flags.length

      var mb = new MerkleBlock(obj)
      mb.hashes.push('bad0')
      mb.flags.pop()

      obj.hashes.length.should.equal(hashCount)
      obj.flags.length.should.equal(flagCount)
    })

    it('gives two blocks built from one object independent arrays', function () {
      var obj = fixture()
      var a = new MerkleBlock(obj)
      var b = new MerkleBlock(obj)
      a.hashes.push('bad0')
      b.hashes.length.should.equal(obj.hashes.length)
    })
  })

  describe('on the way out', function () {
    it('does not hand out the live hashes array', function () {
      var mb = new MerkleBlock(fixture())
      mb.toObject().hashes.should.not.equal(mb.hashes)
    })

    it('does not hand out the live flags array', function () {
      var mb = new MerkleBlock(fixture())
      mb.toObject().flags.should.not.equal(mb.flags)
    })

    it('leaves the block untouched when the exported object is mutated', function () {
      // toObject() reads as a serializer, which is exactly the API a caller expects to
      // be free to modify.
      var mb = new MerkleBlock(fixture())
      var count = mb.hashes.length
      var out = mb.toObject()
      out.hashes.push('bad0')
      out.flags.pop()
      mb.hashes.length.should.equal(count)
    })
  })

  describe('without changing what the values are', function () {
    it('copies contents faithfully', function () {
      var obj = fixture()
      var mb = new MerkleBlock(obj)
      mb.hashes.should.deep.equal(obj.hashes)
      mb.flags.should.deep.equal(obj.flags)
    })

    it('round-trips through toObject unchanged', function () {
      var mb = new MerkleBlock(fixture())
      new MerkleBlock(mb.toObject()).toBuffer().toString('hex')
        .should.equal(mb.toBuffer().toString('hex'))
    })

    it('still validates and still finds its transactions', function () {
      var mb = new MerkleBlock(fixture())
      mb.validMerkleTree().should.equal(true)
      mb.filteredTxsHash().should.deep.equal(new MerkleBlock(fixture()).filteredTxsHash())
    })

    it('leaves the buffer path — which never aliased — working', function () {
      var fromBuf = MerkleBlock.fromBuffer(new MerkleBlock(fixture()).toBuffer())
      fromBuf.validMerkleTree().should.equal(true)
    })

    // The constructor never validated these fields, and 9.x is committed against
    // turning a tolerated input into a throw. A non-array passes through as it did.
    it('passes a non-array through rather than coercing or throwing', function () {
      var obj = fixture()
      obj.hashes = 'not-an-array'
      ;(function () { return new MerkleBlock(obj) }).should.not.throw()
      new MerkleBlock(obj).hashes.should.equal('not-an-array')
    })
  })
})
