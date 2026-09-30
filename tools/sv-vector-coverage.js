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

// Flags BSV mainnet requires today. A low row count on one of these is worse than a low count
// on a policy flag, which presence/absence alone cannot say.
const MANDATORY_ON_MAINNET = ['SIGHASH_FORKID', 'STRICTENC', 'UTXO_AFTER_GENESIS']

// Worse than untested: the row format has no name for these, so the case cannot be written as a
// row at all and no amount of adding vectors to this file will cover it. Found by the
// bsv-scale-protocol session, checking for a bare CHRONICLE token and finding none.
const CANNOT_EXPRESS = [
  {
    flag: 'CHRONICLE (block era, 1<<20)',
    why: 'no row names it — 42 rows carry UTXO_AFTER_CHRONICLE, the OUTPUT era, and none ' +
         'carries the block era. ILLEGAL_CHRONICLE gates on the block era, so that verdict ' +
         'is unreachable from this file by construction. It needs a hand-built vector.'
  }
]

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
  // Names come from the rows themselves, not from a lookup table: the corpus states its own
  // flags, and a table would only reintroduce the mismatch that made the shared vectors give
  // two answers earlier today.
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
  // A pair can be absent for two very different reasons, and they call for different fixes.
  // The bsv-scale-protocol session made this point: with LOW_S in one row of 1483, most
  // "untested pairs" are really reporting the scarcity of a single flag, and reading them as
  // 13 independent gaps invites 13 vectors when adding rows that set LOW_S at all is cheaper
  // and covers most of them.
  const SCARCE = 5
  const missingPairs = []
  const scarcePairs = []
  const neverSet = []
  for (const a of MASKERS) {
    if (!setCount[a]) { neverSet.push(a); continue }
    for (const b of MASKERS) {
      if (a >= b || !setCount[b]) continue
      if (pairCount[a + '+' + b]) continue
      const entry = `${a} (${setCount[a]}) + ${b} (${setCount[b]})`
      if (setCount[a] <= SCARCE || setCount[b] <= SCARCE) scarcePairs.push(entry)
      else missingPairs.push(entry)
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
  out.push('--- how often each flag is set at all ---')
  out.push('a flag that is mandatory in production and set in a handful of rows is a standing')
  out.push('risk, not a gap to be closed once')
  for (const f of Object.keys(setCount).sort((x, y) => setCount[x] - setCount[y])) {
    const pct = ((setCount[f] / parsed.length) * 100).toFixed(1)
    const note = MANDATORY_ON_MAINNET.includes(f) ? '   <- mandatory on BSV mainnet' : ''
    out.push(`  ${String(setCount[f]).padStart(5)}  ${pct.padStart(5)}%  ${f}${note}`)
  }
  out.push('')
  if (neverSet.length) {
    out.push('--- masking flags no row sets at all ---')
    out.push('every pair containing one of these would read as a gap; they are excluded above')
    for (const f of neverSet) out.push('  ' + f)
    out.push('')
  }
  out.push('--- pairs never set together, though BOTH flags are common ---')
  out.push('a check can only be shadowed by another check that is also on, so masking is')
  out.push('covered per PAIR, not per flag. These are the real gaps.')
  if (missingPairs.length === 0) out.push('  (none)')
  for (const p of missingPairs) out.push('  ' + p)
  out.push('')
  out.push(`--- pairs absent because one flag is scarce (<= ${SCARCE} rows) ---`)
  out.push('adding rows that set the scarce flag at all is cheaper than one vector per pair')
  for (const p of scarcePairs) out.push('  ' + p)
  out.push('')
  out.push('--- rules this corpus format cannot express ---')
  for (const f of CANNOT_EXPRESS) {
    out.push(`  ${f.flag}: ${f.why}`)
  }
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
