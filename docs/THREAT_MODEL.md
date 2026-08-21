# Threat model — `@smartledger/bsv`

This document states, property by property, **what the library guarantees, under what
assumptions, and which adversarial test proves each guarantee.** It is deliberately
honest about what is *not* guaranteed. Every ``test/…`` path referenced here is checked
to exist by `test/security/threat_model_coverage.js`, so this document cannot drift from
the suite (the same "docs are tested claims" principle behind the type-drift gate).

The guiding principle, learned the hard way (see `SECURITY.md` → 6.0.0): **verification
fails closed by construction** — a verify function returns a strict boolean or throws,
never a truthy object that can be mistaken for success — and **every security property
ships an adversarial test that asserts the *bad* input is rejected.**

## 1. Assets and trust boundaries

| Asset | Boundary | What must not happen |
| --- | --- | --- |
| Private keys / entropy | key-gen, HD derivation, CSPRNG | weak/predictable keys; entropy from `Math.random` |
| ECDSA signatures | `verify` / `verifyBool` | a forged signature verifying as valid (fail-open) |
| On-chain covenants | the Script interpreter | spending a covenant UTXO in a way the covenant forbids |
| Ordinal listings | the OrdLock covenant | taking the ordinal without paying the seller/royalty/fee |
| Credentials / DIDs | JWS verify + issuer binding | forged/tampered/attacker-issuer credentials accepted |
| Revocation status | StatusList2021 verify | a revoked credential reading as valid (bypass) |
| SPV inclusion | Merkle branch + header PoW | a transaction "proven" included when it is not |

The trust boundary is the **verify / enforce** call. Inputs on the far side are treated
as adversarial. Callers on the near side are trusted (a malicious local process, patched
Node, or hostile browser extension is out of scope — see `SECURITY.md`).

## 2. Security properties and the tests that enforce them

### 2.1 Signature verification fails closed

- Static `crypto.ECDSA.verify` and `SmartVerify.smartVerify` return a **strict boolean**
  and **reject a forged signature** (wrong key); `ECDSA.prototype.verifyBool()` is the
  safe boolean path. The instance `verify()` returns the instance (documented trap) — its
  contract is pinned so a regression to fail-open trips a red test.
  → `test/security/fail_closed_contracts.js`
- The hardened curve produces **low-S canonical** signatures, keeps `recoveryParam`
  consistent, **rejects zero / out-of-range `r`,`s`**, and **returns `false` (never
  throws) on malformed signatures**.
  → `test/crypto/elliptic-fixed.js`

### 2.2 Covenants enforce their spend rule

- The OP_PUSH_TX core, Token state-machine, and value covenants are **interpreter-verified**:
  a spend that violates the covenant is rejected by the consensus interpreter.
  → `test/smart_contract/covenants.js`, `test/smart_contract/token_generalized.js`,
  `test/smart_contract/ordinal_transfer.js`
- **Ordinal marketplace (OrdLock):** the ordinal cannot be taken without recreating the
  required payment(s) byte-for-byte — underpaying the seller, redirecting a royalty/fee, or
  cancelling with the wrong key are all rejected; tampering any output after signing breaks
  the covenant.
  → `test/ordinals/ordlock.js`

### 2.3 Credential / token verification fails closed (C1–C4)

- A **tampered JWS** signature is rejected; a token **re-signed by an attacker but attributed
  to the victim issuer** is rejected (issuer-key binding, C4); `verifyOwnership` **rejects a
  signature by the wrong key** (C2); `verifyAnchor` **refuses to fabricate success** without a
  real chain proof (C3); `prepareRightTokenTransfer` **rejects a non-owner** transfer.
  → `test/ltp/verify_failclosed.js`

### 2.4 Revocation cannot be bypassed

- A status list whose **bitstring was tampered without re-signing** is rejected; reading
  **refuses without a pinned `expectedIssuerDid`**; a list **signed by a different (attacker)
  issuer** under the victim DID is rejected.
  → `test/statuslist/failclosed.js`

