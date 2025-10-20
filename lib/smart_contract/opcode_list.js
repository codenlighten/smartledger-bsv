const bsv = require('../..')
const opcode = bsv.Opcode;
console.log('Opcode List:');
for (let key in opcode.map) {
  const code = opcode.map[key];
  console.log(`${key}: 0x${code.toString(16).padStart(2, '0')}`);
}

const Script = bsv.Script;
console.log(Script);
console.log('\nSample Script using OP_CHECKSIG and OP_RETURN:');
const script = new Script()
    .add(opcode.fromString('OP_DUP'))
    .add(opcode.fromString('OP_CHECKSIG'))
    .add(opcode.fromString('OP_RETURN'));
console.log(script.toASM());

//scriptToASM() - Convert script buffer to readable ASM
//    asmToScript() - Convert ASM string to script buffer
//     validateASM() - Check if ASM is valid Bitcoin Script
//    estimateScriptSize() - Predict script size in bytes
//    optimizeScript() - Remove redundant operations
//     compareScripts() - Check if two scripts are equivalent
//    explainScript() - Human-readable script explanation
//    scriptMetrics() - Analyze script complexity and costs

// 🔗 Conversion Utilities:
//    hexToASM() - Convert hex script to ASM
//    asmToHex() - Convert ASM to hex script
//    scriptToHex() - Convert script object to hex
