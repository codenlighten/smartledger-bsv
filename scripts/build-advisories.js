#!/usr/bin/env node
'use strict'

// Turn the prepared advisory markdown in docs/advisories/ into the exact JSON payloads the
// GitHub security-advisories API takes, so each one is a single call with nothing retyped.
//
//   node scripts/build-advisories.js            write the three payloads
//   node scripts/build-advisories.js --check    rebuild and fail if they have drifted
//
// It does NOT send anything.  The calls are printed at the end.
//
// The amendment needs the live advisory's current text, because it is an edit rather than a
// replacement: fetched if a token is available, otherwise read from a cached copy if one was
// passed with --from.

var fs = require('fs')
var path = require('path')
var https = require('https')

var DOCS = path.join(__dirname, '..', 'docs', 'advisories')
var GHSA = 'GHSA-gw63-x79h-mhjc'
var REPO = 'codenlighten/smartledger-bsv'

// The body of each draft is the markdown file with its DRAFT header stripped: everything from
// the first `### Impact` onward is what goes in the advisory.
function body (file) {
  var md = fs.readFileSync(path.join(DOCS, file), 'utf8')
  var i = md.indexOf('### Impact')
  if (i < 0) throw new Error(file + ': no "### Impact" section to start the body at')
  return md.slice(i).trim() + '\n'
}

var DRAFTS = [
  {
    out: 'draft-fromobject-key-substitution.json',
    from: 'draft-fromobject-key-substitution.md',
    payload: {
      summary: 'PrivateKey.fromObject silently returns a different, publicly derivable private key when given a redacted JSON round-trip',
      cvss_vector_string: 'CVSS:3.1/AV:N/AC:L/PR:N/UI:N/S:U/C:H/I:H/A:N',
      cwe_ids: ['CWE-20', 'CWE-340'],
      vulnerabilities: [{
        package: { ecosystem: 'npm', name: '@smartledger/bsv' },
        vulnerable_version_range: '>= 7.5.1, < 7.5.5',
        patched_versions: '7.5.5',
        vulnerable_functions: []
      }]
    }
  },
  {
    out: 'draft-ltp-disclosure-commitment.json',
    from: 'draft-ltp-disclosure-commitment.md',
    payload: {
      summary: 'LTP.Proof selective disclosure accepts a disclosed value the issuer never committed to',
      cvss_vector_string: 'CVSS:3.1/AV:N/AC:L/PR:N/UI:N/S:U/C:N/I:H/A:N',
      cwe_ids: ['CWE-345'],
      vulnerabilities: [
        {
          package: { ecosystem: 'npm', name: '@smartledger/bsv' },
          vulnerable_version_range: '>= 3.3.2, < 9.32.0',
          patched_versions: '9.32.0',
          vulnerable_functions: []
        },
        {
          package: { ecosystem: 'npm', name: 'smartledger-bsv' },
          vulnerable_version_range: '>= 3.3.1, <= 4.4.0',
          patched_versions: null,
          vulnerable_functions: []
        }
      ]
    }
  },
  {
    out: 'draft-ltp-salt-derivation.json',
    from: 'draft-ltp-salt-derivation.md',
    // Must not be PUBLISHED before 9.34.0 is on the registry: it names 9.34.0 as the patched
    // version, and an advisory that tells a reader to upgrade to something that does not exist
    // is worse than none. Creating it as a draft is private and safe at any time.
    payload: {
      summary: 'LTP selective disclosure derives its salts from the proof\u2019s own nonce, so an undisclosed field\u2019s value can be brute-forced from the proof',
      cvss_vector_string: 'CVSS:3.1/AV:N/AC:L/PR:N/UI:N/S:U/C:H/I:N/A:N',
      cwe_ids: ['CWE-330', 'CWE-200'],
      vulnerabilities: [
        {
          package: { ecosystem: 'npm', name: '@smartledger/bsv' },
          vulnerable_version_range: '>= 3.3.2, < 9.34.0',
          patched_versions: '9.34.0',
          vulnerable_functions: []
        },
        {
          package: { ecosystem: 'npm', name: 'smartledger-bsv' },
          vulnerable_version_range: '>= 3.3.1, <= 4.4.0',
          patched_versions: null,
          vulnerable_functions: []
        }
      ]
    }
  }
]

