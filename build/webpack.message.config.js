const path = require('path')
const { bundlePolyfills } = require('./webpack.base')

module.exports = bundlePolyfills({
  entry: path.join(__dirname, '../message/index.js'),
  mode: 'production',
  output: {
    path: path.resolve(__dirname, '../'),
    filename: 'bsv-message.min.js',
    library: 'bsvMessage',
    libraryTarget: 'var'
  },
  externals: { '../../': 'bsv' },
  target: 'web'
})
