'use strict'

/* global describe, it, beforeEach */

// `Script.fromHex` accepts a string that does not decode whole, and silently returns a shorter
// script. `Buffer.from(str, 'hex')` stops at the first character it cannot decode — including the
// trailing nibble of an odd-length string — and hands back what it had.
//
// `Script.fromString`, directly below it in the source, has always refused that with
// `JSUtil.isHexa`. This function never did, so a caller that builds an output from the result pays
// to a truncated script with nothing to tell it. Refusing it outright is a breaking change, so it
// is marked now and throws in 10.0.0.
//
// The bound worth keeping in mind, and asserted below: truncation can only drop a SUFFIX. It
// cannot alter the bytes it did decode, so an address derived from the result is always the one
// the input's leading bytes named — never a third party's.

require('chai').should()
const bsv = require('../..')
const Script = bsv.Script
const Address = bsv.Address

const P2PKH = '76a914' + '11'.repeat(20) + '88ac'

function warnsFor (str) {
  const original = console.warn
  let warned = false
  console.warn = function (m) { if (String(m).indexOf('fromHex') >= 0) warned = true }
  try { Script.fromHex(str) } finally { console.warn = original }
  return warned
}

describe('Script.fromHex is lenient about hex, and says so', function () {
  describe('what decodes whole, and what does not', function () {
    it('a valid even-length string round-trips and is unchanged', function () {
      const s = Script.fromHex(P2PKH)
      s.toHex().should.equal(P2PKH)
      s.isPublicKeyHashOut().should.equal(true)
    })

    it('an empty string is legitimate, not a truncation', function () {
      // Script.fromString allows it explicitly (`str.length === 0`), so fromHex must not
      // complain about it either.
      Script.fromHex('').toHex().should.equal('')
    })

    it('an odd number of digits loses the last nibble', function () {
      Script.fromHex('76a91').toHex().should.equal('76a9')
    })

    it('a character that is not hex ends the decode there', function () {
      Script.fromHex('76a9zz88').toHex().should.equal('76a9')
      Script.fromHex('zzzz').toHex().should.equal('')
    })

    it('a response that is not hex at all yields an empty script', function () {
      Script.fromHex('<html>503</html>').toHex().should.equal('')
    })
  })

  describe('truncation can only drop a suffix', function () {
    it('so a junk suffix cannot change the address', function () {
      const clean = Address.fromScript(Script.fromHex(P2PKH), 'livenet').toString()
      const junked = Address.fromScript(Script.fromHex(P2PKH + 'zzzz'), 'livenet').toString()
      junked.should.equal(clean)
    })

    it('and the decoded bytes are always a prefix of the valid decode', function () {
      const partial = Script.fromHex(P2PKH.slice(0, 30) + 'ZZ' + P2PKH.slice(32))
      P2PKH.indexOf(partial.toHex()).should.equal(0)
    })
  })

  describe('the deprecation notice', function () {
    beforeEach(function () {
      // The notice fires once per process per `what`, so clear the record between cases.
      const deprecate = require('../../lib/util/deprecate')
      if (typeof deprecate.reset === 'function') deprecate.reset()
    })

    it('does not fire for a string that decodes whole', function () {
      warnsFor(P2PKH).should.equal(false)
    })

    it('does not fire for an empty string', function () {
      warnsFor('').should.equal(false)
    })

    it('fires for an odd number of digits', function () {
      warnsFor('76a91').should.equal(true)
    })

    it('fires for a character that is not hex', function () {
      warnsFor('zzzz').should.equal(true)
    })

    it('fires for a valid script with a junk suffix, which is the quiet case', function () {
      warnsFor(P2PKH + 'zz').should.equal(true)
    })
  })

  describe('a round-trip check is the strict behaviour available today', function () {
    it('separates every truncating input from every whole one', function () {
      const whole = [P2PKH, '', '00', '6a']
      const truncating = ['76a91', 'zzzz', P2PKH + 'zz', '<html>503</html>', '76a9 14']
      for (const h of whole) {
        Script.fromHex(h).toHex().should.equal(h.toLowerCase())
      }
      for (const h of truncating) {
        Script.fromHex(h).toHex().should.not.equal(h.toLowerCase())
      }
    })
  })
})
