'use strict'
// Emit cross-implementation vectors for the two blind spots in the node's script_tests.json.
// Everything is raw bytes so another implementation needs nothing from this library.
const bsv = require('..')
const I = bsv.Script.Interpreter
const Sig = bsv.crypto.Signature
const Sighash = bsv.Transaction.Sighash
const BN = bsv.crypto.BN
const Script = bsv.Script

const key = bsv.PrivateKey.fromBuffer(Buffer.alloc(32, 0x22))
const addr = key.toAddress()
const SATS = 100000
const lock = bsv.Script.buildPublicKeyHashOut(addr)

// Every flag bitcoin-sv v1.2.2 defines, by bit, from src/script/script_flags.h. The earlier
// version of this table listed only the flags each vector "meant", so `flags` and `flagsHex`
// disagreed — bits 2, 4, 11 and 12 were set in the hex and absent from the names. A session
// running these against two SDKs hit exactly that: nulldummy-v1 read as OK by name and as a
// rejection by hex. Two readings of one vector must not give two answers.
const NODE_FLAGS = {
  0: 'P2SH',
  1: 'STRICTENC',
  2: 'DERSIG',
  3: 'LOW_S',
  4: 'NULLDUMMY',
  5: 'SIGPUSHONLY',
  6: 'MINIMALDATA',
  7: 'DISCOURAGE_UPGRADABLE_NOPS',
  8: 'CLEANSTACK',
  9: 'CHECKLOCKTIMEVERIFY',
  10: 'CHECKSEQUENCEVERIFY',
  13: 'MINIMALIF',
  14: 'NULLFAIL',
  15: 'COMPRESSED_PUBKEYTYPE',
  16: 'SIGHASH_FORKID',
  18: 'GENESIS',
  19: 'UTXO_AFTER_GENESIS',
  20: 'CHRONICLE',
  21: 'UTXO_AFTER_CHRONICLE'
}

// Bits this library defines that the node does NOT. The node has no MONOLITH or MAGNETIC flag:
// those opcodes were restored on BSV in 2018 and are simply enabled, and its IsOpcodeDisabled
// disables only OP_2MUL and OP_2DIV, and only before Chronicle. Neither bit is a sighash or
// BIP143 flag. Verified: dropping both changes the verdict on none of these vectors, so another
// implementation should ignore them and use nodeFlagsHex.
const LIBRARY_ONLY_FLAGS = { 11: 'ENABLE_MONOLITH_OPCODES', 12: 'ENABLE_MAGNETIC_OPCODES' }

function splitFlags (f) {
  const node = []; const libraryOnly = []; const unknown = []
  let nodeHex = 0
  for (let bit = 0; bit < 32; bit++) {
    if ((f & (1 << bit)) === 0) continue
    if (NODE_FLAGS[bit]) { node.push(NODE_FLAGS[bit]); nodeHex |= (1 << bit) } else if (LIBRARY_ONLY_FLAGS[bit]) { libraryOnly.push(LIBRARY_ONLY_FLAGS[bit]) } else { unknown.push('bit' + bit) }
  }
  if (unknown.length) throw new Error('unmapped flag bits: ' + unknown.join(',') + ' in 0x' + f.toString(16))
  return { node: node.sort(), libraryOnly: libraryOnly.sort(), nodeHex }
}

function signedSpend (hashType, signFlags, version) {
  const utxo = new bsv.Transaction.UnspentOutput({
    txId: 'a'.repeat(64), outputIndex: 0, script: lock, satoshis: SATS
  })
  const tx = new bsv.Transaction().from(utxo).to(addr, SATS - 500)
  tx.version = version
  const sig = Sighash.sign(tx, key, hashType, 0, lock, new BN(SATS), signFlags)
  const unlock = new bsv.Script().add(sig.toTxFormat()).add(key.toPublicKey().toBuffer())
  tx.inputs[0].setScript(unlock)
  return { tx, unlock }
}

function rawSpend (unlockAsm, lockAsm, version) {
  const lk = bsv.Script.fromASM(lockAsm)
  const utxo = new bsv.Transaction.UnspentOutput({
    txId: 'b'.repeat(64), outputIndex: 0, script: lk, satoshis: SATS
  })
  const tx = new bsv.Transaction().from(utxo).to(addr, SATS - 500)
  tx.version = version
  const unlock = bsv.Script.fromASM(unlockAsm)
  tx.inputs[0].setScript(unlock)
  return { tx, unlock, lk }
}

