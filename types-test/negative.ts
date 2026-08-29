// Misuse of the typed subpaths. Every numbered line MUST produce an error;
// check-types.js asserts that, so a subpath silently degrading to `any` fails
// the build instead of passing quietly.
import Anchor from '@smartledger/bsv/anchor'
import StatusList from '@smartledger/bsv/statuslist'
import Shamir from '@smartledger/bsv/shamir'
import helper from '@smartledger/bsv/script-helper'
import SmartMiner from '@smartledger/bsv/security'

// @expect-error wrong argument type
Anchor.sha256Hex(12345)

// @expect-error comparing an unawaited Promise to a string is always false —
// this is the shape of the revocation bypass fixed in 7.5.2
export async function bypass (p: any) {
  return StatusList.getCredentialStatusEntry(p) === 'revoked'
}

// @expect-error static does not exist
Shamir.notARealMethod()

// @expect-error missing required arguments
helper.createSignature()

// @expect-error SIGHASH constants are numbers
export const s: string = helper.SIGHASH_ALL

// @expect-error method does not exist
new SmartMiner({}).minABlock()
