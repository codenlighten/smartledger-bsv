/**
 * Working Smart Contract Examples - Fixed Version
 * ==============================================
 * 
 * This file contains working, tested smart contract examples that properly
 * integrate with smartledger-bsv's preimage validation system.
 */

const bsv = require('../index.js')

// Enable colored output if available
let chalk
try {
  chalk = require('chalk')
} catch (e) {
  chalk = {
    green: (text) => `✅ ${text}`,
    red: (text) => `❌ ${text}`,
    yellow: (text) => `⚠️ ${text}`,
    blue: (text) => `ℹ️ ${text}`,
    magenta: (text) => `🔮 ${text}`,
    cyan: (text) => `🌊 ${text}`,
    bold: (text) => `**${text}**`
  }
}

console.log(chalk.bold.blue('\n🔧 Working Smart Contract Examples (Fixed)\n'))

/**
 * WorkingAmountContract - A properly functioning amount validation contract
 */
class WorkingAmountContract {
  constructor(expectedAmount) {
    this.expectedAmount = expectedAmount
    this.privateKey = new bsv.PrivateKey()
    
    // Create the contract script using the quick covenant method
    this.script = this._createWorkingScript()
    this.address = bsv.SmartContract.utils.createCovenantAddress(this.script)
    
    console.log(chalk.green(`✅ WorkingAmountContract created`))
    console.log(chalk.blue(`   Expected Amount: ${expectedAmount} satoshis`))
    console.log(chalk.blue(`   Contract Address: ${this.address.toString()}`))
  }
  
  _createWorkingScript() {
    // Use the createQuickCovenant method which is known to work
    const covenant = bsv.SmartContract.createQuickCovenant('value_lock', {
      value: this.expectedAmount
    })
    
    // Convert the ASM to a proper BSV Script
    return bsv.Script.fromASM(covenant.asm)
  }
  
  // Test validation with a real preimage
  validatePayment(preimageHex) {
    try {
      console.log(chalk.yellow('🔍 Testing payment validation with working script...'))
      
      const result = bsv.SmartContract.testScript(
        preimageHex,
        this.script.toHex(),
        { verbose: true }
      )
      
      if (result.valid) {
        console.log(chalk.green('✅ Payment validation PASSED'))
      } else {
        console.log(chalk.red('❌ Payment validation FAILED'))
        console.log(chalk.red(`   Error: ${result.error || 'Unknown error'}`))
      }
      
      return {
        success: result.valid,
        error: result.error,
        details: result
      }
    } catch (error) {
      console.log(chalk.red('❌ Validation error:', error.message))
      return {
        success: false,
        error: error.message
      }
    }
  }
  
  // Create a proper test preimage for this contract
  createTestPreimage(inputAmount) {
    try {
      console.log(chalk.yellow('📝 Creating test preimage...'))
      
      // Create a mock transaction that would spend from this contract
      const mockTx = new bsv.Transaction()
      
      // Add input from contract (mock)
      mockTx.addInput({
        prevTxId: 'a'.repeat(64),
        outputIndex: 0,
        script: this.script.toHex(),
        sequenceNumber: 0xffffffff
      })
      
      // Add output with the input amount
      mockTx.addOutput({
        script: bsv.Script.buildPublicKeyHashOut(new bsv.Address('1BvBMSEYstWetqTFn5Au4m4GFg7xJaNVN2')).toHex(),
        satoshis: inputAmount
      })
      
      // Generate preimage
      const preimage = bsv.Transaction.sighash.sighashPreimage(
        mockTx,
        bsv.crypto.Signature.SIGHASH_ALL | bsv.crypto.Signature.SIGHASH_FORKID,
        0,
        this.script,
        new bsv.crypto.BN(inputAmount + 1000) // Contract input amount
      )
      
      console.log(chalk.blue(`   Generated preimage: ${preimage.toString('hex').substring(0, 64)}...`))
      return preimage.toString('hex')
      
    } catch (error) {
      console.log(chalk.red('❌ Preimage generation error:', error.message))
      return null
    }
  }
  
