# Properties you may and may not rely on

Written for people building on `@smartledger/bsv`, after four separate projects each shipped or
nearly shipped code resting on a property this library does not have. Every statement below was
**measured against the published artifact**, not read off the source or recalled — the version is
named in each section, and `test/properties/relied_upon.js` re-measures every claim in this file so
it cannot quietly go stale.

Where a property is a hazard, the hazard is stated before the remedy.

---

## 1. Message signatures are malleable. Never use one as an identifier.

**Measured on published 9.37.0, and at every published version back to the first (1.5.6-fix1).**

`bsv.Message(...).verify(address, sig)` accepts **two different base64 strings** for one key and
one message. Given the signature `sign()` produces, replace the recovery header `31 + recid` with
`31 + (recid ^ 1)` and `s` with `n - s`, and the result verifies just as well, recovering the same
public key and the same address.

```
key        6d repeated 32 times
address    17mKXfVLBhiusjSzwyrM8Yxnjb5hiYAqxD
message    "authority: release funds to alice"

A  H5yoMJLTxFCcOxRdE+QKNFbBzrUgB60WsToF2HGGwlUZGLv+FehwJnC12V8gXjhkCp19B6VWQ9+0HB5Q4/JH/cY=
B  IJyoMJLTxFCcOxRdE+QKNFbBzrUgB60WsToF2HGGwlUZ50QB6heP2Y9KJqDfoceb9B0x1UFZBMCHo7QNqN3uQ3s=

both verify; A is what sign() emits
```

**So a Message signature is not a unique name for anything.** Do not use the signature string, or
any hash of it, as:

- a deduplication or idempotency key;
- a nonce, replay-protection token, or "have I seen this request" marker;
- a primary key, audit-log identity, or cache key;
- a Merkle leaf, unless you refuse non-canonical encodings **on the received bytes before
  hashing** — otherwise the twin is a second valid leaf for the same statement.

**What to key on instead:** the tuple of fields the signature *covers* — signer, message, and your
own timestamp or sequence number — with a freshness window. One project keys acceptances on
`(paymail, xpub, timestamp)` with max-age and max-skew bounds, which is correct and unaffected.

**If you must have one byte string per statement**, enforce low-s yourself on receipt: decode,
require `2s <= n - 1`, re-encode, and demand the input back byte for byte. `sign()` has only ever
emitted low-s, so this rejects nothing this library produces — but it may reject signatures from
other implementations that legitimately emit high-s, which is why the library does not enforce it
for you.

Two further facts in the same area:

- **Message verification takes an address, not a public key.** Two different keys cannot collide
  here, but you are checking "the holder of the key behind this address", not "this exact key".
- **Transaction signatures are different** and need DER plus a sighash byte over a double hash.
  NotaryHash proofs take a bare `r || s` and deliberately do **not** enforce low-s; that is
  harmless there, because `proofHash` binds the signature bytes.

---

## 2. Verification functions do not share a return convention.

**Measured on published 9.37.0.** This is the trap most likely to cause a silent accept, because
the correct spelling for one function is wrong for the next.

| function | returns | `if (result)` is | error field |
|---|---|---|---|
| `verifyAgeProof` | `boolean` | **correct** | — |
| `verifyCredential` | **a Promise** of `{ valid, errors }` | **always true** | `errors` (array) |
| `validateCredential` | `{ valid, errors }` | **always true** | `errors` (array) |
| `verifyLegalToken` | `{ valid, error }` **or** `{ valid, errors }` | **always true** | **not stable — see below** |

**This is not new and it is not a regression.** Measured at eight published versions: the four
functions are absent in 1.5.6-fix1 and 3.0.2, and from **4.0.0 through 9.37.0** the shapes above
are identical at every version checked (4.0.0, 5.0.0, 6.0.0, 7.0.0, 9.0.0, 9.16.1, 9.30.0,
9.37.0). So the trap applies to whatever version you are on, and upgrading does not address it.

There are **two** separate mistakes available, and the second is the dangerous one because
fixing the first feels like it fixed the problem:

```js
// WRONG twice over: a Promise is truthy, so this accepts anything
if (bsv.verifyCredential(cred)) { /* ... */ }

// STILL WRONG: the resolved object is truthy even when the credential is invalid
const r = await bsv.verifyCredential(cred)
if (r) { /* ... */ }                      // {valid:false, errors:[...]} is truthy

// correct
const r = await bsv.verifyCredential(cred)
if (r.valid) { /* ... */ }
```

Measured directly: `await bsv.verifyCredential({ bogus: true })` resolves to
`{"valid":false,"errors":["Missing @context", ...]}`, for which `!!r` is `true` and `!!r.valid`
is `false`.

