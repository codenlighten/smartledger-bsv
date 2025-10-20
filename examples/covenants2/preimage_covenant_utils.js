#!/usr/bin/env node

/**
 * Preimage Covenant Utilities
 * 
 * Provides clean interfaces for the proper covenant flow:
 * 1. P2PKH UTXO → Covenant Creation → Local Storage
 * 2. Local Covenant UTXO → Covenant Spending → Broadcast
 */

const bsv = require('../../index.js');
const fs = require('fs');
const path = require('path');

class PreimageCovenantUtils {
  constructor(privateKey) {
    this.privateKey = privateKey;
    this.publicKey = privateKey.publicKey;
    this.address = privateKey.toAddress();
    this.covenantUtxoPath = path.join(__dirname, '../data/covenant_utxos.json');
    this.sighashType = bsv.crypto.Signature.SIGHASH_ALL | bsv.crypto.Signature.SIGHASH_FORKID;
  }

  /**
   * 📦 Reconstruct P2PKH script from address
   * (As you mentioned: all UTXOs from WhatsOnChain are P2PKH)
   */
  static reconstructP2pkhScript(address) {
    return bsv.Script.buildPublicKeyHashOut(address).toHex();
  }

  /**
   * 🏗️ Create covenant from P2PKH UTXO
   */
  createCovenantFromP2pkh(utxo) {
    console.log('🏗️ Creating covenant from P2PKH UTXO...');

    // Reconstruct P2PKH script
    utxo.script = PreimageCovenantUtils.reconstructP2pkhScript(this.address);

    // Create covenant creation transaction
    const creationTx = new bsv.Transaction()
      .from({
        txId: utxo.txid,
        outputIndex: utxo.vout,
        script: utxo.script,
        satoshis: utxo.satoshis
      })
      .to(this.address, utxo.satoshis - 1000); // 1000 sat fee

    // Get preimage for covenant creation
    const p2pkhScript = bsv.Script.fromHex(utxo.script);
    const creationPreimage = bsv.Transaction.sighash.sighash(
      creationTx,
      this.sighashType,
      0,
      p2pkhScript,
      new bsv.crypto.BN(utxo.satoshis)
    );

    const preimageHash = bsv.crypto.Hash.sha256sha256(creationPreimage);

    // Build covenant locking script with OP_DROP fix
    const covenantLockingScript = new bsv.Script()
      .add('OP_DUP')
      .add('OP_HASH256')
      .add(preimageHash)
      .add('OP_EQUALVERIFY')
      .add('OP_DROP')                    // ✅ Stack management
      .add(this.publicKey.toBuffer())
      .add('OP_CHECKSIG');

    // Replace output script with covenant
    creationTx.outputs[0].setScript(covenantLockingScript);

    // Sign creation transaction (against P2PKH)
    creationTx.sign(this.privateKey);

    console.log('✅ Covenant creation transaction valid:', creationTx.verify());

    return {
      transaction: creationTx,
      covenantUtxo: {
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
    };
  }

  /**
   * 💾 Save covenant UTXO to local storage
   */
  saveCovenantUtxo(covenantUtxo) {
    let covenantUtxos = [];
    if (fs.existsSync(this.covenantUtxoPath)) {
      covenantUtxos = JSON.parse(fs.readFileSync(this.covenantUtxoPath, 'utf8'));
    }

    // Ensure data directory exists
    const dataDir = path.dirname(this.covenantUtxoPath);
    if (!fs.existsSync(dataDir)) {
      fs.mkdirSync(dataDir, { recursive: true });
    }

    covenantUtxos.push(covenantUtxo);
    fs.writeFileSync(this.covenantUtxoPath, JSON.stringify(covenantUtxos, null, 2));
    console.log('✅ Covenant UTXO saved to local storage');
  }

  /**
   * 📂 Load covenant UTXO from local storage
   */
  loadCovenantUtxo(txid = null) {
    if (!fs.existsSync(this.covenantUtxoPath)) {
      throw new Error('No covenant UTXOs found. Create one first.');
    }

    const covenantUtxos = JSON.parse(fs.readFileSync(this.covenantUtxoPath, 'utf8'));
    
    if (txid) {
      const utxo = covenantUtxos.find(u => u.txid === txid);
      if (!utxo) {
        throw new Error(`Covenant UTXO with TXID ${txid} not found`);
      }
      return utxo;
    } else {
      const utxo = covenantUtxos.find(u => u.type === 'preimage_covenant');
      if (!utxo) {
        throw new Error('No preimage covenant UTXO found');
      }
      return utxo;
    }
  }

  /**
   * 🔓 Create spending transaction for covenant UTXO
   */
  createCovenantSpendingTx(covenantUtxo, outputAddress = null, outputSatoshis = null) {
    console.log('🔓 Creating covenant spending transaction...');

    const outputAddr = outputAddress || this.address;
    const outputSats = outputSatoshis || (covenantUtxo.satoshis - 500); // 500 sat fee

    // Create spending transaction - don't use .from() for custom scripts
    const spendingTx = new bsv.Transaction();
    
    // Manually add input for custom covenant script
    spendingTx.addInput(new bsv.Transaction.Input({
      prevTxId: covenantUtxo.txid,
      outputIndex: covenantUtxo.vout,
      script: bsv.Script.empty() // Will be set after signing
    }), bsv.Script.fromHex(covenantUtxo.script), covenantUtxo.satoshis);

    // Add output
    spendingTx.to(outputAddr, outputSats);

    const covenantScript = bsv.Script.fromHex(covenantUtxo.script);

    // Create signature against covenant script (not P2PKH!)
    const covenantSignature = bsv.Transaction.sighash.sign(
      spendingTx,
      this.privateKey,
      this.sighashType,
      0,
      covenantScript,                    // ✅ Sign against covenant script
      new bsv.crypto.BN(covenantUtxo.satoshis)
    );

    const fullSignature = Buffer.concat([
      covenantSignature.toDER(),
      Buffer.from([this.sighashType])
    ]);

    // Use original preimage from covenant creation
    const originalPreimage = Buffer.from(covenantUtxo.originalPreimage, 'hex');

    // Create unlocking script
    const unlockingScript = new bsv.Script()
      .add(fullSignature)
      .add(originalPreimage);

    spendingTx.inputs[0].setScript(unlockingScript);

    return spendingTx;
  }

  /**
   * ✅ Validate covenant transaction with Script.Interpreter
   */
  validateCovenantTx(spendingTx, covenantUtxo) {
    const interpreter = new bsv.Script.Interpreter();
    const flags = bsv.Script.Interpreter.SCRIPT_VERIFY_P2SH |
                  bsv.Script.Interpreter.SCRIPT_VERIFY_STRICTENC |
                  bsv.Script.Interpreter.SCRIPT_VERIFY_DERSIG |
                  bsv.Script.Interpreter.SCRIPT_VERIFY_LOW_S |
                  bsv.Script.Interpreter.SCRIPT_ENABLE_SIGHASH_FORKID;

    const unlockingScript = spendingTx.inputs[0].script;
    const lockingScript = bsv.Script.fromHex(covenantUtxo.script);

    const result = interpreter.verify(
      unlockingScript,
      lockingScript,
      spendingTx,
      0,
      flags,
      new bsv.crypto.BN(covenantUtxo.satoshis)
    );

    if (!result) {
      console.log('❌ Validation failed:', interpreter.errstr);
    } else {
      console.log('✅ Covenant transaction validated successfully');
    }

    return { valid: result, error: interpreter.errstr };
  }

  /**
   * 🎯 Complete covenant flow: P2PKH → Covenant → Spending
   */
  completeCovenantFlow(p2pkhUtxo, broadcastCallback = null) {
    console.log('🎯 Starting complete covenant flow...\n');

    try {
      // Phase 1: Create covenant from P2PKH
      const { transaction: creationTx, covenantUtxo } = this.createCovenantFromP2pkh(p2pkhUtxo);
      this.saveCovenantUtxo(covenantUtxo);

      console.log('Phase 1 Complete: P2PKH → Covenant ✅');
      console.log('- Creation TX:', creationTx.id);
      console.log('- Covenant UTXO saved locally\n');

      // Optional: Broadcast creation transaction
      if (broadcastCallback) {
        broadcastCallback(creationTx, 'creation');
      }

      // Phase 2: Spend covenant UTXO
      const spendingTx = this.createCovenantSpendingTx(covenantUtxo);
      const validation = this.validateCovenantTx(spendingTx, covenantUtxo);

      console.log('Phase 2 Complete: Covenant → Spending ✅');
      console.log('- Spending TX:', spendingTx.id);
      console.log('- Validation:', validation.valid ? '✅ SUCCESS' : '❌ FAILED');

      // Optional: Broadcast spending transaction
      if (broadcastCallback && validation.valid) {
        broadcastCallback(spendingTx, 'covenant spending');
      }

      return {
        creationTx,
        spendingTx,
        covenantUtxo,
        validation,
        success: validation.valid
      };

    } catch (error) {
      console.log('❌ Flow failed:', error.message);
      throw error;
    }
  }

  /**
   * 📋 List all stored covenant UTXOs
   */
  listCovenantUtxos() {
    if (!fs.existsSync(this.covenantUtxoPath)) {
      return [];
    }

    const covenantUtxos = JSON.parse(fs.readFileSync(this.covenantUtxoPath, 'utf8'));
    return covenantUtxos;
  }
}

module.exports = PreimageCovenantUtils;