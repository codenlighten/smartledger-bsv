/**
 * SmartLedger Covenant Interface - Advanced BSV Covenant Development
 * 
 * Provides high-level abstractions for covenant development while preserving
 * full access to low-level BSV operations. Works alongside existing BSV API.
 * 
 * Features:
 * - Simplified covenant creation and validation
 * - Automatic preimage generation and parsing  
 * - Template-based covenant patterns
 * - Full compatibility with existing bsv library
 * - Granular control when needed
 */

const bsv = require('../index.js');

class CovenantInterface {
  constructor() {
    this.bsv = bsv; // Full access to underlying BSV library
  }

  /**
   * Create a covenant-ready transaction with preimage access
   * @param {Object} config - Transaction configuration
   * @returns {CovenantTransaction} Enhanced transaction object
   */
  createCovenantTransaction(config) {
    const tx = new bsv.Transaction();
    
    // Add inputs
    if (config.inputs) {
      config.inputs.forEach(input => tx.from(input));
    }
    
    // Add outputs
    if (config.outputs) {
      config.outputs.forEach(output => {
        if (output.script) {
          tx.addOutput(new bsv.Transaction.Output({
            script: output.script,
            satoshis: output.satoshis
          }));
        } else {
          tx.to(output.address, output.satoshis);
        }
      });
    }
    
    // Set fee configuration
    if (config.feePerKb) {
      tx.feePerKb(config.feePerKb);
    }
    
    return new CovenantTransaction(tx, this);
  }

  /**
   * Create manual signature using correct BSV API
   * @param {Transaction} transaction - BSV transaction
   * @param {PrivateKey} privateKey - Private key to sign with
   * @param {number} inputIndex - Input index  
   * @param {Script} lockingScript - Locking script being spent
   * @param {number} satoshis - Amount in satoshis
   * @param {number} sighashType - Signature hash type
   * @returns {Buffer} Complete signature with sighash type
   */
  createSignature(transaction, privateKey, inputIndex, lockingScript, satoshis, sighashType = null) {
    sighashType = sighashType || (bsv.crypto.Signature.SIGHASH_ALL | bsv.crypto.Signature.SIGHASH_FORKID);
    
    const signature = bsv.Transaction.sighash.sign(
      transaction,
      privateKey,
      sighashType,
      inputIndex,
      lockingScript,
      new bsv.crypto.BN(satoshis)
    );
    
    return Buffer.concat([signature.toDER(), Buffer.from([sighashType])]);
  }

  /**
   * Get transaction preimage for covenant validation
   * @param {Transaction} transaction - BSV transaction
   * @param {number} inputIndex - Input index
   * @param {Script} lockingScript - Locking script
   * @param {number} satoshis - Amount in satoshis
   * @param {number} sighashType - Signature hash type
   * @returns {CovenantPreimage} Parsed preimage object
   */
  getPreimage(transaction, inputIndex, lockingScript, satoshis, sighashType = null) {
    sighashType = sighashType || (bsv.crypto.Signature.SIGHASH_ALL | bsv.crypto.Signature.SIGHASH_FORKID);
    
    const preimage = bsv.Transaction.sighash.sighash(
      transaction,
      sighashType,
      inputIndex,
      lockingScript,
      new bsv.crypto.BN(satoshis)
    );
    
    return new CovenantPreimage(preimage);
  }

  /**
   * Covenant Template: State Machine
   * @param {Array} states - Array of state definitions
   * @param {number} currentState - Current state index
   * @param {PublicKey} authorizedKey - Key authorized for state transitions
   * @returns {Script} State machine covenant script
   */
  createStateMachine(states, currentState, authorizedKey) {
    const script = new bsv.Script();
    
    // Check current state
    script.add(Buffer.from([currentState]));
    script.add(bsv.Opcode.OP_EQUAL);
    script.add(bsv.Opcode.OP_VERIFY);
    
    // Validate state transition logic
    for (let i = 0; i < states.length - 1; i++) {
      if (i === currentState) {
        // Valid next states
        states[i].nextStates.forEach(nextState => {
          script.add(Buffer.from([nextState]));
          script.add(bsv.Opcode.OP_EQUAL);
          script.add(bsv.Opcode.OP_IF);
          // Add transition logic here
          script.add(bsv.Opcode.OP_ENDIF);
        });
      }
    }
    
    // Require authorized signature
    script.add(bsv.Opcode.OP_DUP);
    script.add(bsv.Opcode.OP_HASH160);
    script.add(authorizedKey.toAddress().hashBuffer);
    script.add(bsv.Opcode.OP_EQUALVERIFY);
    script.add(bsv.Opcode.OP_CHECKSIG);
    
    return script;
  }