// Result names this library reports more precisely than the node does, and the node code each
// stands for. Taken from tools/sv-vector-harness.js, where the same table scores the corpus.
// The node renders every verdict through its own enum -> name table (FormatScriptError,
// src/test/script_tests.cpp), so the corpus's expected column uses THOSE names, not the enum
// suffixes: SCRIPT_ERR_MUST_USE_FORKID is called MISSING_FORKID and SCRIPT_ERR_SIG_NULLFAIL is
// called NULLFAIL. Vendored beside the vectors so a label cannot be invented. One row here said
// MUST_USE_FORKID, the enum suffix, while the other twenty used table names; the Rust session
// running these caught it.
const NODE_ERROR_NAMES = require('../test/data/bitcoin-sv/script-error-names.json')

// Our errstr mapped to what the node calls the same error. A rename, not a narrowing, which is
// why it is a separate table from NARROWER below.
const NODE_SHORT_NAMES = {}
Object.keys(NODE_ERROR_NAMES).forEach(function (enumSuffix) {
  if (enumSuffix !== NODE_ERROR_NAMES[enumSuffix]) {
    NODE_SHORT_NAMES[enumSuffix] = NODE_ERROR_NAMES[enumSuffix]
  }
})

const NARROWER = {
  EVAL_FALSE_IN_STACK: 'EVAL_FALSE',
  EVAL_FALSE_NO_RESULT: 'EVAL_FALSE',
  EVAL_FALSE_NO_P2SH_STACK: 'EVAL_FALSE',
  EVAL_FALSE_IN_P2SH_STACK: 'EVAL_FALSE',
  SIG_DER_INVALID_FORMAT: 'SIG_DER',
  SIG_DER_HIGH_S: 'SIG_HIGH_S',
  INVALID_OPERAND_SIZE: 'OPERAND_SIZE',
  INVALID_SPLIT_RANGE: 'SPLIT_RANGE'
}

const MAIN = I.mainnetFlags()
const vectors = []

function record (o) {
  const interp = new I()
  let got
  try {
    got = interp.verify(o.unlock, o.lockScript, o.tx, 0, o.flags, new BN(SATS))
      ? 'OK' : interp.errstr.replace(/^SCRIPT_ERR_/, '')
  } catch (e) { got = 'THREW: ' + e.message }
  vectors.push({
    id: o.id,
    blindSpot: o.blindSpot,
    comment: o.comment,
    nodeExpects: o.nodeExpects,
    regressionClass: o.regressionClass,
    txVersion: o.tx.version,
    // nodeFlags / nodeFlagsHex are what another implementation should use: they agree with each
    // other exactly, and contain only bits the node defines.
    nodeFlags: splitFlags(o.flags).node,
    nodeFlagsHex: '0x' + splitFlags(o.flags).nodeHex.toString(16),
    libraryOnlyFlags: splitFlags(o.flags).libraryOnly,
    flagsHexAsRun: '0x' + o.flags.toString(16),
    prevoutScriptHex: o.lockScript.toBuffer().toString('hex'),
    prevoutSatoshis: SATS,
    spendingTxHex: o.tx.uncheckedSerialize(),
    scriptSigHex: o.unlock.toBuffer().toString('hex'),
    smartledgerBsv_9_15_0: got,
    // Our name is sometimes NARROWER than the node's, which is not a disagreement. The node
    // reports one EVAL_FALSE for four distinct situations; we say which. Anyone diffing
    // verdicts should resolve through `narrowerNames` below before calling it a mismatch.
    agreesWithNode: got === o.nodeExpects || NARROWER[got] === o.nodeExpects ||
      NODE_SHORT_NAMES[got] === o.nodeExpects
  })
}

// ---- Blind spot 1: no row pairs LOW_S with a hash-type expectation ----
let s = signedSpend(Sig.SIGHASH_ALL, 0, 1)
record({ id: 'lowS-masks-must-use-forkid',
  blindSpot: 'LOW_S never paired with a hash-type expectation',
  comment: 'Signature carries no FORKID bit and is signed over the legacy digest, so it verifies. FORKID is required by the flags. Accepted by @smartledger/bsv <= 9.14.0 because LOW_S short-circuited the STRICTENC block.',
  nodeExpects: 'MISSING_FORKID',
  regressionClass: 'false-accept in <= 9.14.0',
  tx: s.tx,
  unlock: s.unlock,
  lockScript: lock,
  flags: MAIN })

s = signedSpend(0x60 | Sig.SIGHASH_FORKID, I.SCRIPT_ENABLE_SIGHASH_FORKID, 1)
record({ id: 'lowS-masks-sig-hashtype',
  blindSpot: 'LOW_S never paired with a hash-type expectation',
  comment: 'Base sighash type 0x60 is not one of the defined types. Accepted by <= 9.14.0 for the same reason.',
  nodeExpects: 'SIG_HASHTYPE',
  regressionClass: 'false-accept in <= 9.14.0',
  tx: s.tx,
  unlock: s.unlock,
  lockScript: lock,
  flags: MAIN })

