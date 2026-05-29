# Changelog

All notable changes to SmartLedger-BSV will be documented in this file.

The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.0.0/),
and this project adheres to [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

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