// --- the amendment to the published advisory -------------------------------------------------
//
// Four surgical edits.  An earlier draft tried to carry the OTHER two defects in this
// advisory's prose; that was dropped because this advisory's machine-readable part says
// @smartledger/bsv is patched at 7.5.1, so a scanner treats 7.5.1-7.5.4 as unaffected BY IT
// whatever the text says.  Prose cannot change audit results - hence the two drafts above.
var AMEND = [
  ['the patches paragraph',
    '**7.5.3** is recommended: it rebuilds that guard to detect key material by value as well as by field name, closing cases where a WIF, `xprv`, or BIP39 mnemonic stored under an innocuous field name would still have been published.',
    '**7.5.3** rebuilt that guard to detect key material by value as well as by field name, closing cases where a WIF, `xprv`, or BIP39 mnemonic stored under an innocuous field name would still have been published.\n\n**7.5.3 is no longer a safe upgrade target, and this advisory originally recommended it.** It fixes *this* defect, but 7.5.1 – 7.5.4 carry an unrelated critical defect of their own, and later versions through 9.31.0 another. Those are outside this advisory\'s scope and are not reflected in its affected range, so tooling will not flag them here. Upgrade to **`9.34.0`**, the release in which the defects described here and in the companion advisories are fixed.'],

  ['the action required',
    'Upgrade to `>= 7.5.3`, then **treat every key ever passed to `anchorCredential` or `anchorBatch` as compromised and rotate it**, moving any funds to a new key. Reviewing OP_RETURN payloads of anchors you have broadcast will confirm whether a key was published.',
    'On `@smartledger/bsv`, upgrade to `9.34.0` (see the note in Patches on why not 7.5.3). On the unscoped `smartledger-bsv` there is nothing to upgrade to — migrate to `@smartledger/bsv@9.34.0`, reviewing migration requirements before switching.\n\nThen **treat every key ever passed to `anchorCredential` or `anchorBatch` as compromised and rotate it**, moving any funds to a new key, unless you can establish that no such transaction was ever broadcast. Reviewing the OP_RETURN payloads of anchors you have broadcast will confirm whether a key was published. Separately, any key whose `JSON.stringify` output reached a log, an error report or a request body should be treated as exposed to whoever can read that output.'],

  ['the workarounds heading',
    '### Workarounds',
    '### The unscoped `smartledger-bsv` package is affected too, and has no fix\n\n' +
    'The same defect is present under the unscoped npm name `smartledger-bsv`, whose latest release is 4.4.0 (2026-06-08). Every one of its 22 published versions was installed from the registry and run:\n\n' +
    "* **14 of 22** — 3.3.1, 3.3.2, 3.3.3, 3.3.4, 3.3.5, 3.4.0, 3.4.4, 3.4.5, 4.0.0, 4.0.1, 4.1.0, 4.2.0, 4.2.1 and 4.4.0 — reproduce the anchoring defect above through **both** `anchorCredential` and `anchorBatch`: the OP_RETURN of the signed transaction they return contains the caller's private key, recoverable to the identical WIF. As above, it becomes publicly recoverable if that transaction is broadcast.\n" +
    '* **22 of 22** emit the secret scalar from `JSON.stringify(privateKey)`.\n' +
    '* The remaining 8 (3.0.0 – 3.2.2) have no `lib/gdaf/smartledger-anchor` module, so they do not expose the GDAF anchoring path tested here. That is not a statement that no other path reaches the same disclosure.\n\n' +
    '**No published version of `smartledger-bsv` fixes either defect.** Releases moved to `@smartledger/bsv` and the unscoped name was left at 4.4.0, so changing version on that name is not a fix — the fix is changing package.\n\n' +
    '### Workarounds'],

  ['the workarounds body',
    'None for the anchoring path on affected versions. Do not pass a private key to `anchorCredential`/`anchorBatch`, and do not serialise `PrivateKey` instances with `JSON.stringify`.',
    'No in-version fix exists on an affected release; the only reliable mitigation short of upgrading is to avoid the affected operations entirely — do not pass a private key to `anchorCredential`/`anchorBatch`, and do not serialise `PrivateKey` instances with `JSON.stringify`.']
]

function amend (live) {
  var d = live.description
  AMEND.forEach(function (e) {
    if (d.indexOf(e[1]) < 0) {
      throw new Error('the published advisory no longer contains ' + e[0] +
        ' — it has been edited since this amendment was prepared; re-read it before sending')
    }
    d = d.replace(e[1], e[2])
  })
  return {
    description: d,
    vulnerabilities: [
      live.vulnerabilities[0],
      {
        package: { ecosystem: 'npm', name: 'smartledger-bsv' },
        vulnerable_version_range: '<= 4.4.0',
        patched_versions: null,
        vulnerable_functions: []
      }
    ]
  }
}

function fetchLive () {
  var fromFlag = process.argv.indexOf('--from')
  if (fromFlag !== -1) {
    return Promise.resolve(JSON.parse(fs.readFileSync(process.argv[fromFlag + 1], 'utf8')))
  }
  var token = process.env.GH_TOKEN || process.env.GITHUB_TOKEN
  if (!token) return Promise.resolve(null)
  return new Promise(function (resolve, reject) {
    https.get('https://api.github.com/repos/' + REPO + '/security-advisories/' + GHSA, {
      headers: {
        accept: 'application/vnd.github+json',
        authorization: 'Bearer ' + token,
        'user-agent': 'smartledger-bsv-advisory-builder'
      }
    }, function (res) {
      var s = ''
      res.on('data', function (d) { s += d })
      res.on('end', function () {
        if (res.statusCode !== 200) return reject(new Error('GET advisory: HTTP ' + res.statusCode))
        resolve(JSON.parse(s))
      })
    }).on('error', reject)
  })
}

