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
| `bsv` 9.39.1 | 3 | 4 | `true` | `false` |
| `bsv-core` 1.7.0 | 2 | 3 | `true` | **`true`** |
| `bsv-core` 1.8.0 | 3 | 4 | `true` | `false` |
| `bsv-core` 1.8.1 | 3 | 4 | `true` | `false` |
| `bsv-core` 1.9.0 | 3 | 4 | `true` | `false` |

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

### The inconsistency is estate-wide, and one sibling's verdict is a truthy string

**Re-measured 2026-10-16 after `@smartledger/notaryhash` 2.5.0 was published**, in an isolated
tree with each version asserted before measuring: `@smartledger/notaryhash` **2.5.0**,
`@smartledger/crypto` 3.3.0, `@smartledger/keys` 4.1.0, `@smartledger/envelope` 3.0.1. Every function below was called with
invalid input and, where it returned a thenable, awaited — because a function that **rejects** on
bad input is safe for `if (await f())`, and only one that **resolves to a truthy failure** is not.

| package | function | success key | its value when invalid | error key |
|---|---|---|---|---|
| notaryhash | `verifyCertificateOffline` | `ok` | `false` | `reason` |
| notaryhash | `verifySealedLink` | `ok` | `false` | `reasons` |
| notaryhash | `checkAnchorBySpv` | `ok` **and** `status` | `false` / `"invalid"` | `reason` |
| notaryhash | `sealedLink` | `ok` **and** `status` | `false` / `"invalid"` | `reason` |
| crypto | `verifySignedEnvelope` | `valid` | `false` | `details` |
| envelope | `verifyJson` | `valid` | `false` | `error` |
| envelope | `verifySignedEnvelope` | `valid` | `false` | `error` |

Taken with this library's own four functions above, that is **three different success keys**
(`ok`, `valid`, `status`) and **five different error keys** (`error`, `errors`, `reason`,
`reasons`, `details`) across five packages that are routinely used together. And one more
function, `crypto.verifyUsingSuite`, **rejects** rather than resolving a result object, so no
single idiom covers the set.

`notaryhash.verifyDocument` also rejects in the probe above, but its maintainers point out that it
does so only with a `TypeError` for missing document bytes — a programming error rather than a
verdict — and that every other outcome resolves to a result object. Corrected here rather than
left as measured, because "it rejects" and "it rejects when you call it wrongly" are different
claims and only the second is true of it.

**The dangerous shape is FIXED as of notaryhash 2.5.0, and is live in every earlier version.**
In 2.4.2 and before, `checkAnchorBySpv` returned `status` as its **only** verdict — the union
`'valid' | 'invalid' | 'indeterminate'`, all three non-empty strings and therefore all truthy — so
`if (check.status)` accepted an anchor the library had just refused. `sealedLink` had the identical
shape. 2.5.0 adds a boolean `ok` to both, true exactly when the status says valid, and the types
are discriminated unions so `{ ok: true, status: 'invalid' }` is unrepresentable rather than merely
wrong. Verified on the published artifact, installed with the version asserted: both now return
`ok: false` beside `status: "invalid"`.

So **`status` is no longer a sole verdict anywhere in the estate**, and the silent-accept trap is
gone from the current releases. Two things remain true and are why this subsection stays:

- **If you are pinned below notaryhash 2.5.0 the trap is live**, and no amount of reading the
  current docs will tell you that. `if (check.status)` accepts a refusal on 2.4.2.
- **The naming is still not uniform.** Success is spelled `ok` in notaryhash and `valid` in crypto
  and envelope; failure is spelled `reason`, `reasons`, `details` or `error` depending on which
  function you called. That is an inconsistency rather than a hazard — every current verdict has a
  boolean to read — but it still means the correct spelling for one function is wrong for the next.

The rule for a string-valued verdict stands wherever one appears: compare it,
`check.status === 'valid'`, never `if (check.status)`.

**How that fix came about, recorded because the pattern recurs.** It was reported to the package's
maintainers, who added the boolean and then **corrected themselves within the hour**: their first
report said `ok` was already on every verdict, and `sealedLink` still returned only a status string
with the identical trap. A fix applied to the instance that was reported leaves its siblings behind
unless somebody enumerates them — the same lesson this library learned when 9.23.0 fixed a class at
the wrapper layer and left the top-level forwarders untouched, where the forwarders turned out to be
the reachable half. `@smartledger/notaryhash@2.5.0` was published 2026-10-16 (registry shasum
`ef217d95…23a8`, 61 files) with `ok` on all five verdict types; they are deliberately **not**
renaming keys across their surface, which would be breaking.

