# Security Policy

Thank you for helping keep `@smartledger/bsv` and its users safe.

## Supported Versions

Security fixes are applied to the latest major release line. Earlier releases
are not patched; please upgrade. **Versions ≤ 3.4.5 contain three known,
exploitable vulnerabilities in the GDAF credential verification path (see
CHANGELOG `## [4.0.0]`); upgrade to 4.x is strongly recommended.**

| Version | Supported          |
| ------- | ------------------ |
| 4.x     | :white_check_mark: |
| 3.4.x   | :x: (contains known credential-verification vulnerabilities; upgrade to 4.x) |
| < 3.4   | :x:                |

## Reporting a Vulnerability

**Please do not report security vulnerabilities through public GitHub issues,
discussions, or pull requests.**

Report privately via either of:

- **GitHub Security Advisories** (preferred):
  <https://github.com/codenlighten/smartledger-bsv/security/advisories/new>
- **Email:** `hello@smartledger.technology`

When reporting, please include as much of the following as you can:

- Affected version(s) and platform (Node.js version, browser, CDN vs. npm)
- A minimal reproduction (code snippet, transaction hex, or test vector)
- Impact assessment — what an attacker can do with the bug
- Any suggested mitigation

We aim to acknowledge new reports within **3 business days** and to provide a
remediation timeline within **10 business days**. Coordinated disclosure is
appreciated; we will credit reporters in the release notes unless you prefer
to remain anonymous.

## In Scope

- Cryptographic correctness bugs in `lib/crypto/` (ECDSA, BN, Hash, Random,
  Point, Signature, Shamir).
- Signature/transaction malleability or forgery affecting the default verify
  path (`lib/crypto/ecdsa.js`) or the opt-in helpers (`SmartVerify`,
  `EllipticFixed`).
- Key-generation, HD-derivation (BIP-32), or mnemonic (BIP-39) flaws that
  weaken entropy or leak material.
- Issues in DID:web, VC-JWT, StatusList2021, or Anchor modules that allow
  forgery, replay, or unauthorized revocation.
- Bugs in BIP-143 preimage handling, covenant construction, or LTP/GDAF
  signing paths.
- Supply-chain concerns about pinned runtime dependencies
  (`bn.js@4.12.3`, `bs58@4.0.1`, `@noble/*`, etc.). The runtime dependency
  tree carries **no known advisories** (`npm audit --omit=dev` is clean);
  `elliptic` was dropped from the runtime/bundle path in 5.4.0.

## Out of Scope

- Vulnerabilities in development-only dependencies (`webpack 4`, `standard 12`,
  `mocha`, `nyc`, `crypto-browserify`, etc.). These never reach installers — the
  published tarball ships no `node_modules` and none are listed under
  `dependencies`. The remaining `npm audit` findings (currently 17, all
  dev-only) are either upstream-blocked — `mocha`/`nyc` are already at their
  latest releases but still range-pin affected transitives (`diff`,
  `serialize-javascript`, nested `js-yaml`) — or require the deferred
  `standard@17` lint migration (`eslint`/`inquirer`/`tmp` chain) and the
  `crypto-browserify` browser-build chain. They are accepted dev-only risk and
  tracked separately.
- Issues that require a malicious local environment (compromised Node, browser
  extension, or filesystem) to exploit.
- Denial-of-service from intentionally malformed inputs that do **not** cross
  a trust boundary (e.g., feeding garbage to a library function in your own
  process and observing it throw).
- Stylistic, naming, or documentation issues unrelated to security claims —
  please open a regular issue or PR for those.

## Security Posture

`@smartledger/bsv` ships **opt-in** hardening helpers — `bsv.SmartVerify`,
`bsv.EllipticFixed`, and `signature.toCanonical()` — that you must call
explicitly. The default `transaction.verify()` / `signature.verify()` /
`Message().verify()` paths use BSV's own pure-JS ECDSA in
`lib/crypto/ecdsa.js` and are **not** routed through `SmartVerify`.

See the [Security section of the README](./README.md#-security) for the full
"what's in the box" table and usage examples for the opt-in helpers. A
planned 3.5.0 will offer an opt-in flag to route the default verify path
through `SmartVerify` so the protection is on by default for new users.

## Disclosure History

Significant security-relevant changes are documented in
[`CHANGELOG.md`](./CHANGELOG.md). Recent entries of note:

- **3.4.2 / 3.4.3** — corrected documentation overclaims about which
  hardening is on by default vs. opt-in.
- **3.4.1** — `Transaction.shuffleOutputs()` now draws entropy from
  `bsv.crypto.Random` (CSPRNG) instead of `Math.random`.
