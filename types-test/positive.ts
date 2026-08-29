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
