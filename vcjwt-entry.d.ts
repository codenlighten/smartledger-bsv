/**
 * W3C Verifiable Credentials as JWTs.
 *
 * Same surface as `require("@smartledger/bsv").VcJwt`, plus `ALG_TO_CRV`, which
 * the module exports at runtime but the root declaration does not describe.
 */
import { VcJwt } from '@smartledger/bsv';

// A `declare namespace vcjwt` alongside this const was a duplicate identifier
// (TS2300), which failed the whole subpath for consumers compiling with
// skipLibCheck disabled. The intersection below already carries ALG_TO_CRV.
declare const vcjwt: typeof VcJwt & {
  /** Maps a JWS algorithm to the JWK curve it requires. */
  readonly ALG_TO_CRV: Readonly<Record<string, string>>;
};

export = vcjwt;
