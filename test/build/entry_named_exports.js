'use strict'

/* global describe, it, before */

// Guards the ESM half of the subpath exports (`./jcs`, `./covenant`, ...), which no
// amount of type checking can cover.
//
// Every `*-entry.js` is a bare re-export — `module.exports = require('./lib/...')` —
// and Node's CJS named-export detection is a static scan of the source that did not
// expose those names. So `./jcs` served `default` alone while jcs-entry.d.ts declared
// a top-level `stringify`, and `import { stringify } from '@smartledger/bsv/jcs'`
// type-checked clean (tsc 5.6, node16 / nodenext / bundler) and then threw
// "Named export 'stringify' not found" at run time. Measured on Node 22.23.3 against
// published 9.39.0; covenant's `reconstructP2pkhScript` and smartcontract's members
// had the same split. It is NODE's loader that is strict here — esbuild's own CommonJS
// interop served the name even on 9.39.0 — so these checks exist for the Node-native
// ESM consumer, who is the one with no workaround. No declaration shape reports it, because TypeScript PERMITS
// named imports from CommonJS: changing the .d.ts to the `export = ` form used by the
// other entries still accepted the import.
//
// The fix is a generated `*-entry.mjs` behind each subpath's `import` condition. The
// CJS entry files stay untouched, so `require(...)` keeps returning the SAME OBJECT as
// the underlying module (asserted below) — the reason the names are not simply
// assigned onto `exports` instead.
//
// ESM runs in a child process rather than a dynamic import(), matching esm_wrapper.js:
// the pinned standard@12 linter cannot parse `import(...)`.

require('chai').should()
var fs = require('fs')
var path = require('path')
var execFileSync = require('child_process').execFileSync

var ROOT = path.resolve(__dirname, '../..')
var PKG = JSON.parse(fs.readFileSync(path.join(ROOT, 'package.json'), 'utf8'))

// scripts/ is dev tooling and is not published, so the drift check can only run from a
// checkout. Everything else runs against an installed copy too.
var GEN = path.join(ROOT, 'scripts', 'gen-esm-wrapper.js')
var gen = fs.existsSync(GEN) ? require(GEN) : null
var itFromCheckout = gen ? it : it.skip

// The public subpaths that resolve to an entry file, read from the exports map.
function mappedEntries () {
  var out = []
  Object.keys(PKG.exports || {}).forEach(function (key) {
    var val = PKG.exports[key]
    if (!val || typeof val !== 'object') return
    var m = /^\.\/([A-Za-z0-9_-]+)-entry\.js$/.exec(val.require || val.default || '')
    if (m) out.push({ subpath: key, name: m[1], conditions: val })
  })
  return out.sort(function (a, b) { return a.name < b.name ? -1 : 1 })
}

// Names a wrapper re-exports, parsed from the generated `export const { ... } = mod`.
function wrapperNames (name) {
  var src = fs.readFileSync(path.join(ROOT, name + '-entry.mjs'), 'utf8')
  if (src.indexOf('export const {') === -1) return []
  return src.split('export const {')[1].split('} = mod')[0]
    .split(',').map(function (s) { return s.trim() }).filter(Boolean)
}

function runEsm (body) {
  return execFileSync(process.execPath, ['--input-type=module', '-e', body],
    { cwd: ROOT, stdio: 'pipe' }).toString()
}

function fileUrl (p) { return 'file://' + p.replace(/\\/g, '/') }