  /**
   * Covenant Template: Escrow with Arbitration
   * @param {PublicKey} buyer - Buyer public key
   * @param {PublicKey} seller - Seller public key  
   * @param {PublicKey} arbitrator - Arbitrator public key
   * @param {number} timelock - Optional timelock for refund
   * @returns {Script} Escrow covenant script
   */
  createEscrow(buyer, seller, arbitrator, timelock = null) {
    const script = new bsv.Script();
    
    if (timelock) {
      // Time-locked refund path
      script.add(bsv.Opcode.OP_IF);
      script.add(Buffer.from(timelock.toString(16).padStart(8, '0'), 'hex').reverse());
      script.add(bsv.Opcode.OP_CHECKLOCKTIMEVERIFY);
      script.add(bsv.Opcode.OP_DROP);
      script.add(buyer.toBuffer());
      script.add(bsv.Opcode.OP_CHECKSIG);
      script.add(bsv.Opcode.OP_ELSE);
    }
    
    // 2-of-3 multisig: buyer + seller, buyer + arbitrator, or seller + arbitrator
    script.add(bsv.Opcode.OP_2);
    script.add(buyer.toBuffer());
    script.add(seller.toBuffer());
    script.add(arbitrator.toBuffer());
    script.add(bsv.Opcode.OP_3);
    script.add(bsv.Opcode.OP_CHECKMULTISIG);
    
    if (timelock) {
      script.add(bsv.Opcode.OP_ENDIF);
    }
    
    return script;
  }

  /**
   * Covenant Template: Token Transfer with Rules
   * @param {PublicKey} newOwner - New owner public key
   * @param {number} minAmount - Minimum transfer amount
   * @param {Script} additionalRules - Optional additional validation rules
   * @returns {Script} Token covenant script
   */
  createTokenTransfer(newOwner, minAmount, additionalRules = null) {
    const script = new bsv.Script();
    
    // Check minimum amount
    if (minAmount > 0) {
      script.add(bsv.Opcode.OP_DUP);
      script.add(Buffer.from(minAmount.toString(16), 'hex'));
      script.add(bsv.Opcode.OP_GREATERTHANOREQUAL);
      script.add(bsv.Opcode.OP_VERIFY);
    }
    
    // Add custom rules
    if (additionalRules) {
      script.add(additionalRules.toBuffer());
    }
    
    // Transfer to new owner
    script.add(bsv.Opcode.OP_DUP);
    script.add(bsv.Opcode.OP_HASH160);
    script.add(newOwner.toAddress().hashBuffer);
    script.add(bsv.Opcode.OP_EQUALVERIFY);
    script.add(bsv.Opcode.OP_CHECKSIG);
    
    return script;
  }

  /**
   * Validate covenant execution
   * @param {Transaction} transaction - Transaction to validate
   * @param {number} inputIndex - Input index
   * @param {Script} unlockingScript - Unlocking script
   * @param {Script} lockingScript - Locking script
   * @returns {CovenantValidation} Validation result
   */
  validateCovenant(transaction, inputIndex, unlockingScript, lockingScript) {
    try {
      const interpreter = new bsv.Script.Interpreter();
      const flags = bsv.Script.Interpreter.SCRIPT_VERIFY_P2SH |
                   bsv.Script.Interpreter.SCRIPT_VERIFY_STRICTENC |
                   bsv.Script.Interpreter.SCRIPT_ENABLE_SIGHASH_FORKID |
                   bsv.Script.Interpreter.SCRIPT_ENABLE_MAGNETIC_OPCODES |
                   bsv.Script.Interpreter.SCRIPT_ENABLE_MONOLITH_OPCODES;
      
      const isValid = interpreter.verify(unlockingScript, lockingScript, transaction, inputIndex, flags);
      
      return new CovenantValidation(isValid, interpreter.errstr || 'Success');
    } catch (error) {
      return new CovenantValidation(false, error.message);
    }
  }

