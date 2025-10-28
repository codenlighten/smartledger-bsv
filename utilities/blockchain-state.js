/**
 * 🌐 BSV Blockchain State Manager
 *
 * Simulates a global blockchain state with multiple wallets and UTXO tracking.
 * Acts as the "blockchain database" for our miner simulator.
 */

// Browser-compatible imports
let bsv, fs, path, BLOCKCHAIN_STATE_PATH

// Only require Node.js modules in Node.js environment
if (typeof window === 'undefined' && typeof require === 'function') {
  try {
    // bsv = require('../index.js') // Currently unused
    fs = require('fs')
    path = require('path')
    BLOCKCHAIN_STATE_PATH = path.join(__dirname, 'blockchain-state.json')
  } catch (e) {
    console.warn('BlockchainState: Running in browser mode - persistence disabled')
  }
} else {
  // In browser, try to get bsv from global scope or fallback
  bsv = (typeof window !== 'undefined' && window.bsv) || require('../index.js')
}

/**
 * Initialize empty blockchain state
 */
function initializeBlockchainState () {
  return {
    metadata: {
      createdAt: new Date().toISOString(),
      lastUpdated: new Date().toISOString(),
      totalWallets: 0,
      totalUTXOs: 0,
      totalValue: 0,
      blockHeight: 0
    },
    wallets: {}, // keyed by address
    globalUTXOSet: {}, // keyed by "txid:vout"
    spentUTXOs: {}, // keyed by "txid:vout"
    transactionHistory: []
  }
}

/**
 * Load blockchain state from file
 */
function loadBlockchainState () {
  try {
    // In browser, use localStorage or return initial state
    if (!fs || !BLOCKCHAIN_STATE_PATH) {
      return initializeBlockchainState()
    }

    if (!fs.existsSync(BLOCKCHAIN_STATE_PATH)) {
      console.log('🆕 Creating new blockchain state...')
      const initialState = initializeBlockchainState()
      saveBlockchainState(initialState)
      return initialState
    }

    const state = JSON.parse(fs.readFileSync(BLOCKCHAIN_STATE_PATH, 'utf8'))
    console.log('📖 Loaded existing blockchain state')
    return state
  } catch (error) {
    console.error('❌ Error loading blockchain state:', error.message)
    return initializeBlockchainState()
  }
}

/**
 * Save blockchain state to file
 */
function saveBlockchainState (state) {
  try {
    state.metadata.lastUpdated = new Date().toISOString()

    // Only save to file in Node.js environment
    if (fs && BLOCKCHAIN_STATE_PATH) {
      fs.writeFileSync(BLOCKCHAIN_STATE_PATH, JSON.stringify(state, null, 2))
      console.log('💾 Blockchain state saved')
    }
  } catch (error) {
    console.error('❌ Error saving blockchain state:', error.message)
  }
}

/**
 * Register a new wallet in the blockchain state
 */
function registerWallet (walletAddress, walletData) {
  console.log(`📝 Registering wallet: ${walletAddress}`)

  const state = loadBlockchainState()

  if (state.wallets[walletAddress]) {
    console.log('ℹ️  Wallet already exists, updating...')
  }

  state.wallets[walletAddress] = {
    address: walletAddress,
    registeredAt: walletData.registeredAt || new Date().toISOString(),
    utxos: walletData.utxos || [],
    totalValue: 0
  }

  // Add UTXOs to global set
  if (walletData.utxos) {
    walletData.utxos.forEach(utxo => {
      const utxoKey = `${utxo.txid}:${utxo.vout}`
      state.globalUTXOSet[utxoKey] = {
        ...utxo,
        ownerAddress: walletAddress
      }
    })
  }

  // Update metadata
  state.metadata.totalWallets = Object.keys(state.wallets).length
  updateBlockchainMetadata(state)

  saveBlockchainState(state)

  console.log(`✅ Wallet registered: ${walletAddress}`)
  return state
}

/**
 * Get UTXO by key (txid:vout)
 */
function getUTXO (txid, vout) {
  const state = loadBlockchainState()
  const utxoKey = `${txid}:${vout}`

  if (state.spentUTXOs[utxoKey]) {
    return { exists: false, spent: true, utxo: state.spentUTXOs[utxoKey] }
  }

  if (state.globalUTXOSet[utxoKey]) {
    return { exists: true, spent: false, utxo: state.globalUTXOSet[utxoKey] }
  }

  return { exists: false, spent: false, utxo: null }
}

/**
 * Check if UTXO exists and is unspent
 */
function isUTXOAvailable (txid, vout) {
  const result = getUTXO(txid, vout)
  return result.exists && !result.spent
}

/**
 * Spend a UTXO (move from available to spent)
 */
