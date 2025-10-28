#!/usr/bin/env node

/**
 * BSV Opcode Mapping and Interpreter Configuration Tool
 * 
 * Maps all opcodes with their enabled/disabled status and required flags
 * Provides helper functions for script execution with proper flags
 * 
 * Usage: node opcode_map.js
 */

const bsv = require('./index.js');
const { Opcode, Script } = bsv;
const Interpreter = bsv.Script.Interpreter;

// Create reverse opcode mapping
const opcodeMap = {};
for (let key in Opcode.map) {
  const code = Opcode.map[key];
  opcodeMap[code] = key;
}

// Define opcode categories and their enablement requirements
const OPCODE_CATEGORIES = {
  // Always enabled opcodes
  CORE: {
    description: 'Core opcodes - always enabled',
    flag: null,
    opcodes: [
      'OP_0', 'OP_1NEGATE', 'OP_1', 'OP_2', 'OP_3', 'OP_4', 'OP_5', 'OP_6', 'OP_7', 'OP_8', 'OP_9', 'OP_10',
      'OP_11', 'OP_12', 'OP_13', 'OP_14', 'OP_15', 'OP_16', 'OP_NOP', 'OP_IF', 'OP_NOTIF', 'OP_ELSE', 'OP_ENDIF',
      'OP_VERIFY', 'OP_RETURN', 'OP_TOALTSTACK', 'OP_FROMALTSTACK', 'OP_2DROP', 'OP_2DUP', 'OP_3DUP', 'OP_2OVER',
      'OP_2ROT', 'OP_2SWAP', 'OP_IFDUP', 'OP_DEPTH', 'OP_DROP', 'OP_DUP', 'OP_NIP', 'OP_OVER', 'OP_PICK', 'OP_ROLL',
      'OP_ROT', 'OP_SWAP', 'OP_TUCK', 'OP_SIZE', 'OP_EQUAL', 'OP_EQUALVERIFY', 'OP_1ADD', 'OP_1SUB', 'OP_NEGATE',
      'OP_ABS', 'OP_NOT', 'OP_0NOTEQUAL', 'OP_ADD', 'OP_SUB', 'OP_BOOLAND', 'OP_BOOLOR', 'OP_NUMEQUAL',
      'OP_NUMEQUALVERIFY', 'OP_NUMNOTEQUAL', 'OP_LESSTHAN', 'OP_GREATERTHAN', 'OP_LESSTHANOREQUAL',
      'OP_GREATERTHANOREQUAL', 'OP_MIN', 'OP_MAX', 'OP_WITHIN', 'OP_RIPEMD160', 'OP_SHA1', 'OP_SHA256',
      'OP_HASH160', 'OP_HASH256', 'OP_CODESEPARATOR', 'OP_CHECKSIG', 'OP_CHECKSIGVERIFY', 'OP_CHECKMULTISIG',
      'OP_CHECKMULTISIGVERIFY', 'OP_NOP1', 'OP_PUSHDATA1', 'OP_PUSHDATA2', 'OP_PUSHDATA4'
    ]
  },
  
  // Monolith opcodes (May 2018 upgrade)
  MONOLITH: {
    description: 'Monolith opcodes - require SCRIPT_ENABLE_MONOLITH_OPCODES',
    flag: 'SCRIPT_ENABLE_MONOLITH_OPCODES',
    flagValue: (1 << 18),
    opcodes: [
      'OP_CAT', 'OP_SPLIT', 'OP_NUM2BIN', 'OP_BIN2NUM', 'OP_AND', 'OP_OR', 'OP_XOR', 'OP_DIV', 'OP_MOD'
    ]
  },
  
  // Magnetic opcodes (future upgrade)
  MAGNETIC: {
    description: 'Magnetic opcodes - require SCRIPT_ENABLE_MAGNETIC_OPCODES',
    flag: 'SCRIPT_ENABLE_MAGNETIC_OPCODES',
    flagValue: (1 << 19),
    opcodes: [
      'OP_INVERT', 'OP_MUL', 'OP_LSHIFT', 'OP_RSHIFT'
    ]
  },
  
  // Always disabled opcodes
  DISABLED: {
    description: 'Permanently disabled opcodes',
    flag: null,
    opcodes: [
      'OP_RESERVED', 'OP_VER', 'OP_VERIF', 'OP_VERNOTIF', 'OP_RESERVED1', 'OP_RESERVED2', 'OP_2MUL', 'OP_2DIV'
    ]
  },
  
  // NOP opcodes
  NOPS: {
    description: 'NOP opcodes - may be discouraged with SCRIPT_VERIFY_DISCOURAGE_UPGRADABLE_NOPS',
    flag: 'SCRIPT_VERIFY_DISCOURAGE_UPGRADABLE_NOPS',
    flagValue: (1 << 7),
    opcodes: [
      'OP_NOP2', 'OP_NOP3', 'OP_NOP4', 'OP_NOP5', 'OP_NOP6', 'OP_NOP7', 'OP_NOP8', 'OP_NOP9', 'OP_NOP10'
    ]
  }
};

