# `bn.js` 4 → 5: semantic review

**Date:** 2026-08-07 · **Versions compared:** 4.12.3 (pinned) vs 5.2.5 · **Verdict: do not upgrade yet — correctness is fine, bundle size is not.**

`bn.js` is the arithmetic layer beneath ECDSA, script numbers, transaction amounts and
HD derivation, so "the test suite passes" is not sufficient evidence for a major bump.
This is the review that was required instead.

## Method

Two independent lines of evidence, both run against the **real** `lib/crypto/bn.js`
wrapper and the consensus paths built on it — not against `bn.js` in isolation.

1. **Targeted differential harness** — 16 hand-picked values (zero, ±1, `n`, `n-1`,
   2⁵³, 2⁶⁴, high-bit-set, leading-zero-byte, negatives) crossed through every wrapper
   and arithmetic operation the library uses: `toString(10)`, `toString(16)`,
   `toString(16, 2)`, `toBuffer`, `toBuffer({size:32})`, little-endian variants,
   `toSM`/`fromSM`, `toScriptNumBuffer`/`fromScriptNumBuffer`, `add`, `sub`, `mul`,
   `div`, `mod`, `umod`, `cmp`, `neg`, `abs`, `shrn`, `ushrn`, `ushln`, `invm`, `gcd`,
   `pow`, `byteLength`, `bitLength`, plus ECDSA signing, WIF, addresses, public keys
   and HD derivation. **2,271 checks.**

2. **Randomised differential fuzz** — a deterministic sha256-chained PRNG (identical
   inputs on both runs) over 400 rounds of random 1–32 byte magnitudes, random signs,
   the same operation set, and a real deterministic ECDSA signature per round.
   **8,800 checks.**

Both versions were installed into a pristine copy of the repository in the same
container, and the JSON/line output diffed.

## Result

**11,071 checks. Zero differences.** Identical throw sites with identical messages
(11 under each — script-number overflow and negative-shift assertions, in both).

Specifically identical: **ECDSA DER signature bytes**, WIF encodings, addresses, public
keys, script-number serialisation across the interpreter's range, and HD child
derivation. No signature this library has ever produced would change.

## Documented v5 breaking changes vs. our call sites

| v5 change | Call sites in `lib/` |
| --- | --- |
| `.strip()` made internal | **0** |
| `.modn()` deprecated → `.modrn()` | **0** |
| negative-number fixes in `imuln`/`modrn`/`idivn` | **0** |
| `toArrayLike` refactor | **0** |
| `toBuffer` only defined when `Buffer` exists | **0** — our wrapper *overrides* `toBuffer` entirely |
| constructor rejects decimal strings | **0** — no decimal string is ever passed |
| stricter invalid-character parsing | the only one that reached us — see below |

The single `.toArray()` call site is the interpreter's `LSHIFT`/`RSHIFT` path. It is
covered by 74 bitcoind `script_tests` vectors, which pass identically under both
versions.

### The one change that reached us

v5 rejects invalid characters instead of silently skipping them. That is what surfaced
the latent defect fixed in **7.5.5**: `PrivateKey.fromObject` accepted a malformed `bn`
and returned a different, ~40-bit key rather than throwing. v5's behaviour is strictly
safer, and our fix is in this library's own validation, so it does not depend on the
upgrade.

## Why the upgrade is nonetheless declined

The `=4.12.3` pin in `package.json` is load-bearing for **deduplication**:

| root `bn.js` | copies inlined in `bsv.min.js` | size |
| --- | --- | --- |
| 4.12.3 (today) | 2 | 1,319,110 |
| 5.2.5 | 5 | 1,451,156 (**+132 KB, +10 %**) |

At 4.12.3, npm satisfies the transitive `^4` consumers (`asn1.js`, `miller-rabin`,
`public-encrypt`, `diffie-hellman`) from the hoisted root copy. Moving the root to 5.x
no longer satisfies `^4`, so each gets its own nested 4.12.5 — and those chains are part
of `crypto-browserify`, which **is** bundled. (`elliptic`, `browserify-sign` and
`create-ecdh` are stubbed out by the esbuild config and stay absent either way.)

So the upgrade costs every browser consumer 10 % more bundle for no functional gain:
there is no advisory against `bn.js` 4.x affecting this library, and no v5 feature it
needs.

## When to revisit

When the `crypto-browserify` dependency chain moves to `bn.js@^5`, deduplication is
restored and the upgrade becomes free. At that point this review's correctness findings
still stand and the bump can be taken directly.

## Reproducing

The harnesses are not committed (they need two conflicting versions of the same
dependency installed side by side). To rebuild them, run the wrapper surface and a
deterministic fuzz corpus under each version in a clean container and diff the output;
the operation list above is the required coverage.
