const path = require('path')
const { bundlePolyfills } = require('./webpack.base')

// Everything-in-one bundle (bsv.bundle.js). Same polyfill posture as bsv.min.js.
module.exports = bundlePolyfills({
  entry: path.join(__dirname, '../bundle-entry.js'),
  output: {
    library: 'bsv',
    libraryTarget: 'umd',
    globalObject: "typeof self !== 'undefined' ? self : this",
    path: path.resolve(__dirname, '../'),
    filename: 'bsv.bundle.js'
  },
  mode: 'production'
})