const NO_CHRON = MAIN & ~(I.SCRIPT_CHRONICLE | I.SCRIPT_ENABLE_CHRONICLE | I.SCRIPT_UTXO_AFTER_CHRONICLE)
s = signedSpend(Sig.SIGHASH_ALL | Sig.SIGHASH_FORKID | Sig.SIGHASH_CHRONICLE,
  I.SCRIPT_ENABLE_SIGHASH_FORKID | I.SCRIPT_CHRONICLE, 1)
record({ id: 'lowS-masks-illegal-chronicle',
  blindSpot: 'LOW_S never paired with a hash-type expectation',
  comment: 'Type byte sets the 0x20 Chronicle bit while Chronicle does not apply. Refusing this is what lets the digest be selected by the bit alone.',
  nodeExpects: 'ILLEGAL_CHRONICLE',
  regressionClass: 'false-accept in <= 9.14.0',
  tx: s.tx,
  unlock: s.unlock,
  lockScript: lock,
  flags: NO_CHRON })

// ---- Blind spot 2: every row carries transaction version 1 ----
const CH = I.SCRIPT_VERIFY_P2SH | I.SCRIPT_GENESIS | I.SCRIPT_UTXO_AFTER_GENESIS |
  I.SCRIPT_CHRONICLE | I.SCRIPT_UTXO_AFTER_CHRONICLE

for (const v of [1, 2]) {
  let r = rawSpend('', 'OP_2 OP_IF OP_1 OP_ENDIF', v)
  record({ id: 'minimalif-v' + v,
    blindSpot: 'every row carries transaction version 1',
    comment: 'Non-minimal OP_IF operand under Chronicle. Version > 1 opts into malleability, so the node stops enforcing MINIMALIF.',
    nodeExpects: v > 1 ? 'OK' : 'MINIMALIF',
    regressionClass: v > 1 ? 'false-reject in <= 9.14.0' : 'agreed before and after',
    tx: r.tx,
    unlock: r.unlock,
    lockScript: r.lk,
    flags: CH | I.SCRIPT_VERIFY_MINIMALIF })

  r = rawSpend('OP_1 OP_1', 'OP_NOP', v)
  record({ id: 'cleanstack-v' + v,
    blindSpot: 'every row carries transaction version 1',
    comment: 'Two items left on the stack under Chronicle. Clean stack was only ever policy, so the node ties it to the version.',
    nodeExpects: v > 1 ? 'OK' : 'CLEANSTACK',
    regressionClass: v > 1 ? 'false-reject in <= 9.14.0' : 'agreed before and after',
    tx: r.tx,
    unlock: r.unlock,
    lockScript: r.lk,
    flags: CH | I.SCRIPT_VERIFY_CLEANSTACK })

  r = rawSpend('OP_1 OP_NOP', 'OP_NOP', v)
  record({ id: 'sigpushonly-v' + v,
    blindSpot: 'every row carries transaction version 1',
    comment: 'Non-push scriptSig under Chronicle with SIGPUSHONLY set.',
    nodeExpects: v > 1 ? 'OK' : 'SIG_PUSHONLY',
    regressionClass: v > 1 ? 'false-reject in <= 9.14.0' : 'agreed before and after',
    tx: r.tx,
    unlock: r.unlock,
    lockScript: r.lk,
    flags: CH | I.SCRIPT_VERIFY_SIGPUSHONLY })
}

// Like rawSpend, but takes built Script objects rather than ASM.
function rawSpendScripts (unlock, lk, version) {
  const utxo = new bsv.Transaction.UnspentOutput({
    txId: 'c'.repeat(64), outputIndex: 0, script: lk, satoshis: SATS
  })
  const tx = new bsv.Transaction().from(utxo).to(addr, SATS - 500)
  tx.version = version
  tx.inputs[0].setScript(unlock)
  return { tx, unlock, lk }
}

// ---- The remaining EnforceNonMalleability sites, so all seven are covered ----
// interpreter.cpp 285 SIG_HIGH_S, 433 requireMinimal, 801 MINIMALIF, 1493 + 1643 SIG_NULLFAIL,
// 1666 SIG_NULLDUMMY, 2441 CLEANSTACK, plus SIGPUSHONLY in VerifyScript.
const pubBuf = key.toPublicKey().toBuffer()
const FORKID_ALL = Sig.SIGHASH_ALL | Sig.SIGHASH_FORKID

