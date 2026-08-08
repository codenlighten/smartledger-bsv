#!/usr/bin/env node
'use strict'

// `address` and `script` form a require cycle. `address.js` used to capture the partner
// at module scope (`var Script = require('./script')` after `module.exports`), which only
// works when address is loaded FIRST. Reaching `lib/script` first — a supported entry
// point, since the `exports` map publishes "./lib/*" — left that binding as script's
// partially initialised `{}`, and every `instanceof Script` threw
// "Right-hand side of 'instanceof' is not callable".
//
// This cannot live in the mocha suite: it must clear `require.cache`, which invalidates
// every module reference the in-process suite is holding. Run standalone.
//
//   node scripts/check-address-load-order.js

var path = require('path')
var LIB = path.join(__dirname, '..', 'lib')
var ADDR = '17VZNX1SN5NtKa8UQFxwQbFeFc3iqRYhem'

Object.keys(require.cache).forEach(function (k) { delete require.cache[k] })

// Deliberately load script before address — the order that used to break.
require(path.join(LIB, 'script', 'index.js'))
var Address = require(path.join(LIB, 'address.js'))
var Script = require(path.join(LIB, 'script', 'index.js'))

var script = Script.buildPublicKeyHashOut(Address.fromString(ADDR))
var failures = []

// Both entry points: fromScript reaches the check via _transformScript, the constructor
// reaches it via _classifyArguments. Testing only the former passes while the
// constructor path is still broken.
try {
  if (Address.fromScript(script).toString() !== ADDR) failures.push('fromScript returned the wrong address')
} catch (e) {
  failures.push('fromScript threw: ' + e.message)
}

try {
  if (new Address(script).toString() !== ADDR) failures.push('new Address(script) returned the wrong address')
} catch (e) {
  failures.push('new Address(script) threw: ' + e.message)
}

// payingTo() reaches the Script constructor itself, not just an instanceof check.
try {
  Address.payingTo(script)
} catch (e) {
  failures.push('payingTo threw: ' + e.message)
}

if (failures.length) {
  console.error('address load-order: FAILED')
  failures.forEach(function (f) { console.error('  - ' + f) })
  process.exit(1)
}

console.log('address load-order: OK (script required before address; fromScript, constructor and payingTo all work)')
