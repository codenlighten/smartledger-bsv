'use strict';

/**
 * SmartLedger Performance Benchmark
 * Measures performance impact of security enhancements vs original BSV
 */

const originalBSV = require('bsv');
const hardenedBSV = require('../index');
const crypto = require('crypto');

// Benchmark configuration
const NUM_ITERATIONS = 1000;
const NUM_WARMUP = 100;

class PerformanceBenchmark {
  constructor() {
    this.results = {};
  }

  // Create test data for benchmarking
  setupTestData() {
    this.testKeys = [];
    this.testMessages = [];
    this.testHashes = [];
    
    console.log('Setting up test data...');
    
    for (let i = 0; i < NUM_ITERATIONS; i++) {
      const key = new originalBSV.PrivateKey();
      const message = `SmartLedger benchmark message ${i}`;
      const hash = originalBSV.crypto.Hash.sha256(Buffer.from(message));
      
      this.testKeys.push(key);
      this.testMessages.push(message);
      this.testHashes.push(hash);
    }
    
    console.log(`✓ Generated ${NUM_ITERATIONS} test cases`);
  }

  // Time a function execution
  timeFunction(name, fn) {
    // Warmup
    console.log(`Warming up ${name}...`);
    for (let i = 0; i < NUM_WARMUP; i++) {
      fn(i % this.testHashes.length);
    }
    
    // Actual benchmark
    console.log(`Benchmarking ${name}...`);
    const startTime = process.hrtime.bigint();
    
    for (let i = 0; i < NUM_ITERATIONS; i++) {
      fn(i);
    }
    
    const endTime = process.hrtime.bigint();
    const duration = Number(endTime - startTime) / 1000000; // Convert to milliseconds
    
    const opsPerSecond = (NUM_ITERATIONS / duration) * 1000;
    
    this.results[name] = {
      totalTime: duration,
      avgTime: duration / NUM_ITERATIONS,
      opsPerSecond: opsPerSecond
    };
    
    console.log(`✓ ${name}: ${duration.toFixed(2)}ms total, ${(duration/NUM_ITERATIONS).toFixed(4)}ms avg, ${opsPerSecond.toFixed(0)} ops/sec`);
  }

  // Benchmark signing operations
  benchmarkSigning() {
    console.log('\n=== SIGNING BENCHMARKS ===');
    
    // Original BSV signing
    this.timeFunction('Original BSV Sign', (i) => {
      const key = this.testKeys[i];
      const hash = this.testHashes[i];
      return originalBSV.crypto.ECDSA.sign(hash, key);
    });
    
    // Hardened BSV signing
    this.timeFunction('Hardened BSV Sign', (i) => {
      const key = this.testKeys[i];
      const hash = this.testHashes[i];
      return hardenedBSV.crypto.ECDSA.sign(hash, key);
    });
  }

  // Benchmark verification operations
  benchmarkVerification() {
    console.log('\n=== VERIFICATION BENCHMARKS ===');
    
    // Pre-generate signatures for verification tests
    const originalSigs = [];
    const hardenedSigs = [];
    const pubKeys = [];
    
    console.log('Pre-generating signatures for verification tests...');
    for (let i = 0; i < NUM_ITERATIONS; i++) {
      const key = this.testKeys[i];
      const hash = this.testHashes[i];
      const pubKey = key.toPublicKey();
      
      originalSigs.push(originalBSV.crypto.ECDSA.sign(hash, key));
      hardenedSigs.push(hardenedBSV.crypto.ECDSA.sign(hash, key));
      pubKeys.push(pubKey);
    }
    
    // Original BSV verification
    this.timeFunction('Original BSV Verify', (i) => {
      const hash = this.testHashes[i];
      const sig = originalSigs[i];
      const pubKey = pubKeys[i];
      return originalBSV.crypto.ECDSA.verify(hash, sig, pubKey);
    });
    
    // Hardened BSV verification
    this.timeFunction('Hardened BSV Verify', (i) => {
      const hash = this.testHashes[i];
      const sig = hardenedSigs[i];
      const pubKey = pubKeys[i];
      return hardenedBSV.crypto.ECDSA.verify(hash, sig, pubKey);
    });
    
    // SmartVerify function
    this.timeFunction('SmartVerify Function', (i) => {
      const hash = this.testHashes[i];
      const sig = hardenedSigs[i];
      const pubKey = pubKeys[i];
      return hardenedBSV.crypto.SmartVerify.smartVerify(hash, sig, pubKey);
    });
  }

