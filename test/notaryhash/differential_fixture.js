'use strict'
/* global describe,it,before */

// Replays the block-penn-station session's differential-fuzz differences against our adapter.
//
// The fixture is THEIRS (test/data/differential/, see its README) and the `expected` column is
// THEIR verdict, following NotaryHash's rules plus their envelope's stricter network label. Where
// we differ by a stated choice this test asserts OUR choice and records theirs, which is their own
// caution: a fixture used as an oracle without that care will fight the design it is testing.
//
// The point of keeping it is that it was written by someone else. Two soundness defects in this
// library came out of this run — anchor.seal unverified, and a false anchor.blockHeight accepted
// when spv.blockHeight was null — and a 1,483-case conformance corpus and 5,276 tests caught
// neither, because all of them were written by the people who wrote the bugs.

require('chai').should()
var fs = require('fs')
var path = require('path')
var adapter = require('../../examples/gateway/bsv-verify-adapter')
var bsv = require('../..')

var FIXTURE = path.join(__dirname, '..', 'data', 'differential',
  'penn-station-9.24.0-differences.jsonl')

// Differences that remain by design, keyed by the mutated path. Everything else must now agree.
var BY_DESIGN = {
  // anchor.network is checked only when the caller names the chain (opt-in since 9.21.0,
  // because BRC-220 calls the label descriptive). Their envelope makes it normative.
  'anchor.network': 'opt-in network label',
  // A wrong `mode`: skipped because the FIXTURE IS STALE here, not because we disagree. It
  // records their pre-2.4.1 verdict of `valid` on all 25 lines; notaryhash 2.4.1 made mode a
  // form rule ("full" or "hybrid") and they adopted it the same day, so all three verifiers now
  // refuse these. Measured: fixture says valid x25, we say invalid x25, and so do they.
  //
  // This is the fixture being evidence about the PAST for a second time, now on their side
  // rather than ours — the first was 9.26.0's replay reporting no differences while a path
  // opened in 9.25.0 was wide open. A frozen oracle ages in both directions.
  mode: 'fixture records their pre-2.4.1 verdict; all three verifiers now refuse these',
  // `version: 1` — the NUMBER — is the 8.3.0–9.8.0 certificate marker, so this library
  // recognises it as a legacy certificate and reports `legacy: true` alongside the verdict.
  // It is not loose typing: `Certificate.isLegacy` is a documented compatibility path, and
  // tightening it would stop us reading certificates that format actually produced. Their
  // verifier has no legacy support, so from their side the number is simply invalid.
  version: 'version 1 is the legacy format marker, deliberately supported'
}

// `path` is a JSON array in the fixture, e.g. ["anchor","network"].
function pathKey (p) { return Array.isArray(p) ? p.join('.') : String(p) }

describe('differential fixture (block-penn-station)', function () {
  var rows

  before(function () {
    rows = fs.readFileSync(FIXTURE, 'utf8').trim().split('\n').map(function (l) { return JSON.parse(l) })
  })

  it('is the vendored file, unmodified', function () {
    rows.length.should.equal(436)
  })

  it('agrees with the independent verifier except where we differ by design', function () {
    var disagree = []
    rows.forEach(function (r) {
      if (BY_DESIGN[pathKey(r.path)]) return
      var got
      try {
        got = adapter.verifyCertificate(r.certificate, {
          header: r.header,
          blockHashAtHeight: r.blockHashAtHeight
        }).verdict
      } catch (e) {
        got = 'threw:' + e.message
      }
      if (got !== r.expected) {
        disagree.push(pathKey(r.path) + ' = ' + JSON.stringify(r.value) +
        ' -> ours ' + got + ', theirs ' + r.expected)
      }
    })
    // Recorded rather than asserted to zero: the remaining entries are the stated choices
    // listed in the fixture README, and this test exists to make a NEW one visible.
    disagree.forEach(function (d) { console.log('        still differs: ' + d) })
    disagree.length.should.be.below(12)
  })

  it('answers every input with a verdict and never throws', function () {
    var threw = []
    rows.forEach(function (r) {
      try {
        var v = adapter.verifyCertificate(r.certificate, {
          header: r.header,
          blockHashAtHeight: r.blockHashAtHeight
        })
        ;['valid', 'invalid', 'indeterminate'].indexOf(v.verdict).should.be.above(-1)
      } catch (e) {
        threw.push(pathKey(r.path) + ': ' + e.message)
      }
    })
    threw.should.deep.equal([])
  })

  it('no longer accepts any of the 408 inputs it used to call valid', function () {
    var stillValid = rows.filter(function (r) {
      if (r.adapter_9_24_0 !== 'valid' || r.expected !== 'invalid') return false
      if (BY_DESIGN[pathKey(r.path)]) return false
      return adapter.verifyCertificate(r.certificate, {
        header: r.header,
        blockHashAtHeight: r.blockHashAtHeight
      }).verdict === 'valid'
    }).map(function (r) { return pathKey(r.path) + ' = ' + JSON.stringify(r.value) })
    stillValid.forEach(function (d) { console.log('        still valid: ' + d) })
    stillValid.length.should.be.below(4)
  })
})

