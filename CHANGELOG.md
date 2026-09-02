# Changelog

All notable changes to SmartLedger-BSV will be documented in this file.

The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.0.0/),
and this project adheres to [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

## [Unreleased]

### Fixed — SIGPUSHONLY, LOW_S and NULLFAIL are consensus, and both flag helpers now say so

BSV enforces these three as **mandatory**, not as standardness. Each was broadcast to
mainnet in a transaction violating it and nothing else, and the node answered code 16
`mandatory-script-verify-flag-failed`:

| rule | the node's message |
| --- | --- |
| `SIGPUSHONLY` | Only non-push operators allowed in signatures |
| `LOW_S` | Non-canonical signature: S value is unnecessarily high |
| `NULLFAIL` | Signature must be zero for failed CHECK(MULTI)SIG operation |

For contrast, `MINIMALDATA`, `CLEANSTACK`, `NULLDUMMY` and the upgradable NOPs all came
back code 64 `non-mandatory-script-verify-flag` in the same run — relay policy, not
consensus.

`currentConsensusFlags()` carried none of the three, so `verify()` with no explicit
flags **accepted scripts the network judges invalid**. `mainnetFlags()` carried two of
them, so the two helpers disagreed and the default was the weaker one.

Both now carry all three. Fixing only the default would have left the worse half
standing: `mainnetFlags()` is the helper the README recommends and the one
`lib/covenant/helpers.flags()` returns, so **every covenant and the whole `policy()`
DSL** verified without `SIGPUSHONLY`. A test asserts the invariant behind that — the
default word may never enforce a rule `mainnetFlags()` would let through — rather than
naming individual bits, since naming two of three rules is exactly what let
`SIGPUSHONLY` slip.

The node's own corpus cannot settle this: all seven of its `SIGPUSHONLY` vectors name
the flag in their own flag list, and a vector that states its own flags says nothing
about which flags belong in a default set. Same shape as the `OP_BIN2NUM` defect in
9.4.0 — the mechanism was covered, the selection was not.

Four existing tests were themselves relying on the permissive default, verifying with
unlocking scripts that contain non-push opcodes. They now pass an explicit flag word
with `SIGPUSHONLY` cleared, so they exercise the mechanism they are named for.

## [9.4.0] - 2026-09-01

### Fixed — `policy().lockUntil()` did not bind, and `OP_BIN2NUM` used the wrong era's width

Two defects, found together because the second is what stops you fixing the first.

#### `lockUntil` checked one third of a time lock

The compiled script asserted `nLockTime >= floor` and nothing else. A time lock
is three rules in the node's `CheckLockTime`, and the other two each have a spend
that walks straight through:

- **Sequence.** `IsFinalTx()` ignores `nLockTime` outright when every input is
  `0xffffffff`. A spender who set a final sequence satisfied the script with the
  very locktime it demanded and produced a transaction minable in the next block.
  The honest `unlock()` helper set `0xfffffffe`, so the covenant looked correct
  from inside — and the test that covered the early-locktime case set
  `0xfffffffe` too, which is why nothing caught it.
- **Units.** Consensus reads `nLockTime` below 500,000,000 as a block height and
  at or above it as a unix timestamp. A bare `>=` compares the two as plain
  numbers, so `1500000000 >= 900000` cleared a floor of block 900,000 with a
  timestamp from July 2017 — a transaction that is final today.

Both are now enforced in script: this input must be non-final, and a height floor
requires the locktime to be a height. `describe()` reports both, and
`lockUntil(0)` throws, since consensus reads 0 as "no lock" whatever the
sequences are.

This is the same defect that removed `Locks.timeLockCLTV` and `Locks.htlc` in
9.0.0 — a time lock that enforces nothing — reappearing in the DSL that replaced
them. There, the cause was Genesis reverting `OP_CHECKLOCKTIMEVERIFY` to a NOP.
Here, it was reimplementing `CHECKLOCKTIMEVERIFY` by hand and reproducing only
its comparison.

#### `OP_BIN2NUM` capped every era at the pre-Genesis 4 bytes

It range-checked its result with `_isMinimallyEncoded(buf)`, whose `nMaxNumSize`
argument **defaults to 4**. The node passes `maxScriptNumLength`, which is 4
before Genesis, 750,000 after it and 32,000,000 after Chronicle.

Any unsigned field whose top byte has the sign bit set needs a fifth byte to read
as positive, so this rejected:

- **Every perpetual covenant and ownership token holding 21.47 BSV or more**
  (2³¹ satoshis). Both read the preimage's 8-byte value field through
  `OP_BIN2NUM`, so the coins were locked in and unspendable.
- **Every `nLockTime` from 19 Jan 2038**, whose high bit is set.

The node's own corpus did not catch it: all 25 of its `OP_BIN2NUM` vectors run
under `P2SH,STRICTENC` alone — pre-Genesis, where 4 is the right answer either
way. 1,483/1,483 passed before the fix and after it. The opcode was covered; the
*era* was not, and era selection is where both of this library's consensus
defects have been.

`lockUntil` also needed this: `nLockTime` is unsigned and `OP_BIN2NUM` reads
signed, so from 2038 the extracted value came back as negative zero and no spend
could clear the floor. The fix is to sign-pad to five bytes first, and that push
is only legal once `OP_BIN2NUM` honours the era.

#### Upgrading

`lockUntil` compiles different bytes, so a UTXO locked by 9.3.0 or earlier cannot
be spent with a script compiled by this version — keep the compiled object, or
recompile with the old version. Those locks bind nothing, so treat their coins as
spendable by anyone and move them.

## [9.3.0] - 2026-08-28

### Added

- **Type declarations for every subpath export.** Eleven of the thirteen
  subpaths — `anchor`, `covenant`, `didweb`, `gdaf`, `ltp`, `script-helper`,
  `security`, `shamir`, `smartcontract`, `statuslist`, `vcjwt` — shipped with no
  `types` condition and no declaration file, so
  `import covenant from '@smartledger/bsv/covenant'` was a TS7016 error under
  `node16`/`nodenext` resolution and every symbol behind it was `any`. Each now
  has a declaration; the eight that map onto existing declarations re-export
  them, and `security` (`SmartMiner`) and `script-helper` (`CustomScriptHelper`)
  are newly described, having had no types anywhere.
- `scripts/check-types.js` and `npm run check:types`, wired into
  `prepublishOnly`. It compiles a fixture of correct usage, then asserts that a
  fixture of *misuse* still fails — a declaration that quietly degrades to `any`
  makes those errors vanish, which is the regression this catches. Resolution
  goes through the real `exports` map rather than tsconfig `paths`.
- **`buildInscription` can write envelope fields.** `fields` takes tag numbers to
  values and emits them between the content type and the body, in ascending tag
  order so identical input always produces identical bytes. Tag 5 is `metadata`,
  the spec's own home for an object's own record; it previously could not be
  written at all, so the only way to produce one was to assemble envelope bytes by
  hand — permanent, already paid for, and unreported by anything local.

  Three tags are refused at build time because each is silent afterwards. Tag 0
  opens the body, so a field there does not fail — it becomes part of the file.
  Tag 1 is the content type, and a second one declares it twice. An unrecognized
  EVEN tag costs the inscription its location everywhere: the spec requires such
  an inscription to be treated as unbound. Odd tags are ignored by an indexer that
  does not know them, which is why the spec says it is okay to be odd.

  `allowUnknownEvenFields` overrides the last of those. It exists because the
  named tag set grows with the protocol, and a library that could never be
  overridden would eventually be wrong AND unbypassable — sending people back to
  hand-assembled bytes, which is worse than what the check prevents.

  Tags 1..16 are emitted as opcodes and anything larger as a minimal data push,
  since OP_16 is the largest numeric opcode. Script numbers carry sign in the high
  bit of the last byte, so a tag ending >= 0x80 is zero-padded rather than read
  back negative. Verified by round-tripping through `@smartledger/ordinals`, a
  separate implementation: a builder agreeing with its own parser proves only that
  they agree.

### Fixed

- **`@types/node` is now a declared dependency.** `bsv.d.ts` carries
  `/// <reference types="node" />` and names `Buffer` 150 times, but nothing
  pulled the types in. A TypeScript consumer without `@types/node` installed got
  `Buffer` widened to `any`, silently disabling type checking on every `Buffer`
  parameter in the public API — `Anchor.sha256Hex(12345)` type-checked cleanly.
- **`SECURITY.md` described a release line three majors old.** Corrected against
  the code rather than edited in place; every claim below was verified:
  - Supported versions said `6.x` on a 9.x package, and told readers to upgrade
    to "the latest 6.x".
  - The "known residual footgun" section warned that
    `ECDSA.prototype.verify()` returns the truthy *instance* and is "slated for
    removal in the next major". That was fixed in **7.0.0** — it returns a strict
    boolean, `bsv.d.ts` types it `verify(): boolean`, and a contract test locks it
    closed. The policy was warning about a landmine that no longer exists while
    contradicting the package's own declarations.
  - Pinned dependencies were listed as `bn.js@4.12.3` and `bs58@4.0.1`; the
    actual pin is `bn.js@=4.12.5` and `bs58` is no longer a dependency at all.
  - It apologised at length for "currently 17, all dev-only" `npm audit`
    findings. `npm audit` now reports none, dev included.
- `bsv.d.ts` header advertised "Type definitions for @smartledger/bsv 6.x".

## [9.2.0] - 2026-08-25

### Added — RFC 8785 canonicalization is now public API

`@smartledger/bsv/jcs`, and `bsv.JCS` on the namespace. Both are the implementation
that has been in `lib/util/jcs.js` since 8.2.0, unchanged in what it produces.

It was private: absent from the `exports` map and from `bsv.d.ts`. So the only
canonicalizer a consumer could reach was `bsv.canonicalizeClaim`, which is not RFC
8785 — and downstream packages independently reimplemented the non-conformant form,
because it was the one they could see.

Use it for anything hashed or signed that someone else might check:

```js
const JCS = require('@smartledger/bsv/jcs')
JCS.stringify({ 2: 'two', 10: 'ten' })   // {"10":"ten","2":"two"}
```

Two behaviours changed, neither reachable by input that previously succeeded:
circular structures now throw a typed error instead of exhausting the call stack,
and `bigint` throws instead of falling through to a generic type error. The function
is now reachable from verifiers, and verifier input is untrusted.

### Deprecated — the default canonicalization of LTP claim hashes

`LTP.Claim.canonicalize`, `LTP.Claim.hash`, `bsv.canonicalizeClaim` and
`bsv.hashClaim` take an optional second argument:
`bsv.LTP.Claim.CANONICALIZATION.JCS` or `.LEGACY`. Omitting it selects `LEGACY`,
warns once, and keeps working. **The default becomes `JCS` in 10.0.0.**

The legacy form sorts keys and then rebuilds the object, which loses the sort: V8
orders integer-like own properties numerically ahead of string keys whatever order
they were inserted in.

```
LEGACY   {"2":"two","10":"ten"}
JCS      {"10":"ten","2":"two"}      RFC 8785, UTF-16 code unit order
```

It is deterministic, so nothing already hashed is wrong and nothing is forgeable —
signing and verification within this library have always agreed. It is not
*interoperable*: an RFC 8785 implementation in another language computes a different
claim hash and rejects a valid one. It only bites when a claim has integer-like keys
— lot numbers, unit numbers, years — which is why it went unnoticed, and why it
fails in a counterparty's verifier rather than in our own tests.

Per STABILITY.md this is a minor, so the default does not move in 9.x. Pass the
argument explicitly to pin behaviour across 10.0.0.

An unrecognised value throws rather than falling back to `LEGACY`: a typo such as
`'JCS'` quietly producing differently-hashed claims would recreate the exact failure
this change exists to remove.

`prepareClaimValidation`, `prepareClaimAttestation` and `prepareClaimDispute` emit
hashes that callers store as identifiers and cannot pass an argument for. Those are
pinned to `LEGACY` for all of 9.x and do not warn — a notice naming a function the
caller never called is noise. They move to `JCS` in 10.0.0 as one documented change.

## [9.1.1] - 2026-08-24

### Fixed — MerkleBlock shared mutable state with its caller

The constructor stored `arg.hashes` and `arg.flags` directly, and `toObject()` handed
the same arrays back out. A MerkleBlock and the object it was built from — or the
object it produced — were therefore the same arrays, and mutating either changed the
other at a distance:

```js
const mb = new MerkleBlock(obj)
mb.hashes.push(x)      // obj.hashes grew too
const out = mb.toObject()
out.flags.pop()        // mb.flags shrank too
```

Both directions now copy. Contents, round-trips and validation are unchanged; a
non-array is still passed through rather than coerced, since the constructor never
validated these fields and 9.x does not turn a tolerated input into a throw.

Found as order-dependence in this library's own suite — tests that mutate a block
built from the shared `data.JSON[0]` corrupted that fixture for every test after them,
so a new test passed alone and failed in the full run. Measured before and after: the
fixture does not survive `test/block/merkleblock.js` on 9.1.0, and does now. The tests
were the messenger; the aliasing is the defect, and a caller building a MerkleBlock
from their own object hits it the same way.

## [9.1.0] - 2026-08-23

Nothing in this release breaks a caller. That is the release.

### Added — a support commitment, and the mechanism that makes it keepable

Between 4.0.0 (2026-05-31) and 9.0.0 (2026-08-21) — 82 days — this library
published six major versions, part of 83 releases in 307 days. A major is a
promise that the consumer's code breaks. Made six times a quarter it is a promise
no team can plan around, and correctness in the releases does not compensate for
it.

The releases were not gratuitous. Most encoded a real finding: Genesis reverted
`OP_CLTV`/`OP_CSV` to NOPs, so the CLTV locks guaranteed nothing and went in
9.0.0; covenant verification was applying pre-Genesis limits and was corrected in
8.4.0. Those calls were right. The delivery was the problem — an API found to be
wrong was changed to `throw` in the same release that found it, which turns every
correctness fix into a breaking change.

**[STABILITY.md](STABILITY.md)** commits 9.x through **2027-09-01**: patch and
minor only. Two carve-outs, both narrow and stated up front — consensus changes
track the network in a minor regardless, and an API that can lose funds may throw
inside a minor.

**`lib/util/deprecate.js`** is what makes that affordable. It warns once per API
per process, records every notice for tooling, is silenced with
`BSV_NO_DEPRECATION_WARNINGS=1`, and never throws — a deprecation that throws is a
breaking change wearing a warning's name.

```js
Klass.prototype.old = deprecate.fn(Klass.prototype.old, {
  what: 'Klass#old', since: '9.1.0', removeIn: '10.0.0',
  use: 'Klass#replacement', why: 'it does not constrain the spend'
})
```

Deprecating becomes a non-breaking act belonging in a minor. Correctness fixes
ship continuously; breakage batches into one planned major whose migration path
has been in consumers' logs for months.

### Changed — the two APIs that motivated it, resolved differently

Both threw with no warning period. The difference between them *is* the policy.

| API | 9.1.0 | Why |
| --- | --- | --- |
| `MerkleBlock#filterdTxsHash` | warns and delegates | A misspelling of `filteredTxsHash`, one missing letter. Exactly one thing it can mean, so making the typo fix a breaking change bought nothing. Removed in 10.0.0. |
| `HDPrivateKey#derive` | still throws | Its replacements return **different keys**. No default is safe. |

`deriveChild` is BIP32-compliant; `deriveNonCompliantChild` reproduces the old
unpadded behaviour. Measured over 1600 derivations they disagree **0.5% of the
time**, only when an intermediate private key serialises to under 32 bytes.

That rarity argues for throwing, not against it. A caller handed a guessed default
would pass every test they wrote and then derive unrecoverable addresses for about
one wallet in two hundred. A default that is wrong half a percent of the time is
more dangerous than one wrong always, because nothing catches it. The caller
chooses, and the error names both options.

`SmartContract.Builder`'s `{ allowNonEnforcing: true }` opt-in now says it is
scheduled for removal in 10.0.0. The throw for callers who did *not* opt in is
unchanged — a covenant that silently enforces nothing is the fund-loss case.

### Added — the era-flag trap now explains itself

Flags and *limits* are separate mechanisms. The era bits are what the interpreter
derives its element-size, script-size, opcode-count and script-number caps from.
Hand-assemble a flag word out of named constants — the idiom every pre-Genesis
tutorial teaches — and you get the feature opcodes you asked for while silently
keeping the 2019 caps. The script *runs*, so nothing looks wrong until a ~586-byte
preimage is rejected against a 520-byte limit and the error blames the push.

`verify()` now sets `interp.eraHint` and warns once per process when an era-less
flag word produces an era-derived failure (`PUSH_SIZE`, `SCRIPT_SIZE`, `OP_COUNT`,
`SCRIPTNUM_OVERFLOW`). Set `Interpreter.eraDiagnostics = false` or
`BSV_NO_ERA_HINT=1` to silence it.

Warning on *every* era-less `verify()` was measured and rejected: about 78% of
this library's own verifies are legitimately era-less, because the reference
`script_tests.json` vectors are pre-Genesis by construction. Firing only on the
intersection lands on ~5% of era-less failures, all genuine pre-Genesis vectors.

### Added — the compatibility promise is now enforced, not remembered

A promise nothing checks decays. The failure that matters is not *deciding* to
break the API but arriving at a major without having decided to, which is how this
library reached 9.0.0.

`scripts/api-surface.js` snapshots the covered surface — 1934 reachable members
plus the 35 `exports` subpaths — as names, kinds and arities, never values.
`test/api_surface.js` diffs it: removals fail naming the policy and the fix, shape
changes fail, and additions fail asking for a deliberate snapshot update so API
growth shows up in review instead of accumulating. Regenerate with
`npm run api:snapshot`; `npm run check:api` joins `prepublishOnly`.

It deliberately does not walk into `bsv.deps`, which re-exports Node's own
`Buffer`. Node 20 and 22 disagree on the arity of `Buffer#utf8Write`,
`#asciiWrite` and `#latin1Write`, and a snapshot that varies by runtime reports
drift that did not happen.

`check-readme-accuracy` gains two checks its own header called impossible: prose
calling an old version "latest" is mechanical after all — that exact claim
survived five releases — and the stability badge is now diffed against
STABILITY.md. Historical references ("Upgrading to v8.0.0", "migrating from 5.x")
are left alone.

### Changed — what the package says it is, and what it ships

The README is **1132 lines to 244**. The covenant stack and the era-flag trap
lead; the credential subsystems keep an entry point and a link each. The npm
description and keywords (**79 to 15**) now describe the package rather than
listing everything it touches.

`test/` no longer ships — no consumer runs the library's own suite from
`node_modules`.

| | 9.0.0 | 9.1.0 |
| --- | ---: | ---: |
| tarball | 3.1 MB | 2.3 MB |
| unpacked | 12 MB | 7.9 MB |

### Added — a proposal for 10.0.0

`docs/proposals/10.0.0-package-split.md`. Requiring the root costs 129 modules,
270ms and 12.7MB of heap to get `Script`, against 24 modules for
`require('@smartledger/bsv/lib/script')`, and the ESM wrapper re-exports CJS so
nothing tree-shakes. The proposal is five packages plus a meta-package that keeps
`require('@smartledger/bsv')` returning exactly what it returns today, so no
install moves — and a section arguing against doing it at all if the install base
genuinely uses credentials alongside the Bitcoin surface. Nothing there ships in
9.x.

### Verification

4708 tests passing, 452 conformance cases against the reference corpus, on Node 20
and 22. Every new guard was verified by reintroducing the bug it exists for.

## [9.0.0] - 2026-08-21

### BREAKING — removed APIs that enforced nothing

Everything here either did not work on mainnet or had been promised for removal and
kept shipping. None of it is replaced, because in each case the honest replacement is
"do not do this".

| Removed | Why |
| --- | --- |
| `SmartContract.enableGenesis()` | A workaround for the flags bug below. With the era flags present there is nothing for it to do, and what it did — mutating process-wide limit statics — turned 15 of the node's 22 `SCRIPTNUM_OVERFLOW` vectors into false accepts. `Interpreter.useGenesisLimits()` is untouched for callers who really want it. |
| `SmartContract.Locks.timeLockCLTV` | Built on `OP_CHECKLOCKTIMEVERIFY`, which Genesis reverted to an upgradable NOP. Enforced nothing on mainnet — the coins were spendable immediately. |
| `SmartContract.Locks.htlc` | Its timeout branch is the same NOP. An HTLC whose timeout does not bind is a hash-lock, which `Locks.hashLock` already provides. |
| `CustomScriptHelper.createTimelockScript` | Same NOP, third copy. |
| `bsv.SmartUTXO` (namespace export) | A development-only file-backed simulator on the production namespace. Soft-deprecated in 4.0.1 promising removal in 6.0.0, then shipped through 6.x, 7.x and 8.x still warning. The module is unchanged and still available as `require('@smartledger/bsv/lib/smartutxo')` — what the warning always said to do. |

There is now **no time-lock primitive in this library**. That is deliberate: a lock
that does not lock has no safe use, and the previous versions passed their own tests
only because the covenant harness verified them under pre-Genesis flags.

`SmartContract.Covenant` and `SmartContract.Builder` are **kept**. They are also
non-enforcing, but they already fail closed — their script-producing methods throw
unless you pass `allowNonEnforcing: true` — so they cannot silently hand back a script
that does not do what it looks like.

### Fixed — covenants were verified under pre-Genesis rules

`lib/covenant/helpers.js` assembled its verification flags by hand, and the list
omitted the three **UTXO-era** flags: `SCRIPT_GENESIS`, `SCRIPT_UTXO_AFTER_GENESIS`
and `SCRIPT_UTXO_AFTER_CHRONICLE`. It did carry `SCRIPT_ENABLE_CHRONICLE`, which
enables the string opcodes, so the omission was easy to miss — the opcodes ran, and
only the *limits* were wrong.

The interpreter derives its data limits from those era flags. Without them every
covenant was verified under rules BSV replaced at Genesis in February 2020:

| | before | after |
| --- | ---: | ---: |
| max stack element | 520 bytes | unbounded |
| max script size | 10,000 bytes | unbounded |

An OP_PUSH_TX preimage is ~585 bytes, so this library's flagship feature could not
verify against its own harness — it failed with `SCRIPT_ERR_PUSH_SIZE`.

`flags()` now delegates to `Interpreter.mainnetFlags()`, the same function a no-flags
`verify()` uses. Local verification and network behaviour can no longer drift apart
without both moving together. `SCRIPT_VERIFY_NULLFAIL` is gained (stricter).

### Removed — `SmartContract.enableGenesis()`

Now a **deprecated no-op**; the symbol survives one major and goes away in 9.0.0.

It existed to paper over the missing era flags by raising the interpreter's
process-wide limit statics. That was treating the symptom: raising the statics cannot
enable post-Genesis arithmetic — only the era flags can — and it *weakens* pre-Genesis
validation, turning 15 of the reference node's 22 `SCRIPTNUM_OVERFLOW` vectors into
false accepts. With the flags fixed there is nothing for it to do.

It is a no-op rather than a passthrough deliberately: restoring the old behaviour as a
courtesy to existing call sites would reintroduce the defect this release removes.
`Interpreter.useGenesisLimits()` is untouched for callers who really do want to move
the statics.

**Action:** delete the call. Covenants now verify with no opt-in.

### Disclosed — CLTV time locks do not bind on mainnet

Fixing the flags surfaced this. Genesis reverted `OP_CHECKLOCKTIMEVERIFY` to an
upgradable NOP for outputs created after it, so **`Locks.timeLockCLTV` and the timeout
branch of `Locks.htlc` enforce nothing on current BSV mainnet** — the coins are
spendable immediately by the key holder.

This was invisible because the covenant harness verified under flags missing the era
bits. The library's own tests asserted that an early spend was rejected, and passed,
while the network would have accepted it. That is the failure mode `docs/THREAT_MODEL.md`
§1 is written around, found in our own code.

Both behaviours are now pinned in `test/smart_contract/covenants.js`: the lock does not
bind under mainnet flags, and still binds under explicitly pre-Genesis flags — so the
opcode is implemented correctly and the issue is purely which era we verify under. The
JSDoc on both functions carries the warning, as does the README and the threat model.

The functions are kept, not deleted: they remain correct for pre-Genesis outputs and
useful for interop. **Do not use them to time-lock value on mainnet.**

### Documentation

- README: the multisig example destructured `{ CustomScriptHelper }`, which is
  `undefined` — the module exports the class itself and every method is static. The
  `check:readme` gate did not catch it because it only resolves `bsv.*` symbols.

## [8.3.1] - 2026-08-20

### Fixed — BRC-220 signature verification was not interoperable

`lib/notaryhash/suites.js` set `endian: 'little'` before verifying, which made
ECDSA reverse the 32-byte `payloadHash` before reducing it to a scalar. That is
Bitcoin's message-signing convention, not this protocol's.

The effect was on the **verify** side. A signature produced the way BRC-220
describes — over the `payloadHash` directly — was **rejected**, and the only
signatures accepted were ones made with bsv's own byte-reversed convention. In
practice 8.3.0 could not verify a certificate from any other implementation.

Signing was never affected: `ECDSA.sign(payloadHash, key)` already produced a
conformant signature. Only the verifier disagreed with it.

**If you issued certificates with 8.3.0**, they are fine — the signatures in them
are whatever your signer produced. If you signed via `ECDSA` with
`endian: 'little'` to satisfy the old verifier, those signatures are
non-conformant and must be re-issued; 8.3.1 rejects them, deliberately, because
accepting both conventions would mean two valid signatures exist for one signing
act and both are inside `proofHash`.

### Why the tests did not catch it

Every NotaryHash test signed through `lib/crypto/ecdsa.js` and verified through a
suite that used the same file, so the module and its tests were self-consistent
and wrong together — the failure shape `test/notaryhash/encoding.js` warns about
in its own header comment.

`test/notaryhash/interop.js` is new and verifies against `@noble/curves`, which
shares no verification code with ours. Reverting the one-line fix fails 9 tests.
It also records the trap that made this slow to diagnose: noble v2 **prehashes by
default**, so `secp256k1.sign(digest, key)` signs `sha256(digest)` and looks
self-consistent while disagreeing with everyone; every call in that file passes
`{ prehash: false }`.

### Documentation

- The README's NotaryHash example now shows the signing step explicitly, and says
  why no `endian` option belongs there.

## [8.3.0] - 2026-08-16

### BRC-220 (NotaryHash)

`bsv.NotaryHash` implements [BRC-220](https://github.com/bitcoin-sv/BRCs/blob/master/apps/0220.md)
— privacy-preserving signed-hash notarization with SPV-verifiable certificates. A signer
proves they signed a specific hash; the on-chain anchor fixes that proof in time; the
document itself is never disclosed.

Four of the five things the spec needs already existed here, which is why it lives in this
library rather than a separate package: RFC 8785 canonicalization (added in 8.2.0 for an
unrelated reason), SPV inclusion proofs in TSC format, a header-first trust model that
already refused to take a provider's word, and `OP_FALSE OP_RETURN` with length-prefixed
binary.

```js
var report = bsv.NotaryHash.verify(certificate, { header: independentlyObtainedHeader })
// { valid, signature, proofIntegrity, anchor, batchInclusion, errors }
```

All three of the spec's validity checks, plus a fourth for batched certificates:

1. **Signature** — offline, against the registered suite
2. **Proof integrity** — the recomputed `proofHash` matches the certificate
3. **Anchor** — SPV, against a block header the *caller* supplies
4. **Batch inclusion** — the proof is one the on-chain root commits to

`verify()` returns a report naming which check failed, because a bad signature and an
unmined transaction need different fixes. `isValid()` is the strict boolean for `if (...)`.

**This library never fetches a block header.** The spec says the verifier trusts only a
header "obtained from any source it chooses"; quietly choosing one on the caller's behalf
would restore exactly the trust the protocol removes. `verifyAnchorSPV` refuses to pass
without one.

**Post-quantum is deliberately not bundled.** The spec names ML-DSA and SLH-DSA, but
`ECDSA-secp256k1` is first-class alongside them, so an ECDSA-only implementation is
conformant. `@noble/post-quantum` is the one Noble package with no independent audit — its
README says so — and is 0.x, 669 KB, and does not claim constant-time execution. Depending
on it would forfeit the "primitives are already audited" property that `docs/AUDIT_SCOPE.md`
relies on. Suites are registered instead:

```js
bsv.NotaryHash.registerSuite('ML-DSA-65', { verify: function (hash, sig, key) { … } })
```

An unregistered algorithm returns **false** — it does not fall through to a default, which
for an `ML-DSA-65` certificate would be catastrophic. A suite's result is coerced with
`=== true`, so one returning a truthy object cannot smuggle a pass through.

**`encoding` is `"raw"`.** The spec requires the field but never enumerates its values, so
this library defines them and proposes the definition upstream in
`docs/BRC220_ENCODING_AMENDMENT.md`. For `ECDSA-secp256k1` that is 64 bytes of `r ‖ s`,
because `proofHash` covers the signature bytes and DER is not canonical — measured over 200
signatures from one key, DER came out at 69, 70 and 71 bytes, all of it legal. Low-S is
required and rejected rather than normalised, since normalising changes bytes that are
inside `proofHash`.

**Batch mode uses RFC 6962**, which is a *third* Merkle tree in this repository and differs
from both others — `lib/spv` is Bitcoin's (double-SHA, rightmost leaf duplicated) and
`lib/gdaf/zk-prover.js` is single-SHA without domain separation. RFC 6962 domain-separates
(`leaf = SHA256(0x00‖d)`, `node = SHA256(0x01‖l‖r)`) and never duplicates. All six published
Certificate Transparency roots match.

Design decisions are recorded in `docs/BRC220_PLAN.md`, including two open questions the
spec does not answer: what a batch leaf contains (`proofHash` is the reading taken), and
confirmation against the reference implementation's golden vector.

### Dependencies

`@noble/curves`, `@noble/hashes` and `@noble/ciphers` to 2.3.0. These are the signing and
hashing primitives, so the evidence is a differential rather than a green suite: 1,638
observable outputs were captured on 2.2.0 and recomputed on 2.3.0 — hashes over every input
length 0–200, HMACs across four key shapes, 40 keys' worth of RFC-6979 signatures,
addresses, DER encodings, BIP-32 derivations and point multiplication. All identical. The
comparison was confirmed capable of failing: perturbing sha256 by one byte moves 695 lines.

### Also

RFC 8785 canonicalization moves from `lib/gdaf/attestation-signer.js` to `lib/util/jcs.js`,
since two unrelated modules now need it and a notarization module reaching into the
credentials module would be the wrong direction. `attestation-signer` delegates; behaviour
unchanged.

## [8.2.0] - 2026-08-15

Two independent reviews of 8.1.0, both acted on after reproducing every claim. Between
them they found a proof system that verified nothing, a selective-disclosure scheme that
leaked the fields it withheld, and a signature canonicalization no other implementation
can reproduce. **4,469 tests passed with all of it in place**, because none of them
touched those files.

### `lib/gdaf/zk-prover.js` — verified nothing, and leaked what it hid

This module had **zero test coverage**.

**`verifyRangeProof` verified nothing.** It ended at `return proof.inRange === true` — a
boolean the prover writes about itself. `valueCommitment` was never consulted, so any
object of the right shape passed:

```js
{ type: 'RangeProof', range: { min: 18, max: 120 },
  valueCommitment: '00…', proofHash: 'de…', inRange: true }   // → true
```

`verifyAgeProof` had the same shape: it accepted `meetsRequirement`, then checked only
that `challengeResponse` was a non-empty string.

Both now require the **opening**, check the commitment actually opens to the claimed
value, and recompute the range or age rather than trusting the prover. Without an opening
they return `false`, because nothing has been proven. The generators return the opening
alongside the proof rather than inside it — embedding it would make every proof
self-opening.

**Selective disclosure leaked the withheld fields.** One salt covered every leaf and
travelled in the proof, so the sibling hashes on the Merkle path could be brute-forced
back into the hidden values. Disclosing only `credentialSubject.name` recovered `id`
directly, and `partyAffiliation` with `eligible` from their shared parent node. Each leaf
now carries its own salt, derived from a master that never leaves the generator, and only
the disclosed leaves' salts travel in the proof.

**A proof generated without an explicit salt could never verify.** The return used the
`salt` argument — `undefined` when omitted — instead of the one `createMerkleTree`
produced.

**Nothing here is zero-knowledge**, and the module said otherwise in three places. These
are hash commitments and a Merkle tree; the range and age commitments can only be checked
by opening them, which reveals the committed value. The npm keyword
`zero-knowledge-proofs` is replaced with `selective-disclosure`, the "Bulletproof-style"
comment is corrected, and the docblock states the limitation plainly.

21 tests where there were none, each pinning the attack rather than the fix.

### GDAF canonicalization is now RFC 8785

`_canonicalizeJSON` sorted keys and then rebuilt an object, which loses the sort: V8
orders integer-like own properties numerically, ahead of string keys.

```
ours   {"2":"two","10":"ten"}
JCS    {"10":"ten","2":"two"}      (UTF-16 code-unit order)
```

Within this library that was deterministic — signing and verification agreed, and no
forgery follows. The failure is interoperability: GDAF credentials exist to be checked by
other parties, and a JCS-conformant verifier in any language computes a different hash and
rejects a valid signature.

`_canonicalizeJCS` serializes directly rather than round-tripping through an object, so
the order survives. Non-finite numbers now throw rather than serializing as `null`, which
would silently sign a different document than the one supplied.

**Migration is handled**: signing uses JCS, and verification tries JCS then the legacy
form, so credentials, presentations and `rootHash` values written before this keep
verifying. `1847`, `1847.0` and `1.847e3` still hash identically, which is correct rather
than a weakness — they are the same IEEE-754 double — and a test pins it.

### Packaging

`files` shipped `test/` but not `tools/`, and three consensus specs require it. `tools/`
now ships, and the tarball file-count guard is raised to 370 to accommodate it: the
vectors are inert without the harnesses that run them.

Note that a consumer still cannot run the shipped tests, because devDependencies are
absent — whether `test/` should ship at all is a separate question.

## [8.1.0] - 2026-08-13

### `useGenesisLimits()` no longer raises the script-number bound

It raised `MAXIMUM_ELEMENT_SIZE` along with the three size caps. That was right before the
limits became era-derived, when it was the only way to reach post-Genesis arithmetic. It
is not any more, and the raise had become purely harmful.

`MAXIMUM_ELEMENT_SIZE` is CScriptNum's `max_length`, and since 8.0.0 it serves only as the
**pre-Genesis fallback** for `maxScriptNumLength()` — post-Genesis is 750,000 and
post-Chronicle 32,000,000, both reached through the era flags. So raising it could not
enable post-Genesis arithmetic. It could only corrupt pre-Genesis validation:

```
5-byte operand under P2SH,STRICTENC

  fresh process:            SCRIPT_ERR_SCRIPTNUM_OVERFLOW   (what the node says)
  after useGenesisLimits(): ACCEPTED
```

A false accept, in the direction that can cost money, reached through a process-wide side
effect on unrelated code later in the same process. The node's vectors agree
independently: all 22 `SCRIPTNUM_OVERFLOW` rows are pre-Genesis, and raising this static
turns 15 of them into false accepts.

The three size caps still lift, so the documented reason to call the function is
unaffected, and `setLimits()` can still set the bound explicitly.

**Migration.** If you called `useGenesisLimits()` to get arithmetic wider than four bytes,
ask for the era instead — `Interpreter.mainnetFlags()`, or simply omit the flags argument,
which has defaulted to current mainnet since 8.0.0. Calling `useGenesisLimits()` for that
purpose was already unsound, because it changed the rules for every later `verify()` in
the process, including ones deliberately validating under pre-Genesis rules.

Minor rather than patch: a public helper stops doing one of the four things it documented.

## [8.0.1] - 2026-08-13

### `mainnetFlags()` was applying 2019 limits

8.0.0 made the interpreter's limits era-derived, but `mainnetFlags()` was written before
the era model and never updated to carry the flags it depends on. It set
`SCRIPT_ENABLE_CHRONICLE` and none of `SCRIPT_GENESIS`,
`SCRIPT_UTXO_AFTER_GENESIS` or `SCRIPT_UTXO_AFTER_CHRONICLE`, so
`Interpreter#maxScriptNumLength()` fell through to the pre-Genesis static. A validator
built from the helper named after mainnet was applying the limits of 2019 — most sharply
the 4-byte script-number bound, which is why post-Genesis contracts could not do
arithmetic on satoshi amounts.

```
                                        8.0.0        8.0.1
mainnetFlags({ afterChronicle: false })      4      750,000
mainnetFlags()                               4   32,000,000
```

Genesis is unconditional in this helper: it activated in 2020 and nothing still spendable
wants the older limits from something called `mainnetFlags`. `{ afterChronicle: false }`
drops only the Chronicle pair.

`useMainnetConsensus()` no longer pins `MAXIMUM_ELEMENT_SIZE`, and
`Interpreter.DEFAULT_SCRIPT_NUM_LENGTH` is removed. That pin existed to stop
`useGenesisLimits()` raising the bound to `0x7fffffff` and making Chronicle's
shift-overflow check unreachable; with the era flags present that fallback is not
consulted, so the symptom goes with the cause.

### How the value was settled

The node's vectors pin the pre-Genesis bound at 4 and are silent above it — all 22
`SCRIPTNUM_OVERFLOW` rows carry `P2SH,STRICTENC` with no era flag, and no Genesis-era row
exercises script-number width. Sweeping the static against the corpus: 1483/1483 at 4,
and 1468/1483 with 15 false accepts at 8, 32 or 750,000, every one of them a pre-Genesis
row. So the static could not be raised — and did not need to be, because 8.0.0 already
derived the bound from the era.

### Known sharp edge

`useGenesisLimits()` still raises `MAXIMUM_ELEMENT_SIZE`, which is now only the
pre-Genesis fallback. Calling it and then verifying with no era flag gets a corrupted
bound. That combination is contradictory, but the edge is real and will be removed
separately.

## [8.0.0] - 2026-08-13

This library is now measured against the reference node's own consensus vectors, and its
defaults describe BSV as the network actually runs it.

Until this release the only consensus reference was the `script_tests.json` inherited
from the upstream fork — Bitcoin Core vectors encoding rules BSV abandoned at Genesis in
2020. Passing them completely said very little about whether this library agrees with the
network. The first run against the node's own vectors scored **1426/1483 with 21 false
accepts**: scripts this library accepted that BSV rejects.

That is the direction that is hardest to catch. Nothing which tests this library against
itself can see it, because the library is the thing being wrong.

### BREAKING — read before upgrading

**`verify()` with no flags now means BSV mainnet, not "no rules".**

```js
interp.verify(sig, pubkey, tx, nin)            // was: Bitcoin 2015; now: current mainnet
interp.verify(sig, pubkey, tx, nin, 0)         // the old behaviour, stated explicitly
Interpreter.mainnetFlags({ afterChronicle: false })   // pre-Chronicle UTXO
```

Spending a pre-activation output is now the case you state, because the era of the output
being spent is the input the caller knows and the library cannot.

**Two flag constants changed value.** The node assigns `1<<18` and `1<<19` to
`SCRIPT_GENESIS` and `SCRIPT_UTXO_AFTER_GENESIS`, so ours had to vacate:

```
SCRIPT_ENABLE_MONOLITH_OPCODES   1<<18 → 1<<11
SCRIPT_ENABLE_MAGNETIC_OPCODES   1<<19 → 1<<12
```

Anything using the named constants is unaffected. Anything that **persisted or hardcoded
the numbers** must be updated: `262144` no longer means "Monolith opcodes", it now means
`SCRIPT_GENESIS`, so an old stored value silently enables a different era model.

**Other behaviour changes, all moving toward the node:**

- a signature carrying `SIGHASH_CHRONICLE` outside Chronicle is now *rejected* rather
  than reinterpreted, and a digest with that bit set selects the original algorithm
- `MAX_OPS_PER_SCRIPT` is 500 (BSV's number), was 201 (Bitcoin Core's)
- `OP_CAT` is no longer capped at 520 bytes after Genesis
- `OP_MOD` reports `MOD_BY_ZERO`; `OP_DIV`/`OP_MOD` now actually detect a zero divisor
- script number, truncated push and `OP_NUM2BIN` failures report the node's result code
  instead of a generic `UNKNOWN_ERROR`

### The vectors

Copied verbatim from `bitcoin-sv/bitcoin-sv` v1.2.0, provenance recorded in
`test/data/bitcoin-sv/README.md`.

| | |
| --- | --- |
| script vectors | 1483/1483, 0 false accepts, 0 false rejects |
| result codes | 600/600 (491 exact, 109 via documented aliases) |
| transaction vectors | 161/161 |
| digest vectors | 1000/1000, on both columns |

```
npm run vectors:sv           npm run vectors:sv-tx           npm run vectors:sv-sighash
```

### What they found

**The era now travels in flags, as it does in the node.** Genesis was a process-wide
opt-in mutating four static caps, and there were no `SCRIPT_GENESIS` /
`SCRIPT_UTXO_AFTER_GENESIS` / `SCRIPT_UTXO_AFTER_CHRONICLE` flags at all, so rules gated
on the era of the output being spent could not be expressed, let alone enforced.

**Genesis allows only one `OP_ELSE` per `OP_IF`** — 17 of the 21 false accepts.

**Genesis reverts CLTV/CSV to upgradable NOPs** — found by the *transaction* vectors, not
the script ones, because the behaviour only appears once a real `nLockTime` and sequence
exist. Four transactions the network accepts were being rejected.

**Chronicle digest routing** — 260 of 1000 rows disagreed. `SIGHASH_CHRONICLE` was
honoured only when `SCRIPT_ENABLE_CHRONICLE` was also set; the node routes on the bit
alone and rejects a signature carrying it outside Chronicle as `ILLEGAL_CHRONICLE`.
Rejected, not reinterpreted — a stronger protection, and it leaves the digest a function
of the transaction rather than of a flag the node never consults.

**Four bugs a pass/fail check is structurally blind to.** Matching the node's outcome is
not failing for the node's *reason*. Comparing the result code of all 600 rejected
vectors found a divide-by-zero guard written `bn2 === 0` where `bn2` is a `BN` (never
true), script-number decoding escaping into a generic catch (78 vectors), a truncated
`PUSHDATA` doing the same, and `OP_NUM2BIN` checking only the upper bound of its size
argument. Every one left the script failing, so 1483/1483 stayed green throughout.

### Also in this release

`verify()`'s default set is derived from what the vector harness applies rather than
assembled by judgement, which is why it includes the `MONOLITH`/`MAGNETIC` pair: BSV
restored those opcodes in 2018 and the node does not gate them, so omitting them would
make the default *stricter* than consensus.

`useMainnetConsensus()` no longer raises the script-number bound to `0x7fffffff`. That
ceiling made Chronicle's shift-overflow check unreachable, since it tests
`current_size + shift_bytes > max_length`.

Timelock checks report a consensus error instead of a `TypeError` when there is no input
at `nin`. `checkSequence` dereferenced the input as its first statement; `checkLockTime`
had the identical dereference, hidden only by statement order.

## [7.13.0] - 2026-08-11

Two of the three fixes below came from another team building a React Native keystore on
this library. Both were reproduced here before being acted on.

### The CSPRNG no longer guesses its environment

**This is the one to read.** `Random.getRandomBuffer` chose its backend by testing
`process.browser` — a Browserify-era convention that is **undefined in React Native,
Deno, Cloudflare Workers and Bun**. Every one of those fell through to the Node branch
and called `require('crypto').randomBytes`. In React Native that fails outright at best;
at worst something in the dependency graph has registered a partial crypto shim —
rn-nodeify and several RN starter templates do exactly this — and a weak `randomBytes`
makes `PrivateKey.fromRandom()` silently produce guessable keys.

`globalThis.crypto.getRandomValues` is now tried first, covering browsers, Node >= 19,
Deno, Workers, Bun, and React Native with `react-native-get-random-values`. Node crypto
remains a fallback. **If neither exists, it throws** — a key library must never return
bytes it cannot vouch for. `getRandomBufferBrowser` also read a bare `window`, which does
not exist in Workers or React Native; it reads `globalThis` now.

Requests above WebCrypto's 65,536-byte per-call limit are filled in chunks, and a test
asserts the tail past that boundary is real entropy rather than zero padding.

On Node the bytes now come from `globalThis.crypto` rather than `crypto.randomBytes`.
Both are the same OS CSPRNG, but it is a behaviour change, hence the minor bump.

### Hash and PBKDF2 backends are chosen by capability

`lib/crypto/hash.js` and `lib/mnemonic/pbkdf2.js` carried the identical defect.
`process.browser` no longer appears anywhere in `lib/`.

Node's implementations stay *preferred* rather than being replaced by `@noble/hashes`
outright: measured sha256 is at parity for 32-byte inputs (1.17x) but ~10x for 64 KB and
above, which is block parsing and document anchoring. The unconditional reach for node
crypto was the bug, not its use.

The probe checks **correctness, not existence** — digests are verified against
known-answer vectors, `ripemd160` is probed separately because OpenSSL 3 moved it to the
legacy provider, and PBKDF2 checks `createHmac('sha512')` against RFC 4231 case 1. A
shim that returns wrong digests is rejected in favour of the audited pure-JS path,
because a wrong hash is invisible until it matters.

### did:web verification relationships are no longer collapsed

DID Core defines `authentication` and `assertionMethod` to be distinct: one proves who
you are now, the other makes a claim that outlives the session. `buildDidWebDocuments`
cross-listed every key into both, so a caller could not express "this key may log in but
may not make assertions". Keys now take an optional `relationships` array; omitting it
reproduces the previous document exactly, key order included.

`rotateIssuerKey` had the worse version: it rewrote **both** relationships whatever was
being rotated, so replacing a compromised authentication key invalidated every statement
the issuer had ever signed. Rotation is now scoped to `newKey.relationships`, and
relationships outside that scope carry across from an optional `currentDocument` along
with the verification methods they still reference. Without a `currentDocument` the
output is unchanged.

### Runtime dependencies: 10 -> 5

`unorm`, `hash.js`, `inherits`, `clone-deep` and `bs58` (with `base-x`) are replaced by
in-tree equivalents. What remains is `bn.js`, `secrets.js-grempe` and the three `@noble`
packages — every dependency is now either audited cryptography or a deliberate separate
decision. `bsv.min.js` drops another 155 KB (1,187,504 -> 1,032,437);
`bsv-mnemonic.min.js` -30%.

Each replacement was differentially tested against the thing it replaced *before* the
dependency was removed: base58 over 20,336 encode/decode round-trips covering every
leading-zero count 0-8, and the hashes over 192 comparisons against the Node path
including the 55/56/64/119/128-byte block boundaries. `bsv.deps.bs58` is kept as a
facade over the new encoder, since it is a public escape hatch.

## [7.12.0] - 2026-08-10

### The browser bundles lose a fifth of their weight

`crypto-browserify` is a faithful shim for the whole of Node's `crypto`, and the browser
build used it for the `crypto` built-in. Faithful is the problem: every bundle carried
AES, DES, Diffie-Hellman, RSA public-encrypt and an ASN.1 parser for code the library
never calls. Reading the module graph rather than guessing, the bundles need exactly
three entry points — `createHash` (`hash.node.js`, and the didweb / vcjwt / statuslist /
anchor / gdaf modules, which `require('crypto')` unconditionally), `createHmac`
(`mnemonic/pbkdf2.node.js`) and `randomBytes` (secrets.js-grempe's Shamir CSPRNG).

`build/esbuild/crypto-shim.js` provides those three and nothing else. Fourteen packages
leave the graph; `bsv.min.js` drops from 378 module inputs to 309, and the duplicate
`bn.js` copy disappears with them.

```
bsv-anchor.min.js       341,349 →   167,670   -50.9%
bsv-didweb.min.js       342,010 →   168,331   -50.8%
bsv-vcjwt.min.js        343,018 →   169,332   -50.6%
bsv-shamir.min.js       354,058 →   180,342   -49.1%
bsv-statuslist.min.js   435,810 →   261,944   -39.9%
bsv-mnemonic.min.js     636,824 →   463,208   -27.3%
bsv-ltp.min.js          674,540 →   545,227   -19.2%
bsv.min.js            1,317,994 → 1,187,504    -9.9%
                      ─────────   ─────────
total (16 bundles)    7,491,257 → 5,928,232   -20.9%
```

No API changes. Digests, signatures and Shamir shares are unchanged — the new shim is
checked against node's own `crypto` for sha1/sha256/sha512/ripemd160 and HMAC-SHA512, and
the built bundles were additionally verified against NIST SHA-256 known-answer vectors.

`getRandomValues` is deliberately **not** exported. secrets.js prefers it over
`randomBytes` when present, so exporting it would silently move the Shamir CSPRNG onto a
different code path; `crypto-browserify` did not expose it either, so omitting it keeps
the selection identical to every prior release.

### Dependency advisories cleared

Dev-dependency alerts went from 10 (6 high, 2 moderate, 2 low) to **zero**. The
production tree audited clean throughout — `npm audit --omit=dev` was 0 before and after
— so no published version was ever affected.

The high and moderate findings (js-yaml, serialize-javascript, tmp) are closed with
pinned `overrides`, because npm's own suggestions were all wrong: a semver-major jump to
`standard@17`, a *downgrade* of crypto-browserify, and `mocha@11.3.0` when 11.8.0 was
already installed. The js-yaml 3.x line has a 3.15.1 backport above the vulnerable range,
so eslint and istanbul keep the 3.x API instead of being forced to 4.x where `safeLoad`
no longer exists.

The remaining low finding was `elliptic`, which has no patched version at all. It was
never our EC implementation — that moved to `@noble/curves` — but arrived transitively
through crypto-browserify. Removing that polyfill removed the chain entirely.

### Testing

`build/esbuild.js` used to keep `elliptic` out of the output with a hand-written
`onResolve` stub. That stub is gone, replaced by `test/build/bundle_crypto_shim.js`,
which asserts no bundle's module graph contains any part of the chain, pins the shim's
exported surface, and compares its digests against node's. A stub goes silent when it
stops matching; an assertion does not.

## [7.11.0] - 2026-08-10

### The Chronicle default, decided

Chronicle activated on BSV mainnet at block **943,816** on 2026-04-07, so a caller
validating anything created since needs its rules. The obvious move was to enable
`SCRIPT_ENABLE_CHRONICLE` by default. That is the wrong shape, and the reason is in the
node: it gates on `utxo_after_chronicle` — a property of **the output being spent**, not
of the chain or the validator. Both answers stay correct forever, because pre-activation
UTXOs remain spendable. A library-wide default would be a guess about the caller's input.

There is also no default to flip: `verify()` falls back to `0`, enabling no optional
feature at all, exactly as it does for FORKID, P2SH and CLTV. That is deliberate — a
validator should state the consensus context it is validating against.

**So the flag stays opt-in, and the real gap is fixed instead: callers had nothing
correct to opt into.** Assembling the flag set by hand invites getting it wrong, and
wrong here means a verdict that disagrees with the network.

### Added

- **`Interpreter.mainnetFlags({ afterChronicle })`** — the verification flags matching
  BSV mainnet consensus. `afterChronicle` defaults to `true`, since every output created
  since April is subject to Chronicle; pass `false` to validate the spend of a
  pre-activation UTXO, which is the same distinction the node makes per input.

  Script-number and element-size limits are deliberately **not** included: they are
  process-wide statics raised by `useGenesisLimits()`, not flags. A post-Genesis
  validator needs both, and the docstring says so.

- **`Interpreter.CHRONICLE_ACTIVATION_HEIGHT`** (943816), recorded so the per-UTXO
  question has an answer in the library rather than in a changelog.

### Fixed

- **A tautology in this project's own test suite, written in 7.7.0.** The assertion
  `(Interpreter.DEFAULT_FLAGS & CHRONICLE).should.equal(0)` was meant to prove the flag
  is off unless requested. `Interpreter.DEFAULT_FLAGS` does not exist, so it evaluated
  `undefined & n` — zero for every `n`, and unfailable. It now calls `verify()` with the
  flags argument omitted and asserts `BAD_OPCODE`, which is what it always meant.

  Noted plainly because 7.10.1 fixed three checks of exactly this shape in other
  people's code, and this one was mine.

Suite 4647.

## [7.10.1] - 2026-08-10

The three remaining findings from the #85 review. All three are cases of something
that *looked* like it checked a property and did not — the same class the corpus and
the bundle-parity gate keep surfacing.

### Fixed

- **The browser smoke test's cross-bundle assertion was a tautology.** In the one test
  named `feature bundles did not embed a second library instance`, the assertion read
  `assert(e.privateKey ? true : true, ...)` — it could not fail. Everything else in it
  stayed inside the ecies bundle, so it would have passed unchanged even if that bundle
  shipped a private copy of every primitive.

  `ECIES.prototype.privateKey` does `this._privateKey = PrivateKey(hex)`, constructing
  from the class *it* resolved, so `e._privateKey instanceof bsv.PrivateKey` is the real
  test — the same shape as the neighbouring mnemonic case. Verified to fail when the
  class identity is wrong.

- **`build/esbuild.js`'s `metafile` option claimed an assertion that did not exist.**
  Its comment said it was "used to assert that feature bundles externalise the shared
  primitives", but nothing consumed it — `grep -rn metafile` returned only the option.
  `test/build/bundle_externals.js` is now that consumer, and asserts three things:

  - no module mapped by `LIB_GLOBALS` appears as a bundled input. This is derived from
    the same table the build uses, so it cannot drift out of step with it;
  - each bundle's `lib/` inputs are pinned, because `LIB_GLOBALS` is deliberately not
    exhaustive — a feature bundle *should* carry its own feature code, so anything new
    appearing is either growth or a leak, and a human decides which;
  - nothing but two documented helpers is duplicated across bundles.

  Verified by removing `privatekey` from `LIB_GLOBALS`: the test immediately reports
  `bsv-ecies.min.js unexpectedly embeds lib/privatekey.js` and one more.

- **`lib/covenant-interface.js` held the last package-root require in `lib/`**, justified
  by a comment claiming "this file is reached while index.js is still initializing". That
  is not true — nothing in `index.js` or under `lib/` requires this module, only two
  files in `examples/` — and the property it assigned was never read internally. It is
  now a lazy getter, so `interface.bsv` keeps working while the require costs nothing
  for everyone else, and the refactor in 7.10.0 is complete: no package-root require in
  `lib/` executes at load.

Suite 4643 → 4645. Browser smoke 25/25, corpus 371/371, bundles unchanged.

## [7.10.0] - 2026-08-10

Internal restructuring with no API change, plus a conformance corpus and two
repairs to the gate that guards it.

### Changed

- **The 45 package-root require cycles in `lib/` are gone.** Modules now require
  each other directly instead of reaching back through the package root
  (`require('../..')`). That pattern is what made module load order matter: a
  consumer who reached `lib/script` before `lib/address` got a partially
  initialised namespace, which is the class of bug 7.5.7 fixed for one file. This
  removes the cause rather than another symptom — `check-address-load-order`
  passes on this branch independently of that fix.

- **OP_PUSH_TX primitives moved to `lib/covenant/`**, breaking the last dependency
  from core code into the application layer (`lib/ordinals` needed them too). The
  old paths remain as shims, because deep imports such as
  `require('@smartledger/bsv/lib/smart_contract/covenant_helpers')` are public API
  through the `exports` map. `./lib/covenant` is a new public subpath.

- **Feature bundles are thin again.** Each externalises the shared primitives per
  module rather than embedding a second copy.

- **`aes-js` dropped** — it was an unused dependency.

### Added

- **A conformance corpus** (`npm run conformance`): 371 cases across 11 suites,
  freezing observable behaviour so a change to it surfaces as a diff. Rejections
  are recorded as first-class outcomes, so a fix of the form "reject what used to
  be accepted" shows up as an outcome flip rather than disappearing.

  Worth stating its limit plainly, because this release is a good illustration: a
  frozen corpus detects a **change**, never a pre-existing wrong assumption. It is
  a regression net, not a correctness oracle.

### Fixed

- **`conformance/verify.js` passed when a fixture was missing.** A suite with no
  fixture was noted and skipped, so the run still printed `PASS` and exited 0.
  With the corpus a blocking CI gate, a fixture that was deleted or never
  committed would have dropped silently out of it. It now fails, as does a
  mistyped `--suite`, and `PASS` is no longer printed on a failed run.

- **`conformance/generate.js` corrupted its own manifest.** `MANIFEST.json` was
  written from the *filtered* suite list, so regenerating a single suite replaced
  the whole-corpus record with `suiteCount: 1` — erasing the only artifact that
  would reveal a fixture had gone missing. It is now derived from the fixtures on
  disk, carrying per-suite provenance and `lastVerifiedBy`.

- **The corpus harness could not parse Core's `NOP4`..`NOP8` names**, which
  surfaced as `threw:Error` on eighteen vendored vectors. Left unfixed, the
  regenerated fixtures would have frozen a *harness* defect as expected library
  behaviour.

Suite 4641. In-repo corpus 371/371; the independent corpus in
`@smartledger/bsv-core` reports 452/452.

## [7.9.0] - 2026-08-10

Five divergences from the SV Node source (checked at tag **v1.2.0**), and the
consequence closing one of them exposed.

### Fixed (consensus)

- **`OP_SUBSTR`/`OP_LEFT`/`OP_RIGHT` ran unconditionally.** The node treats bytes
  `0xb3`–`0xb5` as upgradable NOPs until Chronicle activates. This library executed
  them regardless, consuming stack where the network does nothing — reachable today,
  since those bytes are live NOPs.

- **Out-of-range string-op arguments were clamped instead of rejected.** The node:
  `if(offset < 0 || offset >= size || len < 0 || len > size - offset) return
  SCRIPT_ERR_INVALID_NUMBER_RANGE`. Measured before the fix, `'hi' 1 9 OP_SUBSTR`
  yielded `'i'` and the script **succeeded**. Note `offset >= size` is strict — a begin
  index at the end is an error, not an empty result.

- **`OP_VER` pushed a script number** where the node builds a `sizeof(tx_version)`
  vector and `to_le`s into it: `01000000`, not `01`.

- **`OP_VERIF` compared numerically.** The node requires exactly four bytes and
  compares byte-wise (`if(vch.size() == 4) … std::ranges::equal(val, vch)`), so a
  1-byte script number never matches however equal it looks. `OP_2 OP_VERIF` against
  version 2 was true here and false on the node; `OP_VER OP_VERIF` is the idiomatic
  form.

- **`OP_VERIF` in an unexecuted branch returned `BAD_OPCODE`.** Core treats it as
  illegal everywhere — a rule it applies to no other opcode — but BSV drops that at
  Genesis and the node breaks instead. Asserting the Core rule made this library reject
  scripts the network accepts. (This corrects an assertion added in 7.7.0.)

Also taken from the source: MINIMALIF applies only to `OP_IF`/`OP_NOTIF`, never to the
`OP_VER` family.

### Consequence worth reading

Closing the gating divergence surfaced something the old behaviour was hiding.
`pushTxCore` emits `OP_RIGHT`/`OP_LEFT` — see `extractHashOutputs` and
`assertSighashType` — so **OP_PUSH_TX covenants built by this library cannot be spent
on a pre-Chronicle chain**. Confirmed end to end: an OrdLock purchase verifies with
`SCRIPT_ENABLE_CHRONICLE` and fails `SCRIPT_ERR_EQUALVERIFY` without it.

That was invisible *because* the interpreter ran the string opcodes unconditionally:
the library was more permissive than the network, so the covenant and OrdLock suites
passed against a validator that did not match consensus. `covenant_helpers.flags()` now
sets the flag explicitly, so the dependency is stated rather than assumed. Whether that
tooling should target pre- or post-activation is a product decision this does not make.

### Breaking

Scripts using `OP_SUBSTR`/`OP_LEFT`/`OP_RIGHT` now require `SCRIPT_ENABLE_CHRONICLE` to
execute; without it they are no-ops, as on the network. Out-of-range arguments error
rather than clamping. `OP_VER` pushes four bytes. `OP_VERIF` needs a 4-byte operand.

With this release the independent conformance corpus in `@smartledger/bsv-core` — whose
Chronicle fixtures have been regenerated against the same source — reports
**PASS: 452/452** across all 13 suites. The two implementations agree completely.

Suite 4638 → 4641.

## [7.8.0] - 2026-08-10

`OP_LSHIFTNUM` / `OP_RSHIFTNUM` are implemented, and **7.6.0's fail-closed posture for
their bytes is corrected**. Both come from reading the SV Node implementation
([`src/script/interpreter.cpp`](https://github.com/bitcoin-sv/bitcoin-sv/blob/master/src/script/interpreter.cpp),
with the arithmetic in `src/script/script_num.cpp` and `src/big_int.cpp`) rather than
inferring from the one-sentence spec.

### Fixed

- **Bytes 182/183 are upgradable NOPs before Chronicle, not errors.** 7.6.0 made them
  reject unconditionally, on the reasoning that refusing to validate is safer than
  validating wrongly. The node does something else:

  ```cpp
  if(!utxo_after_chronicle)
  {
      if(IsDiscourageUpgradableNops(flags))
          return SCRIPT_ERR_DISCOURAGE_UPGRADABLE_NOPS;
      else
          break;          // no-op
  }
  ```

  So this library was rejecting scripts the network accepts — a false negative, which
  is the mirror image of the defect 7.6.0 set out to fix rather than a cure for it. In
  fairness to the original code, byte 182 behaving as a no-op was *correct* before
  Chronicle; the real defect was that it would have stayed a no-op *after* activation,
  silently skipping the shift. Two of the `BSV_DIVERGENCES` entries added in 7.6.0 are
  removed as a result: this library now agrees with Bitcoin Core on those vectors again.

### Added

- **`OP_LSHIFTNUM` / `OP_RSHIFTNUM` under `SCRIPT_ENABLE_CHRONICLE`.** Every question
  the spec left open is answered by the implementation:

  - **Operand order** — `// (x n -- out)`: the shift *count* is on top, the value beneath.
  - **Negative counts** — `if(n < 0) return SCRIPT_ERR_INVALID_NUMBER_RANGE`.
  - **"Preserving sign"** — sign-magnitude, and the right shift **truncates toward
    zero**: `"Mathematical division by 2^bit_shift, rounding toward zero ... For
    negative values: n / 2^k = -((-n) >> k)"`. So `-5 1 OP_RSHIFTNUM` is **-2, not -3**;
    a two's-complement arithmetic shift would floor. The bignum path agrees — it is
    OpenSSL `BN_rshift` on a sign-magnitude value. This is the same convention as
    `OP_DIV` and `OP_2DIV`, and there is a test asserting all three agree.
  - **Oversized counts** — right shift past the bit length is `0` (not an error); left
    shift raises overflow, bounded *before* shifting (`current_size + shift_bytes >
    max_length`) so a huge count cannot allocate a huge number on its way to rejection.
  - **Result encoding** — minimal, via the script-number encoder, bounded by the
    script-number width.

### Note on the conformance corpus

The independent Chronicle corpus in `@smartledger/bsv-core` pins *that* library's
fail-closed choice for these bytes, so it now reports 6 differences against this one —
all of them cases where this library matches SV Node and the corpus does not, including
a shrinking rather than growing set of divergences from Bitcoin Core. `CHRONICLE.md`
there reaches the same conclusion 7.6.0 did and is equally out of date; the node source
settles it.

17 → 26 tests in `test/script/chronicle.js`, each mapped to a specific line of the C++.
Suite 4629 → 4638.

## [7.7.0] - 2026-08-10

Completes the BSV **Chronicle** script surface. 7.6.0 fixed the opcode *numbering*
so the reassigned bytes fail closed; this adds the behaviour behind an explicit
`SCRIPT_ENABLE_CHRONICLE` flag.

### Added

- **`Interpreter.SCRIPT_ENABLE_CHRONICLE`** (`1 << 20`). Off by default — enabling it
  changes script evaluation, so it is an opt-in exactly like the Monolith and Magnetic
  flags.

- **`OP_2MUL` / `OP_2DIV`**, restored behind the flag. Without it they remain
  `SCRIPT_ERR_DISABLED_OPCODE`, and "disabled" is deliberately stronger than
  "unimplemented": a disabled opcode fails the script even in an **unexecuted** branch,
  which is why the gate lives in `isOpcodeDisabled` rather than the evaluation switch.
  `OP_2DIV` truncates toward zero — `-5 OP_2DIV` is `-2`, not `-3` — so it agrees with
  `x 2 OP_DIV`; pinned over negative and odd values, which is where a rounding change
  would otherwise hide. (`bn.js` `shrn` is unusable here: it asserts on negatives.)

- **`OP_VER` / `OP_VERIF` / `OP_VERNOTIF`**, behind the same flag. `OP_VER` pushes the
  executing transaction's version. `OP_VERIF` is an `IF` whose condition is "top of
  stack equals the transaction version", closed by `OP_ENDIF`; `OP_VERNOTIF` is its
  negation.

  Two details worth recording. Before Chronicle, `OP_VERIF`/`OP_VERNOTIF` are invalid
  **even in an unexecuted branch** — a rule Bitcoin applies to no other opcode — so the
  flag check sits deliberately *outside* the `fExec` guard, preserving it. And
  `OP_VERIF` **pops** its operand, mirroring `OP_IF`: the spec describes the comparison
  but not the stack effect, and an `IF` that left its condition behind would unbalance
  every script using it. That is an inference, and it has its own test so a correction
  surfaces as a failure.

- **`Signature.SIGHASH_CHRONICLE`** (`0x20`), selecting the Original Transaction Digest
  Algorithm. It **overrides** `SIGHASH_FORKID` rather than merely coexisting with it:
  FORKID is set on essentially every BSV signature written since 2018, so a bit that
  only applied when FORKID was absent could never select OTDA in practice. Gated on
  `SCRIPT_ENABLE_CHRONICLE` because before the upgrade the `0x20` bit means nothing —
  BIP-143 signatures already exist whose type byte happens to set it, and honouring it
  unconditionally would silently reinterpret those as OTDA.

### Verification

17 new tests in `test/script/chronicle.js` pin both states: every feature above with
the flag on, **and** the unchanged default with it off. Against the independent
Chronicle conformance corpus in `@smartledger/bsv-core`, divergences fall **14 → 1**,
and that one is Node echoing an assertion's source text (`assert(Buffer.isBuffer(buf))`
vs `(Buffer.isBuffer(buf))`) — a difference in how the two codebases wrote the same
check, not behaviour. Under the default comparison the corpus reports
**PASS: 442/442**.

Suite 4612 → 4629.

## [7.6.2] - 2026-08-10

### Changed

- `bn.js` 4.12.3 → 4.12.5 (patch within v4). Differential-tested against the real
  `lib/crypto/bn.js` wrapper using the harness from `docs/BN_JS_V5_REVIEW.md`:
  **11,071 checks, zero differences**, including ECDSA DER bytes, WIF, addresses,
  script numbers and HD derivation. The exact pin is retained — it is load-bearing for
  deduplication, and 4.12.5 is what the transitive `^4` consumers already resolve to,
  so the browser bundle still inlines two copies rather than five. `bn.js` majors
  remain ignored for the reasons in that review.

Published so `main` and npm stay in step; no behaviour change.

## [7.6.1] - 2026-08-10

Three call-shape defects, each found by the TypeScript compiler objecting during the
`bsv-core` port. Two were live. Each was reproduced against the published package
before being fixed.

### Fixed

- **`Transaction#fromObject` threw when given a Transaction.** The branch that exists
  specifically to accept one read `transaction.toObject()` — the variable declared on
  the line above and still `undefined` — instead of `arg.toObject()`. So the only input
  the `checkArgument` directly above it explicitly admits was the only one that could
  not work:

  ```
  new bsv.Transaction().fromObject(someTransaction)
  TypeError: Cannot read properties of undefined (reading 'toObject')
  ```

  Nothing caught it because the plain-object branch is what every caller and every test
  uses — it is what `toObject()`/`toJSON()` produce and what the docs show. The
  `instanceof` branch was dead in practice.

- **`OP_CHECKSEQUENCEVERIFY` failed every script it appeared in.** `checkSequence`
  masked with `nSequence.and(nLockTimeMask)` where the mask is a plain number; bn.js
  `and` requires a BN, so it threw `num.clone is not a function`. The interpreter's
  `try`/`catch` swallowed that and reported `SCRIPT_ERR_UNKNOWN_ERROR`, so CSV scripts
  failed with a misleading error rather than a verdict. The line immediately above does
  the same masking correctly with JS numbers.

  Scoped: reachable only with `SCRIPT_VERIFY_CHECKSEQUENCEVERIFY` set. Genesis reverted
  CSV to `OP_NOP3` on BSV and the flag is off by default, so this affected callers
  emulating pre-Genesis rules rather than normal BSV validation. `CHECKLOCKTIMEVERIFY`
  was checked and does not share the defect.

- **`sFromPreimage` called bn.js's native `toBuffer` signature** — `s.toBuffer('be', 32)`
  — against the options-object form that `lib/crypto/bn.js` substitutes, so `'be'` landed
  in `opts` and the length was ignored.

  **Latent, not live**, and the reasoning is worth recording because it is not obvious:
  `z` is filtered to a leading byte of `0x01..0x7f`, so `z` is in `[2**248, 2**255)`;
  adding `Gx` (~0.476 · 2**256) never wraps; and the low-S check caps the result at
  `n/2`. `s` therefore always lands in a band with a leading byte of `0x7a..0x7f` and is
  always 32 bytes — verified over 62,000 candidates. Fixed anyway, because that safety
  is an accident of two filters that have nothing to do with buffer length: widen the
  MINIMALDATA range or drop low-S and the truncation becomes reachable, silently, inside
  a covenant whose `DER_PREFIX` declares `s` to be exactly 32 bytes. `grind` now checks
  the length rather than truthiness, since a short `s` would be truthy.

Cross-checked against the independent Chronicle conformance corpus in
`@smartledger/bsv-core`: divergences unchanged at 14/442, so none of this moved
observable behaviour anywhere else. Suite 4604 → 4612.

## [7.6.0] - 2026-08-10

### Fixed (consensus)

- **Bytes 182/183 verified scripts that did nothing.** Chronicle reassigns five
  bytes and the spec fixes the mapping itself by naming which NOP each one used to
  be — 179 `OP_SUBSTR` (was `OP_NOP4`) … 182 `OP_LSHIFTNUM` (was `OP_NOP7`), 183
  `OP_RSHIFTNUM` (was `OP_NOP8`). This table instead slid the NOP names *upward*,
  which put `OP_NOP4`/`OP_NOP5` on the shift opcodes' bytes and invented
  `OP_NOP8`–`OP_NOP10` at 186–188, three bytes that are not opcodes at all.

  The consequence was the worst kind of bug: byte 182 parsed as an upgradable NOP,
  so a script using `OP_LSHIFTNUM` **verified as true with both operands still on
  the stack** — a shift that never happened, reported as success. Not an error: a
  wrong answer, from a validation library, on a consensus path. A Chronicle node
  evaluating the same script computes a shifted value.

  ```
  before: byte 182 with 08 01 on the stack -> verifies TRUE, stack unchanged
  after:  byte 182 -> SCRIPT_ERR_BAD_OPCODE
          byte 183 -> SCRIPT_ERR_BAD_OPCODE
          byte 184 -> no-op (OP_NOP9)      byte 185 -> no-op (OP_NOP10)
          bytes 186+ -> SCRIPT_ERR_BAD_OPCODE
  ```

  **The shift semantics are deliberately NOT implemented.** The published spec is one
  sentence and leaves at least four things undetermined — operand order, what
  "preserving sign" means for sign-magnitude script numbers, out-of-range shift
  counts, and result encoding. Guessing any of them produces confident wrong answers,
  which is the failure mode this entry begins with. Refusing to validate is safe;
  validating wrongly is not.

### Breaking

`Opcode.OP_NOP4` … `OP_NOP8` no longer exist — Chronicle reassigned their bytes.
`OP_NOP9`/`OP_NOP10` move from 187/188 to their real numbers 184/185, and 186–188
are unassigned. Scripts using bytes 182/183 or 186–188 are now rejected instead of
treated as no-ops.

The vendored `script_tests.json` is untouched: the test harness resolves Core's
`NOP4`..`NOP8` names to **Core's bytes**, so each vector still assembles the exact
script Core meant and the divergence is recorded rather than hidden. Ten vectors move
into `BSV_DIVERGENCES`; one (`1 0xba`) moves *out*, because 186 is now unassigned here
as it is in Core — this change removes a divergence as well as adding them.

Cross-checked against the independent Chronicle conformance suite in
`@smartledger/bsv-core`: divergences fall **25 → 14**, and
`bitcoind script_tests: divergence from Core is exactly the known set` now passes, so
this library's Core-divergence set matches that implementation's exactly. The 14
remaining are `SCRIPT_ENABLE_CHRONICLE`-gated features (`OP_2MUL`, `OP_2DIV`,
`OP_VER`, `OP_VERIF`, `OP_VERNOTIF`, the `0x20` sighash flag) that this library does
not implement at all — a separate piece of work, not a defect.

Suite 4603 → 4604.

## [7.5.8] - 2026-08-07

### Fixed

- **Directory deep imports under `lib/` did not resolve.** The `exports` map carried
  `"./lib/*": "./lib/*.js"`, which maps `lib/script` to `lib/script.js` — a file that
  does not exist, since `script` is a directory. So
  `require('@smartledger/bsv/lib/script')` raised `MODULE_NOT_FOUND`, and the same
  applied to all 16 directory modules (`ordinals`, `smart_contract`, `transaction`,
  `gdaf`, `ltp`, `spv`, `mnemonic`, `vcjwt`, …). Only the explicit
  `lib/script/index.js` form worked.

  Each directory that has an `index.js` now has an explicit entry pointing at it.
  Non-pattern keys take priority over patterns in Node's resolution, so directories
  resolve through these while files continue to use `"./lib/*"`. Both CommonJS
  `require` and ESM `import` are covered, since the map governs both.

  Node's fallback-array form (`["./lib/*.js", "./lib/*/index.js"]`) was tried first and
  does **not** work: Node falls through on an *invalid* target, not on a missing file.

  The regression test enumerates `lib/` at runtime rather than hard-coding names, so a
  new directory module cannot be added without also being exported, and asserts the
  bare and explicit forms return the *same* module object (one cache entry, not two).

  This is the resolution gap behind the reproduction in the 7.5.7 report: the literal
  line `require('@smartledger/bsv/lib/script')` failed here before it could reach the
  require-cycle defect that release fixed.

Suite 4601 → 4603.

## [7.5.7] - 2026-08-07

### Fixed

- **`Address` threw whenever `lib/script` was required before `lib/address`.**
  The two modules form a require cycle, and `address.js` ended with the usual idiom
  — export yourself, then `var Script = require('./script')`. That only holds when
  `address` loads first. Reaching `lib/script` first meant the require returned
  script's **partially initialised** exports (`{}`), the captured binding stayed `{}`
  forever, and every `instanceof Script` raised
  `TypeError: Right-hand side of 'instanceof' is not callable`. `var` hoisting hid it,
  since the name is in scope for the functions defined above the assignment.

  This was reachable, not theoretical: deep imports are public API through the
  `exports` map (`"./lib/*"`), so requiring `lib/script` first is a supported way to
  use the package. Both `Address.fromScript(script)` and `new Address(script)` threw,
  reaching the check through `_transformScript` and `_classifyArguments` respectively.

  `Script` is now resolved at call time through a small accessor rather than captured
  at module scope. `require` is cached, so it costs nothing, and by the time any of
  these functions run the module is complete — which keeps `instanceof` **exact**
  rather than loosening the check to a structural duck-type that a non-Script object
  could satisfy.

- **`scripts/check-address-load-order.js`** guards it, wired into CI and available as
  `npm run check:load-order`. It deliberately lives outside mocha: the check must clear
  `require.cache`, which would invalidate every module reference an in-process suite is
  holding. It exercises `fromScript`, the constructor **and** `payingTo` — the first
  two reach the check by different paths, and `payingTo` reaches the `Script`
  constructor itself. Confirmed to fail against the unpatched module rather than
  passing vacuously.

Reported with an accurate reproduction and diagnosis in
`BUG-address-load-order-instanceof.md`. Suite 4601 (unchanged — the guard is a
standalone script, by necessity).

## [7.5.6] - 2026-08-07

### Fixed

- **`cashAddrPrefixArray` threw whenever STN was enabled.** The getter's STN branch
  called `STN.cashAddrPrefixToArray(...)`, but `STN` is a plain data object with no
  methods — the two sibling branches correctly call the module-level function of that
  name. Reading `Networks.testnet.cashAddrPrefixArray` after `Networks.enableStn()`
  raised `TypeError: STN.cashAddrPrefixToArray is not a function`. Live, not latent.

  Nothing caught it because nothing exercised the path: the existing network tests
  assert on `cashAddrPrefix` (the string) and never read the array getter. Four
  regression tests now cover all three branches plus the fact that each mode yields a
  distinct prefix array, and they were confirmed to fail against the unpatched getter
  rather than passing vacuously. They reset both toggles in `afterEach`, since
  `enableStn`/`enableRegtest` mutate the shared `testnet` object and otherwise leak
  into later tests.

### Changed (no behavioural difference)

Two defects that were correct by accident, corrected so the code states its intent.
Both were verified to leave output unchanged before being touched.

- **`Hash.hmac`** tested `key < blocksize` — a `Buffer` compared against a number,
  which is always `false`, so the zero-padding branch never ran. The result was right
  anyway: the XOR loop indexes past a short key and `x ^ undefined === x ^ 0`, exactly
  what padding produces. Now `key.length < blocksize`. HMAC output is **byte-identical**
  across 48 vectors spanning short, block-sized and over-length keys, in both the Node
  and browser implementations.

- **`BN.prototype.toSMBigEndian`** used `&` (bitwise) between two comparisons rather
  than `&&`. It worked because `===` binds tighter than `&` and `true & true` is `1`.
  Now `&&`.

Reported with a reproduction and a correct diagnosis in
`BUG-networks-stn-cashaddrprefixarray.md`; each claim was reproduced here before being
acted on. Suite 4597 → 4601.

## [7.5.5] - 2026-08-07

### Fixed (security)

- **`PrivateKey.fromObject` silently returned a different key when given malformed
  input.** `bn.js@4` *skips* characters it cannot parse instead of failing, so a
  malformed `bn` never raised — it produced whatever the surviving characters
  happened to encode. Combined with the `toJSON` redaction added in 7.5.1, the most
  natural persist/restore round-trip

  ```js
  PrivateKey.fromObject(JSON.parse(JSON.stringify(key)))
  ```

  parsed the marker `'[REDACTED]'` as `768491671261` and returned a valid-looking
  key of roughly **40 bits** — with no error, a different WIF, and a different
  address. Anyone performing that round-trip and funding the resulting address
  would lose the funds: the value is deterministic and derivable by anyone who
  knows the marker.

  `_transformObject` now validates before parsing: `bn` must be a non-empty
  hexadecimal string, must not be the redaction marker (which raises a message
  pointing at `toObject()`/`toWIF()`), and must fall inside the valid key range
  (non-zero, below *n*). `toObject()` round-trips exactly, as before, and the
  redaction marker is now a single shared constant so the emitter and the guard
  cannot drift apart.

  Found while evaluating the `bn.js` 4 → 5 bump: v5 rejects the input correctly, so
  the one suite failure under it was this latent defect surfacing, not an
  incompatibility. The fix is in this library's validation and does not depend on
  upgrading `bn.js`.

- The test asserting `fromObject(key.toJSON())` "does not throw" encoded the broken
  behaviour as intent and has been inverted, alongside regression tests for
  non-hex input, the redaction marker, zero, and *n*.

Suite 4594 → 4597.

## [7.5.4] - 2026-08-07

Dependency maintenance, with each update tested in isolation rather than merged on
green CI alone. Two proposed majors were rejected for concrete reasons and are now
pinned.

### Changed

- `inherits` 2.0.3 → 2.0.4 and `unorm` 1.4.1 → 1.6.0 (both runtime dependencies, so
  the 16 browser bundles are regenerated here). `unorm` performs the NFKD
  normalisation BIP39 depends on; verified unchanged, including the full-width
  katakana case (`ｶﾞ` → `ガ`) that normalisation bugs surface in.
- `chai` 4.2.0 → 6.2.2 (dev). Full suite passes unmodified.
- `actions/checkout` and `actions/setup-node` v5 → v7.

### Not upgraded, and why

- **`jose` is pinned to `^5`.** v6 is WebCrypto-only and WebCrypto has no secp256k1,
  so it has dropped **ES256K**. Verified against 6.2.7: `ES256` and `ES384` generate,
  `ES256K` raises `Invalid or unsupported JWK "alg" Parameter value`. The two ES256K
  cases in `test/vcjwt/interop.js` fail under it — and those tests exist to prove an
  *independent* JOSE implementation can verify tokens this library issues. ES256K is
  the algorithm for Bitcoin keys, so the upgrade would delete the guarantee the
  dependency is there to provide.

- **`typescript` is pinned to `^5`.** The 7.x npm package ships no compiler API: it
  exports only `version` and `versionMajorMinor`, with `createSourceFile`,
  `ScriptTarget` and `SyntaxKind` all `undefined`. `test/types/dts_drift.js` parses
  `bsv.d.ts` through the TypeScript AST to assert every declared symbol exists at
  runtime, and it is the only thing keeping the hand-curated `bsv.d.ts` honest.

Both reasons are recorded in `.github/dependabot.yml` so the bumps are not reproposed.

### Security posture note

Dependabot alerts are now enabled on the repository. The 13 open alerts are **all in
the development toolchain** — `js-yaml`, `brace-expansion`, `tmp` and
`serialize-javascript` reached through `mocha`, `standard`, `eslint` and `inquirer`.
`npm audit --omit=dev` reports **0 vulnerabilities**, and the browserify shims flagged
via `crypto-browserify` (`browserify-sign`, `create-ecdh`, `elliptic`) are stubbed out
by the esbuild config and appear **zero times** in the shipped bundles. Clearing the
remainder requires major upgrades of `mocha` and `standard`; the latter is gated on
the lint-ratchet baseline and is tracked as its own piece of work.

## [7.5.3] - 2026-08-07

### Fixed (security)

- **The anchor key-material guard added in 7.5.1 detected by field name only, which
  was wrong in both directions.** It refused `{ d: '2026-01-01' }` — telling the
  caller their date looked like a private key — while publishing a real WIF stored
  under `note`, an `xprv` under `ref`, or a BIP39 mnemonic under `memo`, because
  those field names were not on the list. Naming a secret innocuously is exactly
  what an accidental leak looks like, so name-matching alone could not close the
  hole it was written for.

  Detection is now by value as well as name, on three independent signals:

  1. **The anchor's own signing key**, in any representation (WIF, hex scalar, the
     `bn`), is refused wherever it appears. This is the defect the guard exists for,
     and knowing our own key makes a bare hex scalar catchable at all.
  2. **Self-identifying secrets** — a WIF that decodes, an `xprv`/`tprv` that parses,
     a BIP39 phrase that passes wordlist *and* checksum — are refused under **any**
     field name, at any depth, including inside arrays.
  3. **Field names**: always for `bn`/`wif`/`privateKey`/`xprv`/`mnemonic`/…, and for
     ambiguous names (`d`, `seed`, `secret`, `key`) only when the value also decodes
     as a private key.

  A bare 64-character hex string that is *not* our own key is deliberately still
  accepted: it cannot be distinguished from a SHA-256 digest, and anchoring a
  document hash is what this module is for. Public material — addresses, public
  keys, `xpub` — is accepted, since an anchor legitimately references it.

  15 regression tests pin both directions, including the four leaks the previous
  guard allowed and the two false positives it produced.

Suite 4579 → 4594.

## [7.5.2] - 2026-08-06

The rest of the field review that produced 7.5.1: declarations that disagreed with
the code. Most are declaration-only, but four cases needed the **runtime** to change,
because a declaration matching the old behaviour would have been documenting a bug.

### Fixed (security)

- **`StatusList.getCredentialStatusEntry` was declared synchronous but is `async`.** So
  `if (getCredentialStatusEntry(...) === 'revoked')` type-checked cleanly and compared a
  `Promise` to a string — always false. **Every revoked credential passed as valid**, and
  the type checker was what hid it. It now declares `Promise<CredentialStatus>`, which
  turns that comparison into a compile error (`'Promise<string>' and '"revoked"' have no
  overlap`).

- **`updateStatusList` no longer records a suspension as a revocation.** `'suspended'`
  set the *same bit* as `'revoked'` and read back as `'revoked'`, so a temporary
  suspension was silently written — and later reported — as a permanent revocation. This
  implementation hardcodes `statusPurpose: 'revocation'` and uses one bit, so there is
  nowhere for suspension to go; it now throws, naming the limitation, instead of writing
  the wrong state.

- **`SmartContract.ownershipToken` dropped its authorizer.** The top-level alias was
  `function (fee, ownerPubKeyHash)` and called through with only those two arguments, so
  a **co-signed token built via this path came out single-key** — the authorizer was
  accepted and discarded. Same silent-argument family as 7.0.1, 7.0.2, 7.2.0, 7.3.0 and
  7.4.0.

### Fixed

- **`Authorizers.multisig(m, nKeys)` rejects an array.** `nKeys` is a count, but passing
  keys made `m > nKeys` compare a number to an array — which coerces to `NaN`, so the
  guard passed and an authorizer was built with the array spliced into its name. It now
  throws and names the fix. (`Locks.multisig` genuinely does take keys, which is what
  made this easy to walk into.)

- **Sub-path imports resolve.** `@smartledger/bsv/didweb` and ten siblings were
  `MODULE_NOT_FOUND`: the `exports` map had no aliases for the `*-entry.js` files, so
  documented deep imports could not be loaded at all. Eleven aliases added.

- **`securityFeatures` no longer claims `'elliptic-patches'`**, which it advertised long
  after `elliptic` stopped being a dependency. It is the string a compliance reviewer
  reads, so it now lists what is actually shipped.

### Changed

Declarations corrected to match the runtime: `Authorizers.multisig(m, nKeys: number)`;
`AnchorKind` and `CredentialStatus` closed (both were `| string` while the runtime
enforces a fixed set); `Script.buildSafeDataOut` declared (it was missing while
`isSafeDataOut` was present, steering TypeScript users to `buildDataOut`, whose bare
`OP_RETURN` is not provably unspendable); `Message` typed as callable without `new`, the
form the examples use; `canonicalizeClaim` returns `string`, not `object`;
`Networks.get`'s `keys` optional; both `ownershipToken` overloads take the authorizer;
`StatusListReadParams` added so the mandatory `expectedIssuerDid` and key source are
visible rather than surfacing as a runtime throw.

### Added

- **The type-drift gate now catches async-declared-as-sync.** `test/types/dts_drift.js`
  compares each declared return type against the runtime function's
  `constructor.name === 'AsyncFunction'`, so a declaration can no longer hide a Promise.
  Verified adversarially: reverting the `getCredentialStatusEntry` declaration makes the
  gate fail. This is the class that produced the revocation bypass above, so it is now
  mechanically impossible to reintroduce.

- `test/types/surface_honesty.js` covers the runtime-side fixes, including all eleven
  sub-path entry points.

### Breaking

`updateStatusList` throws on `status: 'suspended'` instead of writing the revocation bit.
`Authorizers.multisig` throws when handed an array. `AnchorKind` and `CredentialStatus`
no longer accept arbitrary strings in TypeScript.

Suite 4559 → 4579.

## [7.5.1] - 2026-08-06

Three defects reported from the field against 7.4.0, each reproduced here before
being fixed. All three return or publish a key other than the one the caller
intended. **Anyone using `GDAF.anchorCredential` or `anchorBatch` should treat any
key passed to them as compromised and rotate it.**

### Fixed (security)

- **`GDAF.anchorCredential` and `anchorBatch` published the caller's private key in
  the OP_RETURN.** The wrappers take `(payload, privateKey, options)` while the
  underlying `SmartLedgerAnchor` methods take `(payload, metadata, utxos)`, and every
  wrapper forwarded `privateKey` into a slot that is not a key. For these two it
  landed in `metadata`, which is `JSON.stringify`-ed straight into the anchor payload
  — and `PrivateKey.prototype.toJSON` emitted the secret scalar as hex. The key was
  therefore recoverable from chain data: reconstructing it from the OP_RETURN yields
  an **identical WIF and address**, so an observer can spend the funds.

  The anchor already holds the key it was constructed with, so the wrappers no longer
  forward it. `options` is now `{ utxos, metadata }`; a bare UTXO array is still
  accepted, since that was the only shape that previously produced a transaction.
  `registerDID` and `revokeCredential` shared the argument-order defect but put the
  key in the `utxos` slot, where they died on `utxos.reduce` — they never leaked, and
  are corrected too.

  Defence in depth: `_createAnchorPayload` now refuses to serialise a `PrivateKey`
  instance or any key-shaped field (`bn`, `wif`, `privateJwk`, `seed`, `xprv`, ...),
  so reaching the payload builder with key material fails loudly instead of
  broadcasting it.

- **`PrivateKey.prototype.toJSON` no longer emits the secret scalar.** It was the same
  function as `toObject`, so *anything* that stringified a key — a log line, an error
  dump, a request body, or the anchor path above — published it. `JSON.stringify(key)`
  now yields `bn: '[REDACTED]'`. `toObject()` is unchanged and remains the deliberate
  export, so `PrivateKey.fromObject(key.toObject())` still round-trips exactly.

- **`PrivateKey.fromString(str, network)` honours `network` instead of discarding it.**
  It accepted the argument and ignored it, so `fromString(hex, 'testnet')` returned a
  livenet key and therefore a **mainnet address** — funds sent there land on the wrong
  network. The failure was intermittent because `toAddress(network)` does honour its
  own argument. For a WIF, which encodes its own network, a conflicting `network` now
  throws rather than being silently overridden.

- **`PrivateKey.fromHex` / `fromBuffer` agree with the constructor.**
  `_transformBNBuffer` hardcoded `compressed: false` while every other path — random
  keys, hex strings, compressed WIF — produced `true`, so `PrivateKey.fromHex(h)` and
  `new PrivateKey(h)` returned **different addresses and different WIFs for identical
  input**. Restore a key by the wrong route and you derive an address you never funded.
  A raw 32-byte scalar carries no compression information, so the default now matches
  the rest of the library; pass `compressed = false` explicitly for the legacy form.

### Changed

- `bsv.d.ts`: `fromString`/`fromWIF` take an optional `network`; `fromHex`/`fromBuffer`
  take optional `network` and `compressed`; `toObject()` and `toJSON()` have distinct
  return types so the redaction is visible to TypeScript; the GDAF anchoring methods
  declare `AnchorOptions | Utxo[]` and return `Promise`. Verified under `tsc --strict`.

- Two tests asserted that `JSON.stringify(privateKey)` emits the scalar, encoding the
  unsafe behaviour as intent. They now assert the opposite, while still checking that
  `toObject()` round-trips exactly.

### Breaking

`JSON.stringify(privateKey)` no longer contains the key; use `toObject()` or `toWIF()`
where the export is intended. `PrivateKey.fromHex`/`fromBuffer` on a 32-byte scalar now
default to compressed, changing the derived address and WIF — pass `false` for the old
behaviour. The GDAF anchoring wrappers no longer accept a private key in the `options`
position, and reject key material in `metadata`.

Suite 4544 → 4559.

## [7.5.0] - 2026-08-05

### Fixed

- **`useGenesisLimits()` now lifts the total script size cap, which it previously
  could not.** The cap was a literal inside `Interpreter.prototype.evaluate`,
  carrying its own `// TODO: script size should be configurable. no magic numbers`:

  ```js
  if (this.script.toBuffer().length > 10000) {
  ```

  So a caller who opted into post-Genesis limits still hit a **pre-Genesis 10,000
  byte ceiling** — the function said "post-Genesis limits" and enforced one of the
  limits Genesis removed. Any script above 10 KB failed `SCRIPT_ERR_SCRIPT_SIZE`
  no matter what was asked for, which put a sizeable 1Sat Ordinals inscription out
  of reach of the interpreter entirely: transferring one could not be verified by
  this library at all, in any version, and callers were pushed into checking the
  ECDSA signature against the sighash by hand.

  The cap is now `Interpreter.MAX_SCRIPT_SIZE`, still defaulting to the
  pre-Genesis 10,000, and `useGenesisLimits()` raises it along with the other
  three. Two limits bite at different sizes and the regression test pins both: a
  3 KB inscription loads and fails on the 520-byte push cap
  (`SCRIPT_ERR_PUSH_SIZE`), while a 50 KB one is refused before evaluation begins
  (`SCRIPT_ERR_SCRIPT_SIZE`).

### Added

- **`Interpreter.getLimits()` / `Interpreter.setLimits()`** — capture and restore
  the four caps as a unit. The caps are process-wide statics, so anything that
  raises them must put them back or it silently changes the rules for unrelated
  code later in the same process. Five test files were each restoring three caps
  by hand, which would have quietly leaked the new fourth one into the bitcoind
  consensus fixtures; they now use the pair.

- Regression coverage for the case that prompted this: signing a large inscription
  transfer over the **full previous locking script** (envelope included, which is
  the script code the network uses), verifying it through the interpreter under
  Genesis limits, and confirming the interpreter agrees with a direct
  signature-against-sighash check. A companion test asserts the trap: a signature
  made over the **base lock alone** verifies against its own preimage and fails the
  real one, so that mistake cannot pass unnoticed.

### Note on defaults

Post-Genesis limits remain **opt-in**. Making them the default was measured, not
assumed: it fails **19 bitcoind consensus fixtures** that assert oversized pushes,
excess opcodes and oversized numerics must be rejected. Those fixtures encode
pre-Genesis consensus and share the same process-wide statics, so the default
cannot move while the caps are global. Making the limits per-`Interpreter` policy
is the real fix and is deliberately not attempted here — it changes a
consensus-critical evaluation path and deserves its own change.

Suite 4536 → 4544.

## [7.4.0] - 2026-08-05

Completes BSV-21 coverage. 7.3.0 taught the parser every operation the specification
defines; this release lets you *build* them too, so the authority-based token model is
usable end to end rather than only readable.

### Added

- **`BSV20.buildAuth` / `buildDeployAuth` / `buildBurn`**, with matching
  `createAuthOutput` / `createDeployAuthOutput` / `createBurnOutput` 1-sat output helpers.
  These complete the BSV-21 authority model, which is the current standard (v1 tickers
  are deprecated):

  - `deploy+auth` declares a token with **no supply** — `amt` is forbidden, and minting
    happens later against the deploy's outpoint.
  - `auth` marks an output as carrying the right to mint, which "can be split, combined,
    or transferred to delegate minting authority". It carries no amount.
  - `burn` retires an amount of a BSV-21 token. Id-based only: the specification defines
    no ticker form, and a `tick` is rejected with a message saying so rather than being
    quietly reinterpreted.

- **`buildMint` accepts `id`**, so a BSV-21 token can be minted against its outpoint
  (`{p, op:'mint', id, amt}`, which requires an auth input to be spent on chain). Only
  the v1 ticker form was previously expressible, which meant a token deployed under the
  authority model could be read but never minted. The v1 ticker path is byte-for-byte
  unchanged — a regression test pins the exact emitted JSON.

### Fixed

- **`buildTransfer` no longer silently drops `tick` when `id` is also given.** It
  preferred `id` and discarded the ticker, but those name *different tokens*, so the
  caller got a transfer of something other than what they asked for. Both `buildMint` and
  `buildTransfer` now require exactly one of the two and say which is missing when neither
  is supplied. Same silent-argument family as 7.0.1, 7.0.2, 7.2.0 and 7.3.0.

### Changed

- `bsv.d.ts`: `buildMint` takes `{amt, tick?, id?}`; the new builders and output helpers
  are declared; `Payload.op` lists `deploy+auth`, `auth` and `burn`. Verified under
  `tsc --strict` — valid calls compile, and omitting the required `id` on `buildAuth` is
  a compile error.

Suite 4525 → 4536.

## [7.3.0] - 2026-08-05

Conformance pass over the rest of `lib/ordinals/`, checked against the published
1Sat Ordinals specification rather than against our own tests. `parseOrdLock` and
`parseBsv20` both reported validity they did not enforce; the builders emitted
payloads the spec rejects. Some calls that previously succeeded now throw — see
**Breaking**.

### Fixed (security)

- **`parseOrdLock` / `isOrdLock` verify the covenant instead of matching a shape.**
  Both recovered a listing's terms from the script's *arrangement of opcodes* — a
  top-level `OP_IF` with a 20-byte push, and `OP_TOALTSTACK <blob> OP_CAT OP_SWAP`
  in the `OP_ELSE` branch — and reported a seller and a price on that basis alone.
  A script wearing that arrangement while containing **no `OP_PUSH_TX` covenant at
  all** was therefore reported as a genuine listing: the regression test builds one
  that ends in `OP_TRUE`, gets `isOrdLock` → `true` with an attacker-chosen seller
  address and a 1 BSV price, and then proves through the interpreter that the
  ordinal is spendable **for free**. A marketplace UI reading listings this way
  displays fabricated offers.

  The recovered terms are now verified by reconstruction: the listing is rebuilt
  from the recovered seller / payment outputs / inscription via `buildOrdLock` and
  must match the input byte-for-byte. A non-null result means the purchase branch
  genuinely binds the payment into `hashOutputs`. Every listing this library builds
  — simple, multi-output royalty/fee, and inscribe-and-list — still parses.

- **`parseBsv20` / `isBsv20` enforce the validity they document.** Both were
  documented to report whether input "carries a **valid** BSV-20 inscription" but
  checked only that `p === 'bsv-20'` and that `op` was a string, so
  `{p:'bsv-20', op:'transfer'}` — no amount, no token — and even
  `{p:'bsv-20', op:'not-an-op'}` returned `true`. The operation must now be one the
  specification defines and must carry that operation's required fields, with
  `tick` / `id` / amounts / `dec` well-formed. Operations this library does not yet
  build are still read: `burn`, `auth` and `deploy+auth` parse. Non-canonical
  amounts (leading zeros) are tolerated when reading, since other people's payloads
  are not ours to reject over formatting.

### Fixed

- **`lim: 0` is accepted; the spec defines it as unlimited.** The deploy builder ran
  `lim` through the strictly-positive check used for `max` and `amt`, so the legal
  value documented as "0 or omitted = unlimited" threw `lim must be greater than
  zero` — there was no way to state an unlimited per-mint cap explicitly.

- **Amounts are bounded by uint64.** `amt`, `max` and `lim` are "strings
  representing uint64" (max `18446744073709551615`), but any length of digit string
  was accepted and emitted — a 26-digit supply produced valid JSON that indexers
  discard, burning the tokens. Values above `2^64-1` are now rejected, and exactly
  `2^64-1` is accepted. A *numeric* amount above `Number.MAX_SAFE_INTEGER` is also
  rejected rather than silently rounded to a different number than the caller passed;
  pass it as a string.

- **`sym` and `icon` reject non-strings instead of stringifying them.** Both ran
  through `String()`, so `sym: {}` wrote the literal text `[object Object]` into a
  permanent token payload — the same coercion class fixed in `inscription.js` in
  7.2.0, which that sweep did not reach. `icon` must additionally be an outpoint
  reference (`<txid>_<vout>`), which is what the specification defines it as.

### Changed

- Two tests asserted that 26-digit amounts round-trip. Their intent — amounts beyond
  2^53 stay exact as strings and are never coerced to JS numbers — is right and is
  preserved, but the magnitude was out of spec and would have been burned on chain;
  they now use `18446744073709551615`, which is both far beyond 2^53 and the largest
  amount the spec permits.

- Documented in `lib/ordinals/README.md` that this OrdLock, while semantically the
  widely deployed ordinal-lock pattern (`hash256(destOutput ‖ payOutput ‖
  trailingOutputs) == hashOutputs` under `SIGHASH_ALL|ANYONECANPAY`, generalized to
  multiple payment outputs), is built on our `OP_PUSH_TX` core rather than compiled
  from the sCrypt `OrdinalLock` contract — so the bytes differ and listings are not
  interchangeable with that template.

### Breaking

`buildDeploy`/`buildMint`/`buildTransfer`/`buildDeployMint` now throw on amounts above
uint64, numeric amounts above `Number.MAX_SAFE_INTEGER`, non-string `sym`/`icon`, and an
`icon` that is not an outpoint. Each previously emitted a payload the network does not
honour.

`parseBsv20` returns `null` — and `isBsv20` `false` — for payloads that were previously
returned but are not valid: unknown operations, missing required fields, a `transfer`
naming both `tick` and `id`, `auth`/`deploy+auth` carrying `amt`, malformed `tick`/`id`,
out-of-range `dec`, and over-uint64 amounts.

`parseOrdLock` returns `null` for any script that is not byte-identical to a listing this
library would build. Callers relying on it to describe arbitrary scripts were being told
about listings that did not exist.

Suite 4502 → 4525.

## [7.2.0] - 2026-08-05

Extends the 7.0.1/7.0.2 silent-argument sweep into `lib/ordinals/`, which the earlier
pass did not cover, and fixes a parser bug found while checking the module against the
1Sat specification. Several calls that previously succeeded now throw; see **Breaking**
at the end of this section.

The unifying defect: an inscription is permanent, and every one of these paths committed
something other than what the caller asked for, with no error and a script that looked
correct afterwards.

### Fixed

- **`Ordinals.buildInscription` no longer inscribes an empty payload when `content` is
  omitted.** `toBuf(params.content)` mapped a missing value to a zero-length Buffer, so
  `buildInscription({ address, contentType })` returned a well-formed inscription script
  carrying nothing — `isInscription()` reported `true`, `createInscriptionOutput` wrapped
  it in a spendable 1-sat output, and the mistake was only visible after broadcast. This
  was reported from the field by a caller whose own builder names the field `data`:
  passing `data` produced a script **byte-identical** to omitting the content entirely.
  `content` is now required, and the error names the field that was passed instead when
  it is one of the obvious aliases (`data`, `body`, `payload`, `text`, `message`). An
  explicit `content: ''` still builds an empty payload, so a deliberate one remains
  expressible; only absence is rejected.

- **Non-string, non-Buffer content is rejected instead of stringified.** `String(v)`
  turned an object into the literal text `[object Object]`, an array into `1,2`, and
  `false` into `"false"` — permanently. Only strings and Buffers are accepted; callers
  encode their own values (`JSON.stringify`, `Buffer.from`). Content may still be
  *arbitrary binary under any MIME type* — that is unchanged and is the point of the
  format; what is gone is the guessing.

- **Buffer content now requires an explicit `contentType`.** It previously defaulted to
  `text/plain`, mislabelling binary — a PNG inscribed as text. Bytes carry no hint about
  what they are, so the caller must say. The `text/plain` default still applies to string
  content, where it is truthful. An empty or non-string `contentType` is also rejected
  rather than silently replaced by the default.

- **An empty base lock is rejected: it produced an anyone-can-spend ordinal.** With no
  base lock the script is just the inert envelope — `OP_FALSE OP_IF` skips to `OP_ENDIF`,
  so whatever the spender pushes is the final stack and *any* spender succeeds. The 1Sat
  specification is explicit that a locking script "cannot be omitted entirely". Callers
  legitimately building an envelope to append to their own script (as the OrdLock listing
  does for its inline inscription) pass `{ allowEmptyLock: true }`, matching the existing
  `{ allowNonEnforcing: true }` precedent. The regression test proves the unguarded script
  really is anyone-can-spend by satisfying it through the interpreter with `OP_1`.

- **Passing both `lock` and `address` throws instead of silently ignoring `address`.**
  They name different owners; resolving that by precedence meant a caller who supplied
  both got an ordinal owned by whichever one the implementation preferred.

- **`createInscriptionOutput` validates `satoshis`.** `Output` already rejected negatives
  and fractions, but `0` and the string `'1'` passed through — a 0-sat output carries no
  ordinal at all. It must now be a positive integer; the default of 1 is unchanged.

- **`parseInscription` recovers a locking script that follows the envelope.** The 1Sat
  spec allows the lock to be *prepended or appended* ("A locking script (typically P2PKH)
  is then prepended/appended to the inscription script, optionally separated by
  OP_CODESEPARATOR"), but the parser took only the chunks *before* the envelope as the
  lock and discarded everything after `OP_ENDIF`. For the appended form it therefore
  reported `lock` as an **empty script** while `isInscription` returned `true` — telling a
  wallet inspecting a third-party ordinal that an owned output had no locking script, the
  exact inverse of the guard above. `lock` is now the whole script minus the envelope, in
  script order. A separating `OP_CODESEPARATOR` is kept, because it genuinely runs and
  affects the sighash. The common prepended form is unchanged.

### Changed

- `bsv.d.ts`: `InscriptionParams.content` is now required rather than optional, so
  TypeScript callers get the original bug as a **compile error**; added `allowEmptyLock`;
  documented that `lock` and `address` are mutually exclusive and that `contentType` is
  required for Buffer content. Verified under `tsc --strict`.

### Breaking

Calls that previously returned a script and now throw: `content` omitted, `content` that
is not a string or Buffer, Buffer content without a `contentType`, an empty or non-string
`contentType`, an empty base lock without `allowEmptyLock`, `lock` and `address` together,
and a `satoshis` value that is not a positive integer. Each produced an inscription that
did not match the caller's intent, so code hitting one of these was already broken; the
change is that it now fails at build time rather than on chain.

`parseInscription(...).lock` now includes script chunks that follow the envelope. Code
that relied on the previous value for the appended form was reading an empty script.

Suite 4485 → 4502.

## [7.1.0] - 2026-07-17

Six security fixes from an audit of the crypto core. Four change verification
behaviour; see **Breaking** at the end of this section before upgrading.

### Fixed (security)

- **Strict DER parsing now actually enforces canonical INTEGERs.**
  `parseDER(buf, strict)` defaults `strict` to `true`, but strictness only ever
  checked the length byte — the integers themselves were never validated, so
  `fromDER`/`fromString` accepted excessively padded values (`02 21 00 <r>` where
  `r`'s high bit is clear), unpadded high-bit values (parsed unsigned, i.e. as a
  different number than DER says), and zero-length values. Each is a second
  encoding of the same signature, so a valid credential signature could be
  re-encoded into different bytes that still verify. This reaches application
  code: `LTP.Proof` verification, LTP and GDAF credential JWS verification, and
  `SmartVerify` all parse via `fromDER` on the default (strict) path. Strict now
  requires each INTEGER to be non-empty, high-bit-clear, and minimally padded.

  **Consensus behaviour is unchanged.** The non-strict path is untouched, and
  `fromTxFormat` — the only caller that passes `strict = false`, and the one that
  parses signatures off the chain — still accepts every non-canonical encoding it
  did before, as its own regression tests now assert. Script-level canonicality
  continues to be enforced by `isTxDER` under the interpreter's flags, matching
  bitcoind.

  **Breaking** for callers that hand non-canonical DER to `fromDER`/`fromString`
  and expect it to parse; they should pass `strict = false` explicitly (via
  `parseDER`) if they are parsing chain data.

- **`parseDER` reported `sneg` from the wrong byte.** `buf[2 + 2 + rlength + 2 + 2]`
  reads `sbuf[2]` rather than `sbuf[0]`, so the flag was wrong for any signature
  whose `s` carries a pad byte (the `r` case one line up reads `rbuf[0]`
  correctly). Latent — nothing internal consumes `sneg` — but it is part of the
  returned object and was therefore wrong for external callers.

- **LTP identifiers are now drawn from the CSPRNG instead of `Math.random()`.**
  `Right._generateUUID` and `Obligation._generateUUID` minted the `id` of signed
  W3C Verifiable Credentials from `Math.random()`. That id is covered by the
  credential's signature, is the primary key of the registry's registration and
  revocation maps, and is an input to proof material (`LTP.Proof` derives a
  witness from `sha256(nonce + token.id + predicate)`) — so it must be
  unpredictable, not merely distinct. V8 implements `Math.random` with
  xorshift128+, whose internal state is recoverable from a handful of outputs;
  each UUID consumed 31 sequential draws, so a single issued token id leaked
  enough state to predict every later id from that process, including ids issued
  to other subjects. With the engine PRNG frozen, the old generator emitted the
  fixed string `88888888-8888-4888-8888-888888888888`.

  `Registry._generateRegistryId`, `Registry._generateAuditId` and
  `Claim._generateBatchId` had the same defect via `Date.now() + Math.random()`
  (the surrounding `sha256` added no entropy).

  All five now route through a new `lib/util/id.js` (`uuid4`, `randomHex`) backed
  by `bsv.crypto.Random`, matching what `GDAF`'s attestation signer already did.
  **Output formats are unchanged** (`urn:uuid:` v4, `reg_` + 16 hex, `audit_` +
  12 hex, 16 hex), so stored identifiers and consumers are unaffected. The
  `// Non-security: identifier collision avoidance only` comments at these sites
  asserted the opposite of the truth and are gone.

- **`Registry._generateAuditId` widened from 48 to 128 bits.** Audit entries are
  minted per action and retained for years, and a collision silently overwrites a
  record in a `Map`-keyed store; at 48 bits a log passed a ~50% chance of a
  collision around 16M entries. The per-registry ids above stay at 64 bits — they
  are minted once each, so the birthday bound never comes into play.

  **Format change:** `audit_` + 32 hex characters, was `audit_` + 12. The ids are
  opaque and are not parsed anywhere in the package, and existing stored ids keep
  working as map keys.

- **`Signature.prototype.applySecurityPatches()` now rejects a non-canonical
  signature instead of silently rewriting it.** It replaced a high-S `s` with
  `n - s` under an "anti-malleability" comment. That cannot protect against
  malleability: ECDSA accepts `s` and `n - s` equally, so the rewritten signature
  verifies exactly as the original did, and the only effect was to hide from the
  caller that they had been handed a malleated signature. It now throws on
  `s > n/2` (alongside the existing zero and out-of-range checks) and no longer
  mutates. `toCanonical()` remains the way to deliberately normalize a signature,
  and is unchanged — it returns a new Signature and never mutates the original.

  The method had no callers anywhere in the package, and its docstring's claim
  that it is "called during crypto operations" was false; that claim is gone.

  **Breaking** for callers relying on it to normalize in place.

- **`ECDSA` no longer reuses a nonce when one instance signs twice.** `k` persisted
  on the instance across `sign()` calls (`set()` deliberately carried it, and
  `_findSignature` only derived a nonce when `!this.k`), so the documented
  build-an-instance-and-`set()` idiom signed a second message with the *same* `k`:

  ```js
  const e = ECDSA().set({ privkey })
  e.set({ hashbuf: h1 }).sign()   // k derived and cached
  e.set({ hashbuf: h2 }).sign()   // same k, same r
  ```

  Two signatures over different messages under one nonce reveal the private key by
  elementary algebra; this was verified with a repro that recovers the signer's WIF
  from the two signatures. `signRandomK()` was worse — it assigned `this.k`, so any
  later `sign()` on that instance silently reused the random nonce. `k` now carries
  a freshness bit: every assignment path (`ecdsa.k = ...`, `set({k})`, `randomK()`,
  `deterministicK()`) marks it fresh, and a signature consumes it, so the next
  `sign()` derives a new RFC 6979 nonce instead of reusing a spent one. No internal
  call site was affected — each constructs a fresh `ECDSA` per signature — so this
  changes no signature this library previously produced. Backward compatible: an
  explicitly supplied `k` is still honoured for one signature (RFC 6979 test
  vectors included), and signing the same message still yields the same signature.
  Inherited from upstream bsv.

- **`SmartVerify.smartVerify()` now rejects malleated (high-S) signatures instead
  of accepting them.** The function canonicalized `s` and then verified the
  *rewritten* signature — but ECDSA accepts `s` and `n-s` equally, so the
  canonicalization was a no-op that made every high-S signature return `true`. A
  caller using the hardened module as a low-S gate (its stated contract: "valid
  **and** canonical", its header: "malleability protection") received no protection
  while believing otherwise. It now returns `false` for `s > n/2`, matching the
  neighbouring `isCanonical()`. `canonicalize()` is unchanged — it is honestly
  named and still rewrites.

  **Breaking:** code relying on `smartVerify` to accept and silently normalize
  high-S signatures must canonicalize first (`SmartVerify.canonicalize(sig)`) or
  use `ECDSA.verify`, which is unchanged and still accepts either form. The test
  asserting the old behaviour ("accepts a malleated (high-S) signature as valid but
  canonicalizes it") encoded the bug as intent and has been inverted.

### Fixed

- **`npm test` now runs against an installed copy of the package.**
  `test/build/esm_wrapper.js` required `scripts/gen-esm-wrapper`, which is dev
  tooling and is not published. Since `.mocharc.json` globs `test/**/*.js`, that
  one unresolvable require aborted the whole run before a single test executed —
  so the suite the package deliberately ships was dead on arrival in the tarball.
  The two checks that regenerate and diff `index.mjs` can only run from a
  checkout and now skip when the generator is absent; the ESM import checks, which
  are the ones meaningful to a consumer, run everywhere. Verified by packing,
  installing and running the suite from the tarball: 4463 passing, 2 pending.

## [7.0.2] - 2026-07-16

### Fixed

A codebase-wide audit for the same silent-argument class as the 7.0.1
`Mnemonic.fromRandom` bug found three more confirmed foot-guns, each verified
with a repro and now gated by a regression test:

- **`HDPrivateKey.fromRandom(network)` silently ignored the network** and always
  returned a mainnet key. `fromRandom('testnet')` produced an `xprv` (livenet)
  instead of a `tprv` (testnet), with no error — so a testnet wallet was
  generated on mainnet. It now forwards the network to the constructor (which
  already routes it to random generation). `fromRandom()` default is unchanged.
- **`Base58Check.fromString` returned a plain `Base58`** (no checksum) instead of
  a `Base58Check`, so `Base58Check.encode(...)` → `fromString` → `toString`
  silently round-tripped to a *different, unchecksummed* string. It now returns a
  `Base58Check`.
- **Bitcore ECIES dropped its `opts` when called without `new`** — `ECIES({ noKey:
  true })` (the factory idiom used throughout the suite) silently ignored
  `noKey`/`shortTag`, changing the wire format (e.g. leaking the 33-byte sender
  pubkey). The no-`new` path now forwards `opts`. (The default `bsv.ECIES`
  electrum variant was already correct.)

## [7.0.1] - 2026-07-16

### Fixed (security)

- **`Mnemonic.fromRandom(wordlist, entropy)` no longer silently drops the entropy
  argument.** The method previously accepted only a single `wordlist` parameter,
  so the documented two-argument form `fromRandom(Words.ENGLISH, 256)` ignored the
  `256` and returned a **weak 12-word / 128-bit** phrase instead of the intended
  24-word / 256-bit one — with no error, and `fromRandom.length` reporting `0` so
  nothing signalled the mistake. `fromRandom` now accepts entropy in either
  argument position (a number is the entropy, an array is the wordlist), honours
  it, throws on invalid entropy (must be a multiple of 32 and ≥ 128), and reports
  an arity of `2`. Backward compatible: `fromRandom()`, `fromRandom(wordlist)`,
  and `fromRandom(256)` are unchanged. Types updated with both overloads.

## [7.0.0] - 2026-07-16

Breaking major. Small and mechanical to adopt — see
[`docs/MIGRATION_7.md`](docs/MIGRATION_7.md) for the full migration guide.

### BREAKING

- **`ECDSA.prototype.verify()` now returns a strict `boolean`** instead of the
  ECDSA instance. This removes the truthy-instance trap where
  `if (ecdsa.verify())` silently accepted forged signatures. The result is still
  mirrored on `this.verified`, so only the chained `.verify().verified` idiom is
  gone — replace it with `ecdsa.verify()`. The static `ECDSA.verify(...)`,
  `Message.verify()`, and `verifyBool()` are unchanged. A security-contract test
  now locks the trap **closed** (a forgery must make `verify()` return `false`).
- **`package.json` now declares an `exports` map.** The main entry, `package.json`,
  `./version`, all shipped bundles, and `lib/*` files (with or without `.js`)
  resolve as before, and `import bsv from '@smartledger/bsv'` now works directly.
  Directory-style deep imports without an explicit file (e.g.
  `require('@smartledger/bsv/lib/smart_contract')`) are no longer auto-resolved —
  use the main entry or point at the file. CDN usage is unaffected.

### Added

- **Real dual ESM entry.** The package ships `index.mjs` behind the `import`
  condition, so `import { PrivateKey, Transaction } from '@smartledger/bsv'`
  (named) and `import bsv from '@smartledger/bsv'` (default) both work natively.
  `index.mjs` is generated from the CJS build's runtime surface (108 named
  exports) by `scripts/gen-esm-wrapper.js` on every `npm version`; deprecated
  accessors like `SmartUTXO` are excluded from the named exports (so importing
  emits no deprecation warning) but stay reachable via the default export.
- `test/build/exports_resolution.js` and `test/build/esm_wrapper.js` — guards for
  the supported import surface (main, `package.json`, `./version`, bundles,
  `lib/*` both extension styles, the ESM `import` condition, and ESM-wrapper
  drift).
- Adversarial `#verify` tests asserting `verify()` returns a strict boolean and
  rejects a forgery.

## [6.2.2] - 2026-07-15

### Fixed

- **`SmartContract.Preimage` now fails with an honest error on a too-short
  buffer.** Previously a preimage shorter than the fixed BIP-143 fields threw a
  misleading `"Invalid 8-byte CompactSize encoding"` (and emitted `console.warn`
  noise) because extraction ran past the buffer before any length check. Construction
  now throws `"Preimage too short: N bytes (BIP-143 preimage requires at least 157)"`,
  and `decodeCompactSize` rejects out-of-range reads, truncated 2/4-byte prefixes,
  and the invalid 8-byte (`0xff`) length prefix with clear messages instead of
  salvaging garbage. `validate()`'s minimum was also corrected from the mislabeled
  104 (left fixed zone only) to the true structural minimum of 157.

### Added

- `test/smart_contract/preimage.js` — first direct test coverage for the public
  `SmartContract.Preimage` class (length guard, CompactSize edge cases, and a real
  preimage round-trip).

### Changed (dev toolchain only — no runtime/API/bundle change)

- Removed the now-unused **webpack** devDependencies (`webpack`, `webpack-cli`,
  `terser-webpack-plugin`, `brfs`) left over from the esbuild migration. `events`
  — which `stream-browserify` requires but does not declare, and which had been
  supplied transitively by webpack — is now an explicit devDependency so the
  browser build no longer depends on dependency hoisting. Bundles rebuild
  byte-identical; the published package is unchanged.

## [6.2.1] - 2026-07-15

Bundle hygiene. No runtime/API change.

### Changed

- **Bundles no longer embed the full `package.json`.** `bsv.version` and
  `SmartContract.version` now read a generated `version.js` (a one-line
  `module.exports = '<version>'`) instead of `require('./package.json')`, so the
  browser bundles no longer carry ~4 KB of dev metadata (devDependencies,
  scripts, keywords). The full and smart-contract bundles shrink accordingly
  (e.g. `bsv.min.js` −5.8 KB) with byte-identical, reproducible output.

### Added

- `scripts/sync-version.js` regenerates `version.js` from `package.json.version`
  on every `npm version` bump; `test/build/version_sync.js` gates the two from
  drifting.

## [6.2.0] - 2026-07-14

Build modernization: the browser bundles are now built with **esbuild** (webpack
removed). No runtime/API change; the bundles are functionally equivalent (and two are
fixed — see below).

### Security / docs (audit-readiness)

- **Test-backed threat model** (`docs/THREAT_MODEL.md`): states each security property, its
  trust assumptions, and the adversarial test that enforces it (fail-closed verification,
  covenant/marketplace enforcement, credential C1–C4 binding, revocation-bypass closure, SPV
  inclusion, Shamir non-leak, type honesty). `test/security/threat_model_coverage.js` asserts
  every test the model cites exists, so it can't drift. Honest "known limitations" section
  (unaudited inherited core, the residual `ECDSA.verify()` footgun, no difficulty-retarget
  validation, provenance pending).
- **`SECURITY.md` refreshed** to 6.x — corrected the stale supported-versions table (was 4.x),
  documented the 6.0.0 fail-open hardening + the residual `verify()` trap, updated build tooling
  and disclosure history.

### Build — webpack → esbuild (cutover complete)

- **All 16 browser bundles are now built with esbuild** (`build/esbuild.js`; `npm run
  build-all`). The 16 webpack configs + `webpack.base.js` are removed. One config-driven
  builder replicates the two webpack polyfill modes (`full` browserify shims so the browser
  Shamir CSPRNG works; `stub` externalised built-ins) and externalises the bsv root to the
  global `bsv` for the feature bundles. Every bundle is UMD (browser global **and**
  `require()`/AMD). The build needs **no `--openssl-legacy-provider`** and is **byte-identical
  across Node 20 and 22** (the bundle-parity gate stays reliable).
- Validated: **20/20 Chrome browser-smoke** on `bsv.min.js`, plus an isolated per-bundle load
  smoke asserting all 16 shipped bundles load and expose an API.
- **Fixed: `bsv-covenant.min.js` / `bsv-smartcontract.min.js` shrank from ~900 KB to
  ~30–290 KB.** The old webpack `externals` key never matched the real `require('../..')`, so
  those two wrongly embedded the whole library (yet still referenced the global, so they were
  broken standalone). They are now correctly externalised — load `bsv.min.js` first, as
  intended. All other bundles are functionally equivalent (bytes differ: esbuild vs webpack
  minification).

## [6.1.2] - 2026-07-13

First release published tokenlessly via **npm OIDC Trusted Publishing** with automatic
provenance. No runtime/API change — CI/release hardening.

### CI / release

- **Release publishing is now tokenless via npm OIDC Trusted Publishing.** The release
  workflow no longer uses an `NPM_TOKEN` secret — the GitHub Actions OIDC identity
  (`id-token: write`) is exchanged for a short-lived publish token at release time and
  provenance is automatic. (npm removed classic/automation tokens in Nov 2025; trusted
  publishing is the modern replacement.) Requires a one-time trusted-publisher registration
  on npmjs.com and npm ≥ 11.5.1 (the workflow installs it). See `RELEASING.md`.

### CI / quality (no runtime change)

- **Lint ratchet** (`scripts/lint-ratchet.js`, `.lint-baseline.json`): the whole repo is now
  gated on `standard` without the big one-shot cleanup. The baseline grandfathers the existing
  10,190 legacy violations (per-file counts, so moving code within a file doesn't trip it); CI
  **fails on any file that gains a new violation**, and the baseline can only shrink (`npm run
  lint:ratchet:update` after cleaning a file). Replaces the previously-advisory repo-wide lint.

## [6.1.1] - 2026-07-13

First release published from CI with **npm provenance**. No runtime/API change —
type corrections + release/CI hardening.

### CI / release

- **Automated releases with npm provenance** (`.github/workflows/release.yml`, `RELEASING.md`).
  Pushing a `vX.Y.Z` tag now gates the tag (version match, full suite, scoped lint, bundle-parity)
  and publishes from GitHub Actions with `--provenance` via OIDC — npmjs.com gets a verifiable
  link proving the tarball was built from that commit ("published == audited source"). Replaces
  the manual publish flow; idempotent (no-op if the version is already published). Requires a
  one-time `NPM_TOKEN` Actions secret (npm Automation token). Tidied `repository.url` to the
  canonical `git+https://…​.git` form provenance expects.

### Fixed — types

- **`bsv.d.ts` no longer declares phantom APIs.** A new mechanical type-drift gate
  (`test/types/dts_drift.js`, TypeScript AST vs. runtime) found six declarations for symbols
  the runtime doesn't expose; all corrected: removed `Unit`,
  `Script.buildWitnessMultisigOutFromScript`, and the top-level `splitSecret`/
  `reconstructSecret`/`validateShare` (Shamir lives at `bsv.Shamir.split`/`.combine`/
  `.verifyShare`); replaced the non-existent `crypto.EllipticFixed.ec` with its real members.

### CI / quality (no runtime change)

- Added the **type-drift gate** to the (blocking) suite: every declared class/function/const
  must exist at runtime, and every runtime function on `Ordinals` / `Ordinals.BSV20` / `SPV`
  must be declared — so the curated `bsv.d.ts` can't drift from the code again.
- `typescript` is now a pinned devDependency (was installed ad-hoc in CI); the scoped
  blocking lint covers `test/types`.

## [6.1.0] - 2026-07-13

### Changed — build toolchain (no source/API change)

- **Dropped the `--openssl-legacy-provider` requirement and the Node 18 build pin.** The
  webpack build hashed module/chunk content with md4 (via Node's OpenSSL), which OpenSSL 3
  disables on Node 17+ — the sole reason the build needed the legacy-OpenSSL flag and a
  pinned Node 18. It now uses webpack's built-in `xxhash64` (`build/webpack.base.js`), so
  `npm run build-all` runs natively on modern Node with **no flag**. The build + publish +
  CI bundle-integrity job now run on Node 20, and the output is byte-identical across Node
  20 and 22. All shipped bundles are regenerated by this change (functionally identical
  code; different internal module hashing). No library/runtime behavior changes.

## [6.0.2] - 2026-07-13

### Changed

- **Requires Node.js >= 20.19** (added `engines`). The audited crypto dependency
  `@noble/curves@2` is ESM-only; `require()`-ing it needs unflagged `require(ESM)`, which
  landed in Node 20.19 / 22. Node 18 is EOL (2025-04) and the CJS entry never loaded there
  (`ERR_REQUIRE_ESM`) — this makes the real requirement explicit instead of failing at load.

### CI / quality (no runtime change)

- The **mocha suite now gates merges** (was advisory). CI matrix is Node 20 + 22.
- Added `test/security/fail_closed_contracts.js` — mechanically asserts every security-critical
  verification rejects a forged/invalid input as a strict boolean or a throw (never a truthy
  object), guarding against the fail-open class fixed in 6.0.0.
- A **blocking scoped lint** now gates the audited/consensus-critical modules (ordinals, spv,
  pushtx, token); repo-wide `standard` stays advisory against the legacy baseline.
- Fixed the stale `3.4.x` version header in `bsv.d.ts`.

## [6.0.1] - 2026-07-12

Patch release — fixes from a code review of the v6.0.0 ordinals module. No API
removals; all additive/validation changes.

### Fixed

- **`Ordinals.buildListingTx` signed the ordinal input with the wrong amount.** It resolved
  the input value (defaulting `ordinal.satoshis` to 1) but signed with the raw, possibly-
  undefined `ordinal.satoshis`, so omitting the documented-optional field produced a
  signature over amount 0 that fails on-chain. It now signs with the resolved value.
- **`Ordinals.parseOrdLock` / `isOrdLock` always returned livenet addresses.** They now
  accept `{ network }` so `seller.address` and `payOutputs[].address` can be formatted for
  testnet (the pubKeyHash / scripts were always exact; only the display strings were wrong).
- **`Ordinals.BSV20` builders emitted non-canonical amounts.** Integer strings with leading
  zeros (`"007"`) are now canonicalized (`"7"`) so indexers expecting canonical decimals
  accept them; arbitrary precision is preserved.

### Changed

- `Ordinals.payOutputFor` no longer silently ignores `price` when handed a `Transaction.Output`
  (it now requires an address/pubkey/key + integer price); pass a pre-built output via the
  `payOutputs`/`payTo` specs instead.
- Satoshi amounts are validated (non-negative integers) in `buildListingTx` / `buildPurchaseTx`
  and at signing time, so a missing/NaN `satoshis` fails fast instead of yielding an invalid
  signature. `purchase()` accepts a pre-computed `parsed` to avoid re-parsing the listing.

## [6.0.0] - 2026-07-12

Major release. Combines a security-hardening pass (four CRITICAL forgery-enabling
verification bugs, a revocation bypass, and several covenant defects — all fixed) with
two large new capabilities: a complete **1Sat Ordinals** stack (inscriptions, the
OrdLock marketplace, and BSV-20 / BSV-21 fungible tokens) and **trustless SPV**
(Merkle-inclusion + header-chain confirmations). **Contains breaking changes** (see
below). The suite grew to 4365 tests; each security fix ships an adversarial regression
that asserts the *bad* input is rejected, and every emitted covenant/inscription script
is interpreter-verified. A CI gate enforces that shipped bundles are a reproducible
build of `lib/`.

### Security — Fixed

- **CRITICAL: forgeable signatures via the `ECDSA.verify()` trap.** `ECDSA.prototype.verify()`
  returns the ECDSA *instance* (always truthy) with the real result on `.verified`.
  Three call sites treated the truthy return as a boolean and one skipped the check
  entirely, so a forged signature verified as valid:
  - `lib/ltp/proof.js` and `lib/gdaf/did-resolver.js` (`verifyOwnership`) now read `.verified`.
  - `lib/ltp/right.js` / `lib/ltp/obligation.js` `_verifyTokenSignature` (was a `// TODO`)
    now verifies the JWS, **bound to the issuer DID's key** (not the attacker-controlled
    `proof.verificationMethod`), and fails closed.
  - Added `ECDSA.prototype.verifyBool()` and a warning on `verify()`.
- **CRITICAL: `SmartLedgerAnchor.verifyAnchor` was a stub** returning `{verified:true}`
  for any txid. Now fails closed (throws) unless an injected `chainProvider` performs a
  real inclusion + OP_RETURN-commitment check.
- **HIGH: StatusList2021 revocation bypass.** `getCredentialStatusEntry` / `updateStatusList`
  read the revocation bitstring from an **unverified** JWT — a substituted/forged list could
  un-revoke a credential. They now verify the list-JWT signature against a **pinned issuer**
  before reading any bit, and cap gzip inflation (gzip-bomb DoS).
- **HIGH: `prepareRightTokenTransfer` did not bind the signer to the current owner** — anyone
  could mint a "valid" transfer of a token they don't own. Now bound to `credentialSubject.id`.
- **MEDIUM: Shamir checksum leaked a hash of the secret** in every share (offline brute-force of
  low-entropy secrets by a single, sub-threshold holder). The per-share checksum is now **off by
  default** (opt-in via `{checksum:true}`).
- **MEDIUM: `vcjwt.verifyVcJwt`** — tokens without an `exp` never expired; added opt-in
  `requireExpiration`.
- **MEDIUM: `LTP.Anchor.verifyTokenAnchor`** trusted caller-supplied `txData` with no chain
  proof; result now carries `chainVerified:false` and the doc states it is commitment-match only.

### Fixed — Covenants (consensus-relevant)

- **Inverted `OP_SPLIT`/`OP_DROP` field extraction** in `covenant_builder.js` and the
  reference ASM in `preimage.js`. After `OP_SPLIT` the right part is on top, so keeping it
  needs `OP_NIP`; the code used `OP_DROP`, extracting the wrong bytes for RIGHT-strategy fields
  (`value`, `nSequence`, `hashOutputs`, `nLocktime`, `sighashType`). Proven at the interpreter
  level and fixed; added `nip()`.
- **`SmartContract.Covenant` built a non-enforcing "covenant"** (reduces to P2PK; bound nothing
  about the spend) while claiming "production-ready … BIP-143 validation." `createFromP2PKH`
  now throws unless constructed with `{allowNonEnforcing:true}`, and the docs redirect to the
  real OP_PUSH_TX primitives.
- **Shamir RNG could hang forever** on a degenerate/stubbed CSPRNG (all-zero draws); the re-draw
  loop is now bounded and throws instead.

### Added

- **Ordinal-safe transfers.** `SmartContract.Token.transferOrdinal` / `SmartContract.ordinalLock`
  recreate a 1-sat ordinal among funding outputs (fee paid from funding, satoshi preserved), with
  an anti-burn guard; the single-output `unlockTransfer` now refuses a 1-sat UTXO.
- **Configurable SIGHASH covenant core.** `PushTx.pushTxCore(script, {sighashType})`,
  `assertSighashType`, and `grind({sighashType})` enable `SIGHASH_SINGLE|ANYONECANPAY` marketplace
  covenants (seller signs its own input+output; buyer adds funding). Default remains SIGHASH_ALL.
- **CI bundle-parity gate** (`.github/workflows/ci.yml`): fails if the shipped `*.min.js`/
  `*.bundle.js` are not a reproducible build of `lib/`. Added `.nvmrc` (Node 18) for reproducibility.
- **1Sat Ordinals module** (`bsv.Ordinals`). `buildInscription`/`parseInscription`/`isInscription`
  build and round-trip the `OP_FALSE OP_IF "ord" … OP_ENDIF` inscription envelope on a P2PKH (or
  custom) base lock; `createInscriptionOutput`/`batchInscriptionOutputs` mint the 1-sat output(s).
- **OrdLock marketplace covenant** (`bsv.Ordinals.buildOrdLock`/`listInscriptionOutput`/
  `purchaseOrdLock`/`cancelOrdLock`). A trustless "pay the seller or cancel" listing built on the
  configurable-SIGHASH OP_PUSH_TX core (`SIGHASH_ALL|ANYONECANPAY|FORKID`, new
  `PushTx.SIGHASH_ALL_ANYONECANPAY_FORKID`): the buyer supplies the surrounding outputs and the
  covenant binds the required payment output(s) byte-for-byte into the committed `hashOutputs`,
  while the seller keeps an ECDSA cancel path.
  - **Multi-output payments**: a listing can pin a seller payment plus royalty and marketplace-fee
    outputs (`payOutputs` / `royalties`), so a purchase atomically pays every party or fails.
  - **Self-describing listings**: `parseOrdLock(script)` / `isOrdLock(script)` recover the seller,
    the pinned payment(s), the total price, and any inline inscription — an indexer/wallet/UI can
    read a listing straight off-chain.
  - **End-to-end assembly** covers the whole lifecycle: `buildListingTx({ordinal, seller, price,
    royalties, funding, fee})` moves a P2PKH ordinal into a listing (sat preserved into output 0),
    and `buildPurchaseTx({listing, ordinalDestination, funding, fee})` reads the required payment(s)
    off the listing script and returns a complete, signed purchase — the covenant input grinds the
    OP_PUSH_TX signature and the P2PKH funding inputs are signed over the finalized tx.
  Every emitted script (covenant + funding + ordinal inputs) is interpreter-verified across the
  full list → buy / cancel lifecycle, including adversarial spends (underpay seller/royalty,
  redirect fee, wrong-key cancel, tamper-after-build) asserted to be rejected. Typed in `bsv.d.ts`
  (`namespace Ordinals`); documented in `lib/ordinals/README.md`.
- **BSV-20 / BSV-21 fungible-token inscriptions** (`bsv.Ordinals.BSV20`). Build and parse the
  `application/bsv-20` JSON payloads carried on 1-sat outputs: v1 ticker tokens
  (`buildDeploy`/`buildMint`/`buildTransfer`), v2 / BSV-21 id-based supplies
  (`buildDeployMint`, transfer by `id`), `create*Output` 1-sat outputs, and
  `parseBsv20`/`isBsv20` (accepting a script, JSON string, or object). Amounts are integer
  strings — never coerced to JS numbers, so supplies beyond 2^53 stay exact. Builders validate
  their inputs (ticker ≤ 4 UTF-8 bytes, non-negative integer `amt`/`max`/`lim`, `dec` 0–18,
  well-formed BSV-21 `id`). Typed in `bsv.d.ts` (`namespace Ordinals.BSV20`).
- **Trustless SPV** (`bsv.SPV`). `verifyMerkleProof` / `merkleRootFromBranch` / `verifyTxInclusion`
  verify a transaction's inclusion in a proof-of-work-backed block from a Merkle branch
  (double-SHA256, internal-LE byte order, TSC `*` odd-node duplication), and `verifyHeaderChain`
  checks header linkage + per-header proof-of-work against an optional trusted checkpoint. Wired
  into GDAF's `SmartLedgerAnchor.verifyAnchor`: a new trustless path
  (`{ spvProof:{index,nodes}, header|headerChain, rawTx }`) proves inclusion + PoW, binds the raw
  tx to the txid, and checks an OP_RETURN commits to the expected hash — replacing the
  trust-the-provider stub. Typed in `bsv.d.ts`.

### Changed — BREAKING

- `statuslist.getCredentialStatusEntry` is now **async** and both status functions **require**
  `expectedIssuerDid` plus a key source (`didResolver` / `issuerJwks` / `issuerPublicJwk`). The CLI
  `status set`/`check` resolve the issuer key from the key file automatically.
- `SmartContract.Covenant.createFromP2PKH` **throws** unless the instance is constructed with
  `{allowNonEnforcing:true}`.
- Shamir `split()` no longer embeds a secret checksum by default (pass `{checksum:true}` to restore).

## [5.5.2] - 2026-06-28

Docs-only patch. No API or behavior changes — the only difference in any
shipped `.js` bundle is the embedded version string (`5.5.1` → `5.5.2`,
read from `package.json`); the executable code is identical to 5.5.1.

### Fixed

- **CDN URLs in README/docs now point at the current version.** The 5.5.0/5.5.1
  releases bumped `package.json` but left the README and `docs/` examples
  pinned to `@smartledger/bsv@5.4.0`, which served stale bundle code to
  unpkg/jsDelivr consumers. All pins are now `@5.5.2`.

### Added

- **`scripts/sync-cdn-urls.js` + `version` lifecycle hook.** `npm version` now
  rewrites every `@smartledger/bsv@X.Y.Z/` CDN pin in the README and `docs/`
  to the freshly bumped version and stages the edits into the version commit,
  so the docs can no longer drift behind `package.json`. Also runnable by hand
  via `npm run sync-cdn`.

## [5.5.1] - 2026-06-25

Patch release. Credibility/transparency cleanup — no API or behavior changes.

### Changed

- **Tests now ship in the published tarball.** `test/` and `.mocharc.json` are
  added to `package.json` `files`, so a consumer can independently run the suite
  (`npm test`, with mocha/chai installed) instead of taking "4267 passing" on
  faith.
- **`SmartContract.version` tracks the package version** (read from
  `package.json`) instead of a hardcoded `'v1.0.0'` that had drifted from the
  5.x package.
- **Dropped the `PRODUCTION_READY` feature flag** — it asserted a claim rather
  than describing a capability.
- **Softened an unverifiable comment** in `covenant_helpers.js` ("covenants
  verified here have been deployed and spent on BSV mainnet") to an accurate
  statement: the local verify flags mirror mainnet relay/consensus policy, so a
  covenant that passes is expected to be accepted on broadcast.

## [5.5.0] - 2026-06-25

Minor release. Closes a front-running theft flaw in the ownership-token covenant
and generalizes the covenant core into a pluggable, multi-output state machine.

### Security

- **`SmartContract.Token` ownership is now ECDSA-authorized.** The previous design
  gated a transfer on revealing `ownerSecret` with `SHA256(ownerSecret) ==
  ownerHash` — a hash-lock. The secret was exposed in the mempool on the first
  spend and the spender freely chose the next owner, so a watcher could lift the
  revealed secret and broadcast a competing spend redirecting the token to
  themselves. Ownership is now a key: state is `HASH160(ownerPubKey)` and a
  transfer requires the current owner's signature over the spend
  (`OP_CHECKSIGVERIFY`), which commits via `SIGHASH_ALL` `hashOutputs` to the
  exact recreated output — so altering the destination invalidates the proof.

### Added

- **Pluggable ownership — `SmartContract.Authorizers`.** Token ownership is always
  a 20-byte commitment, so the transfer plumbing is identical across schemes:
  - `singleKey()` — signature over the spend (the model above).
  - `multisig(m, n)` — m-of-n group ownership; the key set is committed by hashing
    the canonical redeem script, revealed at spend, bound to the commitment, and
    checked with `OP_CHECKMULTISIG`.
  - `predicate({ commit, emit, unlockArgs })` — escape hatch for custom schemes.
- **Multi-output (N-output) tokens** — `Token.ownershipTokenMulti` /
  `unlockTransferMulti` let the recreated token output sit among other outputs
  (payments, change, data); the spender reveals the surrounding output bytes and
  the covenant binds them into the committed `hashOutputs`.
- **`PushTx.grind` configurable nonce** — `{ field: 'nLockTime' | 'sequence' }`,
  so a covenant pinning `nLockTime` for a CLTV timelock can grind the input
  sequence instead. `PushTx.assertSighashAll()` guard added to token/PELS scripts.

### Changed (breaking, `SmartContract.Token` only)

- `Token.ownershipToken(fee, owner)` — `owner` is now `HASH160(pubkey)` (use
  `Token.ownerId(key)`), not `SHA256(secret)`.
- `Token.unlockTransfer(signer, newOwnerHash, spend, satoshis, lockingScript[, opts])`
  — now takes the owner key and the spend (it grinds and signs), not a precomputed
  preimage. The rest of the package's API is unchanged and fully compatible.

### Notes

- Full suite **4267 passing**; `lib/` and `test/` lint clean.

## [5.4.2] - 2026-06-25

Patch release. Dependency security maintenance — no API or behavior changes.

### Security

- **`bn.js` `4.11.9` → `4.12.3`** — picks up the backported 4.x patch for
  GHSA-378v-28hj-76wf (infinite loop via hardened hex parsing). This is the
  only runtime-dependency change; the public `BN` API is unchanged. After the
  bump, `npm audit --omit=dev` reports **0 vulnerabilities** in the runtime
  tree.

### Changed

- **`mocha` `^8.4.0` → `^11.7.6`** and **`nyc` `^14.1.1` → `^18.0.0`**
  (dev-only). Clears the high-severity dev advisories with real upstream fixes
  (cross-spawn / spawn-wrap ReDoS, the old `serialize-javascript` RCE, `nanoid`,
  `uuid`). Full suite still **4256 passing**; `nyc` coverage verified.

### Notes

- The remaining `npm audit` findings are all development-only and never reach
  installers (the published tarball ships no `node_modules`; none are listed
  under `dependencies`). They are either upstream-blocked (`mocha`/`nyc` are at
  their latest releases but still range-pin affected transitives) or await the
  deferred `standard@17` lint migration. See `SECURITY.md` for the full scope.

## [5.4.1] - 2026-06-25

Patch release. Repairs Legal Token Protocol (LTP) right-token creation,
signing, transfer, obligation and verification, which all threw on use.

### Fixed

- **LTP right-token signing was completely broken.** `lib/ltp/right.js`
  defined `_signToken` twice; the duplicate object-literal key shadowed the
  working signer and referenced an undefined `hash`, so every
  `prepareRightToken` / transfer / reissue / obligation signing failed with
  "hash is not defined". The detached-JWS builder is now `_createJWS(hash,
  signature)`.
- **`LTP#createRightToken` called non-existent entrypoints** (`LTPRight.create`
  and `LTPProof.createSignature`). Added a build-only `RightToken.create(...)`
  (reused by `prepareRightToken`) and signing now goes through the repaired
  `RightToken._signToken`.
- **`LTP#verifyToken`, `transferRight`, `createObligation`,
  `createSelectiveDisclosure` and `createLegalValidityProof` all threw** — each
  called a non-existent `LTPProof`/`LTPRight` method (the same `prepare*` vs
  `create*` naming mismatch). They now call the real `prepare*` entrypoints.
- **Added `RightToken.verifyToken(token, publicKey)`** — a real public-key
  ECDSA verifier for tokens signed by `_signToken` (recomputes the canonical
  hash, confirms `tokenHash` integrity, then verifies the signature embedded in
  the detached JWS). `LTP#verifyToken` routes through it, so the pre-transfer
  ownership check is now a genuine signature check.

### Tests

- Adds `test/ltp/right.js` covering right-token creation, signing,
  verification (valid / wrong-key / tampered), transfer (incl. non-transferable
  rejection), obligation creation, selective disclosure and legal-validity
  proofs. Full suite: 4256 passing.

## [5.4.0] - 2026-06-15

### Changed

- **`elliptic` removed from the browser bundles (~120–140KB smaller each).**
  The bundles still pulled `elliptic` transitively through `crypto-browserify`'s
  `browserify-sign` + `create-ecdh` (for `crypto.createSign`/`createECDH` — APIs
  bsv never calls; its EC crypto is `@noble`). Those are now stubbed out in the
  webpack config, so no `elliptic` code ships in any bundle. e.g. `bsv.min.js`
  1271KB → 1149KB, `bsv-didweb`/`bsv-vcjwt`/`bsv-anchor` ~−138KB; published
  tarball 12.2MB → 10.9MB. `randomBytes`/`createHash`/`createHmac` (the Shamir
  CSPRNG and hashing) are unaffected. Verified by the headless-Chrome browser
  smoke test (this was only safe once the secrets.js AMD/crypto fix in 5.3.1 made
  the polyfill chain robust).

## [5.3.1] - 2026-06-15

Patch release. Fixes browser-side Shamir secret sharing, which was broken in the
bundles since 5.1.0, and adds a real-browser CI gate so it can't regress again.

### Fixed

- **Shamir secret sharing was broken in the browser bundles** (regressed in the
  webpack 4→5 migration, 5.1.0). `secrets.js-grempe` is a UMD whose AMD branch
  calls its factory **without** the `crypto` argument; webpack 5 provides
  `define.amd`, so the bundle took that branch and `secrets.js` received
  `crypto === undefined` — its CSPRNG init threw "Initialization failed" and
  every `bsv.Shamir.split`/`combine` failed in browsers (Node was unaffected).
  Fixed by disabling AMD parsing for `secrets.js-grempe` in the webpack config,
  forcing the CommonJS branch (`factory(require('crypto'))`). All bundles
  regenerated.
- **`tests/browser-smoke-test.html`** "preserves leading zero bytes" check used
  a bare `Buffer` global (absent in browsers); now uses `bsv.deps.Buffer`.

### Added

- **CI gate: headless-Chrome browser smoke test.** `npm run test:browser:ci`
  runs `tests/browser-smoke-test.html` in real headless Chrome and now runs in
  the Build job. This is the regression gate for browser-only paths (like the
  Shamir CSPRNG) that the Node suite cannot exercise — and which let this
  regression ship undetected across 5.1.0–5.3.0.

## [5.3.0] - 2026-06-15

Completes the migration of **all** of bsv's secp256k1 cryptography to the
audited `@noble` suite and removes the `elliptic` dependency. No change to the
documented public API or to signatures/keys/addresses (byte-identical).

### Changed

- **EC point math migrated from `elliptic` to the audited `@noble/curves`.**
  `lib/crypto/point.js` — the single seam all secp256k1 point operations flow
  through — is now backed by `@noble/curves`, so the entire signing/keys stack
  (`ECDSA` sign/verify/recovery, public-key derivation, HD keys, message
  signing) runs on audited, constant-time curve code. The `Point` API
  (`mul`/`add`/`mulAdd`/`getX`/`getY`/`.x`/`.y`/`eq`/`isInfinity`/`validate` and
  the `getG`/`getN`/`fromX`/`fromBuffer` statics) is unchanged, so `ecdsa.js`
  and all consumers are untouched.
  - **No API or behavioral change.** Verified by the full existing test suite
    (4241 tests — ECDSA known-answer vectors, address/HD-key/transaction/message
    vectors all pass unchanged), so signatures, keys and addresses are
    byte-identical to prior versions. Scalar multiplication uses @noble's
    *constant-time* `multiply` (important for the secret signing nonce).
- **`lib/crypto/elliptic-fixed.js` (`bsv.EllipticFixed`) migrated to
  `@noble/curves`.** Its hardened sign/verify/recover surface
  (`keyFromPrivate`, `sign` → `{r, s, recoveryParam}`, `verify`,
  `recoverPubKey`, `curve.n`) is unchanged and still produces low-S canonical
  signatures with a consistent `recoveryParam`. `bsv.SmartVerify` already ran on
  `@noble` (via `Point`/`ECDSA`).
- **`elliptic` removed as a dependency.** With both `point.js` and
  `elliptic-fixed.js` on `@noble`, no source code imports `elliptic` anymore and
  it has been removed from `package.json`. **All of bsv's secp256k1
  cryptography now runs on the audited `@noble` suite.** `bn.js` remains (it is
  the codebase's general-purpose bignum, used well beyond crypto).

### Removed

- **`bsv.deps.elliptic`** is no longer exposed (the `elliptic` passthrough on the
  internal `deps` object). The documented public API (`bsv.PrivateKey`,
  `bsv.Transaction`, `bsv.crypto.*`, …) is unaffected; only code reaching into
  `bsv.deps.elliptic` directly is impacted.

### Notes

- The standalone module bundles that don't embed the browser `crypto` polyfill
  shrink (e.g. `bsv-smartcontract.min.js` / `bsv-covenant.min.js` ~939KB →
  ~873KB). The full bundles are unchanged for now: they still pull `elliptic`
  transitively through `crypto-browserify` (the browser CSPRNG polyfill, a
  devDependency) for `createSign`/`createECDH` — APIs bsv never calls. Trimming
  that from the browser build (so the full bundles shrink too) is a follow-up.

## [5.2.0] - 2026-06-15

First migration of bsv's cryptography to the audited `@noble` suite (ECIES).
No API or wire-format change.

### Changed

- **ECIES crypto primitives migrated to the audited `@noble` suite.** Both ECIES
  variants — the default Electrum BIE1 (`bsv.ECIES`) and the legacy Bitcore
  ECIES (`bsv.ECIES.bitcoreECIES`) — now use `@noble/curves` (secp256k1 ECDH),
  `@noble/hashes` (SHA-512/SHA-256/HMAC) and `@noble/ciphers` (AES-CBC) instead
  of `elliptic` + `aes-js` for their cryptographic operations. The `@noble`
  libraries are audited, constant-time and dependency-free.
  - **No API or wire-format change.** Ciphertexts are byte-identical to prior
    versions and interoperate in both directions — locked by the existing golden
    known-answer vectors in `test/ecies/{bitcore,electrum}-ecies.js`, which now
    run against the `@noble` implementation.
  - This is the first piece of bsv's crypto to move to `@noble`; `elliptic`/
    `bn.js` remain for signing/keys (a future migration). Enabled by the
    webpack 5 build (5.1.0), which — unlike webpack 4 — can bundle `@noble`'s
    BigInt-based code.
  - `@noble/curves`, `@noble/hashes`, `@noble/ciphers` added as (pinned)
    dependencies. `bsv-ecies.min.js` grows ~76KB → ~79KB.

## [5.1.0] - 2026-06-15

Build-tooling modernization. **No source or API changes** — the published
JavaScript API and all bundle formats/globals are identical to 5.0.1. This is a
foundational release that unblocks migrating bsv's cryptography to the audited,
BigInt-based `@noble` suite (webpack 4 cannot parse BigInt; webpack 5 can).

### Changed

- **Bundler migrated from webpack 4 to webpack 5** (`webpack` 4.29 → 5.107,
  `webpack-cli` 5). All 13 build configs were ported to a shared
  `build/webpack.base.js`:
  - webpack 5 dropped automatic Node-core polyfills; they are now declared
    explicitly via `resolve.fallback` + `ProvidePlugin` (real
    `crypto-browserify`/`stream`/`buffer` for bundles that embed bsv's crypto so
    Shamir/secrets.js still gets a browser CSPRNG; empty stubs for extern-bsv
    bundles). `Buffer`/`process` globals are preserved everywhere.
  - `ecies`/`message`/`mnemonic`/`shamir` now build from dedicated config files
    (webpack-cli 5 dropped the `-o`/`--output-library` flags the old shared
    `webpack.subproject.config.js` relied on).
  - TerserPlugin is pinned with `extractComments:false` so no `*.LICENSE.txt`
    sidecars are emitted; the published file list is unchanged.
  - Build scripts no longer need `NODE_OPTIONS=--openssl-legacy-provider`.
- **Browser bundle sizes shifted slightly** from the webpack 5 runtime + the
  now-explicit `process`/`buffer` shims (e.g. `bsv.min.js` 1207KB → 1266KB).
  README size table refreshed accordingly. The dependency tree is leaner
  (`package-lock.json` shrank substantially).

### Notes

- Polyfill packages that were transitive under webpack 4 (`crypto-browserify`,
  `stream-browserify`, `buffer`, `process`, `assert`, `util`, `path-browserify`,
  `browserify-zlib`, `vm-browserify`) are now explicit devDependencies, as
  webpack 5 requires.

## [5.0.1] - 2026-06-14

Patch release. Documentation corrections for the v5.0.0 release (which were
committed to `main` after the 5.0.0 npm publish), plus one user-facing message
fix. No API or behavioral changes; functionally identical to 5.0.0.

### Fixed

- **`bsv.SmartUTXO` deprecation warning gave the wrong removal version.** The
  runtime warning said the symbol "will be removed in v5.0.0", but removal was
  deferred to v6.0.0 in 5.0.0 (the adjacent code comment was updated then; the
  warning string was missed). Corrected to v6.0.0. Bundles regenerated.

### Documentation

- **README bundle size table** updated to the actual v5.0.0 bundle sizes (the
  full bundles grew because they now ship a real `crypto` polyfill for the
  vetted Shamir engine, e.g. `bsv.min.js` 937KB → 1207KB). (#13)
- **Install instructions updated for v5.0.0** (#14):
  - bumped a stale `@smartledger/bsv@4.2.1` install command;
  - replaced the v4.x highlights callout with a v5.0.0 breaking-change summary;
  - added an **"Upgrading to v5.0.0 (Breaking Changes)"** section covering the
    Shamir v2 share format (with legacy auto-recovery), JOSE-compliant VC-JWT
    signatures + the `allowLegacyDER` migration flag, algorithm pinning, and the
    larger browser bundles;
  - corrected the bundle-size totals in the Quick Start / CDN examples.
- **Removed an orphaned `@latest/dist/*` script block** after the "Everything
  Bundle" example — it was malformed markdown pointing at paths that don't exist
  in the published package (bundles ship at the package root, not under
  `dist/`). (#15)
- **Fixed broken in-page anchor links** (#16): the `Upgrading to v5.0.0` heading
  emoji left a stray variation-selector byte in its GitHub slug, and six
  pre-existing TOC/badge anchors pointed at slugs GitHub never generated; all now
  resolve. Also bumped a stale module-size range (`1184KB` → `1208KB`).
- CDN/install references in the README and docs bumped `@5.0.0` → `@5.0.1`.

## [5.0.0] - 2026-06-13

### BREAKING — Shamir Secret Sharing now uses a vetted GF(2⁸) engine

`crypto.Shamir` previously used a hand-rolled finite-field implementation over a
31-bit prime, with no authentication of shares. It is now backed by
`secrets.js-grempe` (a vetted GF(2⁸) implementation), with two safety additions:
a per-split nonce (`splitId`) so shares from different splits can't be silently
mixed, and an integrity `checksum` so a tampered/mismatched share set is rejected
at combine time instead of returning garbage.

- **New share format (v2).** `split()` returns objects shaped
  `{ v, id, threshold, shares, length, splitId, share, checksum }` instead of the
  old `{ id, threshold, shares, length, bytes:[{x,y}] }`.
- **Old shares remain recoverable.** `combine()` and `verifyShare()` detect and
  accept legacy (≤ 4.x) shares for recovery; you do not need the old version to
  reconstruct previously-split secrets.
- Randomness is sourced from the library's own `crypto.Random` (Node CSPRNG /
  `window.crypto`) via `secrets.setRNG`, and `secrets` is loaded lazily so simply
  importing the library never triggers its init.
- New coverage in `test/crypto/shamir.js` (round-trips, threshold subsets,
  leading-zero/Buffer secrets, tamper detection, split isolation, legacy
  recovery).

Browser bundles that bundle the full library no longer mock node `crypto` as
empty (`bsv.min.js`, `bsv.bundle.js`, `bsv-security.min.js`); webpack's default
`crypto` polyfill is used so Shamir can obtain a CSPRNG. This increases the size
of the full bundles (e.g. `bsv.min.js` ~951 KB → ~1.2 MB); the dedicated
non-Shamir module bundles are unaffected.

### BREAKING — VC-JWT signatures are now JOSE-compliant (IEEE P1363)

Up to and including 4.6.0, `VcJwt.issueVcJwt` signed with Node's default
ECDSA output, which is **DER-encoded**. The JOSE specs (RFC 7515/7518, and
RFC 8812 for ES256K) require ECDSA JWS signatures to be the raw `r||s`
concatenation (**IEEE P1363**). As a result, tokens issued by older versions
**did not verify in any standards-compliant library** (`jose`, `jsonwebtoken`,
etc.), and this library could not verify standard tokens from other issuers.
This also affected `StatusList`, which issues its lists via `VcJwt`.

- **`VcJwt.issueVcJwt`** now emits P1363 signatures and is verifiable by `jose`.
- **`VcJwt.verifyVcJwt`** now decodes P1363 signatures.
- **Migration:** tokens issued by ≤ 4.6.0 carry DER signatures and will fail
  verification by default. Pass `{ allowLegacyDER: true }` to `verifyVcJwt` to
  accept them while you re-issue. New tokens require no flag.
- Round-trip interoperability with `jose` (both directions, ES256 + ES256K) is
  now covered by `test/vcjwt/interop.js`.

### Security

- **VC-JWT algorithm pinning.** `verifyVcJwt` now rejects any token whose
  `alg` is not in the allowed set (default `['ES256','ES256K']`, overridable via
  `opts.allowedAlgs`) **before** verifying — closing the classic JWT algorithm
  substitution hole. It also binds the resolved key's curve to the algorithm
  (an ES256K signature can no longer be checked against a P-256 key), and
  `issueVcJwt` refuses to sign when the key curve and `alg` disagree.
- **`crypto/elliptic-fixed` low-S now preserves `recoveryParam`.** The previous
  manual `s → n-s` flip did not update the recovery id, so public-key recovery
  returned the wrong key for ~50% of signatures. Canonicalization now uses
  elliptic's own `{ canonical: true }`, which keeps `recoveryParam` consistent.
- **ECIES MAC check is now constant-time** (portable comparison; no early-out
  on the first differing byte).

### Fixed

- **Removed the self-referential dependency.** `package.json` listed
  `@smartledger/bsv` as one of its own `dependencies`, causing npm to install a
  nested older copy of the package and triggering the "More than one instance of
  bsv" guard. Removed.

### Changed

- Deduplicated `package.json` keywords (86 → 79).
- `bsv.SmartUTXO` removal pushed from v5.0.0 to v6.0.0 (still soft-deprecated).

## [4.6.0] - 2026-06-09

### Fixed — covenants are now mainnet-relayable (MINIMALDATA)

OP_PUSH_TX covenants up to 4.5.0 were consensus-valid but **non-standard**: their
locking scripts contained non-minimal data pushes, so every mainnet miner
rejected the spend with `non-mandatory-script-verify-flag (Data push larger than
necessary)` = `SCRIPT_ERR_MINIMALDATA`. Found by actually broadcasting to BSV
mainnet (WhatsOnChain/Taal **and** GorillaPool ARC both rejected it).

The non-minimal pushes were: a bare `0x00` sign byte, a bare `0x02` pubkey
prefix, and small integers (3/4/8) pushed as data. Fixes:

- **`PushTx.pushTxCore`**: drop the `0x00` sign-extension — the grind now requires
  `z[0]` (first byte of HASH256(preimage)) to be `0x01..0x7f`, so the hash is
  already a positive, minimally-encoded number. Use `OP_2` for the pubkey prefix.
- **`CovenantHelpers.scriptNum`**: emit `OP_0`/`OP_1..OP_16`/`OP_1NEGATE` for
  `0..16`/`-1` instead of a data push (fixes PELS, token, and the DSL's
  `lockUntil`).
- **`CovenantHelpers.flags`**: now includes `SCRIPT_VERIFY_MINIMALDATA`, so local
  `verifyScript`/`trace` mirror real mainnet relay policy and catch non-relayable
  covenants before broadcast.

A value covenant built with this release was **deployed and spent on BSV
mainnet** (txids `f9f25dbd…` deploy, `ea438096…` spend). Full suite 4206 passing,
lint clean.

## [4.5.0] - 2026-06-09

### Added — declarative covenant DSL + stack debugger

- **`SmartContract.policy()` — a declarative covenant DSL.** Describe a spending
  policy and compile it to a verified OP_PUSH_TX locking script, no opcodes:
  ```js
  const c = bsv.SmartContract.policy()
    .payTo(aliceAddr, 9500)   // the spend MUST create this output...
    .lockUntil(800000)        // ...with nLockTime >= 800000
    .compile()
  // c.lock, c.outputs, c.unlock(spendTx, satoshis)
  ```
  Clauses AND together (each compiles to one preimage-field check on a single
  OP_PUSH_TX authentication). `payTo` pins outputs via `hashOutputs`; `lockUntil`
  checks the `nLockTime` field. The compiled `unlock()` grinds the OP_PUSH_TX
  nonce *from the locktime floor upward* so it never collides with a `lockUntil`
  constraint. Shortcuts: `policy.perpetual(fee)`, `policy.token(fee, ownerHash)`.
- **`SmartContract.trace()` — a covenant stack debugger.** Step-traces a
  locking/unlocking pair and records the stack + alt-stack after every opcode, so
  you can watch an OP_PUSH_TX covenant build its signature and enforce its
  constraints. `SmartContract.Debugger.format(result)` pretty-prints it.
- **TypeScript types** for the full covenant suite in `bsv.d.ts`
  (`SmartContract.{PushTx,PELS,Token,Locks,CovenantHelpers,policy,Policy,trace,
  Debugger}` + `enableGenesis`/`verifyScript`/`perpetualCovenant`/…).

New mocha suite `test/smart_contract/dsl_debugger.js` (7 specs). Full suite
4199 → 4206 passing. Lint clean; `bsv.d.ts` type-checks.

## [4.4.0] - 2026-06-07

### Added — BSV string opcodes OP_SUBSTR / OP_LEFT / OP_RIGHT

- **Implemented the re-enabled BSV (Chronicle) string opcodes in the script
  interpreter.** They were declared in the opcode map (`0xb3`/`0xb4`/`0xb5`) but
  unimplemented — executing one returned `BAD_OPCODE`. Now they evaluate with the
  original Satoshi semantics:
  - `OP_LEFT  (in n -- out)` — the first `n` bytes.
  - `OP_RIGHT (in n -- out)` — the last `n` bytes (`OP_RIGHT 0` ⇒ empty, not the
    whole string).
  - `OP_SUBSTR (in begin size -- out)` — `in[begin : begin+size]`.
  Out-of-range lengths clamp to the string length; negative arguments fail with
  `SCRIPT_ERR_INVALID_NUMBER_RANGE`. New test: `test/script/string_ops.js`.

### Changed

- **Covenant field-extraction now uses these opcodes**, shrinking the scripts
  further: perpetual covenant 429→**421 B**, ownership token 493→**482 B**, value
  covenant 428→**424 B** (vs. the verbose `OP_SIZE/OP_SUB/OP_SPLIT/OP_NIP` form).

Full mocha suite 4190 → 4199 passing, 0 failing. Lint clean.

## [4.3.0] - 2026-06-07

### Changed — mainnet hardening of OP_PUSH_TX covenants

- **Canonical low-S signatures.** The OP_PUSH_TX grind now requires `s <= n/2`,
  so the in-script signature is canonical (low-S) and non-malleable, and the
  covenant verify path enforces `SCRIPT_VERIFY_LOW_S`. This makes the produced
  spends standard for mainnet relay/mining. Cost: zero extra script bytes — the
  constraint is satisfied by the spender's grind, not by added opcodes.
  (`SmartContract.PushTx.sFromPreimage`, `CovenantHelpers.flags`.)
- **Smaller scripts (−22 bytes per covenant).** `pushTxCore` now shares a single
  `Gx` push between the DER signature's r-value and the `02||Gx` public key
  (parked on the alt-stack) instead of embedding the 32-byte constant twice.
  Authenticator 404→382 B, value covenant 450→428 B, perpetual 451→429 B,
  ownership token 515→493 B.

### Notes

- The remaining ~382-byte floor is intrinsic to OP_PUSH_TX on BSV: ~248 B is the
  two mandatory 32-byte endianness reversals (big-endian hash ↔ little-endian
  script arithmetic ↔ big-endian DER), the rest is fixed secp256k1 constants and
  the DER template. There is no single-opcode byte reverse on BSV —
  `OP_REVERSEBYTES` is a Bitcoin Cash opcode, not part of the BSV opcode set, so
  the `OP_SPLIT`/`OP_SWAP`/`OP_CAT` reversal gadget is the correct approach.
- New test: `test/smart_contract/covenants.js` proves the grind yields low-S
  signatures enforced under `SCRIPT_VERIFY_LOW_S`. Full suite 4189 → 4190.

## [4.2.1] - 2026-06-07

### Docs

- **Substantial README rewrite for the v4.x line.** The README still
  headlined v3.4.x (4 minors and a major stale), showed the *old*
  `lib/covenant-interface` API in the covenant examples instead of the
  v4.2.0 `bsv.SmartContract.PushTx`/`PELS`/`Token`/`Locks`/`verifyScript`
  surface, had a wrong CDN-Bundles size table (off by up to 7× on
  `bsv-mnemonic`), duplicate "Complete Documentation" sections, a
  "planned 3.5.0" security note that was overtaken by 4.0.0, and a
  footer stamp claiming "v3.3.4 • 9 Loading Options". Replaced the
  headline with the v4.2.0 covenant section, rewrote PUSHTX/PELS
  examples to use the new API, added Ownership Tokens + end-to-end
  verification snippets, merged the two Documentation sections (7
  broken file paths fixed, 4 dead links removed), replaced the
  inaccurate CDN sub-table with a pointer to the canonical
  loading-options table, updated Security to point at the v4.0.0 GDAF
  fix, and stamped the footer at v4.2.1.

### Semver

Patch — README only. No source changes; no `lib/`, `bin/`, `bsv.d.ts`,
or test diffs. Out-of-band republish: `@smartledger/bsv@4.2.0` was
published from a separate session with the OLD README, then
unpublished after the rewrite. npm's anti-republish policy refuses to
reuse the 4.2.0 version number; 4.2.1 is the canonical version with
the corrected README content. `smartledger-bsv@4.2.0` (unscoped) was
published with the new README; for parity, the unscoped is also
republished at 4.2.1.

## [4.2.0] - 2026-06-07

### Added

- **First-class, interpreter-verified covenants under `bsv.SmartContract`.**
  A complete, tested stack of custom locking scripts that verify end-to-end
  through `Script.Interpreter` (positive and negative cases), building on the
  post-Genesis limits from 4.1.0:
  - **`SmartContract.PushTx`** — a *correct* OP_PUSH_TX (nChain WP1605). The
    locking script generates an ECDSA signature in-script from the pushed
    preimage (`a=k=1`, `r=Gx`, `s=(e+Gx) mod n`, pubkey `02||Gx`) and verifies
    it with `OP_CHECKSIG`, proving the preimage is this very transaction. Uses a
    fixed-length DER template with an `nLockTime` grind (`PushTx.grind`). Exposes
    `authenticator()`, `valueCovenant()`, `hashOutputs()`, `extractHashOutputs()`.
  - **`SmartContract.PELS` / `perpetualCovenant(fee)`** — a Perpetually Enforcing
    Locking Script: every spend must recreate the same script (value − fee).
    Reads its own script from the authenticated preimage's `scriptCode`, so there
    is no self-hash circularity.
  - **`SmartContract.Token` / `ownershipToken(fee, ownerHash)`** — a stateful
    ownership token (NFT) carrying its owner as on-chain state; transfer requires
    the owner's secret and rewrites the state, perpetuating the token code.
  - **`SmartContract.Locks`** — hash-lock, P2PKH, CLTV time-lock, m-of-n
    multisig, and HTLC primitives.
  - **`SmartContract.CovenantHelpers`** + convenience methods
    `enableGenesis()`, `verifyScript()`, `valueCovenant()` — a consensus-flag
    `verify()` harness, raw BIP-143 preimage access, signing, and fund/spend
    scaffolding.
- New mocha suite `test/smart_contract/covenants.js` (11 specs / 24 assertions),
  all green; full suite 4178 → 4189 passing.

### Notes

- These covenants require post-Genesis limits: call `SmartContract.enableGenesis()`
  (a.k.a `Interpreter.useGenesisLimits()`) before verifying. Research-grade and
  interpreter-verified — review before mainnet value (the OP_PUSH_TX key is the
  intentionally public `a=k=1`; low-S malleability is left unenforced).

## [4.1.0] - 2026-06-07

### Added

- **`Interpreter.useGenesisLimits([max])` — one-call opt-in for
  post-Genesis BSV consensus.** The bundled `Script.Interpreter`
  hardcoded the *pre-Genesis* consensus caps that BSV removed at the
  Genesis upgrade (February 2020): 520-byte stack elements, 4-byte
  script numbers, 201 non-push opcodes per script. Those caps make this
  library's own flagship features impossible to evaluate — OP_PUSH_TX
  covenants push a ~585-byte preimage element, do 32-byte modular
  arithmetic (`OP_ADD`/`OP_MOD`), and run a few hundred opcodes.

  ```js
  // Default: bound the limits to a safe ceiling.
  // 64 KB covers every covenant pattern seen in production and blocks
  // memory-exhaustion via oversized pushes from untrusted scripts.
  bsv.Script.Interpreter.useGenesisLimits(64 * 1024)

  // Or fully unbounded (~2 GB) — only safe for trusted scripts:
  // bsv.Script.Interpreter.useGenesisLimits()
  ```

  Defaults are unchanged out of the box (520 / 4 / 201) — existing
  consumers see zero behavior change unless they opt in. The call
  mutates static properties on the `Interpreter` constructor and
  therefore affects every subsequent `new Interpreter()` in the
  process; treat it as an app-startup setting, not per-request.

- **`Interpreter.MAX_OPS_PER_SCRIPT`** exposed as a named constant
  (= 201). Replaces the two hardcoded `> 201` checks in `Interpreter.step`.

- **`bsv.d.ts`** now types `Interpreter.MAX_SCRIPT_ELEMENT_SIZE`,
  `MAXIMUM_ELEMENT_SIZE`, `MAX_OPS_PER_SCRIPT`, and `useGenesisLimits()`.

### Fixed

- **`Interpreter.MAXIMUM_ELEMENT_SIZE` was a dead knob in the numeric
  opcodes.** The constant was defined as `4` but never threaded into the
  `BN.fromScriptNumBuffer(buf, fRequireMinimal, size)` calls in
  `OP_ADD`/`OP_SUB`/`OP_MUL`/`OP_DIV`/`OP_MOD`/`OP_BOOLAND`/`OP_BOOLOR`/
  `OP_NUMEQUAL`/`OP_NUMEQUALVERIFY`/`OP_NUMNOTEQUAL`/`OP_LESSTHAN`/
  `OP_GREATERTHAN`/`OP_LESSTHANOREQUAL`/`OP_GREATERTHANOREQUAL`/`OP_MIN`/
  `OP_MAX` (binary) and `OP_WITHIN` (ternary). The 3rd `size` argument was
  always omitted, so BN fell back to its own 4-byte default — raising
  `Interpreter.MAXIMUM_ELEMENT_SIZE` above 4 had no effect. Now threaded
  through, so the knob actually does what its name implies.

### Tests

- Added `test/script/genesis_limits.js` (6 tests) covering defaults,
  the lift, rejection of >4-byte arithmetic and >201 opcodes under
  defaults, and acceptance of both after `useGenesisLimits()`. Full
  suite: **4178 passing, 0 failing**.

### Docs

- README §"Evaluating covenants locally" — one-paragraph mention of
  the new API in the covenant/smart-contract section.
- JSDoc on `useGenesisLimits` calls out the process-wide-mutation
  semantics and recommends bounded ceilings for untrusted input.
- CDN/install refs bumped `@4.0.1` → `@4.1.0` across README + 6 docs
  files.

### Semver

Minor bump — purely additive: a new public method and a fixed-but-was-
dead constant. No existing API or default behavior changes.

## [4.0.1] - 2026-05-31

### Deprecated

- **`bsv.SmartUTXO` is now soft-deprecated and will be removed in v5.0.0.**
  `lib/smartutxo.js` is a development-only file-backed UTXO simulator —
  it writes to `<package-root>/utilities/blockchain-state.json` (a path
  inside `node_modules`), has no concurrency controls, ships with an
  empty seed (the 3.3 MB dev fixture is `.npmignore`d), and was exposed
  on the main `bsv.*` namespace where it looked like a production UTXO
  manager. That conflation is the same class of footgun as the v4.0.0
  `wallet.json` leak — dev fixtures don't belong on the production
  surface.

  The symbol is preserved (no semver break) but access now logs a
  one-shot deprecation warning. Set `BSV_HIDE_DEPRECATIONS=1` to
  silence. The supported import path is unchanged for users who
  legitimately need the simulator:

  ```js
  const SmartUTXO = require('@smartledger/bsv/lib/smartutxo')
  ```

  All internal callers (`lib/smart_contract/utxo_generator.js`) and
  in-repo demos/examples were migrated to the direct require so they
  don't trigger the warning. `bsv.SmartMiner` and `bsv.CustomScriptHelper`
  are unchanged in this release.

### Fixed

- **`SmartUTXOManager.createMockUTXOs(address, ...)` produces correct
  mocks.** Two bugs in one method:
  1. The P2PKH script encoded a *random* 20-byte hash rather than the
     hash of the provided `address`, so the mock claimed to belong to
     `address` but its locking script committed to a different address.
     Anyone who attempted to sign these mocks with the private key for
     `address` got a signature that wouldn't verify.
  2. It called Node's `crypto.randomBytes(...)` unconditionally, which
     throws in browser bundles where `crypto` is undefined.

  Both fixed: the script now derives from
  `bsv.Script.buildPublicKeyHashOut(bsv.Address.fromString(address))`,
  and randomness uses `bsv.crypto.Random.getRandomBuffer(32)` which
  works in both Node and browser builds.

### Documentation

- Added a clear "DEVELOPMENT ONLY" header block to `lib/smartutxo.js`
  spelling out the supported import path, the deprecation status, and
  why it shouldn't be used in production.
- Bumped CDN/install refs from `@4.0.0` to `@4.0.1` across README +
  6 docs files. SECURITY.md is unchanged (4.x is still the only
  supported line, 3.4.x still flagged as vulnerable).

### Semver note

This release deliberately stops short of a hard removal. Removing
`bsv.SmartUTXO` outright would be a major-version break, and v4.0.0
shipped less than 24 hours ago — bumping to v5.0.0 now would churn
consumers who are still digesting the v4.0.0 credential-verification
changes. The hard removal is queued for v5.0.0.

## [4.0.0] - 2026-05-31

### Security

This release fixes three critical vulnerabilities in the GDAF Verifiable
Credential signing/verification path. **Any credential signed by a version
prior to 4.0.0 should be considered unprotected and re-issued, and any
verification result produced by a prior version should be considered
untrustworthy.** See the Breaking Changes note below.

- **Credential signatures now cover the entire credential body, including
  nested claims (e.g. `credentialSubject`).** `AttestationSigner._canonicalizeJSON`
  previously called `JSON.stringify(obj, Object.keys(obj).sort())`. The second
  argument is the JSON.stringify *replacer array*, which whitelists keys at
  **every** nesting level to the top-level key set; every nested object
  therefore serialized to `{}` and was excluded from the signed hash. An
  attacker could rewrite the subject's identity and claims without
  invalidating the proof. Canonicalization is now a recursive, depth-complete
  key sort (`AttestationSigner._sortValue`).

- **The signature is now actually checked during verification.**
  `AttestationVerifier._verifySignature` and `_verifyPresentationSignature`
  assigned `var valid = ecdsa.verify()`. `ECDSA.prototype.verify()` returns the
  ECDSA *instance* (always truthy), not a boolean, so the `if (valid)` branch
  always passed — credentials and presentations were accepted regardless of
  whether the signature was valid, or present at all. Both sites now read
  `ecdsa.verify().verified`.

- **The signing key is now bound to the claimed issuer (issuer-spoofing fix).**
  `_verifySignature` resolved the public key from the attacker-controlled
  `proof.verificationMethod` and never compared it to `credential.issuer`. A
  valid signature from any DID was accepted while the credential named a
  different (e.g. trusted) authority as issuer. Verification now requires the
  DID owning `proof.verificationMethod` to equal the credential issuer
  (`AttestationVerifier._normalizeDID`, supporting both string and `{ id }`
  issuer forms).

- **Removed a live private key from the published package.**
  `utilities/wallet.json` shipped a valid mainnet WIF
  (`KwbaQqFU…`, address `15XJXD7CSMqHL2ivFCu8PZTACQQ8MPbWY9`). The file has
  been deleted and removed from the `files` allow-list. The dev utilities that
  used it (`utilities/wallet-setup.js`, `utxo-manager.js`, `blockchain-state.js`)
  already generate/import a local `wallet.json` at runtime and tolerate its
  absence. **The published key must be considered compromised — do not reuse
  it or send funds to that address.**

- **`trustedIssuers` is now enforced instead of advisory.** When a
  `trustedIssuers` allow-list is passed to `verifyCredential`, an issuer outside
  the list is now a hard verification failure (previously only a warning, so the
  list had no effect). Comparison is done on normalized DIDs.

Regression coverage added in `test/gdaf/canonicalize.js` (8 tests): nested-key
coverage, key-order independence, array-order significance, tamper-detection at
the hash level, an untampered sign/verify round-trip, rejection of an
issuer-spoofed credential, enforcement of the `trustedIssuers` allow-list, and
rejection of a post-signing nested-claim tamper.

### Changed

- **Constant-time MAC comparison in Electrum/BIE1 ECIES** (`lib/ecies/electrum-ecies.js`).
  The decrypt path compared the authentication tag with `Buffer.equals()`, which
  short-circuits on the first differing byte and can leak how many leading bytes
  matched. Replaced with an unconditional byte-wise compare (matching the
  existing loop in `bitcore-ecies.js`). Behaviour is unchanged for valid and
  invalid tags.
- **Simplified ECDSA signature verification** (`lib/crypto/ecdsa.js#sigError`).
  Removed a redundant s-canonicalization step and an unreachable
  "backwards-compatibility" retry branch (because `(r, s)` and `(r, n - s)`
  always verify identically, the retry could never succeed where the primary
  check failed). Out-of-range rejection of `r`/`s` is retained. Accept/reject
  results are byte-for-byte identical to 3.4.5; low-S is still enforced at
  signing time via `ECDSA.toLowS`.

### Removed

- Dropped the inaccurate `vulnerability-free` and `security-hardened` npm
  keywords. `bsv.isHardened` and `bsv.securityFeatures` remain but only describe
  opt-in helpers, as documented in `index.js` and the README Security section.

### Tests / Tooling

- **The test runner now executes the whole suite.** mocha 8 dropped support for
  `test/mocha.opts`, so its `--recursive` flag was silently ignored and
  `npm test` only ran the 10 top-level `test/*.js` files (534 tests) — the ~40
  files under `test/crypto`, `test/script`, `test/transaction`, `test/gdaf`,
  etc. never ran in CI. Added `.mocharc.json` (`recursive`, `spec:
  test/**/*.js`) and removed the defunct `test/mocha.opts`. `npm test` now runs
  the full suite (4172 passing, 0 failing), including the new GDAF security
  tests.
- **Repaired `test/crypto/security.js`.** It was 0 passing / 8 failing in 3.4.5
  (missing `require('chai').should()`, plus calls to a non-existent
  `SmartVerify.verifySignature`, `Signature.validate()` used as if it returned a
  boolean rather than throwing, and an invalid TXID fixture). Rewritten against
  the real API (`SmartVerify.smartVerify`, `Signature#validate/isCanonical/
  toCanonical`); now 12 passing.
- **Fixed the 18 pre-existing failures that recursion surfaced** (all failed on
  a pristine 3.4.5 checkout; the full suite is now green at 4172 passing):
  - 3 in `test/crypto/ecdsa.js` — `ECDSA#sigError` did not reject negative
    `r`/`s`. Tightened the range check to `[1, n-1]` (`lte(0)` now covers
    negative and zero); negative-value DER vectors are correctly rejected as
    'r and s not in range'. (Real correctness fix, in `lib/crypto/ecdsa.js`.)
  - 14 in `test/script/interpreter.js` — stale upstream Bitcoin Core vectors
    asserting `DISABLED_OPCODE` for CAT/SPLIT/NUM2BIN/BIN2NUM/AND/OR/XOR/DIV/MOD
    (re-enabled in BSV at Genesis) and `BAD_OPCODE` for `0xba` (which is OP_NOP8
    in this build). The vendored `script_tests.json` is left untouched; a
    documented `BSV_DIVERGENCES` override in the harness records each divergence
    and asserts the correct BSV result.
  - 1 in `test/script/script.js` — expected byte `0xba` to disassemble as raw
    hex, but `0xba` is `OP_NOP8` in this build's opcode table; updated to the
    correct disassembly with an explanatory comment.

### Breaking Changes

- The bytes that get signed have changed (nested claims are now included), so
  credentials and presentations signed by **≤ 3.4.5 will no longer verify**
  under 4.0.0. This is intentional: the previous signatures did not protect
  those bytes. Re-issue affected credentials with 4.0.0.
- Verification is now strict: callers relying on the previous (broken)
  behaviour where verification effectively always succeeded will see
  legitimate failures for unsigned, mis-signed, or issuer-mismatched
  credentials.

## [3.4.5] - 2026-05-29

### Fixed

- **1Sat Ordinals (and any "P2PKH + trailing data" output) can now be spent
  via the high-level `Transaction.from().sign()` API.** Spending these
  outputs previously threw `Abstract Method Invocation: Trying to sign
  unsupported output type` because `Transaction._fromNonP2SH` routed
  anything other than a strictly-canonical 5-chunk P2PKH script to the
  abstract base `Input` class, which has no `getSignatures` /
  `_estimateSize` implementations. Every consumer (wallets, marketplaces,
  re-broadcasting indexers) had to maintain a parallel manual-signing
  path against `Transaction.Sighash.sighash` + `crypto.ECDSA.sign`.

  This release adds `Script.prototype.isPublicKeyHashOutPrefix()` —
  identical to `isPublicKeyHashOut()` but accepts any number of trailing
  chunks — and uses it (only) inside `_fromNonP2SH` so the dispatcher
  routes P2PKH-prefixed scripts to `PublicKeyHashInput`. The strict
  `isPublicKeyHashOut()` is unchanged, so script classification, address
  derivation, and any other introspection paths keep their canonical
  semantics. `PublicKeyHashInput.getSignatures` reads the 20-byte hash
  directly from `chunks[2].buf` instead of via the strict
  `getPublicKeyHash()` (which still asserts canonicality for its other
  callers).

  Sighash is unaffected — it has always passed the full `output.script`
  bytes to `Sighash.sign`, so the resulting signature commits to the
  inscription envelope (or whatever trailing data) the same way miners
  verify it. Validated end-to-end by 7 new regression tests in
  `test/transaction/transaction.js`, including a `isValidSignature`
  round-trip on an ordinal-shaped UTXO.

  Same dispatch fix unblocks: MAP+BAP metadata appended to outputs,
  sCrypt covenants with a P2PKH spendable guard, BSV20 v2 listing
  outputs, and any future "P2PKH + tag" pattern. The 3.4.4 `clearSignatures`
  fix removed the *first* abstract-method barrier on these flows; this
  release removes the *second* and final one.

### Notes

- No public API changes. The new `Script.prototype.isPublicKeyHashOutPrefix()`
  is purely additive. Strict `isPublicKeyHashOut()` callers are
  unaffected.
- Strict semver patch: the affected code path previously threw on every
  invocation, so no working consumer can regress.

## [3.4.4] - 2026-05-25

### Fixed

- **TypeScript types now actually load for `@smartledger/bsv` consumers.**
  Two pre-existing bugs combined to silently leave TS users with `any`:
  `package.json` had no `"types"` field, and `bsv.d.ts` declared
  `module 'bsv'` instead of `module '@smartledger/bsv'`. Added the `types:`
  field and renamed the ambient module declaration. Existing TS consumers
  who were previously seeing `any` for every `bsv.*` will now get real
  autocomplete and type errors — surface API unchanged, but any code that
  was implicitly relying on `any` to silence a real type error will need
  to be fixed.

- **`smartledger-bsv vc verify` actually works now.** The CLI's DID resolver
  returned the raw JWKS file content (`{ keys: [...] }`), but
  `lib/vcjwt/verifyVcJwt` expects the documented resolver shape
  `{ jwks: { keys: [...] } }`. So every `npx smartledger-bsv vc verify`
  call advertised in the README's quickstart would fail with "Failed to
  resolve issuer DID" — including the one in the very first `Quick Start`
  block at `README.md:25-53`. `bin/cli.js` now wraps the result correctly.
  Caught by the new `test/cli/smoke.js` (Task #9 below).

- **CLI version string is no longer hardcoded.** `bin/cli.js` used to
  print `SmartLedger BSV CLI v3.4.0` regardless of the actual package
  version (and had no `--version` flag at all). It now reads from
  `package.json` and supports `--version` / `-v` / `--help` / `-h`.

- **Library is now silent by default.** Two long-standing modules printed
  on every consumer-side `require`/bundle-load: `lib/smartutxo.js` emitted
  `SmartUTXO: Running in browser mode - some features may be limited`
  plus 11 informational `console.log` calls (`📖 Loaded existing
  blockchain state`, `💾 Saved blockchain state with N UTXOs`, etc.), and
  `utilities/blockchain-state.js` added another `BlockchainState: Running
  in browser mode` warn plus ~15 narration logs that fired on every
  `SmartUTXO` method call. All of these are now gated behind the same
  `BSV_DEBUG` flag the rest of the codebase has used since 3.4.1:
  set `BSV_DEBUG=1` (Node) or `window.BSV_DEBUG = true` (browser) to
  surface the diagnostics. `console.error` calls for genuine
  storage/IO failures are unchanged — errors stay loud. A small fix to
  `lib/smart_contract/covenant.js` does the same for the
  `File system operations not available in browser environment` warn
  that `.save()` emitted at call time. Verified: `require('./index.js')`
  in Node is now completely silent; `require('./bsv-ltp.min.js')` /
  `bsv-gdaf.min.js` / `bsv-anchor.min.js` are silent after rebuild
  (will rebuild for the rest at release time via `prepublishOnly`).

- **Broken installs now fail loudly in Node instead of silently degrading.**
  `index.js` previously wrapped the eager `require('bn.js')` /
  `require('bs58')` / `require('elliptic')` calls in a single try/catch that
  emitted `console.warn('Some dependencies may not be available in browser
  environment')` and continued — so a missing runtime dep in Node (broken
  `npm install`, deleted `node_modules`, container-build mistake) would let
  the library load partially and then explode with a confusing
  `TypeError: Cannot read properties of undefined` deep in `lib/crypto/bn.js`.
  The block now hard-requires those three deps in Node (declared in
  `package.json` `dependencies`, so they MUST be installed) and only
  tolerates absence in browser context where the bundler is expected to
  inline or polyfill them. `Buffer` and the internal `lib/util/_` continue
  to be loaded the same way they always were.

- **`Transaction._clearSignatures()` no longer throws on custom-script inputs.**
  When a transaction contained an input whose locking script wasn't one of the
  four auto-recognized standard types (P2PKH, P2PK, bare-multisig, P2SH-multisig),
  `_fromNonP2SH` falls through to the base `Input` class. Any subsequent
  `Transaction` mutation that triggers `_clearSignatures` — `.fee()`, `.change()`,
  adding another input, etc. — then threw `AbstractMethodInvoked: Input#clearSignatures`.
  This bug existed in the upstream bsv@1.5.6 lineage and impacted users of
  covenant and custom-script flows specifically. `transaction.js:_clearSignatures`
  now skips inputs that haven't overridden the base method, matching the
  guard-by-method-identity pattern already used for `isFullySigned` and
  `isValidSignature`. The base `Input.prototype.clearSignatures` still throws
  when called directly, so the original abstract-method contract is preserved.
  Regression tests added in `test/transaction/transaction.js`.

### Added

- **`test/cli/smoke.js` — end-to-end smoke test for `bin/cli.js`.** Exercises
  every subcommand the README markets as the on-ramp (`didweb init`,
  `vc issue`, `vc verify`, `status create` / `set` / `check`,
  `anchor hash` / `build`) inside an isolated temp dir per test (13
  tests, ~580ms total). Surfaced two pre-existing CLI bugs in the
  process (resolver shape, hardcoded version — both fixed above). Also
  available as `npm run test:cli`, and wired into the hygiene job of
  `ci.yml`.

- **`.github/workflows/ci.yml` — minimal CI** that runs on push/PR to main
  and is designed to catch the exact bug classes shipped in v3.4.0–v3.4.3.
  Three jobs:
  1. **hygiene** (strict) — fails the build if README/docs contain stale
     `unpkg.com/@smartledger/bsv@X.Y.Z/...` URLs that don't match
     `package.json` version; if any `files:` array entry doesn't resolve
     to a path on disk (globs expanded); if `bsv.d.ts` fails to compile
     against a TS smoke file under `--strict`; or if `npm pack --dry-run`
     output is missing any of `SECURITY.md` / `CHANGELOG.md` / `LICENSE`
     / `README.md` / `bsv.d.ts` / `bsv.min.js`.
  2. **build** (strict) — runs `npm run build-all` and verifies all 16
     advertised bundles land on disk; checks that `bsv-ltp.min.js` and
     `bsv-gdaf.min.js` are not byte-identical (regression guard for the
     v3.4.4 entry-placeholder fix); UMD-loads each credential bundle and
     verifies its expected exports are accessible.
  3. **tests** (advisory) — runs `npm test` and `npm run lint` on Node
     18/20/22, but with `continue-on-error: true`. Will be gated strictly
     after the 25 pre-existing mocha failures and standard@12 lint
     baseline are cleaned up in 3.5.0 (see "Planned for 3.5.0" below).

- **`bsv.d.ts` now covers the v3.3+ surface.** The legacy type defs (forked
  from the original moneybutton/bsv types) only described the bitcore-lineage
  core: Transaction, Address, Script, PrivateKey, etc. Everything added in
  v3.3.x and v3.4.x — `DIDWeb`, `VcJwt`, `StatusList`, `Anchor`, `GDAF`, `LTP`
  (class + 60+ top-level `prepare*` and `create*` convenience wrappers),
  `SmartContract` (Covenant, Preimage, SIGHASH, Builder, UTXOGenerator,
  ScriptTester, CovenantBuilder, StackExaminer, ScriptInterpreter, plus
  `scriptToASM`/`asmToScript`/etc.), `SmartVerify`, `EllipticFixed`, `Shamir`
  (with `splitSecret`/`reconstructSecret`/`validateShare` convenience
  wrappers), `BrowserUTXOManager`, and the `SmartLedger` metadata namespace
  — was missing. Added with pragmatic signatures (JWK-typed where shapes are
  stable; `object` / `any` where the runtime takes opaque W3C/JSON
  payloads). Verified by compiling a smoke-test file that exercises every
  new module against `tsc --noEmit` and `tsc --noEmit --strict` (both pass).

### Changed (tarball hygiene)

- **`demos/` and `examples/` no longer ship in the npm tarball.** Removed
  from `package.json` `files:` (they're still in the GitHub repo). Reduces
  unpacked size from 11.8 MB → 11.1 MB and file count from 268 → 206
  (≈23% fewer files in every consumer's `node_modules`). Rationale: Node
  consumers `require('@smartledger/bsv')` and never browse those
  directories; CDN consumers fetch `.min.js` files directly and never see
  the tarball. `docs/` is still included — it's actively maintained,
  small (0.39 MB), and useful for users grepping `node_modules` for
  reference material.
- **13 relative README links to `examples/`, `demos/`, and `tests/`
  rewritten to absolute GitHub URLs** so they keep resolving for anyone
  reading the post-install README from inside `node_modules`. Same final
  destination, just doesn't depend on the directory shipping locally.
- **CI now enforces an anti-bloat ceiling**: the hygiene job fails if the
  tarball exceeds 250 files or 14 MB unpacked. Baseline after this
  release: 206 files / 11.1 MB — gives ~25% headroom for normal growth.

### Changed (documentation honesty, continued)

Further sweep of the same stale-URL bug class fixed in 3.4.2/3.4.3, plus a
companion `SECURITY.md` and a fix to two long-standing entry-file placeholders.

- **README.md**: bumped 20 stale `unpkg.com/@smartledger/bsv@3.4.1/...` and
  `@3.3.4/...` CDN URLs (plus the version badge and install commands) to
  `@3.4.3`. The two historical "v3.4.1 (bugfix)" prose references at the top
  of the file were left intact — they accurately describe what that specific
  release shipped.
- **`docs/`**: bumped 67 more stale CDN/install URLs that the 3.4.3 sweep
  missed (`@3.4.2`, `@3.3.4`, `@3.1.1`) across `MODULE_REFERENCE_COMPLETE.md`,
  `getting-started/INSTALLATION.md`, `getting-started/QUICK_START.md`,
  `migration/FROM_BSV_1_5_6.md`, `advanced/UTXO_MANAGER_GUIDE.md`, and
  `COVENANT_DEVELOPMENT_RESOLVED.md`.
- **Bundle sizes corrected** in `README.md` (loading-strategy section and
  use-case table at lines 277–791), `docs/getting-started/INSTALLATION.md`,
  `docs/getting-started/QUICK_START.md`, and `docs/MODULE_REFERENCE_COMPLETE.md`.
  The largest drifts (silent for several releases): `bsv-covenant.min.js`
  shown as 32KB in `docs/` was actually 913KB (28× off); `bsv-ltp.min.js` /
  `bsv-gdaf.min.js` shown as 817KB / 604KB were both 1184KB after the
  3.4.x rebuilds. README's main loading-options table (lines 138–173) was
  already accurate and was not touched. Subtotals for "load multiple
  bundles together" rows now reflect that each standalone bundle re-embeds
  core BSV — the previous subtotals undercounted by ignoring that overlap.
- **`SECURITY.md`** added. `package.json` `files:` had listed it since 3.4.0
  but the file did not exist, so npm was silently skipping the entry (same
  class of bug 3.4.1 cleaned up for the other seven dead `files:` entries).
  Uses the GitHub-recognized `## Supported Versions` / `## Reporting a
  Vulnerability` format, points at GitHub Security Advisories +
  `hello@smartledger.technology`, and restates the same opt-in vs.
  default-path posture as README §Security so it can't drift.
- **`ltp-entry.js` and `gdaf-entry.js`** were placeholders that re-exported
  `lib/smart_contract`. The webpack configs built `bsv-ltp.min.js` and
  `bsv-gdaf.min.js` (1.2 MB each) from these placeholders, so the UMD
  `window.bsvLTP` and `window.bsvGDAF` globals advertised in the README as
  "Legal Token Protocol" and "Digital Identity & Attestation" actually
  exposed the smart-contract module — and the two bundles were byte-identical.
  The entries now point at `./lib/ltp` and `./lib/gdaf` respectively, so the
  bundles expose the `LTP` and `GDAF` classes the README documents. CDN
  consumers who were calling `window.bsvLTP.<smart_contract_method>` will need
  to switch to `bsv-smartcontract.min.js` or use the unbundled `@smartledger/bsv`
  package — the previous behavior was not what was advertised.

### Notes

- No public API changes beyond the LTP/GDAF UMD bundle export shape correction
  noted above. All Node.js `require('@smartledger/bsv').LTP` /
  `require('@smartledger/bsv').GDAF` call sites continue to resolve to the
  same `lib/ltp` / `lib/gdaf` modules they always did.

---

## Planned for 3.5.0 — toolchain upgrade

Originally promised in 3.4.1's "Notes":

> Dev-only vulnerabilities remain in `webpack 4` / `standard 12` / `mocha 8`;
> a toolchain upgrade is planned for 3.5.0 to address them without breaking
> downstream bundler integrations.

This is the fleshed-out plan for that release. **It does not affect 3.4.x
runtime behavior; it's a build/test/lint stack migration.** Tracking it here
in `[Unreleased]` keeps the commitment auditable from the changelog rather
than a side document.

### Audit baseline (as of v3.4.3)

`npm audit` reports **15 high / 9 moderate / 10 low**. All but two are
strictly dev-chain (webpack 4 / mocha 8 / nyc 14 / standard 12 transitives):

- The lone direct runtime entry is **`bn.js` (moderate)** — pinned at
  `=4.11.9` because `elliptic@6.6.1` requires bn.js 4.x. A direct bump to
  `bn.js@5.x` is not safe in isolation; see "Runtime dependency decisions"
  below.
- **`elliptic` appears in the low list** but is already at upstream's latest
  (6.6.1). The advisory comes via webpack 4's obsolete
  `node-libs-browser → crypto-browserify → browserify-sign → elliptic`
  polyfill chain, which webpack 5 deletes entirely. So bumping webpack to 5
  drops this advisory automatically, no code change required.

### Tooling target versions

| Tool | Current | Target | Why |
| --- | --- | --- | --- |
| `webpack` | `4.29.3` | `^5.100` | Eliminates the entire `node-libs-browser` polyfill chain (= source of most HIGH vulns), supports modern asset modules, fixes `terser-webpack-plugin` advisory |
| `webpack-cli` | `^3.3.12` | `^5` or `^6` | Matched to webpack 5; webpack-cli 7 also works but tightens validation |
| `mocha` | `^8.4.0` | `^10.x` | Mocha 11 requires Node 18+; 10 supports Node 14+. Picking 10 keeps a wider engines window |
| `nyc` | `^14.1.1` | `^17` or migrate to `c8` | nyc 17 is Node 14+ compatible. Alternative: drop nyc for `c8` (lighter, uses native V8 coverage) |
| `sinon` | `7.2.3` | `^17.x` | sinon 18+ requires Node 18+. 17 covers Node 14+ |
| `chai` | `4.2.0` | `4.5.x` (LTS) | **Stay on chai 4.x.** chai 5+ went ESM-only — switching means rewriting `require('chai')` everywhere or migrating the test suite to ESM. Not worth bundling into a toolchain release. |
| `standard` | `12.0.1` | `^17` or replace | standard 17 uses ESLint 8 (now stale itself); standard 18+ requires Node 18. Open question: stay on `standard`, or move to `eslint@9` + flat config + a smaller rule set. See "Linter decision" below. |
| `brfs` | `2.0.1` | `2.0.2` | Trivial patch bump |

### Runtime dependency decisions (keep / bump / shim)

| Dep | Pin | Latest | Decision |
| --- | --- | --- | --- |
| `elliptic` | `6.6.1` | `6.6.1` | **Keep.** Already current. |
| `bn.js` | `=4.11.9` | `5.2.3` | **Keep at 4.x.** Bumping breaks elliptic; the moderate vuln (constant-time concern in some older 4.x) is mitigated by callers in `lib/crypto/`. Add a comment in `package.json` pinning rationale. |
| `bs58` | `=4.0.1` | `6.0.0` | **Keep at 4.x.** `bs58@5+` is ESM-only and would force a CJS→ESM migration of `lib/encoding/base58.js`. Out of scope for 3.5.0. |
| `inherits` | `2.0.3` | `2.0.4` | **Bump to 2.0.4.** Trivial. |
| `unorm` | `1.4.1` | `1.6.0` | **Bump to 1.6.0.** Non-breaking. |
| `aes-js` | `^3.1.2` | `3.1.2` | **No change.** |
| `clone-deep` | `^4.0.1` | `4.0.1` | **No change.** |
| `hash.js` | `^1.1.7` | `1.1.7` | **No change.** |

### Required code / config changes

1. **`build/webpack.*.config.js` (12 files).** webpack 5 removes the
   automatic Node polyfills that webpack 4 silently injects. Concrete
   touches needed:
   - Add `resolve.fallback` entries for `buffer`, `crypto`, `stream`,
     `process` (or use `node-polyfill-webpack-plugin`).
   - Add `buffer`, `process`, `stream-browserify`, `crypto-browserify`
     (or modern equivalents) as **dev**-deps so the fallbacks resolve.
   - `output.library` ideally migrates from string to object form
     (`{ name: 'bsvFoo', type: 'umd' }`) — webpack 5 still accepts the
     string form but warns.
   - `globalObject: 'this'` should become `globalObject: 'globalThis'`
     (cleaner; matches modern targets).
   - Drop `NODE_OPTIONS="--openssl-legacy-provider"` from all 16 `npm run
     build-*` scripts — that workaround exists *because* webpack 4 pins
     legacy OpenSSL APIs. webpack 5 doesn't need it.

2. **`test/mocha.opts` → `.mocharc.cjs` (or `mocha` field in package.json).**
   Mocha 8 already emits a deprecation warning for `mocha.opts`; mocha 10
   removes support entirely. Migrate the existing two flags
   (`--recursive`, `--timeout 5000`) and add `--reporter spec`.

3. **`engines` field in `package.json`.** No engines is declared today.
   For 3.5.0 add `"engines": { "node": ">=14" }` (or `>=18` if we also
   adopt mocha 11 / sinon 18 / standard 18). Current consumer test
   environments span Node 14–22, so `>=14` is the safer choice.

4. **`@types/node` peer dep or dev-dep.** With the typing fix in 3.4.4,
   `bsv.d.ts` formally depends on Node types (`/// <reference types="node" />`).
   Add `"peerDependencies": { "@types/node": "*" }` (optional) or document
   in README that TS consumers need `@types/node` installed.

5. **Linter decision (open question).**
   Option A — Stay on `standard@17`: 1-line bump, ~1 day to fix new lint
   errors. Risk: standard's own toolchain is aging.
   Option B — Migrate to ESLint flat config (`eslint.config.js`) with a
   custom rule set. More work, but unblocks long-term flexibility and the
   newer rule engine.
   **Recommendation:** A for 3.5.0, defer B to 3.6.0.

### Risk ranking and rollout order

Each step should be its own PR, validated against the full `test/` suite
(120+ mocha tests passed in 3.4.4) and a `npm pack --dry-run` size diff.

1. **Low risk:** `inherits` / `unorm` patch bumps, `brfs 2.0.1 → 2.0.2`,
   add `engines` field, migrate `mocha.opts → .mocharc.cjs`.
2. **Medium risk:** mocha 8 → 10, nyc 14 → 17, sinon 7 → 17, standard
   12 → 17. Test suite may have lint/test syntax regressions.
3. **Higher risk:** webpack 4 → 5. This is the bundle-shape change;
   downstream CDN consumers will see different file bytes. Plan a beta
   release (`3.5.0-beta.1`) on npm before the GA bump so integrators can
   validate.
4. **Out of scope, deferred:** `bn.js 4 → 5`, `bs58 4 → 6`, `chai 4 → 5`,
   linter overhaul. These all imply CJS→ESM or coordinated upstream
   changes and warrant a separate 3.6.0 effort.

### Pre-release validation checklist

Before publishing `3.5.0`:

- `npm test` passes (Node 18, 20, 22).
- `npm run build-all` succeeds without `NODE_OPTIONS` workaround.
- All 16 bundles built and:
  - sized within 5% of 3.4.x equivalents (or sizes updated in README/docs);
  - smoke-tested in a browser via `tests/*.html` against the unpkg URL;
  - UMD globals (`window.bsv`, `bsvLTP`, `bsvGDAF`, etc.) resolve correctly.
- `npm audit` shows zero high/critical, ≤ 5 moderate (any remaining moderates
  documented in CHANGELOG with mitigation).
- `tsc --noEmit --strict` against `bsv.d.ts` + smoke file still passes.
- Tag `3.5.0-beta.1` on npm for at least 7 days to let integrators report
  bundle regressions before GA.

## [3.4.3] - 2026-05-18

### Changed (documentation honesty, continued)

Companion to 3.4.2. The README was corrected in 3.4.2 but several shipped docs in `docs/` still contained the same overclaims and stale `@3.3.4` CDN URLs that would 404 for users upgrading from 3.4.0+.

- **`docs/migration/FROM_BSV_1_5_6.md`**: replaced "Now with hardened elliptic curves" comment on `new bsv.PrivateKey()` and the "Enhanced Security under the hood" framing with accurate "standard API behaves identically; opt-in hardening helpers available — call `bsv.SmartVerify.smartVerify()` explicitly" wording.
- **`docs/getting-started/QUICK_START.md`**: replaced "Elliptic curve hardening - Enhanced cryptographic security" bullet with accurate description of the opt-in helpers + pinned-dependency facts.
- **`docs/advanced/LEGAL_TOKEN_PROTOCOL.md`**: corrected three places that claimed LTP tokens are "signed with hardened crypto" / "enhanced elliptic curves". Token signing uses BSV's standard ECDSA path; `SmartVerify` is opt-in for verification.
- **`docs/MODULE_REFERENCE_COMPLETE.md`** and **`docs/getting-started/INSTALLATION.md`**: bumped 15+ stale `unpkg.com/@smartledger/bsv@3.3.4/...` URLs to `@3.4.2` (those URLs were 404'ing for anyone copy-pasting from these guides); corrected `bsv-security.min.js` size from `290KB` to `26KB` (10× off); labeled "opt-in helpers" with link to the canonical Security section in README.

### Notes

- No code or bundle behavior changes. This is a docs-only correction; bundles are rebuilt purely because the version string is embedded.

## [3.4.2] - 2026-05-18

### Changed (documentation honesty)

- **README Security section rewritten** to accurately describe what hardening ships and what is opt-in vs. on by default.
  - `bsv.SmartVerify` and `bsv.EllipticFixed` are **opt-in helpers**; the default `transaction.verify()` / `signature.verify()` / `Message().verify()` paths do **not** route through them.
  - `lib/crypto/ecdsa.js` (the default verify path) uses BSV's own pure-JS ECDSA and does not import the elliptic library at all.
  - `elliptic@6.6.1` is the upstream-patched current release; SmartLedger does not patch elliptic's source. The patches in `lib/crypto/elliptic-fixed.js` add input validation on top of an already-patched elliptic.
  - Added a usage example showing how to call `SmartVerify.smartVerify(...)` explicitly.
- **`index.js`**: added a doc comment above `bsv.isHardened` / `bsv.securityFeatures` clarifying these advertise that hardening helpers ship — not that they are wired into the default path. API surface unchanged.

### Notes

- No code behavior changes. All `bsv.*` properties and methods continue to work exactly as before.
- A planned 3.5.0 will offer an opt-in flag to route the default verify path through `SmartVerify` so the protection is on by default for new users.

## [3.4.1] - 2026-05-18

### Fixed

- **Credential bundles now actually ship.** `bsv-didweb.min.js`, `bsv-vcjwt.min.js`, `bsv-statuslist.min.js`, and `bsv-anchor.min.js` were missing from the `files:` allowlist in 3.4.0, so they were never included in the published npm tarball even though the README advertised them.
- **`prepublishOnly` now builds every advertised bundle.** Previously it ran `npm run build`, which only produced 6 of the ~16 bundles. It now runs `npm run build-all`, so credential, covenant, ltp, gdaf, and other specialized bundles can't go out of sync with source at publish time.
- **CSPRNG-backed `Transaction.shuffleOutputs()`.** `lib/util/_.js` `_.shuffle` now draws entropy from `bsv.crypto.Random` (Node `crypto.randomBytes` / `window.crypto.getRandomValues`) instead of `Math.random`. Output ordering is a privacy primitive; a predictable PRNG defeated the purpose.
- **`Transaction._fromMultisigUtxo` returns a real error.** A reachable `throw new Error('@TODO')` for unsupported script types now throws `errors.Transaction.Input.UnsupportedScript` with the offending script in the message.
- **Module load failures surface in Node.** The `try/catch` blocks around optional modules (`DIDWeb`, `VcJwt`, `StatusList`, `Anchor`, `BrowserUTXOManager`) in `index.js` previously swallowed all errors. They now `console.warn` in Node and stay silent in the browser, so upgrade breakage is visible.

### Changed

- **`tests/` no longer ships to npm consumers.** The directory of HTML demo pages and 5 orphan standalone scripts is removed from `package.json` `files:` and added to `.npmignore`.
- **`utilities/blockchain-state.json` (3.2MB) no longer ships.** Mock blockchain data added to `.npmignore`; not needed at install time.
- **Browser UTXO manager logs are gated.** `lib/browser-utxo-manager.js` and `lib/browser-utxo-manager-es5.js` info-level `console.log` calls now require `BSV_DEBUG=1` (Node) or `window.BSV_DEBUG = true` (browser). `console.warn`/`console.error` unchanged.
- **Orphan scripts moved out of `lib/` and `tests/`.** `lib/smart_contract/test_integration.js` (an integration script that called `process.exit`) plus 5 pre-mocha scripts from `tests/` moved to `examples/legacy/`.
- **`package-lock.json` is now committed.** Removed from `.gitignore` so `npm audit` and reproducible installs work.
- **Dead `files:` entries removed.** Seven file references in `package.json` `files:` pointed to files that don't exist; npm silently skipped them. Removed.

### Notes

- No public API changes. All call sites continue to work.
- Dev-only vulnerabilities remain in `webpack 4` / `standard 12` / `mocha 8`; a toolchain upgrade is planned for 3.5.0 to address them without breaking downstream bundler integrations.

## [3.4.0] - 2025-11-09

### Added

- **DID:web module** (`bsv.DIDWeb`, `bsv-didweb.min.js`): W3C DID Core `did:web` method generation with both ES256 (NIST P-256) and ES256K (Bitcoin secp256k1) key types.
- **VC-JWT module** (`bsv.VcJwt`, `bsv-vcjwt.min.js`): W3C Verifiable Credentials issuance and verification as JWT (RFC 7515 / RFC 7519 compliant).
- **StatusList2021 module** (`bsv.StatusList`, `bsv-statuslist.min.js`): credential revocation supporting 100k credentials per list.
- **Anchor module** (`bsv.Anchor`, `bsv-anchor.min.js`): privacy-preserving SHA-256 hash-only anchoring helpers for BSV.
- **CLI tooling** (`bin/cli.js`): `didweb`, `vc`, `status`, `anchor` subcommands.
- Quickstart examples and updated module tables in the README.

### Standards Compliance

- W3C Verifiable Credentials Data Model
- W3C DID Core (`did:web` method)
- RFC 7515 (JWS), RFC 7519 (JWT)
- StatusList2021 specification
- NIST P-256 and Bitcoin secp256k1 curves

### Known Issues (fixed in 3.4.1)

- The four new credential bundles were not listed in `package.json` `files:`, so they did not ship to npm consumers despite being advertised in the README.
- `prepublishOnly` only built the core 6 bundles, not the credential set.

## [3.3.4] - 2025-10-31

### Fixed
- **Critical Browser Compatibility Fix**: Resolved `createHmac is not a function` error affecting CDN users
- **PBKDF2 Implementation**: Added browser-compatible PBKDF2 using BSV crypto instead of Node.js crypto
- **Mnemonic Generation**: Fixed mnemonic generation and HD wallet derivation in browser environments
- **Bundle Updates**: Rebuilt all bundles with browser-compatible crypto implementations

### Added
- Browser-specific PBKDF2 implementation (`lib/mnemonic/pbkdf2.browser.js`)
- Node.js-specific PBKDF2 implementation (`lib/mnemonic/pbkdf2.node.js`)
- Automatic browser/Node.js detection for crypto modules
- Comprehensive browser compatibility test suite

### Technical Details
- Uses BSV's `Hash.sha512hmac()` instead of Node.js `crypto.createHmac()`
- Maintains full cryptographic security and API compatibility
- Zero breaking changes for existing users
- All 12 bundle variants updated with the fix

## [3.3.3] - 2025-10-28

### 🎉 Major Improvements

#### 📁 Project Organization & Structure

- **Complete repository reorganization**: Moved legacy files to `/archive/` for better project structure
- **New `/demos/` directory**: Interactive HTML demonstrations for all SmartLedger-BSV modules  
- **Enhanced `/docs/` structure**: Comprehensive documentation with getting started guides, API references, and technical details  
- **Dedicated `/tests/` directory**: All test files properly organized and categorized  
- **New `/tools/` directory**: Development utilities and helper scripts  

#### 🚀 Interactive Demos  

- **Smart Contract Demo**: Full-featured HTML demo showcasing covenant creation, preimage parsing, script building, and UTXO generation
- **Web3Keys Demo**: Interactive key generation and cryptographic operations demonstration
- **Local development server**: Easy setup for testing demos locally

## [3.3.0] - 2025-10-22

### 🚀 MAJOR RELEASE: Legal Token Protocol (LTP) & Global Digital Attestation Framework (GDAF)

#### Revolutionary Legal Token Protocol Framework

- **Complete Legal Token Protocol (LTP)**: 6-module comprehensive legal framework
  - **lib/ltp/anchor.js**: Blockchain anchoring preparation primitives
  - **lib/ltp/registry.js**: Token registry management primitives  
  - **lib/ltp/claim.js**: Legal claim validation and attestation primitives
  - **lib/ltp/proof.js**: Cryptographic proof generation primitives
  - **lib/ltp/right.js**: Legal rights token creation and validation primitives
  - **lib/ltp/obligation.js**: Legal obligation token management primitives

#### Primitives-Only Architecture Philosophy

- **No Blockchain Publishing**: Library provides preparation functions only
- **External System Integration**: Perfect for enterprise and custom implementations

#### 📚 Documentation Enhancements- **Maximum Flexibility**: Choose your own blockchain, storage, and UI frameworks

- **Complete API documentation**: Detailed reference for all modules and classes- **Clean Separation**: Cryptographic correctness separated from application logic

- **Getting Started guides**: Step-by-step tutorials for new developers

- **Advanced development guides**: In-depth coverage of complex topics#### Legal Token Framework Components

- **Migration documentation**: Guidelines for upgrading from previous versions- **46 LTP Primitive Methods**: Complete coverage across all legal token operations

- **Technical specifications**: Detailed implementation documentation  - 4 Right Token Primitives (prepare, verify, transfer, validate)

  - 5 Obligation Token Primitives (create, verify, fulfill, breach assessment, monitoring)

### 🔧 Technical Improvements  - 5 Claim Validation Primitives (validate, attest, dispute, bulk processing, templates)

  - 6 Proof Generation Primitives (signature, selective disclosure, ZK, legal validity)

#### ✅ Test Suite Enhancements  - 8 Registry Management Primitives (registry setup, registration, approval, revocation, queries)

- **Fixed opcode mapping tests**: Updated tests to reflect Chronicle string operations (OP_SUBSTR, OP_LEFT, OP_RIGHT)  - 4 Blockchain Anchoring Primitives (commitment, batch processing, verification, revocation)

- **Corrected opcode count**: Updated from 118 to 121 elements to include new Chronicle opcodes

- **Perfect test coverage**: All 534 tests now pass (100% success rate)#### W3C-Compliant Legal Standards

- **Updated reverseMap validation**: Fixed OP_NOP7 position validation (was incorrectly expecting OP_NOP10)- **PropertyTitle**: Complete property ownership claim schema

- **VehicleTitle**: Vehicle ownership and transfer documentation

#### 🛠️ Build System Updates- **PromissoryNote**: Financial obligation and debt instruments

- **Enhanced webpack configurations**: Improved build processes for all modules- **IntellectualProperty**: IP rights and licensing framework

- **Updated bundle outputs**: Refreshed all minified bundles with latest optimizations- **ProfessionalLicense**: Professional certification and licensing

- **Better development workflow**: Streamlined build and test processes- **MusicLicense**: Music rights and royalty management



#### 🧹 Code Quality Improvements#### Global Digital Attestation Framework (GDAF)

- **Linting fixes**: Resolved JavaScript Standard Style violations across utility files- **6-Module GDAF Implementation**: Complete W3C Verifiable Credentials compliance

- **Unused import cleanup**: Removed unused dependencies and imports  - **lib/gdaf/attestation.js**: Digital attestation creation and verification

- **Syntax compatibility**: Fixed ES2020 optional chaining for broader compatibility  - **lib/gdaf/identity.js**: Decentralized identity management

- **Code organization**: Better separation of concerns and cleaner file structure  - **lib/gdaf/registry.js**: Attestation registry and discovery

  - **lib/gdaf/credential.js**: W3C Verifiable Credentials implementation

### 🔒 Chronicle Integration  - **lib/gdaf/proof.js**: Cryptographic proof systems

- **OP_SUBSTR support**: Full implementation of substring operations  - **lib/gdaf/verification.js**: Multi-layer verification framework

- **OP_LEFT support**: Left substring extraction functionality  

- **OP_RIGHT support**: Right substring extraction functionality#### Enhanced Cryptographic Primitives

- **Updated opcode mappings**: Proper integration of Chronicle string operations into opcode system- **Shamir Secret Sharing**: Complete k-of-n threshold cryptography

  - **lib/crypto/shamir.js**: Production-ready SSS implementation

### 📦 Module Improvements  - **bsv.createShares()**: Split secrets into threshold shares

  - **bsv.reconstructSecret()**: Reconstruct from threshold shares

#### 💎 Utility Enhancements  - **bsv.verifyShares()**: Validate share integrity

- **Blockchain state management**: Improved simulation and state tracking

- **UTXO management**: Enhanced UTXO generation and management tools### 🎯 Complete Legal Token Workflow Example

- **Transaction examples**: Comprehensive transaction building examples

- **Miner simulation**: Better blockchain mining simulation for development#### Real BSV Integration Demonstration

- **Success demonstration**: Working examples of successful operations- **Real Private Keys**: Actual BSV addresses and WIF keys generated

- **Mock UTXO System**: Complete testing framework without blockchain dependency

### 🐛 Bug Fixes- **Smart Contract Covenants**: Legal token enforcement through BSV covenants

- **Fixed demo script paths**: Corrected relative paths in HTML demos- **End-to-End Workflow**: From claim creation to token transfer with covenant validation

- **Resolved test failures**: All opcode-related test issues resolved

- **Build output corrections**: Fixed webpack output paths and configurations#### Example Results from `complete_ltp_demo.js`:

- **Import path fixes**: Corrected module import paths across the codebase- Property Right Token: `RT-1bd80ac44e27c3ec0f9dffdd2efffe07`

- Obligation Token: `OB-e87eb0388db36b8b5777118ae45c46d3`

### 🔄 Backwards Compatibility- Covenant Address: `1MhX6MRVE79Qn4CtQ6bkk5JJJeMCTXBwwo`

- **Maintained API compatibility**: All existing APIs remain functional- Transfer Transaction: `4b1125d5dfc53e0157b843b8d2e964922331dd509ca096f9a470bfda421b43e6`

- **Legacy file preservation**: Old files archived rather than deleted

- **Migration support**: Clear upgrade paths for existing applications### 🏗️ Architecture Excellence

- **Version consistency**: No breaking changes to core functionality

#### Interface Transformation

### 📈 Performance Improvements**Before (Application Framework):**

- **Optimized bundles**: Reduced bundle sizes through better webpack configurations```javascript

- **Faster tests**: Improved test execution speed through better organizationbsv.createRightToken()     // Created AND published to blockchain

- **Enhanced development experience**: Faster build times and better error reportingbsv.validateLegalClaim()   // Validated AND stored in database

bsv.anchorTokenBatch()     // Created batch AND sent transaction

### 🎯 Developer Experience```

- **Interactive learning**: Hands-on demos for understanding SmartLedger-BSV capabilities

- **Better documentation**: Clear examples and comprehensive API coverage**After (Primitives-Only):**

- **Improved debugging**: Better error messages and debugging tools```javascript

- **Development tools**: Enhanced utilities for blockchain developmentbsv.prepareRightToken()           // Prepares token structure only

bsv.prepareClaimValidation()      // Validates structure only  

### 📋 Quality Assurancebsv.prepareBatchCommitment()      // Prepares commitment only

- **Complete test coverage**: 534/534 tests passing```

- **Linting compliance**: Full JavaScript Standard Style compliance

- **Build verification**: All builds complete successfully### 🛠️ New Development Tools & Testing

- **Cross-platform compatibility**: Verified functionality across different environments

#### Comprehensive Demo Suite

---- **complete_ltp_demo.js**: Full end-to-end LTP workflow with real BSV keys

- **simple_demo.js**: Architectural overview and primitives showcase

## Previous Versions- **architecture_demo.js**: Before/after comparison demonstration

- **gdaf_demo.js**: Complete GDAF framework demonstration

### [3.3.2] and earlier- **shamir_demo.js**: Threshold cryptography examples

Previous version history is available in the git commit log. This changelog format starts with version 3.3.3.

#### New NPM Scripts

---- **`npm run test:ltp`**: Complete Legal Token Protocol demonstration

- **`npm run test:ltp-primitives`**: Primitives-only architecture showcase

### 🚀 Getting Started- **`npm run test:architecture`**: Architectural transformation comparison



To get started with SmartLedger-BSV v3.3.4:

### 📦 Enhanced Build System

```bash
npm install @smartledger/bsv@3.3.4
```

#### New Standalone Modules

- **bsv-ltp.min.js**: Complete Legal Token Protocol standalone module

```- **bsv-shamir.min.js**: Standalone Shamir Secret Sharing module

- **bsv-gdaf.min.js**: Complete GDAF framework module

Check out the interactive demos:

```bash#### Updated Keywords & Metadata

cd demos```json

python3 -m http.server 8080"legal-token-protocol", "ltp", "legal-tokens", "primitives-only",

# Open http://localhost:8080"legal-compliance", "property-rights", "obligations", "attestations",

```"gdaf", "global-digital-attestation", "w3c-credentials", 

"verifiable-credentials", "shamir-secret-sharing", "threshold-cryptography"

### 📖 Documentation```



- **API Reference**: `/docs/api/`### 💫 Enterprise Integration Benefits

- **Getting Started**: `/docs/getting-started/`

- **Examples**: `/examples/`#### For Developers

- **Demos**: `/demos/`- ✅ Choose any blockchain platform (BSV, Bitcoin, Ethereum, etc.)

- ✅ Choose any storage solution (SQL, NoSQL, IPFS, etc.)

### 🔗 Links- ✅ Full architectural control and system integration

- ✅ Easy integration with existing business systems

- **GitHub**: https://github.com/codenlighten/smartledger-bsv

- **NPM**: https://npmjs.com/package/@smartledger/bsv#### For Enterprises  

- **Documentation**: https://github.com/codenlighten/smartledger-bsv/tree/main/docs- ✅ No vendor lock-in to specific platforms
- ✅ Compliance with existing IT policies
- ✅ Legacy system compatibility
- ✅ Audit-friendly separation of concerns

#### For Security & Legal
- ✅ Isolated cryptographic operations
- ✅ Standardized legal token structures
- ✅ Predictable, deterministic behavior
- ✅ Regulatory compliance primitives

### 🔄 Migration from v3.2.x

#### Backward Compatibility
- All existing APIs remain functional
- New primitives-only methods added alongside existing functionality
- Gradual migration path available for existing applications

#### Recommended Migration Steps
1. Test new LTP primitives with existing data structures
2. Gradually replace direct blockchain operations with preparation primitives
3. Implement external systems for blockchain publishing and storage
4. Enjoy increased flexibility and architectural control

---

## [3.2.0] - 2025-10-19

### 🚀 MAJOR RELEASE: JavaScript-to-Bitcoin Script Framework

#### Revolutionary JavaScript-to-Script Translation System
- **Complete Opcode Mapping**: All 121 Bitcoin Script opcodes mapped to JavaScript functions
  - Categorized into 13 functional groups (constants, stack, arithmetic, crypto, data, etc.)
  - Proper Bitcoin Script number encoding/decoding with `scriptNum` utilities
  - Stack behavior simulation for testing and debugging
  - Real-time script execution traces with before/after stack states

#### High-Level Covenant Builder API
- **CovenantBuilder Class**: Fluent JavaScript interface for building complex covenant logic
  - Method chaining for intuitive covenant construction
  - Automatic ASM generation from JavaScript operations
  - Preimage field extraction utilities with LEFT/RIGHT/DYNAMIC strategies
  - Template-based patterns for common covenant types
- **CovenantTemplates Library**: Pre-built covenant patterns
  - Value Lock: Ensures output value matches expected amount
  - Hash Lock: Requires preimage that hashes to expected value
  - Multi-Signature with Validation: Combines signature requirements with field validation
  - Time Lock: Enforces locktime constraints
  - Complex Validation: Multi-field validation with range checks

#### Enhanced SmartContract Module Integration
- **New JavaScript-to-Script API Methods**:
  - `SmartContract.createCovenantBuilder()` - Factory for covenant builders
  - `SmartContract.createValueLockCovenant(value)` - Quick value lock creation
  - `SmartContract.simulateScript(operations)` - JavaScript script simulation
  - `SmartContract.createASMFromJS(operations)` - ASM generation from JS operations
  - `SmartContract.getOpcodeMap()` - Access to complete opcode mapping

#### Real-Time Script Simulation Engine
- **JavaScript Stack Simulation**: Complete Bitcoin Script execution in JavaScript
- **Step-by-Step Debugging**: Detailed execution history with stack visualization
- **Error Detection**: Comprehensive validation and debugging capabilities
- **Performance Analysis**: Operation counting and optimization suggestions

### 🔧 Technical Implementation Details

#### Bitcoin Script Number Encoding
- Proper implementation of Bitcoin Script's variable-length integer encoding
- Automatic conversion between JavaScript numbers and Bitcoin Script format
- Support for negative numbers with sign bit handling

#### Stack Manipulation Engine
- Complete Bitcoin Script stack simulation with main and alt stacks
- Proper implementation of all stack operations (DUP, SWAP, DROP, PICK, ROLL, etc.)
- Buffer-based data handling matching Bitcoin Script behavior

#### Preimage Field Extraction Strategies
- **LEFT Strategy**: Extract fields from beginning of preimage (nVersion, hashPrevouts, etc.)
- **RIGHT Strategy**: Extract fields from end of preimage (value, nSequence, etc.)
- **DYNAMIC Strategy**: Context-dependent extraction (scriptLen, scriptCode)

### 📊 Testing and Validation
- **100% Test Coverage**: All 121 opcodes tested and validated
- **Integration Testing**: Seamless compatibility with existing preimage extraction
- **Performance Testing**: Optimized for production deployment
- **Documentation Testing**: All examples verified and working

### 🎨 Usage Examples Added
```javascript
// Simple value lock covenant
const valueLock = SmartContract.createValueLockCovenant('50c3000000000000');
const script = valueLock.build();

// Custom covenant with field validation
const custom = SmartContract.createCovenantBuilder()
  .extractField('value')
  .push('50c3000000000000')
  .equalVerify()
  .push(1);

// Script simulation
const result = SmartContract.simulateScript(['OP_1', 'OP_2', 'OP_ADD']);
```

### 📚 Enhanced Documentation
- **Comprehensive JavaScript-to-Script Guide**: Complete usage documentation
- **Opcode Reference**: All 121 opcodes with descriptions and examples
- **Covenant Builder API**: Detailed method documentation with examples
- **Template Patterns**: Common covenant patterns and usage guidelines

## [3.1.1] - 2025-10-19

### 🎯 Major Features Added

#### Advanced Covenant Framework
- **BIP143 Compliant Preimage Parsing**: Complete field-by-field parsing with proper type conversion
  - Enhanced CovenantPreimage class with little-endian value accessors
  - Variable-length field parsing (scriptCode with varint handling)  
  - Comprehensive 108+ byte structure validation
  - Direct field access (nVersionValue, amountValue, nSequenceValue, etc.)
- **nChain PUSHTX Integration**: Academic research-based in-script signature generation (WP1605)
  - In-script signature generation using s = z + Gx mod n formula
  - Generator point optimization (k=a=1) for efficiency
  - DER canonicalization preventing transaction malleability
  - Message construction following BIP143 structure
- **Perpetually Enforcing Locking Scripts (PELS)**: Ongoing rule enforcement across transaction chains
  - Forces all future transactions to maintain same locking script
  - Configurable fee deduction per transaction (e.g., 512 satoshis)
  - Value preservation with automatic fee adjustment
- **Transaction Introspection**: Selective transaction field validation via preimage analysis

#### Enhanced API Design
- **CovenantInterface Class**: High-level abstractions for covenant development
- **CovenantTransaction Wrapper**: Transaction class with covenant-specific methods
- **CovenantPreimage Class**: Detailed BIP143 preimage parsing

### 📚 Documentation Enhancements
- **Advanced Covenant Development Guide**: Complete BIP143 + PUSHTX techniques
- **Reorganized Documentation Structure**: Clear hierarchy with cross-references
- **Working Examples**: Complete covenant demonstrations and patterns

### 🔧 Technical Improvements
- **Security Enhancements**: Parameter fixing, DER canonicalization, validation
- **Performance Optimizations**: Alt stack usage, preimage caching, script size reduction
- **Developer Experience**: Simplified APIs, template system, enhanced error messages

## [3.0.2] - 2025-10-18

### 🔧 Fixed
- **CRITICAL**: Fixed signature verification bug that caused all ECDSA.verify() calls to return false
- **CRITICAL**: Fixed SmartVerify.smartVerify() failure when processing DER-encoded signatures
- Fixed ECDSA.set() method to automatically parse DER buffers to Signature objects for compatibility
- Fixed double canonicalization issue in ECDSA.sigError() that corrupted signature verification
- Fixed SmartVerify.isCanonical() to properly handle DER buffer inputs
- Enhanced backward compatibility for both canonical and non-canonical signature inputs

### ✨ Added
- **NEW**: SmartUTXO - Comprehensive UTXO management system for BSV development and testing
- **NEW**: SmartMiner - BSV blockchain miner simulator with full transaction validation
- **NEW**: Signature verification validation test suite (`npm run test:signatures`)
- **NEW**: CustomScriptHelper - Simplified API for custom BSV script development
- **NEW**: CDN Bundle System - Multiple distribution formats for different use cases
- **NEW**: Blockchain state management with persistent JSON storage
- **NEW**: Mock UTXO generation for testing and development
- **NEW**: Transaction mempool simulation and block mining
- **NEW**: Enhanced development tools for BSV application testing

### 🚀 Enhanced
- Improved signature verification pipeline for external developer compatibility
- Enhanced DER buffer parsing throughout the crypto modules
- Added comprehensive logging and debugging capabilities for development tools
- Improved error handling and validation in signature processing
- Added compatibility layer for mixed signature formats (DER buffers + Signature objects)

### 📦 Developer Experience
- Added `validation_test.js` for signature verification testing
- Exposed `bsv.SmartUTXO` and `bsv.SmartMiner` modules in main API
- Enhanced npm scripts with signature testing capabilities
- Added comprehensive documentation for new UTXO management features
- Included utilities/ directory in npm package for developer access

### 🐛 Bug Impact
- **Before**: External developers importing smartledger-bsv experienced 100% signature verification failure
- **After**: All signature verification methods now work correctly with 100% success rate
- **Affected Methods**: ECDSA.verify(), SmartVerify.smartVerify(), SmartVerify.isCanonical()
- **Root Cause**: Double canonicalization and improper DER buffer handling in verification pipeline
- **Solution**: Enhanced signature object parsing and canonical verification logic

### 📊 Validation Results
```
Test Results: 14/14 tests passed (100% success rate)
✅ ECDSA.verify(hash, derSig, publicKey): true
✅ ECDSA.verify(hash, canonicalDer, publicKey): true  
✅ ECDSA.verify(hash, signature, publicKey): true
✅ SmartVerify.smartVerify(hash, derSig, publicKey): true
✅ SmartVerify.smartVerify(hash, canonicalDer, publicKey): true
✅ SmartVerify.isCanonical(derSig): true
✅ SmartVerify.isCanonical(canonicalDer): true
```

## [3.0.1] - 2025-10-19

### 🔒 Security
- Security-hardened Bitcoin SV library with zero known vulnerabilities
- Enhanced signature canonicalization and malleability protection  
- Fixed elliptic curve vulnerabilities from upstream dependencies
- Implemented SmartVerify hardened verification module

### 🏗️ Infrastructure  
- Complete drop-in replacement for bsv@1.5.6
- Maintained full API compatibility while enhancing security
- Added comprehensive security feature documentation
- Enhanced error handling and input validation

---

## Migration Guide

### From v3.0.1 to v3.0.2

**No Breaking Changes** - This is a bug fix release that maintains full backward compatibility.

**New Features Available:**
```javascript
const bsv = require('smartledger-bsv');

// New UTXO Management System
const utxoManager = new bsv.SmartUTXO();
const balance = utxoManager.getBalance('1A1zP1eP5QGefi2DMPTfTL5SLmv7DivfNa');

// New Miner Simulator
const miner = new bsv.SmartMiner(bsv);
const accepted = miner.acceptTransaction(transaction);
const block = miner.mineBlock();

// Signature verification now works correctly
const verified = bsv.crypto.ECDSA.verify(hash, derSig, publicKey); // Now returns true
const smartVerified = bsv.SmartVerify.smartVerify(hash, derSig, publicKey); // Now returns true
```

**Testing Your Integration:**
```bash
npm run test:signatures  # Validates signature verification works correctly
```

---

## Support

- **GitHub**: https://github.com/codenlighten/smartledger-bsv
- **Issues**: https://github.com/codenlighten/smartledger-bsv/issues
- **Email**: hello@smartledger.technology