/**
 * mock_utxo_generator.js
 *
 * Usage:
 *   # generate a new random private key and a mock utxo (default satoshis = 100000)
 *   node mock_utxo_generator.js
 *
 *   # provide WIF and create a utxo
 *   node mock_utxo_generator.js <WIF>
 *
 *   # provide WIF, set satoshis, and optionally create a signed tx to a recipient
 *   node mock_utxo_generator.js <WIF> <satoshis> <recipientAddress>
 *
 * Example:
 *   node mock_utxo_generator.js L1aW4aubDFB7yfras2S1mMEW7bZ1aW4aubD 50000 muZ... (example address)
 *
 * Notes:
 * - Requires `bsv` package: npm install bsv
 * - This is for LOCAL TESTING only. The produced txid, utxo, and tx hex are fake/mock and
 *   intended to be consumed by local test harnesses or unit tests (or regtest setups if you
 *   create a matching real TX there).
 */

const bsv = require('../index.js')
const crypto = require('crypto')

function usage () {
  console.log('Usage: node mock_utxo_generator.js [WIF] [satoshis] [recipientAddress]')
  console.log('If WIF omitted, a random private key is generated.')
}

function randomHex (len) {
  return crypto.randomBytes(len).toString('hex')
}

function createMockTxId () {
  // create random 32-byte hex as fake txid (little-endian vs big-endian not important for mocks)
  return randomHex(32)
}

function buildP2pkhScriptHex (address) {
  return bsv.Script.buildPublicKeyHashOut(address).toHex()
}

function mkUtxo (privateKey, sats = 100000) {
  const address = privateKey.toAddress().toString()
  const txid = createMockTxId()
  const vout = 0
  const scriptHex = buildP2pkhScriptHex(address)

  // Return a utxo shape compatible with bsv.Transaction().from(...)
  return {
    txId: txid,
    txid: txid, // alternate naming used by some code
    vout: vout,
    outputIndex: vout, // bsv accepts outputIndex or vout
    satoshis: sats,
    value: sats,
    script: scriptHex,
    scriptPubKey: scriptHex,
    address
  }
}

async function main () {
  const argv = process.argv.slice(2)
  if (argv.includes('-h') || argv.includes('--help')) {
    usage()
    return
  }

  const maybeWif = argv[0]
  const maybeSatoshis = argv[1]
  const recipient = argv[2]

  let privateKey
  try {
    if (maybeWif) {
      // try to load from WIF
      privateKey = bsv.PrivateKey.fromWIF(maybeWif)
    } else {
      privateKey = new bsv.PrivateKey() // random
    }
  } catch (e) {
    console.error('Invalid WIF provided. Exiting.')
    process.exit(1)
  }

  const satoshis = maybeSatoshis ? parseInt(maybeSatoshis, 10) : 100000
  if (Number.isNaN(satoshis) || satoshis <= 0) {
    console.error('Invalid satoshis amount. Must be positive integer.')
    process.exit(1)
  }

  const utxo = mkUtxo(privateKey, satoshis)

  console.log('\n=== MOCK UTXO ===')
  console.log(JSON.stringify({
    privateKeyWIF: privateKey.toWIF(),
    privateKeyHex: privateKey.toString('hex'),
    address: utxo.address,
    utxo: {
      txid: utxo.txid,
      vout: utxo.vout,
      scriptPubKey: utxo.scriptPubKey,
      satoshis: utxo.satoshis
    }
  }, null, 2))
  console.log('=================\n')

  if (recipient) {
    // Build a small tx that spends the mock utxo and sends everything minus a tiny fee
    try {
      const fee = 500 // tiny fee for local testing
      const sendAmount = Math.max(0, utxo.satoshis - fee)
      if (sendAmount <= 0) {
        console.error('UTXO too small to cover fee. Increase satoshis or reduce fee.')
        process.exit(1)
      }

      // Build transaction using bsv.Transaction.from style
      const tx = new bsv.Transaction()
        .from({
          txId: utxo.txid,
          outputIndex: utxo.outputIndex,
          script: utxo.script,
          satoshis: utxo.satoshis
        })
        .to(recipient, sendAmount)
        // .change(utxo.address) // not necessary here because we send everything minus fee
        .sign(privateKey)

      console.log('=== SIGNED SPEND TX ===')
      console.log('TX HEX:', tx.toString())
      console.log('TX ID (hash):', tx.hash)
      console.log('fee (mock):', fee)
      console.log('sendAmount:', sendAmount)
      console.log('========================\n')

      console.log('Note: This TX is signed against our mock UTXO and can be used in local tests that accept fake txids.')
    } catch (e) {
      console.error('Failed to build or sign tx:', e)
    }
  } else {
    console.log('No recipient provided. To produce a signed spending tx, run again with a recipient address as the 3rd arg.')
  }
}

main()
