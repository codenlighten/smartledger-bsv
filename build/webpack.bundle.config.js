const path = require('path')

module.exports = {
  entry: path.join(__dirname, '../bundle-entry.js'),
  output: {
    library: 'bsv',
    libraryTarget: 'umd',
    globalObject: 'typeof self !== \'undefined\' ? self : this',
    path: path.resolve(__dirname, '../'),
    filename: 'bsv.bundle.js'
  },
  node: {
    // crypto left to webpack's default polyfill so Shamir (secrets.js) works
    // in the browser; bsv's own crypto stays pure-JS.
    stream: 'empty',
    Buffer: true
  },
  mode: 'production',
  optimization: {
    minimize: true
  },

}