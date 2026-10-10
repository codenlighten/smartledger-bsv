'use strict'

/* global describe, it, before */

// The whole vendored tamper corpus, run against our verifier.
//
// The corpus is the NotaryHash service's own: 32 single-field tampers of one real mainnet
// batch certificate, each carrying the verdict the service's verifier gave it. Three test
// files already read this file — and all three use it as a source of ONE genuine
// certificate (T00) plus a single case each. Thirty of the thirty-two adversarial cases,
// with known-correct verdicts sitting right there in the fixture, were never run against
// anything. A vendored corpus nobody reads is the test-suite form of the defect this
// library spent a release cycle on: a verdict that does not cover what was never looked at.
//
// Two numbers are asserted, and the gap between them is the point:
//
//   31/32 with the default options  — T27 diverges, and that divergence is DELIBERATE
//   32/32 once the caller names the chain via opts.network
//
// T27 relabels anchor.network. The service refuses it because a service knows which chain
// it anchors to. A library does not: it checks the label only when the caller names a chain,
// because inventing an expectation would refuse honest certificates from other networks.
// So the single disagreement with the reference implementation is a contract difference,
// not a defect — and naming the chain closes it. That is what 9.27.0 added, and this is the
// measurement that shows it closing.
//
// The harness answers each case TRUTHFULLY about whatever that case claims, looking the
// hash and the height up in the pinned block set. It never substitutes the genuine
// certificate's values: doing that is what once made a height tamper pass, because the
// verifier was being handed the answer it was supposed to be checking.

require('chai').should()
var bsv = require('../..')
var V = require('../data/notaryhash-tamper-cases.json')

var EXPECTED_IDS = [
  'T00', 'T01', 'T02', 'T03', 'T04', 'T05', 'T06', 'T07', 'T08', 'T09', 'T10', 'T11',
  'T12', 'T13', 'T14', 'T15', 'T16', 'T17', 'T18', 'T19', 'T20', 'T21', 'T22', 'T23',
  'T24', 'T25', 'T26', 'T27', 'T28', 'T29', 'T30', 'T31'
]

function headerHex (b) {
  var h = bsv.BlockHeader.fromObject({
    version: b.version,
    prevHash: Buffer.from(b.previousblockhash, 'hex').reverse(),
    merkleRoot: Buffer.from(b.merkleroot, 'hex').reverse(),
    time: b.time,
    bits: typeof b.bits === 'string' ? parseInt(b.bits, 16) : b.bits,
    nonce: b.nonce
  })
  if (h.id !== b.hash) throw new Error('pinned block ' + b.hash + ' did not rebuild')
  return h.toBuffer().toString('hex')
}

describe('the NotaryHash tamper corpus, in full', function () {
  var byHash, byHeight, network

  before(function () {
    var blocks = Array.isArray(V.blocks)
      ? V.blocks
      : Object.keys(V.blocks).map(function (k) { return V.blocks[k] })
    byHash = {}
    byHeight = {}
    blocks.forEach(function (b) { byHash[b.hash] = headerHex(b); byHeight[b.height] = b.hash })
    var genuine = V.cases.filter(function (c) { return c.id === 'T00' })[0].certificate
    network = genuine.anchor.network
  })

  // Returns { id, want, got, why } per case, or null when the pinned blocks cannot speak
  // to what the case claims — "I could not look" is never recorded as a verdict.
  function run (extraOpts) {
    return V.cases.map(function (c) {
      var spv = c.certificate && c.certificate.spv
      var header = spv && byHash[spv.blockHash]
      var hashAtHeight = spv && byHeight[spv.blockHeight]
      if (!header || !hashAtHeight) return null
      var opts = { header: header, blockHashAtHeight: hashAtHeight }
      if (extraOpts) Object.keys(extraOpts).forEach(function (k) { opts[k] = extraOpts[k] })
      var r
      try { r = bsv.NotaryHash.verify(c.certificate, opts) } catch (e) {
        r = { valid: false, errors: ['threw: ' + e.message] }
      }
      return {
        id: c.id,
        want: c.notaryhash.verdict,
        got: r.valid ? 'accept' : 'refuse',
        why: String((r.errors || [])[0] || '')
      }
    }).filter(Boolean)
  }

  it('is the corpus we vendored, entire', function () {
    V.cases.map(function (c) { return c.id }).should.deep.equal(EXPECTED_IDS)
  })

  it('can answer every case from the pinned blocks, with nothing skipped', function () {
    run().length.should.equal(EXPECTED_IDS.length)
  })

  it('agrees with the service on 31 of 32, T27 being the only divergence', function () {
    var differ = run().filter(function (r) { return r.got !== r.want })
    differ.map(function (r) { return r.id }).should.deep.equal(['T27'])
    // And in the safe direction to be wrong about only because the caller declined to say:
    differ[0].want.should.equal('refuse')
    differ[0].got.should.equal('accept')
  })

  it('agrees on all 32 once the caller names the chain', function () {
    var rows = run({ network: network })
    var differ = rows.filter(function (r) { return r.got !== r.want })
    differ.map(function (r) { return r.id + ' (' + r.want + ' vs ' + r.got + ')' })
      .should.deep.equal([])
    rows.length.should.equal(EXPECTED_IDS.length)
  })

  it('refuses every tamper for a stated reason, never silently', function () {
    run({ network: network }).forEach(function (r) {
      if (r.got === 'refuse') r.why.should.not.equal('')
    })
  })
})
