/**
 * opcode_map.js
 * --------------------------------------------------------------------
 * Comprehensive mapping of Bitcoin Script opcodes to JavaScript stack
 * manipulation functions. This enables writing covenant logic in JavaScript
 * and automatically generating the corresponding Bitcoin Script ASM and hex.
 *
 * Each entry provides:
 *  - code: hexadecimal opcode value
 *  - action: JavaScript function that simulates the opcode's stack behavior
 *  - description: Human-readable explanation of the operation
 *  - category: Functional grouping for organization
 */

// Helper functions for Bitcoin Script number encoding/decoding
const scriptNum = {
  encode: (num) => {
    if (num === 0) return Buffer.alloc(0);
    const negative = num < 0;
    const abs = Math.abs(num);
    const bytes = [];
    let temp = abs;
    while (temp > 0) {
      bytes.push(temp & 0xff);
      temp >>= 8;
    }
    if (bytes[bytes.length - 1] & 0x80) {
      bytes.push(negative ? 0x80 : 0);
    } else if (negative) {
      bytes[bytes.length - 1] |= 0x80;
    }
    return Buffer.from(bytes);
  },
  
  decode: (buf) => {
    if (buf.length === 0) return 0;
    const bytes = Array.from(buf);
    const negative = bytes[bytes.length - 1] & 0x80;
    if (negative) bytes[bytes.length - 1] &= 0x7f;
    let result = 0;
    for (let i = bytes.length - 1; i >= 0; i--) {
      result = (result << 8) + bytes[i];
    }
    return negative ? -result : result;
  }
};

