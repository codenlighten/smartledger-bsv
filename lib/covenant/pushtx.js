'use strict'
/**
 * SmartContract.PushTx — a correct, interpreter-verified OP_PUSH_TX (nChain
 * WP1605) for Bitcoin SV.
 *
 * The locking script GENERATES an ECDSA signature in-script from a preimage the
 * spender pushed, then OP_CHECKSIG verifies it against a fixed public key.
 * Equality of HASH256(preimage) with the sighash the interpreter derives from the
 * real spend is the intended, and the only readily attainable, way to pass — so in
 * practice a passing check means the pushed preimage IS this transaction, and the
 * script can read and constrain its own spending transaction.
 *
 * Stated precisely, because the obvious phrasing overstates it: a passing check
 * does NOT *prove* the two digests are equal. ECDSA accepts both `s` and `n - s`
 * for one digest, so with a fixed `r` a pushed preimage satisfying the sign-
 * ambiguity relation against the real digest would also verify. Finding such a
 * pair looks like generic ~2^128 two-list work and no practical attack is known,
 * so this is a security ASSUMPTION of the technique rather than an identity — the
 * assumption every OP_PUSH_TX covenant rests on, named here rather than implied.
 *
 * Optimal parameters: private key a = 1, ephemeral k = 1  =>  r = Gx,
 *   s = (e + Gx) mod n,  pubkey P = 02||Gx,  e = HASH256(preimage).
 *
 * Verifies under mainnet consensus flags with no opt-in (8.4.0+). Earlier versions
 * required SmartContract.enableGenesis() first; that call is now a deprecated no-op.
 */

var Script = require('../script')
var Opcode = require('../opcode')
var Signature = require('../crypto/signature')
var BN = require('../crypto/bn')
var Hash = require('../crypto/hash')
var H = require('./helpers')
var ownOption = require('../util/own-option')

var SIGHASH = H.SIGHASH
var scriptNum = H.scriptNum

// secp256k1 constants (big-endian)
var Gx = Buffer.from('79be667ef9dcbbac55a06295ce870b07029bfcdb2dce28d959f2815b16f81798', 'hex')
var N = new BN('fffffffffffffffffffffffffffffffebaaedce6af48a03bbfd25e8cd0364141', 16)
var PUBKEY = Buffer.concat([Buffer.from([0x02]), Gx]) // compressed P = G (y even)

// script-number (little-endian) forms
var gxLe = Buffer.from(Gx).reverse() // 32B, top 0x79 => positive
var N_LE = Buffer.concat([Buffer.from(N.toBuffer()).reverse(), Buffer.from([0x00])]) // 33B positive

// fixed DER prefix: SEQUENCE(0x44) INTEGER(0x20) r=Gx INTEGER(0x20)
var DER_PREFIX = Buffer.concat([Buffer.from([0x30, 0x44, 0x02, 0x20]), Gx, Buffer.from([0x02, 0x20])])

/** Reverse a fixed n-byte buffer on top of the stack (big-endian <-> little-endian). */
// Cost, and why it is not worth optimising — measured 2026-10-17, recorded here so the question
// is not re-litigated from estimates. One 32-byte reversal is 124 bytes and 93 counted opcodes
// (those above OP_16); the gate uses two, which is **248 of its 377 bytes (66%)** and **186 of
// its 202 counted opcodes (92%)**. So the reversal dominates, and three separate reasons say
// leave it alone:
//
//   Bytes are worthless here. Saving all 248 is 0.0124 satoshi per spend at 0.05 sat/KB.
//
//   The opcode budget, which is the resource the reversal really consumes, is UNREACHABLE. A
//   cap on opcodes exists only pre-Genesis (500 on BSV — not Bitcoin Core's 201), and
//   pre-Genesis this gate cannot run at all: its 536-byte preimage fails the 520-byte element
//   cap first. Post-Genesis `maxOpsPerScript()` is UNLIMITED. So no chain that can execute the
//   gate has an opcode limit for it to press against. For reference if that ever changes:
//   valueCovenant adds 5 counted opcodes over the gate, valueCovenantSingle 8, ownershipToken
//   53 — so two gates (404) plus two Token bodies (106) would miss the pre-Genesis cap by 10.
//
//   4(n-1) is optimal for small n. Exhaustive BFS over stack states, costed in script bytes,
//   across an 18-opcode set (SWAP/CAT/DUP/DROP/NIP/OVER/TUCK/ROT, both altstack ops, and
//   `OP_k OP_SPLIT` for k = 1..8) finds no shorter program for n = 2, 3 or 4: 4, 8 and 12 bytes
//   respectively, matching this function exactly. That is optimality WITHIN that opcode set for
//   those lengths — it is not a proof for 32, and n >= 5 exhausted memory.
//
// What has NOT been ruled out, stated so nobody mistakes the above for a closed question: a
// byte-wise big-endian addition with carry propagation and conditional reduction mod n, which
// would avoid both reversals and must be measured against 248 bytes AND 186 counted opcodes
// rather than against one reversal. ECDSA fixes the integer VALUE, not the in-script
// representation, so that route is unmeasured rather than impossible. What IS ruled out is
// duplicating the hash to skip the second reversal: that one operates on s = (e + Gx) mod n, a
// computed value, so no preserved copy of the input can stand in for it.
//
// And the strategic cost of any change: this gate is externally witnessed. Three independent
// implementations agree on it, `test/data/pushtx-gate-pin.json` pins it for vendoring, and a
// sibling package reproduces it byte-identically. A new version would need new vectors and fresh
// node-level verification — it would not invalidate the evidence for the pinned version, but it
// would have to earn its own.
function reverseBytes (script, n) {
  var i
  for (i = 0; i < n - 1; i++) script.add(Opcode.OP_1).add(Opcode.OP_SPLIT)
  for (i = 0; i < n - 1; i++) script.add(Opcode.OP_SWAP).add(Opcode.OP_CAT)
  return script
}

