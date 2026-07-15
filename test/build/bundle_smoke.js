'use strict'

/* global describe, it */

// Cutover safety net for the webpack -> esbuild bundle migration: every SHIPPED bundle
// must load and expose an API. Each bundle is loaded in an ISOLATED child process (they
// are self-contained bsv builds; loading them all into one process would collide), with a
// global `bsv` present for the feature bundles that externalise it. Load/shape smoke only —
// full browser behaviour (window.crypto CSPRNG) is covered by the Chrome browser-smoke.

require('chai').should()
var path = require('path')
var execFileSync = require('child_process').execFileSync

var ROOT = path.resolve(__dirname, '../..')

// file -> a key that must be present on the loaded module (null = just needs a non-empty API).
var BUNDLES = {
  'bsv.min.js': 'PrivateKey',
  'bsv.bundle.js': 'PrivateKey',
  'bsv-ecies.min.js': null,
  'bsv-message.min.js': null,
  'bsv-mnemonic.min.js': null,
  'bsv-shamir.min.js': null,
  'bsv-smartcontract.min.js': 'Covenant',
  'bsv-covenant.min.js': null,
  'bsv-script-helper.min.js': null,
  'bsv-security.min.js': null,
  'bsv-ltp.min.js': null,
  'bsv-gdaf.min.js': null,
  'bsv-didweb.min.js': null,
  'bsv-vcjwt.min.js': null,
  'bsv-statuslist.min.js': null,
  'bsv-anchor.min.js': null
}

describe('bundles: every shipped bundle loads (esbuild cutover)', function () {
  this.timeout(20000)

  Object.keys(BUNDLES).forEach(function (file) {
    it(file + ' loads via require() and exposes an API', function () {
      var key = BUNDLES[file]
      var script =
        'global.bsv=require(' + JSON.stringify(path.join(ROOT, 'index.js')) + ');' +
        'var m=require(' + JSON.stringify(path.join(ROOT, file)) + ');' +
        'if(m==null)process.exit(2);' +
        'var ok=(typeof m==="function")||(typeof m==="object"&&Object.keys(m).length>0);' +
        'if(!ok)process.exit(3);' +
        (key ? 'if(m[' + JSON.stringify(key) + ']==null)process.exit(4);' : '') +
        'process.exit(0)'
      // execFileSync throws if the child exits non-zero (a broken/unloadable bundle).
      execFileSync(process.execPath, ['-e', script], { stdio: 'pipe' })
    })
  })
})
