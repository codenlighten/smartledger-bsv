'use strict'
/* global describe,it,before */

// spv.format names the format the proof is checked as, and nothing signs it.
//
// The proof is folded as TSC whatever the field says, so a certificate can carry a genuine
// proof, a genuine signature and a genuine root while declaring a format nobody implements.
// We used to accept that. The argument for accepting it was that every cryptographic fact
// checks out, and that refusing on an unsigned field lets anyone who can alter a certificate
// in transit turn a valid record into a rejection.
//
// It does not survive the distinction it elides: verifying a proof is not accepting a
// self-described certificate. We can establish that the proof folds as TSC to the committed
// root; we cannot return an unqualified `valid` for a document that says it is something we
// never read. And an attacker who can rewrite the label can rewrite the proof, so refusing
// grants no capability tampering did not already have.
//
// The vector is the NotaryHash service's own tamper set, vendored with its provenance; T28 is
// the genuine certificate with ONE unsigned field changed, TSC -> BUMP.

require('chai').should()
var bsv = require('../..')
var V = require('../data/notaryhash-tamper-cases.json')

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

describe('NotaryHash spv.format', function () {
  var byHash = {}
  var byHeight = {}
  var caseById = {}

  before(function () {
    var blocks = Array.isArray(V.blocks) ? V.blocks : Object.keys(V.blocks).map(function (k) { return V.blocks[k] })
    blocks.forEach(function (b) {
      byHash[b.hash] = headerHex(b)
      byHeight[b.height] = b.hash
    })
    V.cases.forEach(function (c) { caseById[c.id] = c })
  })

  // The height is asked of the pinned chain, never taken from the certificate. Passing
  // certificate.spv.blockHash as blockHashAtHeight is circular and makes a height tamper pass.
  function verify (certificate, extra) {
    var opts = { header: byHash[certificate.spv && certificate.spv.blockHash] }
    var at = byHeight[certificate.spv && certificate.spv.blockHeight]
    if (at) opts.blockHashAtHeight = at
    if (extra) Object.keys(extra).forEach(function (k) { opts[k] = extra[k] })
    return bsv.NotaryHash.verify(certificate, opts)
  }

  it('refuses a certificate whose spv.format is not TSC', function () {
    var r = verify(caseById.T28.certificate)
    r.valid.should.equal(false)
    r.errors.join(' | ').should.match(/spv\.format is "BUMP" but only "TSC" proofs are verified/)
  })

  it('still reports that the proof folded, because only the label is wrong', function () {
    var r = verify(caseById.T28.certificate)
    r.proofIntegrity.should.equal(true)
  })

  it('accepts the same certificate under allowUnknownSpvFormat', function () {
    verify(caseById.T28.certificate, { allowUnknownSpvFormat: true }).valid.should.equal(true)
  })

  it('leaves the genuine certificate accepted', function () {
    verify(caseById.T00.certificate).valid.should.equal(true)
  })

  it('accepts TSC in any case, and a certificate with no format field', function () {
    var c = JSON.parse(JSON.stringify(caseById.T00.certificate))
    c.spv.format = 'tsc'
    verify(c).valid.should.equal(true)
    var d = JSON.parse(JSON.stringify(caseById.T00.certificate))
    delete d.spv.format
    verify(d).valid.should.equal(true)
  })

  it('agrees with the service verifier on every case but the opt-in network label', function () {
    var differ = []
    V.cases.forEach(function (c) {
      var got
      try { got = verify(c.certificate).valid ? 'accept' : 'refuse' } catch (e) { got = 'threw' }
      if (got !== c.notaryhash.verdict) differ.push(c.id)
    })
    // T27 relabels anchor.network, which this library checks only when the caller passes
    // opts.network — see the note on that check. Everything else must match.
    differ.should.deep.equal(['T27'])
  })

  it('refuses T27 too once the caller says which chain it expects', function () {
    var r = verify(caseById.T27.certificate, { network: 'bsv-mainnet' })
    r.valid.should.equal(false)
    r.errors.join(' | ').should.match(/anchor\.network is "bsv-testnet"/)
  })
})
