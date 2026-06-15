const path = require('path')
const { bundlePolyfills } = require('./webpack.base')

module.exports = bundlePolyfills({
  entry: path.join(__dirname, '../ecies/index.js'),
  mode: 'production',
  output: {
    path: path.resolve(__dirname, '../'),
    filename: 'bsv-ecies.min.js',
    library: 'bsvEcies',
    libraryTarget: 'var'
  },
  externals: { '../../': 'bsv' },
  target: 'web'
})
