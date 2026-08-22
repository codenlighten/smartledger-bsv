'use strict'

/**
 * Public API surface extraction.
 *
 * STABILITY.md promises that 9.x will not break callers, and names what is
 * covered: the top-level exports, the `exports` subpaths, and the types. A
 * promise nothing checks is a promise that decays — this library reached 9.0.0
 * in 82 days without anyone intending to, one reasonable-looking change at a
 * time. So the covered surface is snapshotted and diffed in CI.
 *
 * What this deliberately records is names, kinds and arities — never values.
 * The question it answers is "can a caller's code still resolve and call this",
 * not "does it still do the same thing"; behaviour is what the 4687 unit tests
 * and 452 conformance cases are for.
 *
 * Depth stops at prototype methods. Deeper than that is implementation detail
 * that would make the snapshot churn on every refactor, and a snapshot people
 * regenerate reflexively enforces nothing.
 */

var MAX_DEPTH = 3

// Own-property noise that carries no API meaning.
var SKIP = {
  length: true,
  name: true,
  prototype: true,
  constructor: true,
  caller: true,
  arguments: true,
  __proto__: true,
  super_: true
}

function isPlainNamespace (v) {
  if (v === null || typeof v !== 'object') return false
  if (Buffer.isBuffer(v)) return false
  if (Array.isArray(v)) return false
  var proto = Object.getPrototypeOf(v)
  return proto === Object.prototype || proto === null
}

function describe (value) {
  if (value === null) return 'null'
  if (Buffer.isBuffer(value)) return 'buffer'
  if (Array.isArray(value)) return 'array'
  var t = typeof value
  if (t === 'function') return 'function(' + value.length + ')'
  if (t === 'number' || t === 'string' || t === 'boolean') return t
  return 'object'
}

function walk (node, path, depth, out, seen) {
  if (depth > MAX_DEPTH) return
  if (node === null || (typeof node !== 'object' && typeof node !== 'function')) return
  if (seen.indexOf(node) !== -1) return
  seen.push(node)

  Object.getOwnPropertyNames(node).sort().forEach(function (key) {
    if (SKIP[key] || key.charAt(0) === '_') return

    // Read through accessors, but never let a throwing getter break extraction.
    var desc = Object.getOwnPropertyDescriptor(node, key)
    var value
    try {
      value = desc && desc.get ? node[key] : (desc ? desc.value : node[key])
    } catch (e) {
      out[path + '.' + key] = 'unreadable'
      return
    }

    var full = path + '.' + key
    out[full] = describe(value)

    if (typeof value === 'function') {
      // statics, then prototype methods
      walk(value, full, depth + 1, out, seen)
      if (value.prototype && depth + 1 <= MAX_DEPTH) {
        Object.getOwnPropertyNames(value.prototype).sort().forEach(function (m) {
          if (SKIP[m] || m.charAt(0) === '_') return
          var pd = Object.getOwnPropertyDescriptor(value.prototype, m)
          var mv
          try {
            mv = pd && pd.get ? undefined : (pd ? pd.value : undefined)
          } catch (e) { return }
          out[full + '#' + m] = pd && pd.get ? 'getter' : describe(mv)
        })
      }
    } else if (isPlainNamespace(value)) {
      walk(value, full, depth + 1, out, seen)
    }
  })
}

/** @returns {object} sorted map of "bsv.Path#member" -> kind */
function extract () {
  var bsv = require('../index.js')
  var out = {}
  walk(bsv, 'bsv', 1, out, [])

  // The `exports` subpaths are part of the same promise: a caller may require
  // any of them by name, so removing one breaks them just as surely.
  var pkg = require('../package.json')
  Object.keys(pkg.exports || {}).forEach(function (sub) {
    out['exports:' + sub] = 'subpath'
  })

  var sorted = {}
  Object.keys(out).sort().forEach(function (k) { sorted[k] = out[k] })
  return sorted
}

module.exports = { extract: extract, MAX_DEPTH: MAX_DEPTH }

if (require.main === module) {
  var fs = require('fs')
  var path = require('path')
  var target = path.join(__dirname, '..', 'test', 'fixtures', 'api-surface.json')
  var surface = extract()
  fs.mkdirSync(path.dirname(target), { recursive: true })
  fs.writeFileSync(target, JSON.stringify(surface, null, 2) + '\n')
  console.log('api-surface: wrote ' + Object.keys(surface).length + ' entries to ' +
    path.relative(path.join(__dirname, '..'), target))
}
