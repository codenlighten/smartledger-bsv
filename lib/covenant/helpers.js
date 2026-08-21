'use strict'
/**
 * SmartContract covenant helpers
 * ==============================
 *
 * Shared utilities for building and verifying custom locking scripts &
 * OP_PUSH_TX covenants: a consensus-flag verify() harness, raw BIP-143 preimage
 * access, signing, and fund/spend scaffolding. Used by ./pushtx, ./pels, ./token
 * and ./locks.
 */

var Script = require('../script')
var Interpreter = require('../script/interpreter')
var Opcode = require('../opcode')
var Transaction = require('../transaction')
var Input = require('../transaction/input')
var Output = require('../transaction/output')
var sighash = require('../transaction/sighash')
var BN = require('../crypto/bn')
var Hash = require('../crypto/hash')
var Signature = require('../crypto/signature')

// SIGHASH_ALL | SIGHASH_FORKID — the BSV default these covenants are built for.
var SIGHASH = Signature.SIGHASH_ALL | Signature.SIGHASH_FORKID // 0x41

/**
 * Current BSV mainnet consensus + standard relay flags — what miners actually
 * enforce. A covenant that verifies here is expected to be accepted on broadcast.
 *
 * This DELEGATES to Interpreter.mainnetFlags() rather than assembling a list, and
 * that is the whole point. Until 8.4.0 it was hand-assembled, and the hand-written
 * list omitted the three UTXO-ERA flags — SCRIPT_GENESIS, SCRIPT_UTXO_AFTER_GENESIS
 * and SCRIPT_UTXO_AFTER_CHRONICLE. It carried SCRIPT_ENABLE_CHRONICLE, which enables
 * the string opcodes, so the omission was easy to miss: the opcodes ran, and only the
 * *limits* were wrong.
 *
 * The era flags are what the interpreter derives its data limits from. Without them
 * every covenant was verified under PRE-GENESIS rules — a 520-byte element cap that
 * BSV removed in February 2020. An OP_PUSH_TX preimage is ~585 bytes, so this
 * library's flagship feature could not verify against its own harness, and
 * `enableGenesis()` existed to paper over it by raising process-wide statics. That
 * was treating the symptom: raising the statics cannot enable post-Genesis
 * arithmetic (only the era flags can) and it weakens pre-Genesis validation, turning
 * 15 of the reference node's 22 SCRIPTNUM_OVERFLOW vectors into false accepts.
 *
 * Delegating also means the covenant path tracks consensus automatically instead of
 * drifting the next time an era activates. `mainnetFlags()` is the same function the
 * Interpreter uses for a no-flags verify(), so "verify locally" and "what the network
 * does" cannot diverge again without both moving together.
 *
 * Two flags in the old list are deliberately gone: SCRIPT_VERIFY_CHECKLOCKTIMEVERIFY
 * and SCRIPT_VERIFY_CHECKSEQUENCEVERIFY. Genesis reverted OP_CLTV/OP_CSV to
 * upgradable NOPs for outputs created after it (see interpreter.js, the
 * `isAfterGenesis()` short-circuit), so once the era flags are present these two
 * change nothing. Keeping them would have implied a time-lock guarantee mainnet does
 * not provide — see the note on Locks.timeLockCLTV.
 *
 * NULLFAIL is gained, which is strictly stricter.
 */
function flags () {
  return Interpreter.mainnetFlags()
}

/**
 * DEPRECATED and now a NO-OP. Removed in 8.4.0; the symbol survives one major so
 * existing callers do not crash, and goes away in 9.0.0.
 *
 * This used to raise the interpreter's process-wide limit statics, and covenants
 * genuinely did not verify without it — but the cause was `flags()` omitting the
 * UTXO-era flags, so the era-derived limits never applied and the statics were the
 * only lever left. `flags()` now delegates to Interpreter.mainnetFlags(), the era
 * flags are present, and there is nothing for this to do.
 *
 * It is a no-op rather than a passthrough on purpose. Interpreter.useGenesisLimits()
 * mutates process-wide state, so calling it from a covenant helper silently changed
 * the rules for unrelated code later in the same process — including, measurably,
 * turning 15 of the reference node's 22 SCRIPTNUM_OVERFLOW vectors into false
 * accepts. Restoring that as a courtesy to old call sites would reintroduce the
 * defect this release removes.
 *
 * Interpreter.useGenesisLimits() itself is untouched and still available for callers
 * who really do want to move the statics; pair it with getLimits()/setLimits().
 */