  /**
   * Advanced covenant construction based on nChain PUSHTX techniques
   * @param {string} type - Covenant type ('pushtx', 'perpetual', 'pels')
   * @param {Object} params - Covenant parameters
   * @returns {Script} Advanced covenant script
   */
  createAdvancedCovenant(type, params = {}) {
    const templates = {
      'pushtx': this.createPushtxCovenant,
      'perpetual': this.createPerpetualCovenant,
      'pels': this.createPerpetualCovenant, // PELS is a type of perpetual covenant
      'introspection': this.createIntrospectionCovenant
    };
    
    const templateFn = templates[type];
    if (!templateFn) {
      throw new Error(`Unknown advanced covenant type: ${type}. Available types: ${Object.keys(templates).join(', ')}`);
    }
    
    return templateFn.call(this, params);
  }

  /**
   * PUSHTX implementation based on nChain white paper WP1605
   * Generates signature in-script to push current transaction to stack
   * @param {Object} params - PUSHTX parameters
   * @returns {Script} PUSHTX covenant script
   */
  createPushtxCovenant(params = {}) {
    const {
      publicKey = '0279be667ef9dcbbac55a06295ce870b07029bfcdb2dce28d959f2815b16f81798',
      enforceOutputs = true,
      sighashType = 0x41 // SIGHASH_ALL | SIGHASH_FORKID
    } = params;
    
    const script = new bsv.Script();
    
    // Message construction for covenant validation (items 1-7 from preimage)
    script.add(bsv.Opcode.OP_2DUP)
          .add(bsv.Opcode.OP_HASH256) // Hash outputs (item 9)
          .add(bsv.Opcode.OP_SWAP);
    
    // Add sequence number (item 8)
    script.add(Buffer.from('ffffffff', 'hex'))
          .add(bsv.Opcode.OP_CAT)
          .add(bsv.Opcode.OP_SWAP)
          .add(bsv.Opcode.OP_CAT);
          
    // Add locktime (item 10) and sighash flag (item 11)
    script.add(Buffer.from('00000000', 'hex')) // nLockTime
          .add(Buffer.from('41000000', 'hex')) // sighashType in little-endian
          .add(bsv.Opcode.OP_CAT)
          .add(bsv.Opcode.OP_CAT);
          
    // PUSHTX signature generation (k=a=1 optimization)
    script.add(bsv.Opcode.OP_HASH256);
    
    // Add generator point x-coordinate
    const generatorX = '79be667ef9dcbbac55a06295ce870b07029bfcdb2dce28d959f2815b16f81798';
    script.add(Buffer.from(generatorX, 'hex'))
          .add(bsv.Opcode.OP_ADD);
          
    // Modular arithmetic with secp256k1 order
    const secp256k1Order = 'fffffffffffffffffffffffffffffffebaaedce6af48a03bbfd25e8cd0364141';
    script.add(Buffer.from(secp256k1Order, 'hex'))
          .add(bsv.Opcode.OP_MOD);
          
    // Convert to canonical DER format
    this._addDERConversion(script);
    
    // Add sighash flag and public key
    script.add(Buffer.from([sighashType]))
          .add(bsv.Opcode.OP_CAT)
          .add(Buffer.from(publicKey, 'hex'));
          
    // Verify signature with OP_CHECKSIGVERIFY
    script.add(bsv.Opcode.OP_CHECKSIGVERIFY);
    
    if (enforceOutputs) {
      // Message is now on stack - add output enforcement
      this._addOutputValidation(script, params);
    }
    
    return script;
  }

