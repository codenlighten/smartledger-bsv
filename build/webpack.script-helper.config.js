const path = require('path')
const { externStubs } = require('./webpack.base')

module.exports = externStubs({
  mode: 'production',
  entry: path.join(__dirname, '../script-helper-entry.js'),
  output: {
    path: path.resolve(__dirname, '../'),
    filename: 'bsv-script-helper.min.js',
    library: 'bsvScriptHelper',
    libraryTarget: 'var'
  },
  externals: {
    // Don't bundle BSV - it should be loaded separately
    '../index.js': 'bsv'
  }
})