/**
 * Get opcode information including enablement status
 */
function getOpcodeInfo(opcodeValue) {
  const opcodeName = opcodeMap[opcodeValue];
  if (!opcodeName) {
    return {
      value: opcodeValue,
      name: `UNKNOWN_${opcodeValue}`,
      enabled: false,
      category: 'UNKNOWN',
      requiresFlag: null
    };
  }
  
  // Find which category this opcode belongs to
  for (const [category, info] of Object.entries(OPCODE_CATEGORIES)) {
    if (info.opcodes.includes(opcodeName)) {
      return {
        value: opcodeValue,
        hex: `0x${opcodeValue.toString(16).padStart(2, '0')}`,
        name: opcodeName,
        enabled: category !== 'DISABLED',
        category: category,
        requiresFlag: info.flag,
        flagValue: info.flagValue,
        description: info.description
      };
    }
  }
  
  // Default to core if not found in any category
  return {
    value: opcodeValue,
    hex: `0x${opcodeValue.toString(16).padStart(2, '0')}`,
    name: opcodeName,
    enabled: true,
    category: 'CORE',
    requiresFlag: null,
    description: 'Core opcode - always enabled'
  };
}

/**
 * Get recommended interpreter flags for different use cases
 */
function getInterpreterFlags() {
  return {
    // Minimal flags for basic scripts
    BASIC: Interpreter.SCRIPT_VERIFY_P2SH,
    
    // Standard flags for most scripts
    STANDARD: Interpreter.SCRIPT_VERIFY_P2SH | 
              Interpreter.SCRIPT_VERIFY_STRICTENC |
              Interpreter.SCRIPT_VERIFY_MINIMALDATA,
    
    // Modern BSV with monolith opcodes (recommended for new scripts)
    MODERN: Interpreter.SCRIPT_VERIFY_P2SH | 
            Interpreter.SCRIPT_VERIFY_STRICTENC |
            Interpreter.SCRIPT_VERIFY_MINIMALDATA |
            Interpreter.SCRIPT_VERIFY_SIGPUSHONLY |
            Interpreter.SCRIPT_VERIFY_CLEANSTACK |
            Interpreter.SCRIPT_ENABLE_SIGHASH_FORKID |
            Interpreter.SCRIPT_ENABLE_MONOLITH_OPCODES,
    
    // Full BSV with all opcodes enabled
    FULL: Interpreter.SCRIPT_VERIFY_P2SH | 
          Interpreter.SCRIPT_VERIFY_STRICTENC |
          Interpreter.SCRIPT_VERIFY_MINIMALDATA |
          Interpreter.SCRIPT_VERIFY_SIGPUSHONLY |
          Interpreter.SCRIPT_VERIFY_CLEANSTACK |
          Interpreter.SCRIPT_ENABLE_SIGHASH_FORKID |
          Interpreter.SCRIPT_ENABLE_MONOLITH_OPCODES |
          Interpreter.SCRIPT_ENABLE_MAGNETIC_OPCODES,
    
    // Genesis rules (most permissive)
    GENESIS: Interpreter.SCRIPT_VERIFY_P2SH |
             Interpreter.SCRIPT_ENABLE_SIGHASH_FORKID |
             Interpreter.SCRIPT_ENABLE_MONOLITH_OPCODES |
             Interpreter.SCRIPT_ENABLE_MAGNETIC_OPCODES
  };
}

