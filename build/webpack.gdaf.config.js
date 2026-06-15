const path = require('path')
const { bundlePolyfills } = require('./webpack.base')

module.exports = bundlePolyfills({
  entry: path.join(__dirname, '../gdaf-entry.js'),
  mode: 'production',
  output: {
    path: path.resolve(__dirname, '../'),
    filename: 'bsv-gdaf.min.js',
    library: 'bsvGDAF',
    libraryTarget: 'umd',
    globalObject: 'this'
  },
  target: 'web'
})