### `verifyLegalToken` names its error field two different ways

Within that one function, some paths return `error` as a **string** and others return `errors` as
an **array** — measured on 9.37.0 across seven inputs, four taking the `error` path and three the
`errors` path:

```
verifyLegalToken({})                                 -> {valid:false, error:  "No proof found in token"}
verifyLegalToken(null)                               -> {valid:false, error:  "..."}
verifyLegalToken('nope')                             -> {valid:false, error:  "..."}
verifyLegalToken([])                                 -> {valid:false, error:  "..."}
verifyLegalToken({proof:{type:'x',signature:'zz'}})  -> {valid:false, errors: ["Missing signature proof"]}
verifyLegalToken({proof:{}})                         -> {valid:false, errors: [...]}
verifyLegalToken({proof:{type:'x'}})                 -> {valid:false, errors: [...]}
```

So the obvious way to show a user *why* verification failed is a crash waiting on the commonest
input. Measured: `bsv.verifyLegalToken({}).errors.join(', ')` throws
`TypeError: Cannot read properties of undefined (reading 'join')`.

**Read both, and do not assume an array:**

```js
const r = bsv.verifyLegalToken(token)
if (!r.valid) {
  const why = r.errors ? r.errors.join(', ') : (r.error || 'verification failed')
}
```

`validateCredential` is uniform (`errors`, an array, on all seven inputs). `verifyCredential`
resolves to the same uniform shape. **Only `verifyLegalToken` mixes the two.**

Note also that `verifyCredential` is a plain `Function`, not an `AsyncFunction` — so a guard that
tests `fn.constructor.name === 'AsyncFunction'` to find the async entry points **will not find
this one**. It returns a Promise regardless.

**Rule: read the documented field. Never treat a verification result's truthiness as its verdict,
and do not assume the error field's name or type is the same across two functions — or across two
code paths of one function.**

A note on how to test your own side of this. Asserting the shape here catches a change in the
library, but it cannot catch *your* caller reading the result wrongly — that is a property of your
code, not of ours, and a test in this repository will never see it. The check that works is one
that reads your own call site: locate the variable the result is assigned into, and require the
guard that follows to test a property of it rather than the value itself. One project in this
estate does exactly that and sabotage-tested it both ways. An assertion that merely confirms "a
refusal object is truthy" describes the hazard instead of catching it, and cannot fail when a
caller changes its condition.

---

## 3. What this library refuses

Refusals are deliberate and are not bugs, but they are invisible until something fails in
production, so they are listed here.

- **NotaryHash certificate version 2.0 is refused.** `Certificate.REFERENCE_VERSION` is `'1.0'`
  (measured), and `verify` rejects a 2.0 certificate as an unimplemented version. Two projects in
  this estate need 2.0; adding it is a deliberate decision that has not been taken. If you issue
  with notaryhash 2.4.0+ in the 2.0 format, this library will not read it.
- **A non-TSC `spv.format` is refused** (since 9.24.0). An SPV envelope must declare the TSC
  format; anything else is rejected rather than guessed at.
- **There is no bech32, SegWit or Taproot support, anywhere** (measured: no such member on the
  public surface). This is a BSV library. One adapter cannot serve BSV, BTC and LTC.

---

## 4. Canonical JSON

**`@smartledger/bsv/jcs` is a public subpath export** — measured, `{ stringify }`, present in
9.16.1 and 9.37.0 alike. At least one project vendored its own copy believing it was private. It
scores 11/11 against the attest-spec conformance vectors.

Three traps, all measured:

- **`-0` canonicalises to `0`.** `stringify({x:-0})` and `stringify({x:0})` are the same bytes, so
  canonicalisation is **not injective** over JavaScript numbers. If you sign canonical bytes, two
  distinct inputs can share a signature.
- **Integer-like keys sort by UTF-16, not numerically.** `{10:…, 9:…, 2:…}` canonicalises with
  `"10"` before `"2"` before `"9"`. `Object.keys` returns integer-like keys in *numeric* order, so
  an implementation that sorts `Object.keys` output gets a different answer. This implementation
  sorts and serialises directly and is unaffected.
- **Numbers above 2^53 silently lose precision.** `stringify({n: 9007199254740993})` emits
  `{"n":9007199254740992}`. Do not round-trip identifiers through JSON numbers; use strings.

---

## 5. Script and consensus

**Measured on published 9.37.0.**

- **`Script.fromBuffer` is total.** Every byte string parses, including a push whose *length
  prefix* is cut off (`6a4c`, `6a4d01`, `6a4e0100`, bare `4c`). It has not thrown since 9.35.0.
  One such script is on livenet.
