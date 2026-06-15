const path = require('path')
const { bundlePolyfills } = require('./webpack.base')

// security-entry embeds bsv (no externals) and needs the crypto polyfill so
// Shamir/secrets.js gets a CSPRNG in the browser -> full polyfills.
module.exports = bundlePolyfills({
  mode: 'production',
  entry: path.join(__dirname, '../security-entry.js'),
  output: {
    path: path.resolve(__dirname, '../'),
    filename: 'bsv-security.min.js',
    library: 'bsvSecurity',
    libraryTarget: 'var'
  }
})