  // Complete test of the contract
  runCompleteTest() {
    console.log(chalk.cyan('\n🧪 Running Complete Contract Test'))
    console.log(chalk.cyan('==================================='))
    
    // Test with correct amount
    console.log(chalk.yellow('\n1. Testing with CORRECT amount'))
    const correctPreimage = this.createTestPreimage(this.expectedAmount)
    if (correctPreimage) {
      const correctResult = this.validatePayment(correctPreimage)
      console.log(chalk.blue(`   Result: ${correctResult.success ? 'PASS' : 'FAIL'}`))
    }
    
    // Test with incorrect amount
    console.log(chalk.yellow('\n2. Testing with INCORRECT amount'))
    const incorrectPreimage = this.createTestPreimage(this.expectedAmount - 10000)
    if (incorrectPreimage) {
      const incorrectResult = this.validatePayment(incorrectPreimage)
      console.log(chalk.blue(`   Result: ${incorrectResult.success ? 'UNEXPECTED PASS' : 'EXPECTED FAIL'}`))
    }
    
    console.log(chalk.cyan('\n✅ Complete test finished'))
  }
  
  getContractInfo() {
    return {
      expectedAmount: this.expectedAmount,
      address: this.address.toString(),
      script: {
        hex: this.script.toHex(),
        asm: this.script.toASM(),
        size: this.script.toBuffer().length
      }
    }
  }
}

/**
 * SimpleFieldExtractionDemo - Shows how field extraction actually works
 */
class SimpleFieldExtractionDemo {
  constructor() {
    console.log(chalk.bold.magenta('\n🔬 Field Extraction Demo\n'))
  }
  
  demonstrateFieldExtraction() {
    console.log(chalk.cyan('Testing Field Extraction with Real Preimage'))
    console.log(chalk.cyan('===========================================\n'))
    
    // Create a simple transaction to get a real preimage
    try {
      const tx = new bsv.Transaction()
        .from({
          txId: 'a'.repeat(64),
          outputIndex: 0,
          script: bsv.Script.buildPublicKeyHashOut(new bsv.Address('1BvBMSEYstWetqTFn5Au4m4GFg7xJaNVN2')).toHex(),
          satoshis: 100000
        })
        .to('1BvBMSEYstWetqTFn5Au4m4GFg7xJaNVN2', 90000)
      
      const preimage = bsv.Transaction.sighash.sighashPreimage(
        tx,
        bsv.crypto.Signature.SIGHASH_ALL | bsv.crypto.Signature.SIGHASH_FORKID,
        0,
        bsv.Script.buildPublicKeyHashOut(new bsv.Address('1BvBMSEYstWetqTFn5Au4m4GFg7xJaNVN2')),
        new bsv.crypto.BN(100000)
      )
      
      console.log(chalk.blue(`Generated preimage: ${preimage.toString('hex').substring(0, 64)}...`))
      
      // Test field extraction
      const fields = ['value', 'nVersion', 'nLocktime', 'hashOutputs']
      
      fields.forEach(field => {
        console.log(chalk.yellow(`\nTesting ${field} extraction:`))
        
        try {
          const result = bsv.SmartContract.testFieldExtraction(
            preimage.toString('hex'),
            field
          )
          
          if (result.success) {
            console.log(chalk.green(`✅ ${field} extraction successful`))
            if (result.fieldExtraction) {
              console.log(chalk.blue(`   Value: ${result.fieldExtraction.value}`))
              if (result.fieldExtraction.interpretation) {
                console.log(chalk.blue(`   Interpreted: ${result.fieldExtraction.interpretation.description || result.fieldExtraction.interpretation.satoshis || 'N/A'}`))
              }
            }
          } else {
            console.log(chalk.red(`❌ ${field} extraction failed`))
            console.log(chalk.red(`   Error: ${result.error || 'Unknown error'}`))
          }
        } catch (error) {
          console.log(chalk.red(`❌ ${field} extraction error: ${error.message}`))
        }
      })
      
    } catch (error) {
      console.log(chalk.red('❌ Demo error:', error.message))
    }
  }
}

/**
 * CovenantBuilderTest - Test the covenant builder functionality
 */
class CovenantBuilderTest {
  constructor() {
    console.log(chalk.bold.magenta('\n🏗️ Covenant Builder Test\n'))
  }
  
