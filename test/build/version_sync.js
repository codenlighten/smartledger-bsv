'use strict'

/* global describe, it */

// version.js is generated from package.json by the `version` npm hook so the bundles
// embed only the version string (not the whole package.json). Assert it hasn't drifted.

require('chai').should()

describe('version.js stays in sync with package.json', function () {
  it('version.js === package.json.version', function () {
    require('../../version').should.equal(require('../../package.json').version)
  })
})