**What this section can and cannot promise about the siblings.** This library does not depend on
any of them — their behaviour is not pinned by our test suite and cannot be, so the table is a
**dated measurement of those four versions**, not an enforced property. Re-measure before relying
on it. One thing checked and found NOT to be a defect, recorded so nobody re-reports it:
`isKeyUsable({})` returns `true`, which looks like a false accept but is the documented tolerance
for key records written before `status` existed — the code matches its docstring, and an
unparseable `expiresAt` is treated as expired rather than as "no expiry", which is the safe
direction.

### `NotaryHash.verify`'s per-check fields are not independent of each other

`valid` is sound: it is false whenever anything is unproven, including an unchecked seal. The
fields beside it are a breakdown, and two of them do not read as their names suggest when a seal
is present.

Measured, on the shipped mainnet certificate with an `anchor.seal` member added and nothing else
changed:

- **`anchor` is `false` although the anchor verified.** The seal is refused both by
  `verifyAnchorSPV`, which is public and must refuse on its own, and again by `verify`. The
  anchor's own result carries the seal's refusal with it, so a caller asking "is the anchor bad,
  or only the seal?" is told the anchor is bad. `sealUnchecked: true` is the field that answers
  the question correctly.
- **the seal error appears twice in `errors`**, once from each of those two checks.

Neither weakens a verdict — both make the result *more* refusing, not less — so neither is
being changed in a 9.x release: removing the duplicate refusal would turn `anchor` from false to
true for every sealed certificate, and a caller who gates on `anchor` alone would begin accepting
records it rejects today. Under `STABILITY.md` a loosening like that waits for 10.0.0. Until
then: **gate on `valid`, or on `isValid()`; read `anchor` and `errors` for triage only.**

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
- **A certificate carrying `anchor.seal` is refused, by itself.** Sealed records are what the
  NotaryHash service now issues, so this is the refusal most likely to be met in production.
  `verify` does not implement seals, and a seal is a chain-of-custody claim, so presenting one
  as verified would be wrong. Measured on the real mainnet certificate this repository ships as
  `test/data/notaryhash-mainnet-certificate.json`: with its own header it is `valid: true`;
  adding an `anchor.seal` member and changing nothing else makes it `valid: false` while
  `signature`, `proofIntegrity` and `batchInclusion` all stay true; adding
  `allowUncheckedSeal: true` makes it `valid: true` again. That option means *I will check the
  seal myself* — with `@smartledger/notaryhash`'s `verifySealedLink`, not `sealedLink`, for the
  reason in §9 — and it does **not** wave through a seal that is not an object.
- **There is no bech32, SegWit or Taproot support, anywhere** (measured: no such member on the
  public surface). This is a BSV library. One adapter cannot serve BSV, BTC and LTC.

---

## 4. Canonical JSON

**`@smartledger/bsv/jcs` is a public subpath export** — measured, `{ stringify }`, present in
9.16.1 and 9.37.0 alike. At least one project vendored its own copy believing it was private. It
scores 11/11 against the attest-spec conformance vectors.

**A named ESM import of a subpath needs 9.39.1 or later.**
`import { stringify } from '@smartledger/bsv/jcs'` type-checks against every version and, under
Node's own ESM loader, *threw* on every version that has the subpath:
`SyntaxError: Named export 'stringify' not found`. Measured directly against installed 9.2.0,
9.20.0, 9.38.0 and 9.39.0, and true of the other 45 by construction — of all 133 published
versions, not one declares an `import` condition for `./jcs`, `./covenant` or `./smartcontract`,
so the loader has always resolved the CommonJS entry. The cause is packaging, not the module:
each subpath entry is a bare `module.exports = require('./lib/util/jcs')`, and Node's CJS
named-export detection is a static scan of that source, which cannot see through a re-export.
TypeScript permits named imports from CommonJS, so no declaration shape reports it and no amount
of type checking catches it. A **bundler** with its own CommonJS interop may have served the name
regardless — esbuild 0.28.2 does, measured on published 9.39.0 — so this bit Node-native ESM
consumers, not bundled ones.

