// Does JSON.parse(JSON.stringify(key)) round-trip to a DIFFERENT, derivable key,
// with no error?  That is the claim the 7.5.1-7.5.4 deprecation makes.
var root = process.argv[2]
var name = process.argv[3] || '@smartledger/bsv'
var pkgdir = root + '/node_modules/' + name
var bsv = require(pkgdir)
var version = require(pkgdir + '/package.json').version
var key = bsv.PrivateKey.fromRandom()
var out
try {
  var back = bsv.PrivateKey.fromObject(JSON.parse(JSON.stringify(key)))
  out = back.toWIF() === key.toWIF()
    ? 'round-trips correctly'
    : 'SILENT WRONG KEY  bn=' + back.bn.toString(10) + '  bits=' + back.bn.bitLength() +
      '  addr=' + back.toAddress().toString() + '  (original ' + key.toAddress().toString() + ')'
} catch (e) { out = 'throws: ' + e.message.slice(0, 90) }
console.log(name + '@' + version + '  ->  ' + out)
