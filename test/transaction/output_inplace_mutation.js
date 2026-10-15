'use strict'

/* global describe, it, beforeEach, afterEach */

// A parsed output script handed out by the `script` getter is the live object, but
// `toBufferWriter` writes `_scriptBuffer` — the bytes the output was SET from. So a caller who
// mutates the script in place loses the mutation from the transaction, while `getSize()`
// measures the mutated object and reports a size the transaction will not have. Both halves are
// pinned here, along with the 9.39.0 notice that makes the divergence audible and the one-line
// remedy that resolves it.
//
// The behaviour itself is deliberate and unchanged, and the notice cannot fire without a
// mutation: parsing a script and re-encoding it is byte-faithful in this library, which the last
// test in this file pins. An outside review argued the opposite — that an untouched
// non-canonical script could re-encode differently and warn on its own — and the measurement
// settled it: 0 divergences over every script of three bytes or fewer plus a push-biased random
// sweep. That fidelity is what makes the 10.0.0 options in docs/RELEASE-10.0.0.md decidable.

require('chai').should()
var bsv = require('../..')
var deprecate = require('../../lib/util/deprecate')

describe('Output in-place script mutation', function () {
  var was, origWarn, warned
  beforeEach(function () {
    was = deprecate.isEnabled()
    deprecate.setEnabled(false)
    deprecate.reset()
    warned = []
    origWarn = console.warn
    console.warn = function (m) { warned.push(m) }
  })
  afterEach(function () {
    console.warn = origWarn
    deprecate.setEnabled(was)
    deprecate.reset()
  })

  function oneOutputTx () {
    var tx = new bsv.Transaction()
    tx.to(bsv.PrivateKey.fromRandom().toAddress(), 1000)
    return tx
  }

  it('drops a mutation made through the script getter from the serialized transaction', function () {
    var tx = oneOutputTx()
    var before = tx.toString()
    tx.outputs[0].script.add(bsv.Opcode.OP_NOP)
    tx.outputs[0].script.toASM().should.match(/OP_NOP$/)
    tx.toString().should.equal(before, 'the mutation must not reach the bytes without a re-set')
    bsv.Transaction(tx.toString()).outputs[0].script.toASM().should.not.match(/OP_NOP$/)
  })

  it('getSize() and the serialized length disagree after such a mutation', function () {
    var tx = oneOutputTx()
    var out = tx.outputs[0]
    var serialized = out.toBufferWriter().toBuffer().length
    out.script.add(bsv.Opcode.OP_NOP)
    out.getSize().should.equal(serialized + 1)
    out.toBufferWriter().toBuffer().length.should.equal(serialized)
  })

  it('says so once, through the 9.39.0 notice', function () {
    deprecate.setEnabled(true)
    var tx = oneOutputTx()
    tx.outputs[0].script.add(bsv.Opcode.OP_NOP)
    deprecate.fired().length.should.equal(0, 'the mutation alone must not fire it')
    tx.outputs[0].getSize()
    var fired = deprecate.fired()
    fired.length.should.equal(1)
    fired[0].what.should.equal('mutating a parsed output script in place and expecting it to serialize')
    fired[0].removeIn.should.equal('10.0.0')
    tx.outputs[0].getSize()
    deprecate.fired().length.should.equal(1, 'warn once, not once per size enquiry')
    warned.length.should.equal(1, 'and one line on the console, not one per call')
  })

  it('stays silent when the object and the bytes agree', function () {
    deprecate.setEnabled(true)
    var tx = oneOutputTx()
    tx.outputs[0].getSize()
    tx.outputs[0].script.toASM()
    tx.outputs[0].getSize()
    deprecate.fired().length.should.equal(0)
  })

  it('stays silent on the null-script path, which answers from the raw bytes', function () {
    deprecate.setEnabled(true)
    // Since 9.35.0 every byte string parses, so no INPUT reaches this path any more (see
    // output_unparseable_script.js). The guard stays because an Output can still be handed a
    // null script, and the notice must not fire there: with no parsed object there is no
    // mutation to compare against, and the raw bytes are what serializes either way.
    var out = new bsv.Transaction.Output({ satoshis: 1000, script: Buffer.from('4c', 'hex') })
    out._script = null
    out.getSize().should.equal(8 + 1 + 1)
    out.getSize().should.equal(out.toBufferWriter().toBuffer().length)
    deprecate.fired().length.should.equal(0)
  })

  it('the documented remedy re-syncs the bytes', function () {
    var tx = oneOutputTx()
    var before = tx.toString()
    tx.outputs[0].script.add(bsv.Opcode.OP_NOP)
    tx.outputs[0].setScript(tx.outputs[0].script)
    tx.toString().should.not.equal(before)
    bsv.Transaction(tx.toString()).outputs[0].script.toASM().should.match(/OP_NOP$/)
    var out = tx.outputs[0]
    out.getSize().should.equal(out.toBufferWriter().toBuffer().length)
  })

  it('parse and re-encode is byte-faithful, which is why the notice has no false positives', function () {
    // Exhaustive over every script of two bytes or fewer, plus the shapes that would be the
    // candidates for a divergence: non-minimal pushes and cut-off length prefixes. The full
    // 0..3-byte sweep (16,843,009 scripts) and a 400,000-script push-biased random sweep were
    // run once, both clean; three bytes exhaustive is too slow for every suite run, so the
    // boundary cases stand in for it here.
    var divergent = []
    function check (buf) {
      var out
      try { out = bsv.Script.fromBuffer(buf).toBuffer() } catch (e) { divergent.push([buf.toString('hex'), 'threw ' + e.message]); return }
      if (!out.equals(buf)) divergent.push([buf.toString('hex'), out.toString('hex')])
    }
    check(Buffer.alloc(0))
    for (var a = 0; a < 256; a++) {
      check(Buffer.from([a]))
      for (var b = 0; b < 256; b++) check(Buffer.from([a, b]))
    }
    ;['4c01ff', '4d0100ff', '4e01000000ff', '01ff', '6a4c', '6a4d01', '6a4e0100', '4c', '4c00',
      '4d0000', '4e00000000', '6a4c050102', '6a0548656c6c6f', 'ab'.repeat(600)
    ].forEach(function (hex) { check(Buffer.from(hex, 'hex')) })
    divergent.should.deep.equal([], 'a script that does not re-encode to its own bytes would make ' +
      'the 9.39.0 notice fire without any mutation, and would make the documented remedy change ' +
      'an untouched output')
  })

  it('an input mutated in place loses it too, and nothing there can see it for free', function () {
    var tx = new bsv.Transaction().from({
      txId: 'ab'.repeat(32),
      outputIndex: 0,
      script: bsv.Script.buildPublicKeyHashOut(bsv.PrivateKey.fromRandom().toAddress()).toHex(),
      satoshis: 5000
    })
    var before = tx.toString()
    tx.inputs[0].script.add(bsv.Opcode.OP_NOP)
    tx.toString().should.equal(before)
    tx.inputs[0].script.toASM().should.match(/OP_NOP$/)
    // No divergence to detect for free on this side: Input#toBufferWriter writes _scriptBuffer
    // and never computes the object's bytes, and PublicKeyHashInput#_estimateSize returns a
    // SIGNED-size estimate (148 for one P2PKH input) rather than a measurement of the object,
    // so neither call sits where a comparison would be free. The notice is therefore an output
    // notice only, and docs/RELIED-UPON-PROPERTIES.md says so.
    tx.inputs[0]._estimateSize().should.be.above(tx.inputs[0].toBufferWriter().toBuffer().length)
    tx.inputs[0].setScript(tx.inputs[0].script)
    tx.toString().should.not.equal(before)
  })
})