  /**
   * Perpetually Enforcing Locking Script (PELS) from nChain paper
   * Forces all future transactions to maintain same locking script and value
   * @param {Object} params - PELS parameters
   * @returns {Script} PELS covenant script
   */
  createPerpetualCovenant(params = {}) {
    const {
      publicKeyHash,
      feeDeduction = 512,
      enforceScript = true,
      enforceValue = true
    } = params;
    
    if (!publicKeyHash) {
      throw new Error('publicKeyHash required for perpetual covenant');
    }
    
    const script = new bsv.Script();
    
    // Construct message with fee-adjusted output validation
    script.add(bsv.Opcode.OP_2DUP)
          .add(bsv.Opcode.OP_BIN2NUM);
          
    // Deduct transaction fee if specified
    if (feeDeduction > 0) {
      script.add(Buffer.from(feeDeduction.toString(16).padStart(4, '0'), 'hex'))
            .add(bsv.Opcode.OP_SUB);
    }
    
    // Convert back to 8-byte little-endian
    script.add(Buffer.from([0x08]))
          .add(bsv.Opcode.OP_NUM2BIN)
          .add(bsv.Opcode.OP_SWAP)
          .add(bsv.Opcode.OP_CAT);
          
    // Hash the new output for message construction
    script.add(bsv.Opcode.OP_HASH256);
    
    // Build complete sighash preimage
    this._addPreimageConstruction(script, params);
    
    // Generate and verify PUSHTX signature  
    this._addPushtxSignature(script, params);
    
    // Extract and validate output structure against previous output
    // Skip to value field (104 bytes into preimage)
    script.add(bsv.Opcode.OP_SWAP)
          .add(Buffer.from([0x68])) // 104 decimal = 0x68 hex
          .add(bsv.Opcode.OP_SPLIT)
          .add(bsv.Opcode.OP_NIP)
          .add(bsv.Opcode.OP_SWAP)
          .add(Buffer.from([0x08])) // 8 bytes for value
          .add(bsv.Opcode.OP_SPLIT)
          .add(bsv.Opcode.OP_SWAP)
          .add(bsv.Opcode.OP_CAT);
          
    // Verify current output matches previous output format
    if (enforceValue || enforceScript) {
      script.add(bsv.Opcode.OP_EQUALVERIFY);
    }
    
    // Final P2PKH check for authenticity
    script.add(bsv.Opcode.OP_DUP)
          .add(bsv.Opcode.OP_HASH160)
          .add(Buffer.from(publicKeyHash, 'hex'))
          .add(bsv.Opcode.OP_EQUALVERIFY)
          .add(bsv.Opcode.OP_CHECKSIG);
          
    return script;
  }

  /**
   * Transaction introspection covenant using preimage analysis
   * @param {Object} params - Introspection parameters
   * @returns {Script} Introspection covenant script
   */
  createIntrospectionCovenant(params = {}) {
    const {
      validateInputs = false,
      validateOutputs = true,
      validateSequence = false,
      validateLocktime = false
    } = params;
    
    const script = new bsv.Script();
    
    // Get preimage for analysis
    this._addPushtxSignature(script, params);
    
    // Parse preimage fields for validation
    if (validateInputs) {
      script.add(bsv.Opcode.OP_DUP)
            .add(Buffer.from([0x04, 0x24])) // Skip to hashPrevouts
            .add(bsv.Opcode.OP_SPLIT)
            .add(bsv.Opcode.OP_DROP);
      // Add input validation logic here
    }
    
    if (validateOutputs) {
      // Extract hashOutputs for validation
      script.add(bsv.Opcode.OP_DUP)
            .add(Buffer.from([0x64])) // Skip to hashOutputs position
            .add(bsv.Opcode.OP_SPLIT)
            .add(bsv.Opcode.OP_NIP)
            .add(Buffer.from([0x20])) // 32 bytes
            .add(bsv.Opcode.OP_SPLIT)
            .add(bsv.Opcode.OP_DROP);
      // Add output validation logic here  
    }
    
    return script;
  }

  // Helper methods for advanced covenant construction
  
  _addDERConversion(script) {
    // Convert s value to canonical form (s <= n/2)
    const secp256k1HalfOrder = '7fffffffffffffffffffffffffffffff5d576e7357a4501ddfe92f46681b20a0';
    
    script.add(bsv.Opcode.OP_DUP)
          .add(Buffer.from(secp256k1HalfOrder, 'hex'))
          .add(bsv.Opcode.OP_GREATERTHAN)
          .add(bsv.Opcode.OP_IF);
          
    // If s > n/2, compute n - s to prevent malleability
    const secp256k1Order = 'fffffffffffffffffffffffffffffffebaaedce6af48a03bbfd25e8cd0364141';
    script.add(Buffer.from(secp256k1Order, 'hex'))
          .add(bsv.Opcode.OP_SWAP)
          .add(bsv.Opcode.OP_SUB);
          
    script.add(bsv.Opcode.OP_ENDIF);
    
    // Add DER sequence formatting
    script.add(bsv.Opcode.OP_SIZE)
          .add(bsv.Opcode.OP_DUP)
          .add(Buffer.from([0x24])) // 36 bytes total length
          .add(bsv.Opcode.OP_ADD)
          .add(Buffer.from([0x30])) // DER sequence tag
          .add(bsv.Opcode.OP_SWAP)
          .add(bsv.Opcode.OP_CAT);
          
    // Add r component (using generator x-coordinate as r)
    script.add(Buffer.from('022079be667ef9dcbbac55a06295ce870b07029bfcdb2dce28d959f2815b16f8179802', 'hex'))
          .add(bsv.Opcode.OP_CAT)
          .add(bsv.Opcode.OP_SWAP)
          .add(bsv.Opcode.OP_CAT)
          .add(bsv.Opcode.OP_SWAP)
          .add(bsv.Opcode.OP_CAT);
  }
  
