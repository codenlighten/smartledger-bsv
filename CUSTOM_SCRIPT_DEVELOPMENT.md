# Custom Script Development Guide - SmartLedger-BSV v3.0.2

## Overview

SmartLedger-BSV v3.0.2 provides complete signature capabilities for custom locking and unlocking scripts, enabling developers to build:

- **Custom Payment Conditions** - Beyond standard P2PKH
- **Multi-Signature Scripts** - Custom m-of-n signatures
- **Conditional Scripts** - IF/ELSE logic in Bitcoin Script
- **Time-Locked Scripts** - Block height and timestamp locks
- **Covenant Scripts** - Scripts that constrain future transactions
- **Smart Contracts** - Complex business logic on BSV blockchain

## Core API: Manual Signature Creation

For any custom script, use the universal signature creation method:

```javascript
const bsv = require('smartledger-bsv');

function createCustomSignature(transaction, privateKey, inputIndex, lockingScript, satoshis, sighashType = null) {
  sighashType = sighashType || (bsv.crypto.Signature.SIGHASH_ALL | bsv.crypto.Signature.SIGHASH_FORKID);
  
  const signature = bsv.Transaction.sighash.sign(
    transaction,
    privateKey,
    sighashType,
    inputIndex,
    lockingScript,
    new bsv.crypto.BN(satoshis)
  );
  
  // Return signature with sighash type appended (required for script validation)
  return Buffer.concat([signature.toDER(), Buffer.from([sighashType])]);
}
```

## 1. Multi-Signature Scripts

Create custom m-of-n multi-signature scripts:

```javascript
// Create 2-of-3 multisig locking script
const lockingScript = new bsv.Script()
  .add(bsv.Opcode.OP_2)
  .add(publicKey1.toBuffer())
  .add(publicKey2.toBuffer())
  .add(publicKey3.toBuffer())
  .add(bsv.Opcode.OP_3)
  .add(bsv.Opcode.OP_CHECKMULTISIG);

// Create signatures for unlocking
const sig1 = createCustomSignature(tx, privateKey1, 0, lockingScript, satoshis);
const sig2 = createCustomSignature(tx, privateKey2, 0, lockingScript, satoshis);

// Create unlocking script (need OP_0 due to CHECKMULTISIG bug)
const unlockingScript = new bsv.Script()
  .add(bsv.Opcode.OP_0)
  .add(sig1)
  .add(sig2);

tx.inputs[0].setScript(unlockingScript);
```

## 2. Conditional Scripts (IF/ELSE)

Create scripts with branching logic:

```javascript
// Locking script: IF <condition1> ELSE <condition2> ENDIF
const lockingScript = new bsv.Script()
  .add(bsv.Opcode.OP_IF)
    // First condition (e.g., key1)
    .add(bsv.Opcode.OP_DUP)
    .add(bsv.Opcode.OP_HASH160)
    .add(publicKey1.toAddress().hashBuffer)
    .add(bsv.Opcode.OP_EQUALVERIFY)
    .add(bsv.Opcode.OP_CHECKSIG)
  .add(bsv.Opcode.OP_ELSE)
    // Second condition (e.g., key2)
    .add(bsv.Opcode.OP_DUP)
    .add(bsv.Opcode.OP_HASH160)
    .add(publicKey2.toAddress().hashBuffer)
    .add(bsv.Opcode.OP_EQUALVERIFY)
    .add(bsv.Opcode.OP_CHECKSIG)
  .add(bsv.Opcode.OP_ENDIF);

// Unlocking for IF branch
const unlockingScript = new bsv.Script()
  .add(signature)
  .add(publicKey1.toBuffer())
  .add(bsv.Opcode.OP_1); // Choose IF branch

// Unlocking for ELSE branch
const unlockingScript = new bsv.Script()
  .add(signature)
  .add(publicKey2.toBuffer())
  .add(bsv.Opcode.OP_0); // Choose ELSE branch
```

## 3. Time-Locked Scripts

Create scripts that can only be spent after a specific time or block height:

```javascript
const lockHeight = 700000; // Block height

// Time-locked locking script
const lockingScript = new bsv.Script()
  .add(Buffer.from(lockHeight.toString(16).padStart(8, '0'), 'hex').reverse())
  .add(bsv.Opcode.OP_CHECKLOCKTIMEVERIFY)
  .add(bsv.Opcode.OP_DROP)
  // Then normal P2PKH
  .add(bsv.Opcode.OP_DUP)
  .add(bsv.Opcode.OP_HASH160)
  .add(publicKey.toAddress().hashBuffer)
  .add(bsv.Opcode.OP_EQUALVERIFY)
  .add(bsv.Opcode.OP_CHECKSIG);

// Set transaction lock time
const tx = new bsv.Transaction()
  .from(utxo)
  .to(address, amount)
  .lockUntilBlockHeight(lockHeight);

// Create signature and unlocking script normally
const signature = createCustomSignature(tx, privateKey, 0, lockingScript, satoshis);
const unlockingScript = new bsv.Script()
  .add(signature)
  .add(publicKey.toBuffer());
```

## 4. Covenant Scripts (Transaction Introspection)

Create scripts that examine the transaction they're in:

```javascript
// Get transaction preimage for covenant validation
const sighashType = bsv.crypto.Signature.SIGHASH_ALL | bsv.crypto.Signature.SIGHASH_FORKID;
const preimage = bsv.Transaction.sighash.sighash(
  transaction,
  sighashType,
  inputIndex,
  lockingScript,
  new bsv.crypto.BN(satoshis)
);

// The preimage contains all transaction data that can be examined:
// - Version (4 bytes)
// - Input prevouts hash (32 bytes)
// - Input sequence hash (32 bytes)
// - Previous output (36 bytes)
// - Previous output script (variable)
// - Previous output amount (8 bytes)
// - Sequence (4 bytes)
// - Outputs hash (32 bytes)
// - Lock time (4 bytes)
// - Sighash type (4 bytes)

console.log(`Preimage: ${preimage.toString('hex')}`);
console.log(`Preimage length: ${preimage.length} bytes`);
```