### 2.5 SPV inclusion cannot be forged

- `verifyMerkleProof` recomputes the root for every leaf (cross-checked against
  `Block.getMerkleTree`), **rejects a tampered branch node** and the **right proof against the
  wrong txid**; `verifyTxInclusion` binds the branch to a header's merkle root.
  → `test/spv/merkleproof.js`
- `verifyHeaderChain` **rejects a broken link** and a **header that fails proof-of-work**, and
  honours a trusted-hash checkpoint.
  → `test/spv/headerchain.js`

### 2.6 Secret sharing does not leak

- Shamir shares do **not** embed a hash of the secret by default (checksum is opt-in), so a
  sub-threshold holder cannot brute-force a low-entropy secret offline.
  → `test/crypto/shamir.js`

### 2.7 The type surface does not lie

- `bsv.d.ts` declares only APIs that exist at runtime, and the modules added in 6.x stay fully
  typed (parsed via the TypeScript AST).
  → `test/types/dts_drift.js`

## 3. Trust assumptions and known limitations (honest)

- **The inherited crypto/tx/script core has not been independently audited by us.** This
  library forks `moneybutton/bsv` ← `bitpay/bitcore-lib`. We hardened the layer where the
  6.0.0 bugs lived (verification/enforcement) and test the trust boundaries adversarially,
  but the underlying EC math (`@noble/curves@2`, audited upstream), BN, and script primitives
  are **trusted, not re-audited here**. An external audit is the top open item.
- **`ECDSA.prototype.verify()` remains a footgun** (returns the instance). Mitigated by
  `verifyBool()`, types, and a pinning test; **removal is planned for the next major.**
- **`verifyHeaderChain` does not validate difficulty retargeting** — it checks linkage and
  per-header PoW, not that the difficulty is correct for the height. Anchor confirmations
  should therefore be pinned to a **trusted checkpoint hash**; this is by design and
  documented in `lib/spv/headerchain.js`.
- **`verifyAnchor`** is trustless only on the `{spvProof, header/headerChain, rawTx}` path;
  the `chainProvider` path trusts the injected provider.
- **No published provenance yet.** Bundles are a reproducible build of source (see §4) but
  npm provenance attestation is pending a trusted-publisher registration (2FA-gated). This is
  a *supply-chain verifiability* gap, not a code vulnerability.
- **CLTV time locks removed (9.0.0).** `Locks.timeLockCLTV`, `Locks.htlc` and
  `CustomScriptHelper.createTimelockScript` were gated by `OP_CHECKLOCKTIMEVERIFY`,
  which Genesis reverted to an upgradable NOP for outputs created after it. They
  enforced **nothing** on mainnet — the coins were spendable immediately — yet the
  library's own tests asserted the lock held, because the covenant harness verified
  under flags missing the era bits. That is the §1 failure mode found in our own code,
  and the reason the API was deleted rather than documented: a time lock that does not
  lock has no safe use. There is no supported time-lock primitive in this library.
- **Consensus era.** Covenant guarantees assume current BSV mainnet; the harness verifies
  under `Interpreter.mainnetFlags()` with no opt-in required (8.4.0+).

## 4. Supply chain / reproducible builds

- The published `*.min.js` / `*.bundle.js` are a **byte-for-byte reproducible build** of
  `lib/` — CI rebuilds them and fails if they differ (the "Build & bundle integrity" gate),
  and the build is deterministic across Node 20 and 22.
- The published tarball ships **no `node_modules`**; the runtime dependency set is small and
  pinned, and `elliptic` was removed from the runtime/bundle path (6.x uses `@noble/curves`).
- Merges are gated on the full test suite (Node 20 + 22), a pristine scoped lint of the
  audited modules, a whole-repo lint ratchet, and the type-drift gate.

## 5. Reporting

See [`SECURITY.md`](../SECURITY.md) for private disclosure. Do not open public issues for
vulnerabilities.