9.39.1 adds a generated ESM wrapper behind every subpath's `import` condition: 113 names across
12 subpaths, each measured importable by name on Node 22.23.3. The CJS entry files are
byte-identical to 9.39.0, so `require` still returns the module's own object, and the ESM default
export is that same object — but a *named* ESM export captures its value when the wrapper
evaluates, so it is not a live binding onto `module.exports`; the default export holds the same
object reference, so mutations of that object are visible while a later reassignment of
`module.exports` would not be. Against 9.39.0 or earlier, use the default import:
`import jcs from '@smartledger/bsv/jcs'`.

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
- **`Sighash.sighashPreimage` does not always return a preimage.** On the **original**
  (pre-FORKID) algorithm with `SIGHASH_SINGLE` and an input index past the last output, it
  returns the 32-byte sentinel `0x00…01` — the 2013 SIGHASH_SINGLE bug, which the node's
  `SignatureHashOriginal` returns as `uint256(1)` — and `sighash` passes it through
  **unhashed** so the digest matches the node. A caller that SHA-256s whatever
  `sighashPreimage` returns computes, in that one case, a digest the network never produces.
  Special-case the sentinel; do not hash it. On the FORKID path at the same point you get a
  real preimage with **32 zero bytes** in the `hashOutputs` slot, which is a different
  mechanism: BIP-143's three digests are default-constructed and simply left unassigned, so
  "32 zero bytes" and "no commitment" are the same state. Both are pinned in
  `test/transaction/sighash_commitment_table.js`, and the construction-side hazard they create
  is the vacuous pin described above under covenants.
- **A covenant built with this library needs Genesis, and the reason is the size limits, not the
  opcodes.** Three eras matter and they are not interchangeable:

  | era | what it gives | what needs it |
  |---|---|---|
  | Monolith (2018) | `OP_SPLIT`, `OP_CAT`, `OP_BIN2NUM`, `OP_NUM2BIN`, … | everything; and it cannot be switched off here, so this library says nothing about earlier |
  | **Genesis** (2020) | unbounded element size and script numbers | **the OP_PUSH_TX gate itself** |
  | Chronicle | `OP_SUBSTR`, `OP_LEFT`, `OP_RIGHT` restored | any covenant that reads the preimage by slicing |

  Measured: `PushTx.authenticator()` passes on mainnet and fails `SCRIPT_ERR_PUSH_SIZE` without
  `SCRIPT_UTXO_AFTER_GENESIS`, because the preimage it must push is **536 bytes** against a
  pre-Genesis element limit of 520. All four pre-Genesis limits were checked against it, from the
  node's own constants rather than from memory, so this is exhaustive for this script rather than
  hedged: element size 520 **binds** (536), script numbers 4 bytes **binds** (32-byte
  arithmetic), op count 500 does **not** (the gate counts 202 opcodes above `OP_16`), script size
  10,000 does **not** (377 bytes). The op figure is worth knowing because the obvious wrong number
  is Bitcoin Core's **201**, which the gate would trip — BSV's
  `MAX_OPS_PER_SCRIPT_BEFORE_GENESIS` is **500**. A larger covenant can of course reach the op or
  size cap; this one does not. Both limits it depends on were isolated separately: a 536-byte
  element push and an `OP_CAT` *producing* 528 bytes each give `SCRIPT_ERR_PUSH_SIZE` pre-Genesis
  and pass on mainnet, and `OP_ADD` on two 32-byte numbers gives `SCRIPT_ERR_SCRIPTNUM_OVERFLOW`
  pre-Genesis — which is the in-script `s = (e + Gx) mod n` arithmetic. So the gate is not
  "portable to any chain with the splice opcodes"; **its floor is Genesis**, and Chronicle sits on
  top of that for anything that slices.
