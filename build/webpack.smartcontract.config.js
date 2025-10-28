const path = require('path')

module.exports = {
  entry: path.join(__dirname, '../smartcontract-entry.js'),
  output: {
    library: 'bsvSmartContract',
    libraryTarget: 'umd',
    globalObject: 'typeof self !== \'undefined\' ? self : this',
    path: path.resolve(__dirname, '../'),
    filename: 'bsv-smartcontract.min.js'
  },
  externals: {
    // Don't bundle BSV - expect it to be loaded separately
    './index.js': 'bsv'
  },
  node: {
    crypto: 'empty',
    stream: 'empty',  
    Buffer: true
  },
  mode: 'production',
  optimization: {
    minimize: true
  }
}