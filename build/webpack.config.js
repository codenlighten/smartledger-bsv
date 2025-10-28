var path = require('path')

module.exports = {
  entry: path.join(__dirname, '../index.js'),
  output: {
    library: 'bsv',
    libraryTarget: 'umd',
    globalObject: 'typeof self !== \'undefined\' ? self : this',
    path: path.resolve(__dirname, '../'),
    filename: 'bsv.min.js'
  },
  node: {
    crypto: 'empty',
    stream: 'empty',
    Buffer: true
  },
  mode: 'production'
}
