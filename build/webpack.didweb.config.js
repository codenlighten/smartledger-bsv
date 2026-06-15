const path = require('path')
const { bundlePolyfills } = require('./webpack.base')

module.exports = bundlePolyfills({
  entry: path.join(__dirname, '../didweb-entry.js'),
  mode: 'production',
  output: {
    path: path.resolve(__dirname, '../'),
    filename: 'bsv-didweb.min.js',
    library: 'bsvDIDWeb',
    libraryTarget: 'umd',
    globalObject: 'this'
  },
  target: 'web'
})
