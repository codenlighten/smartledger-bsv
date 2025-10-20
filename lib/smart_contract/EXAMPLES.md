# SmartContract Practical Examples

**SmartLedger-BSV v3.2.0** - Real-world covenant implementation examples

## Table of Contents

1. [Basic Examples](#basic-examples)
2. [Financial Covenants](#financial-covenants)
3. [Security Patterns](#security-patterns)  
4. [Advanced Use Cases](#advanced-use-cases)
5. [Production Integration](#production-integration)

---

## Basic Examples

### Example 1: Simple Value Check

```javascript
const SmartContract = require('bsv-elliptic-fix').SmartContract

// Ensure transaction maintains minimum value
function createValueGuard(minimumSatoshis) {
  const builder = SmartContract.createCovenantBuilder()
  
  return builder
    .comment(`Value guard: minimum ${minimumSatoshis} satoshis`)
    .extractField('value')
    .push(minimumSatoshis.toString(16).padStart(16, '0'))
    .greaterThanOrEqual()
    .verify()
    .build()
}

// Usage
const covenant = createValueGuard(1000000) // 1M satoshi minimum
console.log('ASM:', covenant.cleanedASM)

// Test the covenant
const simulation = SmartContract.simulateScript(covenant.operations)
console.log('Valid:', simulation.success)
```

### Example 2: Hash Preimage Validation

```javascript
// Require knowledge of secret to spend
function createHashLock(secretHash) {
  const builder = SmartContract.createCovenantBuilder()
  
  return builder
    .comment('Hash lock: requires secret preimage')
    .push('secret_placeholder') // Will be replaced with actual secret
    .sha256()
    .push(secretHash)
    .equalVerify()
    .build()
}

// Usage
const secret = 'my_secret_key'
const secretHash = require('crypto')
  .createHash('sha256')
  .update(secret)
  .digest('hex')

const hashLock = createHashLock(secretHash)
console.log('Hash lock ASM:', hashLock.cleanedASM)
```

---

## Financial Covenants

### Example 3: Recurring Payment Covenant

```javascript
// Covenant that enforces regular payments to a recipient
function createRecurringPayment(recipientAddress, paymentAmount, intervalBlocks) {
  const builder = SmartContract.createCovenantBuilder()
  
  return builder
    .comment('Recurring payment covenant')
    .comment(`Payment: ${paymentAmount} satoshis every ${intervalBlocks} blocks`)
    
    // Check time interval
    .extractField('nLockTime')
    .push('last_payment_time') // Track last payment
    .sub()
    .push(intervalBlocks.toString())
    .greaterThanOrEqual()
    .verify()
    
    // Ensure correct payment amount to recipient
    .extractField('hashOutputs')
    .comment('Validate payment output')
    .push(paymentAmount.toString(16).padStart(16, '0'))
    .push(recipientAddress)
    .cat() // Combine amount + address
    .sha256()
    .equalVerify()
    
    .build()
}

// Usage
const recurringPayment = createRecurringPayment(
  'recipient_address_hash',
  50000,  // 50k satoshis per payment
  144     // Daily payments (144 blocks ≈ 1 day)
)
```

### Example 4: Escrow with Dispute Resolution

```javascript
// Three-party escrow with dispute resolution
function createEscrowCovenant(buyerPubKey, sellerPubKey, arbitratorPubKey, escrowAmount) {
  const builder = SmartContract.createCovenantBuilder()
  
  return builder
    .comment('Three-party escrow covenant')
    .comment('Requires 2-of-3 signatures for release')
    
    // Path 1: Buyer + Seller agree (no arbitrator needed)
    .push('buyer_signature_placeholder')
    .push(buyerPubKey)
    // ... signature verification ...
    
    .push('seller_signature_placeholder')  
    .push(sellerPubKey)
    // ... signature verification ...
    
    .push(2) // Require 2 valid signatures
    .equal()
    
    // OR Path 2: Any 2 parties including arbitrator
    .if()
      .push(1) // Valid 2-party agreement
    .else()
      .comment('Dispute resolution path')
      // ... arbitrator signature logic ...
    .endif()
    
    .verify()
    .build()
}
```

### Example 5: Savings Account with Withdrawal Limits

```javascript
// Savings account with daily withdrawal limits
function createSavingsAccount(dailyLimit, lastWithdrawalTime) {
  const builder = SmartContract.createCovenantBuilder()
  
  return builder
    .comment('Savings account with withdrawal limits')
    
    // Check if 24 hours have passed since last withdrawal
    .extractField('nLockTime')
    .push(lastWithdrawalTime)
    .sub()
    .push('86400') // 24 hours in seconds
    .greaterThanOrEqual()
    
    .if()
      .comment('Daily limit reset - allow withdrawal')
      .extractField('value')
      .push(dailyLimit.toString())
      .lessThanOrEqual()
      .verify()
    .else()
      .comment('Within 24 hours - no withdrawal allowed')
      .push(0)
      .verify() // Will fail, preventing withdrawal
    .endif()
    
    .build()
}
```

---

## Security Patterns

### Example 6: Multi-Factor Authentication Covenant

```javascript
// Covenant requiring multiple authentication factors
function createMFACovenant(ownerPubKey, deviceHash, locationHash) {
  const builder = SmartContract.createCovenantBuilder()
  
  return builder
    .comment('Multi-factor authentication covenant')
    
    // Factor 1: Owner signature
    .push('owner_signature_placeholder')
    .push(ownerPubKey)
    // ... signature verification ...
    
    // Factor 2: Device authentication
    .push('device_token_placeholder')
    .sha256()
    .push(deviceHash)
    .equalVerify()
    
    // Factor 3: Location verification (IP/GPS hash)
    .push('location_data_placeholder')
    .sha256()
    .push(locationHash)
    .equalVerify()
    
    .comment('All factors verified')
    .build()
}
```

### Example 7: Rate-Limited Spending

```javascript
// Prevent rapid spending attacks
function createRateLimitedCovenant(spendingRate, timeWindow) {
  const builder = SmartContract.createCovenantBuilder()
  
  return builder
    .comment(`Rate limit: ${spendingRate} per ${timeWindow} seconds`)
    
    // Track spending within time window
    .extractField('nLockTime')
    .push('window_start_time')
    .sub()
    .push(timeWindow.toString())
    .lessThan()
    
    .if()
      .comment('Within time window - check rate limit')
      .push('current_spending_amount')
      .push(spendingRate.toString())
      .lessThanOrEqual()
      .verify()
    .else()
      .comment('New time window - reset rate limit')
      .push(1) // Always allow first transaction in new window
      .verify()
    .endif()
    
    .build()
}
```

### Example 8: Dead Man's Switch

```javascript
// Automatically transfer funds if owner doesn't check in
function createDeadManSwitch(beneficiaryAddress, checkInInterval) {
  const builder = SmartContract.createCovenantBuilder()
  
  return builder
    .comment('Dead man\'s switch covenant')
    .comment(`Auto-transfer if no activity for ${checkInInterval} blocks`)
    
    // Check time since last owner activity
    .extractField('nLockTime')
    .push('last_checkin_time')
    .sub()
    .push(checkInInterval.toString())
    .greaterThan()
    
    .if()
      .comment('Timeout reached - transfer to beneficiary')
      .extractField('hashOutputs')
      .push(beneficiaryAddress)
      .equalVerify() // Ensure funds go to beneficiary
    .else()
      .comment('Owner still active - normal spending rules')
      // ... owner signature verification ...
    .endif()
    
    .build()
}
```

---

## Advanced Use Cases

### Example 9: Decentralized Exchange Covenant

```javascript
// Atomic swap covenant for decentralized exchange
function createAtomicSwapCovenant(counterpartyPubKey, exchangeRate, timeoutBlocks) {
  const builder = SmartContract.createCovenantBuilder()
  
  return builder
    .comment('Atomic swap covenant')
    .comment(`Exchange rate: ${exchangeRate}, Timeout: ${timeoutBlocks} blocks`)
    
    // Path 1: Successful swap
    .push('swap_secret_placeholder')
    .sha256()
    .push('expected_secret_hash')
    .equal()
    
    .if()
      .comment('Secret revealed - complete swap')
      .push('counterparty_signature_placeholder')
      .push(counterpartyPubKey)
      // ... signature verification ...
      
      // Verify exchange rate
      .extractField('value')
      .push(exchangeRate.toString())
      .mul()
      .push('expected_output_value')
      .equalVerify()
      
    .else()
      .comment('Timeout path - refund original owner')
      .extractField('nLockTime')
      .push(timeoutBlocks.toString())
      .greaterThan()
      .verify()
      
      // ... owner signature verification for refund ...
    .endif()
    
    .build()
}
```

### Example 10: Supply Chain Tracking Covenant

```javascript
// Track product ownership through supply chain
function createSupplyChainCovenant(productId, currentOwner, nextOwner) {
  const builder = SmartContract.createCovenantBuilder()
  
  return builder
    .comment('Supply chain tracking covenant')
    .comment(`Product: ${productId}`)
    
    // Verify product ID hasn't changed
    .push(productId)
    .extractField('scriptCode')
    .push(0) // Product ID at position 0
    .push(32) // 32 bytes for product ID
    .substr()
    .equalVerify()
    
    // Verify ownership transfer signature
    .push('transfer_signature_placeholder')
    .push(currentOwner)
    // ... signature verification ...
    
    // Update ownership record
    .push(nextOwner)
    .push('ownership_updated')
    .cat()
    .sha256()
    
    // Create new covenant with updated owner
    .build()
}
```

### Example 11: Subscription Service Covenant

```javascript
// Recurring subscription with auto-renewal
function createSubscriptionCovenant(serviceProvider, subscriptionFee, renewalPeriod) {
  const builder = SmartContract.createCovenantBuilder()
  
  return builder
    .comment('Subscription service covenant')
    .comment(`Fee: ${subscriptionFee}, Period: ${renewalPeriod} blocks`)
    
    // Check if renewal period has elapsed
    .extractField('nLockTime')
    .push('last_payment_time')
    .sub()
    .push(renewalPeriod.toString())
    .greaterThanOrEqual()
    
    .if()
      .comment('Renewal due - process payment')
      .extractField('hashOutputs')
      
      // Payment to service provider
      .push(subscriptionFee.toString(16).padStart(16, '0'))
      .push(serviceProvider)
      .cat()
      .sha256()
      
      // Remaining funds continue subscription
      .extractField('value')
      .push(subscriptionFee.toString())
      .sub()
      .push('continuation_covenant_hash')
      .cat()
      .sha256()
      
      .equalVerify()
      
    .else()
      .comment('Subscription active - no payment due')
      .push(1)
      .verify()
    .endif()
    
    .build()
}
```

---

## Production Integration

### Example 12: Complete Covenant Deployment

```javascript
const bsv = require('bsv-elliptic-fix')
const SmartContract = bsv.SmartContract

async function deployValueLockCovenant(privateKey, minimumValue, utxo) {
  try {
    // 1. Create covenant script
    const builder = SmartContract.createCovenantBuilder()
    const covenant = builder
      .comment('Production value lock covenant')
      .extractField('value')
      .push(minimumValue.toString(16).padStart(16, '0'))
      .greaterThanOrEqual()
      .verify()
      .build()
    
    // 2. Test covenant locally
    console.log('Testing covenant...')
    const simulation = SmartContract.simulateScript(covenant.operations)
    if (!simulation.success) {
      throw new Error(`Covenant validation failed: ${simulation.error}`)
    }
    
    // 3. Create P2SH address for covenant
    const script = bsv.Script.fromASM(covenant.cleanedASM)
    const address = script.toAddress()
    
    // 4. Create transaction to fund covenant
    const tx = new bsv.Transaction()
      .from(utxo)
      .to(address, utxo.satoshis - 1000) // Leave 1000 sats for fee
      .sign(privateKey)
    
    // 5. Broadcast transaction
    console.log('Broadcasting covenant creation transaction...')
    const result = await broadcastTransaction(tx)
    
    console.log('✅ Covenant deployed successfully!')
    console.log('Covenant address:', address.toString())
    console.log('Transaction ID:', result.txid)
    console.log('Covenant script:', covenant.cleanedASM)
    
    return {
      success: true,
      address: address.toString(),
      txid: result.txid,
      script: covenant.cleanedASM
    }
    
  } catch (error) {
    console.log('❌ Deployment failed:', error.message)
    return {
      success: false,
      error: error.message
    }
  }
}

// Usage
async function main() {
  const privateKey = bsv.PrivateKey.fromWIF('your_private_key_wif')
  const utxo = {
    txid: 'your_utxo_txid',
    vout: 0,
    satoshis: 100000,
    script: 'your_utxo_script'
  }
  
  const result = await deployValueLockCovenant(privateKey, 50000, utxo)
  console.log('Deployment result:', result)
}
```

### Example 13: Covenant Testing Framework

```javascript
// Comprehensive testing framework for covenants
class CovenantTester {
  constructor() {
    this.testResults = []
  }
  
  // Test covenant with various scenarios
  async testCovenant(covenant, testCases) {
    console.log('🧪 Starting covenant test suite...')
    
    for (const testCase of testCases) {
      try {
        const result = await this.runTestCase(covenant, testCase)
        this.testResults.push(result)
        
        if (result.success) {
          console.log(`✅ ${testCase.name}: PASSED`)
        } else {
          console.log(`❌ ${testCase.name}: FAILED - ${result.error}`)
        }
        
      } catch (error) {
        console.log(`💥 ${testCase.name}: ERROR - ${error.message}`)
        this.testResults.push({
          name: testCase.name,
          success: false,
          error: error.message
        })
      }
    }
    
    return this.generateReport()
  }
  
  async runTestCase(covenant, testCase) {
    // Create test environment
    const testEnv = SmartContract.createTestEnvironment()
    
    // Simulate covenant with test data
    const simulation = SmartContract.simulateScript(
      covenant.operations,
      testCase.initialStack || []
    )
    
    // Validate expected outcome
    const expectedSuccess = testCase.expectedSuccess !== false
    const actualSuccess = simulation.success
    
    if (expectedSuccess === actualSuccess) {
      return {
        name: testCase.name,
        success: true,
        simulation: simulation
      }
    } else {
      return {
        name: testCase.name,
        success: false,
        error: `Expected ${expectedSuccess ? 'success' : 'failure'}, got ${actualSuccess ? 'success' : 'failure'}`,
        simulation: simulation
      }
    }
  }
  
  generateReport() {
    const total = this.testResults.length
    const passed = this.testResults.filter(r => r.success).length
    const failed = total - passed
    
    console.log('\n📊 Test Report:')
    console.log(`Total tests: ${total}`)
    console.log(`Passed: ${passed}`)
    console.log(`Failed: ${failed}`)
    console.log(`Success rate: ${((passed / total) * 100).toFixed(1)}%`)
    
    return {
      total,
      passed,
      failed,
      successRate: (passed / total) * 100,
      results: this.testResults
    }
  }
}

// Usage example
async function testValueLockCovenant() {
  const covenant = SmartContract.createValueLockCovenant('1000000')
  const tester = new CovenantTester()
  
  const testCases = [
    {
      name: 'Valid high value transaction',
      initialStack: ['2000000'], // 2M satoshis
      expectedSuccess: true
    },
    {
      name: 'Valid minimum value transaction',
      initialStack: ['1000000'], // Exactly 1M satoshis
      expectedSuccess: true
    },
    {
      name: 'Invalid low value transaction',
      initialStack: ['500000'], // 500k satoshis (too low)
      expectedSuccess: false
    },
    {
      name: 'Empty stack test',
      initialStack: [],
      expectedSuccess: false
    }
  ]
  
  const report = await tester.testCovenant(covenant, testCases)
  return report
}
```

### Example 14: Production Monitoring

```javascript
// Monitor covenant transactions on the blockchain
class CovenantMonitor {
  constructor(covenantAddress, options = {}) {
    this.address = covenantAddress
    this.options = options
    this.transactions = []
  }
  
  // Monitor for new transactions involving the covenant
  async startMonitoring() {
    console.log(`🔍 Monitoring covenant at ${this.address}`)
    
    // Poll blockchain for new transactions
    setInterval(async () => {
      try {
        await this.checkForNewTransactions()
      } catch (error) {
        console.log('Monitoring error:', error.message)
      }
    }, this.options.pollInterval || 30000) // 30 seconds
  }
  
  async checkForNewTransactions() {
    // Fetch transactions for covenant address
    const newTxs = await this.fetchTransactions()
    
    for (const tx of newTxs) {
      if (!this.transactions.find(t => t.txid === tx.txid)) {
        this.transactions.push(tx)
        await this.processCcovenantTransaction(tx)
      }
    }
  }
  
  async processCovenantTransaction(tx) {
    console.log(`📝 New covenant transaction: ${tx.txid}`)
    
    // Validate covenant compliance
    const validation = await this.validateTransaction(tx)
    
    if (validation.valid) {
      console.log('✅ Transaction complies with covenant rules')
      this.onValidTransaction(tx, validation)
    } else {
      console.log('❌ Transaction violates covenant rules:', validation.errors)
      this.onInvalidTransaction(tx, validation)
    }
  }
  
  async validateTransaction(tx) {
    // Extract preimage and validate against covenant rules
    const preimage = this.extractPreimage(tx)
    
    const result = SmartContract.testCovenant(preimage, {
      // Covenant-specific validation rules
    })
    
    return result
  }
  
  onValidTransaction(tx, validation) {
    // Handle valid covenant transaction
    if (this.options.onValidTx) {
      this.options.onValidTx(tx, validation)
    }
  }
  
  onInvalidTransaction(tx, validation) {
    // Handle invalid covenant transaction
    if (this.options.onInvalidTx) {
      this.options.onInvalidTx(tx, validation)
    }
    
    // Could trigger alerts, notifications, etc.
  }
}

// Usage
const monitor = new CovenantMonitor('covenant_address', {
  pollInterval: 15000, // 15 seconds
  onValidTx: (tx, validation) => {
    console.log('Valid covenant transaction processed:', tx.txid)
    // Send notification, update database, etc.
  },
  onInvalidTx: (tx, validation) => {
    console.log('ALERT: Invalid covenant transaction detected!', tx.txid)
    // Send alert, log violation, etc.
  }
})

monitor.startMonitoring()
```

---

## Testing Utilities

```javascript
// Helper function to create realistic test data
function createTestPreimage(options = {}) {
  return SmartContract.createTestEnvironment(options).preimage
}

// Helper function to validate covenant against multiple preimages
function validateCovenantBatch(covenant, preimages) {
  return preimages.map(preimage => {
    const result = SmartContract.testCovenant(preimage, {
      // Validation rules
    })
    return {
      preimage,
      valid: result.success,
      details: result
    }
  })
}

// Helper function to estimate covenant costs
function estimateCovenantCost(covenant) {
  const scriptSize = covenant.operations.length
  const estimatedBytes = scriptSize * 1.5 // Rough estimate
  const estimatedFee = estimatedBytes * 0.5 // 0.5 sat/byte
  
  return {
    operations: scriptSize,
    estimatedBytes,
    estimatedFee
  }
}
```

These examples demonstrate real-world covenant patterns and production integration strategies. The SmartContract framework provides the tools to implement complex financial and security logic while maintaining Bitcoin Script compatibility and performance.

For more examples and advanced patterns, explore the `/examples` directory in the repository.