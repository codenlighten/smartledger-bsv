# Changelog

All notable changes to SmartLedger-BSV will be documented in this file.

The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.0.0/),
and this project adheres to [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

## [Unreleased]

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