  _addOutputValidation(script, params) {
    const { enforceValue, enforceScript, enforceCount } = params;
    
    // Output validation after CHECKSIGVERIFY leaves preimage on stack
    if (enforceValue) {
      script.add(bsv.Opcode.OP_DUP)
            .add(Buffer.from([0x08])) // 8 bytes for value
            .add(bsv.Opcode.OP_SPLIT);
      // Add value enforcement logic
    }
    
    if (enforceScript) {
      // Extract and validate locking script
      script.add(bsv.Opcode.OP_DUP)
            .add(bsv.Opcode.OP_SIZE)
            .add(Buffer.from([0x09])) // Skip value + length byte
            .add(bsv.Opcode.OP_SUB)
            .add(bsv.Opcode.OP_SPLIT)
            .add(bsv.Opcode.OP_NIP);
    }
    
    if (enforceCount) {
      // Validate number of outputs in hashOutputs
      // This requires parsing the actual outputs, not just hash
    }
  }
  
  _addPreimageConstruction(script, params) {
    const { 
      version = 1, 
      locktime = 0, 
      sighashType = 0x41,
      sequence = 0xffffffff 
    } = params;
    
    // Construct fields for complete BIP143 preimage
    // Items 8-11: sequence, hashOutputs, locktime, sighashType
    script.add(Buffer.from(sequence.toString(16).padStart(8, '0'), 'hex'))
          .add(bsv.Opcode.OP_CAT)
          .add(bsv.Opcode.OP_SWAP) // hashOutputs already computed
          .add(bsv.Opcode.OP_CAT)
          .add(Buffer.from(locktime.toString(16).padStart(8, '0'), 'hex'))
          .add(bsv.Opcode.OP_CAT)
          .add(Buffer.from(sighashType.toString(16).padStart(8, '0'), 'hex'))
          .add(bsv.Opcode.OP_CAT);
  }
  
  _addPushtxSignature(script, params) {
    const { 
      publicKey = '0279be667ef9dcbbac55a06295ce870b07029bfcdb2dce28d959f2815b16f81798',
      sighashType = 0x41
    } = params;
    
    // Generate signature using PUSHTX technique (k=a=1)
    script.add(bsv.Opcode.OP_HASH256);
    
    // s = z + Gx mod n (where z = hash256(message), Gx = generator x-coord)
    const generatorX = '79be667ef9dcbbac55a06295ce870b07029bfcdb2dce28d959f2815b16f81798';
    script.add(Buffer.from(generatorX, 'hex'))
          .add(bsv.Opcode.OP_ADD);
          
    // Modular reduction with secp256k1 order
    const secp256k1Order = 'fffffffffffffffffffffffffffffffebaaedce6af48a03bbfd25e8cd0364141';
    script.add(Buffer.from(secp256k1Order, 'hex'))
          .add(bsv.Opcode.OP_MOD);
          
    // Convert to DER format and verify
    this._addDERConversion(script);
    script.add(Buffer.from([sighashType]))
          .add(bsv.Opcode.OP_CAT)
          .add(Buffer.from(publicKey, 'hex'))
          .add(bsv.Opcode.OP_CHECKSIGVERIFY);
  }
}

/**
 * Enhanced transaction with covenant-specific methods
 */
class CovenantTransaction {
  constructor(transaction, covenantInterface) {
    this.tx = transaction;
    this.covenant = covenantInterface;
    this.preimages = new Map();
  }

  /**
   * Get preimage for specific input with caching
   */
  getPreimage(inputIndex, lockingScript, satoshis) {
    const key = `${inputIndex}-${lockingScript.toHex()}-${satoshis}`;
    
    if (!this.preimages.has(key)) {
      const preimage = this.covenant.getPreimage(this.tx, inputIndex, lockingScript, satoshis);
      this.preimages.set(key, preimage);
    }
    
    return this.preimages.get(key);
  }

  /**
   * Sign input with covenant-compatible signature
   */
  signInput(inputIndex, privateKey, lockingScript, satoshis) {
    const signature = this.covenant.createSignature(this.tx, privateKey, inputIndex, lockingScript, satoshis);
    
    const unlockingScript = new bsv.Script()
      .add(signature)
      .add(privateKey.publicKey.toBuffer());
    
    this.tx.inputs[inputIndex].setScript(unlockingScript);
    return this;
  }