// Common SIGHASH flag combinations (all include FORKID, required on BSV). The
// marketplace/partially-signed pattern uses SINGLE|ANYONECANPAY: the signer commits
// only to its own input and its own output (the output at the same index), leaving
// a counterparty free to add funding inputs and change outputs without invalidating
// the signature.
var SIGHASH_ALL_FORKID = Signature.SIGHASH_ALL | Signature.SIGHASH_FORKID // 0x41
var SIGHASH_SINGLE_FORKID = Signature.SIGHASH_SINGLE | Signature.SIGHASH_FORKID // 0x43
var SIGHASH_SINGLE_ANYONECANPAY_FORKID =
  Signature.SIGHASH_SINGLE | Signature.SIGHASH_ANYONECANPAY | Signature.SIGHASH_FORKID // 0xc3
// ALL|ANYONECANPAY commits to ALL outputs (so the covenant can pin the FULL output
// set) while leaving inputs open for a counterparty to add funding. This is the flag
// the 1Sat Ordinals OrdLock uses: the buyer supplies the surrounding outputs and the
// covenant binds the seller's payment output into the committed hashOutputs.
var SIGHASH_ALL_ANYONECANPAY_FORKID =
  Signature.SIGHASH_ALL | Signature.SIGHASH_ANYONECANPAY | Signature.SIGHASH_FORKID // 0xc1

/**
 * Append the in-script signature generator + verifier ("PUSH_TX core").
 * Pre:  top of stack = preimage. Post: top = OP_CHECKSIG result.
 *
 * @param {Script} script
 * @param {object} [opts]
 * @param {number} [opts.sighashType=0x41] the SIGHASH flag byte baked into the
 *   synthetic signature. OP_CHECKSIG derives the spend's sighash using THIS flag,
 *   so the spender must push the matching BIP-143 preimage (grind with the same
 *   sighashType). Defaults to SIGHASH_ALL|FORKID — existing covenants are unchanged.
 */
function pushTxCore (script, opts) {
  var sighashType = (opts && opts.sighashType) || SIGHASH
  script.add(Opcode.OP_HASH256) // z = HASH256(preimage), 32B BE
  reverseBytes(script, 32) // -> little-endian = e. The grind guarantees e is
  // already positive and minimally encoded (z[0] in 0x01..0x7f), so NO 0x00 sign
  // byte is appended — keeping the script MINIMALDATA-clean (mainnet-relayable).
  script.add(gxLe).add(Opcode.OP_ADD) // e + Gx
  script.add(N_LE).add(Opcode.OP_MOD) // s = (e + Gx) mod n
  script.add(scriptNum(32)).add(Opcode.OP_NUM2BIN) // s -> 32-byte LE
  reverseBytes(script, 32) // -> big-endian (DER INTEGER body) ; stack: [s_be]
  // Build the DER signature and the pubkey from a SINGLE Gx push (Gx is both the
  // r-value inside the DER prefix and the body of the 02||Gx pubkey). Sharing it
  // via the altstack saves a 32-byte constant vs. embedding Gx twice.
  script.add(Gx).add(Opcode.OP_DUP) // [s_be, Gx, Gx]
  script.add(Opcode.OP_2).add(Opcode.OP_SWAP).add(Opcode.OP_CAT) // pubkey = 02||Gx (OP_2 = minimal push of 0x02)
  script.add(Opcode.OP_TOALTSTACK) // park pubkey ; [s_be, Gx]
  script.add(Buffer.from([0x30, 0x44, 0x02, 0x20])).add(Opcode.OP_SWAP).add(Opcode.OP_CAT) // 30440220||Gx
  script.add(Buffer.from([0x02, 0x20])).add(Opcode.OP_CAT) // ||0220  => DER prefix
  script.add(Opcode.OP_SWAP).add(Opcode.OP_CAT) // DER prefix || s_be
  script.add(Buffer.from([sighashType])).add(Opcode.OP_CAT) // || sighash flag => full DER sig
  script.add(Opcode.OP_FROMALTSTACK).add(Opcode.OP_CHECKSIG) // pubkey ; verify against P = G
  return script
}

