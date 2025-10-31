# 📖 SmartLedger-BSV v3.3.3 Usage Guide

**Comprehensive answers to BIP-143 preimage extraction questions**  
**Date:** October 30, 2025  
**Library:** smartledger-bsv v3.3.3  

---

## 📋 **1. Complete Field Name Documentation**

### **✅ Supported Fields for `testFieldExtraction()`**

Based on the source code analysis, here are the **exact field names** that work with `testFieldExtraction()`:

#### **RIGHT-side Fields (extracted from end of preimage):**
- **`value`** - 8 bytes, amount in satoshis
- **`nSequence`** - 4 bytes, sequence number  
- **`hashOutputs`** - 32 bytes, hash of all outputs
- **`nLocktime`** - 4 bytes, transaction lock time
- **`sighashType`** - 4 bytes, signature hash type

#### **LEFT-side Fields (extracted from beginning):**
- **`nVersion`** - 4 bytes, transaction version
- **`hashPrevouts`** - 32 bytes, hash of all previous outputs
- **`hashSequence`** - 32 bytes, hash of all sequence numbers  
- **`outpoint_txid`** - 32 bytes, referenced transaction ID
- **`outpoint_vout`** - 4 bytes, referenced output index

#### **DYNAMIC Fields (variable-length extraction):**
- **`scriptCode`** - Variable bytes, the script being executed
- **`scriptLen`** - CompactSize varint, length of scriptCode

### **❌ Non-Working Field Names (and why)**

These field names fail with "Unknown field" because they use **different naming conventions**:

- **`version`** → Use **`nVersion`** instead
- **`outpoint`** → Use **`outpoint_txid`** and **`outpoint_vout`** separately
- **`amount`** → Use **`value`** instead
- **`sequence`** → Use **`nSequence`** instead
- **`locktime`** → Use **`nLocktime`** instead
- **`sighash`** → Use **`sighashType`** instead

### **📝 Field Name Mapping Table**

| Your Name | SmartLedger Name | BIP-143 Name | Status |
|-----------|------------------|--------------|---------|
| `version` | `nVersion` | `nVersion` | ✅ Use nVersion |
| `hashPrevouts` | `hashPrevouts` | `hashPrevouts` | ✅ Works |
| `hashSequence` | `hashSequence` | `hashSequence` | ✅ Works |
| `outpoint` | `outpoint_txid` + `outpoint_vout` | `outpoint` | ⚠️ Split into two |
| `scriptCode` | `scriptCode` | `scriptCode` | ✅ Works |
| `amount` | `value` | `value` | ✅ Use value |
| `sequence` | `nSequence` | `nSequence` | ✅ Use nSequence |
| `hashOutputs` | `hashOutputs` | `hashOutputs` | ✅ Works |
| `locktime` | `nLocktime` | `nLockTime` | ✅ Use nLocktime |
| `sighash` | `sighashType` | `sighashType` | ✅ Use sighashType |

---

## 🔧 **2. Field Capabilities Matrix**

### **ASM Generation vs Extract-Only**

**All supported fields can both extract and generate ASM:**

```javascript
// Both of these work for all supported fields:
const extraction = bsv.SmartContract.testFieldExtraction(preimageHex, 'value');
const extracted = bsv.SmartContract.extractPreimage(preimageHex);
```

### **Why some fields appear "extract-only":**

The confusion comes from using incorrect field names. When you use `version` instead of `nVersion`, `testFieldExtraction()` fails but `extractPreimage()` works because:

1. **`testFieldExtraction()`** - Strict field name validation
2. **`extractPreimage()`** - Returns all fields with both naming conventions

---

## 🚨 **3. Custom Transaction Preimage Generation**

### **Why Custom Transactions Fail**

The CompactSize errors occur because **custom transactions often have structural differences** from the expected BIP-143 format:

#### **Common Issues:**
1. **Missing or invalid scriptCode** in UTXO
2. **Incorrect sighash type** (must include FORKID)
3. **Invalid transaction structure** (missing required fields)
4. **Wrong input/output encoding**

### **✅ Working Custom Transaction Pattern**

```javascript
// ✅ CORRECT: Complete UTXO structure
function createWorkingCustomTransaction() {
    const privateKey = new bsv.PrivateKey();
    const address = privateKey.toAddress();
    const script = bsv.Script.buildPublicKeyHashOut(address);
    
    // CRITICAL: Complete UTXO with proper script
    const utxo = {
        txId: '0'.repeat(64), // Valid 32-byte hex
        outputIndex: 0,
        address: address.toString(),
        script: script.toString(), // ← MUST be valid hex script
        satoshis: 100000
    };
    
    const tx = new bsv.Transaction()
        .from(utxo)
        .to('1BitcoinEaterAddressDontSendf59kuE', 50000)
        .change(address)
        .sign(privateKey);
    
    // CRITICAL: Use FORKID sighash
    const sighashType = bsv.crypto.Signature.SIGHASH_ALL | bsv.crypto.Signature.SIGHASH_FORKID;
    
    try {
        const preimageBuffer = bsv.Transaction.sighash.sighashPreimage(
            tx, sighashType, 0, script, new bsv.crypto.BN(utxo.satoshis)
        );
        
        return preimageBuffer.toString('hex');
    } catch (error) {
        console.error('Custom transaction preimage failed:', error.message);
        return null;
    }
}
```

### **❌ Common Mistakes That Cause CompactSize Errors**

```javascript
// ❌ WRONG: Invalid script
const badUTXO = {
    script: 'invalid_hex', // Causes CompactSize error
    // ... other fields
};

// ❌ WRONG: Missing FORKID
const badSighash = bsv.crypto.Signature.SIGHASH_ALL; // No FORKID

// ❌ WRONG: Invalid UTXO structure
const badUTXO2 = {
    txId: 'short', // Must be 64 chars (32 bytes)
    satoshis: 0    // Must be > 546 (dust limit)
};
```

---

## 📚 **4. extractPreimage() vs testFieldExtraction()**

### **When to Use Each Method**

#### **Use `extractPreimage()` for:**
- **General field access** - Get all fields at once
- **Data analysis** - Examining preimage structure
- **Production apps** - Reliable field extraction

```javascript
// ✅ General purpose extraction
const extracted = bsv.SmartContract.extractPreimage(preimageHex);
console.log('Version:', extracted.version.toString('hex'));
console.log('Value:', extracted.amount.toString('hex')); // Note: 'amount', not 'value'
```

#### **Use `testFieldExtraction()` for:**
- **ASM generation** - Building Bitcoin Scripts
- **Covenant development** - Creating smart contracts
- **Script testing** - Validating field extraction logic

```javascript
// ✅ ASM generation for covenants
const result = bsv.SmartContract.testFieldExtraction(preimageHex, 'value');
console.log('Generated ASM:', result.fieldExtraction.asmGenerated);
console.log('Extracted value:', result.fieldExtraction.value);
```

### **Key Differences:**

| Feature | `extractPreimage()` | `testFieldExtraction()` |
|---------|---------------------|-------------------------|
| **Purpose** | Data extraction | Script generation |
| **Field Names** | BIP-143 standard (`amount`, `version`) | SmartLedger format (`value`, `nVersion`) |
| **Returns** | Field objects | ASM + execution results |
| **Use Case** | Analysis, debugging | Covenant development |
| **Error Handling** | Graceful fallbacks | Strict validation |

---

## 🔒 **5. BIP-143 Compliance**

### **✅ SmartLedger-BSV IS BIP-143 Compliant**

The library correctly implements the BIP-143 specification:

#### **Correct Field Order:**
1. `nVersion` (4 bytes)
2. `hashPrevouts` (32 bytes)  
3. `hashSequence` (32 bytes)
4. `outpoint` (36 bytes: 32 + 4)
5. `scriptCode` (variable with CompactSize prefix)
6. `value` (8 bytes)
7. `nSequence` (4 bytes)
8. `hashOutputs` (32 bytes)
9. `nLockTime` (4 bytes)
10. `sighashType` (4 bytes)

#### **Naming Convention Differences**

The library uses **two naming conventions** for backward compatibility:

- **BIP-143 Standard:** `version`, `amount`, `sequence`, `locktime`, `sighash`
- **SmartLedger Format:** `nVersion`, `value`, `nSequence`, `nLocktime`, `sighashType`

Both are correct - just use the right one for each function!

---

## 🛠️ **6. Recommended Error Handling**

### **✅ Production-Ready Error Handling Pattern**

```javascript
function robustPreimageExtraction(preimageHex, fieldName) {
    const results = {
        success: false,
        value: null,
        asm: null,
        strategy: null,
        errors: []
    };
    
    try {
        // Step 1: Try testFieldExtraction first (for ASM generation)
        const testResult = bsv.SmartContract.testFieldExtraction(preimageHex, fieldName);
        
        if (testResult.success) {
            results.success = true;
            results.value = testResult.fieldExtraction.value;
            results.asm = testResult.fieldExtraction.asmGenerated;
            results.strategy = testResult.fieldExtraction.strategy;
            return results;
        } else {
            results.errors.push(`testFieldExtraction failed: ${testResult.error}`);
        }
        
    } catch (error) {
        results.errors.push(`testFieldExtraction error: ${error.message}`);
        
        // Step 2: Try field name mapping
        const fieldMapping = {
            'version': 'nVersion',
            'amount': 'value', 
            'sequence': 'nSequence',
            'locktime': 'nLocktime',
            'sighash': 'sighashType'
        };
        
        const mappedField = fieldMapping[fieldName];
        if (mappedField) {
            try {
                const mappedResult = bsv.SmartContract.testFieldExtraction(preimageHex, mappedField);
                if (mappedResult.success) {
                    results.success = true;
                    results.value = mappedResult.fieldExtraction.value;
                    results.asm = mappedResult.fieldExtraction.asmGenerated;
                    results.strategy = mappedResult.fieldExtraction.strategy;
                    results.usedMapping = `${fieldName} → ${mappedField}`;
                    return results;
                }
            } catch (mappingError) {
                results.errors.push(`Mapping attempt failed: ${mappingError.message}`);
            }
        }
        
        // Step 3: Fallback to extractPreimage
        try {
            const extracted = bsv.SmartContract.extractPreimage(preimageHex);
            const fallbackValue = extracted[fieldName] || extracted[mappedField];
            
            if (fallbackValue) {
                results.success = true;
                results.value = fallbackValue.toString('hex');
                results.strategy = 'FALLBACK_EXTRACT';
                results.warning = 'No ASM generated - used extractPreimage fallback';
                return results;
            }
        } catch (fallbackError) {
            results.errors.push(`Fallback extraction failed: ${fallbackError.message}`);
        }
    }
    
    return results;
}
```

### **🚨 Common Error Types and Solutions**

| Error | Cause | Solution |
|-------|-------|----------|
| `Unknown field: version` | Wrong field name | Use `nVersion` |
| `Invalid 8-byte CompactSize` | Bad transaction structure | Fix UTXO script/sighash |
| `toString() radix argument` | Numeric conversion issue | Use `.toString('hex')` |
| `Field not found in LEFT fields` | Typo in field name | Check spelling |
| `Failed to extract with any strategy` | Corrupted preimage | Validate preimage hex |

---

## 🎯 **7. Production Usage Recommendations**

### **✅ Recommended Production Pattern**