- **This library cannot model the pre-2018 era, so it is not evidence about one.** The Monolith
  and Magnetic opcodes — `OP_SPLIT`, `OP_CAT`, `OP_AND`/`OR`/`XOR`, `OP_DIV`, `OP_MOD`, `OP_MUL`,
  `OP_LSHIFT`/`RSHIFT`, `OP_INVERT`, `OP_BIN2NUM`, `OP_NUM2BIN` — are **always enabled and cannot
  be turned off**. `SCRIPT_ENABLE_MONOLITH_OPCODES` and `SCRIPT_ENABLE_MAGNETIC_OPCODES` are still
  exported, and still accepted, but setting them changes nothing: they are redundant. Measured,
  `OP_SPLIT` performs its split and raises no error under **every** flag set that can be
  constructed, including `SCRIPT_VERIFY_NONE` (zero) and a pre-Genesis, pre-Chronicle set.

  They are unconditional on purpose. Gating the Magnetic group behind its flag refused **77 rows
  of the node's own corpus** as `DISABLED_OPCODE` — fail-closed, so nothing was wrongly accepted,
  but they were spends the network accepts. The consequence to rely on is narrow and matters for
  any chain that is not BSV mainnet: **a `verify` result from this library says nothing about
  whether a pre-Monolith rule set would accept the script**, because the question cannot be put to
  it. It will evaluate such a script confidently and the answer is not era-evidence. Use a node
  that can express that era. By contrast the Genesis and Chronicle eras *can* be expressed, with
  `SCRIPT_UTXO_AFTER_GENESIS` and `SCRIPT_UTXO_AFTER_CHRONICLE`, and `OP_SUBSTR`/`OP_LEFT`/
  `OP_RIGHT` really do change behaviour across the Chronicle line — they are silent **no-ops**
  before it, which is why a covenant that slices the preimage fails closed on a pre-Chronicle
  chain rather than running with the wrong stack.
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
- **A Token authorization is only sound if its signature is `SIGHASH_ALL`, and before 9.40.0
  nothing checked.** `SmartContract.Token`'s whole argument is that authorization is a signature
  over this spend, so `hashOutputs` commits to the recreated output and altering the destination
  invalidates the proof. The covenant's `0x41` assertion applies to the OP_PUSH_TX **preimage**,
  not to that signature, and `OP_CHECKSIG` takes its mode from the flag byte the signer chose.
  Measured on published 9.39.1: an authorization signed `SIGHASH_NONE|FORKID` **verifies**, and it
  is **reusable** — holding the input, `version`, `nSequence` and the victim's `nLockTime` fixed,
  an attacker grinds its own destination keys until the OP_PUSH_TX s-value condition holds, and
  the redirect **verifies under mainnet consensus flags** with the victim's signature unchanged
  (4 and 67 candidate keys on two runs; independently reproduced in 35 by a second
  implementation of the harness). That is interpreter acceptance, not a network claim — the
  redirect and the victim's transaction spend the same prevout, so they are competing
  double-spends whose outcome depends on propagation and miner selection, and relayability was
  not tested against a node. The case with **no race in it** is the one to design against: any
  workflow where the authorization signature exists **before** the transaction is broadcast, such
  as signing and handing the signature to a service to assemble. **An already-issued unpinned
  lineage cannot be migrated** — measured: a successor carrying the pinned code is refused,
  because the covenant rebuilds its own `scriptCode` forward, so a lineage cannot change its own
  rules. For those tokens the remedy is operational: sign `SIGHASH_ALL`, as this library's API
  always does. **Use `Authorizers.singleKey({ pinSighash: true })`** (or
  `multisig(m, n, { pinSighash: true })`, which checks every one of the m signatures) — the pin
  makes the `SIGHASH_NONE` transfer fail to verify at all. This library's own
  `Token.unlockTransfer` always signs `SIGHASH_ALL|FORKID` and could never produce the vulnerable
  shape; the exposure is a hand-built unlocking script. The pin changes the locking script, so it
  is opt-in in 9.40.0 and the default in 10.0.0, and an in-flight lineage must finish under the
  code it was created with.
- **`valueCovenant` pins the whole output set, not one output.** If you want a single output
  pinned, use `valueCovenantSingle` (9.28.0+). Note that 32 zero bytes is the legitimate
  `hashOutputs` for an out-of-range index — a zero pin pins *nothing*.

### What a signature commits to when `OP_CODESEPARATOR` is in the script

**Measured on published 9.39.0 and `@smartledger/bsv-core@1.8.0`, against 20 rows computed
outside this library** (`test/data/sighash-codesep-executed.json`; all 20 preimages and digests
reproduce). The separator moves the *start* of the signed script, so these are properties of
what your signature actually covers.

