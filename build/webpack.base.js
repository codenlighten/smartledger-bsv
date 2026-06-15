'use strict'

// Shared webpack 5 helpers. webpack 5 removed the automatic Node-core polyfills
// that webpack 4 provided, so every bundle must declare them explicitly:
//  - bundlePolyfills(): for bundles that include bsv's own crypto (full bundle,
//    feature bundles, Shamir CSPRNG via secrets.js) -> real browserify shims +
//    Buffer/process globals.
//  - externStubs(): for bundles that externalize bsv and don't need its crypto
//    -> stub the Node-core modules to empty (the webpack 4 `node: {x:'empty'}`).
//
// Both also pin TerserPlugin with extractComments:false so no *.LICENSE.txt
// sidecar files are emitted (webpack 4 did not emit them; keeps the published
// file list unchanged).

const webpack = require('webpack')
const TerserPlugin = require('terser-webpack-plugin')

const FULL_FALLBACK = {
  crypto: require.resolve('crypto-browserify'),
  stream: require.resolve('stream-browserify'),
  buffer: require.resolve('buffer/'),
  process: require.resolve('process/browser'),
  assert: require.resolve('assert/'),
  util: require.resolve('util/'),
  path: require.resolve('path-browserify'),
  zlib: require.resolve('browserify-zlib'),
  vm: require.resolve('vm-browserify'),
  http: false,
  https: false,
  os: false,
  url: false,
  fs: false,
  net: false,
  tls: false,
  readline: false,
  child_process: false
}

const STUB_FALLBACK = {
  crypto: false,
  stream: false,
  buffer: false,
  process: false,
  assert: false,
  util: false,
  path: false,
  zlib: false,
  vm: false,
  http: false,
  https: false,
  os: false,
  url: false,
  fs: false,
  net: false,
  tls: false,
  readline: false,
  child_process: false
}

function applyOptimization (config) {
  config.optimization = Object.assign({ minimize: true }, config.optimization, {
    minimizer: [new TerserPlugin({ extractComments: false })]
  })
  // These are library bundles; the browser asset-size hints are noise here.
  config.performance = Object.assign({ hints: false }, config.performance)
}

function merge (config, fallback, plugins) {
  config.resolve = config.resolve || {}
  // config-provided fallbacks win over the shared defaults.
  config.resolve.fallback = Object.assign({}, fallback, config.resolve.fallback)
  config.plugins = (config.plugins || []).concat(plugins)
  applyOptimization(config)
  return config
}

// For bundles that include bsv's crypto (need real Node-core shims).
function bundlePolyfills (config) {
  // secrets.js-grempe (Shamir) is a UMD whose AMD branch calls its factory
  // WITHOUT the crypto argument. webpack provides `define.amd`, so it takes that
  // branch and secrets.js receives `crypto === undefined` — its CSPRNG init then
  // throws ("Initialization failed") and Shamir is broken in the browser.
  // Disabling AMD for it forces the CommonJS branch — factory(require('crypto'))
  // — so it gets crypto-browserify and initialises correctly.
  config.module = config.module || {}
  config.module.rules = (config.module.rules || []).concat([
    { test: /secrets\.js-grempe/, parser: { amd: false } }
  ])
  // crypto-browserify drags in the whole `elliptic` library via browserify-sign
  // + create-ecdh (for crypto.createSign/createVerify/createECDH) — APIs bsv
  // never calls (its EC crypto is @noble). Stub them so `elliptic` is not bundled
  // (~140KB/bundle). randomBytes/createHash/createHmac (the Shamir CSPRNG and
  // hashing) are unaffected.
  config.resolve = config.resolve || {}
  config.resolve.alias = Object.assign(
    { 'browserify-sign': false, 'create-ecdh': false },
    config.resolve.alias
  )
  return merge(config, FULL_FALLBACK, [
    new webpack.ProvidePlugin({ Buffer: ['buffer', 'Buffer'], process: 'process/browser' })
  ])
}

// For bundles that externalize/already-embed bsv and don't need its crypto
// polyfill: stub the heavy Node-core modules to empty (the webpack 4
// `node: {x:'empty'}`), but still provide the Buffer and process globals —
// webpack 4 provided both by default and the embedded bsv code relies on them
// (e.g. process.browser, Buffer).
function externStubs (config) {
  const fallback = Object.assign({}, STUB_FALLBACK, {
    buffer: require.resolve('buffer/'),
    process: require.resolve('process/browser')
  })
  return merge(config, fallback, [
    new webpack.ProvidePlugin({ Buffer: ['buffer', 'Buffer'], process: 'process/browser' })
  ])
}

module.exports = { bundlePolyfills, externStubs }
