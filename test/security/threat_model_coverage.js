'use strict'

/* global describe, it */

// Keeps docs/THREAT_MODEL.md honest: every `test/…js` the threat model cites as the
// enforcer of a security property must actually exist. If a security test is renamed
// or deleted, the threat model can no longer silently point at a ghost — this gate goes
// red. (Same "docs are tested claims" principle as the type-drift gate.)

require('chai').should()
var fs = require('fs')
var path = require('path')

var ROOT = path.resolve(__dirname, '../..')
var MODEL = path.join(ROOT, 'docs/THREAT_MODEL.md')

describe('security: threat model references real tests', function () {
  var text = fs.readFileSync(MODEL, 'utf8')
  // Every referenced test path, e.g. `test/security/fail_closed_contracts.js`.
  var refs = (text.match(/test\/[A-Za-z0-9_./-]+\.js/g) || [])
  var unique = refs.filter(function (r, i) { return refs.indexOf(r) === i })

  it('cites a meaningful number of enforcing tests', function () {
    unique.length.should.be.above(6)
  })

  it('every cited test file exists', function () {
    var missing = unique.filter(function (rel) { return !fs.existsSync(path.join(ROOT, rel)) })
    missing.should.deep.equal([], 'THREAT_MODEL.md cites test files that do not exist:\n  ' + missing.join('\n  '))
  })
})
