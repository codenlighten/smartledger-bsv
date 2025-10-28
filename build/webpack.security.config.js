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
    fs: 'empty',
    path: 'empty',
    crypto: 'empty',
    stream: 'empty',
    assert: 'empty',
    http: 'empty',
    https: 'empty',
    os: 'empty',
    url: 'empty'
  }
};