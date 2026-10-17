'use strict'
/**
 * docs/RELEASE-10.0.0.md must list every breaking change the library has promised.
 *
 * The commitments live in ten source files. A plan maintained by hand drifts from them, and a
 * major assembled from whatever happens to be in the tree on the day is how this package came to
 * ship six majors in 82 days. So the pairing is enforced: a new `removeIn: '10.0.0'` that nobody
 * adds to the plan fails here, and the plan cannot claim a commitment the code does not register.
 *
 * The pairing is keyed on a STABLE ID that each registration carries as a `plan:` field and each
 * plan row carries in its first column. An earlier version of this file had no reverse check at
 * all, and matched forward commitments only by whether the `since` VERSION TEXT occurred anywhere
 * in the plan — so it missed any new registration whose `since` an existing row already mentioned.
 * Measured 2026-10-16 by sabotage, each case restored afterwards:
 *
 *   forward, novel version   `since: '9.40.0'` added to lib/, absent from the plan -> 1 failing
 *   forward, SHARED version  `since: '9.32.0'` (a version an existing row already named) -> PASSED
 *   forward, shared '9.1.0'  same -> PASSED
 *   forward, CURRENT cycle   `since: '9.39.0'`, i.e. a deprecation added in the version being
 *                            shipped, which is the ordinary workflow -> PASSED
 *   reverse                  message.js's registration moved to `removeIn: '11.0.0'` so 10.0.0 no
 *                            longer flips it, plan row left in place -> PASSED, 8 of 8 green,
 *                            including the test named for that very commitment, because it greps
 *                            the plan's prose and never looks at the code
 *
 * So the version-only match caught only the one case where a deprecation introduced a version
 * number the plan had never mentioned.
 *
 * Keying on the id rather than on (file, since) is deliberate, and neither of the obvious
 * alternatives works. The `since` version is not an identity: versions repeat. The registering
 * file is not an identity either — two APIs in one file may legitimately be deprecated in the
 * same release, and a file move is not a change of promise. And keying on the `what` text would
 * couple the test to prose: the plan's rows paraphrase `what` (markdown emphasis, backticks, a
 * space before a paren), so exact matching fails and loose matching is no key at all. With the id
 * as identity, `since` and the registering file are verified as FIELDS of the matched row, which
 * catches a commitment whose version or location changed without the plan being updated.
 */
var should = require('chai').should()
var fs = require('fs')
var path = require('path')

var ROOT = path.join(__dirname, '..', '..')
var PLAN = path.join(ROOT, 'docs', 'RELEASE-10.0.0.md')

function jsFiles (dir, acc) {
  fs.readdirSync(dir, { withFileTypes: true }).forEach(function (e) {
    var p = path.join(dir, e.name)
    if (e.isDirectory()) jsFiles(p, acc)
    else if (e.name.slice(-3) === '.js') acc.push(p)
  })
  return acc
}

// Every registered 10.0.0 deprecation in lib/, excluding the JSDoc example in the deprecate
// module itself — that documents the mechanism rather than promising anything.
function registered () {
  var found = []
  jsFiles(path.join(ROOT, 'lib'), []).forEach(function (f) {
    if (f.indexOf(path.join('util', 'deprecate.js')) !== -1) return
    var lines = fs.readFileSync(f, 'utf8').split('\n')
    lines.forEach(function (ln, i) {
      if (!/removeIn:\s*'10\.0\.0'/.test(ln)) return
      var blk = lines.slice(Math.max(0, i - 22), Math.min(lines.length, i + 22)).join('\n')
      var m = blk.match(/since:\s*'([^']+)'/)
      var id = blk.match(/plan:\s*'([^']+)'/)
      found.push({
        file: path.relative(ROOT, f),
        since: m ? m[1] : null,
        id: id ? id[1] : null,
        line: i + 1
      })
    })
  })
  return found
}

// The plan's table rows, parsed back out: | id | since | what | instead | registered in |
function planRows (plan) {
  return plan.split('\n').filter(function (l) {
    return /^\|\s*`[a-z0-9-]+`\s*\|\s*9\.\d/.test(l)
  }).map(function (l) {
    var c = l.split('|').map(function (x) { return x.trim() })
    return {
      id: c[1].replace(/`/g, ''),
      since: c[2],
      file: (c[5] || '').replace(/`/g, '')
    }
  })
}

var NUM = ['zero', 'one', 'two', 'three', 'four', 'five', 'six', 'seven', 'eight', 'nine', 'ten',
  'eleven', 'twelve', 'thirteen', 'fourteen', 'fifteen']

