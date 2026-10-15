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
- a Merkle leaf. Refusing non-canonical encodings **on the received bytes before hashing** stops a
  *third party* adding the twin as a second leaf, but it does not stop the **signer** producing
  another valid signature over the same statement (see below). A one-leaf-per-statement rule
  therefore has to derive the leaf from a canonically serialised, domain-separated statement
  identity — signer plus the signed id or sequence number — and enforce uniqueness at admission.
  Keep the signature bytes in the leaf as evidence if you like; just do not let them be the
  identity.

**What to key on instead:** an identifier the *signature covers* — a signed statement id, nonce or
sequence number — never the signature bytes. Age and skew bounds are an additional check and not a
dedupe: a signed timestamp with an open window still admits a replay inside the window, and a
timestamp the receiver assigns does not distinguish a replay at all.

Then there are **two ways to be safe against a replay**, and the second is stronger than the first:

1. **Record acceptance** of that identifier, atomically, everywhere the request can arrive. This
   makes a replay an error you have to catch — and therefore a store you have to keep correct.
2. **Make the keyed tuple fully determine the effect**, so a replay re-asserts the same fact and is
   a no-op. A consumer keying acceptances on `(paymail, xpub, ts)` pins both the handle and its
   destination, so re-presenting the same request inside the window re-asserts the same transfer to
   the same `xpub`; nothing is recorded, and nothing needs to be. Signature non-uniqueness cannot
   matter there, because the signature contributes nothing to the outcome. That reasoning is the
   consumer session's, and it is better than the advice this page gave first: a determining tuple
   beats a replay store, because it removes the failure instead of detecting it.

The condition on (2) is worth naming, because it is where it stops holding: the **effect** must be
a state assertion rather than an event. If something downstream treats each acceptance as an
event — a log line, a notification, a counter, a state machine that cannot be re-entered — then two
submissions are two events even though they assert one fact, and you are back to needing (1). So
the question to ask of your own system is not "should I deduplicate signatures" (never key on
those) but **"is this an assertion of state, or an event?"**

**`{ lowS: true }` removes one twin. It does not give you one byte string per statement.**
Since 9.38.0:

```js
bsv.Message(text).verify(address, sig, { lowS: true })   // false for the malleable twin
bsv.Message.verify(text, address, sig, { lowS: true })   // the static form takes it too
```

With the option, `message.error` reads *"The signature is not canonical: s is above half the
curve order"*, so you can tell a malleability refusal from a wrong-key failure.

**Adopting it rejects nothing this library produces.** `sign()` has only ever emitted low-s —
measured over 40 fresh keys in `test/message/low_s_option.js`, not assumed. It may still reject
signatures from *other* implementations that legitimately emit high-s, which is why it is opt-in
rather than the default.

**The default will change.** Accepting a high-s signature now emits a one-time deprecation notice
naming 10.0.0, which is when refusing becomes the default. Per
[STABILITY.md](../STABILITY.md) a breaking fix is marked in a minor and flipped in the major, and
this is a compatibility change rather than a bug fix: the signatures being refused are valid
ECDSA. The notice fires only on the accept — a canonical signature raises nothing, and neither
does a verify that already passes `{ lowS: true }`. Silence it with
`BSV_NO_DEPRECATION_WARNINGS=1` if you have decided to stay on the old behaviour until 10.0.0.

If you would rather do it at your own boundary, the check is: decode, require `2s <= n - 1`,
re-encode, and demand the input back byte for byte.

### Before 9.38.0 the option is a silent no-op — probe for it, don't assume it

`{ lowS: true }` is a parameter **from 9.38.0 onward**. On every earlier version the call still
succeeds, the argument is ignored, and the twin verifies anyway. Measured on installed tarballs:

| package and version | instance `verify` arity | static arity | twin, plain | twin with `{ lowS: true }` |
|---|---|---|---|---|
| `bsv` 9.16.1 | 2 | 3 | `true` | **`true`** |
| `bsv` 9.37.0 | 2 | 3 | `true` | **`true`** |
| `bsv` 9.38.0 | 3 | 4 | `true` | `false` |
| `bsv` 9.39.0 | 3 | 4 | `true` | `false` |
| `bsv-core` 1.7.0 | 2 | 3 | `true` | **`true`** |
| `bsv-core` 1.8.0 | 3 | 4 | `true` | `false` |

