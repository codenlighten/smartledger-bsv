const path = require('path')

module.exports = {
  entry: './ltp-entry.js',
  mode: 'production',
  optimization: {
    minimize: true
  },
  output: {
    path: path.resolve(__dirname, '../'),
    filename: 'bsv-ltp.min.js',
    library: 'bsvLTP',
    libraryTarget: 'umd',
    globalObject: 'this'
  },
  target: 'web'
}