const path = require('path')

module.exports = {
  entry: './gdaf-entry.js',
  mode: 'production',
  optimization: {
    minimize: true
  },
  output: {
    path: path.resolve(__dirname, '../'),
    filename: 'bsv-gdaf.min.js',
    library: 'bsvGDAF',
    libraryTarget: 'umd',
    globalObject: 'this'
  },
  target: 'web'
}