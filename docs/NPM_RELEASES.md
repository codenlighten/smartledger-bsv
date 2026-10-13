# What is published, and what state it is in

A complete inventory of every package and version this project has put on the public npm
registry, what is still wrong with each, and a recommended disposition. Facts read from the
registry on 2026-10-13; re-run `npm run check:npm-inventory` before acting on any of it, and
the suite fails if the package table below drifts from the registry.

**A published version is immutable.** It cannot be edited or replaced. The levers are:

| lever | effect | limits |
|---|---|---|
| `npm deprecate` | install prints a warning; the version stays installable | reversible, but does not un-show a warning already seen |
| `npm unpublish` | removes it | 72 hours only, and only with no dependents; afterwards needs npm support |
| `npm dist-tag` | moves `latest` and friends | no effect on an explicit `pkg@x.y.z` install |
| publish a new version | fixes it going forward | does nothing for anyone pinned to an old one |
| security advisory | shows up in `npm audit` | separate from deprecation; deprecation is NOT an advisory |

So "fixing a previous release" means deprecating it with an accurate message and shipping the
fix in a new version. Deprecation is the main tool, and it is reversible — but a warning
already printed into someone's CI log is not.

## Packages

| package | versions | deprecated | live | `latest` | first | last |
|---|---|---|---|---|---|---|
| `@smartledger/bsv` | 127 | 56 | 71 | 9.33.2 | 2025-10-18 | 2026-10-13 |
| `@smartledger/bsv-core` | 13 | 0 | 13 | 1.5.2 | 2026-09-30 | 2026-10-13 |
| `@smartledger/keys` | 23 | 0 | 23 | 4.0.0 | 2025-11-28 | 2026-10-07 |
| `@smartledger/notaryhash` | 16 | 0 | 16 | 2.4.2 | 2026-06-27 | 2026-10-10 |
| `@smartledger/crypto` | 14 | 0 | 14 | 3.2.0 | 2025-11-28 | 2026-10-07 |
| `@smartledger/envelope` | 5 | 0 | 5 | 3.0.0 | 2025-12-03 | 2026-10-07 |
| `smartledger-bsv` (unscoped) | 22 | 0 | 22 | **4.4.0** | 2025-10-18 | 2026-06-08 |
| `@smartledger/sdk` | 0 installable | - | - | none | 2025-03-04 | 2025-03-04 |

`@smartledger/sdk` holds the name only: 1.2.0 was published on 2025-03-04 and unpublished two
minutes later. Nothing installs from it; there is nothing to fix.

## `@smartledger/bsv`: what is still wrong with each live version

The 56 already-deprecated versions carry the public advisory GHSA-gw63-x79h-mhjc (a private
key published in an OP_RETURN, recoverable from chain data) and two non-reproducible-bundle
notices. The other 71 install with no warning at all.

**This table is NOT a complete list, and the recommendation below is built so that it does
not need to be.** It was first assembled by grepping CHANGELOG.md for false-accept and
forgery language, which missed five defects that a second session found by reading the
changelog independently (9.12.0, 9.25.0, 9.26.1, 9.27.0, and four `Fixed (security)` sections
in 7.5.1-7.5.5). A keyword enumeration afterwards finds 28 security-relevant section headings
across 26 versions — and still misses 9.25.0, 9.27.0 and 9.29.0, whose headings use other
words. **The changelog's heading vocabulary is not an index of its security content**, so a
complete table would mean reading all 127 version entries, which has not been done.

Known defects and the version that fixed each. A live version is affected when its number is
below the fix:

