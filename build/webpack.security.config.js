const path = require('path');

module.exports = {
  mode: 'production',
  entry: '../security-entry.js',
  output: {
    path: path.resolve(__dirname, '../'),
    filename: 'bsv-security.min.js',
    library: 'bsvSecurity',
    libraryTarget: 'var'
  },
  node: {
    // crypto left to webpack's default polyfill so Shamir (secrets.js) works
    // in the browser; bsv's own crypto stays pure-JS.
    fs: 'empty',
    path: 'empty',
    stream: 'empty',
    assert: 'empty',
    http: 'empty',
    https: 'empty',
    os: 'empty',
    url: 'empty'
  }
};