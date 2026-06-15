const path = require('path')
const { bundlePolyfills } = require('./webpack.base')

module.exports = bundlePolyfills({
  entry: path.join(__dirname, '../anchor-entry.js'),
  mode: 'production',
  output: {
    path: path.resolve(__dirname, '../'),
    filename: 'bsv-anchor.min.js',
    library: 'bsvAnchor',
    libraryTarget: 'umd',
    globalObject: 'this'
  },
  target: 'web'
})
