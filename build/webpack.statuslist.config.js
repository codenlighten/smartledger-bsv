const path = require('path')
const { bundlePolyfills } = require('./webpack.base')

module.exports = bundlePolyfills({
  entry: path.join(__dirname, '../statuslist-entry.js'),
  mode: 'production',
  output: {
    path: path.resolve(__dirname, '../'),
    filename: 'bsv-statuslist.min.js',
    library: 'bsvStatusList',
    libraryTarget: 'umd',
    globalObject: 'this'
  },
  target: 'web'
})
