/**
 * SmartContract.Covenant Class
 * ============================
 *
 * ⚠️ NON-ENFORCING BY DESIGN — NOT A REAL COVENANT. The locking script this class
 * builds is:
 *
 *     OP_DUP OP_HASH256 <creationPreimageHash> OP_EQUALVERIFY OP_DROP <pubkey> OP_CHECKSIG
 *
 * `creationPreimageHash` is a CONSTANT baked in at creation time, and the spend
 * simply re-pushes the stored creation preimage to satisfy it before OP_DROP throws
 * it away. Nothing binds the SPENDING transaction's outputs or value — the script
 * reduces to plain P2PK. It does NOT "constrain where coins can go" the way a
 * covenant must.
 *
 * For real, spend-binding covenants use the OP_PUSH_TX primitives, which generate
 * the signature in-script from the pushed preimage so a passing OP_CHECKSIG proves
 * the preimage IS this spend:
 *   - SmartContract.PushTx.valueCovenant(expectedHashOutputs) — bind outputs.
 *   - SmartContract.Token.ownershipToken / perpetualCovenant       — stateful NFT.
 *
 * This class is retained only as a workflow/storage demo. createFromP2PKH() throws
 * unless you pass { allowNonEnforcing: true } to the constructor, acknowledging the
 * script enforces no spend constraint.
 */

'use strict'

var sighash = require('../transaction/sighash')
var Input = require('../transaction/input')
var Interpreter = require('../script/interpreter')
var Signature = require('../crypto/signature')
var Hash = require('../crypto/hash')
var BN = require('../crypto/bn')
var Transaction = require('../transaction')
var Script = require('../script')
var path = require('path')

// Optional fs dependency for Node.js environments
var fs
try {
  fs = require('fs')
} catch (e) {
  // Browser environment - fs operations will be disabled
  fs = null
}

// Set BSV_DEBUG=1 (Node) or window.BSV_DEBUG = true (browser) to surface
// informational warnings from this module. Matches the gating pattern
// used by lib/browser-utxo-manager-es5.js since v3.4.1.
var debug = function () {
  var enabled = (typeof process !== 'undefined' && process.env && process.env.BSV_DEBUG) ||
                (typeof window !== 'undefined' && window.BSV_DEBUG)
  if (enabled) console.log.apply(console, arguments)
}

/**
 * Covenant Class - Advanced covenant management
 * @param {PrivateKey} privateKey - Private key for covenant operations
 * @param {Object} options - Configuration options
 */
function Covenant(privateKey, options) {
  if (!(this instanceof Covenant)) {
    return new Covenant(privateKey, options)
  }

  this.privateKey = privateKey
  this.publicKey = privateKey.publicKey
  this.address = privateKey.toAddress()
  
  options = options || {}
  this.storageDir = options.storageDir || (typeof process !== 'undefined' ? path.join(process.cwd(), '.bsv-covenants') : '.bsv-covenants')
  this.covenantUtxoPath = path.join(this.storageDir, 'covenant_utxos.json')
  
  this.sighashType = Signature.SIGHASH_ALL | Signature.SIGHASH_FORKID

  // The locking script this class builds does NOT constrain the spend (see the
  // class doc). Require explicit acknowledgement so no one ships it as a real
  // covenant. Use SmartContract.PushTx.valueCovenant / SmartContract.Token for
  // genuine spend-binding covenants.
  this.allowNonEnforcing = options.allowNonEnforcing === true

  // Ensure storage directory exists (Node.js only)
  if (fs) {
    this._ensureStorageDir()
  }
}

/**
 * Create covenant from P2PKH UTXO
 * @param {Object} utxo - P2PKH UTXO object
 * @returns {Object} Creation result with transaction and covenant UTXO
 */
