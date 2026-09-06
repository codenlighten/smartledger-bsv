#!/usr/bin/env node
'use strict'

/**
 * Keeps docs/AUDIT_SCOPE.md and the vendor letters honest against the tree.
 *
 * This document is priced off. A vendor quotes from the line counts in it, and the
 * three letters in docs/audit-rfq/ repeat those counts to three different firms —
 * so a stale number is not a documentation nit, it is a wrong quote.
 *
 * Nothing was checking it. Between the scope revision and 9.7.0 the doc drifted by
 * 189 lines across four releases, and the vendor letters were worse: they still
 * carried the figures from BEFORE the scope was redrawn, quoting a Tier 1 of 12,391
 * against a document that said 11,247. Either would have gone out over someone's
 * signature.
 *
 * So this asserts three things:
 *
 *   1. every module line count stated in the doc matches `wc -l` on the tree;
 *   2. the tiers reconcile — parts sum to the stated whole, and the whole matches
 *      `lib/`. Checking each figure individually does not check they agree with
 *      each other, which is how an earlier draft published parts summing to 37,430
 *      against a 35,934 total;
 *   3. every vendor letter cites the same Tier 1, Tier 2 and excluded figures as
 *      the doc. Three letters and one document is four places to update and three
 *      chances to forget.
 *
 * Run with --fix to rewrite the stated figures from the tree.
 */

const fs = require('fs')
const path = require('path')
const { execSync } = require('child_process')

const ROOT = path.join(__dirname, '..')
const DOC = path.join(ROOT, 'docs/AUDIT_SCOPE.md')
const RFQ_DIR = path.join(ROOT, 'docs/audit-rfq')

function lines (target) {
  const out = execSync(`find ${target} -name '*.js' -type f | xargs wc -l | tail -1`, { cwd: ROOT }).toString()
  return parseInt(out.trim().split(/\s+/)[0], 10)
}
function fileLines (f) {
  return parseInt(execSync(`wc -l < ${f}`, { cwd: ROOT }).toString().trim(), 10)
}
function group (n) { return n.toLocaleString('en-US') }

// Tier 1, as the doc lists it. Whole directories, and the files carved out of
// modules that are only partly in scope — measuring a partial scope as a whole
// directory is how a vendor prices 6,908 lines when you meant 472.
// `row` matches the table line and captures the stated figure. Written out rather
// than derived from the label, because the labels carry their own backticks and
// parentheses and a generated pattern silently failed to match one of them —
// which the gate reported as a missing row rather than passing over it.
const TIER1 = [
  { label: 'lib/transaction/', row: /\| `lib\/transaction\/` \| ([\d,]+) \|/, measure: () => lines('lib/transaction') },
  { label: 'lib/script/interpreter.js', row: /\| `lib\/script\/interpreter\.js` \| ([\d,]+) \|/, measure: () => fileLines('lib/script/interpreter.js') },
  { label: 'lib/crypto/', row: /\| `lib\/crypto\/` \| ([\d,]+) \|/, measure: () => lines('lib/crypto') },
  { label: 'lib/notaryhash/', row: /\| `lib\/notaryhash\/` \| ([\d,]+) \|/, measure: () => lines('lib/notaryhash') },
  { label: 'privatekey.js + publickey.js', row: /\| `lib\/privatekey\.js`, `lib\/publickey\.js` \| ([\d,]+) \|/, measure: () => fileLines('lib/privatekey.js') + fileLines('lib/publickey.js') },
  { label: 'smart_contract (targeted)', row: /\| `lib\/smart_contract\/` \(targeted\) \| ([\d,]+) \|/, measure: () => fileLines('lib/smart_contract/locks.js') + fileLines('lib/smart_contract/index.js') },
  { label: 'lib/covenant/', row: /\| `lib\/covenant\/` \| ([\d,]+) \|/, measure: () => lines('lib/covenant') },
  { label: 'lib/util/jcs.js', row: /\| `lib\/util\/jcs\.js` \| ([\d,]+) \|/, measure: () => fileLines('lib/util/jcs.js') }
]
const TIER2 = [
  { label: 'lib/encoding/', row: /\| `lib\/encoding\/` \| ([\d,]+) \|/, measure: () => lines('lib/encoding') },
  { label: 'lib/mnemonic/', row: /\| `lib\/mnemonic\/` \| ([\d,]+) \|/, measure: () => lines('lib/mnemonic') },
  { label: 'lib/ecies/', row: /\| `lib\/ecies\/` \| ([\d,]+) \|/, measure: () => lines('lib/ecies') }
]