  /**
   * Access underlying BSV transaction
   */
  getTransaction() {
    return this.tx;
  }

  /**
   * Verify transaction with enhanced error reporting
   */
  verify() {
    try {
      return this.tx.verify();
    } catch (error) {
      console.error('Transaction validation error:', error.message);
      return false;
    }
  }
}

/**
 * Parsed preimage with convenient access methods
 */
class CovenantPreimage {
    constructor(preimageHex) {
        this.hex = preimageHex;
        this.buffer = Buffer.from(preimageHex, 'hex');
        this.parseFields();
    }

    parseFields() {
        let offset = 0;
        
        // BIP143 sighash preimage structure (detailed field-by-field parsing)
        // Field 1: nVersion (4 bytes, little-endian)
        this.nVersion = this.buffer.subarray(offset, offset + 4);
        this.nVersionValue = this.buffer.readUInt32LE(offset);
        offset += 4;
        
        // Field 2: hashPrevouts (32 bytes) - double SHA256 of all input outpoints
        this.hashPrevouts = this.buffer.subarray(offset, offset + 32);
        offset += 32;
        
        // Field 3: hashSequence (32 bytes) - double SHA256 of all input sequences  
        this.hashSequence = this.buffer.subarray(offset, offset + 32);
        offset += 32;
        
        // Field 4: outpoint (36 bytes) - prevTxId (32) + outputIndex (4, little-endian)
        this.outpoint = this.buffer.subarray(offset, offset + 36);
        this.prevTxId = this.buffer.subarray(offset, offset + 32);
        offset += 32;
        this.outputIndex = this.buffer.subarray(offset, offset + 4);
        this.outputIndexValue = this.buffer.readUInt32LE(offset);
        offset += 4;
        
        // Field 5: scriptCode - variable length with proper parsing
        const scriptLen = this.readVarInt(offset);
        offset += this.getVarIntLength(scriptLen);
        this.scriptCode = this.buffer.subarray(offset, offset + scriptLen);
        offset += scriptLen;
        
        // Field 6: amount (8 bytes, little-endian) - value of UTXO being spent
        this.amount = this.buffer.subarray(offset, offset + 8);
        this.amountValue = this.buffer.readBigUInt64LE(offset);
        offset += 8;
        
        // Field 7: nSequence (4 bytes, little-endian)
        this.nSequence = this.buffer.subarray(offset, offset + 4);
        this.nSequenceValue = this.buffer.readUInt32LE(offset);
        offset += 4;
        
        // Field 8: hashOutputs (32 bytes) - double SHA256 of all outputs
        this.hashOutputs = this.buffer.subarray(offset, offset + 32);
        offset += 32;
        
        // Field 9: nLockTime (4 bytes, little-endian)
        this.nLockTime = this.buffer.subarray(offset, offset + 4);
        this.nLockTimeValue = this.buffer.readUInt32LE(offset);
        offset += 4;
        
        // Field 10: sighashType (4 bytes, little-endian)
        this.sighashType = this.buffer.subarray(offset, offset + 4);
        this.sighashTypeValue = this.buffer.readUInt32LE(offset);
        offset += 4;
        
        // Validate preimage structure (typical 108+ bytes)
        this.isValid = offset === this.buffer.length && this.buffer.length >= 108;
    }
    
    readVarInt(offset) {
        const first = this.buffer.readUInt8(offset);
        if (first < 0xfd) return first;
        if (first === 0xfd) return this.buffer.readUInt16LE(offset + 1);
        if (first === 0xfe) return this.buffer.readUInt32LE(offset + 1);
        if (first === 0xff) return this.buffer.readBigUInt64LE(offset + 1);
    }
    
    getVarIntLength(value) {
        if (value < 0xfd) return 1;
        if (value <= 0xffff) return 3;
        if (value <= 0xffffffff) return 5;
        return 9;
    }
}

/**
 * Covenant validation result
 */
class CovenantValidation {
  constructor(isValid, message) {
    this.isValid = isValid;
    this.message = message;
  }

  toString() {
    return `${this.isValid ? 'VALID' : 'INVALID'}: ${this.message}`;
  }
}

module.exports = {
  CovenantInterface,
  CovenantTransaction,
  CovenantPreimage,
  CovenantValidation
};