- **A signature commits to the script from just past the last *executed* separator, not to the
  whole locking script.** Two scripts that differ only before that point produce the same
  digest. If you are deriving an identity from "the script that was signed", derive it from that
  suffix, not from the output's script.
- **The two digest algorithms disagree about the separators that remain in that suffix.** The
  original algorithm excises them and shortens the declared length with them; BIP-143 keeps them
  verbatim. The same suffix therefore yields two different scriptCode fields depending only on
  the hash type, and a hash type with `SIGHASH_CHRONICLE` set routes to the original algorithm
  even when `SIGHASH_FORKID` is also set.
- **Only executed separators count.** One inside an untaken `OP_IF` or `OP_ELSE` body does not
  move the start, at any nesting depth, and an executed separator is not undone by a later
  unexecuted one.
- **A `0xab` byte is only a separator where the script's own parse puts an opcode.** Inside a
  push operand it is data, and as a `PUSHDATA` *length* byte it is neither counted nor excised.
  Do not search a script's bytes for `0xab` to decide what was signed — walk it. Both halves are
  node-judged: `ab4dab00` declares 3 and carries `4dab00` (one separator counted, the length-field
  `0xab` not), and `ab6a4eababab` declares 5 rather than the 2 a byte scan would give.
- **Build scripts from bytes or with `.add()`, never by hand-setting `chunks` with a `len` that
  disagrees with its `buf`.** Such a list is not something any parse produces, and its
  serialisation re-parses as something else: `[PUSHDATA1 declaring 5 carrying 2,
  OP_CODESEPARATOR, OP_1, OP_CHECKSIG]` serialises to `4c05aabbab51ac`, which is **one 5-byte
  push** — the separator and the `OP_CHECKSIG` are swallowed as payload, and the output is
  spendable with an empty scriptSig. This library fails closed on the hand-built object
  (`SCRIPT_ERR_BAD_OPCODE`) and agrees with a node on the serialised bytes, so a local verify
  will not tell you the output is signature-protected. But nothing warns you at the point you
  put such a script into an output.

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
  inside `applySignature`. Measured on 9.39.1, one output, P2PKH inputs: 100 inputs 0.45s,
  400 2.6s, 800 5.5s, 1,600 14.3s, 3,200 45.0s — 2.14×, 2.59× then 3.15× per doubling, where
  linear is 2× and quadratic 4×, so the exponent **grows with the input count**. A few hundred
  inputs is comfortable; past that, split the work across transactions.
- **Outputs are cheap and linear, which is the opposite case.** One input, N one-satoshi P2PKH
  outputs on 9.39.1: 34,193 bytes and 729ms at N=1,000, 170,194 bytes and 3.2s at N=5,000 —
  a flat **34 bytes per output** from about N=100 up, and the 1,000-output transaction
  round-trips with a stable txid, `verify()` true and `isFullySigned()` true. So fan-out wide
  and fan-in narrow: building many outputs at once costs what the bytes cost, while consuming
  many inputs at once does not.
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

### A sealed chain's exclusivity is in the anchor layer, not in the link check

This library refuses sealed certificates (§3), so this is about the tool it points you at.
`@smartledger/notaryhash` exposes two things that sound alike:

- `sealedLink(previous, successor)` is the **structural** primitive. Its own contract says both
  certificates must already have verified their signature, proof hash and anchor, and that it
  checks only what joins them.
- `verifySealedLink(previous, successor, headerProvider, policy)` is the **entry point**. It
  verifies each certificate standalone, including the anchor, and degrades to `indeterminate`
  when either is unproven.

Measured with a synthetic pair carrying real signatures against notaryhash 2.4.2, and
unchanged in 2.5.0 (which adds `ok` to the result without changing which pairs it links):
`sealedLink(A, B)` and `sealedLink(A, C)` **both return `{status: 'linked'}`** for two different,
validly signed successors whose transactions spend the *same* seal outpoint. That pair is a
double spend, and only the chain decides which of them happened. So the uniqueness a seal is
supposed to buy — at most one successor — is established by each certificate's block
inclusion, and not by the link. **Call `verifySealedLink`; reaching past it to `sealedLink`
accepts both halves of a double spend.** Negative controls in the same run behave: a successor
whose transaction does not spend the named outpoint is refused, as is one whose link signature is
over the wrong digest, as is the pair in reverse order.

