'use strict'

/* global describe, it */

// Every JS file in tools/ ships in the tarball, and three of them could not be loaded at all.
//
// tools/opcode_map.js, tools/minimal_reproduction.js and tools/simple_real_tx.js each did
// `require('./index.js')`, which from inside tools/ resolves to tools/index.js — a file that
// does not exist. opcode_map.js had been broken since v5.4.0. Nothing in the repo requires any
// of them, so no test ever loaded them, and `files: ['tools/']` shipped all three to every
// consumer.
//
// This is the cheapest possible guard: a shipped file must at least be loadable. It does not
// test what they do.

var expect = require('chai').expect
var fs = require('fs')
var path = require('path')
var childProcess = require('child_process')
var vm = require('vm')

var ROOT = path.join(__dirname, '..')
var TOOLS = path.join(ROOT, 'tools')

// Files that stay resident when loaded rather than returning — a listening server is not a
// load failure, so it is checked by parsing instead of by running.
var LONG_RUNNING = ['server.js']

describe('every shipped tool can be loaded', function () {
  var files = fs.readdirSync(TOOLS).filter(function (f) { return f.endsWith('.js') })

  it('finds the tools that ship', function () {
    expect(files.length).to.be.at.least(10)
    expect(require('../package.json').files, 'tools/ must still ship for this to matter')
      .to.include('tools/')
  })

  files.forEach(function (f) {
    it(f + ' loads', function () {
      this.timeout(30000)
      if (LONG_RUNNING.indexOf(f) !== -1) {
        // Parse without executing: catches a bad require path's syntax neighbours and any
        // top-level syntax error, without starting a listener.
        var src = fs.readFileSync(path.join(TOOLS, f), 'utf8')
        // vm.Script compiles without running, which is exactly what is wanted here: a syntax
        // check on a file whose side effect is to start listening.
        expect(function () { return new vm.Script(src, { filename: f }) }).to.not.throw()
        // And the thing that actually broke: a require that cannot resolve from tools/.
        var bad = src.match(/require\(['"]\.\/index\.js['"]\)/)
        expect(bad, 'require("./index.js") resolves to tools/index.js, which does not exist')
          .to.equal(null)
        return
      }
      var res = childProcess.spawnSync(process.execPath,
        ['-e', 'require(' + JSON.stringify(path.join(TOOLS, f)) + ')'],
        { cwd: ROOT, encoding: 'utf8', timeout: 25000, env: Object.assign({}, process.env, { BSV_NO_ERA_HINT: '1' }) })
      expect(res.status, f + ' failed to load:\n' + (res.stderr || '').slice(0, 400))
        .to.equal(0)
    })
  })
})
