const SmartContract = require('./lib/smart_contract');

console.log('🔧 Testing ScriptTester with Simple Scripts');
console.log('='.repeat(50));

// Test 1: Simple unlock/lock that should pass
console.log('\n📋 Test 1: Simple Pass Case');
console.log('Unlocking: OP_1');
console.log('Locking: OP_1 OP_EQUAL');

const test1 = SmartContract.testScript('OP_1', 'OP_1 OP_EQUAL');
console.log('Result:', test1.success ? '✅ PASS' : '❌ FAIL');
if (!test1.success && test1.error) {
  console.log('Error:', test1.error);
}

// Test 2: Simple unlock/lock that should fail  
console.log('\n📋 Test 2: Simple Fail Case');
console.log('Unlocking: OP_1');
console.log('Locking: OP_2 OP_EQUAL');

const test2 = SmartContract.testScript('OP_1', 'OP_2 OP_EQUAL');
console.log('Result:', test2.success ? '✅ PASS' : '❌ FAIL');
if (!test2.success && test2.error) {
  console.log('Error:', test2.error);
}

// Test 3: Number comparison with hex
console.log('\n📋 Test 3: Number Comparison (Hex)');
console.log('Unlocking: 2a');  // 42 in hex
console.log('Locking: 2a OP_EQUAL');

const test3 = SmartContract.testScript('2a', '2a OP_EQUAL');
console.log('Result:', test3.success ? '✅ PASS' : '❌ FAIL');
if (!test3.success && test3.error) {
  console.log('Error:', test3.error);
}

// Test 4: Math operation with opcodes
console.log('\n📋 Test 4: Math Operation (Opcodes)');
console.log('Unlocking: OP_5 OP_3');
console.log('Locking: OP_ADD OP_8 OP_EQUAL');

const test4 = SmartContract.testScript('OP_5 OP_3', 'OP_ADD OP_8 OP_EQUAL');
console.log('Result:', test4.success ? '✅ PASS' : '❌ FAIL');
if (!test4.success && test4.error) {
  console.log('Error:', test4.error);
}

// Test 5: Stack manipulation
console.log('\n📋 Test 5: Stack Manipulation');
console.log('Unlocking: OP_1 OP_2');
console.log('Locking: OP_SWAP OP_1 OP_EQUAL');

const test5 = SmartContract.testScript('OP_1 OP_2', 'OP_SWAP OP_1 OP_EQUAL');
console.log('Result:', test5.success ? '✅ PASS' : '❌ FAIL');
if (!test5.success && test5.error) {
  console.log('Error:', test5.error);
}

// Test 6: Just true
console.log('\n📋 Test 6: Always True');
console.log('Unlocking: (empty)');
console.log('Locking: OP_TRUE');

const test6 = SmartContract.testScript('', 'OP_TRUE');
console.log('Result:', test6.success ? '✅ PASS' : '❌ FAIL');
if (!test6.success && test6.error) {
  console.log('Error:', test6.error);
}

console.log('\n' + '='.repeat(50));
console.log('✅ Simple script testing complete!');