/** Bare authenticator script: unlock with the (grindable) preimage. */
function authenticator () {
  return pushTxCore(new Script())
}

/** Extract the committed hashOutputs (item 9, offsetFromEnd 40, len 32) from a preimage on-stack. */
function extractHashOutputs (script) {
  // last 40 bytes, then the first 32 of those = hashOutputs. (BSV string opcodes.)
  script.add(scriptNum(40)).add(Opcode.OP_RIGHT).add(scriptNum(32)).add(Opcode.OP_LEFT)
  return script
}

// The BIP-143 preimage ends with nHashType as a 4-byte LE word; for SIGHASH_ALL|
// FORKID that word is 0x41 00 00 00. assertSighashType builds this word per flag.

/**
 * Assert the spend is SIGHASH_ALL|FORKID (0x41). Pre/Post: top of stack = preimage
 * (left untouched). These covenants read fixed offsets (104 / 52 / 40) that are
 * meaningful only for the 0x41 layout, and the OP_PUSH_TX core already pins the
 * flag implicitly (its synthetic sig carries 0x41, so OP_CHECKSIG only accepts a
 * preimage hashing to the 0x41 sighash). Note the offsets themselves are invariant
 * in the number of INPUTS — hashPrevouts/hashSequence are digests of all inputs,
 * so the preimage is the same length for 1 or N inputs; the covenant simply does
 * not constrain sibling inputs, by design. What it does assume is a single
 * recreated OUTPUT (HASH256(nextOutput) == hashOutputs). This guard makes the
 * flag assumption explicit and fails fast — and survives any refactor of the core.
 */
function assertSighashAll (script) {
  return assertSighashType(script, SIGHASH)
}

/**
 * Assert the spend uses a specific SIGHASH flag. Pre/Post: top of stack = preimage
 * (left untouched). The BIP-143 preimage's trailing 4-byte LE nHashType word must
 * equal `sighashType`. Use with pushTxCore({ sighashType }) + grind({ sighashType })
 * to build covenants under SIGHASH_SINGLE|ANYONECANPAY (marketplace) etc.
 */
function assertSighashType (script, sighashType) {
  var word = Buffer.from([sighashType & 0xff, 0x00, 0x00, 0x00])
  script.add(Opcode.OP_DUP).add(scriptNum(4)).add(Opcode.OP_RIGHT)
    .add(word).add(Opcode.OP_EQUALVERIFY)
  return script
}

/** BIP-143 hashOutputs (SIGHASH_ALL) for a set of Transaction.Output objects. */
function hashOutputs (outputs) {
  var ser = Buffer.concat(outputs.map(function (o) { return o.toBufferWriter().toBuffer() }))
  return Hash.sha256sha256(ser)
}

/**
 * Value/output covenant: the spend is valid only if its outputs hash to
 * `expectedHashOutputs` — coins can only go where the covenant says.
 *
 * This pins the digest of the ENTIRE output set under SIGHASH_ALL — count, order,
 * values and scripts — so exactly ONE output set is admissible. In particular there
 * is no room for a change output unless you pin that too: a lock built from
 * `hashOutputs([payout])` rejects the spend `[payout, change]`. Pinning change fixes
 * its AMOUNT, not the fee, because extra inputs raise the input value while the
 * outputs stay identical.
 *
 * To bind one output and leave the rest free, use `valueCovenantSingle` — which pins
 * the output at the spending INPUT's index, not one you choose, and leaves every
 * other output unconstrained. To allow arbitrary change under SIGHASH_ALL, the
 * spender has to push the change output's serialization so the script can rebuild and
 * hash the whole output list itself; this function offers no free-form change
 * facility.
 */
function valueCovenant (expectedHashOutputs) {
  var script = new Script().add(Opcode.OP_DUP)
  pushTxCore(script)
  script.add(Opcode.OP_VERIFY)
  extractHashOutputs(script)
  script.add(Buffer.from(expectedHashOutputs)).add(Opcode.OP_EQUAL)
  return script
}

