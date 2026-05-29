# @smartledger/bsv — Issue Report

> **Status: RESOLVED in v3.4.5 (2026-05-29)**
>
> `Transaction.from(...).sign(privKey)` now works on P2PKH + trailing-data
> outputs, including 1Sat Ordinal envelopes. See the [Resolution](#resolution)
> section below for what shipped and how to migrate. The body of this report
> is preserved unchanged as a historical record of the bug and the analysis
> that led to the fix.

## Title

`Transaction.from() + sign()` rejects spending of standard 1Sat Ordinal outputs (P2PKH + inscription envelope)

## Resolution

**Fixed in [`@smartledger/bsv@3.4.5`](https://www.npmjs.com/package/@smartledger/bsv/v/3.4.5)** —
also published as `smartledger-bsv@3.4.5` for the unscoped consumers.
Commit [`d8aa6fa`](https://github.com/codenlighten/smartledger-bsv/commit/d8aa6fa).
Tag [`v3.4.5`](https://github.com/codenlighten/smartledger-bsv/releases/tag/v3.4.5).

The dispatch heuristic in `Transaction._fromNonP2SH` was changed from the
strict 5-chunk check to a **prefix** check, via a new
`Script.prototype.isPublicKeyHashOutPrefix()`. Any locking script whose
first five chunks match the canonical P2PKH pattern — regardless of what
trails — now routes to `PublicKeyHashInput` and signs through the
high-level API. The strict `Script.prototype.isPublicKeyHashOut()` is
unchanged, so address derivation, script classification, and any other
introspection paths keep their canonical semantics.

This was option 1 from the [Suggested fixes](#suggested-fixes) section
below — the "loose P2PKH detection" approach. Sighash math is
unaffected: `PublicKeyHashInput.getSignatures` has always passed
`this.output.script` (the full bytes) to `Sighash.sign`, so the
signature commits to the inscription envelope (or whatever trailing
data) the same way miners verify it. Seven new regression tests in
`test/transaction/transaction.js` cover the round-trip, including an
`isValidSignature` check on an ordinal-shaped UTXO.

### Migration — drop the workaround, use the high-level API

The current workaround (the `Sighash.sighash` + `crypto.ECDSA.sign`
hand-build documented [below](#current-workaround-what-we-shipped)) can
be replaced with the obvious code that was failing before:

```js
const bsv = require('@smartledger/bsv')  // >= 3.4.5

const tx = new bsv.Transaction()
  .from([ordUtxo])              // ordUtxo.script = the full P2PKH+envelope hex
  .to(recipient, 1)
  .change(changeAddr)
  .feePerKb(500)
  .sign(ordPriv)                // ← now works; previously threw

// tx.uncheckedSerialize() is ready to broadcast.
```

Same fix unblocks **MAP+BAP metadata appended to outputs**, **sCrypt
covenants with a P2PKH spendable guard**, **BSV20 v2 listing outputs**,
and any future "P2PKH + tag" pattern.

### What's still out of scope (and on the v3.5.0 plan)

The other two suggestions from this report — the explicit
`inputType: 'PublicKeyHash'` hint on the `from()` descriptor, and a
documented `tx.signInput(...)` helper — were deferred to v3.5.0 along
with the toolchain upgrade. The 3.4.5 patch was deliberately narrow:
strict semver patch (no working consumer regresses) and minimal surface
change (one new method, two dispatch points updated). The v3.5.0
roadmap is in `CHANGELOG.md` under `## Planned for 3.5.0`.

### Related — the second of two barriers, now both removed

This issue surfaced as `Abstract Method Invocation: Trying to sign
unsupported output type ...` on 3.4.4, and as `Abstract Method
Invocation: Input#clearSignatures` on 3.4.3 and earlier. Both are the
same upstream-lineage design choice (base `Input` class with abstract
methods, no fallback for non-canonical scripts) surfacing at two
different call sites:

- **3.4.4** removed the *first* barrier — `_clearSignatures` during
  fee/change mutations — by applying the codebase's existing
  guard-by-method-identity pattern at the caller.
- **3.4.5** (this release) removes the *second and final* barrier —
  `getSignatures` during `sign()` — by fixing the dispatcher so
  P2PKH-prefixed scripts never reach the abstract base class in the
  first place.

---

## Summary

`bsv.Transaction.from(...).sign(privKey)` cannot sign an input whose locking
script is a P2PKH followed by an `OP_FALSE OP_IF "ord" … OP_ENDIF` inscription
envelope — i.e., the canonical 1Sat Ordinals format. The library's input
classifier only recognises *strict* P2PKH (exactly five chunks: `OP_DUP
OP_HASH160 <PKH> OP_EQUALVERIFY OP_CHECKSIG`) and falls back to a generic
`Input` instance for anything with trailing data, which the signer can't
handle.

This blocks any 1Sat Ordinal transfer flow from being expressed cleanly
with the high-level API, forcing every consumer (wallets, marketplaces,
indexers that re-broadcast) to drop down to `Transaction.Sighash` +
`crypto.ECDSA` and hand-build the unlocking script.

## Environment

| | |
|---|---|
| Package | `@smartledger/bsv` |
| Versions tested | `3.4.3`, `3.4.4` (both reproduce). **Note (added in resolution):** the perceived "clearer error message" on 3.4.4 was not an intentional change — 3.4.4's `_clearSignatures` fix simply removed an earlier abstract-method throw, exposing the *underlying* `getSignatures` error that was always there behind it. Fixed in `3.4.5+`. |
| Node | `v20.20.2` and `v22.22.0` |
| OS | Ubuntu 24.04 + Node native |
| Network | BSV mainnet |

## Reproducible example

This script:
- Builds the canonical 1Sat Ordinal locking script (P2PKH + envelope) using
  the format documented at https://docs.1satordinals.com
- Attempts to spend the resulting (mock) UTXO via `Transaction.from()` + `.sign()`
- Fails with the new (3.4.4) error message:
  > `Abstract Method Invocation: Trying to sign unsupported output type (only P2PKH and P2SH multisig inputs are supported) for input: {…}`

```js
const bsv = require('@smartledger/bsv')

// ── build a real-shape 1Sat ordinal locking script ─────────────────
const ordPriv  = bsv.PrivateKey.fromRandom('livenet')
const ordAddr  = ordPriv.toAddress().toString()
const recipient = bsv.PrivateKey.fromRandom('livenet').toAddress().toString()

// Canonical 1Sat inscription script:
//   <P2PKH spendable portion>
//   OP_FALSE OP_IF "ord" OP_1 <contentType> OP_0 <data> OP_ENDIF
const ordLockingScript = bsv.Script.buildPublicKeyHashOut(
  bsv.Address.fromString(ordAddr)
)
ordLockingScript.add(bsv.Opcode.OP_FALSE)
ordLockingScript.add(bsv.Opcode.OP_IF)
ordLockingScript.add(Buffer.from('ord'))
ordLockingScript.add(bsv.Opcode.OP_1)
ordLockingScript.add(Buffer.from('image/svg+xml'))
ordLockingScript.add(bsv.Opcode.OP_0)
ordLockingScript.add(Buffer.alloc(642, 0x20))      // 642-byte SVG payload
ordLockingScript.add(bsv.Opcode.OP_ENDIF)

// ── try to spend it the "obvious" way ─────────────────────────────
const ordUtxo = {
  txid: 'a'.repeat(64),
  outputIndex: 0,
  satoshis: 1,
  script: ordLockingScript.toHex()
}

const tx = new bsv.Transaction()
  .from([ordUtxo])
  .to(recipient, 1)
  .feePerKb(500)

try {
  tx.sign(ordPriv)
  console.log('✓ signed:', tx.uncheckedSerialize().slice(0, 80) + '…')
} catch (e) {
  console.error('✗', e.message)
}
```

### Output (3.4.4)

```
✗ Abstract Method Invocation: Trying to sign unsupported output type
  (only P2PKH and P2SH multisig inputs are supported) for input:
  {"prevTxId":"aa…aa","outputIndex":0,"sequenceNumber":4294967295,
   "script":"","scriptString":"",
   "output":{"satoshis":1,"script":"76a914…88ac0063036f7264510d696d…68"}}
```

### Output (3.4.3)

```
✗ Abstract Method Invocation: Input#clearSignatures
```

(Same root cause; 3.4.4's message is just better.)

## Why it matters

**1Sat Ordinals** is the dominant inscription standard on BSV. Public
indexers (GorillaPool, 1Sat-API, OrdFS) treat every 1-sat UTXO whose
locking script carries the `ord` envelope as an NFT-bearing output. To
*transfer* such an NFT (the most common write operation), the holder
spends that UTXO and creates a new 1-sat output to the recipient.

That spend's input has, by definition, the `P2PKH + envelope` script
shape — which is what `tx.from() + .sign()` refuses. The same applies
to **any** future "P2PKH + trailing metadata" pattern on BSV (think:
1Sat protocol extensions, MAP+BAP metadata appended to outputs, sCrypt
covenants that include a P2PKH guard, etc.).

Result: every wallet, marketplace, and tooling project has to maintain a
parallel manual-signing path. We hit it building self-custody wallet UX
for our users; HandCash, Yours Wallet, RelayX, and 1Sat marketplaces all
solve it the same way.

## Root cause (inferred)

`Transaction.from(utxo)` inspects `utxo.script` and routes to one of the
specialised `Input` subclasses (`PublicKeyHash`, `MultiSig`, `MultiSigScriptHash`)
based on `script.isPublicKeyHashOut()` etc. Those checks require the
script to be *exactly* the canonical shape — any trailing opcodes
disqualify it. The catch-all `Input` base class is returned instead,
and its `getSignatures()` / `clearSignatures()` are abstract (throws), so
neither pre-sign housekeeping nor sign-time invocation work.

The signing logic itself is fine — `Transaction.Sighash.sighash` happily
hashes any script bytes. The only barrier is the input-type dispatch.

## Suggested fixes

In rough order of "least invasive → most general":

### 1. Loose P2PKH detection (minimal patch)

Treat any script whose **first five chunks** are `OP_DUP OP_HASH160 <20B>
OP_EQUALVERIFY OP_CHECKSIG` as P2PKH, regardless of trailing chunks. The
spendable portion is identical; only the sighash needs the full bytes (which
it already gets — the issue is purely the dispatch, not the hash).

```js
// in PublicKeyHashInput or Script.classify:
const c = script.chunks
const looksP2PKH = c.length >= 5
  && c[0].opcodenum === Opcode.OP_DUP
  && c[1].opcodenum === Opcode.OP_HASH160
  && c[2].buf && c[2].buf.length === 20
  && c[3].opcodenum === Opcode.OP_EQUALVERIFY
  && c[4].opcodenum === Opcode.OP_CHECKSIG
```

This would let every existing wallet code path that targets 1Sat ords
(and any other "P2PKH with trailing data" output) Just Work via
`from(...).sign(...)`. ~10 lines of change.

### 2. Caller hint

Accept `{ script, satoshis, inputType: 'PublicKeyHash' }` on the `from()`
descriptor. When present, skip script-shape detection and instantiate the
specified subclass directly:

```js
tx.from({
  txid, outputIndex, satoshis, script: realLockingScriptHex,
  inputType: 'PublicKeyHash'           // ← new optional field
})
```

This is more explicit (the caller declares intent) and a strict superset
of current behaviour — no risk of breaking anything.

### 3. Expose a documented manual-sign helper

Right now consumers reach for `bsv.Transaction.Sighash.sighash` + `bsv.crypto.ECDSA.sign`,
hand-build the `<sig><pubkey>` unlock script, and call `input.setScript()`.
That's the workaround we ended up shipping (snippet below). A documented
convenience like `tx.signInput(index, privKey, prevScript, satoshisBN)`
would make the use case first-class even if the dispatch heuristic isn't
changed.

## Current workaround (what we shipped)

For reference, this is what every consumer ends up writing. It validates
cryptographically (verified against `bsv.crypto.ECDSA.verify`) and lands
on mainnet correctly:

```js
const sighashType = bsv.crypto.Signature.SIGHASH_ALL
  | bsv.crypto.Signature.SIGHASH_FORKID

const tx = new bsv.Transaction()

// Add each input by hand — provide the real on-chain locking script so
// the sighash matches what miners will verify against.
for (const d of inputDescs) {
  tx.addInput(new bsv.Transaction.Input({
    prevTxId: d.txid,
    outputIndex: d.vout,
    sequenceNumber: 0xffffffff,
    script: bsv.Script.empty(),
    output: new bsv.Transaction.Output({
      script: d.prevScript,           // bsv.Script — full bytes
      satoshis: d.satoshis
    })
  }))
}

// Add outputs, then sign each input manually:
for (let i = 0; i < inputDescs.length; i++) {
  const d = inputDescs[i]
  const sighashBuf = bsv.Transaction.Sighash.sighash(
    tx, sighashType, i, d.prevScript, new bsv.crypto.BN(d.satoshis)
  )
  const sig = bsv.crypto.ECDSA.sign(sighashBuf, d.privKey)
  const sigBuf = Buffer.concat([sig.toDER(), Buffer.from([sighashType])])
  const unlock = new bsv.Script()
    .add(sigBuf)
    .add(d.privKey.publicKey.toBuffer())
  tx.inputs[i].setScript(unlock)
}
```

This works on 3.4.4 against a real mainnet inscription transfer (we have
production traffic going through it now). The downside is every consumer
re-implements it, and the manual fee/change estimation has to be done by
hand too because `change()` triggers `_estimateSize()` which calls into
each input's `_estimateSize()` — also abstract on the generic Input class.

## Test vector for whichever fix you ship

To validate the fix end-to-end, here's a real on-chain inscription our
test wallet owns. Spending it must produce a transaction that:
- includes the original 1-sat UTXO as input 0
- carries the full P2PKH+envelope locking script bytes through the sighash
- produces a `<sig><pubkey>` unlock script on input 0
- validates under BSV's strict policy (no `mandatory-script-verify-flag-failed`)

```
inscription outpoint : 2db409136586753fcbe62ba5571095876e42e0815e999dff98dbd0ceff569e32:0
owner address        : 1NhsVJbXJtEDmaJ4RHRH1t1b9fsa9k5fuX
inscription          : image/svg+xml, 642 bytes
locking script (hex) : (fetchable via WoC /v1/bsv/main/tx/hash/<txid>)
GorillaPool record   : https://ordinals.gorillapool.io/api/txos/address/1NhsVJbXJtEDmaJ4RHRH1t1b9fsa9k5fuX/unspent
```

Any of the three suggested fixes should let a small consumer-side spend
script (with private key) build a valid spending transaction via clean
`tx.from(...).sign(...)`.

## Contact

- **Project:** SmartLedger Wallet (`wallet.smartledger.technology`)
- **Source:** internal; happy to share the relevant integration files
- **Maintainer:** codenlighten1@gmail.com

If a patch lands, we'll switch back to the high-level API across our
wallet, the integrator-facing `SLPublish` / `SLAttest` libraries, and the
sponsored-publish endpoint. Happy to test pre-release.