Covenant.prototype.createFromP2PKH = function(utxo) {
  if (!this.allowNonEnforcing) {
    throw new Error(
      'SmartContract.Covenant builds a NON-ENFORCING script that reduces to plain ' +
      'P2PK — it does not constrain the spend. Use SmartContract.PushTx.valueCovenant ' +
      '(output binding) or SmartContract.Token / perpetualCovenant (stateful covenants) ' +
      'for real covenants. To use this demo anyway, construct with ' +
      '{ allowNonEnforcing: true }.'
    )
  }
  // Reconstruct P2PKH script if not provided
  if (!utxo.script) {
    utxo.script = Covenant.reconstructP2pkhScript(this.address)
  }

  // Create covenant creation transaction
  var creationTx = new Transaction()
    .from({
      txId: utxo.txid,
      outputIndex: utxo.vout,
      script: utxo.script,
      satoshis: utxo.satoshis
    })
    .to(this.address, utxo.satoshis - 1000) // 1000 sat fee

  // Get preimage for covenant creation
  var p2pkhScript = Script.fromHex(utxo.script)
  var creationPreimage = sighash.sighashPreimage(
    creationTx,
    this.sighashType,
    0,
    p2pkhScript,
    new BN(utxo.satoshis)
  )

  var preimageHash = Hash.sha256sha256(creationPreimage)

  // Build covenant locking script
  var covenantLockingScript = new Script()
    .add('OP_DUP')
    .add('OP_HASH256')
    .add(preimageHash)
    .add('OP_EQUALVERIFY')
    .add('OP_DROP')                    // Stack management
    .add(this.publicKey.toBuffer())
    .add('OP_CHECKSIG')

  // Replace output script with covenant
  creationTx.outputs[0].setScript(covenantLockingScript)

  // Sign creation transaction (against P2PKH)
  creationTx.sign(this.privateKey)

  var covenantUtxo = {
    txid: creationTx.id,
    vout: 0,
    satoshis: utxo.satoshis - 1000,
    script: covenantLockingScript.toHex(),
    scriptPubKey: covenantLockingScript.toHex(),
    preimageHash: preimageHash.toString('hex'),
    originalPreimage: creationPreimage.toString('hex'),
    status: 'local',
    createdAt: new Date().toISOString(),
    type: 'preimage_covenant'
  }

  return {
    transaction: creationTx,
    covenantUtxo: covenantUtxo
  }
}

/**
 * Create spending transaction for covenant UTXO
 * @param {Object} covenantUtxo - Covenant UTXO to spend
 * @param {Address|string} outputAddress - Output address (optional)
 * @param {number} outputSatoshis - Output amount (optional)
 * @returns {Transaction} Spending transaction
 */
Covenant.prototype.createSpendingTx = function(covenantUtxo, outputAddress, outputSatoshis) {
  var outputAddr = outputAddress || this.address
  var outputSats = outputSatoshis || (covenantUtxo.satoshis - 500) // 500 sat fee

  // Create spending transaction - manual input for custom scripts
  var spendingTx = new Transaction()
  
  // Manually add input for custom covenant script
  spendingTx.addInput(new Input({
    prevTxId: covenantUtxo.txid,
    outputIndex: covenantUtxo.vout,
    script: Script.empty() // Will be set after signing
  }), Script.fromHex(covenantUtxo.script), covenantUtxo.satoshis)

  // Add output
  spendingTx.to(outputAddr, outputSats)

  var covenantScript = Script.fromHex(covenantUtxo.script)

  // Create signature against covenant script
  var covenantSignature = sighash.sign(
    spendingTx,
    this.privateKey,
    this.sighashType,
    0,
    covenantScript,
    new BN(covenantUtxo.satoshis)
  )

  var fullSignature = Buffer.concat([
    covenantSignature.toDER(),
    Buffer.from([this.sighashType])
  ])

  // Use original preimage from covenant creation
  var originalPreimage = Buffer.from(covenantUtxo.originalPreimage, 'hex')

  // Create unlocking script
  var unlockingScript = new Script()
    .add(fullSignature)
    .add(originalPreimage)

  spendingTx.inputs[0].setScript(unlockingScript)

  return spendingTx
}

/**
 * Validate covenant transaction using Script.Interpreter
 * @param {Transaction} spendingTx - Transaction to validate
 * @param {Object} covenantUtxo - Original covenant UTXO
 * @returns {Object} Validation result
 */
Covenant.prototype.validate = function(spendingTx, covenantUtxo) {
  var interpreter = new Interpreter()
  var flags = Interpreter.SCRIPT_VERIFY_P2SH |
              Interpreter.SCRIPT_VERIFY_STRICTENC |
              Interpreter.SCRIPT_VERIFY_DERSIG |
              Interpreter.SCRIPT_VERIFY_LOW_S |
              Interpreter.SCRIPT_ENABLE_SIGHASH_FORKID

  var unlockingScript = spendingTx.inputs[0].script
  var lockingScript = Script.fromHex(covenantUtxo.script)

  var result = interpreter.verify(
    unlockingScript,
    lockingScript,
    spendingTx,
    0,
    flags,
    new BN(covenantUtxo.satoshis)
  )

  return { 
    valid: result, 
    error: result ? null : interpreter.errstr 
  }
}