/**
 * `hashOutputs` extraction using **Monolith-era opcodes only**, so it works on a chain that has
 * activated neither Genesis nor Chronicle.
 *
 * `extractHashOutputs` above is 6 bytes and uses `OP_RIGHT`/`OP_LEFT`, which Chronicle restored —
 * before it they are silent NO-OPS, so a covenant built on it fails closed pre-Chronicle rather
 * than running. This form costs 10 bytes and uses only `OP_SIZE`, `OP_SUB`, `OP_SPLIT`, `OP_NIP`
 * and `OP_DROP`, none of which Chronicle gates:
 *
 *     OP_SIZE <40> OP_SUB OP_SPLIT OP_NIP <32> OP_SPLIT OP_DROP
 *
 * i.e. cut the preimage at `L - 40`, discard the front, cut the remainder at 32 and discard the
 * trailing `nLockTime`/`nHashType`. Four bytes to drop an era dependency.
 *
 * Pre: top of stack = preimage. Post: top = the committed hashOutputs. Pairs with
 * `pushTxCoreCompact`, whose 246-byte preimage also fits the 520-byte pre-Genesis element cap —
 * together they give a covenant that runs where neither Genesis nor Chronicle is active.
 */
function extractHashOutputsPortable (script) {
  script.add(Opcode.OP_SIZE)
  script.add(Buffer.from([40])).add(Opcode.OP_SUB)
  script.add(Opcode.OP_SPLIT).add(Opcode.OP_NIP)
  script.add(Buffer.from([32])).add(Opcode.OP_SPLIT).add(Opcode.OP_DROP)
  return script
}

/**
 * `valueCovenant` with no era dependency: the compact gate plus the portable extraction, so it
 * runs on a chain with only the 2018 Monolith opcodes.
 *
 * Measured: **135 bytes** with a **292-byte preimage**, verifying on mainnet, pre-Chronicle, and
 * pre-Genesis-and-pre-Chronicle together, and refusing a different output set with
 * `SCRIPT_ERR_EVAL_FALSE_IN_STACK`. The classic `valueCovenant` is 419 bytes and needs both
 * Genesis (its 536-byte preimage exceeds the 520-byte element cap, and its gate does 32-byte
 * arithmetic) and Chronicle (its extraction no-ops without it).
 *
 * Same semantics as `valueCovenant`: this pins the digest of the ENTIRE output set under
 * SIGHASH_ALL — count, order, values and scripts — so exactly one output set is admissible and
 * there is no room for a change output unless you pin that too.
 *
 * The compact gate's caveats come with it: see `pushTxCoreCompact` for why its private key is
 * public and safe, and **do not add a spend path that checks a spender signature against
 * `COMPACT_PUBKEY`**. Grind with `{ form: 'compact' }`.
 *
 * @param {Buffer|Transaction.Output[]} expectedHashOutputs the 32-byte digest, as `hashOutputs()`
 *   returns it.
 */
function valueCovenantPortable (expectedHashOutputs) {
  var script = new Script().add(Opcode.OP_DUP)
  pushTxCoreCompact(script)
  script.add(Opcode.OP_VERIFY)
  extractHashOutputsPortable(script)
  script.add(Buffer.from(expectedHashOutputs)).add(Opcode.OP_EQUAL)
  return script
}

/**
 * Output covenant under SIGHASH_SINGLE: the spend is valid only if the output at the
 * spending input's own index hashes to `pinned`. The flag is pinned too, so the lock
 * cannot be spent under SIGHASH_ALL to mean something it does not say.
 *
 * **It constrains ONE output and leaves every other output free.** Under SIGHASH_SINGLE
 * the BIP-143 preimage's hashOutputs commits to the output at the input's index alone, so
 * a spender may append any further outputs — including ones that send the asset's satoshis
 * somewhere else. A covenant pinning a 0-satoshi burn at index 0 therefore constrains the
 * burn and nothing else. That is the whole point of the flag (it is what lets a
 * counterparty add their own outputs to a marketplace trade), and it is a hazard whenever
 * the covenant is meant to bind where VALUE goes. For that use `valueCovenant`, which
 * commits to every output under SIGHASH_ALL. Measured, not inferred: a spend carrying the
 * pinned output at index 0 and an attacker's output at index 1 verifies.
 *
 * Pre: top of stack = preimage. Post: top = covenant result (the preimage is consumed).
 *
 * @param {Output|Buffer} pinned the Transaction.Output required at the input's index, or
 *   its 32-byte BIP-143 hashOutputs digest. Prefer passing the Output: under
 *   SIGHASH_SINGLE the digest covers that one output, so `hashOutputs(allOutputs)` is a
 *   value this covenant can never match, and passing it builds a lock nothing can spend.
 * @param {object} [opts]
 * @param {number} [opts.sighashType=0x43] SIGHASH_SINGLE|FORKID, or
 *   SIGHASH_SINGLE|ANYONECANPAY|FORKID to leave sibling inputs open as well. Must be a
 *   SIGHASH_SINGLE variant — anything else throws rather than build a misnamed lock.
 */
