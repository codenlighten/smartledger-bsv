'use strict'

/* global describe, it */

// Guards the 7.0 package.json `exports` map. Adding `exports` switches Node to
// strict subpath resolution, so this asserts the surface consumers actually use
// still resolves (via package self-reference, which Node enables once `exports`
// exists): the main entry, package.json, ./version, the shipped bundles, and
// lib/* deep imports in BOTH extension styles. Also smoke-tests the ESM `import`
// condition in a child process so the dual-ready "." entry can't silently rot.

require('chai').should()
var path = require('path')
var execFileSync = require('child_process').execFileSync

var N = '@smartledger/bsv'
var ROOT = path.resolve(__dirname, '../..')

describe('7.0 exports map resolution', function () {
  it('resolves the main entry via self-reference', function () {
    var bsv = require(N)
    bsv.should.be.an('object')
    bsv.PrivateKey.should.be.a('function')
    bsv.crypto.ECDSA.should.be.a('function')
  })

  it('exposes package.json and ./version, and they agree', function () {
    var pkg = require(N + '/package.json')
    var version = require(N + '/version')
    pkg.name.should.equal(N)
    version.should.equal(pkg.version)
  })

  it('resolves lib/* deep imports with and without the .js extension', function () {
    var withExt = require(N + '/lib/crypto/ecdsa.js')
    var noExt = require(N + '/lib/crypto/ecdsa')
    withExt.should.be.a('function')
    noExt.should.equal(withExt) // same module, one cache entry
  })

  it('serves the full browser bundle over a subpath (loaded in isolation)', function () {
    // The bundle is a self-contained bsv; loading it in-process collides with the
    // main require above ("multiple bsv instances"), so resolve+load it in a child.
    var script = 'var m=require(' + JSON.stringify(N + '/bsv.min.js') + ');' +
      'process.exit(m && m.PrivateKey ? 0 : 3)'
    execFileSync(process.execPath, ['-e', script], { cwd: ROOT, stdio: 'pipe' })
  })

  it('supports the ESM `import` condition for the main entry', function () {
    var script = 'import bsv from ' + JSON.stringify(N) + ';' +
      'process.exit(bsv && bsv.PrivateKey && bsv.crypto.ECDSA ? 0 : 3)'
    execFileSync(process.execPath, ['--input-type=module', '-e', script], { cwd: ROOT, stdio: 'pipe' })
  })
})