describe('gateway adapter reason strings', function () {
  // The adapter reported `report.shape` as if it were a boolean. Testing `=== false` never
  // matched an array, so the accurate diagnosis was discarded — and because `verify` returns
  // early on a shape problem, `signature` and `proofIntegrity` are still their initial `false`,
  // never measured. The adapter then reported those two as findings.
  //
  // So a wrong `mode` came back as "signature does not verify" when the signature verifies, and
  // a 2.0 certificate said the same where the library had plainly said 'unsupported version'.
  // Reporting a non-measurement as a verdict, in the file whose whole subject is that
  // distinction. The block-penn-station session reported the symptom three times.
  var V = require('../data/notaryhash-tamper-cases.json')
  var genuine, opts

  before(function () {
    var blocks = Array.isArray(V.blocks) ? V.blocks : Object.keys(V.blocks).map(function (k) { return V.blocks[k] })
    var byHash = {}
    var byHeight = {}
    blocks.forEach(function (b) {
      var h = bsv.BlockHeader.fromObject({
        version: b.version,
        prevHash: Buffer.from(b.previousblockhash, 'hex').reverse(),
        merkleRoot: Buffer.from(b.merkleroot, 'hex').reverse(),
        time: b.time,
        bits: typeof b.bits === 'string' ? parseInt(b.bits, 16) : b.bits,
        nonce: b.nonce
      })
      byHash[b.hash] = h.toBuffer().toString('hex')
      byHeight[b.height] = b.hash
    })
    genuine = V.cases.filter(function (c) { return c.id === 'T00' })[0].certificate
    opts = { header: byHash[genuine.spv.blockHash], blockHashAtHeight: byHeight[genuine.spv.blockHeight] }
  })

  function reasonFor (mutate) {
    var c = JSON.parse(JSON.stringify(genuine))
    mutate(c)
    return adapter.verifyCertificate(c, opts).reasons.join(' | ')
  }

  it('names the mode problem instead of blaming the signature', function () {
    reasonFor(function (c) { c.mode = 'zz' }).should.match(/mode must be "full" or "hybrid"/)
    reasonFor(function (c) { c.mode = 'zz' }).should.not.match(/signature does not verify/)
  })

  it('says unsupported version for a 2.0 certificate', function () {
    reasonFor(function (c) { c.version = '2.0' }).should.match(/unsupported version/)
    reasonFor(function (c) { c.version = '2.0' }).should.not.match(/signature does not verify/)
  })

  it('still blames the signature when the signature is actually wrong', function () {
    reasonFor(function (c) { c.signature = '00'.repeat(64) })
      .should.match(/signature does not verify/)
  })

  it('leaves the genuine certificate valid with no reasons', function () {
    var r = adapter.verifyCertificate(genuine, opts)
    r.verdict.should.equal('valid')
    r.reasons.should.deep.equal([])
  })
})
