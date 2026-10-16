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

    it('the documented behavioural probe for the option passes on this build, and is not an arity check', function () {
      // A consumer measured that {lowS:true} is accepted and IGNORED before 9.38.0 — the twin
      // verifies true, with no error. The page therefore tells integrators to probe behaviour, and
      // the probe it prints has to work. Transcribed from the document rather than written afresh.
      function lowSOptionWorks (bsv) {
        var p2 = bsv.PrivateKey.fromRandom()
        var addr = p2.toAddress().toString()
        var sig = bsv.Message('probe').sign(p2)
        var raw = Buffer.from(sig, 'base64')
        var n = bsv.crypto.Point.getN()
        var s2 = BN.fromBuffer(raw.slice(33, 65))
        var twin = Buffer.concat([
          Buffer.from([31 + (((raw[0] - 31) & 3) ^ 1)]),
          raw.slice(1, 33),
          n.sub(s2).toBuffer({ size: 32 })
        ]).toString('base64')
        return bsv.Message('probe').verify(addr, twin) === true &&
          bsv.Message('probe').verify(addr, twin, { lowS: true }) === false
      }
      lowSOptionWorks(bsv).should.equal(true)
      // the arities the document's table states for a build that has the option
      bsv.Message.prototype.verify.length.should.equal(3)
      bsv.Message.verify.length.should.equal(4)
      documented('Before 9.38.0 the option is a silent no-op')
      documented('worse than no option at all')
      documented('an unrecognised key in an options object is ignored, not rejected')
    })

    it('low-s does not make a signature unique: distinct low-s signatures verify for one message', function () {
      // A consumer session measured this against its own build and sent it as a correction to
      // advice this page had given: {lowS:true} removes ONE twin, it does not bound the number of
      // valid signatures over a message. Reproduced here, because the page now states it.
      var magic = bsv.Message(message).magicHash()
      var sigs = []
      function signWith (prepare) {
        var e = new bsv.crypto.ECDSA()
        e.hashbuf = magic
        e.privkey = priv
        e.pubkey = priv.toPublicKey()
        if (prepare) prepare(e)
        e.sign()
        e.calci()
        return e.sig
      }
      sigs.push(signWith(null))
      ;[1, 2, 3, 4].forEach(function (i) {
        var k = BN.fromBuffer(Hash.sha256(Buffer.from('nonce' + i, 'utf8')))
        sigs.push(signWith(function (e) { e.set({ k: k }) }))
      })
      sigs.push(signWith(function (e) { e.randomK() }))

      var distinct = {}
      sigs.forEach(function (sig) {
        var b64 = sig.toCompact().toString('base64')
        distinct[b64] = true
        sig.hasLowS().should.equal(true, 'every signature here must be low-s for the point to hold')
        bsv.Message(message).verify(address, b64).should.equal(true)
        // and the strict option accepts them all: it is not a uniqueness rule
        bsv.Message(message).verify(address, b64, { lowS: true }).should.equal(true,
          '{ lowS: true } must not be read as making a signature unique')
      })
      Object.keys(distinct).length.should.equal(sigs.length,
        'each nonce must give a different signature, or this test proves nothing')
      Object.keys(distinct).length.should.be.above(5)
      documented('Low-s does not make a signature unique, and no encoding rule can')
      documented('its bytes\nidentify neither the statement nor a signing event')
    })

    it('sign() is deterministic, which is a property of the signer and not of the input', function () {
      var seen = {}
      for (var i = 0; i < 5; i++) seen[bsv.Message(message).sign(priv)] = true
      Object.keys(seen).length.should.equal(1)
      documented('determinism is a property of this signer')
      documented('`_findSignature` then applies `ECDSA.toLowS(s)` unconditionally')
    })

    it('the documented { lowS: true } option refuses the twin and accepts what we sign', function () {
      var sigA = bsv.Message(message).sign(priv)
      var raw = Buffer.from(sigA, 'base64')
      var recid = (raw[0] - 31) & 3
      var n = bsv.crypto.Point.getN()
      var s = BN.fromBuffer(raw.slice(33, 65))
      var twin = Buffer.concat([Buffer.from([31 + (recid ^ 1)]), raw.slice(1, 33),
        n.sub(s).toBuffer({ size: 32 })]).toString('base64')
      bsv.Message(message).verify(address, twin, { lowS: true }).should.equal(false)
      bsv.Message(message).verify(address, sigA, { lowS: true }).should.equal(true)
      bsv.Message.verify(message, address, twin, { lowS: true }).should.equal(false)
      documented('{ lowS: true }')
      documented('The default will change')
    })

    it('the document names the wrong-layer lesson where a reader will write a test', function () {
      documented('observes the wrong layer')
      documented('observe the layer the guard acts on')
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

    describe('the estate-wide table is a DATED measurement, not an enforced property', function () {
      // This library depends on none of the siblings, so their behaviour cannot be pinned here.
      // What CAN be pinned is that the document says so, names the versions it measured, and
      // states the one rule that makes a string-valued verdict safe to read. Without this, the
      // table reads like a property of the estate rather than a reading taken on one day.
      it('names each sibling version the table was measured against', function () {
        documented('@smartledger/notaryhash` **2.5.0**')
        documented('@smartledger/crypto` 3.3.0')
        documented('@smartledger/keys` 4.1.0')
        documented('@smartledger/envelope` 3.0.1')
      })

      it('says plainly that the siblings are not pinned by this suite', function () {
        documented('their behaviour is not pinned by our test suite and cannot be')
        documented('dated measurement')
        documented('Re-measure before relying')
      })

      it('states the counts, so a key added to any sibling makes the prose wrong', function () {
        documented('three different success keys')
        documented('five different error keys')
      })

      it('gives the rule for a string-valued verdict, which was the dangerous shape', function () {
        // Fixed in notaryhash 2.5.0 by adding a boolean `ok`, but live in every earlier version,
        // so the document must still carry the comparison form AND say who is still exposed.
        documented("`check.status === 'valid'`")
        documented('all three non-empty strings and therefore all truthy')
        documented('If you are pinned below notaryhash 2.5.0 the trap is live')
      })

      it('records that the fix changed the READING, not the double-spend result', function () {
        // The inference a reader could otherwise draw from "they added ok".
        documented('It does not change\nthe result')
        documented('still reports a link for BOTH halves of a double spend')
      })

      it('records the isKeyUsable finding as NOT a defect, so it is not re-reported', function () {
        documented('isKeyUsable({})` returns `true`')
        documented('documented tolerance')
        documented('treated as expired rather than as "no expiry"')
      })

      it('distinguishes rejecting from resolving-a-falsy-result', function () {
        // The distinction my first probe got wrong: an async function that REJECTS is safe for
        // `if (await f())`; only one that RESOLVES to a truthy failure is not.
        documented('rejects** on\nbad input is safe')
        documented('**rejects** rather than resolving a result object')
        // The count was corrected from two to one after the maintainers pointed out that
        // verifyDocument rejects only on a TypeError for missing bytes, which is misuse and not
        // a verdict. The doc must carry that distinction, not just the narrower number.
        documented('a programming error rather than a\nverdict')
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

    // A seal is a chain-of-custody claim this library does not check, so a certificate that
    // carries one is refused however good the rest of it is. Measured on the real mainnet
    // certificate the repository ships, because a constructed one proves only that the branch
    // runs: this one VERIFIES, and then stops verifying for the single reason under test.
    describe('a certificate carrying anchor.seal is refused by itself', function () {
      var fixture = require('../data/notaryhash-mainnet-certificate.json')
      // The header is rebuilt from the fixture's own block fields, so the test needs no network.
      function header () {
        var b = fixture.block
        var u32 = function (n) { var x = Buffer.alloc(4); x.writeUInt32LE(n); return x }
        var rev = function (h) { return Buffer.from(h, 'hex').reverse() }
        return Buffer.concat([
          u32(b.version), rev(b.previousblockhash), rev(b.merkleroot),
          u32(b.time), rev(b.bits), u32(b.nonce)
        ]).toString('hex')
      }
      var opts = {
        header: header(),
        height: fixture.block.height,
        blockHashAtHeight: fixture.block.hash
      }
      function sealed () {
        var c = JSON.parse(JSON.stringify(fixture.certificate))
        c.anchor.seal = { vout: 1, previous: null, previousId: null, signature: 'ab'.repeat(64) }
        return c
      }

      it('the fixture verifies as shipped, so the refusal below is about the seal alone', function () {
        var r = bsv.NotaryHash.verify(fixture.certificate, opts)
        r.valid.should.equal(true, 'the shipped fixture no longer verifies: ' + JSON.stringify(r.errors))
      })

      it('adding a seal and nothing else makes it invalid, with the other checks still true', function () {
        var r = bsv.NotaryHash.verify(sealed(), opts)
        r.valid.should.equal(false)
        r.sealUnchecked.should.equal(true)
        r.signature.should.equal(true)
        r.proofIntegrity.should.equal(true)
        r.batchInclusion.should.equal(true)
        bsv.NotaryHash.isValid(sealed(), opts).should.equal(false)
        documented('A certificate carrying `anchor.seal` is refused, by itself.')
      })

      it('allowUncheckedSeal makes the same certificate verify again', function () {
        var o = Object.assign({ allowUncheckedSeal: true }, opts)
        bsv.NotaryHash.verify(sealed(), o).valid.should.equal(true)
        bsv.NotaryHash.isValid(sealed(), o).should.equal(true)
        documented('`allowUncheckedSeal: true` makes it `valid: true` again')
      })

      it('allowUncheckedSeal does NOT wave through a seal that is not an object', function () {
        var o = Object.assign({ allowUncheckedSeal: true }, opts)
        ;[null, 'seal', 42, []].forEach(function (bad) {
          var c = JSON.parse(JSON.stringify(fixture.certificate))
          c.anchor.seal = bad
          var r = bsv.NotaryHash.verify(c, o)
          r.valid.should.equal(false, 'a seal of ' + JSON.stringify(bad) + ' was accepted')
        })
        documented('does **not** wave through a seal that is not an object')
      })

      // Section 2's claim, which is the reason the refusal is not being tidied up before 10.0.0:
      // the per-check fields misattribute, and removing the duplicate would LOOSEN `anchor`.
      it('reports anchor false although the anchor verified, and the error twice', function () {
        var r = bsv.NotaryHash.verify(sealed(), opts)
        r.anchor.should.equal(false, 'anchor is no longer dragged down by the seal')
        var seal = r.errors.filter(function (e) { return e.indexOf('anchor.seal is present') === 0 })
        seal.length.should.equal(2, 'the seal error is no longer duplicated: ' + JSON.stringify(r.errors))
        // and the anchor really is fine, which is what makes `anchor: false` a misattribution
        bsv.NotaryHash.verifyAnchorSPV(fixture.certificate, opts).valid.should.equal(true)
        documented('`anchor` is `false` although the anchor verified.')
        documented('the seal error appears twice in `errors`')
        documented('gate on `valid`, or on `isValid()`; read `anchor` and `errors` for triage only.')
      })
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

  describe('5. mutating a script in place does not change the transaction', function () {
    it('is stated, and both halves still measure as the document says', function () {
      documented('Mutating a script in place does not change the transaction')
      documented('output.setScript(output.script)` after mutating')
      var tx = new bsv.Transaction()
      tx.to(bsv.PrivateKey.fromRandom().toAddress(), 1000)
      var before = tx.toString()
      var out = tx.outputs[0]
      var serialized = out.toBufferWriter().toBuffer().length
      out.script.add(bsv.Opcode.OP_NOP)
      tx.toString().should.equal(before, 'the mutation must not reach the bytes')
      out.getSize().should.equal(serialized + 1, 'but getSize() must measure the object')
      out.setScript(out.script)
      tx.toString().should.not.equal(before, 'and the documented remedy must resolve it')
    })
  })

  describe('9. SPV and anchor verification', function () {
    var deprecate = require('../../lib/util/deprecate')
    var chain = require('../data/spv-mainnet-headers.json')
    var fixture = require('../data/notaryhash-mainnet-certificate.json')
    var cert = fixture.certificate
    var bufs = chain.headers.map(function (h) { return Buffer.from(h.hex, 'hex') })

    // The certificate's block header, serialised here from the block's own fields rather than
    // taken from the library, so no test below asks the library to confirm its own construction.
    function headerFromFields (b) {
      var buf = Buffer.alloc(80)
      buf.writeUInt32LE(b.version, 0)
      Buffer.from(b.previousblockhash, 'hex').reverse().copy(buf, 4)
      Buffer.from(b.merkleroot, 'hex').reverse().copy(buf, 36)
      buf.writeUInt32LE(b.time, 68)
      buf.writeUInt32LE(parseInt(b.bits, 16), 72)
      buf.writeUInt32LE(b.nonce, 76)
      return buf
    }
    function idOf (buf) {
      return Buffer.from(Hash.sha256sha256(buf)).reverse().toString('hex')
    }
    var certHeader = headerFromFields(fixture.block)

    // Several checks below would print the 9.13.0 notice. It is asserted on its own in
    // test/deprecated_apis.js; here it is noise, and leaving it enabled teaches a reader to
    // ignore it.
    var wasEnabled
    before(function () { wasEnabled = deprecate.isEnabled(); deprecate.setEnabled(false) })
    after(function () { deprecate.setEnabled(wasEnabled) })

    it('the vendored headers are the blocks they claim to be', function () {
      idOf(certHeader).should.equal(fixture.block.hash)
      bufs.forEach(function (buf, i) {
        buf.length.should.equal(80)
        idOf(buf).should.equal(chain.headers[i].hash, 'header ' + chain.headers[i].height)
      })
    })

    it('a plain object stating a merkleRoot is refused; a toBuffer() is trusted blindly', function () {
      ;(function () {
        bsv.SPV.verifyTxInclusion({
          header: {
            merkleRoot: fixture.block.merkleroot,
            bits: parseInt(fixture.block.bits, 16)
          },
          txid: 'ab'.repeat(32),
          index: 0,
          nodes: []
        })
      }).should.throw(/must be 80 bytes/)

      // The object says one block and its toBuffer() returns another. The bytes win.
      var liar = { merkleRoot: fixture.block.merkleroot, toBuffer: function () { return bufs[2] } }
      var out = bsv.SPV.verifyTxInclusion({
        header: liar,
        txid: 'ab'.repeat(32),
        index: 0,
        nodes: []
      })
      out.blockHash.should.equal(chain.headers[2].hash)
      documented('is trusted\nblindly')
    })

    it('fromObject corrupts silently for bits as a hex string and for internal-order hashes', function () {
      var b = fixture.block
      var right = bsv.BlockHeader.fromObject({
        version: b.version,
        prevHash: b.previousblockhash,
        merkleRoot: b.merkleroot,
        time: b.time,
        bits: parseInt(b.bits, 16),
        nonce: b.nonce
      })
      right.id.should.equal(b.hash)

      var bitsAsString = bsv.BlockHeader.fromObject({
        version: b.version,
        prevHash: b.previousblockhash,
        merkleRoot: b.merkleroot,
        time: b.time,
        bits: b.bits,
        nonce: b.nonce
      })
      bitsAsString.id.should.not.equal(b.hash)

      var internal = Buffer.from(b.previousblockhash, 'hex').reverse().toString('hex')
      var flipped = bsv.BlockHeader.fromObject({
        version: b.version,
        prevHash: internal,
        merkleRoot: b.merkleroot,
        time: b.time,
        bits: parseInt(b.bits, 16),
        nonce: b.nonce
      })
      flipped.id.should.not.equal(b.hash)
      documented('silent-corruption paths')
    })

    it('neither check has any notion of confirmations or depth', function () {
      /confirmations/.test(bsv.NotaryHash.verifyAnchorSPV.toString()).should.equal(false)
      ;/confirmations|depth/.test(bsv.SPV.verifyHeaderChain.toString()).should.equal(false)
      Object.keys(bsv.NotaryHash).filter(function (k) {
        return /confirm|depth|maturit/i.test(k)
      }).length.should.equal(0)
      documented('no notion of confirmations or depth anywhere')
    })

    it('the envelope height is checked only when the caller supplies one', function () {
      var omitted = bsv.NotaryHash.verifyAnchorSPV(cert, { header: certHeader })
      omitted.valid.should.equal(true)
      var right = bsv.NotaryHash.verifyAnchorSPV(cert, { header: certHeader, height: cert.spv.blockHeight })
      right.valid.should.equal(true)
      var wrong = bsv.NotaryHash.verifyAnchorSPV(cert, { header: certHeader, height: cert.spv.blockHeight + 1 })
      wrong.valid.should.equal(false)
      wrong.errors.join(' ').should.match(/not at the height the SPV envelope names/)
      documented('A header does not carry its height')
    })

    it('blockHashAtHeight checks nothing when it comes from the header or the certificate', function () {
      bsv.NotaryHash.verifyAnchorSPV(cert, {
        header: certHeader, blockHashAtHeight: idOf(certHeader)
      }).valid.should.equal(true)
      bsv.NotaryHash.verifyAnchorSPV(cert, {
        header: certHeader, blockHashAtHeight: cert.spv.blockHash
      }).valid.should.equal(true)
      var elsewhere = bsv.NotaryHash.verifyAnchorSPV(cert, {
        header: certHeader, blockHashAtHeight: '00'.repeat(32)
      })
      elsewhere.valid.should.equal(false)
      elsewhere.errors.join(' ').should.match(/may be orphaned/)
      documented('easy to make circular')
    })

    it('trustedHash is satisfied by either end, and one header is a valid chain', function () {
      var all = bsv.SPV.verifyHeaderChain(bufs)
      all.valid.should.equal(true)
      all.count.should.equal(3)
      bsv.SPV.verifyHeaderChain(bufs, { trustedHash: chain.headers[0].hash }).valid.should.equal(true)
      bsv.SPV.verifyHeaderChain(bufs, { trustedHash: chain.headers[2].hash }).valid.should.equal(true)
      bsv.SPV.verifyHeaderChain(bufs, { trustedHash: chain.headers[1].hash }).valid.should.equal(false)
      Object.keys(all).should.not.include('trustedEnd')

      var alone = bsv.SPV.verifyHeaderChain([bufs[0]], { trustedHash: chain.headers[0].hash })
      alone.valid.should.equal(true)
      alone.count.should.equal(1)

      // out of order is caught, by linkage
      var reversed = bsv.SPV.verifyHeaderChain([bufs[2], bufs[1], bufs[0]],
        { trustedHash: chain.headers[0].hash })
      reversed.valid.should.equal(false)
      reversed.reason.should.match(/broken link/)
      documented('a chain that proves nothing')
    })

    it('the two fields called work are in different units', function () {
      var inclusion = bsv.SPV.verifyTxInclusion({
        header: certHeader,
        txid: bsv.NotaryHash.txidFromRawTx(cert.spv.rawTx),
        index: cert.spv.merkleProof.index,
        nodes: cert.spv.merkleProof.nodes
      })
      inclusion.rootMatches.should.equal(true)
      inclusion.work.should.equal('109822554288093618317')

      var chainWork = bsv.SPV.verifyHeaderChain(bufs).work
      ;(typeof chainWork).should.equal('number')
      // a sum of difficulties, which is the hash count divided by difficulty 1's 4.295e9
      var sum = chain.headers.reduce(function (a, h) { return a + h.difficulty }, 0)
      Math.abs(chainWork - sum).should.be.below(1)
      documented('Two fields called `work`, in two different units')
    })

    it("the docstring's illustrative difficulty, used as a floor, rejects a real block", function () {
      var tooHigh = bsv.NotaryHash.verifyAnchorSPV(cert, { header: certHeader, minDifficulty: '2.6e10' })
      tooHigh.valid.should.equal(false)
      tooHigh.errors.join(' ').should.match(/carries less work than required/)
      bsv.NotaryHash.verifyAnchorSPV(cert, { header: certHeader, minDifficulty: '1e10' })
        .valid.should.equal(true)
      // 109822554288093618317 hashes / 4,295,032,833 = 2.5570e10
      var difficulty = 109822554288093618317 / 4295032833
      difficulty.should.be.below(2.6e10)
      difficulty.should.be.above(2.55e10)
      documented('2.5570e10')
    })

    it('a trusted hash commits to one ancestry: the walk down needs no proof-of-work', function () {
      // Each header's own bytes fix its parent's hash, so a downward walk from a hash you
      // already trust holds with the work checks switched off entirely.
      var down = bsv.SPV.verifyHeaderChain(bufs, {
        trustedHash: chain.headers[2].hash, requirePow: false
      })
      down.valid.should.equal(true)
      down.anchorHash.should.equal(chain.headers[0].hash)
      down.tipHash.should.equal(chain.headers[2].hash)
      // and the link is what carries it: the parent's hash is in the child's bytes
      Buffer.from(bufs[2].slice(4, 36)).reverse().toString('hex').should.equal(chain.headers[1].hash)
      documented('commits to exactly one ancestry')
    })
  })

  describe('5. what a signature commits to under OP_CODESEPARATOR', function () {
    var Script = bsv.Script
    var Sighash = bsv.Transaction.Sighash
    var Interpreter = Script.Interpreter
    var FORKID = Interpreter.SCRIPT_ENABLE_SIGHASH_FORKID
    var CORPUS = require('../data/sighash-codesep-executed.json')
    var sats = new BN(100000)
    function tx () { return new bsv.Transaction(CORPUS.rows[0].txHex) }

    it('commits to the suffix past the last executed separator, not the whole script', function () {
      // two scripts differing only BEFORE the separator sign the same bytes
      var a = Script.fromHex('51ab52ab6a0401020304')
      var b = Script.fromHex('52ab52ab6a0401020304')
      a.toHex().should.not.equal(b.toHex())
      var sufA = Buffer.from(a.toHex(), 'hex').slice(4)
      var sufB = Buffer.from(b.toHex(), 'hex').slice(4)
      sufA.toString('hex').should.equal(sufB.toString('hex'))
      Sighash.sighashPreimage(tx(), 0x41, 0, Script.fromBuffer(sufA), sats, FORKID).toString('hex')
        .should.equal(Sighash.sighashPreimage(tx(), 0x41, 0, Script.fromBuffer(sufB), sats, FORKID).toString('hex'))
      documented('whole locking script.** Two scripts that differ only before that point')
    })

    it('BIP-143 keeps the remaining separators and the original algorithm excises them', function () {
      var suffix = Script.fromHex('52ab6a0401020304')
      Sighash.sighashPreimage(tx(), 0x41, 0, suffix, sats, FORKID).toString('hex')
        .should.contain('0852ab6a0401020304')
      Sighash.sighashPreimage(tx(), 0x01, 0, suffix, sats, FORKID).toString('hex')
        .should.contain('07526a0401020304')
      documented('shortens the declared length with them; BIP-143 keeps them')
    })

    it('routes a CHRONICLE hash type to the original algorithm even with FORKID set', function () {
      var suffix = Script.fromHex('52ab6a0401020304')
      // 0x61 = FORKID | CHRONICLE | ALL: the separator is excised, so it took the original path
      Sighash.sighashPreimage(tx(), 0x61, 0, suffix, sats, FORKID).toString('hex')
        .should.contain('07526a0401020304')
      documented('routes to the original algorithm')
    })

    it('treats a 0xab inside a push operand, and as a length byte, as data', function () {
      Sighash.sighashPreimage(tx(), 0x01, 0, Script.fromHex('5102ab516a'), sats, FORKID)
        .toString('hex').should.contain('055102ab516a')
      Sighash.sighashPreimage(tx(), 0x01, 0, Script.fromHex('4d01ab'), sats, FORKID)
        .toString('hex').should.contain('034d01ab')
      documented('walk it')
    })

    it('fails closed on a hand-built chunk list whose bytes re-parse as one push', function () {
      var hand = new Script().set({
        chunks: [
          { opcodenum: 0x4c, len: 5, buf: Buffer.from('aabb', 'hex') },
          { opcodenum: 0xab }, { opcodenum: 0x51 }, { opcodenum: 0xac }
        ]
      })
      var bytes = hand.toBuffer()
      bytes.toString('hex').should.equal('4c05aabbab51ac')
      Script.fromBuffer(bytes).chunks.length.should.equal(1)
      var t = new bsv.Transaction()
      t.from({ txId: 'ab'.repeat(32), outputIndex: 0, script: bytes.toString('hex'), satoshis: 100000 })
      t.to(bsv.PrivateKey.fromBuffer(Buffer.from('6d'.repeat(32), 'hex')).toAddress(), 50000)
      var flags = FORKID | Interpreter.SCRIPT_VERIFY_STRICTENC
      var i = new Interpreter()
      i.verify(new Script(), hand, t, 0, flags, new BN(100000)).should.equal(false)
      i.errstr.should.equal('SCRIPT_ERR_BAD_OPCODE')
      // and the bytes themselves are spendable by anyone
      new Interpreter().verify(new Script(), Script.fromBuffer(bytes), t, 0, flags, new BN(100000))
        .should.equal(true)
      documented('spendable with an empty scriptSig')
    })
  })
})
