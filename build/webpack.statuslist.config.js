const path = require('path')

module.exports = {
  entry: './statuslist-entry.js',
  mode: 'production',
  optimization: {
    minimize: true
  },
  output: {
    path: path.resolve(__dirname, '../'),
    filename: 'bsv-statuslist.min.js',
    library: 'bsvStatusList',
    libraryTarget: 'umd',
    globalObject: 'this'
  },
  target: 'web'
}
