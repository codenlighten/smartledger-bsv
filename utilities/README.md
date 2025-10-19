# BSV Development Utilities

This folder contains utilities for BSV blockchain development and testing, including a complete blockchain miner simulation system for validating transactions and managing UTXO sets.

## Files Overview

### Core Utilities

- **`mock-utxo-generator.js`** - Generates mock UTXOs for testing and development
  - Creates realistic mock transaction IDs
  - Builds P2PKH script hex for addresses
  - Generates properly formatted UTXO objects

- **`wallet-setup.js`** - Sets up consistent test wallet environments
  - Creates deterministic test wallets with private keys and addresses
  - Generates initial mock UTXOs
  - Saves configuration to `wallet.json`

- **`utxo-manager.js`** - Manages UTXO state and transaction tracking
  - Tracks spent and available UTXOs
  - Updates wallet state after transactions
  - Calculates available balance
  - Maintains transaction history

### Blockchain Simulation

- **`blockchain-state.js`** - Global blockchain state manager
  - Manages multiple wallet UTXO sets
  - Tracks spent and available UTXOs globally
  - Maintains blockchain metadata (block height, total value)
  - Supports wallet registration and UTXO validation

- **`miner-simulator.js`** - Complete miner simulation system
  - Accepts broadcast transactions
  - Validates inputs against global UTXO set
  - Verifies transaction signatures
  - Checks transaction balance (inputs ≥ outputs + fees)
  - Processes valid transactions and rejects invalid ones
  - Updates blockchain state after successful transactions

- **`transaction-examples.js`** - Complete transaction flow demonstrations
  - Simple P2PKH payments
  - Transaction chaining
  - Multi-output transactions
  - Full broadcast → validate → process workflow

### Configuration

- **`wallet.json`** - Persistent wallet state and UTXO tracking
  - Wallet credentials (private key, address)
  - Current UTXO set
  - Spent UTXO history
  - Transaction metadata

- **`blockchain-state.json`** - Global blockchain database
  - All wallet addresses and UTXO sets
  - Global UTXO set (keyed by "txid:vout")
  - Spent UTXO history
  - Transaction processing history
  - Blockchain metadata (block height, etc.)

## Usage

### Quick Start

1. **Initialize a test wallet:**
   ```bash
   node wallet-setup.js
   ```

2. **Import wallet into blockchain state:**
   ```bash
   node blockchain-state.js import
   ```

3. **Run transaction examples:**
   ```bash
   node transaction-examples.js        # Run all examples
   node transaction-examples.js 1      # Run single payment example
   ```

4. **Check blockchain state:**
   ```bash
   node blockchain-state.js           # Show blockchain stats
   node miner-simulator.js            # Show miner/mempool status
   node utxo-manager.js               # Show wallet UTXOs
   ```

### Transaction Flow

The complete transaction flow demonstrates real blockchain behavior:

```javascript
// 1. Create transaction
const tx = new bsv.Transaction()
  .from(utxo)
  .to(recipientAddress, amount)
  .change(senderAddress)
  .fee(1000)
  .sign(privateKey);

// 2. Broadcast to miner
const result = acceptTransaction(tx);

// 3. Miner validates:
// - UTXOs exist and unspent
// - Signatures are valid  
// - Transaction balance is correct
// - No double spending

// 4. If valid: Update global UTXO set
// 5. If invalid: Reject with error details
```

### Advanced Usage

- **Multiple wallets:** Each wallet can be registered independently
- **Transaction validation:** Full BSV-compatible signature and balance checking
- **Double-spend prevention:** UTXOs tracked globally to prevent reuse
- **Block simulation:** Each processed transaction increments block height

## Dependencies

These utilities require the BSV library from the parent directory (`../index.js`).

## Purpose

These utilities provide a consistent testing environment for BSV development, particularly useful for:
- Transaction creation and verification testing
- UTXO management in multi-transaction scenarios
- Consistent test wallet environments
- Mock blockchain data generation