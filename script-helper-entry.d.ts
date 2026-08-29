/**
 * CustomScriptHelper — script construction and signing helpers.
 *
 * All members are static; the class is never instantiated. Signatures follow
 * the JSDoc in `lib/custom-script-helper.js`.
 */
import { Transaction, Script, PrivateKey, PublicKey } from '@smartledger/bsv';

declare class CustomScriptHelper {
  /** SIGHASH_ALL | SIGHASH_FORKID. */
  static readonly SIGHASH_ALL: number;
  /** SIGHASH_NONE | SIGHASH_FORKID. */
  static readonly SIGHASH_NONE: number;
  /** SIGHASH_SINGLE | SIGHASH_FORKID. */
  static readonly SIGHASH_SINGLE: number;

  /**
   * DER signature with the sighash byte appended, ready to push.
   * Defaults to SIGHASH_ALL | SIGHASH_FORKID.
   */
  static createSignature(
    transaction: Transaction,
    privateKey: PrivateKey,
    inputIndex: number,
    lockingScript: Script,
    satoshis: number,
    sighashType?: number | null
  ): Buffer;

  /** m-of-n locking script over the supplied keys. */
  static createMultisigScript(m: number, publicKeys: PublicKey[]): Script;
  /** Unlocking script for a multisig input; prepends OP_0 for the CHECKMULTISIG off-by-one. */
  static createMultisigUnlocking(signatures: Buffer[]): Script;
  /** OP_IF / [OP_ELSE] / OP_ENDIF around the supplied branches. */
  static createConditionalScript(ifScript: Script, elseScript?: Script | null): Script;

  static createP2PKHScript(publicKey: PublicKey): Script;
  static createP2PKHUnlocking(signature: Buffer, publicKey: PublicKey): Script;

  /**
   * BIP-143 preimage for the given input.
   * Defaults to SIGHASH_ALL | SIGHASH_FORKID.
   */
  static getPreimage(
    transaction: Transaction,
    inputIndex: number,
    lockingScript: Script,
    satoshis: number,
    sighashType?: number | null
  ): Buffer;

  /** A bare data push. A string is encoded as UTF-8. */
  static createDataScript(data: Buffer | string): Script;
  /** OP_FALSE OP_RETURN <data>. A string is encoded as UTF-8. */
  static createOpReturnScript(data: Buffer | string): Script;

  /** Returns false rather than throwing when verification fails. */
  static validateTransaction(transaction: Transaction): boolean;
  /** Runs the interpreter over one input. Returns false rather than throwing. */
  static validateScript(
    unlockingScript: Script,
    lockingScript: Script,
    transaction: Transaction,
    inputIndex: number
  ): boolean;

  /** Builds a transaction at the given fee rate. Defaults to 10 sat/kb. */
  static createLowFeeTransaction(
    utxos: object[],
    outputs: Array<{ address: string; satoshis: number }>,
    feePerKb?: number
  ): Transaction;
}

export = CustomScriptHelper;
