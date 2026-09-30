'use strict'

/**
 * What can this corpus NOT tell us?
 *
 * A 1483/1483 score says we agree with the corpus. It says nothing about any rule the corpus
 * never asks about, and the percentage cannot distinguish the two. This reports the difference.
 *
 * The idea is the bsv-scale-protocol session's: tally the verdicts a corpus expects, diff
 * against the verdicts the engine can emit, and name what is left over. Its Rust version is
 * `verdict coverage`; this is the JavaScript one.
 *
 * It reports three axes, because verdict coverage alone would NOT have caught either defect
 * this library shipped:
 *
 *   1. VERDICTS — codes the engine can emit that no row expects. A guard that is present,
 *      reachable, and never once exercised by the file we certify ourselves against.
 *
 *   2. FLAG PAIRS — the axis that actually mattered. `SIG_HASHTYPE` IS exercised, by 7 rows, so
 *      verdict coverage calls it covered. But no row sets LOW_S at the same time, and LOW_S is
 *      what masked it. A check can only be shadowed by another check that is also on, so the
 *      unit of coverage for masking is the PAIR, not the flag.
 *
 *   3. TRANSACTION VERSION — every row here carries version 1, so no row can reach Chronicle's
 *      malleability relaxations, which apply only above 1. A single column, constant across the
 *      whole corpus, silently removed seven rules from the test.
 *
 * Exits 0 always: this measures the corpus, it does not judge the engine.
 */

const fs = require('fs')
const path = require('path')
const harness = require('./sv-vector-harness')

const rows = require('../test/data/bitcoin-sv/script_tests.json')

/** Every SCRIPT_ERR_* this engine can produce, read from the source that produces them. */
function emittableVerdicts () {
  const files = ['../lib/script/interpreter.js', '../lib/script/script.js']
  const found = new Set()
  for (const f of files) {
    const src = fs.readFileSync(path.join(__dirname, f), 'utf8')
    for (const m of src.matchAll(/SCRIPT_ERR_([A-Z0-9_]+)/g)) found.add(m[1])
  }
  return found
}

function main () {
  const parsed = []
  for (const raw of rows) {
    if (!Array.isArray(raw) || raw.length === 1) continue
    const row = harness.parseRow(raw)
    if (row) parsed.push(row)
  }

  // ---- 1. verdicts ----
  const expected = new Set()
  for (const r of parsed) if (r.expected && r.expected !== 'OK') expected.add(r.expected)
  const emittable = emittableVerdicts()
  const aliases = harness.ERROR_CODE_ALIASES
  const unexercised = [...emittable].filter((v) => {
    if (expected.has(v)) return false
    // A narrower name is exercised when the node's broader name is.
    return !(aliases[v] && expected.has(aliases[v]))
  }).sort()

  // ---- 2. flag pairs ----
  const flagNames = Object.keys(harness.FLAG_MAP).concat(
    ['GENESIS', 'UTXO_AFTER_GENESIS', 'UTXO_AFTER_CHRONICLE'])
  const setCount = {}
  const pairCount = {}
  for (const r of parsed) {
    const on = String(r.flagStr).split(',').map((s) => s.trim()).filter(Boolean)
    for (const a of on) {
      setCount[a] = (setCount[a] || 0) + 1
      for (const b of on) if (a < b) pairCount[a + '+' + b] = (pairCount[a + '+' + b] || 0) + 1
    }
  }
  // Flags that can mask another check by returning before it.
  const MASKERS = ['LOW_S', 'DERSIG', 'STRICTENC', 'MINIMALDATA', 'SIGPUSHONLY', 'CLEANSTACK']
  const missingPairs = []
  for (const a of MASKERS) {
    for (const b of MASKERS) {
      if (a >= b) continue
      if (!setCount[a] || !setCount[b]) continue
      if (!pairCount[a + '+' + b]) missingPairs.push(a + ' + ' + b)
    }
  }

  // ---- 3. transaction version ----
  const byVersion = {}
  for (const r of parsed) byVersion[r.version] = (byVersion[r.version] || 0) + 1

  const out = []
  out.push('SV Node script corpus — what it cannot tell us')
  out.push('')
  out.push(`rows                      : ${parsed.length}`)
  out.push(`verdicts this engine emits: ${emittable.size}`)
  out.push(`verdicts the corpus asks  : ${expected.size}`)
  out.push('')
  out.push(`--- ${unexercised.length} rules no row in this corpus exercises ---`)
  out.push('agreement here says nothing about them')
  for (const v of unexercised) out.push('  ' + v)
  out.push('')
  out.push('--- flag pairs never set together ---')
  out.push('a check can only be shadowed by another check that is also on, so masking is')
  out.push('covered per PAIR, not per flag')
  if (missingPairs.length === 0) out.push('  (none among the masking flags)')
  for (const p of missingPairs) out.push('  ' + p)
  out.push('')
  out.push('--- transaction version ---')
  for (const v of Object.keys(byVersion).sort()) {
    out.push(`  version ${v}: ${byVersion[v]} rows`)
  }
  if (Object.keys(byVersion).length === 1) {
    out.push('  ONE version only. Every rule gated on the transaction version is untested,')
    out.push('  which on BSV means all seven of Chronicle\'s malleability relaxations.')
  }
  console.log(out.join('\n'))
}

main()