function enableGenesis () {
  if (!enableGenesis._warned && !process.env.BSV_HIDE_DEPRECATIONS) {
    enableGenesis._warned = true
    console.warn('[bsv] SmartContract.enableGenesis() is a deprecated no-op since 8.4.0 and ' +
      'will be removed in 9.0.0. Covenants now verify under mainnet consensus flags with no ' +
      'opt-in; delete the call. Set BSV_HIDE_DEPRECATIONS=1 to silence.')
  }
  return Interpreter
}

/**
 * Verify an unlocking script against a locking script through the consensus
 * interpreter. @returns {{ok:boolean, err:string}}
 */
function verify (unlockingScript, lockingScript, opts) {
  opts = opts || {}
  var interp = new Interpreter()
  var ok = interp.verify(
    unlockingScript,
    lockingScript,
    opts.tx || new Transaction(),
    opts.inputIndex || 0,
    opts.flags || flags(),
    new BN(opts.satoshis || 0)
  )
  return { ok: ok, err: interp.errstr || '' }
}

/** Raw BIP-143 preimage (the serialization that is double-SHA256'd), not the digest. */
function rawPreimage (tx, inputIndex, lockingScript, satoshis, sighashType) {
  return sighash.sighashPreimage(
    tx, sighashType || SIGHASH, inputIndex, lockingScript, new BN(satoshis))
}

/** Sighash digest = HASH256(rawPreimage) — useful for asserting OP_PUSH_TX linkage in JS. */
function sighashDigest (tx, inputIndex, lockingScript, satoshis, sighashType) {
  return Hash.sha256sha256(rawPreimage(tx, inputIndex, lockingScript, satoshis, sighashType))
}

/** DER+sighash-byte signature over `lockingScript` for `inputIndex`. */
function signInput (tx, privateKey, inputIndex, lockingScript, satoshis, sighashType) {
  sighashType = sighashType || SIGHASH
  var sig = sighash.sign(tx, privateKey, sighashType, inputIndex, lockingScript, new BN(satoshis))
  return Buffer.concat([sig.toDER(), Buffer.from([sighashType])])
}

/**
 * Build a funding tx paying `satoshis` into `lockingScript`, plus a spending tx
 * consuming it with the supplied outputs. Returns { funding, spend }; the caller
 * sets spend.inputs[0] script.
 */
function fundAndSpend (lockingScript, satoshis, opts) {
  opts = opts || {}
  var funding = new Transaction().addOutput(
    new Output({ script: lockingScript, satoshis: satoshis }))
  var spend = new Transaction()
  spend.addInput(
    new Input({ prevTxId: funding.hash, outputIndex: 0, script: Script.empty() }),
    lockingScript, satoshis)
  if (opts.outputs) opts.outputs.forEach(function (o) { spend.addOutput(o) })
  return { funding: funding, spend: spend }
}

/** A P2PKH Output object for an address or public key. */
function p2pkhOutput (addressOrPubKey, satoshis) {
  var addr = addressOrPubKey.toAddress ? addressOrPubKey.toAddress() : addressOrPubKey
  return new Output({ script: Script.buildPublicKeyHashOut(addr), satoshis: satoshis })
}

/** Minimal little-endian script-number Buffer (push as data to put a number on-stack). */
function scriptNum (n) {
  // Minimal on-stack number: 0..16 and -1 use the dedicated opcodes (OP_0..OP_16,
  // OP_1NEGATE) instead of a data push, so covenant scripts stay MINIMALDATA-clean
  // (mainnet relay policy). Larger values use a minimal scriptNum push. The result
  // is passed to Script.add(), which accepts an opcode number or a Buffer.
  if (n === 0) return Opcode.OP_0
  if (n === -1) return Opcode.OP_1NEGATE
  if (n >= 1 && n <= 16) return Opcode['OP_' + n]
  return new BN(n).toScriptNumBuffer()
}

module.exports = {
  SIGHASH: SIGHASH,
  flags: flags,
  enableGenesis: enableGenesis,
  verify: verify,
  rawPreimage: rawPreimage,
  sighashDigest: sighashDigest,
  signInput: signInput,
  fundAndSpend: fundAndSpend,
  p2pkhOutput: p2pkhOutput,
  scriptNum: scriptNum
}