function spendUTXO (txid, vout, spentInTx) {
  const state = loadBlockchainState()
  const utxoKey = `${txid}:${vout}`

  if (!state.globalUTXOSet[utxoKey]) {
    throw new Error(`UTXO ${utxoKey} does not exist`)
  }

  if (state.spentUTXOs[utxoKey]) {
    throw new Error(`UTXO ${utxoKey} already spent`)
  }

  // Move UTXO from available to spent
  const utxo = state.globalUTXOSet[utxoKey]
  state.spentUTXOs[utxoKey] = {
    ...utxo,
    spentInTx,
    spentAt: new Date().toISOString()
  }

  delete state.globalUTXOSet[utxoKey]

  // Update wallet's UTXO list
  const wallet = state.wallets[utxo.ownerAddress]
  if (wallet) {
    wallet.utxos = wallet.utxos.filter(u => !(u.txid === txid && u.vout === vout))
  }

  updateBlockchainMetadata(state)
  saveBlockchainState(state)
  console.log(`❌ UTXO spent: ${utxoKey} in tx ${spentInTx}`)
}

/**
 * Add new UTXO to the global set
 */
function addUTXO (utxo, ownerAddress) {
  const state = loadBlockchainState()
  const utxoKey = `${utxo.txid}:${utxo.vout}`

  // Check if UTXO already exists
  if (state.globalUTXOSet[utxoKey]) {
    console.log(`⚠️ UTXO ${utxoKey} already exists, skipping`)
    return
  }

  state.globalUTXOSet[utxoKey] = {
    ...utxo,
    ownerAddress,
    createdAt: new Date().toISOString()
  }

  // Add to wallet's UTXO list
  if (!state.wallets[ownerAddress]) {
    state.wallets[ownerAddress] = {
      address: ownerAddress,
      registeredAt: new Date().toISOString(),
      utxos: [],
      totalValue: 0
    }
  }

  // Check if UTXO already exists in wallet's list
  const exists = state.wallets[ownerAddress].utxos.some(existingUTXO =>
    existingUTXO.txid === utxo.txid && existingUTXO.vout === utxo.vout
  )

  if (!exists) {
    state.wallets[ownerAddress].utxos.push(utxo)
  }

  updateBlockchainMetadata(state)
  saveBlockchainState(state)

  console.log(`✅ UTXO added: ${utxoKey} for ${ownerAddress}`)
}

/**
 * Update blockchain metadata
 */
function updateBlockchainMetadata (state) {
  const totalUTXOs = Object.keys(state.globalUTXOSet).length
  const totalValue = Object.values(state.globalUTXOSet)
    .reduce((sum, utxo) => sum + utxo.satoshis, 0)

  state.metadata.totalUTXOs = totalUTXOs
  state.metadata.totalValue = totalValue

  // Update wallet totals
  Object.values(state.wallets).forEach(wallet => {
    wallet.totalValue = wallet.utxos.reduce((sum, utxo) => sum + utxo.satoshis, 0)
  })
}

/**
 * Get blockchain statistics
 */
function getBlockchainStats () {
  const state = loadBlockchainState()

  console.log('🌐 Blockchain State Statistics:')
  console.log('═══════════════════════════════════════════')
  console.log(`📊 Total Wallets: ${state.metadata.totalWallets}`)
  console.log(`💰 Total UTXOs: ${state.metadata.totalUTXOs}`)
  console.log(`💎 Total Value: ${state.metadata.totalValue} satoshis`)
  console.log(`🏗️  Block Height: ${state.metadata.blockHeight}`)
  console.log(`🕐 Last Updated: ${state.metadata.lastUpdated}\n`)

  if (Object.keys(state.wallets).length > 0) {
    console.log('👛 Registered Wallets:')
    Object.entries(state.wallets).forEach(([address, wallet]) => {
      console.log(`  ${address}: ${wallet.utxos.length} UTXOs, ${wallet.totalValue} sats`)
    })
  }

  return state
}

/**
 * Import existing wallet from wallet.json
 */
function importWalletFromFile () {
  const walletPath = path.join(__dirname, 'wallet.json')

  if (!fs.existsSync(walletPath)) {
    console.log('❌ No wallet.json found to import')
    return false
  }

  try {
    const walletData = JSON.parse(fs.readFileSync(walletPath, 'utf8'))

    console.log('📥 Importing wallet from wallet.json...')

    const walletInfo = {
      registeredAt: new Date().toISOString(),
      utxos: walletData.availableUTXOs || [walletData.utxo]
    }

    registerWallet(walletData.wallet.address, walletInfo)

    console.log('✅ Wallet imported successfully')
    return true
  } catch (error) {
    console.error('❌ Error importing wallet:', error.message)
    return false
  }
}

// If called directly, show stats or import wallet
if (require.main === module) {
  const args = process.argv.slice(2)

  if (args[0] === 'import') {
    importWalletFromFile()
  } else if (args[0] === 'init') {
    const state = initializeBlockchainState()
    saveBlockchainState(state)
    console.log('🆕 Initialized new blockchain state')
  }

  getBlockchainStats()
}

module.exports = {
  loadBlockchainState,
  saveBlockchainState,
  registerWallet,
  getUTXO,
  isUTXOAvailable,
  spendUTXO,
  addUTXO,
  getBlockchainStats,
  importWalletFromFile
}