const opcodeMap = {
  /* ==================== CONSTANTS AND PUSH DATA ==================== */
  OP_FALSE:        { 
    code: 0x00, 
    category: 'constants',
    description: 'Push empty array (false value)',
    action: s => s.push(Buffer.alloc(0)) 
  },
  OP_0:            { 
    code: 0x00, 
    category: 'constants',
    description: 'Push empty array (alias for OP_FALSE)',
    action: s => s.push(Buffer.alloc(0)) 
  },
  OP_PUSHDATA1:    { 
    code: 0x4c, 
    category: 'pushdata',
    description: 'Push next [1 byte] bytes of data',
    action: "Read next byte as length; push that many bytes" 
  },
  OP_PUSHDATA2:    { 
    code: 0x4d, 
    category: 'pushdata',
    description: 'Push next [2 bytes LE] bytes of data',
    action: "Read next 2 bytes as length; push that many bytes" 
  },
  OP_PUSHDATA4:    { 
    code: 0x4e, 
    category: 'pushdata',
    description: 'Push next [4 bytes LE] bytes of data',
    action: "Read next 4 bytes as length; push that many bytes" 
  },
  OP_1NEGATE:      { 
    code: 0x4f, 
    category: 'constants',
    description: 'Push number -1',
    action: s => s.push(scriptNum.encode(-1)) 
  },
  OP_RESERVED:     { 
    code: 0x50, 
    category: 'reserved',
    description: 'Reserved opcode (makes transaction invalid)',
    action: () => { throw new Error('OP_RESERVED encountered'); } 
  },
  OP_TRUE:         { 
    code: 0x51, 
    category: 'constants',
    description: 'Push number 1 (true value)',
    action: s => s.push(scriptNum.encode(1)) 
  },
  OP_1:            { 
    code: 0x51, 
    category: 'constants',
    description: 'Push number 1 (alias for OP_TRUE)',
    action: s => s.push(scriptNum.encode(1)) 
  },
  OP_2:            { 
    code: 0x52, 
    category: 'constants',
    description: 'Push number 2',
    action: s => s.push(scriptNum.encode(2)) 
  },
  OP_3:            { 
    code: 0x53, 
    category: 'constants',
    description: 'Push number 3',
    action: s => s.push(scriptNum.encode(3)) 
  },
  OP_4:            { 
    code: 0x54, 
    category: 'constants',
    description: 'Push number 4',
    action: s => s.push(scriptNum.encode(4)) 
  },
  OP_5:            { 
    code: 0x55, 
    category: 'constants',
    description: 'Push number 5',
    action: s => s.push(scriptNum.encode(5)) 
  },
  OP_6:            { 
    code: 0x56, 
    category: 'constants',
    description: 'Push number 6',
    action: s => s.push(scriptNum.encode(6)) 
  },
  OP_7:            { 
    code: 0x57, 
    category: 'constants',
    description: 'Push number 7',
    action: s => s.push(scriptNum.encode(7)) 
  },
  OP_8:            { 
    code: 0x58, 
    category: 'constants',
    description: 'Push number 8',
    action: s => s.push(scriptNum.encode(8)) 
  },
  OP_9:            { 
    code: 0x59, 
    category: 'constants',
    description: 'Push number 9',
    action: s => s.push(scriptNum.encode(9)) 
  },
  OP_10:           { 
    code: 0x5a, 
    category: 'constants',
    description: 'Push number 10',
    action: s => s.push(scriptNum.encode(10)) 
  },
  OP_11:           { 
    code: 0x5b, 
    category: 'constants',
    description: 'Push number 11',
    action: s => s.push(scriptNum.encode(11)) 
  },
  OP_12:           { 
    code: 0x5c, 
    category: 'constants',
    description: 'Push number 12',
    action: s => s.push(scriptNum.encode(12)) 
  },
  OP_13:           { 
    code: 0x5d, 
    category: 'constants',
    description: 'Push number 13',
    action: s => s.push(scriptNum.encode(13)) 
  },
  OP_14:           { 
    code: 0x5e, 
    category: 'constants',
    description: 'Push number 14',
    action: s => s.push(scriptNum.encode(14)) 
  },
  OP_15:           { 
    code: 0x5f, 
    category: 'constants',
    description: 'Push number 15',
    action: s => s.push(scriptNum.encode(15)) 
  },
  OP_16:           { 
    code: 0x60, 
    category: 'constants',
    description: 'Push number 16',
    action: s => s.push(scriptNum.encode(16)) 
  },

  /* ==================== FLOW CONTROL ==================== */
  OP_NOP:          { 
    code: 0x61, 
    category: 'flow_control',
    description: 'No operation (do nothing)',
    action: s => {} 
  },
  OP_VER:          { 
    code: 0x62, 
    category: 'flow_control',
    description: 'Push transaction version (disabled)',
    action: () => { throw new Error('OP_VER is disabled'); } 
  },
  OP_IF:           { 
    code: 0x63, 
    category: 'flow_control',
    description: 'Execute if top stack value is true',
    action: "// Conditional execution (requires parser state)" 
  },
  OP_NOTIF:        { 
    code: 0x64, 
    category: 'flow_control',
    description: 'Execute if top stack value is false',
    action: "// Conditional execution (requires parser state)" 
  },
  OP_VERIF:        { 
    code: 0x65, 
    category: 'flow_control',
    description: 'Conditional execution based on transaction version (disabled)',
    action: () => { throw new Error('OP_VERIF is disabled'); } 
  },
  OP_VERNOTIF:     { 
    code: 0x66, 
    category: 'flow_control',
    description: 'Conditional execution based on transaction version (disabled)',
    action: () => { throw new Error('OP_VERNOTIF is disabled'); } 
  },
  OP_ELSE:         { 
    code: 0x67, 
    category: 'flow_control',
    description: 'Else branch of conditional',
    action: "// Conditional execution (requires parser state)" 
  },
  OP_ENDIF:        { 
    code: 0x68, 
    category: 'flow_control',
    description: 'End conditional block',
    action: "// Conditional execution (requires parser state)" 
  },
  OP_VERIFY:       { 
    code: 0x69, 
    category: 'flow_control',
    description: 'Fail if top stack value is not true',
    action: s => { 
      const v = s.pop(); 
      if (!v || v.length === 0 || scriptNum.decode(v) === 0) {
        throw new Error('OP_VERIFY failed'); 
      }
    } 
  },
  OP_RETURN:       { 
    code: 0x6a, 
    category: 'flow_control',
    description: 'Terminate script execution immediately',
    action: () => { throw new Error('Script terminated by OP_RETURN'); } 
  },

  /* ==================== STACK MANIPULATION ==================== */
  OP_TOALTSTACK:   { 
    code: 0x6b, 
    category: 'stack',
    description: 'Move top item from main stack to alt stack',
    action: (s, a) => a.push(s.pop()) 
  },
  OP_FROMALTSTACK: { 
    code: 0x6c, 
    category: 'stack',
    description: 'Move top item from alt stack to main stack',
    action: (s, a) => s.push(a.pop()) 
  },
  OP_2DROP:        { 
    code: 0x6d, 
    category: 'stack',
    description: 'Remove top two stack items',
    action: s => { s.pop(); s.pop(); } 
  },
  OP_2DUP:         { 
    code: 0x6e, 
    category: 'stack',
    description: 'Duplicate top two stack items',
    action: s => { 
      const a = s[s.length - 1], b = s[s.length - 2]; 
      s.push(Buffer.from(b), Buffer.from(a)); 
    } 
  },
  OP_3DUP:         { 
    code: 0x6f, 
    category: 'stack',
    description: 'Duplicate top three stack items',
    action: s => { 
      const a = s[s.length - 1], b = s[s.length - 2], c = s[s.length - 3]; 
      s.push(Buffer.from(c), Buffer.from(b), Buffer.from(a)); 
    } 
  },
  OP_2OVER:        { 
    code: 0x70, 
    category: 'stack',
    description: 'Copy 3rd and 4th items to top',
    action: s => { 
      const c = s[s.length - 3], d = s[s.length - 4]; 
      s.push(Buffer.from(d), Buffer.from(c)); 
    } 
  },
  OP_2ROT:         { 
    code: 0x71, 
    category: 'stack',
    description: 'Move 5th and 6th items to top',
    action: s => { 
      const e = s.splice(-5, 1)[0], f = s.splice(-5, 1)[0]; 
      s.push(e, f); 
    } 
  },
  OP_2SWAP:        { 
    code: 0x72, 
    category: 'stack',
    description: 'Swap top two pairs of items',
    action: s => { 
      const a = s.pop(), b = s.pop(), c = s.pop(), d = s.pop(); 
      s.push(b, a, d, c); 
    } 
  },
  OP_IFDUP:        { 
    code: 0x73, 
    category: 'stack',
    description: 'Duplicate top item if it is not zero',
    action: s => { 
      const top = s[s.length - 1]; 
      if (top.length > 0 && scriptNum.decode(top) !== 0) s.push(Buffer.from(top)); 
    } 
  },
  OP_DEPTH:        { 
    code: 0x74, 
    category: 'stack',
    description: 'Push stack size as number',
    action: s => s.push(scriptNum.encode(s.length)) 
  },
  OP_DROP:         { 
    code: 0x75, 
    category: 'stack',
    description: 'Remove top stack item',
    action: s => s.pop() 
  },
  OP_DUP:          { 
    code: 0x76, 
    category: 'stack',
    description: 'Duplicate top stack item',
    action: s => s.push(Buffer.from(s[s.length - 1])) 
  },
  OP_NIP:          { 
    code: 0x77, 
    category: 'stack',
    description: 'Remove second-to-top item',
    action: s => { const top = s.pop(); s.pop(); s.push(top); } 
  },
  OP_OVER:         { 
    code: 0x78, 
    category: 'stack',
    description: 'Copy second-to-top item to top',
    action: s => s.push(Buffer.from(s[s.length - 2])) 
  },
  OP_PICK:         { 
    code: 0x79, 
    category: 'stack',
    description: 'Copy nth item to top (0-indexed from top)',
    action: s => { 
      const n = scriptNum.decode(s.pop()); 
      s.push(Buffer.from(s[s.length - 1 - n])); 
    } 
  },
  OP_ROLL:         { 
    code: 0x7a, 
    category: 'stack',
    description: 'Move nth item to top (0-indexed from top)',
    action: s => { 
      const n = scriptNum.decode(s.pop()); 
      const item = s.splice(s.length - 1 - n, 1)[0]; 
      s.push(item); 
    } 
  },
  OP_ROT:          { 
    code: 0x7b, 
    category: 'stack',
    description: 'Rotate top three items left',
    action: s => { 
      const a = s.pop(), b = s.pop(), c = s.pop(); 
      s.push(b, a, c); 
    } 
  },
  OP_SWAP:         { 
    code: 0x7c, 
    category: 'stack',
    description: 'Swap top two items',
    action: s => { 
      const a = s.pop(), b = s.pop(); 
      s.push(a, b); 
    } 
  },
  OP_TUCK:         { 
    code: 0x7d, 
    category: 'stack',
    description: 'Copy top item below second item',
    action: s => { 
      const a = s.pop(), b = s.pop(); 
      s.push(a, b, a); 
    } 
  },

  /* ==================== DATA MANIPULATION ==================== */
  OP_CAT:          { 
    code: 0x7e, 
    category: 'data',
    description: 'Concatenate top two items',
    action: s => { 
      const a = s.pop(), b = s.pop(); 
      s.push(Buffer.concat([b, a])); 
    } 
  },
  OP_SPLIT:        { 
    code: 0x7f, 
    category: 'data',
    description: 'Split item at position n',
    action: s => { 
      const n = scriptNum.decode(s.pop()), x = s.pop(); 
      s.push(x.slice(0, n), x.slice(n)); 
    } 
  },
  OP_NUM2BIN:      { 
    code: 0x80, 
    category: 'data',
    description: 'Convert number to byte sequence of length n',
    action: s => { 
      const len = scriptNum.decode(s.pop()), num = scriptNum.decode(s.pop());
      const result = Buffer.alloc(len);
      const encoded = scriptNum.encode(num);
      encoded.copy(result, 0, 0, Math.min(encoded.length, len));
      s.push(result); 
    } 
  },
  OP_BIN2NUM:      { 
    code: 0x81, 
    category: 'data',
    description: 'Convert byte sequence to number',
    action: s => { 
      const x = s.pop(); 
      s.push(scriptNum.encode(scriptNum.decode(x))); 
    } 
  },
  OP_SIZE:         { 
    code: 0x82, 
    category: 'data',
    description: 'Push size of top item (without removing item)',
    action: s => s.push(scriptNum.encode(s[s.length - 1].length)) 
  },

  /* ==================== BITWISE OPERATIONS ==================== */
  OP_INVERT:       { 
    code: 0x83, 
    category: 'bitwise',
    description: 'Bitwise NOT of top item',
    action: s => { 
      const x = s.pop(); 
      s.push(Buffer.from(x.map(b => ~b))); 
    } 
  },
  OP_AND:          { 
    code: 0x84, 
    category: 'bitwise',
    description: 'Bitwise AND of top two items',
    action: s => { 
      const a = s.pop(), b = s.pop(); 
      const maxLen = Math.max(a.length, b.length);
      const result = Buffer.alloc(maxLen);
      for (let i = 0; i < maxLen; i++) {
        result[i] = (a[i] || 0) & (b[i] || 0);
      }
      s.push(result); 
    } 
  },
  OP_OR:           { 
    code: 0x85, 
    category: 'bitwise',
    description: 'Bitwise OR of top two items',
    action: s => { 
      const a = s.pop(), b = s.pop(); 
      const maxLen = Math.max(a.length, b.length);
      const result = Buffer.alloc(maxLen);
      for (let i = 0; i < maxLen; i++) {
        result[i] = (a[i] || 0) | (b[i] || 0);
      }
      s.push(result); 
    } 
  },
  OP_XOR:          { 
    code: 0x86, 
    category: 'bitwise',
    description: 'Bitwise XOR of top two items',
    action: s => { 
      const a = s.pop(), b = s.pop(); 
      const maxLen = Math.max(a.length, b.length);
      const result = Buffer.alloc(maxLen);
      for (let i = 0; i < maxLen; i++) {
        result[i] = (a[i] || 0) ^ (b[i] || 0);
      }
      s.push(result); 
    } 
  },
  OP_EQUAL:        { 
    code: 0x87, 
    category: 'bitwise',
    description: 'Push 1 if top two items are equal, 0 otherwise',
    action: s => { 
      const a = s.pop(), b = s.pop(); 
      s.push(a.equals(b) ? scriptNum.encode(1) : scriptNum.encode(0)); 
    } 
  },
  OP_EQUALVERIFY:  { 
    code: 0x88, 
    category: 'bitwise',
    description: 'Fail if top two items are not equal',
    action: s => { 
      const a = s.pop(), b = s.pop(); 
      if (!a.equals(b)) throw new Error('OP_EQUALVERIFY failed'); 
    } 
  },

  /* ==================== ARITHMETIC ==================== */
  OP_1ADD:         { 
    code: 0x8b, 
    category: 'arithmetic',
    description: 'Add 1 to top item',
    action: s => { 
      const x = scriptNum.decode(s.pop()); 
      s.push(scriptNum.encode(x + 1)); 
    } 
  },
  OP_1SUB:         { 
    code: 0x8c, 
    category: 'arithmetic',
    description: 'Subtract 1 from top item',
    action: s => { 
      const x = scriptNum.decode(s.pop()); 
      s.push(scriptNum.encode(x - 1)); 
    } 
  },
  OP_2MUL:         { 
    code: 0x8d, 
    category: 'arithmetic',
    description: 'Multiply top item by 2 (disabled)',
    action: () => { throw new Error('OP_2MUL is disabled'); } 
  },
  OP_2DIV:         { 
    code: 0x8e, 
    category: 'arithmetic',
    description: 'Divide top item by 2 (disabled)',
    action: () => { throw new Error('OP_2DIV is disabled'); } 
  },
  OP_NEGATE:       { 
    code: 0x8f, 
    category: 'arithmetic',
    description: 'Negate top item',
    action: s => { 
      const x = scriptNum.decode(s.pop()); 
      s.push(scriptNum.encode(-x)); 
    } 
  },
  OP_ABS:          { 
    code: 0x90, 
    category: 'arithmetic',
    description: 'Absolute value of top item',
    action: s => { 
      const x = scriptNum.decode(s.pop()); 
      s.push(scriptNum.encode(Math.abs(x))); 
    } 
  },
  OP_NOT:          { 
    code: 0x91, 
    category: 'arithmetic',
    description: 'Logical NOT (0→1, non-zero→0)',
    action: s => { 
      const x = scriptNum.decode(s.pop()); 
      s.push(scriptNum.encode(x === 0 ? 1 : 0)); 
    } 
  },
  OP_0NOTEQUAL:    { 
    code: 0x92, 
    category: 'arithmetic',
    description: 'Push 1 if top item is not zero, 0 otherwise',
    action: s => { 
      const x = scriptNum.decode(s.pop()); 
      s.push(scriptNum.encode(x !== 0 ? 1 : 0)); 
    } 
  },
  OP_ADD:          { 
    code: 0x93, 
    category: 'arithmetic',
    description: 'Add top two items',
    action: s => { 
      const a = scriptNum.decode(s.pop()), b = scriptNum.decode(s.pop()); 
      s.push(scriptNum.encode(b + a)); 
    } 
  },
  OP_SUB:          { 
    code: 0x94, 
    category: 'arithmetic',
    description: 'Subtract: second - first',
    action: s => { 
      const a = scriptNum.decode(s.pop()), b = scriptNum.decode(s.pop()); 
      s.push(scriptNum.encode(b - a)); 
    } 
  },
  OP_MUL:          { 
    code: 0x95, 
    category: 'arithmetic',
    description: 'Multiply top two items',
    action: s => { 
      const a = scriptNum.decode(s.pop()), b = scriptNum.decode(s.pop()); 
      s.push(scriptNum.encode(b * a)); 
    } 
  },
  OP_DIV:          { 
    code: 0x96, 
    category: 'arithmetic',
    description: 'Divide: second / first',
    action: s => { 
      const a = scriptNum.decode(s.pop()), b = scriptNum.decode(s.pop()); 
      if (a === 0) throw new Error('Division by zero');
      s.push(scriptNum.encode(Math.floor(b / a))); 
    } 
  },
  OP_MOD:          { 
    code: 0x97, 
    category: 'arithmetic',
    description: 'Modulo: second % first',
    action: s => { 
      const a = scriptNum.decode(s.pop()), b = scriptNum.decode(s.pop()); 
      if (a === 0) throw new Error('Division by zero');
      s.push(scriptNum.encode(b % a)); 
    } 
  },
  OP_LSHIFT:       { 
    code: 0x98, 
    category: 'arithmetic',
    description: 'Left shift: second << first',
    action: s => { 
      const n = scriptNum.decode(s.pop()), x = scriptNum.decode(s.pop()); 
      s.push(scriptNum.encode(x << n)); 
    } 
  },
  OP_RSHIFT:       { 
    code: 0x99, 
    category: 'arithmetic',
    description: 'Right shift: second >> first',
    action: s => { 
      const n = scriptNum.decode(s.pop()), x = scriptNum.decode(s.pop()); 
      s.push(scriptNum.encode(x >> n)); 
    } 
  },
  OP_BOOLAND:      { 
    code: 0x9a, 
    category: 'arithmetic',
    description: 'Boolean AND: 1 if both non-zero, 0 otherwise',
    action: s => { 
      const a = scriptNum.decode(s.pop()), b = scriptNum.decode(s.pop()); 
      s.push(scriptNum.encode((a !== 0 && b !== 0) ? 1 : 0)); 
    } 
  },
  OP_BOOLOR:       { 
    code: 0x9b, 
    category: 'arithmetic',
    description: 'Boolean OR: 1 if either non-zero, 0 otherwise',
    action: s => { 
      const a = scriptNum.decode(s.pop()), b = scriptNum.decode(s.pop()); 
      s.push(scriptNum.encode((a !== 0 || b !== 0) ? 1 : 0)); 
    } 
  },
  OP_NUMEQUAL:     { 
    code: 0x9c, 
    category: 'arithmetic',
    description: 'Push 1 if numbers are equal, 0 otherwise',
    action: s => { 
      const a = scriptNum.decode(s.pop()), b = scriptNum.decode(s.pop()); 
      s.push(scriptNum.encode(a === b ? 1 : 0)); 
    } 
  },
  OP_NUMEQUALVERIFY: { 
    code: 0x9d, 
    category: 'arithmetic',
    description: 'Fail if numbers are not equal',
    action: s => { 
      const a = scriptNum.decode(s.pop()), b = scriptNum.decode(s.pop()); 
      if (a !== b) throw new Error('OP_NUMEQUALVERIFY failed'); 
    } 
  },
  OP_NUMNOTEQUAL:  { 
    code: 0x9e, 
    category: 'arithmetic',
    description: 'Push 1 if numbers are not equal, 0 otherwise',
    action: s => { 
      const a = scriptNum.decode(s.pop()), b = scriptNum.decode(s.pop()); 
      s.push(scriptNum.encode(a !== b ? 1 : 0)); 
    } 
  },
  OP_LESSTHAN:     { 
    code: 0x9f, 
    category: 'arithmetic',
    description: 'Push 1 if second < first, 0 otherwise',
    action: s => { 
      const a = scriptNum.decode(s.pop()), b = scriptNum.decode(s.pop()); 
      s.push(scriptNum.encode(b < a ? 1 : 0)); 
    } 
  },
  OP_GREATERTHAN:  { 
    code: 0xa0, 
    category: 'arithmetic',
    description: 'Push 1 if second > first, 0 otherwise',
    action: s => { 
      const a = scriptNum.decode(s.pop()), b = scriptNum.decode(s.pop()); 
      s.push(scriptNum.encode(b > a ? 1 : 0)); 
    } 
  },
  OP_LESSTHANOREQUAL: { 
    code: 0xa1, 
    category: 'arithmetic',
    description: 'Push 1 if second <= first, 0 otherwise',
    action: s => { 
      const a = scriptNum.decode(s.pop()), b = scriptNum.decode(s.pop()); 
      s.push(scriptNum.encode(b <= a ? 1 : 0)); 
    } 
  },
  OP_GREATERTHANOREQUAL: { 
    code: 0xa2, 
    category: 'arithmetic',
    description: 'Push 1 if second >= first, 0 otherwise',
    action: s => { 
      const a = scriptNum.decode(s.pop()), b = scriptNum.decode(s.pop()); 
      s.push(scriptNum.encode(b >= a ? 1 : 0)); 
    } 
  },
  OP_MIN:          { 
    code: 0xa3, 
    category: 'arithmetic',
    description: 'Push smaller of top two numbers',
    action: s => { 
      const a = scriptNum.decode(s.pop()), b = scriptNum.decode(s.pop()); 
      s.push(scriptNum.encode(Math.min(a, b))); 
    } 
  },
  OP_MAX:          { 
    code: 0xa4, 
    category: 'arithmetic',
    description: 'Push larger of top two numbers',
    action: s => { 
      const a = scriptNum.decode(s.pop()), b = scriptNum.decode(s.pop()); 
      s.push(scriptNum.encode(Math.max(a, b))); 
    } 
  },
  OP_WITHIN:       { 
    code: 0xa5, 
    category: 'arithmetic',
    description: 'Push 1 if x is within [min, max), 0 otherwise',
    action: s => { 
      const max = scriptNum.decode(s.pop()), min = scriptNum.decode(s.pop()), x = scriptNum.decode(s.pop()); 
      s.push(scriptNum.encode((x >= min && x < max) ? 1 : 0)); 
    } 
  },

  /* ==================== CRYPTOGRAPHIC OPERATIONS ==================== */
  OP_RIPEMD160:    { 
    code: 0xa6, 
    category: 'crypto',
    description: 'RIPEMD-160 hash of top item',
    action: s => { 
      const crypto = require("crypto"); 
      const hash = crypto.createHash("ripemd160").update(s.pop()).digest(); 
      s.push(hash); 
    } 
  },
  OP_SHA1:         { 
    code: 0xa7, 
    category: 'crypto',
    description: 'SHA-1 hash of top item',
    action: s => { 
      const crypto = require("crypto"); 
      const hash = crypto.createHash("sha1").update(s.pop()).digest(); 
      s.push(hash); 
    } 
  },
  OP_SHA256:       { 
    code: 0xa8, 
    category: 'crypto',
    description: 'SHA-256 hash of top item',
    action: s => { 
      const crypto = require("crypto"); 
      const hash = crypto.createHash("sha256").update(s.pop()).digest(); 
      s.push(hash); 
    } 
  },
  OP_HASH160:      { 
    code: 0xa9, 
    category: 'crypto',
    description: 'SHA-256 then RIPEMD-160 hash of top item',
    action: s => { 
      const crypto = require("crypto"); 
      const sha256 = crypto.createHash("sha256").update(s.pop()).digest(); 
      const hash160 = crypto.createHash("ripemd160").update(sha256).digest(); 
      s.push(hash160); 
    } 
  },
  OP_HASH256:      { 
    code: 0xaa, 
    category: 'crypto',
    description: 'Double SHA-256 hash of top item',
    action: s => { 
      const crypto = require("crypto"); 
      const firstHash = crypto.createHash("sha256").update(s.pop()).digest(); 
      const doubleHash = crypto.createHash("sha256").update(firstHash).digest(); 
      s.push(doubleHash); 
    } 
  },
  OP_CODESEPARATOR: { 
    code: 0xab, 
    category: 'crypto',
    description: 'Mark signature checking boundary',
    action: s => {} 
  },
  OP_CHECKSIG:     { 
    code: 0xac, 
    category: 'crypto',
    description: 'Verify signature against public key',
    action: "// Signature verification (requires transaction context)" 
  },
  OP_CHECKSIGVERIFY: { 
    code: 0xad, 
    category: 'crypto',
    description: 'Verify signature, then fail if invalid',
    action: "// Signature verification with VERIFY (requires transaction context)" 
  },
  OP_CHECKMULTISIG: { 
    code: 0xae, 
    category: 'crypto',
    description: 'Verify multiple signatures against public keys',
    action: "// Multi-signature verification (requires transaction context)" 
  },
  OP_CHECKMULTISIGVERIFY: { 
    code: 0xaf, 
    category: 'crypto',
    description: 'Verify multiple signatures, then fail if invalid',
    action: "// Multi-signature verification with VERIFY (requires transaction context)" 
  },

  /* ==================== STRING OPERATIONS ==================== */
  OP_SUBSTR:       { 
    code: 0xb3, 
    category: 'string',
    description: 'Extract substring: string[start:start+length]',
    action: s => { 
      const length = scriptNum.decode(s.pop()), start = scriptNum.decode(s.pop()), str = s.pop(); 
      s.push(str.slice(start, start + length)); 
    } 
  },
  OP_LEFT:         { 
    code: 0xb4, 
    category: 'string',
    description: 'Extract leftmost n bytes',
    action: s => { 
      const n = scriptNum.decode(s.pop()), str = s.pop(); 
      s.push(str.slice(0, n)); 
    } 
  },
  OP_RIGHT:        { 
    code: 0xb5, 
    category: 'string',
    description: 'Extract rightmost n bytes',
    action: s => { 
      const n = scriptNum.decode(s.pop()), str = s.pop(); 
      s.push(str.slice(-n)); 
    } 
  },

  /* ==================== NOP OPERATIONS ==================== */
  OP_NOP1:         { 
    code: 0xb0, 
    category: 'nop',
    description: 'No operation (reserved for future use)',
    action: s => {} 
  },
  OP_NOP2:         { 
    code: 0xb1, 
    category: 'nop',
    description: 'No operation (formerly CHECKLOCKTIMEVERIFY)',
    action: s => {} 
  },
  OP_NOP3:         { 
    code: 0xb2, 
    category: 'nop',
    description: 'No operation (formerly CHECKSEQUENCEVERIFY)',
    action: s => {} 
  },
  OP_NOP4:         { 
    code: 0xb6, 
    category: 'nop',
    description: 'No operation (reserved for future use)',
    action: s => {} 
  },
  OP_NOP5:         { 
    code: 0xb7, 
    category: 'nop',
    description: 'No operation (reserved for future use)',
    action: s => {} 
  },
  OP_NOP6:         { 
    code: 0xb8, 
    category: 'nop',
    description: 'No operation (reserved for future use)',
    action: s => {} 
  },
  OP_NOP7:         { 
    code: 0xb9, 
    category: 'nop',
    description: 'No operation (reserved for future use)',
    action: s => {} 
  },
  OP_NOP8:         { 
    code: 0xba, 
    category: 'nop',
    description: 'No operation (reserved for future use)',
    action: s => {} 
  },
  OP_NOP9:         { 
    code: 0xbb, 
    category: 'nop',
    description: 'No operation (reserved for future use)',
    action: s => {} 
  },
  OP_NOP10:        { 
    code: 0xbc, 
    category: 'nop',
    description: 'No operation (reserved for future use)',
    action: s => {} 
  },

  /* ==================== RESERVED/DISABLED OPERATIONS ==================== */
  OP_RESERVED1:    { 
    code: 0x89, 
    category: 'reserved',
    description: 'Reserved opcode (makes transaction invalid)',
    action: () => { throw new Error('OP_RESERVED1 encountered'); } 
  },
  OP_RESERVED2:    { 
    code: 0x8a, 
    category: 'reserved',
    description: 'Reserved opcode (makes transaction invalid)',
    action: () => { throw new Error('OP_RESERVED2 encountered'); } 
  },
  OP_CHECKLOCKTIMEVERIFY: { 
    code: 0xb1, 
    category: 'disabled',
    description: 'Check locktime (disabled post-Genesis)',
    action: s => {} 
  },
  OP_CHECKSEQUENCEVERIFY: { 
    code: 0xb2, 
    category: 'disabled',
    description: 'Check sequence (disabled post-Genesis)',
    action: s => {} 
  },

  /* ==================== PSEUDO OPERATIONS ==================== */
  OP_PUBKEYHASH:   { 
    code: 0xfd, 
    category: 'pseudo',
    description: 'Template matching: public key hash',
    action: "// Template matching only" 
  },
  OP_PUBKEY:       { 
    code: 0xfe, 
    category: 'pseudo',
    description: 'Template matching: public key',
    action: "// Template matching only" 
  },
  OP_INVALIDOPCODE: { 
    code: 0xff, 
    category: 'pseudo',
    description: 'Invalid opcode placeholder',
    action: () => { throw new Error('Invalid opcode encountered'); } 
  }
};

