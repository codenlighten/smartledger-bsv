/**
 * Covenant construction.
 *
 * The default export is `SmartContract.Covenant`; `reconstructP2pkhScript` is
 * exported alongside it at runtime.
 */
import { SmartContract, Script, PublicKey } from '@smartledger/bsv';

declare const covenant: typeof SmartContract.Covenant & {
  /**
   * Rebuild the P2PKH locking script a covenant spends from, for preimage
   * construction.
   */
  reconstructP2pkhScript(publicKey: PublicKey | Buffer | string): Script;
};

export = covenant;