```javascript
class ProductionPreimageHandler {
    constructor(options = {}) {
        this.options = {
            validatePreimage: true,
            enableFallbacks: true,
            logErrors: false,
            ...options
        };
    }
    
    async extractField(preimageHex, fieldName) {
        // Step 1: Input validation
        if (!preimageHex || typeof preimageHex !== 'string') {
            throw new Error('Invalid preimage hex');
        }
        
        if (preimageHex.length < 208) { // Minimum BIP-143 preimage: 104 bytes = 208 hex chars
            throw new Error('Preimage too short');
        }
        
        // Step 2: Normalize field name
        const normalizedField = this.normalizeFieldName(fieldName);
        
        // Step 3: Extract with error handling
        try {
            const result = bsv.SmartContract.testFieldExtraction(preimageHex, normalizedField);
            
            if (result.success) {
                return {
                    success: true,
                    field: normalizedField,
                    value: result.fieldExtraction.value,
                    asm: result.fieldExtraction.asmGenerated,
                    interpretation: result.fieldExtraction.interpretation
                };
            }
        } catch (error) {
            if (this.options.logErrors) {
                console.warn(`Field extraction failed for ${fieldName}:`, error.message);
            }
        }
        
        // Step 4: Fallback if enabled
        if (this.options.enableFallbacks) {
            return this.fallbackExtraction(preimageHex, fieldName);
        }
        
        throw new Error(`Failed to extract field: ${fieldName}`);
    }
    
    normalizeFieldName(fieldName) {
        const mapping = {
            'version': 'nVersion',
            'amount': 'value',
            'sequence': 'nSequence', 
            'locktime': 'nLocktime',
            'sighash': 'sighashType',
            'outpoint': 'outpoint_txid' // Note: only returns txid part
        };
        
        return mapping[fieldName] || fieldName;
    }
    
    fallbackExtraction(preimageHex, fieldName) {
        const extracted = bsv.SmartContract.extractPreimage(preimageHex);
        const value = extracted[fieldName];
        
        if (value) {
            return {
                success: true,
                field: fieldName,
                value: value.toString('hex'),
                asm: null, // No ASM in fallback
                interpretation: null,
                warning: 'Used fallback extraction - no ASM generated'
            };
        }
        
        return { success: false, error: 'Field not found in fallback extraction' };
    }
}

// Usage
const handler = new ProductionPreimageHandler({ enableFallbacks: true });
const result = await handler.extractField(preimageHex, 'amount');
```

---

## ⚡ **8. Performance Considerations**

### **Performance Guidelines**

1. **Cache preimage objects** - Don't re-parse the same preimage
2. **Use `extractPreimage()` for multiple fields** - More efficient than multiple `testFieldExtraction()` calls
3. **Validate preimage length first** - Quick check before expensive operations
4. **Use appropriate extraction strategy** - `LEFT` for early fields, `RIGHT` for late fields

```javascript
// ✅ Efficient multiple field extraction
const extracted = bsv.SmartContract.extractPreimage(preimageHex);
const fields = {
    version: extracted.version,
    amount: extracted.amount,
    sighashType: extracted.sighash
};

// ❌ Inefficient - multiple parsing
const version = bsv.SmartContract.testFieldExtraction(preimageHex, 'nVersion');
const amount = bsv.SmartContract.testFieldExtraction(preimageHex, 'value');
const sighash = bsv.SmartContract.testFieldExtraction(preimageHex, 'sighashType');
```

---

## 🔮 **9. Working Example: Complete Field Extraction**

### **Complete Working Example**