function valueCovenantSingle (pinned, opts) {
  opts = opts || {}
  var sighashType = opts.sighashType === undefined ? SIGHASH_SINGLE_FORKID : opts.sighashType
  // A WHITELIST, not a mask test. `(sighashType & 0x1f) !== SIGHASH_SINGLE` admitted 0x03 —
  // SIGHASH_SINGLE without FORKID — and anything carrying stray high bits. Those do not fail
  // loudly: pushTxCore's synthetic signature commits to the flag word, so the lock simply
  // refuses the honest spend, at the same byte count, which is the exact class of silent
  // mistake this helper exists to prevent. The sighash byte has a base type in its low five
  // bits plus ANYONECANPAY (0x80) and FORKID (0x40), so with SINGLE and FORKID both required
  // there are exactly two legal words, and naming them is clearer than deriving them.
  if (sighashType !== SIGHASH_SINGLE_FORKID &&
      sighashType !== SIGHASH_SINGLE_ANYONECANPAY_FORKID) {
    throw new Error('valueCovenantSingle needs SIGHASH_SINGLE|FORKID (0x' +
      SIGHASH_SINGLE_FORKID.toString(16) + ') or SIGHASH_SINGLE|ANYONECANPAY|FORKID (0x' +
      SIGHASH_SINGLE_ANYONECANPAY_FORKID.toString(16) + '); got ' +
      (typeof sighashType === 'number' ? '0x' + (sighashType >>> 0).toString(16) : typeof sighashType) +
      '. Use valueCovenant for SIGHASH_ALL.')
  }
  // Structural, not `instanceof Transaction.Output`: lib/transaction requires this module
  // through lib/smart_contract, so importing it here would close a cycle. `toBufferWriter`
  // alone is too weak a discriminator — plenty of unrelated objects carry one — so the two
  // fields hashOutputs actually serialises are required too, and the digest is length-checked
  // below either way.
  var looksLikeOutput = pinned && typeof pinned.toBufferWriter === 'function' &&
    pinned.script !== undefined && pinned.satoshis !== undefined
  var expected = Buffer.isBuffer(pinned)
    ? pinned
    : looksLikeOutput ? hashOutputs([pinned]) : null
  if (!expected || expected.length !== 32) {
    throw new Error('valueCovenantSingle needs a Transaction.Output (with script and ' +
      'satoshis), or its 32-byte hashOutputs digest; got ' +
      (expected ? expected.length + ' bytes' : typeof pinned))
  }
  // 32 zero bytes is not a digest, it is the value BIP-143 puts in hashOutputs when the
  // input's index is out of range for SIGHASH_SINGLE — there is no output at that index.
  // A lock pinned to it is satisfied by a spend with NO outputs at all (measured), so it
  // pins nothing while looking like it pins something. Refuse it at construction.
  var allZero = true
  for (var i = 0; i < 32; i++) if (expected[i] !== 0) { allZero = false; break }
  if (allZero) {
    throw new Error('valueCovenantSingle refuses an all-zero pin: under SIGHASH_SINGLE that ' +
      'is the hashOutputs of an out-of-range input index, so the lock would be spendable ' +
      'with no outputs at all. Pin a real output.')
  }
  // Order matters, and getting it wrong yields a lock that fails the HONEST spend.
  // pushTxCore consumes the preimage copy it checks, so the flag has to be asserted
  // while a copy is still there — appending assertSighashType after the covenant body
  // leaves it nothing to read. That ordering is the reason this helper exists.
  var script = new Script().add(Opcode.OP_DUP)
  assertSighashType(script, sighashType)
  pushTxCore(script, { sighashType: sighashType })
  script.add(Opcode.OP_VERIFY)
  extractHashOutputs(script)
  script.add(Buffer.from(expected)).add(Opcode.OP_EQUAL)
  return script
}

// floor(n/2) — the canonical low-S boundary (matches Signature.hasLowS()).
var HALF_N = new BN('7FFFFFFFFFFFFFFFFFFFFFFFFFFFFFFF5D576E7357A4501DDFE92F46681B20A0', 'hex')

