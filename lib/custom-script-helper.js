/**
 * SmartLedger BSV Custom Script Helper
 * Simplified API for custom script development
 */

var sighash = require('./transaction/sighash')
var Interpreter = require('./script/interpreter')
var Signature = require('./crypto/signature')
var BN = require('./crypto/bn')
var Transaction = require('./transaction')
var Opcode = require('./opcode')
var Script = require('./script')

class CustomScriptHelper {
  
  /**
   * Create a signature for any custom script
   * @param {Transaction} transaction - The transaction object
   * @param {PrivateKey} privateKey - Private key to sign with
   * @param {number} inputIndex - Input index (0 for first input)
   * @param {Script} lockingScript - The locking script being spent
   * @param {number} satoshis - Amount in satoshis
   * @param {number} sighashType - Signature hash type
   * @returns {Buffer} Complete signature with sighash type
   */
  static createSignature(transaction, privateKey, inputIndex, lockingScript, satoshis, sighashType = null) {
    sighashType = sighashType || (Signature.SIGHASH_ALL | Signature.SIGHASH_FORKID);
    
    const signature = sighash.sign(
      transaction,
      privateKey,
      sighashType,
      inputIndex,
      lockingScript,
      new BN(satoshis)
    );
    
    return Buffer.concat([signature.toDER(), Buffer.from([sighashType])]);
  }

  /**
   * Create a multi-signature locking script
   * @param {number} m - Required signatures
   * @param {PublicKey[]} publicKeys - Array of public keys
   * @returns {Script} Multi-signature locking script
   */
  static createMultisigScript(m, publicKeys) {
    let script = new Script().add(Opcode[`OP_${m}`]);
    
    for (const pubKey of publicKeys) {
      script = script.add(pubKey.toBuffer());
    }
    
    return script
      .add(Opcode[`OP_${publicKeys.length}`])
      .add(Opcode.OP_CHECKMULTISIG);
  }

  /**
   * Create an unlocking script for multi-signature
   * @param {Buffer[]} signatures - Array of signatures
   * @returns {Script} Unlocking script for multisig
   */
  static createMultisigUnlocking(signatures) {
    let script = new Script().add(Opcode.OP_0); // CHECKMULTISIG bug
    
    for (const sig of signatures) {
      script = script.add(sig);
    }
    
    return script;
  }

  /**
   * Create a time-locked script (CHECKLOCKTIMEVERIFY)
   * @param {number} lockTime - Block height or timestamp
   * @param {Script} baseScript - Base script to execute after time lock
   * @returns {Script} Time-locked script
   */
  static createTimelockScript(lockTime, baseScript) {
    const lockTimeBuffer = Buffer.from(lockTime.toString(16).padStart(8, '0'), 'hex').reverse();
    
    return new Script()
      .add(lockTimeBuffer)
      .add(Opcode.OP_CHECKLOCKTIMEVERIFY)
      .add(Opcode.OP_DROP)
      .add(baseScript.toBuffer());
  }

  /**
   * Create a conditional script (IF/ELSE/ENDIF)
   * @param {Script} ifScript - Script to execute if condition is true
   * @param {Script} elseScript - Script to execute if condition is false
   * @returns {Script} Conditional script
   */
  static createConditionalScript(ifScript, elseScript = null) {
    let script = new Script()
      .add(Opcode.OP_IF)
      .add(ifScript.toBuffer());
    
    if (elseScript) {
      script = script
        .add(Opcode.OP_ELSE)
        .add(elseScript.toBuffer());
    }
    
    return script.add(Opcode.OP_ENDIF);
  }

  /**
   * Create P2PKH script for a public key
   * @param {PublicKey} publicKey - Public key
   * @returns {Script} P2PKH locking script
   */
  static createP2PKHScript(publicKey) {
    return new Script()
      .add(Opcode.OP_DUP)
      .add(Opcode.OP_HASH160)
      .add(publicKey.toAddress().hashBuffer)
      .add(Opcode.OP_EQUALVERIFY)
      .add(Opcode.OP_CHECKSIG);
  }

