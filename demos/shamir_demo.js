#!/usr/bin/env node

/**
 * BSV Shamir Secret Sharing Demo
 * 
 * This demonstrates how to use Shamir Secret Sharing for secure secret distribution
 * Perfect for backup keys, passwords, or any sensitive data that needs to be distributed
 * across multiple parties with threshold security.
 */

'use strict'

var bsv = require('../index.js')

console.log('🔐 BSV Shamir Secret Sharing Demo')
console.log('=====================================\n')

// Example 1: Basic secret sharing
console.log('📝 Example 1: Basic Secret Sharing')
console.log('----------------------------------')

var secret = 'my-super-secret-bitcoin-private-key'
var threshold = 3  // Need at least 3 shares to reconstruct
var totalShares = 5  // Create 5 total shares

console.log('Secret to protect:', secret)
console.log('Security policy: ' + threshold + ' of ' + totalShares + ' shares required\n')

// Split the secret
var shares = bsv.Shamir.split(secret, threshold, totalShares)
console.log('✅ Secret split into', shares.length, 'shares')

// Display share information (truncated for security)
shares.forEach(function(share, index) {
  console.log('  Share ' + (index + 1) + ': ID=' + share.id + ', bytes=' + share.length)
})

// Reconstruct with minimum shares (3 of 5)
console.log('\n🔓 Reconstructing with shares 1, 3, and 5...')
var selectedShares = [shares[0], shares[2], shares[4]]  // shares 1, 3, 5
var reconstructed = bsv.Shamir.combine(selectedShares)
var reconstructedSecret = reconstructed.toString('utf8')

console.log('Reconstructed secret:', reconstructedSecret)
console.log('Match original:', reconstructedSecret === secret ? '✅ YES' : '❌ NO')

// Example 2: Bitcoin wallet backup scenario
console.log('\n\n💰 Example 2: Bitcoin Wallet Backup Scenario')
console.log('---------------------------------------------')

var walletMnemonic = 'abandon abandon abandon abandon abandon abandon abandon abandon abandon abandon abandon about'
var backupPolicy = { threshold: 2, shares: 3 }  // 2-of-3 backup

console.log('Wallet mnemonic (12 words):', walletMnemonic.split(' ').slice(0, 3).join(' ') + '...')
console.log('Backup policy: ' + backupPolicy.threshold + ' of ' + backupPolicy.shares + ' shares needed\n')

var walletShares = bsv.Shamir.split(walletMnemonic, backupPolicy.threshold, backupPolicy.shares)

console.log('📋 Backup shares created:')
walletShares.forEach(function(share, index) {
  var label = ['👤 Family Member', '🏦 Bank Safe', '☁️  Cloud Storage'][index]
  console.log('  Share ' + (index + 1) + ': ' + label + ' (ID: ' + share.id + ')')
})

// Simulate recovery with 2 shares
console.log('\n🔧 Simulating wallet recovery with shares from Family Member + Bank Safe...')
var recoveryShares = [walletShares[0], walletShares[1]]  // First 2 shares
var recoveredMnemonic = bsv.Shamir.combine(recoveryShares).toString('utf8')

console.log('Recovered mnemonic:', recoveredMnemonic === walletMnemonic ? '✅ SUCCESS' : '❌ FAILED')

// Example 3: Binary data (keys, certificates, etc.)
console.log('\n\n🔑 Example 3: Binary Data Protection')
console.log('-----------------------------------')

var binarySecret = Buffer.from([0x04, 0x8f, 0xab, 0x23, 0xc1, 0x9e, 0x77, 0x44])  // Example key bytes
console.log('Binary secret (hex):', binarySecret.toString('hex'))
console.log('Binary secret length:', binarySecret.length, 'bytes\n')

var binaryShares = bsv.Shamir.split(binarySecret, 2, 4)
console.log('✅ Binary data split into', binaryShares.length, 'shares')

var recoveredBinary = bsv.Shamir.combine(binaryShares.slice(0, 2))
console.log('Recovered binary (hex):', recoveredBinary.toString('hex'))
console.log('Binary match:', Buffer.compare(binarySecret, recoveredBinary) === 0 ? '✅ YES' : '❌ NO')

// Example 4: Share verification
console.log('\n\n🔍 Example 4: Share Verification')
console.log('--------------------------------')

var testShares = bsv.Shamir.split('verification-test', 2, 3)
console.log('Testing share integrity...')

testShares.forEach(function(share, index) {
  var isValid = bsv.Shamir.verifyShare(share)
  console.log('  Share ' + (index + 1) + ':', isValid ? '✅ Valid' : '❌ Invalid')
})

// Test with corrupted share
var corruptedShare = JSON.parse(JSON.stringify(testShares[0]))
corruptedShare.bytes[0].y = 'invalid-hex'  // Corrupt the data
console.log('  Corrupted share:', bsv.Shamir.verifyShare(corruptedShare) ? '❌ Invalid test failed' : '✅ Correctly rejected')

console.log('\n🎯 Use Cases for Shamir Secret Sharing:')
console.log('--------------------------------------')
console.log('• 🔐 Bitcoin wallet backup (split mnemonic across family/friends)')
console.log('• 🏢 Corporate key management (distribute signing keys)')
console.log('• 🛡️  Multi-party authentication (API keys, passwords)')
console.log('• 💾 Secure data backup (encrypt once, distribute shares)')
console.log('• 🤝 Trustless escrow (require multiple parties to unlock)')
console.log('• 🏦 Bank vault security (multiple keyholders required)')

console.log('\n📦 Integration Options:')
console.log('----------------------')
console.log('• Main library: bsv.Shamir or bsv.crypto.Shamir')
console.log('• Standalone: bsv-shamir.min.js (433 KB)')
console.log('• CDN ready: Use in browser with <script> tag')
console.log('• Node.js: require("@smartledger/bsv").Shamir')

console.log('\n✨ Demo completed successfully!')
console.log('Visit: https://github.com/codenlighten/smartledger-bsv for more examples')