for (const v of [1, 2]) {
  // LOW_S. A VALID high-S signature: (r, s) and (r, N-s) both verify, so negating s keeps the
  // signature good and only the low-S policy objects. At version > 1 it is accepted and the
  // script then succeeds on its merits.
  const utxo0 = new bsv.Transaction.UnspentOutput({
    txId: 'd'.repeat(64), outputIndex: 0, script: lock, satoshis: SATS
  })
  const t = new bsv.Transaction().from(utxo0).to(addr, SATS - 500)
  t.version = v
  const good = Sighash.sign(t, key, FORKID_ALL, 0, lock, new BN(SATS),
    I.SCRIPT_ENABLE_SIGHASH_FORKID)
  const N = bsv.crypto.Point.getN()
  const highS = new Sig(good.r, N.sub(good.s))
  highS.nhashtype = FORKID_ALL
  const unlockHigh = new bsv.Script().add(highS.toTxFormat()).add(pubBuf)
  t.inputs[0].setScript(unlockHigh)
  record({ id: 'lowS-highS-v' + v,
    blindSpot: 'every row carries transaction version 1',
    comment: 'A valid but high-S signature under Chronicle. Negating s leaves ECDSA verification passing, so only the LOW_S policy objects — and version > 1 exempts the transaction from it.',
    nodeExpects: v > 1 ? 'OK' : 'SIG_HIGH_S',
    regressionClass: v > 1 ? 'false-reject in <= 9.14.0' : 'agreed before and after',
    tx: t,
    unlock: unlockHigh,
    lockScript: lock,
    flags: CH | I.SCRIPT_VERIFY_LOW_S | I.SCRIPT_ENABLE_SIGHASH_FORKID })

  // MINIMALDATA: OP_PUSHDATA1 pushing a single byte, where a direct push would do.
  let r = rawSpendScripts(Script.fromBuffer(Buffer.from('4c0101', 'hex')),
    Script.fromASM('OP_1'), v)
  record({ id: 'minimaldata-v' + v,
    blindSpot: 'every row carries transaction version 1',
    comment: 'Non-minimal push under Chronicle. requireMinimal is VerifyMinimalData(flags) AND EnforceNonMalleability(flags, version), so version > 1 switches it off.',
    nodeExpects: v > 1 ? 'OK' : 'MINIMALDATA',
    regressionClass: v > 1 ? 'false-reject in <= 9.14.0' : 'agreed before and after',
    tx: r.tx,
    unlock: r.unlock,
    lockScript: r.lk,
    flags: CH | I.SCRIPT_VERIFY_MINIMALDATA })

  // NULLFAIL: a non-empty but invalid signature on a CHECKSIG that fails. OP_NOT turns the
  // false result true, so version > 1 gives OK rather than merely a different error.
  const bogus = Buffer.concat([Buffer.from('3006020101020101', 'hex'), Buffer.from([FORKID_ALL])])
  r = rawSpendScripts(new bsv.Script().add(bogus).add(pubBuf),
    Script.fromASM('OP_CHECKSIG OP_NOT'), v)
  record({ id: 'nullfail-v' + v,
    blindSpot: 'every row carries transaction version 1',
    comment: 'CHECKSIG fails with a non-empty signature. Under Chronicle version > 1 the node stops requiring the signature be empty on failure.',
    nodeExpects: v > 1 ? 'OK' : 'NULLFAIL',
    regressionClass: v > 1 ? 'false-reject in <= 9.14.0' : 'agreed before and after',
    tx: r.tx,
    unlock: r.unlock,
    lockScript: r.lk,
    flags: CH | I.SCRIPT_VERIFY_NULLFAIL | I.SCRIPT_ENABLE_SIGHASH_FORKID })

  // NULLDUMMY: CHECKMULTISIG's extra argument non-empty.
  r = rawSpendScripts(new bsv.Script().add(Buffer.from([0x01])).add(Buffer.alloc(0)),
    new bsv.Script().add('OP_1').add(pubBuf).add('OP_1').add('OP_CHECKMULTISIG').add('OP_NOT'), v)
  record({ id: 'nulldummy-v' + v,
    blindSpot: 'every row carries transaction version 1',
    comment: 'The argument CHECKMULTISIG consumes without checking is non-empty. Under Chronicle version > 1 the node stops requiring it be zero.',
    nodeExpects: v > 1 ? 'OK' : 'SIG_NULLDUMMY',
    regressionClass: v > 1 ? 'false-reject in <= 9.14.0' : 'agreed before and after',
    tx: r.tx,
    unlock: r.unlock,
    lockScript: r.lk,
    flags: CH | I.SCRIPT_VERIFY_NULLDUMMY | I.SCRIPT_ENABLE_SIGHASH_FORKID })
}