/**
 * Save covenant UTXO to local storage
 * @param {Object} covenantUtxo - Covenant UTXO to save
 */
Covenant.prototype.save = function(covenantUtxo) {
  if (!fs) {
    debug('File system operations not available in browser environment')
    return covenantUtxo
  }
  
  var covenantUtxos = this.list()
  covenantUtxos.push(covenantUtxo)
  fs.writeFileSync(this.covenantUtxoPath, JSON.stringify(covenantUtxos, null, 2))
  return covenantUtxo
}

/**
 * Load covenant UTXO from storage
 * @param {string} txid - Transaction ID (optional, loads latest if not provided)
 * @returns {Object} Covenant UTXO
 */
Covenant.prototype.load = function(txid) {
  var covenantUtxos = this.list()
  
  if (txid) {
    var utxo = covenantUtxos.find(function(u) { return u.txid === txid })
    if (!utxo) {
      throw new Error('Covenant UTXO with TXID ' + txid + ' not found')
    }
    return utxo
  } else {
    var utxo = covenantUtxos.find(function(u) { return u.type === 'preimage_covenant' })
    if (!utxo) {
      throw new Error('No preimage covenant UTXO found')
    }
    return utxo
  }
}

/**
 * List all stored covenant UTXOs
 * @returns {Array} Array of covenant UTXOs
 */
Covenant.prototype.list = function() {
  if (!fs.existsSync(this.covenantUtxoPath)) {
    return []
  }
  return JSON.parse(fs.readFileSync(this.covenantUtxoPath, 'utf8'))
}

/**
 * Get covenant portfolio statistics
 * @returns {Object} Portfolio statistics
 */
Covenant.prototype.getPortfolio = function() {
  var covenants = this.list()
  
  var portfolio = {
    total: covenants.length,
    totalValue: covenants.reduce(function(sum, c) { return sum + c.satoshis }, 0),
    byStatus: {},
    recent: covenants.slice(-5) // Last 5 created
  }

  // Group by status
  covenants.forEach(function(covenant) {
    var status = covenant.status || 'local'
    if (!portfolio.byStatus[status]) {
      portfolio.byStatus[status] = { count: 0, value: 0 }
    }
    portfolio.byStatus[status].count++
    portfolio.byStatus[status].value += covenant.satoshis
  })

  return portfolio
}

/**
 * Complete covenant flow: P2PKH → Covenant → Spending
 * @param {Object} p2pkhUtxo - P2PKH UTXO to convert
 * @param {Function} broadcastCallback - Optional broadcast callback
 * @returns {Object} Complete flow result
 */
Covenant.prototype.completeFlow = function(p2pkhUtxo, broadcastCallback) {
  // Phase 1: Create covenant from P2PKH
  var creation = this.createFromP2PKH(p2pkhUtxo)
  var covenantUtxo = this.save(creation.covenantUtxo)

  // Optional: Broadcast creation transaction
  if (broadcastCallback) {
    broadcastCallback(creation.transaction, 'creation')
  }

  // Phase 2: Spend covenant UTXO
  var spendingTx = this.createSpendingTx(covenantUtxo)
  var validation = this.validate(spendingTx, covenantUtxo)

  // Optional: Broadcast spending transaction
  if (broadcastCallback && validation.valid) {
    broadcastCallback(spendingTx, 'spending')
  }

  return {
    creationTx: creation.transaction,
    spendingTx: spendingTx,
    covenantUtxo: covenantUtxo,
    validation: validation,
    success: validation.valid
  }
}

/**
 * Private helper methods
 */
Covenant.prototype._ensureStorageDir = function() {
  if (!fs.existsSync(this.storageDir)) {
    fs.mkdirSync(this.storageDir, { recursive: true })
  }
}

/**
 * Static utility methods
 */
Covenant.reconstructP2pkhScript = function(address) {
  return Script.buildPublicKeyHashOut(address).toHex()
}

module.exports = Covenant