**An upstream change has landed, and it does NOT resolve the above.** In 2.4.2 `sealedLink`
returned only a status string, so `if (sealedLink(a, b).status)` was true for `'invalid'` as well as
`'linked'` — the same truthiness trap as `checkAnchorBySpv` in §2. **`@smartledger/notaryhash@2.5.0`,
published 2026-10-16, adds a boolean `ok` to it**, true exactly for `'linked'`, and their docstring
now reads "`if (check.status)` is true for every verdict, `'invalid'` included: read `ok`, or compare
`status`".

Read that for what it is: it removes a footgun in how you **read** the result. It does not change
the result. **`sealedLink` still reports a link for BOTH halves of a double spend** — now with
`ok: true` on both — because the ambiguity is in the chain, not in the field names. Exclusivity
still lives in the anchor layer, and `verifySealedLink` is still the function to call. The
measurement above was taken against 2.4.2 and the finding is unchanged by 2.5.0; what changed is
only that the result object now carries a boolean.

Two further properties of that library, measured on a live mainnet sealed record, because both
are easy to misread:

- **a genesis record's own seal signature authorises no successor.** It is a signature over
  `sealDigest(null, ownId)` and asserts only that this record starts a chain. A link is
  authorised by the *successor's* signature over `sealDigest(predecessorId, successorId)`.
- **`verifyCertificateStandalone`'s `confirmations` is the depth it proved, capped at the policy
  — not the depth of the block.** The walk stops once `confirmations >= minConfirmations`. On a
  record seven blocks deep: policy 1 returns 1, policy 6 returns 6, policy 7 returns 7, and
  policy 8 returns `ok: false` with `confirmations: null`. Comparing the returned number against
  your own threshold is therefore circular, because whenever the check passed it *equals* that
  threshold. Pass the depth you require and read `ok`.

---

## 10. Extension points: how each surface grows without breaking you

The sections above say what holds today. This one says **where a surface is designed to grow**, so
that a consumer can depend on it in a way that survives the growth — and names the places where
depending on the obvious thing pins you to a moment in time instead.

Every factual claim here is measured in the section named beside it, or by the command given.
The *rules* are design commitments for this library, not measurements.

**Consensus flag words: call the function, never copy the integer.** On 9.42.0
`Interpreter.useMainnetConsensus()` and `Interpreter.mainnetFlags()` both return `4020335`
(`0x3d586f`). That integer is not the API. The era flags inside it were **added** to
`mainnetFlags()` as a fix, because a helper named after mainnet had been omitting them and so
applied pre-Genesis bounds; a future era adds another bit the same way. A caller holding `4020335`
cannot receive that, and the failure is the dangerous direction: a stale word makes a validator
*stricter* than consensus for the eras it predates, which looks like a passing gate while it
rejects correct scripts and cannot discriminate the cases it was built to catch. Prefer
`useMainnetConsensus()` over `mainnetFlags()` unless you manage the limits yourself — the
script-number and element-size bounds are process-wide statics that no flag word carries, so flags
alone can leave a validator on 2019 limits. It mutates process-wide state, so call it once at
startup, not per item in a loop. See §5.

**Options objects: a new option is invisible to a consumer pinned below it.** An unrecognised key
is ignored, not rejected (§1, measured at 9.16.1 and 9.37.0). So adding an option is non-breaking
for us and *silently inert* for anyone on an older build, with the call sitting in their code as
evidence the hazard was handled. The rule: every option this library adds must be observable at
runtime, and §1 carries the shape of the behavioural probe — test the behaviour, never the arity.
Refusing unknown keys is a 10.0.0 candidate, recorded in
[RELEASE-10.0.0.md](RELEASE-10.0.0.md).