describe('subpath ESM entries (*-entry.mjs)', function () {
  var entries

  before(function () {
    entries = mappedEntries()
  })

  it('finds the mapped subpath entries', function () {
    entries.length.should.be.above(10)
    entries.map(function (e) { return e.name }).should.contain('jcs')
    // bundle-entry.js exists but is deliberately not a public subpath; if it ever
    // gains one, it needs a wrapper like the rest.
    entries.map(function (e) { return e.name }).should.not.contain('bundle')
  })

  it('gives every mapped subpath an import condition pointing at a shipped wrapper', function () {
    entries.forEach(function (e) {
      e.conditions.should.have.property('import')
      e.conditions.import.should.equal('./' + e.name + '-entry.mjs')
      fs.existsSync(path.join(ROOT, e.name + '-entry.mjs')).should.equal(true)
      // `types` must come first so TypeScript resolves the .d.ts for both conditions.
      Object.keys(e.conditions)[0].should.equal('types')
    })
  })

  it('publishes the wrappers', function () {
    PKG.files.should.contain('*-entry.mjs')
  })

  itFromCheckout('has no wrapper drift from the CJS surface', function () {
    var generated = gen.generateEntries()
    Object.keys(generated).length.should.equal(entries.length)
    Object.keys(generated).forEach(function (name) {
      var onDisk = fs.readFileSync(path.join(ROOT, name + '-entry.mjs'), 'utf8')
      onDisk.should.equal(generated[name]) // stale wrapper: run gen-esm-wrapper.js
    })
  })

  itFromCheckout('is regenerated and staged by `npm version`', function () {
    PKG.scripts.version.should.contain('gen-esm-wrapper.js')
    PKG.scripts.version.should.contain('*-entry.mjs')
  })

  // The guard proper: every name a wrapper claims must import BY NAME and be defined.
  it('serves every wrapper name as a real ESM named export', function () {
    this.timeout(120000)
    var checked = 0
    var failures = []
    entries.forEach(function (e) {
      var names = wrapperNames(e.name)
      if (!names.length) return
      var url = fileUrl(path.join(ROOT, e.name + '-entry.mjs'))
      var body = 'import { ' + names.join(', ') + ' } from "' + url + '";' +
        'const u = [' + names.map(function (n) {
        return '["' + n + '", typeof ' + n + ' === "undefined"]'
      }).join(',') + '].filter(p => p[1]).map(p => p[0]);' +
        'console.log(JSON.stringify(u))'
      try {
        var undef = JSON.parse(runEsm(body))
        checked += names.length
        if (undef.length) failures.push(e.name + ': bound but undefined: ' + undef.join(', '))
      } catch (err) {
        failures.push(e.name + ': ' + String(err.stderr || err.message).split('\n')
          .filter(function (l) { return /Error|error/.test(l) })[0])
      }
    })
    failures.should.deep.equal([])
    checked.should.be.above(20) // the loop must have asserted a real surface
  })

  it('serves a default export from every wrapper, including those with no names', function () {
    this.timeout(120000)
    entries.forEach(function (e) {
      var url = fileUrl(path.join(ROOT, e.name + '-entry.mjs'))
      var out = runEsm('import d from "' + url + '";' +
        'console.log(d === undefined || d === null ? "MISSING" : "ok")').trim()
      out.should.equal('ok', e.name + '-entry.mjs has no usable default export')
    })
  })

  // Internal members must not be promoted to supported surface by the wrapper.
  // shamir's `_*Legacy` share readers are the live case: its .d.ts deliberately
  // omits them, so naming them in ESM would contradict the declaration.
  it('does not re-export underscore-prefixed members', function () {
    var leaked = []
    entries.forEach(function (e) {
      wrapperNames(e.name).forEach(function (n) {
        if (n.charAt(0) === '_') leaked.push(e.name + ': ' + n)
      })
    })
    leaked.should.deep.equal([])
    // and the filter is load-bearing, not vacuous: shamir really does have them.
    var shamir = require(path.join(ROOT, 'shamir-entry.js'))
    Object.keys(shamir).filter(function (k) { return k.charAt(0) === '_' })
      .length.should.be.above(0)
  })

  // Why the names are not assigned onto `exports` in the CJS entry instead: that
  // would return a fresh wrapper object from `require`, breaking identity with the
  // underlying module.
  it('keeps the CJS entries as bare re-exports, preserving require identity', function () {
    entries.forEach(function (e) {
      var src = fs.readFileSync(path.join(ROOT, e.name + '-entry.js'), 'utf8')
      src.should.match(/^\s*module\.exports = require\('\.\/[^']+'\);?\s*$/,
        e.name + '-entry.js is no longer a bare re-export; check require identity')
    })
    var jcs = require(path.join(ROOT, 'jcs-entry.js'))
    var underlying = require(path.join(ROOT, 'lib/util/jcs'))
    ;(jcs === underlying).should.equal(true)
  })

  // The consumer line that threw, end to end.
  it('imports { stringify } from the jcs subpath and canonicalizes with it', function () {
    this.timeout(60000)
    var url = fileUrl(path.join(ROOT, 'jcs-entry.mjs'))
    var out = runEsm('import { stringify } from "' + url + '";' +
      'console.log(stringify({ b: 1, a: 2 }))').trim()
    out.should.equal('{"a":2,"b":1}')
  })

  // RFC 8785 requires code-unit order, where "10" precedes "2".
  it('keeps the subpath canonicalizer byte-identical to the library one', function () {
    this.timeout(60000)
    var url = fileUrl(path.join(ROOT, 'jcs-entry.mjs'))
    var doc = '{ "10": 1, "2": 2, "a": { "z": 1, "b": 2 } }'
    var viaEsm = runEsm('import { stringify } from "' + url + '";' +
      'console.log(stringify(' + doc + '))').trim()
    var viaLib = require(path.join(ROOT, 'lib/util/jcs')).stringify(JSON.parse(doc))
    viaEsm.should.equal(viaLib)
    viaEsm.should.equal('{"10":1,"2":2,"a":{"b":2,"z":1}}')
  })
})
