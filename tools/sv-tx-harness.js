'use strict'

/**
 * Harness for the SV Node transaction vectors in test/data/bitcoin-sv.
 *
 * These reach a level the script vectors do not. A script vector evaluates one
 * unlocking script against one locking script; these deserialise a whole
 * transaction, resolve each input against the outputs it claims to spend, and
 * require every one of them to verify — across multiple inputs, with locktimes
 * and sequence numbers in play, and with the transaction's own structural
 * checks applied.
 *
 * Row layout, from the node's src/test/transaction_tests.cpp:
 *
 *   [ [[prevout hash, prevout n, scriptPubKey, amount?], ...],
 *     serialized transaction,
 *     flags ]
 *
 * A row in tx_valid.json must verify; one in tx_invalid.json must not. A
 * prevout index of -1 is the node casting to an unsigned int, so it means
 * 0xffffffff. The amount is present only where a row needs one.
 */

const bsv = require('..')
const Transaction = bsv.Transaction
const Interpreter = bsv.Script.Interpreter
const BN = bsv.crypto.BN

const harness = require('./sv-vector-harness')

const validVectors = require('../test/data/bitcoin-sv/tx_valid.json')
const invalidVectors = require('../test/data/bitcoin-sv/tx_invalid.json')

/** A stable id for a row, so a list of known failures survives reordering. */
function vectorId (raw) {
  return harness.vectorId(raw)
}

/**
 * Resolve each input against the output it spends and verify it.
 *
 * Returns { ok, reason }. `ok` is whether the transaction verifies overall,
 * which requires the structural checks to pass and every non-null input to
 * verify.
 */
function evaluate (row) {
  const prevouts = {}
  row[0].forEach(function (p) {
    // -1 is the node's cast of an unsigned index.
    const n = p[1] === -1 ? 0xffffffff : p[1]
    prevouts[p[0] + ':' + n] = {
      script: harness.fromBitcoindString(p[2]),
      satoshis: p.length > 3 ? p[3] : 0
    }
  })

  const tx = new Transaction(row[1])
  const cls = harness.classifyFlags(row[2])

  // The node runs these vectors at ProtocolEra::PreGenesis explicitly —
  // transaction_tests.cpp says so — which is why one tx_valid row legitimately
  // carries a P2SH output, an output Genesis stopped anyone creating. This
  // library's verify() has no era and applies the pre-Genesis rules, which is
  // what these vectors want.
  let structural
  try {
    structural = tx.verify()
  } catch (e) {
    return { ok: false, reason: 'tx.verify threw: ' + String(e.message).slice(0, 60) }
  }
  if (structural !== true) {
    return { ok: false, reason: 'tx.verify: ' + structural }
  }

  for (let i = 0; i < tx.inputs.length; i++) {
    const input = tx.inputs[i]
    if (input.isNull()) {
      continue
    }
    const key = input.prevTxId.toString('hex') + ':' + input.outputIndex
    const prevout = prevouts[key]
    if (prevout === undefined) {
      return { ok: false, reason: 'no prevout given for input ' + i }
    }
    const interp = new Interpreter()
    const verified = interp.verify(
      input.script, prevout.script, tx, i, cls.flags, new BN(prevout.satoshis)
    )
    if (!verified) {
      return { ok: false, reason: 'input ' + i + ': ' + interp.errstr }
    }
  }

  return { ok: true, reason: null }
}

/**
 * Run both files. Each result is
 *
 *   { id, expected, ok, passed, reason, direction, comment }
 *
 * `direction` is 'accept' where we accepted a transaction the node rejects —
 * the dangerous way round — and 'reject' for the converse.
 */
function runAll () {
  const results = []

  const run = function (vectors, expected) {
    let comment = ''
    vectors.forEach(function (raw) {
      if (!Array.isArray(raw)) return
      if (raw.length === 1) {
        // A single-element row is a comment describing the rows below it.
        comment = String(raw[0])
        return
      }

      let got = null
      let thrown = null
      try {
        got = evaluate(raw)
      } catch (e) {
        thrown = e
      }

      let reason = null
      let direction = null
      const ok = thrown === null && got.ok

      if (thrown !== null) {
        reason = 'threw: ' + String(thrown.message).slice(0, 70)
        direction = expected ? 'reject' : null
        if (!expected) {
          // Throwing on a transaction the node also rejects is the right
          // outcome reached untidily, not a consensus failure.
          reason = null
        }
      } else if (ok !== expected) {
        reason = expected
          ? 'expected valid, rejected with ' + got.reason
          : 'expected invalid, but ACCEPTED'
        direction = expected ? 'reject' : 'accept'
      }

      results.push({
        id: vectorId(raw),
        expected,
        ok,
        passed: reason === null,
        reason,
        direction,
        comment
      })
    })
  }

  run(validVectors, true)
  run(invalidVectors, false)
  return results
}

/** A one-line description of a row, for failure output. */
function describe (result) {
  return (result.expected ? 'tx_valid' : 'tx_invalid') +
    (result.comment ? '  // ' + result.comment.slice(0, 70) : '')
}

module.exports = {
  runAll,
  evaluate,
  describe
}
