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

These are the known defects and the version that fixed each. A live version is listed as
affected when its number is below the fix:

| fixed in | class | defect |
|---|---|---|
| 8.2.0 | forgery | `verifyAgeProof` / `verifyRangeProof` accept a forged proof |
| 9.20.0 | forgery | `verifyMembershipProof` accepts a forgery needing no key, no salt and no set; the certificate verifier accepts tampered certificates |
| 9.22.0 | forgery | GDAF `zk-prover` forgeable field commitment |
| 9.29.0 | consensus | scriptnum operand size — a false accept in the interpreter |
| 9.30.0 | consensus | Chronicle era axis — 487 false accepts against the node |
| 9.32.0 | forgery | LTP `proof.js` forgeable field commitment: a verified disclosure of a value the issuer never committed to |
| 9.33.0 | consensus | `OP_RSHIFTNUM` shift count above INT32_MAX — a false accept |
| 9.33.1 | consensus | `isPushOnly` treats a truncated push as a push |
| 9.33.2 | robustness | null-script dereferences — an untyped TypeError on a transaction read from a valid block |

**Every live version contains the affected code.** This was checked rather than assumed: all
four affected verifiers and both proof modules appear in the repository's first commit
(5.4.0, 2026-06-15), and the oldest live version is 7.5.1. A fix's release number alone would
not have established this.

Grouping the 71 live versions by the worst thing still outstanding in each:

| still outstanding | count | versions | what a consumer is exposed to |
|---|---|---|---|
| a forgery | **67** | 7.5.1 .. 9.31.0 | a third party can forge something a verifier accepts |
| consensus only | 2 | 9.32.0, 9.33.0 | the library calls a script valid that the network rejects |
| robustness only | 1 | 9.33.1 | an untyped crash on some valid chain data |
| nothing known | 1 | 9.33.2 | — |

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

Deliberately *not* said: that 4.4.0 shares the scoped package's vulnerable code paths, or that
switching is drop-in. Neither has been checked — 4.4.0 is a separate lineage whose
`package.json` version never appears in this repository's history — and "predates the
security fixes" would read as a security claim this inventory has not substantiated.

**2. The 67 versions with an outstanding forgery.** These warrant deprecation, with the
message naming the fix. Four distinct messages are needed, not one, because the fixed-in
version differs per defect — a consumer on 9.25.0 should be told about 9.32.0, not 8.2.0.

**3. The 2 consensus-only versions (9.32.0, 9.33.0) and 9.33.1.** These deserve their own
language, not silence and not the forgery language. A library that calls a script valid when
the network rejects it can cause a failed broadcast, a wasted fee, or a bad pre-broadcast
decision, depending on what the consumer relies on. Something like "may accept scripts that
network consensus rejects; upgrade to 9.33.1" is proportionate. The earlier draft of this
page recommended leaving them alone on the grounds that over-broad deprecation teaches people
to ignore warnings; that reasoning still holds for the *wording*, but it does not justify
saying nothing.

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

## Nothing here has been acted on

This page is an inventory and a recommendation. No deprecation, unpublish or dist-tag change
has been made as a result of writing it.
