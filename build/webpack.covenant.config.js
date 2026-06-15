const path = require('path')
const { externStubs } = require('./webpack.base')

module.exports = externStubs({
  mode: 'production',
  entry: path.join(__dirname, '../covenant-entry.js'),
  output: {
    path: path.resolve(__dirname, '../'),
    filename: 'bsv-covenant.min.js',
    library: 'bsvCovenant',
    libraryTarget: 'var'
  },
  externals: {
    // Don't bundle BSV - it should be loaded separately
    '../index.js': 'bsv'
  }
})
