const path = require('path')
const { bundlePolyfills } = require('./webpack.base')

module.exports = bundlePolyfills({
  entry: path.join(__dirname, '../mnemonic/index.js'),
  mode: 'production',
  output: {
    path: path.resolve(__dirname, '../'),
    filename: 'bsv-mnemonic.min.js',
    library: 'bsvMnemonic',
    libraryTarget: 'var'
  },
  externals: { '../../': 'bsv' },
  target: 'web'
})
