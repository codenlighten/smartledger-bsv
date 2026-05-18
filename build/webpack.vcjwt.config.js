const path = require('path')

module.exports = {
  entry: './vcjwt-entry.js',
  mode: 'production',
  optimization: {
    minimize: true
  },
  output: {
    path: path.resolve(__dirname, '../'),
    filename: 'bsv-vcjwt.min.js',
    library: 'bsvVcJwt',
    libraryTarget: 'umd',
    globalObject: 'this'
  },
  target: 'web'
}