| fixed in | class | defect |
|---|---|---|
| 7.5.2 | key handling | `StatusList.getCredentialStatusEntry` was declared sync but is async, so `=== 'revoked'` compared a Promise and **every revoked credential passed**. Reachable by a caller trusting the `.d.ts` |
| 7.5.3 | key handling | the 7.5.1 anchor key-material guard matched field NAMES only, so a WIF in `note`, an xprv in `ref` or a mnemonic in `memo` was still published to chain |
| 7.5.5 | **fund loss** | `PrivateKey.fromObject` returned a valid ~40-bit key from the `'[REDACTED]'` marker. `fromObject(JSON.parse(JSON.stringify(key)))` — the natural persist/restore — silently yielded a different, deterministic key anyone can derive. **Funds sent to the resulting address are loseable, with no attacker involved** |
| 8.2.0 | forgery | `verifyAgeProof` / `verifyRangeProof` accept a forged proof |
| 9.12.0 | forgery | **a forged block header passed SPV verification.** A header was believed about the difficulty it declared, so a forgery cost one attempt to mine; `verifyHeaderChain` accepted whole chains |
| 9.20.0 | forgery | `verifyMembershipProof` accepts a forgery needing no key, no salt and no set |
| 9.22.0 | forgery | GDAF `zk-prover` forgeable field commitment |
| 9.25.0 | forgery | a certificate's `anchor.seal` verified `valid` with the seal unchecked; a false `anchor.blockHeight` verified when `spv.blockHeight` was null |
| 9.26.1 | forgery | relabelling a sealed certificate as `version: 1` bypassed the 9.25.0 seal refusal, so a forged seal verified `valid` again |
| 9.27.0 | forgery | the selective-disclosure leaf committed over a non-injective encoding — `valid: true` for a value the issuer never committed to |
| 9.29.0 | consensus | scriptnum operand size — a false accept in the interpreter |
| 9.30.0 | consensus | Chronicle era axis — 487 false accepts against the node |
| 9.32.0 | forgery | LTP `proof.js` forgeable field commitment: a verified disclosure of a value the issuer never committed to |
| 9.33.0 | consensus | `OP_RSHIFTNUM` shift count above INT32_MAX — a false accept |
| 9.33.1 | consensus | `isPushOnly` treats a truncated push as a push |
| 9.33.2 | robustness | null-script dereferences — an untyped TypeError on a transaction read from a valid block |

**Every live version contains the affected code.** Checked rather than assumed: all four
affected verifiers and both proof modules appear in the repository's first commit (5.4.0,
2026-06-15), and the oldest live version is 7.5.1.

**The certificate verifier was not fixed once.** An earlier draft of this page said it was
fixed in 9.20.0. It was still forgeable after that — through 9.25.0 (seal unchecked), 9.26.1
(the `version: 1` relabel bypassing 9.25.0's refusal) and 9.27.0 (the non-injective
disclosure leaf). A consumer on 9.21.0-9.24.0 told "upgrade past 9.20.0" would have remained
exposed. This is why the disposition below recommends one message naming the current version
rather than per-defect messages.

**A second defect class, in four live versions only.** The 7.5.x security sections are not
verifier defects at all — they are key handling, and one of them loses money without an
attacker. 7.5.1 introduced the `toJSON` redaction marker, and 7.5.5 fixed the parser that
misread it, so the exposed window for the fund-loss defect is **exactly 7.5.1 - 7.5.4**, all
four of which are live. 7.5.1 is additionally exposed to the StatusList bug, and 7.5.1-7.5.2
to the field-name-only key-material guard. The original OP_RETURN private-key leak (the public
advisory GHSA-gw63-x79h-mhjc) was itself fixed *in* 7.5.1, so no live version carries it.

**What the 56 existing deprecations cover.** 54 of them are versions below 7.5.1 — the
pre-advisory era. The other two are 7.7.0 and 7.8.0, deprecated for non-reproducible browser
bundles, not for a security defect. So nothing from 7.5.1 onward carries a security
deprecation today, including the four fund-loss versions.

Grouping the 71 live versions by the worst thing still outstanding in each:

| still outstanding | count | versions | what a consumer is exposed to |
|---|---|---|---|
| a forgery | **67** | 7.5.1 .. 9.31.0 | a third party can forge something a verifier accepts |
| consensus only | 2 | 9.32.0, 9.33.0 | the library calls a script valid that the network rejects |
| robustness only | 1 | 9.33.1 | an untyped crash on some valid chain data |
| no known forgery or consensus defect | 1 | 9.33.2 | documented limits remain — see below |

## Recommended disposition

**1. The unscoped `smartledger-bsv` — do this one first.** 22 live versions, none deprecated,
`latest` = 4.4.0 from 2026-06-08, and **429 downloads in the last month** against 6,512 for
the scoped package. So it is genuinely in use by someone, at the name a reader would try
first, with no indication that it is not the maintained package.

It is dormant by decision and is not to be revived. Deprecating it is how to say that
publicly. A message that avoids claiming anything unverified about 4.4.0's own code:

```
npm deprecate smartledger-bsv "No longer maintained. Current releases are published as @smartledger/bsv; review migration requirements before switching."
```

Deliberately *not* said: that switching is drop-in. That has not been checked.

**Correction to an earlier draft of this page**, which called the unscoped package "a separate
lineage whose version never appears in this repository's history". That was wrong. The git
history begins at 5.4.0, but `CHANGELOG.md` documents releases back to 3.0.1 — including
`## [4.4.0] - 2026-06-07` — so the project predates this repository and the unscoped 3.x/4.x
versions are **the same lineage**. Worse for the earlier wording: 4.4.0 is the release that
added `OP_SUBSTR` / `OP_LEFT` / `OP_RIGHT` to the interpreter, and 9.29.0 fixed an operand-size
false accept in exactly those opcodes. So 4.4.0 plausibly shares at least that defect.

This has not been confirmed against the 4.4.0 tarball, so the deprecation message above still
claims nothing about its code — but the reason is now "unverified", not "unrelated".

**2a. 7.5.1 - 7.5.4 — the fund-loss window, strongest wording.** These four get their own
message, and the reason is NOT a reopening of the per-defect plan withdrawn below. That plan
failed because defect-to-range mapping was unreliable; this range is *verified* and bounded at
both ends (7.5.1 introduced the redaction marker, 7.5.5 fixed the parser that misread it), and
the harm differs in kind — money lost through an honest round-trip, no attacker. Where a range
is established and the severity is categorically different, a distinct message is warranted;
where it is inferred from an incomplete table, it is not.

```
Critical: PrivateKey.fromObject can silently return a different, publicly derivable key from a
JSON round-trip, and funds sent to the resulting address may be unrecoverable. Fixed in 7.5.5.
Upgrade to @smartledger/bsv@9.33.2 or later.
```

**2b. The 67 versions with an outstanding forgery — ONE message, naming 9.33.2.** An earlier
draft of this page called for four distinct messages, one per defect, "because the fixed-in
version differs per defect". That plan is withdrawn, and the reason is the useful part:

Per-defect messages require a COMPLETE defect table. This one is not complete, and the
incompleteness is not random — it is concentrated in exactly the certificate-verifier
defects, where the four-message plan would have told a consumer on 9.21.0-9.24.0 that their
verifier was fixed in 9.20.0 when it stayed forgeable through 9.26.1. **Precision resting on
an incomplete enumeration is worse than deliberate imprecision**, because it is believed.

A single message naming the current version is correct whether or not the table is complete:

```
Superseded. This version has a known security defect fixed in a later release; upgrade to
@smartledger/bsv@9.33.2 or later.
```

**3. The consensus-only versions (9.32.0, 9.33.0) and 9.33.1.** These deserve their own
wording — not silence, and not the forgery wording. A library that calls a script valid when
the network rejects it can cause a failed broadcast, a wasted fee, or a bad pre-broadcast
decision. "May accept scripts that network consensus rejects; upgrade to 9.33.2" is
proportionate. A still-earlier draft proposed leaving them undeprecated because over-broad
deprecation teaches people to ignore warnings; that argues for the wording, not for silence.

**4. Before executing any of it.** Deprecation warnings print on every affected install,
including pinned builds and CI that may treat them as failures, and they generate support
questions. Worth doing first: re-read the registry (`npm run npm-inventory`), draft the four
messages, decide whether any of these defects should also get a real security advisory —
which is a different mechanism from deprecation and the thing that reaches `npm audit` — and
re-query afterwards to confirm the deprecations landed as intended.

The count of packages depending on the unscoped one could not be established: npm's
`depends:` search returns 398 results, but the first several are text matches on "bsv"
(`@bsv/sdk`, `@bitgo/sdk-coin-bsv`, `@bsv/wallet-toolbox`) and none of the ones checked
actually lists it as a dependency. Treat that number as unknown rather than large.

## 9.33.2 has no known forgery or consensus defect, but it is not "nothing known"

Two documented limits remain open and are recorded in the changelog rather than fixed:

* **`OP_DIV` / `OP_MOD` are quadratic in operand length.** Not a consensus divergence — the
  node agrees — but the node bounds it with policy this package does not copy, so quadratic
  CPU exhaustion remains a risk with attacker-supplied scripts: 320 KB of operand takes about
  18 seconds (CHANGELOG 9.16.1).
