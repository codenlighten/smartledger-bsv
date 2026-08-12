'use strict'

/**
 * How far this library's transaction digest is from the reference node.
 *
 *   npm run vectors:sv-sighash
 *   npm run vectors:sv-sighash -- --verbose
 *
 * There is no accept/reject direction to report here as there is for the
 * script and transaction vectors: a digest either matches or it does not, and
 * a wrong one is equally bad either way — it makes valid signatures unverifiable
 * and, worse, signs something other than what the caller was shown.
 *
 * The breakdown by algorithm is the useful reading, because the failure this
 * corpus is best at catching is a routing mistake rather than a hashing one.
 */

const harness = require('./sv-sighash-harness')

const verbose = process.argv.indexOf('--verbose') !== -1
const results = harness.runAll()

const failing = results.filter(r => !r.passed)
const passing = results.length - failing.length
const chronicle = results.filter(r => r.chronicleBit)
const bip143 = results.filter(r => r.algorithm === 'BIP143')
const otda = results.filter(r => r.algorithm === 'OTDA')

function line (label, subset) {
  const bad = subset.filter(r => !r.passed).length
  console.log('  ' + label.padEnd(34),
    String(subset.length - bad).padStart(4) + '/' + String(subset.length).padEnd(5),
    bad ? '  <- ' + bad + ' failing' : '')
}

console.log()
console.log('=== SV Node v1.2.0 transaction digest vectors ===')
console.log()
console.log('vectors run   :', results.length, '(each checked on both columns)')
console.log('passing       :', passing,
  ' (' + (100 * passing / results.length).toFixed(1) + '%)')
console.log('failing       :', failing.length)
console.log()
console.log('--- by routing ---')
line('BIP-143 digest', bip143)
line('original digest (OTDA)', otda)
line('  of which set SIGHASH_CHRONICLE', chronicle)

if (failing.length) {
  const byReason = {}
  failing.forEach(function (r) {
    const key = String(r.reason).replace(/:.*/, '')
    byReason[key] = (byReason[key] || 0) + 1
  })
  console.log()
  console.log('--- failure reasons ---')
  Object.keys(byReason).sort((a, b) => byReason[b] - byReason[a])
    .forEach(k => console.log(String(byReason[k]).padStart(5), k))

  console.log()
  console.log('--- failing rows ---')
  failing.slice(0, verbose ? failing.length : 10).forEach(function (r) {
    console.log('  #' + String(r.index).padStart(4) +
      '  hashType 0x' + (r.hashType >>> 0).toString(16).padStart(2, '0') +
      '  ' + r.algorithm.padEnd(7) + r.reason)
  })
  if (!verbose && failing.length > 10) {
    console.log('  ... and ' + (failing.length - 10) + ' more; pass --verbose')
  }
}
console.log()
