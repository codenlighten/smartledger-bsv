const SmartContract = require('./lib/smart_contract');

console.log('🔍 Debugging Failed Tests');
console.log('='.repeat(50));

try {
  // Create test environment
  const testEnv = SmartContract.createTestEnvironment();
  const preimageHex = testEnv.getPreimage();
  
  console.log('✅ Test environment created');
  console.log('Preimage length:', preimageHex.length / 2, 'bytes');
  console.log('Preimage preview:', preimageHex.slice(0, 32) + '...');
  
  // Test field extraction directly first
  console.log('\n📋 Testing direct field extraction...');
  const fieldData = testEnv.extractField('value');
  console.log('Field data:', fieldData ? 'SUCCESS' : 'FAILED');
  
  if (fieldData) {
    console.log('Field value:', fieldData.value);
    console.log('Field strategy:', fieldData.strategy);
    console.log('Field interpretation:', fieldData.interpretation);
  }
  
  // Now test with ScriptTester
  console.log('\n📋 Testing ScriptTester field extraction...');
  const fieldTest = SmartContract.testFieldExtraction(preimageHex, 'value');
  console.log('ScriptTester result:', fieldTest.success ? 'PASS' : 'FAIL');
  
  if (!fieldTest.success) {
    console.log('❌ Error:', fieldTest.error);
    if (fieldTest.fieldExtraction && fieldTest.fieldExtraction.error) {
      console.log('❌ Field extraction error:', fieldTest.fieldExtraction.error);
    }
  } else {
    console.log('✅ Field extraction details:', fieldTest.fieldExtraction);
    console.log('✅ Cleaned ASM:', fieldTest.fieldExtraction.cleanedASM);
  }
  
  // Test covenant separately
  console.log('\n📋 Testing covenant...');
  const covenantTest = SmartContract.testCovenant(preimageHex, { minimumAmount: 25000 });
  console.log('Covenant result:', covenantTest.success ? 'PASS' : 'FAIL');
  
  if (!covenantTest.success) {
    console.log('❌ Covenant error:', covenantTest.error);
    console.log('❌ Covenant details:', covenantTest.covenant);
  }
  
} catch (error) {
  console.log('❌ Debug error:', error.message);
  console.log('Stack:', error.stack);
}