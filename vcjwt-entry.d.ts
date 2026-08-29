/**
 * W3C Verifiable Credentials as JWTs.
 *
 * Same surface as `require("@smartledger/bsv").VcJwt`, plus `ALG_TO_CRV`, which
 * the module exports at runtime but the root declaration does not describe.
 */
import { VcJwt } from '@smartledger/bsv';

declare namespace vcjwt {
  /** Maps a JWS algorithm to the JWK curve it requires. */
  const ALG_TO_CRV: Readonly<Record<string, string>>;
}
declare const vcjwt: typeof VcJwt & { readonly ALG_TO_CRV: Readonly<Record<string, string>> };

export = vcjwt;
