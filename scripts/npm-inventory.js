#!/usr/bin/env node
'use strict'

// Regenerates the facts in docs/NPM_RELEASES.md from the public registry.
//
// The inventory is a decision aid about what strangers can install, so a stale copy is worse
// than none: it reads as though someone checked. `--check` fails when the doc's package table
// no longer matches the registry, which is the only part that can drift without us acting.

var https = require('https')
var fs = require('fs')
var path = require('path')

var PACKAGES = [
  '@smartledger/bsv', '@smartledger/bsv-core', '@smartledger/keys',
  '@smartledger/notaryhash', '@smartledger/crypto', '@smartledger/envelope',
  'smartledger-bsv', '@smartledger/sdk'
]

function get (name) {
  return new Promise(function (resolve, reject) {
    var url = 'https://registry.npmjs.org/' + name.replace('/', '%2f')
    https.get(url, function (res) {
      var body = ''
      res.on('data', function (d) { body += d })
      res.on('end', function () {
        if (res.statusCode === 404) return resolve(null)
        try { resolve(JSON.parse(body)) } catch (e) { reject(e) }
      })
    }).on('error', reject)
  })
}

function summarise (name, d) {
  if (!d) return { name: name, missing: true }
  var versions = Object.keys(d.versions || {})
  var deprecated = versions.filter(function (v) { return d.versions[v].deprecated })
  // `time` also carries `created`, `modified` and — for a package whose versions were all
  // unpublished — an `unpublished` OBJECT rather than a date string. Take only the strings.
  var times = Object.keys(d.time || {})
    .filter(function (k) { return k !== 'created' && k !== 'modified' })
    .filter(function (k) { return typeof d.time[k] === 'string' })
    .map(function (k) { return d.time[k].slice(0, 10) })
    .sort()
  return {
    name: name,
    total: versions.length,
    deprecated: deprecated.length,
    live: versions.length - deprecated.length,
    latest: (d['dist-tags'] || {}).latest || 'none',
    first: times[0] || '?',
    last: times[times.length - 1] || '?'
  }
}

Promise.all(PACKAGES.map(function (p) {
  return get(p).then(function (d) { return summarise(p, d) })
})).then(function (rows) {
  var check = process.argv.indexOf('--check') !== -1
  var problems = []
  var doc = ''
  var docPath = path.join(__dirname, '..', 'docs', 'NPM_RELEASES.md')
  try { doc = fs.readFileSync(docPath, 'utf8') } catch (e) { doc = '' }

  rows.forEach(function (r) {
    if (r.missing) {
      console.log('  ' + r.name.padEnd(30) + 'not on the registry')
      return
    }
    console.log('  ' + r.name.padEnd(30) +
      String(r.total).padStart(4) + ' versions, ' +
      String(r.deprecated).padStart(3) + ' deprecated, ' +
      String(r.live).padStart(4) + ' live, latest ' + r.latest)
    if (doc && r.total > 0) {
      // the doc states each package's counts on one row; a changed count must be reflected
      var row = new RegExp('`' + r.name.replace(/[.*+?^${}()|[\]\\]/g, '\\$&') +
        '`[^\\n|]*\\|\\s*' + r.total + '\\s*\\|\\s*' + r.deprecated + '\\s*\\|\\s*' + r.live + '\\s*\\|')
      if (!row.test(doc)) {
        problems.push(r.name + ': registry says ' + r.total + '/' + r.deprecated + '/' +
          r.live + ' (total/deprecated/live), which docs/NPM_RELEASES.md does not state')
      }
    }
  })

  if (check && problems.length) {
    console.error('\nnpm-inventory FAILED — docs/NPM_RELEASES.md is out of date:')
    problems.forEach(function (p) { console.error('    ' + p) })
    console.error('\n  Re-read the registry and update the package table (and the tier lists if')
    console.error('  a version was added or deprecated).')
    process.exit(1)
  }
  if (check) console.log('\nnpm-inventory: OK — docs/NPM_RELEASES.md matches the registry.')
}).catch(function (e) {
  // A network failure is not a verdict about the doc.
  console.error('npm-inventory: could not reach the registry (' + e.message + ').')
  console.error('That is not a statement about the doc being wrong. Re-run when online.')
  process.exit(process.argv.indexOf('--check') !== -1 ? 0 : 1)
})