describe('the 10.0.0 plan', function () {
  var plan = fs.readFileSync(PLAN, 'utf8')
  var items = registered()
  var rows = planRows(plan)

  it('finds the registered commitments at all (the instrument must not be empty)', function () {
    // An enumeration that silently finds nothing would make every assertion below vacuous.
    items.length.should.be.above(5, 'the deprecation scan found almost nothing — check the scan')
  })

  it('every registered 10.0.0 deprecation declares a `since`', function () {
    items.forEach(function (it_) {
      should.exist(it_.since, it_.file + ':' + it_.line + ' registers 10.0.0 without a since')
    })
  })

  it('parses the plan table back out (the second instrument must not be empty either)', function () {
    rows.length.should.be.above(5, 'no table rows parsed — check the table shape')
    rows.forEach(function (r) {
      r.file.should.match(/^lib\//,
        'row since ' + r.since + ' has no `registered in` path: got ' + JSON.stringify(r.file))
    })
  })

  it('every registered 10.0.0 deprecation carries a unique plan id', function () {
    // The id IS the identity. Without one, a commitment cannot be paired at all; duplicated, it
    // stops distinguishing two commitments and both directions below go blind again.
    var seen = {}
    items.forEach(function (it_) {
      should.exist(it_.id,
        it_.file + ':' + it_.line + ' registers removeIn 10.0.0 with no `plan:` id')
      should.not.exist(seen[it_.id],
        'two registrations share the plan id ' + it_.id + ' (' + it_.file + ':' + it_.line + ')')
      seen[it_.id] = it_
    })
  })

  it('every registered 10.0.0 deprecation appears in the plan, matched by id', function () {
    var have = {}
    rows.forEach(function (r) { have[r.id] = r })
    var absent = items.filter(function (it_) { return !have[it_.id] })
    absent.should.have.length(0,
      'these register removeIn 10.0.0 but no plan row carries their id: ' +
      absent.map(function (a) {
        return a.file + ':' + a.line + ' (' + a.id + ')'
      }).join(', '))
  })

  it('every plan row is backed by a live registration — a row cannot be left behind', function () {
    // The reverse direction, which the earlier version of this file did not check at all. Without
    // it, moving a deprecation to a later major, or deleting it, leaves the plan promising a
    // change 10.0.0 will not make.
    var have = {}
    items.forEach(function (it_) { have[it_.id] = it_ })
    var unbacked = rows.filter(function (r) { return !have[r.id] })
    unbacked.should.have.length(0,
      'these plan rows promise a 10.0.0 change that nothing in lib/ registers: ' +
      unbacked.map(function (r) { return r.id }).join(', '))
  })

  it('agrees with the plan on each matched commitment\'s version and location', function () {
    // `since` and the file are FIELDS, not identity — so a commitment whose notice moved to a
    // different version, or whose code moved to a different file, is caught here as a mismatch
    // rather than silently re-pairing or failing to pair.
    var byId = {}
    items.forEach(function (it_) { byId[it_.id] = it_ })
    rows.forEach(function (r) {
      var reg = byId[r.id]
      if (!reg) return // the reverse test above owns that failure
      r.since.should.equal(reg.since,
        r.id + ': the plan says since ' + r.since + ', the code registers ' + reg.since)
      r.file.should.equal(reg.file,
        r.id + ': the plan says it is registered in ' + r.file + ', it is in ' + reg.file)
    })
  })

  it('every `since` names a version that actually shipped', function () {
    // "the notice has been in your logs since X" is only true if X was released. A typo here, or
    // a version invented while drafting, makes the plan's central promise unverifiable.
    var changelog = fs.readFileSync(path.join(ROOT, 'CHANGELOG.md'), 'utf8')
    items.forEach(function (it_) {
      changelog.should.match(new RegExp('^## \\[?' + it_.since.replace(/\./g, '\\.') + '\\]?', 'm'),
        it_.id + ' claims since ' + it_.since + ', which has no CHANGELOG entry')
    })
  })

  it('states the number of registered deprecations, and states it correctly', function () {
    // The count drifted once already: a tenth row was appended and the prose still said "Nine".
    rows.should.have.length(items.length)
    plan.should.match(new RegExp('^' + NUM[rows.length].replace(/^./, function (c) {
      return c.toUpperCase()
    }) + ', listed by the file that registers them', 'm'),
    'the plan does not open the table by saying there are ' + rows.length + ' of them')
  })

  it('the plan names each source file it attributes an unregistered decision to', function () {
    // The "decided but not registered" items have no call site, so the plan is their only
    // record. A stale path there is a decision nobody can find.
    var cited = plan.match(/\(`lib\/[^`]+`\)/g) || []
    cited.length.should.be.above(3)
    cited.forEach(function (c) {
      var rel = c.replace(/[()`]/g, '')
      fs.existsSync(path.join(ROOT, rel)).should.equal(true, 'the plan cites a path that does not exist: ' + rel)
    })
  })

  it('states the date floor and the no-early-major rule', function () {
    plan.should.match(/2027-09-01/)
    plan.should.match(/Not before/)
  })

  it('records the low-s default flip, which is the newest commitment', function () {
    plan.should.match(/lowS: true/)
    plan.should.match(/9\.38\.0/)
    plan.should.match(/compatibility change, not a bug fix/)
  })

  it('keeps the inconsistent return conventions on the list as a candidate', function () {
    // The single change most likely to stop a consumer shipping a silent accept. If it is
    // dropped from the plan, that should be a decision someone made, not an omission.
    plan.should.match(/return convention/)
    plan.should.match(/verifyLegalToken/)
  })

  it('is linked from the README so it is discoverable', function () {
    var readme = fs.readFileSync(path.join(ROOT, 'README.md'), 'utf8')
    readme.should.match(/RELEASE-10\.0\.0\.md/)
  })
})