/**
 * Analyze a script and determine required flags
 */
function analyzeScriptRequirements(script) {
  let requiredFlags = Interpreter.SCRIPT_VERIFY_P2SH; // Base requirement
  const usedOpcodes = [];
  const issues = [];
  
  // Parse script
  let chunks;
  if (typeof script === 'string') {
    // ASM format
    chunks = script.split(' ').map(token => {
      if (token.startsWith('OP_')) {
        const opcodeValue = Object.keys(opcodeMap).find(key => opcodeMap[key] === token);
        return { opcodenum: parseInt(opcodeValue) };
      }
      return { buf: Buffer.from(token, 'hex') };
    });
  } else if (script instanceof Script) {
    chunks = script.chunks;
  } else {
    throw new Error('Invalid script format');
  }
  
  // Analyze each chunk
  chunks.forEach((chunk, index) => {
    if (chunk.opcodenum !== undefined) {
      const info = getOpcodeInfo(chunk.opcodenum);
      usedOpcodes.push(info);
      
      if (!info.enabled) {
        issues.push(`Opcode ${info.name} at position ${index} is permanently disabled`);
      } else if (info.requiresFlag) {
        if (info.flag === 'SCRIPT_ENABLE_MONOLITH_OPCODES') {
          requiredFlags |= Interpreter.SCRIPT_ENABLE_MONOLITH_OPCODES;
        } else if (info.flag === 'SCRIPT_ENABLE_MAGNETIC_OPCODES') {
          requiredFlags |= Interpreter.SCRIPT_ENABLE_MAGNETIC_OPCODES;
        }
      }
    }
  });
  
  // Add FORKID if using any signature opcodes
  const hasSignatureOpcodes = usedOpcodes.some(op => 
    op.name === 'OP_CHECKSIG' || op.name === 'OP_CHECKSIGVERIFY' || 
    op.name === 'OP_CHECKMULTISIG' || op.name === 'OP_CHECKMULTISIGVERIFY'
  );
  
  if (hasSignatureOpcodes) {
    requiredFlags |= Interpreter.SCRIPT_ENABLE_SIGHASH_FORKID;
  }
  
  return {
    requiredFlags,
    usedOpcodes,
    issues,
    recommendations: {
      basic: requiredFlags,
      safe: requiredFlags | Interpreter.SCRIPT_VERIFY_STRICTENC | Interpreter.SCRIPT_VERIFY_MINIMALDATA,
      strict: requiredFlags | Interpreter.SCRIPT_VERIFY_STRICTENC | Interpreter.SCRIPT_VERIFY_MINIMALDATA | 
              Interpreter.SCRIPT_VERIFY_SIGPUSHONLY | Interpreter.SCRIPT_VERIFY_CLEANSTACK
    }
  };
}

/**
 * Print opcode analysis
 */