/**
 * Compute s = (HASH256(preimage)+Gx) mod n; return its 32-byte BE form, or null
 * if the resulting signature would not be a clean, CANONICAL (low-S) DER.
 * Requiring s <= n/2 makes the in-script signature non-malleable and standard,
 * so it passes nodes enforcing SCRIPT_VERIFY_LOW_S — at zero script-size cost
 * (the burden is on the spender's grind, not extra opcodes).
 */
function sFromPreimage (preimage) {
  var z = Hash.sha256sha256(preimage)
  // Script no longer sign-extends z, so e (= reverse(z) as a number) must be
  // positive AND minimally encoded: its little-endian MSB (= z[0]) in 0x01..0x7f.
  // This keeps the locking script MINIMALDATA-clean (mainnet-relayable).
  if (z[0] < 0x01 || z[0] > 0x7f) return null
  var s = new BN(z).add(new BN(Gx)).mod(N)
  if (s.gt(HALF_N)) return null // enforce low-S (canonical / non-malleable)
  // NOT s.toBuffer('be', 32) — that is bn.js's POSITIONAL signature, and lib/crypto/bn.js
  // REPLACES toBuffer with an options-object form ({ size, endian }). Passed positionally,
  // 'be' becomes the whole opts object, `size` is never read, and the result is natural
  // length: measured, a small value came back as ONE byte. Two things followed from that,
  // both silent:
  //
  //   - the guard below was TAUTOLOGICAL. A natural-length big-endian buffer never carries a
  //     leading zero byte, so `sBE[0] >= 0x01` could not be false and protected nothing.
  //   - a short `s` under DER_PREFIX, which declares s to be exactly 0x20 bytes, is a
  //     malformed signature.
  //
  // Neither was reachable, and the reason has nothing to do with buffer length: the two
  // filters above force s into (Gx, n/2], and Gx is about 0.4766*n, so s is always >= 2^255,
  // always 32 bytes, with a leading byte of 0x7a..0x7f. Widen the minimal-e range or drop the
  // low-S check and it becomes reachable — which is exactly what an in-script low-S
  // normalisation does, leaving s uniform on [0, n/2] and a zero top byte about 1 time in 130.
  // So the size is now passed properly and the guard is load-bearing again.
  var sBE = s.toBuffer({ size: 32 })
  return (sBE[0] >= 0x01) ? sBE : null // s <= n/2 already guarantees sBE[0] <= 0x7f
}

/**
 * Grind a malleable field of the spend until the in-script OP_PUSH_TX signature
 * is a clean, canonical (low-S) fixed-length DER. Returns { preimage, tries,
 * field, nonce }; mutates the chosen field on `spend`.
 *
 * @param {object} [opts] grind options (a bare number is accepted as legacy maxTries):
 *   - maxTries {number}  attempts before giving up (default 5000).
 *   - start    {number}  first nonce value to try (default 0).
 *   - field    {'nLockTime'|'sequence'}  which field carries the grind nonce
 *       (default 'nLockTime'). Use 'sequence' when the covenant pins nLockTime for
 *       a real CLTV absolute timelock: the input's sequence is swept down from
 *       0xfffffffe (kept non-final, so CLTV still triggers) instead of clobbering
 *       nLockTime. (Not for CSV/relative-locktime covenants, which encode meaning
 *       in the sequence number itself.)
 */
/* -------------------------------------------------------------------------- */
/* The COMPACT gate: the same guarantee in 89 bytes instead of 377.            */
/* -------------------------------------------------------------------------- */

