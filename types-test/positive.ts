// Correct usage of every typed subpath. This file MUST compile with no errors.
import bsv from '@smartledger/bsv'
import { stringify } from '@smartledger/bsv/jcs'
import Anchor from '@smartledger/bsv/anchor'
import DIDWeb from '@smartledger/bsv/didweb'
import StatusList from '@smartledger/bsv/statuslist'
import VcJwt from '@smartledger/bsv/vcjwt'
import GDAF from '@smartledger/bsv/gdaf'
import LTP from '@smartledger/bsv/ltp'
import Shamir from '@smartledger/bsv/shamir'
import SmartContract from '@smartledger/bsv/smartcontract'
import Covenant from '@smartledger/bsv/covenant'
import helper from '@smartledger/bsv/script-helper'
import SmartMiner from '@smartledger/bsv/security'

const hash: string = Anchor.sha256Hex('data')
const canonical: string = stringify({ b: 1, a: 2 })
const shares = Shamir.split(Buffer.from('secret'), 2, 3)
const recovered: Buffer = Shamir.combine(shares)
const sighash: number = helper.SIGHASH_ALL
const alg: Readonly<Record<string, string>> = VcJwt.ALG_TO_CRV

const miner = new SmartMiner(bsv, { difficulty: 2 })
const height: number = miner.getBlockchainStats().currentHeight

// Statics that exist at runtime must not be compile errors.
LTP.Obligation
LTP.Right
Covenant.reconstructP2pkhScript

async function readStatus (p: Parameters<typeof StatusList.getCredentialStatusEntry>[0]) {
  const status = await StatusList.getCredentialStatusEntry(p)
  return status === 'revoked'
}

export { hash, canonical, recovered, sighash, alg, height, readStatus, DIDWeb, GDAF, SmartContract }

// --- Script.Interpreter -------------------------------------------------------
// The consensus surface shipped over 9.4.0-9.7.0 was entirely undeclared: the
// only thing bsv.d.ts said about the Interpreter was a `verify` returning
// boolean, so every era method and every flag constant was a compile error and
// the instance itself was an anonymous object with no `errstr` and no `stack`.
const I = bsv.Script.Interpreter

// Both construction forms the runtime supports.
const interp = new I()
const interpNoNew = I()

// The era flags, and the two helpers that assemble them.
const flags: number = I.mainnetFlags() | I.SCRIPT_GENESIS | I.SCRIPT_UTXO_AFTER_GENESIS |
  I.SCRIPT_UTXO_AFTER_CHRONICLE | I.SCRIPT_VERIFY_SIGPUSHONLY
const defaultFlags: number = I.currentConsensusFlags()
const preChronicle: number = I.mainnetFlags({ afterChronicle: false })
const eraOnly: number = flags & I.ERA_FLAGS

// Verification, with the era-derived limits the flags select.
const ok: boolean = interp.verify(
  new bsv.Script(''), new bsv.Script(''), new bsv.Transaction(), 0, flags, new bsv.crypto.BN(0))
const why: string = interp.errstr
const depth: number = interp.stack.length + interpNoNew.altstack.length

interp.set({ flags })
const genesis: boolean = interp.isAfterGenesis()
const chronicle: boolean = interp.isAfterChronicle()
const numWidth: number = interp.maxScriptNumLength()
const elemSize: number = interp.maxScriptElementSize()
const scriptSize: number = interp.maxScriptSize()
const opCount: number = interp.maxOpsPerScript()
const keys: number = interp.maxPubKeysPerMultisig()
const stackCap: number = interp.maxStackSize()
const stackMem: number = interp.maxStackMemoryUsage()
const used: number = interp.stackMemoryUsage()
const limitErr: string | null = interp.checkStackLimits()

// The statics a caller reads or moves.
const unlimited: number = I.UNLIMITED
const policy: number = I.STACK_MEMORY_USAGE_POLICY
I.MAX_STACK_MEMORY_USAGE_AFTER_GENESIS = I.STACK_MEMORY_USAGE_POLICY
const saved = I.getLimits()
I.useGenesisLimits(64 * 1024)
I.setLimits(saved)
I.useMainnetConsensus({ afterChronicle: true })
const chronicleHeight: number = I.CHRONICLE_ACTIVATION_HEIGHT
const truthy: boolean = I.castToBool(I.true)

// The debugging hook, with its step shape.
interp.stepListener = (step, stack, altstack) => {
  const at: number = step.pc
  const name: string = step.opcode.toString()
  void at; void name; void stack.length; void altstack.length
}

export {
  ok, why, depth, genesis, chronicle, numWidth, elemSize, scriptSize, opCount,
  keys, stackCap, stackMem, used, limitErr, unlimited, policy, defaultFlags,
  preChronicle, eraOnly, chronicleHeight, truthy
}