```javascript
function completeFieldExtractionDemo() {
    console.log('🚀 Complete SmartLedger-BSV Field Extraction Demo\n');
    
    // Step 1: Create working preimage
    const privateKey = new bsv.PrivateKey();
    const address = privateKey.toAddress();
    const script = bsv.Script.buildPublicKeyHashOut(address);
    
    const utxo = {
        txId: '1'.repeat(64),
        outputIndex: 0,
        address: address.toString(),
        script: script.toString(),
        satoshis: 100000
    };
    
    const tx = new bsv.Transaction()
        .from(utxo)
        .to('1BitcoinEaterAddressDontSendf59kuE', 50000)
        .change(address)
        .sign(privateKey);
    
    const sighashType = bsv.crypto.Signature.SIGHASH_ALL | bsv.crypto.Signature.SIGHASH_FORKID;
    const preimageBuffer = bsv.Transaction.sighash.sighashPreimage(
        tx, sighashType, 0, script, new bsv.crypto.BN(utxo.satoshis)
    );
    
    const preimageHex = preimageBuffer.toString('hex');
    console.log(`📊 Generated preimage: ${preimageBuffer.length} bytes\n`);
    
    // Step 2: Test all supported fields
    const supportedFields = [
        'nVersion', 'hashPrevouts', 'hashSequence', 'outpoint_txid', 'outpoint_vout',
        'scriptCode', 'scriptLen', 'value', 'nSequence', 'hashOutputs', 'nLocktime', 'sighashType'
    ];
    
    console.log('🧪 Testing all supported fields:\n');
    
    supportedFields.forEach(fieldName => {
        try {
            const result = bsv.SmartContract.testFieldExtraction(preimageHex, fieldName);
            
            if (result.success) {
                const field = result.fieldExtraction;
                console.log(`✅ ${fieldName.padEnd(15)}: ${field.value.substring(0, 20)}... (${field.strategy})`);
                
                // Show interpretation if available
                if (field.interpretation && field.interpretation.description) {
                    console.log(`   └─ ${field.interpretation.description}`);
                }
            } else {
                console.log(`❌ ${fieldName.padEnd(15)}: ${result.error}`);
            }
        } catch (error) {
            console.log(`❌ ${fieldName.padEnd(15)}: ${error.message}`);
        }
    });
    
    // Step 3: Compare with extractPreimage
    console.log('\n🔍 Comparing with extractPreimage():\n');
    
    const extracted = bsv.SmartContract.extractPreimage(preimageHex);
    
    console.log('Available fields in extracted object:');
    Object.keys(extracted).forEach(key => {
        if (extracted[key] && extracted[key].toString) {
            const value = extracted[key].toString('hex');
            console.log(`  ${key.padEnd(15)}: ${value.substring(0, 20)}...`);
        }
    });
    
    return {
        preimageHex: preimageHex,
        supportedFields: supportedFields,
        extracted: extracted
    };
}

// Run the demo
const demo = completeFieldExtractionDemo();
```

---

## 📝 **10. Summary & Best Practices**

### **✅ Key Takeaways**

1. **Use correct field names:** `nVersion`, `value`, `nSequence`, `nLocktime`, `sighashType`
2. **For ASM generation:** Use `testFieldExtraction()` with SmartLedger field names
3. **For data extraction:** Use `extractPreimage()` with BIP-143 standard names
4. **Custom transactions:** Ensure proper UTXO structure and FORKID sighash
5. **Error handling:** Implement fallbacks and field name mapping
6. **Performance:** Cache preimage objects, validate input early

### **🎯 Production Checklist**

- [ ] Use normalized field names consistently
- [ ] Implement proper error handling with fallbacks
- [ ] Validate preimage structure before extraction
- [ ] Cache preimage objects for multiple field access
- [ ] Log errors for debugging but handle gracefully
- [ ] Test with both `createExample()` and custom transactions
- [ ] Document which extraction method you're using and why

### **🔗 Related Documentation**

- [Smart Contract Guide](./SMART_CONTRACT_GUIDE.md) - Advanced covenant development
- [API Reference](../lib/smart_contract/API_REFERENCE.md) - Complete function documentation
- [Examples](../examples/) - Working code samples
- [GitHub Repository](https://github.com/codenlighten/smartledger-bsv) - Source code

---

**Created by:** SmartLedger-BSV Development Team  
**Version:** v3.3.3  
**Last Updated:** October 30, 2025