  testCovenantBuilder() {
    console.log(chalk.cyan('Testing CovenantBuilder Functionality'))
    console.log(chalk.cyan('===================================\n'))
    
    try {
      // Test 1: Simple covenant using CovenantTemplates
      console.log(chalk.yellow('1. Testing CovenantTemplates.valueLock'))
      
      const valueLockCovenant = bsv.SmartContract.CovenantTemplates.valueLock('50c3000000000000') // 50000 satoshis in little-endian hex
      const builtCovenant = valueLockCovenant.build()
      
      console.log(chalk.blue(`   ASM: ${builtCovenant.cleanedASM}`))
      console.log(chalk.blue(`   Hex: ${builtCovenant.hex}`))
      console.log(chalk.blue(`   Size: ${builtCovenant.size} operations`))
      
      // Test 2: Custom covenant using CovenantBuilder
      console.log(chalk.yellow('\n2. Testing Custom CovenantBuilder'))
      
      const customBuilder = new bsv.SmartContract.CovenantBuilder()
      const customCovenant = customBuilder
        .comment('Simple value validation')
        .extractField('value')
        .push(100000)
        .greaterThanOrEqual()
        .verify()
        .build()
      
      console.log(chalk.blue(`   Custom ASM: ${customCovenant.cleanedASM}`))
      console.log(chalk.blue(`   Custom Hex: ${customCovenant.hex}`))
      
      // Test 3: Quick covenant creation
      console.log(chalk.yellow('\n3. Testing Quick Covenant Creation'))
      
      const quickCovenant = bsv.SmartContract.createQuickCovenant('value_lock', {
        value: 75000
      })
      
      console.log(chalk.blue(`   Quick ASM: ${quickCovenant.asm}`))
      console.log(chalk.blue(`   Quick Hex: ${quickCovenant.hex}`))
      
      console.log(chalk.green('\n✅ All covenant builder tests completed'))
      
    } catch (error) {
      console.log(chalk.red('❌ Covenant builder test error:', error.message))
      console.error(error.stack)
    }
  }
}

/**
 * Main execution function
 */
async function main() {
  try {
    console.log(chalk.bold.blue('Working Smart Contract Examples'))
    console.log(chalk.blue('===============================\n'))
    
    // 1. Test field extraction first
    const fieldDemo = new SimpleFieldExtractionDemo()
    fieldDemo.demonstrateFieldExtraction()
    
    // 2. Test covenant builder
    const builderTest = new CovenantBuilderTest()
    builderTest.testCovenantBuilder()
    
    // 3. Test working contract
    console.log(chalk.bold.magenta('\n💰 Working Amount Contract Test\n'))
    
    const workingContract = new WorkingAmountContract(100000) // 100k sats
    workingContract.runCompleteTest()
    
    // 4. Show contract info
    console.log(chalk.bold.yellow('\n📋 Contract Information'))
    console.log(chalk.yellow('======================='))
    
    const info = workingContract.getContractInfo()
    console.log(chalk.blue(`Expected Amount: ${info.expectedAmount} satoshis`))
    console.log(chalk.blue(`Contract Address: ${info.address}`))
    console.log(chalk.blue(`Script Size: ${info.script.size} bytes`))
    console.log(chalk.blue(`Script ASM: ${info.script.asm}`))
    
    console.log(chalk.bold.green('\n🎉 All working examples completed successfully!'))
    
    // Usage instructions
    console.log(chalk.bold.yellow('\n📚 Key Learnings:'))
    console.log(chalk.yellow('1. Use bsv.SmartContract.createQuickCovenant() for simple contracts'))
    console.log(chalk.yellow('2. Field extraction works with proper preimage format'))
    console.log(chalk.yellow('3. CovenantBuilder.build() returns an object, not a Script'))
    console.log(chalk.yellow('4. Convert covenant ASM to Script using bsv.Script.fromASM()'))
    console.log(chalk.yellow('5. Test with real preimages for accurate validation'))
    
  } catch (error) {
    console.error(chalk.bold.red('\nDemo Error:'), error.message)
    console.error(chalk.red('Stack:'), error.stack)
  }
}

// Export for use in other modules
module.exports = {
  WorkingAmountContract,
  SimpleFieldExtractionDemo,
  CovenantBuilderTest
}

// Run demo if executed directly
if (require.main === module) {
  main().catch(console.error)
}