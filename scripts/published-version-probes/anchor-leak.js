// End to end, through the PUBLIC API: does GDAF#anchorCredential / #anchorBatch return a
// SIGNED TRANSACTION whose OP_RETURN contains the caller's private key, recoverable to the
// same WIF?  Nothing is broadcast: the transaction is serialised locally and inspected.
//   usage: node e2e.js <installdir> <pkgname>
var root = process.argv[2]; var name = process.argv[3]
var pkgdir = root + '/node_modules/' + name
var bsv = require(pkgdir)
var version = require(pkgdir + '/package.json').version
var GDAF = require(pkgdir + '/lib/gdaf')
var PrivateKey = bsv.PrivateKey

var key = PrivateKey.fromRandom()
var wif = key.toWIF()
// a funding utxo for the anchor transaction, paying to the anchor's own address
var utxos = [{
  txId: 'f'.repeat(64),
  outputIndex: 0,
  address: key.toAddress().toString(),
  script: bsv.Script.buildPublicKeyHashOut(key.toAddress()).toHex(),
  satoshis: 100000
}]

function recover (hex) {
  var text = Buffer.from(hex, 'hex').toString('latin1')
  var hits = text.match(/[0-9a-f]{62,64}/g) || []
  var m = /"bn"\s*:\s*"([0-9a-fA-F]{1,64})"/.exec(text)
  if (m) hits.unshift(m[1])
  for (var h of hits) {
    try { if (PrivateKey.fromObject({ bn: h, compressed: key.compressed, network: 'livenet' }).toWIF() === wif) return true } catch (e) {}
  }
  return false
}

async function probe (label, fn) {
  try {
    var res = await fn()
    var tx = res.transaction
    var hex = tx.toString()
    console.log('  ' + label + ': signed_tx=' + (tx.inputs[0].script.toBuffer().length > 0) +
      '  bytes=' + (hex.length / 2) + '  key_recoverable_from_tx=' + recover(hex))
  } catch (e) {
    console.log('  ' + label + ': did not produce a transaction -> ' + e.message.slice(0, 70))
  }
}

;(async function () {
  console.log(name + '@' + version)
  var gdaf = new GDAF({ anchor: { network: 'livenet' } })
  await probe('anchorCredential', () => gdaf.anchorCredential(Buffer.alloc(32, 0xaa), key, utxos))
  await probe('anchorBatch     ', () => gdaf.anchorBatch([Buffer.alloc(32, 0xbb)], key, utxos))
})()
