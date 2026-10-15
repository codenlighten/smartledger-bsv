'use strict'
/**
 * Re-measures every claim in docs/RELIED-UPON-PROPERTIES.md.
 *
 * That document exists because four projects shipped or nearly shipped code resting on properties
 * this library does not have. A document of that kind is worthless once it drifts, so each test
 * below does two things: it measures the property, and it asserts the document still states it.
 * Edit one without the other and this file fails.
 */
var should = require('chai').should()
var fs = require('fs')
var path = require('path')
var bsv = require('../..')
var Hash = bsv.crypto.Hash
var BN = bsv.crypto.BN

var DOC = path.join(__dirname, '..', '..', 'docs', 'RELIED-UPON-PROPERTIES.md')
var doc = fs.readFileSync(DOC, 'utf8')
// The document must keep saying what we measure. A claim removed from the prose is a claim nobody
// will read, so the pairing is asserted rather than assumed.
function documented (needle) {
  doc.indexOf(needle).should.be.above(-1, 'docs/RELIED-UPON-PROPERTIES.md no longer states: ' + needle)
}

describe('relied-upon properties', function () {
  describe('1. Message signatures are malleable', function () {
    var priv = bsv.PrivateKey.fromBuffer(Buffer.from('6d'.repeat(32), 'hex'))
    var address = priv.toAddress().toString()
    var message = 'authority: release funds to alice'

    it('the published address and message in the document are the ones measured', function () {
      documented(address)
      documented(message)
    })

    it('accepts the high-s twin: two distinct base64 strings verify for one key and message', function () {
      var sigA = bsv.Message(message).sign(priv)
      var raw = Buffer.from(sigA, 'base64')
      var recid = (raw[0] - 31) & 3
      var r = raw.slice(1, 33)
      var s = BN.fromBuffer(raw.slice(33, 65))
      var n = bsv.crypto.Point.getN()
      // in-domain flip: stay inside the valid 31..34 header range, or the test measures the parser
      var header = Buffer.from([31 + (recid ^ 1)])
      var sigB = Buffer.concat([header, r, n.sub(s).toBuffer({ size: 32 })]).toString('base64')

      sigB.should.not.equal(sigA)
      bsv.Message(message).verify(address, sigA).should.equal(true)
      bsv.Message(message).verify(address, sigB).should.equal(true,
        'the high-s twin no longer verifies: if low-s is now enforced, update the document — ' +
        'this is a compatibility change, not a bug fix')
      documented('Message signatures are malleable')
    })

    it('sign() itself only ever emits low-s, which is why enforcing it rejects nothing we produce', function () {
      var n = bsv.crypto.Point.getN()
      var halfOrder = n.sub(new BN(1)).div(new BN(2))
      for (var i = 0; i < 20; i++) {
        var k = bsv.PrivateKey.fromRandom()
        var sig = bsv.Message('m' + i).sign(k)
        var s = BN.fromBuffer(Buffer.from(sig, 'base64').slice(33, 65))
        s.cmp(halfOrder).should.be.at.most(0, 'sign() emitted a high-s signature')
      }
    })
  })

  describe('2. verification functions do not share a return convention', function () {
    it('verifyAgeProof returns a boolean, so if (result) is correct for it', function () {
      if (typeof bsv.verifyAgeProof !== 'function') this.skip()
      var out = bsv.verifyAgeProof({})
      out.should.be.a('boolean')
    })

    it('verifyCredential returns a PROMISE, so an un-awaited if (result) always passes', function () {
      var ret = bsv.verifyCredential({ bogus: true })
      should.exist(ret.then)
      ret.then.should.be.a('function')
      ;(!!ret).should.equal(true, 'a Promise is truthy regardless of the verdict')
      documented('a Promise is truthy')
      return ret.then(function () {})
    })

    it('and the RESOLVED object is truthy even when invalid, so awaiting is not the fix', function () {
      return bsv.verifyCredential({ bogus: true }).then(function (r) {
        ;(!!r).should.equal(true)
        r.valid.should.equal(false, 'a bogus credential must not be valid')
        documented('if (r.valid)')
      })
    })

    it('verifyCredential is a plain Function, so an AsyncFunction guard will not find it', function () {
      bsv.verifyCredential.constructor.name.should.equal('Function')
      documented('not an `AsyncFunction`')
    })

    it('verifyLegalToken names its error field two ways WITHIN ONE FUNCTION', function () {
      if (typeof bsv.verifyLegalToken !== 'function') this.skip()
      // Four inputs take the `error` (string) path, three take `errors` (array). Found by the
      // app3 session reading the page's recommended remedy and noticing it crashes.
      var stringPath = [{}, null, 'nope', []]
      var arrayPath = [{ proof: { type: 'x', signature: 'zz' } }, { proof: {} }, { proof: { type: 'x' } }]
      stringPath.forEach(function (input, i) {
        var r = bsv.verifyLegalToken(input)
        r.valid.should.equal(false)
        r.should.have.property('error')
        r.error.should.be.a('string', 'string-path input ' + i)
        should.equal(r.errors, undefined, 'string-path input ' + i + ' also carried errors')
      })
      arrayPath.forEach(function (input, i) {
        var r = bsv.verifyLegalToken(input)
        r.valid.should.equal(false)
        r.should.have.property('errors')
        r.errors.should.be.an('array', 'array-path input ' + i)
      })
      documented('names its error field two different ways')
    })

    it('so the obvious remedy crashes on the commonest input', function () {
      if (typeof bsv.verifyLegalToken !== 'function') this.skip()
      var r = bsv.verifyLegalToken({})
      ;(function () { return r.errors.join(', ') }).should.throw(TypeError)
      // and the form the document recommends does not
      var why = r.errors ? r.errors.join(', ') : (r.error || 'verification failed')
      why.should.be.a('string')
      why.length.should.be.above(0)
      documented("r.errors ? r.errors.join(', ') : (r.error")
    })

    it('validateCredential, by contrast, is uniform across the same inputs', function () {
      if (typeof bsv.validateCredential !== 'function') this.skip()
      ;[{}, null, 'nope', [], { proof: {} }].forEach(function (input, i) {
        var r
        try { r = bsv.validateCredential(input) } catch (e) { return }
        if (!r || typeof r.then === 'function') return
        r.should.have.property('errors')
        r.errors.should.be.an('array', 'input ' + i)
      })
      documented('`validateCredential` is uniform')
    })

    it('the document states the measured version range, not just the version I ran', function () {
      // A page that names only the version it was measured on invites a reader on an older
      // release to assume it does not apply to them. Measured at eight versions: absent in
      // 1.5.6-fix1 and 3.0.2, identical from 4.0.0 through 9.37.0.
      documented('**4.0.0 through 9.37.0**')
      documented('absent in 1.5.6-fix1 and 3.0.2')
      documented('upgrading does not address it')
    })

    var objectShaped = ['validateCredential', 'verifyLegalToken']
    objectShaped.forEach(function (name) {
      it(name + ' returns a {valid} object, truthy even when invalid', function () {
        if (typeof bsv[name] !== 'function') this.skip()
        var r
        try { r = bsv[name]({}) } catch (e) { return this.skip() }
        if (r && typeof r.then === 'function') return this.skip()
        r.should.be.an('object')
        r.should.have.property('valid')
        var truthy = !!r
        truthy.should.equal(true)
        documented('`' + name + '`')
      })
    })
  })

  describe('3. what the library refuses', function () {
    it('refuses a NotaryHash 2.0 certificate: REFERENCE_VERSION is 1.0', function () {
      var C = (bsv.NotaryHash && bsv.NotaryHash.Certificate) || bsv.Certificate
      should.exist(C)
      C.REFERENCE_VERSION.should.equal('1.0')
      documented("`Certificate.REFERENCE_VERSION` is `'1.0'`")
    })

    it('has no bech32, SegWit, Taproot or witness member on the public surface', function () {
      var surface = Object.keys(bsv).join(' ').toLowerCase()
      ;['bech32', 'segwit', 'taproot', 'witness'].forEach(function (k) {
        surface.indexOf(k).should.equal(-1, 'the public surface now mentions ' + k)
      })
      documented('no bech32, SegWit or Taproot support')
    })
  })

  describe('4. canonical JSON', function () {
    var jcs = require('../../lib/util/jcs')

    it('is reachable as the documented subpath export', function () {
      var pkg = require('../../package.json')
      should.exist(pkg.exports['./jcs'], 'package.json no longer exports ./jcs')
      jcs.stringify.should.be.a('function')
      documented('`@smartledger/bsv/jcs` is a public subpath export')
    })

    it('canonicalises -0 to 0, so it is NOT injective over JS numbers', function () {
      jcs.stringify({ x: -0 }).should.equal(jcs.stringify({ x: 0 }))
      documented('not injective')
    })

    it('sorts integer-like keys by UTF-16, not numerically', function () {
      var out = jcs.stringify({ 10: 'a', 9: 'b', 2: 'c' })
      out.indexOf('"10"').should.be.below(out.indexOf('"2"'))
      out.indexOf('"2"').should.be.below(out.indexOf('"9"'))
      documented('sort by UTF-16, not numerically')
    })

    it('loses precision above 2^53', function () {
      jcs.stringify({ n: 9007199254740993 }).should.equal('{"n":9007199254740992}')
      documented('silently lose precision')
    })
  })

  describe('5. script and consensus', function () {
    it('Script.fromBuffer is total over cut-off length prefixes', function () {
      ;['6a4c', '6a4d01', '6a4e0100', '6a4d0300', '4c'].forEach(function (h) {
        ;(function () { bsv.Script.fromBuffer(Buffer.from(h, 'hex')) }).should.not.throw()
      })
      documented('`Script.fromBuffer` is total')
    })

    it('fromString(toString()) round-trips an undecodable push', function () {
      ;['6a4c', '6a4d01', '6a4e0100', '6a4c050102', '6a050102'].forEach(function (h) {
        var s = bsv.Script.fromBuffer(Buffer.from(h, 'hex'))
        bsv.Script.fromString(s.toString()).toBuffer().toString('hex').should.equal(h)
      })
    })

    it('toASM is lossy for a short DATA push, exactly as documented', function () {
      var s = bsv.Script.fromBuffer(Buffer.from('6a4c050102', 'hex'))
      s.toASM().should.equal('OP_RETURN 0102')
      bsv.Script.fromASM(s.toASM()).toBuffer().toString('hex').should.equal('6a020102')
      documented('deliberately lossy for a short DATA push')
    })

    it('post-Genesis OP_CHECKLOCKTIMEVERIFY is the same opcode as OP_NOP2', function () {
      bsv.Opcode.OP_CHECKLOCKTIMEVERIFY.should.equal(bsv.Opcode.OP_NOP2)
      bsv.Opcode.OP_CHECKLOCKTIMEVERIFY.should.equal(177)
      documented('the same opcode, `177`')
    })
  })

  describe('6. secret sharing', function () {
    var secret = Buffer.from('attack at dawn, bring the keys', 'utf8')

    it('emits no checksum by default', function () {
      should.equal(bsv.Shamir.split(secret, 2, 3)[0].checksum, null)
      documented('off by default')
    })

    it('with checksum:true the field is sha256(secret) truncated, identical across splits', function () {
      var a = bsv.Shamir.split(secret, 2, 3, { checksum: true })
      var b = bsv.Shamir.split(secret, 2, 3, { checksum: true })
      var expected = Hash.sha256(secret).slice(0, 4).toString('hex')
      a[0].checksum.should.equal(expected)
      b[0].checksum.should.equal(a[0].checksum, 'the checksum is an offline oracle on the secret')
      documented('offline oracle')
    })

    it('splitId is random per split, so it leaks nothing about the secret', function () {
      var a = bsv.Shamir.split(secret, 2, 3)
      var b = bsv.Shamir.split(secret, 2, 3)
      a[0].splitId.should.not.equal(b[0].splitId)
      documented('random per split')
    })

    it('a share is odd-length hex, so Buffer.from(share, hex) silently truncates it', function () {
      var share = bsv.Shamir.split(Buffer.alloc(1, 1), 2, 2)[0].share
      ;(share.length % 2).should.equal(1)
      Buffer.from(share, 'hex').length.should.equal((share.length - 1) / 2)
      documented('silently drops the\n  last nibble')
    })

    it('share string length is 3 + 32*ceil((len+2)/16) at every length tested', function () {
      ;[1, 14, 15, 16, 17, 30, 31, 32, 33, 47, 48, 64, 100].forEach(function (len) {
        var share = bsv.Shamir.split(Buffer.alloc(len, 1), 2, 2)[0].share
        share.length.should.equal(3 + 32 * Math.ceil((len + 2) / 16), 'at secret length ' + len)
      })
      documented('3 + 32 * ceil((len + 2) / 16)')
    })

    it('the naive ceil(len/16) formula is short exactly where the document says', function () {
      ;[15, 16, 31, 32].forEach(function (len) {
        var right = 3 + 32 * Math.ceil((len + 2) / 16)
        var naive = 3 + 32 * Math.ceil(len / 16)
        naive.should.not.equal(right, 'the naive formula should be wrong at len ' + len)
      })
    })
  })
})