**Named parsers versus constructors: ask for the explicit one.** Several constructors here accept
an overloaded argument and **generate** when it is absent, which is documented and intended for
`new Mnemonic()` and `new HDPrivateKey()`. The hazard is that a named parser forwarding to one
inherits it. Measured on 9.42.0: `Mnemonic.fromString` returns a fresh mnemonic for `undefined`,
`null`, `''`, `0`, `false`, `[]`, a wordlist array and a Buffer, and `HDPrivateKey.fromString('')`
returns a fresh random key, while `PrivateKey.fromString`, `fromWIF` and `fromHex` refuse all of
them. Two of those inputs are worse than random because the result is *derivable by anyone*:
`Mnemonic.fromString([])` is twelve empty words every time, and `Mnemonic.fromString(Buffer.alloc(16))`
is the canonical BIP-39 `abandon … about` vector. From **9.43.0** both entry points emit a deprecation notice and otherwise
behave exactly as before, so nothing breaks; refusing is registered for 10.0.0 under
`mnemonic-fromstring-generates` and `hdprivatekey-fromstring-empty`. Do not wait for it —
validate before you parse (`Mnemonic.isValid`), use `Mnemonic.fromSeed(buffer)` for a seed, and
treat any key-material parser as requiring a non-empty string you checked. 10.0.0 splits the
overloaded constructors into explicit named ones rather than guarding parsers one at a time; the
rule is in [RELEASE-10.0.0.md](RELEASE-10.0.0.md).

**Signed formats: new ones are length-delimited and domain-separated.** A format that signs
concatenated fields with no length markers authenticates the byte string and **not** where one
field ends and the next begins, so a different split of the same bytes verifies under the same
signature. Measured outside this library on a mainnet Author Identity Protocol output: moving the
media-type/encoding and encoding/filename boundaries produced two field sets that are
byte-identical as a message and verify under one unchanged signature. Nothing can fix that for a
format already in use — a verifier can only disclose what it covers. So any signing format this
library introduces separates its domain and delimits its fields by length, and any verifier it
ships reports *which fields* a signature authenticates rather than a bare boolean. Compare §4,
where JCS is chosen precisely because it fixes one encoding per document.

**Era semantics: read the era through the named helper.** The era ladder is additive and strict —
Chronicle-without-Genesis is rejected at compile time in the node — so a new era arrives as a new
flag bit and a new bound, not as a changed meaning for an old one. Read it with
`Interpreter#isAfterGenesis()` / `isAfterChronicle()` and build flags with the helpers above. Two
implementations' flag words are not comparable even for the same rule set, so when you cross-check
against another library or a node, compare flag **names**, never hex. See §5.

**Verification results: a new verifier returns the structured form.** The existing functions do not
share a convention and §2 has the measured table; that inconsistency is frozen until 10.0.0. The
forward rule is that anything new returns `{ valid, errors }` and is awaited, so the safe habit —
gate on `valid`, never on the truthiness of the returned object — keeps working as the surface
grows.

**Conformance vectors: new classes are additive, and the version field is not yet enforced.**
`@smartledger/attest-vectors` carries one JSON file and one runner flag per vector class, so a new
class is a new file and a new flag and breaks no existing consumer. Both vector files carry `version: 1`
and the published 0.1.0 runner never reads it — `grep -c version runner.mjs` in the published
tarball returns 0 — so a consumer cannot currently detect drift between the vectors they have and
the spec text they are reading, and should pin an exact version rather than a range if that
matters. Enforcement is planned for 0.2.0. (This bullet is about a separate package, so it is
verified by that command rather than by `test/properties/relied_upon.js`.)

**Deprecation plan ids are the stable name of a future break.** Every registered deprecation
carries a `plan:` id that does not change between the warning and the removal
([RELEASE-10.0.0.md](RELEASE-10.0.0.md)). Key your own tracking on that id, not on the warning text
or the version — the text is prose and gets rewritten, and `since` repeats across releases. From
9.43.0 `deprecate.fired()` carries `plan` on each record, so the id is readable at runtime and not
only in the plan document; before that the advice named something a caller could not actually
read.

---

## 11. Reading this file safely

Everything above is a measurement of a **named published version**. Two habits make the difference
between using it and being misled by it:

1. **A changelog is not an artifact.** When a claim matters to you, install the version you
   actually ship and run the check. `test/properties/relied_upon.js` is written to run against
   either the working tree or an installed package for exactly this reason.
2. **Check which half of a rule you have evidence for.** A test suite that passes tells you the
   refusals fire; it does not tell you the acceptances do. Several defects in this library's
   history were found only after asking which direction the corpus had never exercised.
