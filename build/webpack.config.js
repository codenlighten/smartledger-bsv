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
    // `crypto` is left to webpack's default polyfill (crypto-browserify) so
    // secrets.js (Shamir) can obtain a CSPRNG in the browser. bsv's own crypto
    // remains pure-JS. (Previously mocked 'empty', which broke Shamir.)
    stream: 'empty',
    Buffer: true
  },
  mode: 'production'
}
