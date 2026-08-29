/**
 * SmartMiner — an in-process BSV miner simulator for tests and development.
 *
 * This simulates mempool acceptance and block assembly; it is not a miner and
 * performs no proof of work.
 */
import { Transaction } from '@smartledger/bsv';

declare class SmartMiner {
  constructor(bsv: unknown, options?: {
    difficulty?: number;
    /** Milliseconds. Defaults to 10000. */
    blockTime?: number;
    /** Defaults to true. */
    validateScripts?: boolean;
    logLevel?: string;
    [key: string]: unknown;
  });

  options: Record<string, unknown>;
  mempool: Transaction[];
  currentBlock: { height: number; transactions: Transaction[]; timestamp: number; hash?: string };

  /** Accepts into the mempool, or returns false if rejected. */
  acceptTransaction(transaction: Transaction): boolean;
  validateTransactionSignatures(transaction: Transaction): boolean;
  /** Assembles a block from the mempool. Defaults to 10 transactions. */
  mineBlock(maxTransactions?: number): {
    height: number;
    transactions: Transaction[];
    timestamp: number;
    hash?: string;
    [key: string]: unknown;
  };
  getMempoolStats(): {
    transactionCount: number;
    transactions: Array<{ id: string; size: number; inputs: number; outputs: number }>;
  };
  getBlockchainStats(): {
    currentHeight: number;
    currentBlockHash: string | undefined;
    currentBlockTimestamp: number;
    mempoolSize: number;
    difficulty: number;
    blockTime: number;
  };
  /** Returns the miner to genesis state and empties the mempool. */
  reset(): void;
  log(level: string, message: string): void;
}

export = SmartMiner;