// Utility functions for working with the opcode map
const utils = {
  // Get opcodes by category
  getByCategory: (category) => {
    return Object.entries(opcodeMap)
      .filter(([name, op]) => op.category === category)
      .reduce((acc, [name, op]) => ({ ...acc, [name]: op }), {});
  },

  // Get all categories
  getCategories: () => {
    const categories = new Set();
    Object.values(opcodeMap).forEach(op => categories.add(op.category));
    return Array.from(categories).sort();
  },

  // Create ASM from JavaScript operations
  createASM: (operations) => {
    const asm = [];
    operations.forEach(op => {
      if (typeof op === 'string' && opcodeMap[op]) {
        asm.push(op);
      } else if (typeof op === 'number') {
        // Convert number to appropriate opcode or push data
        if (op >= 1 && op <= 16) {
          asm.push(`OP_${op}`);
        } else if (op === 0) {
          asm.push('OP_0');
        } else if (op === -1) {
          asm.push('OP_1NEGATE');
        } else {
          // For larger numbers, we need to push the encoded bytes
          const encoded = scriptNum.encode(op);
          asm.push(encoded.toString('hex'));
        }
      } else if (Buffer.isBuffer(op)) {
        // Push buffer data
        asm.push(op.toString('hex'));
      } else {
        throw new Error(`Invalid operation: ${op}`);
      }
    });
    return asm.join(' ');
  },

  // Simulate script execution with JavaScript
  simulate: (operations, initialStack = []) => {
    const stack = [...initialStack];
    const altStack = [];
    const history = [];

    operations.forEach((opName, index) => {
      if (!opcodeMap[opName]) {
        throw new Error(`Unknown opcode: ${opName}`);
      }

      const opcode = opcodeMap[opName];
      const beforeStack = [...stack];
      
      if (typeof opcode.action === 'function') {
        try {
          opcode.action(stack, altStack);
          history.push({
            step: index + 1,
            opcode: opName,
            beforeStack: beforeStack.map(b => b.toString('hex')),
            afterStack: stack.map(b => b.toString('hex')),
            description: opcode.description
          });
        } catch (error) {
          history.push({
            step: index + 1,
            opcode: opName,
            beforeStack: beforeStack.map(b => b.toString('hex')),
            afterStack: [],
            error: error.message,
            description: opcode.description
          });
          throw error;
        }
      } else {
        // String descriptions for complex opcodes
        history.push({
          step: index + 1,
          opcode: opName,
          beforeStack: beforeStack.map(b => b.toString('hex')),
          afterStack: beforeStack.map(b => b.toString('hex')),
          note: opcode.action,
          description: opcode.description
        });
      }
    });

    return {
      finalStack: stack.map(b => b.toString('hex')),
      finalAltStack: altStack.map(b => b.toString('hex')),
      history
    };
  },

  // Convert hex opcode to name
  opcodeToName: (code) => {
    const name = Object.entries(opcodeMap).find(([name, op]) => op.code === code);
    return name ? name[0] : `UNKNOWN_${code.toString(16).padStart(2, '0')}`;
  },

  // Convert name to hex opcode
  nameToOpcode: (name) => {
    return opcodeMap[name] && opcodeMap[name].code;
  },

  // Generate covenant template
  generateCovenantTemplate: (fieldName, expectedValue) => {
    // This generates a basic field extraction and comparison template
    const operations = [];
    
    // For preimage field extraction (example for 'value' field)
    if (fieldName === 'value') {
      operations.push('OP_SIZE');      // Get preimage size
      operations.push(52);             // Push 52 (bytes to subtract)
      operations.push('OP_SUB');       // Calculate split position
      operations.push('OP_SPLIT');     // Split preimage
      operations.push('OP_DROP');      // Drop left part
      operations.push(8);              // Push 8 (value field length)
      operations.push('OP_SPLIT');     // Split to get value field
      operations.push('OP_DROP');      // Drop remaining
    }
    
    // Add expected value and comparison
    if (expectedValue) {
      operations.push(Buffer.from(expectedValue, 'hex'));
      operations.push('OP_EQUAL');
    }
    
    return {
      operations,
      asm: utils.createASM(operations),
      description: `Extract ${fieldName} field and compare with expected value`
    };
  }
};