// ---- Blind spot 3: P2SH after Genesis. In the corpus, but only reachable by an
// implementation that actually replays script_tests.json rather than its own fixtures.
const Hash = bsv.crypto.Hash
const BAD_REDEEM = bsv.Script.fromASM('OP_0') // a redeem script that FAILS
const BAD_HEX = BAD_REDEEM.toBuffer().toString('hex')
const BAD_OUT = 'OP_HASH160 ' + Hash.sha256ripemd160(BAD_REDEEM.toBuffer()).toString('hex') + ' OP_EQUAL'

for (const after of [false, true]) {
  const f = I.SCRIPT_VERIFY_P2SH | (after ? (I.SCRIPT_GENESIS | I.SCRIPT_UTXO_AFTER_GENESIS) : 0)
  const r = rawSpend(BAD_HEX, BAD_OUT, 1)
  record({
    id: 'p2sh-' + (after ? 'after' : 'before') + '-genesis-failing-redeem',
    blindSpot: 'P2SH was removed at Genesis; only the reference corpus covers this',
    comment: after
      ? 'Genesis removed P2SH. The output is an ordinary script, so the hash-and-equal IS the whole check and the pushed bytes are data, never code. An implementation that still evaluates the redeem script rejects a spend the network accepts.'
      : 'Before Genesis the redeem script runs, and this one leaves false on the stack. An implementation that skips P2SH evaluation here accepts a spend the network rejects.',
    nodeExpects: after ? 'OK' : 'EVAL_FALSE',
    regressionClass: after ? 'false-reject in <= 9.14.0' : 'agreed before and after',
    tx: r.tx,
    unlock: r.unlock,
    lockScript: r.lk,
    flags: f
  })
}

// ---- Blind spot 4: restored Chronicle opcodes gate on the UTXO's era, not a local opt-in.
// An implementation that treats 0xb3-0xb5 as unconditional NOPs consumes nothing and lets an
// out-of-range argument through silently. That is a false accept.
for (const after of [false, true]) {
  const f = I.SCRIPT_VERIFY_P2SH | I.SCRIPT_GENESIS | I.SCRIPT_UTXO_AFTER_GENESIS |
    (after ? I.SCRIPT_UTXO_AFTER_CHRONICLE : 0)
  // OP_LEFT with a length past the end of the operand.
  const r = rawSpend('aabbcc OP_5', 'OP_LEFT', 1)
  record({
    id: 'op-left-out-of-range-' + (after ? 'after' : 'before') + '-chronicle',
    blindSpot: 'restored opcodes follow the OUTPUT era, so a local opt-in flag reads as a NOP',
    comment: after
      ? 'Post-Chronicle UTXO: OP_LEFT is a real opcode and a length past the end is an error. An implementation treating 0xb3 as a NOP consumes nothing, leaves the operands, and accepts.'
      : 'Pre-Chronicle UTXO: the byte is OP_NOP4, so it does nothing and the operands stay on the stack. Top of stack is 5, which is true, so the script succeeds.',
    nodeExpects: after ? 'INVALID_NUMBER_RANGE' : 'OK',
    regressionClass: after ? 'false-accept in <= 9.14.0' : 'agreed before and after',
    tx: r.tx,
    unlock: r.unlock,
    lockScript: r.lk,
    flags: f
  })
}

console.log(JSON.stringify({
  authoritative: 'nodeFlagsHex — it equals the set named in nodeFlags exactly. flagsHexAsRun is what this library was invoked with and additionally carries libraryOnlyFlags, which the node does not define and which change none of these verdicts.',
  nodeErrorNames: NODE_ERROR_NAMES,
  nodeShortNames: NODE_SHORT_NAMES,
  nodeFlagBits: NODE_FLAGS,
  libraryOnlyFlagBits: LIBRARY_ONLY_FLAGS,
  narrowerNames: NARROWER,
  note: 'Cross-implementation vectors for four defect classes in bitcoin-sv v1.2.2 script_tests.json. Every row of that corpus carries transaction version 1, and no row pairs SCRIPT_VERIFY_LOW_S with a hash-type expectation, so neither defect class below is reachable by replaying it. Flag names are the node\'s. nodeExpects is the verdict derived from bitcoin-sv v1.2.2 source, not from a live node.',
  source: '@smartledger/bsv 9.15.0',
  generated: new Date().toISOString().slice(0, 10),
  vectors
}, null, 2))