- **`fromString(toString())` round-trips an undecodable push** (since 9.37.0; measured on five
  shapes). Before 9.37.0, `toString` wrote a cut-off prefix as raw bytes that its own `fromString`
  then refused, so the text form was write-only for scripts that exist on the chain.
- **`toASM` is deliberately lossy for a short DATA push.** `6a4c050102` renders as
  `OP_RETURN 0102`, which re-parses to `6a020102` — a different script. ASM is for reading, not
  for round-tripping. Use `toString`/`fromString`, or the buffer, when the bytes must survive.
- **The original-algorithm signature digest drops a partial operand** (correct since 9.37.0). Where
  a `scriptCode` ends in a push the node cannot decode, the node declares the full length and
  writes only the bytes its own parse reached. Any version before 9.37.0 computed a different
  digest, so a signature valid on the network did not verify locally and vice versa. This is
  reachable at hash type `0x61` (`FORKID|CHRONICLE`), which is current; BIP-143 never walks the
  script and was never affected.
- **Post-Genesis `OP_CHECKLOCKTIMEVERIFY` is a NOP.** Measured: `OP_CHECKLOCKTIMEVERIFY` and
  `OP_NOP2` are the same opcode, `177`. **CLTV alone does not lock anything.** A working timelock
  needs three things together: a non-final sequence number, the HEIGHT-vs-TIMESTAMP unit guard
  (the check almost everyone omits), and 2038 sign-padding. `bsv`'s `lockUntil` DSL has all three;
  `@smartledger/bsv-core` has no DSL at all as of 1.6.0.
- **`valueCovenant` pins the whole output set, not one output.** If you want a single output
  pinned, use `valueCovenantSingle` (9.28.0+). Note that 32 zero bytes is the legitimate
  `hashOutputs` for an out-of-range index — a zero pin pins *nothing*.

---

## 6. Secret sharing

**Measured on published 9.37.0.** `Shamir.split(secret, threshold, shares, options)`.

- **The integrity checksum is off by default, and should stay off.** With `{checksum: true}` the
  field is `sha256(secret)[0..4]` — measured, and **identical across two independent splits of the
  same secret**. That makes it an offline oracle: anyone holding one share can confirm a guessed
  secret without reaching the threshold. Enable it only for high-entropy secrets where
  tamper-detection outweighs that leak.
- **`splitId` is the non-leaking alternative.** It is random per split (measured: two splits of the
  same secret have different `splitId`s), so it detects shares mixed between splits while
  disclosing nothing about the secret.
- **A share is a hex string of ODD length**, so `Buffer.from(share, 'hex')` **silently drops the
  last nibble** — measured: a 35-character share becomes 17 bytes with no error. Keep shares as
  strings; do not round-trip them through a Buffer.
- **Share string length is `3 + 32 * ceil((len + 2) / 16)`** — measured at thirteen secret lengths.
  The `+2` matters: a formula using `ceil(len / 16)` is one block short exactly when
  `len mod 16` is 15 or 0.

---

## 7. Cost

Two operations are superlinear and match the node, which bounds them with *policy* this library
does not copy. If you accept untrusted scripts or build large transactions, bound them yourself.

- **Signing is superlinear in input count.** The midstate half was fixed in 9.22.1 (5,000 inputs
  went from 194s to 100s, byte-identical output), but the remaining term is the re-verification
  inside `applySignature`.
- **`OP_DIV` is quadratic** in both `bsv` and `bsv-core`, matching the node's own behaviour.

---

## 8. Browser bundles

- **The feature bundles externalise `bsv`.** `bsv-message.min.js` and `bsv-ecies.min.js` expect
  `global.bsv` to exist already and set `bsvMessage` / `bsvEcies`; they do not bring their own
  copy. Load `bsv.bundle.js` first.
- **The bundles ship their own `Buffer` shim.** Pass hex strings and WIF strings across the
  boundary, never host `Buffer` objects.
- The bundles are built from the same `index.js` as the package and match it.

---

## 9. Reading this file safely

Everything above is a measurement of a **named published version**. Two habits make the difference
between using it and being misled by it:

1. **A changelog is not an artifact.** When a claim matters to you, install the version you
   actually ship and run the check. `test/properties/relied_upon.js` is written to run against
   either the working tree or an installed package for exactly this reason.
2. **Check which half of a rule you have evidence for.** A test suite that passes tells you the
   refusals fire; it does not tell you the acceptances do. Several defects in this library's
   history were found only after asking which direction the corpus had never exercised.
