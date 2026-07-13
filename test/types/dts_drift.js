'use strict'

/* global describe, it, before */

// TYPE-DRIFT GATE — mechanically proves the hand-maintained `bsv.d.ts` does not lie
// about the runtime. `bsv.d.ts` is a curated public-API surface (better than anything
// auto-generated from the spotty JSDoc), but nothing stopped it drifting — its own
// header said "3.4.x" on a 6.x package. This test parses the .d.ts with the real
// TypeScript AST and asserts:
//   (1) every declared value symbol (class / function / const, at any nesting) EXISTS
//       at runtime — no phantom APIs that the types promise but the code doesn't have;
//   (2) for the audited namespaces (Ordinals, Ordinals.BSV20, SPV) every runtime
//       function is DECLARED — so new APIs there can't ship untyped.
// Interfaces and type aliases are compile-time only and are ignored.

require('chai').should()
var path = require('path')
var fs = require('fs')
var ts = require('typescript')
var bsv = require('../..')

var DTS_PATH = path.join(__dirname, '../../bsv.d.ts')
var MODULE_NAME = '@smartledger/bsv'

// Walk the `declare module '@smartledger/bsv'` block and collect the dotted path of
// every value declaration (class / function / const), recursing into namespaces.
function collectDeclaredPaths (source) {
  var sf = ts.createSourceFile('bsv.d.ts', source, ts.ScriptTarget.Latest, true)
  var paths = []
  var moduleBody = null

  sf.forEachChild(function (node) {
    if (ts.isModuleDeclaration(node) && node.name && ts.isStringLiteral(node.name) &&
        node.name.text === MODULE_NAME && node.body && ts.isModuleBlock(node.body)) {
      moduleBody = node.body
    }
  })
  if (!moduleBody) throw new Error('could not find `declare module "' + MODULE_NAME + '"` in bsv.d.ts')

  function walk (statements, prefix) {
    statements.forEach(function (node) {
      if (ts.isModuleDeclaration(node) && node.name && node.body && ts.isModuleBlock(node.body)) {
        // A namespace: recurse (the namespace itself is checked via its members' paths).
        walk(node.body.statements, prefix.concat(node.name.text))
      } else if (ts.isClassDeclaration(node) && node.name) {
        paths.push(prefix.concat(node.name.text))
      } else if (ts.isFunctionDeclaration(node) && node.name) {
        paths.push(prefix.concat(node.name.text))
      } else if (ts.isVariableStatement(node)) {
        node.declarationList.declarations.forEach(function (d) {
          if (ts.isIdentifier(d.name)) paths.push(prefix.concat(d.name.text))
        })
      }
      // InterfaceDeclaration / TypeAliasDeclaration: compile-time only — ignored.
    })
  }
  walk(moduleBody.statements, [])
  return paths
}

// Resolve a dotted path on the runtime object; returns undefined if any segment is missing.
function resolve (root, segments) {
  return segments.reduce(function (o, k) { return (o == null) ? undefined : o[k] }, root)
}

describe('types: bsv.d.ts does not drift from runtime', function () {
  var declaredPaths

  before(function () {
    declaredPaths = collectDeclaredPaths(fs.readFileSync(DTS_PATH, 'utf8'))
  })

  it('parses a non-trivial number of declared symbols', function () {
    // Sanity: if the parse silently produced nothing, the whole gate would be a no-op.
    declaredPaths.length.should.be.above(50)
  })

  it('every declared class / function / const exists at runtime (no phantom API)', function () {
    var missing = declaredPaths
      .filter(function (segs) { return resolve(bsv, segs) === undefined })
      .map(function (segs) { return segs.join('.') })
    missing.should.deep.equal([], 'bsv.d.ts declares these but runtime does not expose them:\n  ' + missing.join('\n  '))
  })

  // Reverse direction where it matters most: the modules added in 6.x must stay fully typed.
  var AUDITED = [
    { label: 'Ordinals', obj: bsv.Ordinals, decl: 'Ordinals' },
    { label: 'Ordinals.BSV20', obj: bsv.Ordinals && bsv.Ordinals.BSV20, decl: 'Ordinals.BSV20' },
    { label: 'SPV', obj: bsv.SPV, decl: 'SPV' }
  ]

  AUDITED.forEach(function (ns) {
    it('every runtime function on ' + ns.label + ' is declared in bsv.d.ts', function () {
      ns.obj.should.be.an('object')
      var declaredSet = {}
      declaredPaths.forEach(function (segs) { declaredSet[segs.join('.')] = true })
      var runtimeFns = Object.keys(ns.obj).filter(function (k) { return typeof ns.obj[k] === 'function' })
      var untyped = runtimeFns.filter(function (k) { return !declaredSet[ns.decl + '.' + k] })
      untyped.should.deep.equal([], ns.label + ' exposes these functions but bsv.d.ts does not declare them:\n  ' + untyped.join('\n  '))
    })
  })
})
