'use strict'
// esbuild build for the browser bundles (webpack -> esbuild migration, step 1: the full
// library bundle). Replicates build/webpack.base.js's Node-core polyfill map via a precise
// onResolve plugin (esbuild's `alias` prefix-matches, mis-resolving subpaths like
// process/browser). Proven equivalent to the webpack bsv.min.js: 20/20 Chrome browser-smoke.
const path = require('path')
const esbuild = require('esbuild')
const R = (p) => require.resolve(p)
const EMPTY = path.join(__dirname, 'esbuild/empty.js')

// exact node-builtin -> browserify shim (same set as webpack FULL_FALLBACK)
const SHIM = {
  crypto: R('crypto-browserify'),
  stream: R('stream-browserify'),
  assert: R('assert/'),
  util: R('util/'),
  zlib: R('browserify-zlib'),
  vm: R('vm-browserify'),
  buffer: R('buffer/'),
  path: R('path-browserify')
}
const EMPTY_BUILTINS = new Set(['http', 'https', 'os', 'url', 'fs', 'net', 'tls', 'readline', 'child_process'])

const nodePolyfills = {
  name: 'node-polyfills',
  setup (build) {
    build.onResolve({ filter: /^(crypto|stream|assert|util|zlib|vm|buffer|path|http|https|os|url|fs|net|tls|readline|child_process)$/ }, (a) => {
      if (SHIM[a.path]) return { path: SHIM[a.path] }
      if (EMPTY_BUILTINS.has(a.path)) return { path: EMPTY }
    })
    build.onResolve({ filter: /^process(\/browser)?$/ }, () => ({ path: R('process/browser') }))
    // keep `elliptic` out of the bundle (webpack aliased browserify-sign / create-ecdh -> false)
    build.onResolve({ filter: /^(browserify-sign|create-ecdh)(\/|$)/ }, () => ({ path: EMPTY }))
  }
}

// Build the full library IIFE bundle (global `bsv`). Pass { write: false } to get the
// output in memory (used by the build-integrity test) instead of writing a file.
function buildFullBundle (opts) {
  opts = opts || {}
  return esbuild.build({
    entryPoints: [path.join(__dirname, '../index.js')],
    bundle: true,
    format: 'iife',
    globalName: 'bsv',
    platform: 'browser',
    target: ['es2020'], // bsv + @noble/curves use BigInt
    minify: true,
    legalComments: 'none',
    plugins: [nodePolyfills],
    inject: [path.join(__dirname, 'esbuild/globals.js')],
    define: { global: 'globalThis' },
    // esbuild emits an IIFE (browser global `bsv`); webpack emitted UMD. Add a footer so the
    // same file also works via CommonJS `require()` and AMD `define`, preserving the UMD
    // contract for anyone who loads bsv.min.js outside a <script> tag.
    footer: {
      js: 'if(typeof module!=="undefined"&&module.exports){module.exports=bsv}else if(typeof define==="function"&&define.amd){define([],function(){return bsv})}'
    },
    write: opts.write !== false,
    outfile: opts.write === false ? undefined : path.join(__dirname, '../bsv.esbuild.min.js'),
    logLevel: opts.logLevel || 'warning'
  })
}

module.exports = { buildFullBundle }

if (require.main === module) {
  buildFullBundle().then(function () {
    var kb = (require('fs').statSync(path.join(__dirname, '../bsv.esbuild.min.js')).size / 1024).toFixed(0)
    console.log('esbuild full bundle built: bsv.esbuild.min.js (' + kb + ' KB)')
  }).catch(function (e) { console.error(e.message || e); process.exit(1) })
}