function printOpcodeAnalysis() {
  console.log('🔧 BSV Opcode Mapping and Interpreter Configuration');
  console.log('═'.repeat(80));
  
  // Show interpreter flags
  console.log('\n⚙️  Available Interpreter Flags:');
  const flagNames = Object.keys(Interpreter).filter(key => key.startsWith('SCRIPT_'));
  flagNames.forEach(flagName => {
    const value = Interpreter[flagName];
    console.log(`  ${flagName.padEnd(40)}: 0x${value.toString(16).padStart(8, '0').toUpperCase()}`);
  });
  
  // Show recommended flag combinations
  console.log('\n🎯 Recommended Flag Combinations:');
  const flags = getInterpreterFlags();
  Object.entries(flags).forEach(([name, value]) => {
    console.log(`  ${name.padEnd(10)}: 0x${value.toString(16).padStart(8, '0').toUpperCase()}`);
  });
  
  // Show opcode categories
  console.log('\n📋 Opcode Categories:');
  Object.entries(OPCODE_CATEGORIES).forEach(([category, info]) => {
    console.log(`\n  ${category} - ${info.description}`);
    if (info.flag) {
      console.log(`    Required flag: ${info.flag} (0x${info.flagValue.toString(16).toUpperCase()})`);
    }
    console.log(`    Opcodes: ${info.opcodes.length}`);
    
    // Show first few opcodes
    const sample = info.opcodes.slice(0, 5);
    console.log(`    Sample: ${sample.join(', ')}${info.opcodes.length > 5 ? '...' : ''}`);
  });
  
  // Show total counts
  const totalOpcodes = Object.keys(opcodeMap).length;
  const enabledOpcodes = Object.keys(opcodeMap).filter(code => {
    const info = getOpcodeInfo(parseInt(code));
    return info.enabled;
  }).length;
  
  console.log(`\n📊 Summary:`);
  console.log(`  Total opcodes defined: ${totalOpcodes}`);
  console.log(`  Enabled opcodes: ${enabledOpcodes}`);
  console.log(`  Disabled opcodes: ${totalOpcodes - enabledOpcodes}`);
}

/**
 * Create a properly configured interpreter
 */
function createInterpreter(flagLevel = 'MODERN') {
  const flags = getInterpreterFlags();
  return {
    interpreter: new Interpreter(),
    flags: flags[flagLevel.toUpperCase()] || flags.MODERN,
    
    verify: function(scriptSig, scriptPubkey, tx, nin, satoshisBN) {
      return this.interpreter.verify(
        scriptSig, 
        scriptPubkey, 
        tx, 
        nin, 
        this.flags, 
        satoshisBN
      );
    }
  };
}

// CLI execution
if (require.main === module) {
  printOpcodeAnalysis();
  
  // Test with sample nLockTime script
  console.log('\n🧪 Testing nLockTime Script Requirements:');
  const sampleScript = 'OP_OVER OP_HASH256 a7a9bc2c7389fecf7d5279e0909bcaac1b0f7d0ee81713adfb7e97fad95322ad OP_EQUALVERIFY OP_OVER 6a OP_SPLIT OP_NIP 04 OP_SPLIT OP_NIP OP_BIN2NUM e803 OP_NUMEQUALVERIFY 03433a1466b09a27e0067efa9c58ec12ae5e26071a413cfe918b49656c75d7fb2d OP_CHECKSIGVERIFY';
  
  try {
    const analysis = analyzeScriptRequirements(sampleScript);
    console.log(`  Required flags: 0x${analysis.requiredFlags.toString(16).toUpperCase()}`);
    console.log(`  Used opcodes: ${analysis.usedOpcodes.length}`);
    
    if (analysis.issues.length > 0) {
      console.log(`  Issues:`);
      analysis.issues.forEach(issue => console.log(`    ⚠️  ${issue}`));
    } else {
      console.log(`  ✅ No issues found`);
    }
    
    console.log(`  Recommendations:`);
    console.log(`    Basic:  0x${analysis.recommendations.basic.toString(16).toUpperCase()}`);
    console.log(`    Safe:   0x${analysis.recommendations.safe.toString(16).toUpperCase()}`);
    console.log(`    Strict: 0x${analysis.recommendations.strict.toString(16).toUpperCase()}`);
    
  } catch (error) {
    console.log(`  ❌ Error analyzing script: ${error.message}`);
  }
}

// Export functions and data
module.exports = {
  opcodeMap,
  OPCODE_CATEGORIES,
  getOpcodeInfo,
  getInterpreterFlags,
  analyzeScriptRequirements,
  createInterpreter,
  printOpcodeAnalysis
};