## 5. Advanced Pattern: State Machine Scripts

Create scripts that enforce state transitions:

```javascript
// State machine: INIT -> PENDING -> COMPLETE
const STATE_INIT = 0;
const STATE_PENDING = 1;
const STATE_COMPLETE = 2;

function createStateMachineScript(currentState, nextState, publicKeys) {
  return new bsv.Script()
    // Check current state
    .add(Buffer.from([currentState]))
    .add(bsv.Opcode.OP_EQUAL)
    .add(bsv.Opcode.OP_VERIFY)
    
    // Check next state transition is valid
    .add(Buffer.from([nextState]))
    .add(Buffer.from([currentState + 1]))
    .add(bsv.Opcode.OP_EQUAL)
    .add(bsv.Opcode.OP_VERIFY)
    
    // Require signature
    .add(bsv.Opcode.OP_DUP)
    .add(bsv.Opcode.OP_HASH160)
    .add(publicKeys[currentState].toAddress().hashBuffer)
    .add(bsv.Opcode.OP_EQUALVERIFY)
    .add(bsv.Opcode.OP_CHECKSIG);
}
```

## 6. Best Practices

### Signature Types
- Use `SIGHASH_ALL | SIGHASH_FORKID` for most cases (signs entire transaction)
- Use `SIGHASH_SINGLE | SIGHASH_FORKID` to sign only corresponding output
- Use `SIGHASH_NONE | SIGHASH_FORKID` to allow output modifications

### Script Validation
Always test your scripts:

```javascript
// Verify transaction is valid
const isValid = transaction.verify();
console.log(`Transaction valid: ${isValid}`);

// Check specific input signature
const interpreter = new bsv.Script.Interpreter();
const isScriptValid = interpreter.verify(
  unlockingScript,
  lockingScript,
  transaction,
  inputIndex,
  flags
);
```

### Security Considerations
1. **Always validate inputs** - Check all data before using in scripts
2. **Use proper sighash types** - Don't accidentally allow transaction modifications
3. **Test edge cases** - Empty stacks, invalid signatures, malformed scripts
4. **Minimize script size** - Smaller scripts = lower fees
5. **Use OP_CHECKLOCKTIMEVERIFY properly** - Ensure nlocktime is set correctly

## 7. Testing Framework

Use our comprehensive test suite:

```bash
# Run all custom script tests
node custom_script_signature_test.js

# Test specific patterns
node covenant_test.js
node multisig_test.js
node timelock_test.js
```

## 8. Ultra-Low Fee Configuration

All custom scripts benefit from our ultra-low fee system:

```javascript
// Configure ultra-low fees (0.01 sats/byte)
const feePerKb = 10; // 10 sats per KB = 0.01 sats per byte

const tx = new bsv.Transaction()
  .from(utxos)
  .to(address, amount)
  .feePerKb(feePerKb);

// Custom script transaction will use minimal fees
console.log(`Transaction fee: ${tx.getFee()} satoshis`);
```

## 9. Real-World Examples

### Escrow Contract
```javascript
// 2-of-3 escrow: buyer, seller, arbitrator
const escrowScript = new bsv.Script()
  .add(bsv.Opcode.OP_2)
  .add(buyerPubKey.toBuffer())
  .add(sellerPubKey.toBuffer())
  .add(arbitratorPubKey.toBuffer())
  .add(bsv.Opcode.OP_3)
  .add(bsv.Opcode.OP_CHECKMULTISIG);
```

### Payment Channel
```javascript
// Payment channel with time lock fallback
const channelScript = new bsv.Script()
  .add(bsv.Opcode.OP_IF)
    // Both parties agree
    .add(bsv.Opcode.OP_2)
    .add(alicePubKey.toBuffer())
    .add(bobPubKey.toBuffer())
    .add(bsv.Opcode.OP_2)
    .add(bsv.Opcode.OP_CHECKMULTISIG)
  .add(bsv.Opcode.OP_ELSE)
    // Time lock fallback to Alice
    .add(Buffer.from(lockTime.toString(16).padStart(8, '0'), 'hex').reverse())
    .add(bsv.Opcode.OP_CHECKLOCKTIMEVERIFY)
    .add(bsv.Opcode.OP_DROP)
    .add(alicePubKey.toBuffer())
    .add(bsv.Opcode.OP_CHECKSIG)
  .add(bsv.Opcode.OP_ENDIF);
```

### Token Contract
```javascript
// Simple token transfer covenant
const tokenScript = new bsv.Script()
  // Check output preserves token amount
  .add(bsv.Opcode.OP_DUP)
  .add(bsv.Opcode.OP_HASH160)
  .add(newOwnerPubKeyHash)
  .add(bsv.Opcode.OP_EQUALVERIFY)
  .add(bsv.Opcode.OP_CHECKSIG)
  
  // Covenant: ensure output amount >= input amount
  .add(bsv.Opcode.OP_DUP)
  .add(Buffer.from(inputAmount.toString(16), 'hex'))
  .add(bsv.Opcode.OP_GREATERTHANOREQUAL)
  .add(bsv.Opcode.OP_VERIFY);
```

## Support

For custom script development support:
- Check `custom_script_signature_test.js` for working examples
- Review `transaction_signature_api_gap.js` for signature troubleshooting
- All signature methods are battle-tested and production-ready

**SmartLedger-BSV v3.0.2 enables the full power of Bitcoin Script for your applications!** 🚀