/**
 * StatusList2021 revocation lists.
 *
 * Note `getCredentialStatusEntry` is async — awaiting it is not optional.
 * Comparing the returned Promise to a string type-checks and is always false,
 * which is how a revoked credential passes.
 *
 * Same surface as `require("@smartledger/bsv").StatusList`.
 */
import { StatusList } from '@smartledger/bsv';
export = StatusList;