// --- sanity checks on every payload, before it can be written --------------------------------
function validate (name, p) {
  var problems = []
  ;(p.vulnerabilities || []).forEach(function (v) {
    if (!v.package || !v.package.ecosystem || !v.package.name) problems.push('a vulnerability with no package')
    if (!v.vulnerable_version_range) problems.push(v.package.name + ': no vulnerable_version_range')
    if (typeof v.patched_versions === 'string' && v.patched_versions === 'null') {
      problems.push(v.package.name + ': patched_versions is the STRING "null" — it must be a real null')
    }
  })
  if (p.severity && ['low', 'medium', 'high', 'critical'].indexOf(p.severity) < 0) {
    problems.push('severity ' + p.severity + ' is not one of low/medium/high/critical')
  }
  // A create with neither lets GitHub assign one. An amendment carries neither on purpose:
  // it sends only the fields it changes, and the published advisory keeps its own severity.
  if (p.summary && !p.severity && !p.cvss_vector_string) {
    problems.push('a new advisory with neither severity nor cvss_vector_string')
  }
  if (p.severity && p.cvss_vector_string) {
    problems.push('both severity and cvss_vector_string - send one, they are alternatives')
  }
  // Only advisory ids KNOWN TO BE PUBLIC may appear. An allowlist rather than a blocklist on
  // purpose: a blocklist of embargoed ids would have to name them, in a public repository,
  // which is the thing it is there to prevent. The first version of this check did exactly
  // that.
  var PUBLIC_IDS = ['GHSA-gw63-x79h-mhjc']
  ;(String(p.description || '').match(/GHSA-[0-9a-z]{4}-[0-9a-z]{4}-[0-9a-z]{4}/gi) || [])
    .forEach(function (id) {
      if (PUBLIC_IDS.indexOf(id) < 0) problems.push('names an advisory that is not on the public allowlist: ' + id)
    })
  if (/claude|anthropic/i.test(String(p.description || ''))) problems.push('contains tooling attribution')
  if (problems.length) {
    console.error(name + ' INVALID:\n  ' + problems.join('\n  '))
    process.exit(1)
  }
}

var check = process.argv.indexOf('--check') !== -1
var drifted = []

function emit (file, payload) {
  validate(file, payload)
  var target = path.join(DOCS, file)
  var text = JSON.stringify(payload, null, 1) + '\n'
  if (check) {
    var current = ''
    try { current = fs.readFileSync(target, 'utf8') } catch (e) { current = '' }
    if (current !== text) drifted.push(file)
    return
  }
  fs.writeFileSync(target, text)
  console.log('  ' + file + '  (' + (payload.description || body(DRAFTS[0].from)).length + ' chars of body)')
}

;(async function () {
  console.log(check ? 'checking payloads' : 'writing payloads to docs/advisories/')
  DRAFTS.forEach(function (d) {
    var p = Object.assign({}, d.payload, { description: body(d.from) })
    emit(d.out, p)
  })

  var live = await fetchLive()
  if (live) {
    emit('GHSA-gw63-amendment.json', amend(live))
  } else {
    console.log('  GHSA-gw63-amendment.json  SKIPPED — needs the live advisory text.')
    console.log('    gh api repos/' + REPO + '/security-advisories/' + GHSA + ' > /tmp/live.json')
    console.log('    node scripts/build-advisories.js --from /tmp/live.json')
  }

  if (check) {
    if (drifted.length) {
      console.error('\nadvisory payloads are out of date: ' + drifted.join(', '))
      console.error('run: node scripts/build-advisories.js')
      process.exit(1)
    }
    console.log('\nbuild-advisories: OK — payloads match the markdown.')
    return
  }

  console.log('\nNothing has been sent. To send, with the payload reviewed first:')
  console.log('  amend the published advisory:')
  console.log('    gh api --method PATCH repos/' + REPO + '/security-advisories/' + GHSA +
    ' --input docs/advisories/GHSA-gw63-amendment.json')
  console.log('  create each new advisory AS A DRAFT (private to maintainers until published):')
  DRAFTS.forEach(function (d) {
    console.log('    gh api --method POST repos/' + REPO + '/security-advisories' +
      ' --input docs/advisories/' + d.out)
  })
  console.log('\nA created advisory is a DRAFT. Publishing it is a separate, deliberate step, and')
  console.log('publishing is what puts it in the GitHub Advisory Database and so into npm audit.')
})().catch(function (e) {
  console.error('failed: ' + e.message)
  process.exit(1)
})
