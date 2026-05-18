const path = require('path')

module.exports = {
  entry: './didweb-entry.js',
  mode: 'production',
  optimization: {
    minimize: true
  },
  output: {
    path: path.resolve(__dirname, '../'),
    filename: 'bsv-didweb.min.js',
    library: 'bsvDIDWeb',
    libraryTarget: 'umd',
    globalObject: 'this'
  },
  target: 'web'
}