  /**
   * Create P2PKH unlocking script
   * @param {Buffer} signature - Signature
   * @param {PublicKey} publicKey - Public key
   * @returns {Script} P2PKH unlocking script
   */
  static createP2PKHUnlocking(signature, publicKey) {
    return new Script()
      .add(signature)
      .add(publicKey.toBuffer());
  }

  /**
   * Get transaction preimage for covenant scripts
   * @param {Transaction} transaction - The transaction
   * @param {number} inputIndex - Input index
   * @param {Script} lockingScript - Locking script
   * @param {number} satoshis - Amount in satoshis
   * @param {number} sighashType - Signature hash type
   * @returns {Buffer} Transaction preimage
   */
  static getPreimage(transaction, inputIndex, lockingScript, satoshis, sighashType = null) {
    sighashType = sighashType || (Signature.SIGHASH_ALL | Signature.SIGHASH_FORKID);
    
    return sighash.sighash(
      transaction,
      sighashType,
      inputIndex,
      lockingScript,
      new BN(satoshis)
    );
  }

  /**
   * Create a simple data push script
   * @param {Buffer|string} data - Data to push
   * @returns {Script} Data push script
   */
  static createDataScript(data) {
    if (typeof data === 'string') {
      data = Buffer.from(data, 'utf8');
    }
    return new Script().add(data);
  }

  /**
   * Create OP_RETURN data script
   * @param {Buffer|string} data - Data for OP_RETURN
   * @returns {Script} OP_RETURN script
   */
  static createOpReturnScript(data) {
    if (typeof data === 'string') {
      data = Buffer.from(data, 'utf8');
    }
    return new Script()
      .add(Opcode.OP_FALSE)
      .add(Opcode.OP_RETURN)
      .add(data);
  }

  /**
   * Validate a transaction with custom scripts
   * @param {Transaction} transaction - Transaction to validate
   * @returns {boolean} True if valid
   */
  static validateTransaction(transaction) {
    try {
      return transaction.verify();
    } catch (error) {
      console.error('Transaction validation error:', error.message);
      return false;
    }
  }

  /**
   * Validate a specific input script
   * @param {Script} unlockingScript - Unlocking script
   * @param {Script} lockingScript - Locking script
   * @param {Transaction} transaction - Transaction
   * @param {number} inputIndex - Input index
   * @returns {boolean} True if script is valid
   */
  static validateScript(unlockingScript, lockingScript, transaction, inputIndex) {
    try {
      const interpreter = new Interpreter();
      return interpreter.verify(
        unlockingScript,
        lockingScript,
        transaction,
        inputIndex,
        Interpreter.SCRIPT_VERIFY_P2SH | 
        Interpreter.SCRIPT_VERIFY_STRICTENC |
        Interpreter.SCRIPT_ENABLE_SIGHASH_FORKID |
        Interpreter.SCRIPT_ENABLE_MAGNETIC_OPCODES |
        Interpreter.SCRIPT_ENABLE_MONOLITH_OPCODES
      );
    } catch (error) {
      console.error('Script validation error:', error.message);
      return false;
    }
  }

  /**
   * Create a transaction with ultra-low fees
   * @param {Object[]} utxos - Array of UTXOs
   * @param {Object[]} outputs - Array of outputs
   * @param {number} feePerKb - Fee per KB (default: 10 sats = 0.01 sats/byte)
   * @returns {Transaction} Transaction with ultra-low fees
   */
  static createLowFeeTransaction(utxos, outputs, feePerKb = 10) {
    let tx = new Transaction().feePerKb(feePerKb);
    
    // Add inputs
    for (const utxo of utxos) {
      tx = tx.from(utxo);
    }
    
    // Add outputs
    for (const output of outputs) {
      tx = tx.to(output.address, output.satoshis);
    }
    
    return tx;
  }
}

// Common signature hash types
CustomScriptHelper.SIGHASH_ALL = Signature.SIGHASH_ALL | Signature.SIGHASH_FORKID;
CustomScriptHelper.SIGHASH_NONE = Signature.SIGHASH_NONE | Signature.SIGHASH_FORKID;
CustomScriptHelper.SIGHASH_SINGLE = Signature.SIGHASH_SINGLE | Signature.SIGHASH_FORKID;

module.exports = CustomScriptHelper;