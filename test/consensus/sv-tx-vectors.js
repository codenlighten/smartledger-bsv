'use strict'

/**
 * Consensus ratchet over the SV Node transaction vectors.
 *
 * These reach a level the script corpus cannot. A script vector evaluates one
 * unlocking script against one locking script; these deserialise a whole
 * transaction, resolve each input against the output it claims to spend, and
 * require every one to verify, with locktimes and sequence numbers in play.
 *
 * That level earned itself immediately: it found that Genesis reverts
 * OP_CHECKLOCKTIMEVERIFY and OP_CHECKSEQUENCEVERIFY to upgradable NOPs, which
 * this library did not implement and no script vector can reach — the
 * behaviour only appears once a real nLockTime and sequence number exist.
 */

require('chai').should()
const harness = require('../../tools/sv-tx-harness')

describe('SV Node transaction vectors', function () {
  this.timeout(120000)

  let results = null

  before(function () {
    results = harness.runAll()
  })

  it('runs both files', function () {
    results.length.should.equal(161)
    results.filter(r => r.expected).length.should.equal(93)
    results.filter(r => !r.expected).length.should.equal(68)
  })

  it('accepts no transaction the node rejects', function () {
    const accepts = results.filter(r => r.direction === 'accept')
    const detail = accepts.map(r =>
      '\n  ' + r.id + '  ' + r.reason + '\n      ' + harness.describe(r)).join('')
    accepts.length.should.equal(0, 'false accepts must stay at zero:' + detail)
  })

  it('rejects no transaction the node accepts', function () {
    const rejects = results.filter(r => r.direction === 'reject')
    const detail = rejects.map(r =>
      '\n  ' + r.id + '  ' + r.reason + '\n      ' + harness.describe(r)).join('')
    rejects.length.should.equal(0, 'false rejects must stay at zero:' + detail)
  })
})
