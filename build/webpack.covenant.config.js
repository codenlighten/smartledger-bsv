const path = require('path');

module.exports = {
  mode: 'production',
  entry: '../covenant-entry.js',
  output: {
    path: path.resolve(__dirname, '../'),
    filename: 'bsv-covenant.min.js',
    library: 'bsvCovenant',
    libraryTarget: 'var'
  },
  externals: {
    // Don't bundle BSV - it should be loaded separately
    '../index.js': 'bsv'
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