module.exports = {
  opcodeMap,
  scriptNum,
  utils
};

// CLI test and demonstration
if (require.main === module) {
  console.log("🔧 Comprehensive Bitcoin Script Opcode Map");
  console.log("==========================================");
  console.log(`Total opcodes mapped: ${Object.keys(opcodeMap).length}`);
  
  console.log("\n📊 Categories:");
  utils.getCategories().forEach(category => {
    const count = Object.values(opcodeMap).filter(op => op.category === category).length;
    console.log(`  ${category}: ${count} opcodes`);
  });

  console.log("\n🧪 Example: Stack manipulation simulation");
  try {
    const operations = ['OP_1', 'OP_2', 'OP_ADD', 'OP_3', 'OP_EQUAL'];
    const result = utils.simulate(operations);
    console.log("Operations:", operations.join(' '));
    console.log("Final stack:", result.finalStack);
    console.log("Expected: ['01'] (true, since 1+2=3)");
    
    console.log("\n📝 Step-by-step execution:");
    result.history.forEach(step => {
      console.log(`  ${step.step}. ${step.opcode}: ${step.description}`);
      console.log(`     Stack: [${step.beforeStack.join(', ')}] → [${step.afterStack.join(', ')}]`);
    });
  } catch (error) {
    console.log("❌ Simulation error:", error.message);
  }

  console.log("\n🎯 Example: Covenant template generation");
  const template = utils.generateCovenantTemplate('value', '50c3000000000000');
  console.log("Generated ASM:", template.asm);
  console.log("Description:", template.description);
}
