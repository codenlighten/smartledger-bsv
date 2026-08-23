# Stability policy

## The commitment

**`@smartledger/bsv` 9.x will not break your code until at least 2027-09-01.**

Until that date this package ships patch and minor releases only. No 10.0.0.

## Why this document exists

Between 2026-05-31 and 2026-08-21 — 82 days — this library published six major
versions:

| version | date |
|---|---|
| 4.0.0 | 2026-05-31 |
| 5.0.0 | 2026-06-14 |
| 6.0.0 | 2026-07-12 |
| 7.0.0 | 2026-07-16 |
| 8.0.0 | 2026-08-13 |
| 9.0.0 | 2026-08-21 |

83 releases in 307 days, about one every four days.

A major version is a promise that the consumer's code breaks. Made six times a
quarter, that promise is one no team can plan around, and no amount of
correctness in the releases compensates for it. Cryptography libraries are
infrastructure; infrastructure that moves this fast is not infrastructure.

The releases were not gratuitous. Most encoded a real finding — Genesis reverted
`OP_CLTV`/`OP_CSV` to NOPs, so the CLTV locks guaranteed nothing and were removed
in 9.0.0; covenant verification was applying pre-Genesis limits and was corrected
in 8.4.0. Those calls were right. **The diagnosis was never the problem. The
delivery was.** An API found to be wrong was changed to `throw` in the same
release that found it, which converts every correctness fix into a breaking
change.

## How correctness ships now

Deprecating is a non-breaking act. It belongs in a minor.

```
minor    Mark it. Callers see a one-line warning naming the replacement and the
         version that will remove it. Their code keeps working.

major    Remove it, on a schedule that has been in consumers' logs for at
         least one full minor cycle.
```

`lib/util/deprecate.js` implements this. It warns once per API per process,
records every notice for tooling, is silenced with
`BSV_NO_DEPRECATION_WARNINGS=1`, and **never throws** — a deprecation that throws
is a breaking change wearing a warning's name.

```js
var deprecate = require('./lib/util/deprecate')

Klass.prototype.old = deprecate.fn(Klass.prototype.old, {
  what: 'Klass#old',
  since: '9.1.0',
  removeIn: '10.0.0',
  use: 'Klass#replacement',
  why: 'it does not constrain the spend'
})
```

The effect is that correctness fixes ship continuously while breakage batches
into one planned major, and by the time that major lands the migration path has
already been printing in the consumer's terminal for months.

### The one exception

An API that can **lose funds** may be made to throw inside a minor. A covenant
that silently enforces nothing is not a compatibility question. When this
happens the release notes say so at the top, and the error message names the
replacement and an explicit opt-out for callers who know what they are doing —
as `SmartContract.Builder` does with `{ allowNonEnforcing: true }`.

This exception is deliberately narrow. "Wrong" is not "dangerous." Only loss of
funds qualifies.

### The two settings, worked

Both of these were APIs that threw with no warning period. They were resolved
differently, and the difference is the whole policy:

**`MerkleBlock#filterdTxsHash` now warns and delegates.** The name is a
misspelling of `filteredTxsHash` — missing an `e`. There is exactly one thing it
can mean, so making the typo fix a breaking change bought nothing. Restored in
9.1.0, removed in 10.0.0.

**`HDPrivateKey#derive` still throws.** Its two replacements return *different
keys*: `deriveChild` is BIP32-compliant, `deriveNonCompliantChild` reproduces the
old unpadded behaviour. Measured over 1600 derivations they disagree about **0.5%
of the time** — only when an intermediate private key serialises to under 32
bytes.

That rarity is the argument for throwing, not against it. A caller who switched
to a guessed default would pass every test they wrote and then derive
unrecoverable addresses for roughly one wallet in two hundred. A default that is
wrong half a percent of the time is more dangerous than one that is wrong always,
because nothing catches it. So the caller chooses, and the error names both
options.

The test for both lives in `test/deprecated_apis.js`.

## What is covered

Everything reachable from the documented public API: the top-level exports, the
`exports` subpaths in `package.json`, and the types in `bsv.d.ts`.

Not covered, and changeable in a minor:

- anything prefixed `_`
- `lib/**` paths reached by deep-requiring past the declared `exports`
- exact wording of error *messages* (the `errstr` **codes** are covered)
- the contents of `archive/`

## Consensus tracking

One thing overrides this policy: if BSV mainnet consensus changes, this library
follows it, in a minor, without waiting for a major. A library that stayed
compatible with a rule the network no longer enforces would be worse than
useless — it would be confidently wrong in the direction that costs money.

Consensus behavior is pinned by 452 conformance cases (`npm run conformance`)
generated against the reference implementation. Those vectors, not this
library's own opinion, define what "correct" means here.

## After 2027-09-01

If a 10.0.0 becomes necessary, it will be announced at least one minor in
advance, every removal in it will have been warning since 9.x, and a migration
guide will ship with the beta rather than after the release.
