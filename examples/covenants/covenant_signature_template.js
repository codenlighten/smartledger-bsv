#!/usr/bin/env node

/**
 * COVENANT SIGNATURE TEMPLATE - COPY THIS PATTERN
 * 
 * Shows developers exactly how to create manual transaction signatures
 * for covenants that match transaction.sign() output.
 * 
 * ✅ RESOLVES: SCRIPT_ERR_SIG_DER_INVALID_FORMAT and SCRIPT_ERR_UNKNOWN_ERROR
 */

const bsv = require('../index.js');

/**
 * ✅ CORRECT API: Manual Signature Creation for Covenants
 */
function createManualSignature(transaction, privateKey, inputIndex, lockingScript, satoshis) {
  const sighashType = bsv.crypto.Signature.SIGHASH_ALL | bsv.crypto.Signature.SIGHASH_FORKID;
  
  // 🎯 KEY FIX: Use bsv.Transaction.sighash.sign() method
  const signature = bsv.Transaction.sighash.sign(
    transaction,
    privateKey,
    sighashType,
    inputIndex,
    lockingScript,
    new bsv.crypto.BN(satoshis)
  );
  
  // Return complete signature with sighash type
  return Buffer.concat([
    signature.toDER(),
    Buffer.from([sighashType])
  ]);
}

/**
 * ✅ COVENANT PREIMAGE ACCESS
 */
function getCovenantPreimage(transaction, inputIndex, lockingScript, satoshis) {
  const sighashType = bsv.crypto.Signature.SIGHASH_ALL | bsv.crypto.Signature.SIGHASH_FORKID;
  
  return bsv.Transaction.sighash.sighash(
    transaction,
    sighashType,
    inputIndex,
    lockingScript,
    new bsv.crypto.BN(satoshis)
  );
}

/**
 * EXAMPLE USAGE
 */
console.log('🎯 COVENANT DEVELOPMENT - WORKING EXAMPLE');
console.log('=========================================');

// Example UTXO
const privateKey = new bsv.PrivateKey();
const address = privateKey.toAddress();
const utxo = {
  txid: 'a'.repeat(64),
  vout: 0,
  script: bsv.Script.buildPublicKeyHashOut(address).toHex(),
  satoshis: 100000
};

// Create transaction
const tx = new bsv.Transaction()
  .from(utxo)
  .to('1BitcoinEaterAddressDontSendf59kuE', 99000);

// Get locking script
const lockingScript = bsv.Script.fromHex(utxo.script);

// ✅ Create manual signature (matches transaction.sign())
const manualSignature = createManualSignature(tx, privateKey, 0, lockingScript, utxo.satoshis);

// ✅ Get preimage for covenant logic
const preimage = getCovenantPreimage(tx, 0, lockingScript, utxo.satoshis);

// Create unlocking script
const unlockingScript = new bsv.Script()
  .add(manualSignature)
  .add(privateKey.publicKey.toBuffer());

tx.inputs[0].setScript(unlockingScript);

// Verify transaction
const isValid = tx.verify();

console.log(`✅ Manual signature created: ${manualSignature.length} bytes`);
console.log(`✅ Preimage available: ${preimage.length} bytes`);
console.log(`✅ Transaction valid: ${isValid ? 'YES' : 'NO'}`);

// Compare with automatic signing
const autoTx = new bsv.Transaction()
  .from(utxo)
  .to('1BitcoinEaterAddressDontSendf59kuE', 99000)
  .sign(privateKey);

const autoSignature = autoTx.inputs[0].script.chunks[0].buf;
const signaturesMatch = manualSignature.toString('hex') === autoSignature.toString('hex');

console.log(`✅ Signatures match transaction.sign(): ${signaturesMatch ? 'YES' : 'NO'}`);

if (isValid && signaturesMatch) {
  console.log('\n🎉 SUCCESS: Covenant development is now fully supported!');
  console.log('📋 Copy the functions above for your covenant projects');
} else {
  console.log('\n❌ ERROR: Issue not resolved');
}

module.exports = {
  createManualSignature,
  getCovenantPreimage
};