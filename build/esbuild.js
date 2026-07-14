'use strict'
// esbuild build for the browser bundles (webpack -> esbuild migration). Replaces the 16
// webpack configs + webpack.base.js with one config-driven builder. Two polyfill modes
// mirror webpack.base.js: `full` = bundlePolyfills (browserify shims for Node built-ins,
// so Shamir/secrets.js gets a CSPRNG in the browser); `stub` = externStubs (built-ins
// stubbed to empty; bsv is loaded separately). Feature bundles externalise the bsv root
// to the global `bsv`. Every bundle is UMD (browser global + require()/AMD).
//
// esbuild gotcha: its `alias` prefix-matches (mis-resolving subpaths like process/browser),
// so resolution is done with precise onResolve plugins instead.
const path = require('path')
const esbuild = require('esbuild')
const R = (p) => require.resolve(p)
const ROOT = path.resolve(__dirname, '..')
const BSV_INDEX = path.join(ROOT, 'index.js')
const EMPTY = path.join(__dirname, 'esbuild/empty.js')

const BUILTIN = /^(crypto|stream|assert|util|zlib|vm|buffer|path|http|https|os|url|fs|net|tls|readline|child_process)$/

// full (bundlePolyfills): real browserify shims; unused server-only built-ins -> empty.
const FULL_SHIM = {
  crypto: R('crypto-browserify'),
  stream: R('stream-browserify'),
  assert: R('assert/'),
  util: R('util/'),
  zlib: R('browserify-zlib'),
  vm: R('vm-browserify'),
  buffer: R('buffer/'),
  path: R('path-browserify')
}
// stub (externStubs): everything empty except buffer/process (still needed as globals).
const STUB_SHIM = { buffer: R('buffer/') }

function polyfillPlugin (mode) {
  return {
    name: 'node-polyfills-' + mode,
    setup (build) {
      const shim = mode === 'stub' ? STUB_SHIM : FULL_SHIM
      build.onResolve({ filter: BUILTIN }, (a) => ({ path: shim[a.path] || EMPTY }))
      build.onResolve({ filter: /^process(\/browser)?$/ }, () => ({ path: R('process/browser') }))
      // keep `elliptic` out of the bundle (webpack aliased browserify-sign / create-ecdh -> false)
      build.onResolve({ filter: /^(browserify-sign|create-ecdh)(\/|$)/ }, () => ({ path: EMPTY }))
    }
  }
}

// Externalise the bsv root (require('../..') / require('../index.js') / etc.) to the global
// `bsv` — the webpack `externals: { … : 'bsv' }` behaviour for feature bundles.
function externalBsvPlugin () {
  return {
    name: 'external-bsv',
    setup (build) {
      build.onResolve({ filter: /^\.\.?[\\/]/ }, (a) => {
        const resolved = path.resolve(a.resolveDir, a.path)
        if (resolved === BSV_INDEX || resolved === ROOT) return { path: a.path, namespace: 'bsv-global' }
      })
      build.onLoad({ filter: /.*/, namespace: 'bsv-global' }, () => ({
        contents: 'module.exports=(typeof globalThis!=="undefined"?globalThis:(typeof self!=="undefined"?self:window)).bsv',
        loader: 'js'
      }))
    }
  }
}

function umdFooter (globalName) {
  return 'if(typeof module!=="undefined"&&module.exports){module.exports=' + globalName +
    '}else if(typeof define==="function"&&define.amd){define([],function(){return ' + globalName + '})}'
}

// The 16 published browser bundles (mirrors package.json build-* scripts).
const BUNDLES = [
  { file: 'bsv.min.js', entry: 'index.js', global: 'bsv', mode: 'full', externalBsv: false },
  { file: 'bsv.bundle.js', entry: 'bundle-entry.js', global: 'bsv', mode: 'full', externalBsv: false },
  { file: 'bsv-ecies.min.js', entry: 'ecies/index.js', global: 'bsvEcies', mode: 'full', externalBsv: true },
  { file: 'bsv-message.min.js', entry: 'message/index.js', global: 'bsvMessage', mode: 'full', externalBsv: true },
  { file: 'bsv-mnemonic.min.js', entry: 'mnemonic/index.js', global: 'bsvMnemonic', mode: 'full', externalBsv: true },
  { file: 'bsv-shamir.min.js', entry: 'shamir-entry.js', global: 'bsvShamir', mode: 'full', externalBsv: true },
  { file: 'bsv-smartcontract.min.js', entry: 'smartcontract-entry.js', global: 'bsvSmartContract', mode: 'stub', externalBsv: true },
  { file: 'bsv-covenant.min.js', entry: 'covenant-entry.js', global: 'bsvCovenant', mode: 'stub', externalBsv: true },
  { file: 'bsv-script-helper.min.js', entry: 'script-helper-entry.js', global: 'bsvScriptHelper', mode: 'stub', externalBsv: true },
  { file: 'bsv-security.min.js', entry: 'security-entry.js', global: 'bsvSecurity', mode: 'full', externalBsv: false },
  { file: 'bsv-ltp.min.js', entry: 'ltp-entry.js', global: 'bsvLTP', mode: 'full', externalBsv: false },
  { file: 'bsv-gdaf.min.js', entry: 'gdaf-entry.js', global: 'bsvGDAF', mode: 'full', externalBsv: false },
  { file: 'bsv-didweb.min.js', entry: 'didweb-entry.js', global: 'bsvDIDWeb', mode: 'full', externalBsv: false },
  { file: 'bsv-vcjwt.min.js', entry: 'vcjwt-entry.js', global: 'bsvVcJwt', mode: 'full', externalBsv: false },
  { file: 'bsv-statuslist.min.js', entry: 'statuslist-entry.js', global: 'bsvStatusList', mode: 'full', externalBsv: false },
  { file: 'bsv-anchor.min.js', entry: 'anchor-entry.js', global: 'bsvAnchor', mode: 'full', externalBsv: false }
]

// Build one bundle. Pass { write: false } to get the output in memory (for tests).
function buildOne (cfg, opts) {
  opts = opts || {}
  const plugins = [polyfillPlugin(cfg.mode)]
  if (cfg.externalBsv) plugins.push(externalBsvPlugin())
  return esbuild.build({
    entryPoints: [path.join(ROOT, cfg.entry)],
    bundle: true,
    format: 'iife',
    globalName: cfg.global,
    platform: 'browser',
    target: ['es2020'], // bsv + @noble/curves use BigInt
    minify: true,
    legalComments: 'none',
    plugins,
    inject: [path.join(__dirname, 'esbuild/globals.js')],
    define: { global: 'globalThis' },
    footer: { js: umdFooter(cfg.global) },
    write: opts.write !== false,
    outfile: opts.write === false ? undefined : path.join(ROOT, cfg.file),
    logLevel: opts.logLevel || 'warning'
  })
}

// The full library bundle (bsv.min.js) — kept for the build-integrity test.
function buildFullBundle (opts) {
  return buildOne(BUNDLES[0], opts)
}

function buildAll () {
  return Promise.all(BUNDLES.map(function (c) { return buildOne(c) }))
}

module.exports = { buildFullBundle, buildAll, buildOne, BUNDLES }

if (require.main === module) {
  buildAll().then(function () {
    console.log('esbuild: built ' + BUNDLES.length + ' bundles')
  }).catch(function (e) { console.error(e.message || e); process.exit(1) })
}
