const path = require('path')
const { bundlePolyfills } = require('./webpack.base')

module.exports = bundlePolyfills({
  entry: path.join(__dirname, '../shamir-entry.js'),
  mode: 'production',
  output: {
    path: path.resolve(__dirname, '../'),
    filename: 'bsv-shamir.min.js',
    library: 'bsvShamir',
    libraryTarget: 'var'
  },
  externals: { '../../': 'bsv' },
  target: 'web'
})
