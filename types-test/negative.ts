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

import bsv from '@smartledger/bsv'

// @expect-error the era methods are on the INSTANCE, not the constructor
bsv.Script.Interpreter.maxScriptNumLength()

// @expect-error a flag word is a number, not a string
export const f: string = bsv.Script.Interpreter.mainnetFlags()

// @expect-error checkStackLimits returns an error code or null, never a boolean
export const stackOk: boolean = new bsv.Script.Interpreter().checkStackLimits()

// @expect-error mainnetFlags takes { afterChronicle }, not a bare boolean
bsv.Script.Interpreter.mainnetFlags(false)

// @expect-error no such era; Genesis and Chronicle are the only two
bsv.Script.Interpreter.SCRIPT_UTXO_AFTER_TERANODE
