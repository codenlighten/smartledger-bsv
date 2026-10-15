'use strict'
/**
 * docs/RELEASE-10.0.0.md must list every breaking change the library has promised.
 *
 * The commitments live in nine source files. A plan maintained by hand drifts from them, and a
 * major assembled from whatever happens to be in the tree on the day is how this package came to
 * ship six majors in 82 days. So the pairing is enforced: a new `removeIn: '10.0.0'` that nobody
 * adds to the plan fails here, and the plan cannot claim a commitment the code does not register.
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
      found.push({ file: path.relative(ROOT, f), since: m ? m[1] : null, line: i + 1 })
    })
  })
  return found
}

describe('the 10.0.0 plan', function () {
  var plan = fs.readFileSync(PLAN, 'utf8')
  var items = registered()

  it('finds the registered commitments at all (the instrument must not be empty)', function () {
    // An enumeration that silently finds nothing would make every assertion below vacuous.
    items.length.should.be.above(5, 'the deprecation scan found almost nothing — check the scan')
  })

  it('every registered 10.0.0 deprecation declares a `since`', function () {
    items.forEach(function (it_) {
      should.exist(it_.since, it_.file + ':' + it_.line + ' registers 10.0.0 without a since')
    })
  })

  it('every registered 10.0.0 deprecation appears in the plan', function () {
    var absent = items.filter(function (it_) { return plan.indexOf(it_.since) === -1 })
    absent.should.have.length(0,
      'these register removeIn 10.0.0 but are not in docs/RELEASE-10.0.0.md: ' +
      absent.map(function (a) { return a.file + ':' + a.line + ' (since ' + a.since + ')' }).join(', '))
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
