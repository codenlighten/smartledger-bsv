const path = require('path')
const { bundlePolyfills } = require('./webpack.base')

module.exports = bundlePolyfills({
  entry: path.join(__dirname, '../vcjwt-entry.js'),
  mode: 'production',
  output: {
    path: path.resolve(__dirname, '../'),
    filename: 'bsv-vcjwt.min.js',
    library: 'bsvVcJwt',
    libraryTarget: 'umd',
    globalObject: 'this'
  },
  target: 'web'
})
