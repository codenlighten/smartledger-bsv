const path = require('path');

module.exports = {
  mode: 'production',
  entry: '../script-helper-entry.js',
  output: {
    path: path.resolve(__dirname, '../'),
    filename: 'bsv-script-helper.min.js',
    library: 'bsvScriptHelper',
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