* The 9.22.0 entry's own **"Still open"** list: a null deletes a claim rather than editing it,
  the proof shows consistency rather than authenticity, and a TSC index bound.

There is also one claim this page has softened. The 9.23.0 GDAF wrapper drift was described
here and in the changelog as fail-closed rather than a hole, and for three of the four
wrappers the changelog shows exactly that — `generateMembershipProof` threw, and
`verifyMembershipProof` and `verifyRangeProof` returned `false` for every proof. The fourth
row says only that `verifyAgeProof` "received an issuer DID as the opening"; it does not state
the verdict. So "fail-closed" is supported for three of four and unstated for the fourth.

## The other packages

`bsv-core`, `keys`, `crypto`, `envelope` and `notaryhash` have **no deprecated versions and
no known forgery or consensus defect** in any published version. `bsv-core` shares the
interpreter lineage, so its pre-1.5.2 versions carry the ported equivalents of the consensus
items above; its own CHANGELOG maps them. Two caveats, neither a defect:

* `notaryhash` 2.4.2 introduced certificate v2.0, which our verifier deliberately refuses.
  Whether to accept it is an open product decision.
* **No version of any package carries npm provenance attestations**, because the Release
  workflow has never run a publish. A Trusted Publisher would add them to future releases; it
  cannot retrofit past ones.

## Live `@smartledger/bsv` versions, by outstanding class

### Outstanding forgery (67)
  7.5.1, 7.5.2, 7.5.3, 7.5.4, 7.5.5, 7.5.6, 7.5.7, 7.5.8, 7.6.0, 7.6.1, 7.6.2, 7.7.1
  7.8.1, 7.9.0, 7.10.0, 7.10.1, 7.11.0, 7.12.0, 7.13.0, 8.0.0, 8.0.1, 8.1.0, 8.2.0
  8.3.0, 8.3.1, 9.0.0, 9.1.0, 9.1.1, 9.2.0, 9.3.0, 9.4.0, 9.5.0, 9.6.0, 9.7.0, 9.8.0
  9.9.0, 9.10.0, 9.10.1, 9.11.0, 9.11.1, 9.11.2, 9.12.0, 9.13.0, 9.14.0, 9.15.0, 9.16.0
  9.16.1, 9.18.0, 9.19.0, 9.20.0, 9.21.0, 9.22.0, 9.22.1, 9.23.0, 9.24.0, 9.25.0, 9.26.0
  9.26.1, 9.26.2, 9.27.0, 9.28.0, 9.28.1, 9.29.0, 9.29.1, 9.29.2, 9.30.0, 9.31.0

### Outstanding consensus only (2)
  9.32.0, 9.33.0

### Outstanding robustness only (1)
  9.33.1

## Release tags

Every published version present in this repository's history now carries a `v*` tag whose
commit is the **published tree**, verified by reproducing the registry shasum from a worktree
at that commit rather than by assuming the version-bump commit — 3 of 18 backfilled tags were
not the bump commit. `bsv` is 117/127 tagged; the 10 gaps (`1.5.6-fix1`, `3.0.2`-`3.3.5`) were
published before this repository's first commit, whose `package.json` history begins at 5.4.0,
so there is no commit to tag. `bsv-core` is 13/13.

## How this page was checked, and what is still unchecked

The version counts, dates and deprecation states come from the registry and are re-verified by
`npm run check:npm-inventory`, which fails the suite if the package table drifts.

The defect table was cross-checked by a second session reading `CHANGELOG.md` independently.
That check confirmed the 67/2/1/1 partition and the nine fix versions in the first draft, and
it found five defects the first draft had missed, the certificate-verifier error, the
overstated "nothing known", and the wrong lineage claim about the unscoped package. Every one
of its findings was verified against the changelog here before being written down.

Still unchecked, and deliberately stated rather than glossed:

* the defect table's **completeness** — see the note above its rows;
* whether any version entry outside the sections already read contains a further defect;
* whether the unscoped 4.4.0 tarball actually contains the operand-size false accept;
* whether `verifyAgeProof` was fail-closed in the 9.23.0 wrapper case.

## Nothing here has been acted on

This page is an inventory and a recommendation. No deprecation, unpublish or dist-tag change
has been made as a result of writing it.