  // Benchmark signature operations
  benchmarkSignatureOps() {
    console.log('\n=== SIGNATURE OPERATION BENCHMARKS ===');
    
    // Pre-generate signatures
    const signatures = [];
    console.log('Pre-generating signatures for operation tests...');
    for (let i = 0; i < NUM_ITERATIONS; i++) {
      const key = this.testKeys[i];
      const hash = this.testHashes[i];
      signatures.push(hardenedBSV.crypto.ECDSA.sign(hash, key));
    }
    
    // DER encoding
    this.timeFunction('Hardened DER Encode', (i) => {
      return signatures[i].toDER();
    });
    
    // Canonicality check
    this.timeFunction('Canonicality Check', (i) => {
      return signatures[i].isCanonical();
    });
    
    // Canonicalization
    this.timeFunction('Signature Canonicalization', (i) => {
      return signatures[i].toCanonical();
    });
    
    // DER roundtrip
    this.timeFunction('DER Roundtrip', (i) => {
      const der = signatures[i].toDER();
      return hardenedBSV.crypto.Signature.fromDER(der);
    });
  }

  // Generate performance report
  generateReport() {
    console.log('\n=== PERFORMANCE SUMMARY ===');
    console.log(`Iterations: ${NUM_ITERATIONS}`);
    console.log(`Warmup iterations: ${NUM_WARMUP}\n`);
    
    // Calculate overhead percentages
    const signingOverhead = this.calculateOverhead('Original BSV Sign', 'Hardened BSV Sign');
    const verifyOverhead = this.calculateOverhead('Original BSV Verify', 'Hardened BSV Verify');
    
    console.log('Performance Comparison:');
    console.log(`Signing overhead: ${signingOverhead > 0 ? '+' : ''}${signingOverhead.toFixed(2)}%`);
    console.log(`Verification overhead: ${verifyOverhead > 0 ? '+' : ''}${verifyOverhead.toFixed(2)}%`);
    
    console.log('\nDetailed Results:');
    Object.entries(this.results).forEach(([name, result]) => {
      console.log(`${name}:`);
      console.log(`  Total time: ${result.totalTime.toFixed(2)}ms`);
      console.log(`  Average time: ${result.avgTime.toFixed(4)}ms`);
      console.log(`  Operations/sec: ${result.opsPerSecond.toFixed(0)}`);
    });
    
    // Security features impact
    console.log('\nSecurity Features Performance:');
    const derEncode = this.results['Hardened DER Encode'];
    const canonical = this.results['Canonicality Check'];
    const roundtrip = this.results['DER Roundtrip'];
    
    if (derEncode) {
      console.log(`DER encoding: ${derEncode.avgTime.toFixed(4)}ms avg`);
    }
    if (canonical) {
      console.log(`Canonicality check: ${canonical.avgTime.toFixed(4)}ms avg`);
    }
    if (roundtrip) {
      console.log(`DER roundtrip: ${roundtrip.avgTime.toFixed(4)}ms avg`);
    }
  }

  calculateOverhead(baselineKey, compareKey) {
    const baseline = this.results[baselineKey];
    const compare = this.results[compareKey];
    
    if (!baseline || !compare) return 0;
    
    return ((compare.avgTime - baseline.avgTime) / baseline.avgTime) * 100;
  }

  async run() {
    console.log('🚀 SmartLedger BSV Performance Benchmark Starting...\n');
    
    this.setupTestData();
    this.benchmarkSigning();
    this.benchmarkVerification();
    this.benchmarkSignatureOps();
    this.generateReport();
    
    console.log('\n✅ Benchmark completed!');
  }
}

// Run benchmark if called directly
if (require.main === module) {
  const benchmark = new PerformanceBenchmark();
  benchmark.run().catch(console.error);
}

module.exports = PerformanceBenchmark;