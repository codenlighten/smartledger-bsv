var path = require('path')
var { bundlePolyfills } = require('./webpack.base')

// Full library bundle (bsv.min.js). webpack 5: Node-core polyfills are declared
// via bundlePolyfills (crypto-browserify so secrets.js/Shamir gets a CSPRNG in
// the browser; Buffer global preserved). bsv's own crypto stays pure-JS.
module.exports = bundlePolyfills({
  entry: path.join(__dirname, '../index.js'),
  output: {
    library: 'bsv',
    libraryTarget: 'umd',
    globalObject: "typeof self !== 'undefined' ? self : this",
    path: path.resolve(__dirname, '../'),
    filename: 'bsv.min.js'
  },
  mode: 'production'
})
