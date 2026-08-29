/**
 * Shamir secret sharing.
 *
 * Same class as `require("@smartledger/bsv").crypto.Shamir`. The underscore-
 * prefixed `_*Legacy` helpers present at runtime are deliberately not declared:
 * they exist to reconstruct shares produced by pre-6.x releases and are not
 * part of the supported surface.
 */
import { crypto } from '@smartledger/bsv';
export = crypto.Shamir;