/**
 * Derived in-lab on 2026-10-17, elsewhere than this package, and reproduced here independently
 * before being shipped: `a` and `Q` were re-derived from the curve constants, the script was
 * re-assembled from its structure rather than copied, the result is byte-identical to the
 * original, and it verifies under mainnet consensus flags. A compiled `bitcoin-sv` v1.2.3
 * `VerifyScript` is the third implementation to agree.
 *
 * The idea removes BOTH 32-byte reversals — 248 of the 377-byte gate, and 186 of its 202 counted
 * opcodes — by choosing the private key instead of fixing it at 1.
 *
 * With `k = 1` the signature is `s = e + Gx·a (mod n)`. The `a = 1` form takes `s = e + Gx`, and
 * because `e` is the BIG-ENDIAN reading of the hash while Script numbers are LITTLE-ENDIAN, it
 * must reverse 32 bytes to add and reverse 32 bytes back for the DER body. Choose instead
 *
 *     a = 2^248 · Gx⁻¹ (mod n)      so that    Gx·a ≡ 2^248 (mod n)
 *
 * and `s = e + 2^248`. In a 32-byte big-endian string `2^248` is exactly `byte[0] = 0x01`, so the
 * whole addition is **incrementing the most significant byte** — a one-byte operation, where
 * little- and big-endian coincide. No reversal, no 256-bit arithmetic.
 *
 * `a` is PUBLIC and deterministic, a function of the curve constants alone, and `A_SCALAR` below
 * records it so `COMPACT_PUBKEY` is verifiable as `a·G` rather than an arbitrary key. Publishing
 * it is safe, and not merely safe by convention: the gate's security never rested on key secrecy
 * in either form. The only `OP_CHECKSIG` consumes a signature the LOCKING script assembles from
 * constants plus the computed `s` — never a spender-supplied signature — so knowing `a` buys
 * nothing: the spender's only freedom is the preimage, and passing still needs its digest to line
 * up with the interpreter's, under the same ~2^128 assumption noted for `pushTxCore` above.
 *
 * Three composition hazards, worst first:
 *   1. **Never use `COMPACT_PUBKEY` as an authorization key anywhere.** Its private half is
 *      published, so a spend path that CHECKSIGs a SPENDER-supplied signature against it is a
 *      free pass, not a covenant.
 *   2. **One CHECKSIG is necessary, not sufficient.** Keeping a single signature check while
 *      letting spender-controlled bytes reach it, checking a different digest, or gating it
 *      conditionally all break the gate without changing the opcode count. The real guard is that
 *      the emitted script equals the published bytes, which the pin artifact fixes by SHA-256;
 *      the opcode count is defence in depth.
 *   3. Fields read out of the preimage are only as trustworthy as the gate that authenticated it,
 *      so a covenant that puts its field reads BEFORE the gate has authenticated nothing.
 *
 * The grind condition is different and simpler: `z[0] <= 0x7e`, which keeps `(z[0] + 1)` positive,
 * minimally encoded and carry-free, plus low-S. Acceptance is 49.61% — 127/256, measured 49.62%
 * over 50,000 random preimages — so roughly two tries against the ~2% of the other form.
 *
 * The low-S check is CORRECT-BY-CONSTRUCTION INSURANCE that will never fire, and the exact
 * figure is worth recording because it is easy to overstate in either direction. The tail is
 * real: `n/2` sits 2^127.0 below 2^255, so an `s` whose leading byte is 0x7f (which `z[0] = 0x7e`
 * produces) CAN exceed `n/2` where the first-byte condition alone would admit it. But that tail
 * is 2^127 wide inside a 2^248 band, so P(high-S | z[0] = 0x7e) = 2^-121 and P(high-S) = 2^-129
 * overall. Measured: 0 low-S rejections in 24,811 in-band samples. Keep the check — it costs the
 * spender nothing and the band's top really does cross `n/2` — but do not describe it as a check
 * that guards against anything observable.
 *
 * Out of range it fails closed by two paths worth knowing apart. Both are MEASURED — 7 of 7
 * single-byte mutations rejected, 0 accepted — not proved: rejection rests on the same ~2^128
 * assumption, so read it as coverage rather than a theorem.
 *   z[0] == 0x7f  OP_NUM2BIN cannot fit 128 in one SIGNED byte: SCRIPT_ERR_IMPOSSIBLE_ENCODING,
 *                 the script aborts.
 *   z[0] >= 0x80  the script COMPLETES with a wrong `s` and OP_CHECKSIG rejects it, because
 *                 OP_BIN2NUM reads 0x80 as negative zero (so 0x80 -> 0 -> 0x01) and 0xff as -127
 *                 (-> -126 -> 0xfe). So half the out-of-range space is not an abort but a wrong
 *                 answer that the signature check catches. Grind past it; do not rely on an error.
 *
 * Trade-off against `pushTxCore`: 89 bytes versus 377, and roughly a tenth of the opcodes. What
 * you give up is the externally witnessed status of the other form — `pushTxCore` is pinned by
 * `test/data/pushtx-gate-pin.json` and agreed on by three independent implementations. This one
 * has two (theirs and this library) at the time of writing.
 */
var A_SCALAR = new BN('d475289d7db690543c1ecbd9ed0d6c9a2e5920ecebf361bdcca0d61f77af4839', 16)
var COMPACT_PUBKEY = Buffer.from(
  '02b405d7f0322a89d0f9f3a98e6f938fdc1c969a8d1382a2bf66a71ae74a1e83b0', 'hex')

/**
 * Append the compact in-script signature generator + verifier.
 * Pre: top of stack = preimage. Post: top = OP_CHECKSIG result.
 *
 * @param {Script} script
 * @param {object} [opts]
 * @param {number} [opts.sighashType=0x41] baked into the synthetic signature, exactly as in
 *   `pushTxCore`: OP_CHECKSIG derives the spend's sighash using THIS flag.
 */
