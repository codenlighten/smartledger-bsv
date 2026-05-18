const path = require('path')

module.exports = {
  entry: './anchor-entry.js',
  mode: 'production',
  optimization: {
    minimize: true
  },
  output: {
    path: path.resolve(__dirname, '../'),
    filename: 'bsv-anchor.min.js',
    library: 'bsvAnchor',
    libraryTarget: 'umd',
    globalObject: 'this'
  },
  target: 'web'
}
