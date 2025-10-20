# Advanced Covenant Development Guide

## SmartLedger-BSV v3.1.1+ Complete Covenant Framework

This comprehensive guide combines BIP143 preimage specifications with nChain PUSHTX techniques to provide enterprise-grade covenant development capabilities for Bitcoin SV.

## Table of Contents

1. [Overview](#overview)
2. [BIP143 Preimage Structure](#bip143-preimage-structure)  
3. [nChain PUSHTX Techniques](#nchain-pushtx-techniques)
4. [Advanced Covenant Patterns](#advanced-covenant-patterns)
5. [Implementation Examples](#implementation-examples)
6. [Security Considerations](#security-considerations)
7. [Performance Optimization](#performance-optimization)
8. [Production Guidelines](#production-guidelines)

## Overview

The SmartLedger-BSV covenant framework provides both high-level abstractions and granular control for advanced Bitcoin SV development. This dual-level approach ensures developers can:

- **Use simplified APIs** for common covenant patterns
- **Access full BSV library** for complex custom implementations
- **Leverage proven techniques** from academic research (nChain WP1605)
- **Follow industry standards** (BIP143 preimage structure)

### Key Features

- ✅ **BIP143 Compliant**: Full preimage parsing with field-by-field access
- ✅ **PUSHTX Integration**: In-script signature generation capabilities  
- ✅ **PELS Support**: Perpetually enforcing locking scripts
- ✅ **Production Ready**: Comprehensive error handling and validation
- ✅ **BSV Compatible**: Works alongside existing BSV API without breaking changes

## BIP143 Preimage Structure

### Preimage Components (108+ bytes total)

The BIP143 sighash preimage contains the following fields in order:

```
Field 1:  nVersion        (4 bytes, little-endian)
Field 2:  hashPrevouts    (32 bytes) - double SHA256 of all input outpoints  
Field 3:  hashSequence    (32 bytes) - double SHA256 of all input sequences
Field 4:  outpoint        (36 bytes) - prevTxId (32) + outputIndex (4, LE)
Field 5:  scriptCode      (variable) - with proper varint length encoding
Field 6:  amount          (8 bytes, little-endian) - UTXO value being spent
Field 7:  nSequence       (4 bytes, little-endian) 
Field 8:  hashOutputs     (32 bytes) - double SHA256 of all outputs
Field 9:  nLockTime       (4 bytes, little-endian)
Field 10: sighashType     (4 bytes, little-endian)
```

### Enhanced Preimage Parsing

```javascript
const { CovenantPreimage } = require('./lib/covenant-interface.js');

// Create enhanced preimage parser
const preimage = new CovenantPreimage(preimageHex);

// Access parsed fields with proper type conversion
console.log('Version:', preimage.nVersionValue);           // uint32
console.log('Amount:', preimage.amountValue);              // BigInt  
console.log('Sequence:', preimage.nSequenceValue);         // uint32
console.log('Locktime:', preimage.nLockTimeValue);         // uint32
console.log('Sighash:', preimage.sighashTypeValue);        // uint32

// Access raw buffers for script operations
const hashPrevouts = preimage.hashPrevouts;    // 32-byte Buffer
const scriptCode = preimage.scriptCode;        // Variable-length Buffer  
const outpoint = preimage.outpoint;           // 36-byte Buffer

// Validation
console.log('Valid preimage:', preimage.isValid);
```

### Field Access Methods

```javascript
// Direct field access with endianness handling
const version = preimage.nVersion.readUInt32LE(0);
const outputIndex = preimage.outputIndex.readUInt32LE(0);
const amount = preimage.amount.readBigUInt64LE(0);

// Variable-length field parsing  
const scriptLength = preimage.readVarInt(offset);
const lengthBytes = preimage.getVarIntLength(scriptLength);
```

## nChain PUSHTX Techniques

### Core Concept (WP1605)

PUSHTX generates signatures in-script to push the current spending transaction onto the stack, enabling covenant validation. The technique uses:

1. **In-script signature generation**: `s = k⁻¹(z + ra) mod n`
2. **Optimization**: `k = a = 1` simplifies to `s = z + Gₓ mod n`  
3. **Message construction**: Build BIP143 preimage in-script
4. **Verification**: Use `OP_CHECKSIG` to validate constructed message

### Security Properties

From nChain's security analysis:

- **Data integrity**: Computationally infeasible to construct different message `m'` with same signature
- **Fixed parameters**: Public key, ephemeral key, and sighash flag must be fixed in locking script
- **Malleability prevention**: DER canonicalization ensures `s ≤ n/2`

### Implementation Pattern

```javascript
// PUSHTX signature generation (k=a=1 optimization)
script.add(bsv.Opcode.OP_HASH256);                    // z = hash256(message)

// Add generator x-coordinate (Gₓ)  
const generatorX = '79be667ef9dcbbac55a06295ce870b07029bfcdb2dce28d959f2815b16f81798';
script.add(Buffer.from(generatorX, 'hex'))
      .add(bsv.Opcode.OP_ADD);                         // z + Gₓ

// Modular reduction with secp256k1 order
const secp256k1Order = 'fffffffffffffffffffffffffffffffebaaedce6af48a03bbfd25e8cd0364141';
script.add(Buffer.from(secp256k1Order, 'hex'))
      .add(bsv.Opcode.OP_MOD);                         // (z + Gₓ) mod n

// Convert to DER format and verify
addDERConversion(script);
script.add(Buffer.from([SIGHASH_ALL | SIGHASH_FORKID]))
      .add(bsv.Opcode.OP_CAT)
      .add(Buffer.from(publicKey, 'hex'))  
      .add(bsv.Opcode.OP_CHECKSIG);                    // Verify signature
```

## Advanced Covenant Patterns

### 1. Basic PUSHTX Covenant

Pushes current transaction to stack for validation:

```javascript
const covenant = new CovenantInterface();

const pushtxCovenant = covenant.createAdvancedCovenant('pushtx', {
  publicKey: '0279be667ef9dcbbac55a06295ce870b07029bfcdb2dce28d959f2815b16f81798',
  enforceOutputs: true,
  sighashType: 0x41
});
```

**Use cases**: Transaction introspection, output validation, covenant chaining

### 2. Perpetually Enforcing Locking Script (PELS)

Forces all future transactions to maintain same rules:

```javascript
const pels = covenant.createAdvancedCovenant('perpetual', {
  publicKeyHash: '751e76e8199196d454941c45d1b3a323f1433bd6',
  feeDeduction: 512,      // Deduct 512 satoshis per transaction
  enforceScript: true,    // Must use same locking script
  enforceValue: true      // Must preserve value (minus fees)
});
```

**Use cases**: 
- Certificate authority attestation chains
- Token contracts with perpetual rules
- Multi-party escrow with ongoing enforcement

### 3. Transaction Introspection

Analyzes specific transaction fields via preimage:

```javascript
const introspection = covenant.createAdvancedCovenant('introspection', {
  validateInputs: false,
  validateOutputs: true,
  validateSequence: false, 
  validateLocktime: false
});
```

**Use cases**: Selective validation, complex multi-party rules, conditional logic

### 4. Custom Covenant Construction

For advanced developers needing full control:

```javascript
// Access full BSV API through covenant interface
const script = new covenant.bsv.Script();

// Build custom covenant logic
script.add(bsv.Opcode.OP_DUP)
      .add(bsv.Opcode.OP_HASH160)
      .add(pubkeyHash)
      .add(bsv.Opcode.OP_EQUALVERIFY);

// Add PUSHTX validation
covenant._addPushtxSignature(script, {
  publicKey: publicKey,
  sighashType: sighashType
});
```

## Implementation Examples

### Example 1: Token Transfer Covenant

```javascript
const tokenCovenant = covenant.bsv.Script()
  // Validate minimum amount
  .add(bsv.Opcode.OP_DUP)
  .add(Buffer.from('e803000000000000', 'hex')) // 1000 satoshis minimum
  .add(bsv.Opcode.OP_GREATERTHANOREQUAL)
  .add(bsv.Opcode.OP_VERIFY)
  
  // PUSHTX validation
  .add(covenant._buildPushtxScript({
    enforceOutputs: true,
    publicKey: tokenOwnerKey
  }))
  
  // Transfer to new owner
  .add(bsv.Opcode.OP_DUP)
  .add(bsv.Opcode.OP_HASH160) 
  .add(newOwnerHash)
  .add(bsv.Opcode.OP_EQUALVERIFY)
  .add(bsv.Opcode.OP_CHECKSIG);
```

### Example 2: Multi-signature with Timelock

```javascript
const timelockCovenant = covenant.bsv.Script()
  // Check if timelock has expired
  .add(Buffer.from('40e20100', 'hex')) // Block height 123456
  .add(bsv.Opcode.OP_CHECKLOCKTIMEVERIFY)
  .add(bsv.Opcode.OP_DROP)
  
  // 2-of-3 multisig after timelock
  .add(bsv.Opcode.OP_2)
  .add(pubkey1.toBuffer())
  .add(pubkey2.toBuffer()) 
  .add(pubkey3.toBuffer())
  .add(bsv.Opcode.OP_3)
  .add(bsv.Opcode.OP_CHECKMULTISIG);
```

### Example 3: Enhanced Transaction Usage

```javascript
// Create covenant transaction with caching and error reporting
const covenantTx = covenant.createCovenantTransaction({
  inputs: [{
    txId: prevTxId,
    outputIndex: 0,
    script: lockingScript,
    satoshis: inputSatoshis
  }],
  outputs: [{
    address: outputAddress,
    satoshis: outputSatoshis
  }]
});

// Get cached preimage with enhanced parsing
const preimage = covenantTx.getPreimage(0, lockingScript, inputSatoshis);
const parsedPreimage = new CovenantPreimage(preimage);

// Sign with covenant-compatible signature
const privateKey = new bsv.PrivateKey('L1...');
covenantTx.signInput(0, privateKey, lockingScript, inputSatoshis);

// Verify with enhanced error reporting
const isValid = covenantTx.verify();
console.log('Transaction valid:', isValid);
```

## Security Considerations

### 1. Parameter Fixing Requirements

From nChain's security analysis, these parameters **MUST** be fixed in locking script:

- **Public key**: Prevents signature malleability
- **Ephemeral key (k)**: Prevents transaction ID changes  
- **Sighash flag**: Controls which transaction parts are signed

### 2. DER Canonicalization

Always ensure `s ≤ n/2` to prevent transaction malleability:

```javascript
// Canonical s value check
const secp256k1HalfOrder = '7fffffffffffffffffffffffffffffff5d576e7357a4501ddfe92f46681b20a0';
script.add(bsv.Opcode.OP_DUP)
      .add(Buffer.from(secp256k1HalfOrder, 'hex'))
      .add(bsv.Opcode.OP_GREATERTHAN)
      .add(bsv.Opcode.OP_IF)
      .add(Buffer.from(secp256k1Order, 'hex'))
      .add(bsv.Opcode.OP_SWAP)  
      .add(bsv.Opcode.OP_SUB)
      .add(bsv.Opcode.OP_ENDIF);
```

### 3. Circular Reference Handling

Some preimage fields cannot be fixed in locking script due to circular references:

- **hashPrevouts**: Contains transaction ID being created
- **Previous locking script**: Contains itself 
- **Input outpoint**: Contains transaction ID being created

Use pre-images and hash validation for these fields.

### 4. Script Size Considerations

PUSHTX scripts can be large (~1KB optimized). Consider:

- **Transaction fees**: Larger scripts cost more
- **Block size limits**: Plan for efficient packing
- **Optimization techniques**: Alt stack usage, endianness operations

## Performance Optimization

### 1. Alt Stack Usage

Reduce script size by storing constants on alt stack:

```javascript
// Store Gₓ and n on alt stack for reuse
script.add(Buffer.from(generatorX, 'hex'))
      .add(bsv.Opcode.OP_TOALTSTACK)
      .add(Buffer.from(secp256k1Order, 'hex'))
      .add(bsv.Opcode.OP_TOALTSTACK);

// Reference from alt stack later
script.add(bsv.Opcode.OP_FROMALTSTACK) // Retrieve stored values
      .add(bsv.Opcode.OP_ADD);
```

### 2. Endianness Optimization

Minimize endianness reversal operations:

```javascript
// Group consecutive operations to reduce reversals
// Use precomputed little-endian constants where possible
const locktime_le = Buffer.from('00000000', 'hex'); // Already little-endian
const sighash_le = Buffer.from('41000000', 'hex');  // Already little-endian
```

### 3. Preimage Caching

Cache preimages to avoid recomputation:

```javascript
const covenantTx = covenant.createCovenantTransaction(config);
// Preimage automatically cached by input/script/satoshi combination
const preimage1 = covenantTx.getPreimage(0, script1, satoshis1); // Computed
const preimage2 = covenantTx.getPreimage(0, script1, satoshis1); // From cache
```

### 4. Script Optimization Techniques

From nChain paper optimizations:

- **k=a=1 optimization**: Simplifies signature to `s = z + Gₓ mod n`
- **Consecutive field grouping**: Group items 1-7 together 
- **Fee deduction optimization**: Built into value computation
- **Output construction from preimage**: Reuse previous output data

## Production Guidelines

### 1. Testing Requirements

Before mainnet deployment:

```javascript
// Comprehensive validation testing
const validation = covenant.validateCovenant(
  transaction, 
  inputIndex, 
  unlockingScript, 
  lockingScript
);

console.log('Validation result:', validation.toString());
if (!validation.isValid) {
  throw new Error(`Covenant validation failed: ${validation.message}`);
}
```

### 2. Error Handling

Implement robust error handling:

```javascript
try {
  const pushtxCovenant = covenant.createAdvancedCovenant('pushtx', params);
  const covenantTx = covenant.createCovenantTransaction(config);
  const verified = covenantTx.verify();
  
  if (!verified) {
    throw new Error('Transaction verification failed');
  }
} catch (error) {
  console.error('Covenant creation error:', error.message);
  // Implement fallback or retry logic
}
```

### 3. Parameter Validation

Validate all parameters before script creation:

```javascript
function createProductionCovenant(type, params) {
  // Validate required parameters
  if (type === 'perpetual' && !params.publicKeyHash) {
    throw new Error('publicKeyHash required for perpetual covenant');
  }
  
  if (params.sighashType && !isValidSighashType(params.sighashType)) {
    throw new Error('Invalid sighash type');
  }
  
  return covenant.createAdvancedCovenant(type, params);
}
```

### 4. Documentation and Auditability  

Document all covenant logic for security audits:

```javascript
/**
 * Production Covenant: Token Transfer with Rules
 * 
 * Security properties:
 * - Enforces minimum transfer amount (1000 satoshis)
 * - Validates new owner via P2PKH
 * - Uses PUSHTX for transaction introspection  
 * - DER canonicalization prevents malleability
 * 
 * Audit trail: Created by createTokenCovenant() v3.1.1
 */
const tokenCovenant = createTokenCovenant({
  minAmount: 1000,
  newOwner: publicKey,
  enforceRules: true
});
```

## Advanced Usage Patterns

### 1. Covenant Chaining

Link multiple covenants in sequence:

```javascript
// First covenant: Token creation
const creationCovenant = covenant.createAdvancedCovenant('pushtx', {
  enforceOutputs: true,
  publicKey: creatorKey
});

// Second covenant: Token transfer (references first)
const transferCovenant = covenant.createAdvancedCovenant('perpetual', {
  publicKeyHash: ownerHash,
  feeDeduction: 100,
  enforceScript: true
});

// Chain covenants in transaction outputs
tx.addOutput(new bsv.Transaction.Output({
  script: creationCovenant,
  satoshis: 1000000
})).addOutput(new bsv.Transaction.Output({
  script: transferCovenant, 
  satoshis: 999900
}));
```

### 2. Multi-party Covenant Validation

Validate complex multi-party scenarios:

```javascript
// Create covenant requiring multiple signatures with timelock
const multiPartyCovenant = covenant.bsv.Script()
  .add(bsv.Opcode.OP_IF)
    // Path 1: All parties agree (2-of-3)
    .add(bsv.Opcode.OP_2)
    .add(party1Key.toBuffer())
    .add(party2Key.toBuffer()) 
    .add(party3Key.toBuffer())
    .add(bsv.Opcode.OP_3)
    .add(bsv.Opcode.OP_CHECKMULTISIG)
  .add(bsv.Opcode.OP_ELSE)
    // Path 2: Timelock + arbitrator
    .add(Buffer.from('40e20100', 'hex')) // Block 123456
    .add(bsv.Opcode.OP_CHECKLOCKTIMEVERIFY)
    .add(bsv.Opcode.OP_DROP)
    .add(arbitratorKey.toBuffer())
    .add(bsv.Opcode.OP_CHECKSIG)
  .add(bsv.Opcode.OP_ENDIF);

// Add PUSHTX validation for transaction introspection
covenant._addPushtxSignature(multiPartyCovenant, {
  publicKey: validatorKey,
  sighashType: 0x41
});
```

## Conclusion

The SmartLedger-BSV advanced covenant framework provides enterprise-grade capabilities for sophisticated Bitcoin SV applications. By combining rigorous BIP143 preimage parsing with proven nChain PUSHTX techniques, developers can create secure, efficient, and powerful covenant-based systems.

### Key Benefits

- **Standards Compliant**: Full BIP143 and nChain WP1605 compatibility
- **Production Ready**: Comprehensive error handling and validation
- **Dual-Level API**: High-level simplicity with granular control
- **Security Focused**: Proven techniques with formal security analysis
- **Performance Optimized**: Efficient script generation and caching

For additional support and advanced use cases, refer to the complete API documentation and example implementations in the SmartLedger-BSV repository.

---

*This guide is part of SmartLedger-BSV v3.1.1+ - Advanced Covenant Development Framework*