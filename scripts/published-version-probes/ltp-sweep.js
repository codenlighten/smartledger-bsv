// One line per published version covering every LTP selective-disclosure question at once, so a
// range can be drawn from measurement rather than from the versions that happened to be at hand.
//
//   module      is lib/ltp/proof present at all?  (a range must not cover versions without it)
//   honest      does an honest disclosure of `null` verify?  (the instrument's control)
//   forged      is a substituted NaN accepted?  (the commitment-domain defect)
//   recovered   can an UNDISCLOSED field be recovered from the proof alone?  (the salt defect)
//
//   usage: node ltp-sweep.js <installdir> [pkgName]
var name = process.argv[3] || '@smartledger/bsv'
var pkgdir = process.argv[2] + '/node_modules/' + name
var version = require(pkgdir + '/package.json').version
var out = [name + '@' + version]
function say (s) { console.log(out.concat(s).join('  ')) }

var LTP, Hash
try {
  LTP = require(pkgdir + '/lib/ltp/proof')
  Hash = require(pkgdir + '/lib/crypto/hash')
} catch (e) { say('module=absent'); process.exit(0) }
if (typeof LTP.prepareSelectiveDisclosure !== 'function') { say('module=present api=absent'); process.exit(0) }
out.push('module=present')

var NONCE = 'nonce123'
function verdict (proof) {
  try {
    var r = LTP.prepareSelectiveDisclosureVerification(proof, NONCE)
    if (!r || r.success === false) return 'error'
    return r.verification.valid === true
  } catch (e) { return 'throw' }
}

// 1 + 2: honest disclosure of null, then the same proof with NaN substituted.
try {
  var r = LTP.prepareSelectiveDisclosure({ claim: { x: null } }, ['claim.x'], NONCE)
  if (!r || r.success === false) throw new Error(String(r && r.error))
  var proof = r.proof || r
  out.push('honest=' + verdict(proof))
  var p = JSON.parse(JSON.stringify(proof))
  p.disclosures[0].value = NaN
  out.push('forged=' + verdict(p))
} catch (e) { out.push('honest=SETUP_FAILED(' + e.message.slice(0, 40) + ')') }

// 3: recover an undisclosed field from the proof alone.  Only proof.nonce, the schema paths and
// the library's own hashing are used - nothing a holder would withhold.
try {
  var SECRET = '1987-03-14'
  var r2 = LTP.prepareSelectiveDisclosure(
    { claim: { name: 'Alice', dob: SECRET, ssn: '123-45-6789', city: 'Austin' } }, ['claim.name'], 'abc123')
  var p2 = r2.proof || r2
  var sib = p2.merkleProofs[0].proof[0].hash
  var hit = null
  for (var y = 1980; y <= 1999 && !hit; y++) {
    for (var m = 1; m <= 12 && !hit; m++) {
      for (var d = 1; d <= 31 && !hit; d++) {
        var cand = y + '-' + ('0' + m).slice(-2) + '-' + ('0' + d).slice(-2)
        for (var i = 0; i < 4; i++) {
          var salt = Hash.sha256(Buffer.from(p2.nonce + 'claim.dob' + i)).toString('hex')
          if (LTP._hashField('claim.dob', cand, salt) === sib) { hit = cand; break }
        }
      }
    }
  }
  out.push('recovered=' + (hit === SECRET ? 'YES' : hit ? 'WRONG(' + hit + ')' : 'no'))
} catch (e) { out.push('recovered=ERROR(' + e.message.slice(0, 30) + ')') }
say([])
