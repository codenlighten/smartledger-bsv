#!/usr/bin/env node

/**
 * UTXO Generator Standalone Demo
 * ==============================
 * 
 * Demonstrates the SmartContract.UTXOGenerator capabilities for creating
 * authentic BSV UTXOs for testing and development.
 * 
 * Features demonstrated:
 * - Real BSV keypair generation
 * - P2PKH, P2SH, and custom UTXO creation
 * - SmartUTXO integration
 * - Blockchain state management
 * - Multi-network support
 */

const bsv = require('../index.js');

console.log('💎 SmartLedger-BSV UTXO Generator Demo');
console.log('======================================\n');

async function demonstrateUTXOGenerator() {
  try {
    // Test 1: Basic UTXO Generation
    console.log('🏗️  Test 1: Basic UTXO Generation');
    console.log('--------------------------------');
    
    const generator = bsv.SmartContract.createUTXOGenerator({
      network: bsv.Networks.testnet
    });
    
    console.log('✅ UTXOGenerator created for testnet');
    
    // Generate a keypair
    const keypair = generator.generateKeypair('main_wallet');
    console.log('🔑 Generated keypair:');
    console.log('   📍 Address:', keypair.addressString);
    console.log('   🔐 WIF:', keypair.wif);
    console.log('   🔑 Public Key:', keypair.publicKey.toString().substring(0, 20) + '...');
    console.log('');

    // Create basic UTXOs
    const utxos = generator.createRealUTXOs({
      count: 3,
      satoshis: 100000,
      scriptType: 'P2PKH',
      keypair: keypair
    });
    
    console.log('📊 Generated UTXOs:', utxos.length);
    utxos.forEach((utxo, index) => {
      console.log(`   UTXO ${index + 1}:`);
      console.log(`     🆔 TxID: ${utxo.txid.substring(0, 16)}...`);
      console.log(`     📍 Vout: ${utxo.vout}`);
      console.log(`     💰 Value: ${utxo.satoshis} satoshis`);
      console.log(`     🏠 Address: ${utxo.address}`);
      console.log(`     📜 Script Type: ${utxo.scriptType}`);
    });
    console.log('');

    // Test 2: Different Script Types
    console.log('🔧 Test 2: Different Script Types');
    console.log('---------------------------------');
    
    const scriptTypes = ['P2PKH', 'P2SH'];
    
    for (const scriptType of scriptTypes) {
      console.log(`🛠️  Creating ${scriptType} UTXOs...`);
      
      const typeKeypair = generator.generateKeypair(`${scriptType.toLowerCase()}_wallet`);
      const typeUTXOs = generator.createRealUTXOs({
        count: 2,
        satoshis: 50000,
        scriptType: scriptType,
        keypair: typeKeypair
      });
      
      console.log(`   ✅ Created ${typeUTXOs.length} ${scriptType} UTXOs`);
      console.log(`   📍 Address: ${typeKeypair.addressString}`);
      console.log(`   📜 Script: ${typeUTXOs[0].script.substring(0, 30)}...`);
      console.log('');
    }

    // Test 3: Different Networks
    console.log('🌐 Test 3: Multi-Network Support');
    console.log('-------------------------------');
    
    const networks = [
      { name: 'mainnet', network: bsv.Networks.mainnet },
      { name: 'testnet', network: bsv.Networks.testnet },
      { name: 'regtest', network: bsv.Networks.regtest }
    ];
    
    networks.forEach(({ name, network }) => {
      const netGenerator = bsv.SmartContract.createUTXOGenerator({ network });
      const netKeypair = netGenerator.generateKeypair(`${name}_key`);
      
      console.log(`🌐 ${name}:`);
      console.log(`   📍 Address: ${netKeypair.addressString}`);
      console.log(`   🔑 Network: ${netKeypair.privateKey.network.name}`);
    });
    console.log('');

    // Test 4: UTXO Pool Management
    console.log('🗃️  Test 4: UTXO Pool Management');
    console.log('--------------------------------');
    
    console.log('📊 Total UTXOs in pool:', generator.utxoPool.length);
    console.log('🔑 Keypairs in keyring:', Object.keys(generator.keyRing).length);
    
    // Show UTXO statistics
    const totalValue = generator.utxoPool.reduce((sum, utxo) => sum + utxo.satoshis, 0);
    console.log('💰 Total value in pool:', totalValue, 'satoshis');
    console.log('💸 Average UTXO value:', Math.round(totalValue / generator.utxoPool.length), 'satoshis');
    
    // Group by script type
    const scriptTypeStats = {};
    generator.utxoPool.forEach(utxo => {
      scriptTypeStats[utxo.scriptType] = (scriptTypeStats[utxo.scriptType] || 0) + 1;
    });
    
    console.log('📊 UTXOs by script type:');
    Object.entries(scriptTypeStats).forEach(([type, count]) => {
      console.log(`   ${type}: ${count} UTXOs`);
    });
    console.log('');

    // Test 5: SmartUTXO Integration
    console.log('🔗 Test 5: SmartUTXO Integration');
    console.log('-------------------------------');
    
    if (bsv.SmartUTXO) {
      console.log('✅ SmartUTXO integration available');
      
      // Create SmartUTXO instance
      const smartUTXO = new bsv.SmartUTXO();
      
      // Check UTXOs for an address
      const testAddress = keypair.addressString;
      const addressUTXOs = smartUTXO.getUTXOsForAddress(testAddress);
      
      console.log(`💎 UTXOs found for ${testAddress}:`, addressUTXOs.length);
      
      if (addressUTXOs.length > 0) {
        console.log('📋 Sample UTXO details:');
        const sample = addressUTXOs[0];
        console.log(`   🆔 TxID: ${sample.txid || sample.txId}`);
        console.log(`   💰 Value: ${sample.satoshis || sample.amount} satoshis`);
      }
      
    } else {
      console.log('⚠️  SmartUTXO integration not available');
    }
    console.log('');

    // Test 6: Custom UTXO Creation
    console.log('⚙️  Test 6: Custom UTXO Creation');
    console.log('-------------------------------');
    
    const customKeypair = generator.generateKeypair('custom_wallet');
    
    // Create UTXOs with different values
    const customConfigs = [
      { satoshis: 546, description: 'Dust limit UTXO' },
      { satoshis: 10000, description: 'Small payment UTXO' },
      { satoshis: 1000000, description: 'Large value UTXO' },
      { satoshis: 21000000, description: 'Very large UTXO' }
    ];
    
    customConfigs.forEach(config => {
      const customUTXOs = generator.createRealUTXOs({
        count: 1,
        satoshis: config.satoshis,
        scriptType: 'P2PKH',
        keypair: customKeypair
      });
      
      console.log(`💎 ${config.description}:`);
      console.log(`   💰 ${config.satoshis} satoshis (${(config.satoshis / 100000000).toFixed(8)} BSV)`);
      console.log(`   🆔 ${customUTXOs[0].txid.substring(0, 16)}...`);
    });
    console.log('');

    // Test 7: Performance Metrics
    console.log('📊 Test 7: Performance Metrics');
    console.log('------------------------------');
    
    const perfKeypair = generator.generateKeypair('perf_test');
    const iterations = 50;
    
    console.log(`🚀 Creating ${iterations} UTXOs for performance test...`);
    
    const startTime = Date.now();
    
    for (let i = 0; i < iterations; i++) {
      generator.createRealUTXOs({
        count: 1,
        satoshis: 10000,
        scriptType: 'P2PKH',
        keypair: perfKeypair
      });
    }
    
    const endTime = Date.now();
    const totalTime = endTime - startTime;
    
    console.log(`⏱️  Generated ${iterations} UTXOs in ${totalTime}ms`);
    console.log(`📊 Average: ${(totalTime / iterations).toFixed(2)}ms per UTXO`);
    console.log(`🚀 Rate: ${(iterations * 1000 / totalTime).toFixed(0)} UTXOs/second`);
    console.log('');

    // Final statistics
    console.log('📊 Final Statistics');
    console.log('------------------');
    console.log('🔑 Total keypairs generated:', Object.keys(generator.keyRing).length);
    console.log('💎 Total UTXOs created:', generator.utxoPool.length);
    console.log('💰 Total value generated:', generator.utxoPool.reduce((sum, utxo) => sum + utxo.satoshis, 0), 'satoshis');
    console.log('🌐 Network:', generator.network.name);

  } catch (error) {
    console.error('❌ Demo error:', error.message);
    console.error('📋 Stack:', error.stack);
  }
}

// Run the demo
demonstrateUTXOGenerator().then(() => {
  console.log('\n🎉 UTXO Generator Demo completed!');
  console.log('');
  console.log('💡 Use Cases:');
  console.log('  • Test environment setup for smart contracts');
  console.log('  • Local development with realistic UTXOs');
  console.log('  • Integration testing with multiple addresses');
  console.log('  • Performance testing of transaction creation');
  console.log('  • Educational demonstrations of UTXO model');
  console.log('  • Mock data generation for BSV applications');
  console.log('');
  console.log('🔧 Integration Tips:');
  console.log('  • Use with SmartContract.Covenant for covenant testing');
  console.log('  • Combine with transaction builders for end-to-end tests');
  console.log('  • Store generated UTXOs for reuse across tests');
  console.log('  • Use different networks for different test scenarios');
});