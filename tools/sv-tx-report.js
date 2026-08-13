'use strict'

/**
 * How far this interpreter is from the node at the transaction level.
 *
 *   npm run vectors:sv-tx
 *
 * A script vector evaluates one unlocking script against one locking script.
 * These deserialise a whole transaction, resolve each input against the output
 * it claims to spend, and require every one to verify — with locktimes,
 * sequence numbers and multiple inputs in play. That reaches rules no single
 * script can.
 */

const harness = require('./sv-tx-harness')

const results = harness.runAll()
const failing = results.filter(r => !r.passed)
const accepts = failing.filter(r => r.direction === 'accept')
const rejects = failing.filter(r => r.direction === 'reject')

console.log()
console.log('=== SV Node v1.2.0 transaction vectors ===')
console.log()
console.log('vectors run   :', results.length,
  '(' + results.filter(r => r.expected).length + ' must verify, ' +
  results.filter(r => !r.expected).length + ' must not)')
console.log('passing       :', results.length - failing.length,
  ' (' + (100 * (results.length - failing.length) / results.length).toFixed(1) + '%)')
console.log()
console.log('  false accepts (we accept, node rejects) :', accepts.length,
  accepts.length ? '  <- the direction that can cost money' : '')
console.log('  false rejects (we reject, node accepts) :', rejects.length)

if (failing.length) {
  console.log()
  console.log('--- failing ---')
  failing.forEach(function (r) {
    console.log('  ' + r.id + '  ' + r.reason)
    console.log('      ' + harness.describe(r))
  })
}
console.log()
