'use strict'

/**
 * Transaction digest vectors from SV Node v1.2.0.
 *
 * Each row carries two expected digests for the same inputs:
 *
 *   [ raw_transaction, script, input_index, hashType,
 *     signature_hash (regular), signature_hash (no forkid) ]
 *
 * Two columns pin the routing in SignatureHash() rather than one branch of it.
 * The node takes BIP143 only when forkid is enabled AND requested AND the
 * signature has not asked for the original algorithm:
 *
 *   if(enabledSighashForkid && sigHashType.hasForkId() && !sigHashType.hasChronicle())
 *       return SignatureHashBIP143(...);
 *   return SignatureHashOriginal(...);
 *
 * Note where the Chronicle bit is NOT consulted: the node does not ask whether
 * Chronicle is enabled before honouring it. That gating lives in
 * CheckSignatureEncoding, which rejects a signature carrying the bit outside
 * Chronicle as SCRIPT_ERR_ILLEGAL_CHRONICLE. So for the rows whose hash type
 * sets 0x20, both columns are identical — the original algorithm is taken
 * either way — and that is what makes the two columns worth having.
 */

require('chai').should()
const bsv = require('../..')
const Script = bsv.Script
const BN = bsv.crypto.BN
const Transaction = bsv.Transaction
const Signature = bsv.crypto.Signature
const Interpreter = bsv.Script.Interpreter
const sighash = Transaction.Sighash

const vectors = require('../data/bitcoin-sv/sighash.json')

const FORKID = Interpreter.SCRIPT_ENABLE_SIGHASH_FORKID
const zeroBN = BN.Zero

describe('SV Node sighash vectors', function () {
  this.timeout(120000)

  // The first row names the columns.
  const rows = vectors.slice(1).filter(v => v.length >= 6)

  it('covers the whole corpus', function () {
    rows.length.should.equal(1000)
  })

  it('matches the node on both digest columns', function () {
    const failures = []
    let chronicleRows = 0

    rows.forEach(function (vector, i) {
      const tx = new Transaction(Buffer.from(vector[0], 'hex'))
      const nin = vector[2]
      const nhashtype = vector[3]

      // A fresh Script per call: the original algorithm removes code
      // separators in place, so sharing one would let the first call change
      // what the second is given.
      function digest (flags) {
        return sighash.sighash(tx, nhashtype, nin,
          Script(Buffer.from(vector[1], 'hex')), zeroBN, flags).toString('hex')
      }

      let regular, noForkId
      try {
        regular = digest(FORKID)
        noForkId = digest(0)
      } catch (e) {
        failures.push('#' + (i + 1) + ' threw: ' + String(e.message).slice(0, 60))
        return
      }

      if (regular !== vector[4]) {
        failures.push('#' + (i + 1) + ' regular: ' + regular + ' != ' + vector[4])
      }
      if (noForkId !== vector[5]) {
        failures.push('#' + (i + 1) + ' no forkid: ' + noForkId + ' != ' + vector[5])
      }
      if ((nhashtype >>> 0) & Signature.SIGHASH_CHRONICLE) chronicleRows++
    })

    chronicleRows.should.be.above(0)
    failures.slice(0, 8).should.deep.equal([],
      failures.length + ' of ' + rows.length + ' rows disagree with the node')
  })

  it('routes every Chronicle-bit row to the original digest', function () {
    // Stated separately so a routing regression reads as one rather than as
    // hundreds of hash mismatches.
    const withBit = rows.filter(v => (v[3] >>> 0) & Signature.SIGHASH_CHRONICLE)
    withBit.length.should.equal(511)
    withBit.forEach(v => v[4].should.equal(v[5]))
  })
})
