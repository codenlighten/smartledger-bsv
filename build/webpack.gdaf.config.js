const path = require('path')

module.exports = {
  mode: 'production',
  entry: './gdaf-entry.js',
  output: {
    path: path.resolve(__dirname, 'build'),
    filename: 'bsv-gdaf.min.js',
    library: 'GDAF',
    libraryTarget: 'umd',
    globalObject: 'this'
  },
  resolve: {
    fallback: {
      crypto: require.resolve('crypto-browserify'),
      stream: require.resolve('stream-browserify'),
      buffer: require.resolve('buffer'),
      util: require.resolve('util'),
      assert: require.resolve('assert'),
      url: require.resolve('url'),
      zlib: false,
      http: false,
      https: false,
      os: false,
      path: false,
      fs: false
    }
  },
  module: {
    rules: [
      {
        test: /\.js$/,
        exclude: /node_modules/,
        use: {
          loader: 'babel-loader',
          options: {
            presets: ['@babel/preset-env'],
            plugins: ['@babel/plugin-transform-runtime']
          }
        }
      }
    ]
  },
  plugins: [
    new (require('webpack').ProvidePlugin)({
      Buffer: ['buffer', 'Buffer'],
      process: 'process/browser'
    })
  ],
  optimization: {
    minimize: true
  },
  target: 'web'
}