**`@smartledger/bsv-core` only gained the option in 1.8.0**, which means it was a no-op in the
*newest* release of that package until this page's advice was checked against it rather than
assumed. If you use both packages, the boundary is 9.38.0 and 1.8.0 — and `bsv-core`'s major is
2.0.0, so that is where its default flips, not 10.0.0.

JavaScript does not complain about an extra argument, so there is no error, no warning and no
protection. **A strictness option that silently does nothing is worse than no option at all**,
because it is now written in your code as evidence that you handled the hazard. If you adopt the
option, probe for it in behaviour rather than trusting your lockfile — an arity check would pass on
a build that wired the parameter without using it:

```js
function lowSOptionWorks (bsv) {
  var priv = bsv.PrivateKey.fromRandom()
  var address = priv.toAddress().toString()
  var sig = bsv.Message('probe').sign(priv)
  var raw = Buffer.from(sig, 'base64')
  var n = bsv.crypto.Point.getN()
  var s = bsv.crypto.BN.fromBuffer(raw.slice(33, 65))
  var twin = Buffer.concat([
    Buffer.from([31 + (((raw[0] - 31) & 3) ^ 1)]),
    raw.slice(1, 33),
    n.sub(s).toBuffer({ size: 32 })
  ]).toString('base64')
  // the twin must verify WITHOUT the option and be refused WITH it
  return bsv.Message('probe').verify(address, twin) === true &&
    bsv.Message('probe').verify(address, twin, { lowS: true }) === false
}
```

Run it once at startup and fail loudly. The same caution applies to any option this library grows:
an unrecognised key in an options object is ignored, not rejected.

### Low-s does not make a signature unique, and no encoding rule can

This is the misreading the option invites, so it is stated as a measurement. **Measured on
published 9.39.0**, with the key and message above: seven **distinct** signatures over one
`(key, message)`, every one of them low-s, every one verifying, and every one passing
`verify(address, sig, { lowS: true })`.

```
deterministic   H5yoMJLTxFCcOxRdE+QKNFbB…   r 9ca83092d3c4
preset k #1     Hy0g4nM46wBgNfBHue9ycMz+…   r 2d20e27338eb
preset k #2     H1qtx4cK1id56+3VXZV5sNwk…   r 5aadc7870ad6
preset k #3     HxIvnoepQBuACvkSQuiUuQuq…   r 122f9e87a940
preset k #4     HwF1tXam5mXhlv8EKGfCBRE2…   r 175b576a6e66
randomK #1      IEenDVjlYbIsETSovGj4CNSG…   r 47a70d58e561
randomK #2      IDjA2O56G5DOMOgX+tYpBvCM…   r 38c0d8ee7a1b
```

These are **different signatures**, each with its own `r`, not alternative encodings of one: ECDSA
picks a nonce, and both `ECDSA#randomK()` and a preset `k` are on the public surface. Be precise
about what `{ lowS: true }` refuses, because the distinction is the whole point: the twin is a
**different `(r, s)` pair** — the same `r`, with `s` replaced by `n − s` — carried in a second
compact byte string. Two separate things therefore exist, and neither is the other:

- **malleability**: given one signature you already accept, can an outsider turn it into different
  bytes you also accept? Low-s says no for the demonstrated twin, and canonical base64 says no for
  a re-encoding of it (`Message` signatures are 65-byte compact, so DER strictness is not what is
  doing the work here — that applies to `crypto.ECDSA`'s DER form). Worth having, and it assumes
  the attacker has no signing capability and no other valid signature of their own.
- **uniqueness**: is there one signature per statement? No rule can deliver that, because the
  holder of the key can always produce another, and the set of valid low-s signatures over a
  message is as large as the nonce space.

**`Message#sign` is deterministic, and that is an implementation property, not an inference from
samples.** `lib/crypto/ecdsa.js` derives the nonce with `deterministicK`, the RFC 6979 §3.2
HMAC-SHA256 ladder keyed on the private key and the message hash alone, with the `badrs` retry the
RFC specifies; `_findSignature` then applies `ECDSA.toLowS(s)` unconditionally on every path, which
is why `sign()` cannot emit a high-s signature for any input. Measured alongside that: five calls
over the same bytes with one key return one identical signature, and an independent implementation
in another language reproduced our reference vector byte for byte.

**But determinism is a property of this signer, never of a verifier's input**, which arrives from
whoever sent it. Writing a test that asserts "exactly one record" and relying on signer determinism
to keep it true is the shape of mistake to avoid: that property has to come from your deduplication
key.

**The rule, in one line: a signature is evidence that the key authorised a statement — its bytes
identify neither the statement nor a signing event.** Key identity and deduplication on the
statement's own fields.

That is a sharpened version of a consumer session's formulation, "a signature names an act of
signing, never the claim". The first half of theirs does not survive the same scrutiny as the
second: a deterministic signer re-signing the same statement produces the *same* bytes, so the
bytes do not name one act of signing either, and a twin reshaped in transit was produced by no
signing act at all. The half that matters is unchanged — never the claim.

### A note on testing your side of this

You are probably about to write a test. The natural one — assert that `verify()` returns `true`
for a malleated signature — observes **this library**, which is not where your risk is. The harm
lands in your own dedupe table, nonce store or audit log, and no assertion about `verify()` can
see it.

The general form of that mistake, which cost this estate four separate near-misses in one day:

> **A test can miss a mutation because it observes the wrong layer.** A truthy object for what a
> guard decides. `textContent` for what the eye can compare. A thrown exception for what a
> verification result reports. A parsed field for what a signature actually covers.

When a mutant survives, the question that works is not *"is this guard tested?"* but **"does my
assertion observe the layer the guard acts on?"** For malleability, that layer is your store: feed
it both twins and assert it holds one row.

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
- **Mutating a script in place does not change the transaction** (published 9.39.0).
  `output.script` and
  `input.script` hand out the live `Script` object, but both serializers write the bytes the
  output or input was *set from*. So `tx.outputs[0].script.add(...)` changes the object, changes
  what `getSize()` measures, and **changes nothing about what is broadcast** — the mutation is
  silently dropped and the fee is computed for a transaction that will not be sent. The remedy is
  one line: `output.setScript(output.script)` after mutating, or build the script before setting
  it. Since 9.39.0 the output case emits a deprecation notice *when you ask for a size*, which is
  the only place the two byte strings have both already been computed; a mutation followed by
  serialization with no size enquiry is still silent, and the input case has no such notice at
  all. **If you size transactions by serialising them** — `tx.uncheckedSerialize().length / 2`, as
  at least one wallet in this estate does — you are immune to the divergence by construction, and
  the notice will never reach you either, because `getSize()` is never called. **Re-setting changes the output**, so the txid changes and any signature already made over
  it must be remade — which is why building the script before setting it is the better habit. The
  flip is scheduled in [RELEASE-10.0.0.md](RELEASE-10.0.0.md).
- **Parsing a script and re-encoding it is byte-faithful** (published 9.39.0).
  `Script.fromBuffer(b).toBuffer()`
  equals `b` — measured over **every script of three bytes or fewer** (16,843,009, exhaustive) plus
  400,000 push-biased random scripts of 4 to 43 bytes: **0 divergences**, including non-minimal
  pushes (`4c01ff`, `4d0100ff`, `4e01000000ff`) and cut-off length prefixes (`6a4c`, `6a4d01`,
  bare `4c`). Two consequences: the mutation notice above has no false positives, since nothing
  but a mutation can make an output's two byte strings differ; and *the text forms are the lossy
  ones* (see `toASM` above), not the buffer form. Do not read this as a promise that
  re-serialising a parsed script is always safe — it is a measurement of this parser, and
  `test/transaction/output_inplace_mutation.js` keeps it honest.
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

## 9. SPV and anchor verification

**Measured on published 9.39.0** — every claim in this section was re-run against the installed
tarball, not the working tree — with real mainnet headers serialised outside this library (`version
| prevHash | merkleRoot | time | bits | nonce` → 80 bytes, double SHA-256, hash confirmed before
the library saw the bytes) and with the vendored mainnet certificate for block 954784 in
`test/data/notaryhash-mainnet-certificate.json`.

**A header is 80 bytes, never a set of fields.** `SPV.verifyTxInclusion`,
`SPV.verifyHeaderChain` and `NotaryHash.verifyAnchorSPV` all read one 80-byte snapshot. A plain
object stating a `merkleRoot` is refused outright. An object carrying a `toBuffer()` is trusted
blindly: the bytes it returns are what gets checked, and the object's own stated fields are never
consulted. So your header provider's field names cannot mislead this library — as long as you hand
it bytes.

**`BlockHeader.fromObject` has two silent-corruption paths**, both of which then fail the
proof-of-work check for a reason that does not name the cause:

- `bits` as the hex *string* a provider's JSON carries (`'182afffe'`) builds a header with a
  different id and does not throw.
- `prevHash` and `merkleRoot` are byte-reversed when they are hex *strings* and left alone when
  they are Buffers. An internal-order hex string therefore yields a wrong id, silently.

Build the 80 bytes yourself and pass a Buffer, and neither path exists.

**There is no notion of confirmations or depth anywhere.** `verifyAnchorSPV` reads no
confirmations option and `verifyHeaderChain` has no concept of height. Burial depth is entirely
the caller's policy, applied out of band.

**A header does not carry its height.** `verifyAnchorSPV` compares `opts.height` with
`spv.blockHeight` only when you supply it; omit it and the envelope's claimed height is never
checked. The height binding then rests entirely on your provider's height → header mapping, where
an off-by-one is invisible to this library. Always pass `height`.

**`blockHashAtHeight` is the only orphan check, and it is easy to make circular.** Passing the
header's own hash, or `certificate.spv.blockHash`, returns `valid: true` having checked nothing;
passing a different hash gives *"the header is not the block the caller's chain has at that height:
it may be orphaned"*. The value is worth only as much as the chain view behind it: it must come
from a source that has independently **selected a branch**, not from the header being checked, not
from the certificate, and not from a height index served by whoever supplied the header.

**`verifyHeaderChain`'s `trustedHash` is satisfied by either end** — the oldest header (anchor) or
the newest (tip) — and the result does not say which matched. A single header equal to it returns
`valid: true, count: 1`: a chain that proves nothing. The result hands you `anchorHash` and
`tipHash`, so compare those against your own base and expected tip, and assert `count`. Headers
supplied in the wrong order *are* caught, by linkage.

**Two fields called `work`, in two different units.** `verifyTxInclusion` returns work in
**hashes**, as a decimal string (block 954784: `109822554288093618317`). `verifyHeaderChain`
returns a float sum of per-header **difficulty** (`95895846216.96` for 970073–970075). Neither is a
node's `chainwork`, and they are 4.3e9 apart.

**A difficulty floor taken from the docstring's illustrative figure refuses real blocks.** The
docstrings say a real BSV header is "about 2.6e10" to fix the order of magnitude. Block 954784 is
difficulty 2.5570e10, so `minDifficulty: '2.6e10'` rejects a genuine mainnet certificate. Measured
across **1,415 consecutive mainnet headers** (969801–971215, taken from a third party's live header
feed and each one's proof of work checked here): **2.3431e10 (height 970874) to 4.1440e10 (height
971044)**, a 1.77× spread inside ten days — reproduced independently by another session from each
block's `bits` as a block explorer reports them, a different source and method, same two extremes — so a 2.6e10 floor refuses headers that are in the chain right now, not just one old
block, and BSV's cw-144 schedule moves further still over longer spans. A floor is a
free-forgery cut-off, not a measure of chain quality; if you set one, derive it from the lowest
difficulty in the height range you accept and test it there. Supplying `blockHashAtHeight` alone
satisfies the 9.13.0 deprecation and is the check that actually addresses orphans.

**What an inclusion proof does not establish**, however much work the header carries: the block's
or the transaction's consensus validity, the output's UTXO status, the absence of a conflicting
spend on another branch, or that this branch is the network's most-work chain.

### The direction you verify in changes what you need

**A trusted block hash commits to exactly one ancestry.** Hash the 80 bytes to confirm they are
that block, and its `prevHash` fixes its parent; that parent's bytes fix the grandparent, and so
on. Forging an ancestor needs a hash preimage, not hashpower, so a downward walk needs no
proof-of-work check and no difficulty schedule. That commitment is *all* it gives: the ancestors'
consensus validity and their place on the network's chain are inherited from the decision to trust
that one hash, not proved by the walk — and a reorganisation deep enough to displace the trusted
block displaces everything under it.

Extending **forward** from a trusted hash is the opposite case. Several valid chains can exist, so
the choice between them needs work compared across the branches the verifier can see, and no
verifier can see a branch nobody served it. Source independence is the whole of the mitigation
there, and two sources that share an upstream are one source.

---

## 10. Reading this file safely

Everything above is a measurement of a **named published version**. Two habits make the difference
between using it and being misled by it:

1. **A changelog is not an artifact.** When a claim matters to you, install the version you
   actually ship and run the check. `test/properties/relied_upon.js` is written to run against
   either the working tree or an installed package for exactly this reason.
2. **Check which half of a rule you have evidence for.** A test suite that passes tells you the
   refusals fire; it does not tell you the acceptances do. Several defects in this library's
   history were found only after asking which direction the corpus had never exercised.