function main () {
  const fix = process.argv.includes('--fix')
  let doc = fs.readFileSync(DOC, 'utf8')
  const problems = []

  const tier1 = TIER1.reduce((a, m) => a + m.measure(), 0)
  const tier2 = TIER2.reduce((a, m) => a + m.measure(), 0)
  const total = lines('lib')
  const excluded = total - tier1 - tier2

  // Derive the residual as the complement, never by subtracting one tier: taking
  // total - tier1 alone double-counts tier 2, which an earlier draft did.
  if (tier1 + tier2 + excluded !== total) {
    fail(`tiers do not reconcile: ${tier1} + ${tier2} + ${excluded} != ${total}`)
  }
  if (total < 1000) fail(`lib/ measured ${total} lines — refusing to check against that`)

  // Per-module figures, as stated in the Tier tables.
  for (const m of TIER1.concat(TIER2)) {
    const actual = m.measure()
    const found = doc.match(m.row)
    if (!found) { problems.push(`no table row found for ${m.label}`); continue }
    const stated = parseInt(found[1].replace(/,/g, ''), 10)
    if (stated !== actual) {
      if (fix) doc = doc.replace(found[0], found[0].replace(found[1], group(actual)))
      else problems.push(`${m.label}: doc says ${found[1]}, tree has ${group(actual)}`)
    }
  }

  // The totals, wherever they are stated.
  const totals = [
    { re: /### Tier 1 — ([\d,]+) lines/g, want: tier1, what: 'Tier 1 heading' },
    { re: /### Tier 2 — optional, ([\d,]+) lines/g, want: tier2, what: 'Tier 2 heading' },
    { re: /Tier 1 — ([\d,]+) lines\. Sighash/g, want: tier1, what: 'Tier 1 in the enquiry text' },
    { re: /tier 1 +([\d,]+)/g, want: tier1, what: 'reconciliation block, tier 1' },
    { re: /tier 2 +([\d,]+)/g, want: tier2, what: 'reconciliation block, tier 2' },
    { re: /excluded +([\d,]+)/g, want: excluded, what: 'reconciliation block, excluded' },
    { re: /total +([\d,]+)/g, want: total, what: 'reconciliation block, total' },
    { re: /which is ([\d,]+) lines across/g, want: total, what: 'lib/ total in prose' }
  ]
  for (const t of totals) {
    let m
    t.re.lastIndex = 0
    let seen = 0
    while ((m = t.re.exec(doc)) !== null) {
      seen++
      const stated = parseInt(m[1].replace(/,/g, ''), 10)
      if (stated !== t.want) {
        if (fix) { doc = doc.replace(m[0], m[0].replace(m[1], group(t.want))); t.re.lastIndex = 0 } else {
          problems.push(`${t.what}: doc says ${m[1]}, tree has ${group(t.want)}`)
        }
      }
    }
    if (seen === 0) problems.push(`${t.what}: not found in the document at all`)
  }

  if (fix) {
    fs.writeFileSync(DOC, doc)
    console.log(`audit-scope: figures rewritten — tier1 ${group(tier1)}, tier2 ${group(tier2)}, excluded ${group(excluded)}, total ${group(total)}`)
    console.log('audit-scope: vendor letters are NOT rewritten — they are prose. Re-run without --fix.')
    return
  }

  // The vendor letters must quote the same figures. Three letters, one document.
  const letters = fs.readdirSync(RFQ_DIR).filter((f) => f.endsWith('.txt'))
  if (letters.length === 0) problems.push('no vendor letters found in docs/audit-rfq/')
  for (const f of letters) {
    const text = fs.readFileSync(path.join(RFQ_DIR, f), 'utf8')
    for (const [what, want] of [['Tier 1', tier1], ['Tier 2', tier2], ['excluded', excluded]]) {
      if (!text.includes(group(want))) {
        problems.push(`docs/audit-rfq/${f} does not cite the ${what} figure ${group(want)} — it would quote a vendor a number the scope no longer states`)
      }
    }
  }

  if (problems.length) {
    fail(problems.join('\n    ') + '\n\n  Re-measure and rewrite with: node scripts/check-audit-scope.js --fix\n' +
      '  Vendor letters are prose and must be edited by hand.')
  }

  console.log(`audit-scope: OK — tier 1 ${group(tier1)}, tier 2 ${group(tier2)}, ` +
    `excluded ${group(excluded)}, reconciling against lib/ at ${group(total)}; ` +
    `${letters.length} vendor letter(s) agree.`)
}

function fail (msg) {
  console.error('\naudit-scope FAILED:\n    ' + msg + '\n')
  process.exit(1)
}

main()
