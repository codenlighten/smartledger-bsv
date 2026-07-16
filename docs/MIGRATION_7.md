# Migrating to `@smartledger/bsv` 7.0

7.0 is a **breaking** major. It is small and mechanical to adopt: two changes,
both aimed at making the library structurally harder to misuse. This document is
the complete list of what changed and how to update.

> Status: **7.0.0-alpha.0** — preview on the `next/7.0` branch. Not yet published
> to npm. APIs below are final in intent; report friction before the stable cut.

---

## 1. `ECDSA.prototype.verify()` now returns a boolean

**Why.** Pre-7.0, the low-level instance method `ECDSA.prototype.verify()`
returned the ECDSA *instance* (to allow `.sign().verify()` chaining), with the
real pass/fail result stashed on `.verified`. Because an object is always truthy,
`if (ecdsa.verify()) { /* trusted */ }` **silently accepted forged signatures** —
the single most dangerous foot-gun in the library. This class of bug was found
and fixed at every internal call site during the 6.0 security hardening; 7.0
removes the trap itself so external code can't reintroduce it.

**What changed.** `verify()` now returns a strict `boolean`. The result is still
mirrored on `this.verified` as a side effect, so the property-read form keeps
working — only the *chained* `.verify().verified` idiom is gone.

### Before → After

```js
// ❌ pre-7.0 — the classic trap (always truthy, accepts forgeries)
if (ecdsa.verify()) { accept() }

// ✅ pre-7.0 workarounds (still valid in 7.0)
if (ecdsa.verify().verified) { accept() }   // chained read — REMOVED in 7.0
if (ecdsa.verifyBool()) { accept() }        // still works
ecdsa.verify(); if (ecdsa.verified) { ... } // still works
```

```js
// ✅ 7.0 — verify() is the boolean
if (ecdsa.verify()) { accept() }            // now correct and safe
const ok = ecdsa.verify()                   // ok is `true` / `false`
```

### Migration

| If your code does…            | Change it to…             |
| ----------------------------- | ------------------------- |
| `ecdsa.verify().verified`     | `ecdsa.verify()`          |
| `if (ecdsa.verify())` (buggy) | *nothing* — now correct   |
| `ecdsa.verifyBool()`          | *nothing* — retained alias |
| `x.sign().verify().sig` etc.  | split the chain: `x.sign().verify(); use x.sig` |

The **static** `ECDSA.verify(hash, sig, pubkey)` and the high-level
`Message.prototype.verify()` already returned booleans and are **unchanged**.
`verifyBool()` remains as an explicit alias.

---

## 2. `package.json` now declares an `exports` map

**Why.** A canonical entry point with a `types` / `import` / `require`
conditional map, so the package is unambiguous to modern bundlers and
type-checkers and ready for a real dual ESM build.

**What changed.** The following import surfaces are explicitly supported:

| Specifier                                   | Resolves to        |
| ------------------------------------------- | ------------------ |
| `@smartledger/bsv`                          | `index.js` (CJS + `import` default) |
| `@smartledger/bsv/package.json`             | `package.json`     |
| `@smartledger/bsv/version`                  | `version.js`       |
| `@smartledger/bsv/bsv.min.js` (any bundle)  | that bundle file   |
| `@smartledger/bsv/lib/foo` or `/lib/foo.js` | `lib/foo.js`       |

ESM default import now works directly:

```js
import bsv from '@smartledger/bsv'   // 7.0
```

### Breaking edge case

Because `exports` switches Node to strict subpath resolution, **directory-style
deep imports without an explicit file** are no longer resolved:

```js
require('@smartledger/bsv/lib/smart_contract')        // ❌ 7.0 — no auto /index.js
require('@smartledger/bsv/lib/smart_contract/index')  // ✅ point at the file
```

The **documented public API has always been the main entry** — prefer it:

```js
const { SmartContract } = require('@smartledger/bsv') // ✅ recommended
```

CDN usage (`unpkg` / `jsdelivr`) is unaffected — CDNs serve files by path and do
not apply `exports` resolution.

---

## Not changing in 7.0

- Wire formats, script/covenant semantics, transaction building, address/key
  formats — all unchanged.
- The 16 browser bundles and their globals.
- `engines.node >= 20.19` (already required since 6.0.2).

## Still on the roadmap (not in this alpha)

- A true dual **ESM build** (real `.mjs` output behind the `import` condition;
  today it maps to the CJS entry, which Node's interop imports cleanly).
- Removal of the residual `verified` side-effect property once downstreams have
  migrated.