function pushTxCoreCompact (script, opts) {
  var sighashType = (opts && opts.sighashType) || SIGHASH
  script.add(Opcode.OP_HASH256) // z = HASH256(preimage), 32B big-endian
  script.add(Opcode.OP_1).add(Opcode.OP_SPLIT) // [z0, rest31]
  script.add(Opcode.OP_SWAP) // [rest31, z0]
  script.add(Opcode.OP_BIN2NUM).add(Opcode.OP_1ADD) // z0 + 1, as a number
  script.add(Opcode.OP_1).add(Opcode.OP_NUM2BIN) // back to one byte; fails if it needs two
  script.add(Opcode.OP_SWAP).add(Opcode.OP_CAT) // (z0+1)||rest31 = s, big-endian
  script.add(DER_PREFIX).add(Opcode.OP_SWAP).add(Opcode.OP_CAT) // 30440220||Gx||0220 || s
  script.add(Buffer.from([sighashType])).add(Opcode.OP_CAT) // || flag => full DER sig
  script.add(COMPACT_PUBKEY).add(Opcode.OP_CHECKSIG) // verify against Q = a*G
  return script
}

/** Bare compact authenticator: unlock with the (grindable) preimage. 89 bytes. */
function authenticatorCompact () {
  return pushTxCoreCompact(new Script())
}

/**
 * The compact form's grind predicate. Returns the 32-byte big-endian `s` the script will build,
 * or null if this preimage is unusable. `z[0] <= 0x7e` keeps `(z[0]+1)` positive, minimally
 * encoded and carry-free; low-S is then almost always satisfied and is checked rather than
 * assumed.
 */
function sFromPreimageCompact (preimage) {
  var z = Hash.sha256sha256(preimage)
  if (z[0] > 0x7e) return null
  var s = Buffer.concat([Buffer.from([z[0] + 1]), z.slice(1)])
  if (new BN(s).gt(HALF_N)) return null
  return s
}

function grind (spend, inputIndex, lockingScript, satoshis, opts) {
  if (typeof opts === 'number') opts = { maxTries: opts } // back-compat: legacy maxTries arg
  opts = opts || {}
  var maxTries = ownOption(opts, 'maxTries') || 5000
  var start = opts.start || 0
  var field = opts.field || 'nLockTime'
  var sighashType = opts.sighashType || SIGHASH
  if (field !== 'nLockTime' && field !== 'sequence') {
    throw new Error("grind field must be 'nLockTime' or 'sequence'")
  }
  var input = spend.inputs[inputIndex]
  for (var i = 0; i < maxTries; i++) {
    var nonce = start + i
    if (field === 'nLockTime') spend.nLockTime = nonce
    else input.sequenceNumber = 0xfffffffe - nonce // stay < 0xffffffff (non-final)
    var preimage = H.rawPreimage(spend, inputIndex, lockingScript, satoshis, sighashType)
    var pass = opts.form === 'compact' ? sFromPreimageCompact(preimage) : sFromPreimage(preimage)
    if (pass) return { preimage: preimage, tries: i + 1, field: field, nonce: nonce }
  }
  throw new Error('OP_PUSH_TX grind failed after ' + maxTries + ' tries')
}

module.exports = {
  Gx: Gx,
  N: N,
  PUBKEY: PUBKEY,
  gxLe: gxLe,
  N_LE: N_LE,
  DER_PREFIX: DER_PREFIX,
  reverseBytes: reverseBytes,
  pushTxCore: pushTxCore,
  authenticator: authenticator,
  extractHashOutputs: extractHashOutputs,
  assertSighashAll: assertSighashAll,
  assertSighashType: assertSighashType,
  SIGHASH_ALL_FORKID: SIGHASH_ALL_FORKID,
  SIGHASH_SINGLE_FORKID: SIGHASH_SINGLE_FORKID,
  SIGHASH_SINGLE_ANYONECANPAY_FORKID: SIGHASH_SINGLE_ANYONECANPAY_FORKID,
  SIGHASH_ALL_ANYONECANPAY_FORKID: SIGHASH_ALL_ANYONECANPAY_FORKID,
  hashOutputs: hashOutputs,
  valueCovenant: valueCovenant,
  valueCovenantSingle: valueCovenantSingle,
  sFromPreimage: sFromPreimage,
  grind: grind,
  A_SCALAR: A_SCALAR,
  COMPACT_PUBKEY: COMPACT_PUBKEY,
  pushTxCoreCompact: pushTxCoreCompact,
  authenticatorCompact: authenticatorCompact,
  sFromPreimageCompact: sFromPreimageCompact,
  extractHashOutputsPortable: extractHashOutputsPortable,
  valueCovenantPortable: valueCovenantPortable
}
