// Does upgrading the VERIFIER repair a commitment that an AFFECTED issuer already minted?
//
// 9.32.0 fixed the ambiguous commitment two ways: it refuses to MINT one, and it validates the
// disclosed value's domain at verification.  The second is the only one that helps a proof that
// already exists.  But `JSON.stringify` rendered NaN, Infinity and null identically as "null",
// so a commitment minted over NaN is BYTE-IDENTICAL to one minted over null - and `null` is
// inside the permitted domain, so the domain check cannot reject it.  If that is right, a
// patched verifier accepts a `null` the issuer never committed to, and the advisory's
// "proofs issued by an affected version do not need reissuing" is false for exactly the
// commitments that matter.
//
//   usage: node ltp-stale-commitment.js <issuerInstallDir> <verifierInstallDir> [pkgName]
var name = process.argv[4] || '@smartledger/bsv'
function load (dir) {
  var d = dir + '/node_modules/' + name
  return { v: require(d + '/package.json').version, LTP: require(d + '/lib/ltp/proof') }
}
var issuer = load(process.argv[2])
var verifier = load(process.argv[3])
var NONCE = 'nonce123'

function mint (LTP, value) {
  try {
    var r = LTP.prepareSelectiveDisclosure({ claim: { x: value } }, ['claim.x'], NONCE)
    if (!r || r.success === false) return { err: 'refused: ' + String(r && r.error).slice(0, 70) }
    return { proof: r.proof || r }
  } catch (e) { return { err: 'threw: ' + e.message.slice(0, 70) } }
}
function verify (LTP, proof) {
  try {
    var r = LTP.prepareSelectiveDisclosureVerification(proof, NONCE)
    if (!r || r.success === false) return 'error:' + String(r && r.error).slice(0, 40)
    return r.verification.valid === true ? 'VALID' : 'invalid'
  } catch (e) { return 'threw' }
}
// Present the same proof with a different disclosed value, without going through JSON (which
// would turn a planted NaN back into null - the instrument bug that once reported the defect
// fixed where it was not).
function present (proof, value) {
  var p = JSON.parse(JSON.stringify(proof))
  p.disclosures[0].value = value
  return p
}

console.log('issuer ' + issuer.v + '  ->  verifier ' + verifier.v + '\n')
var nan = mint(issuer.LTP, NaN)
if (nan.err) {
  console.log('  issuer cannot mint NaN (' + nan.err + ') - no stale ambiguous commitment to test')
} else {
  var c = nan.proof.disclosures[0].commitment
  console.log('  issuer minted a commitment over NaN:         ' + String(c).slice(0, 32) + '...')
  console.log('    verified as NaN  by the ISSUER   : ' + verify(issuer.LTP, present(nan.proof, NaN)) + '   (what the issuer believes it committed)')
  console.log('    verified as NaN  by the VERIFIER : ' + verify(verifier.LTP, present(nan.proof, NaN)) + '   (the domain check; expect a refusal)')
  console.log('    verified as null by the VERIFIER : ' + verify(verifier.LTP, present(nan.proof, null)) + '   <-- a value the issuer never committed to')
}
var honest = mint(issuer.LTP, null)
if (honest.err) { console.log('\n  control: issuer cannot mint null either (' + honest.err + ')') } else {
  console.log('\n  control, honest null from the same issuer:')
  console.log('    commitment: ' + String(honest.proof.disclosures[0].commitment).slice(0, 32) + '...')
  console.log('    verified as null by the VERIFIER : ' + verify(verifier.LTP, honest.proof) + '   (interop must hold)')
  if (!nan.err) {
    console.log('    the two commitments are ' +
      (honest.proof.disclosures[0].commitment === nan.proof.disclosures[0].commitment
        ? 'IDENTICAL only if the salt matched - compare per-salt below' : 'different (salts differ)'))
  }
}
var mintNan = mint(verifier.LTP, NaN)
console.log('\n  control, can the PATCHED version mint an ambiguous commitment? ' +
  (mintNan.err ? 'no - ' + mintNan.err : 'YES - that would be a second defect'))
