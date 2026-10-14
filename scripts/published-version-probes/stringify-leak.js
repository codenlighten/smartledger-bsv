// Does this version put the caller's private key into the anchor OP_RETURN payload,
// in a form an observer can turn back into the spending key?
// Builds the payload only: no network, no broadcast, no signing.
//   usage: node leakprobe.js <dir with node_modules/<pkg>> <pkg name> [-v]
var root = process.argv[2]
var name = process.argv[3]
var pkgdir = root + '/node_modules/' + name
var bsv = require(pkgdir)
var version = require(pkgdir + '/package.json').version
var PrivateKey = bsv.PrivateKey

var key = PrivateKey.fromRandom()
var wif = key.toWIF()

// recover any 32-byte-looking bn field from a text blob and compare WIFs.
function recovers (text) {
  var m = /"bn"\s*:\s*"([0-9a-fA-F]{1,64})"/.exec(text)
  if (!m) return false
  try { return PrivateKey.fromObject({ bn: m[1], compressed: key.compressed, network: key.network.name || key.network.toString() }).toWIF() === wif } catch (e) { return 'throw:' + e.message.slice(0, 30) }
}

var stringified = JSON.stringify(key)
var toJSON = recovers(stringified)

var payload = null
var detail = ''
try {
  var Anchor = require(pkgdir + '/lib/gdaf/smartledger-anchor')
  var anchor = new Anchor(key, { network: 'livenet' })
  // the wrapper's mistake, reproduced exactly: GDAF#anchorCredential passes the
  // private key as the `metadata` argument of Anchor#anchorCredential.
  var bytes = anchor._createAnchorPayload('CREDENTIAL', Buffer.alloc(32, 0xaa), key)
  payload = recovers(Buffer.from(bytes).toString('utf8'))
  detail = bytes.length + 'B'
} catch (e) {
  detail = (/Cannot find module/.test(e.message) ? 'no gdaf/smartledger-anchor module' : 'ERR ' + e.message.slice(0, 50))
}
console.log([name + '@' + version, 'toJSON_recovers_key=' + toJSON, 'payload_recovers_key=' + payload, detail].join('  '))
if (process.argv[4] === '-v') console.log('  wif ' + wif + '\n  ' + stringified)
