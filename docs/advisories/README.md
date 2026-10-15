# Prepared security advisories

Six advisories: **five live on the repository, and one a private draft awaiting a decision to
publish.** Each is built by `node scripts/build-advisories.js` into the `.json` payload beside its
markdown file, and `npm run check:advisories` holds the payloads to the markdown.

| file | advisory | state |
|---|---|---|
| `GHSA-gw63-amendment.json` | [`GHSA-gw63-x79h-mhjc`](https://github.com/codenlighten/smartledger-bsv/security/advisories/GHSA-gw63-x79h-mhjc) | **amended and live**, 2026-10-14 — gained the unscoped package |
| `draft-fromobject-key-substitution.md` | [`GHSA-9r95-pq7h-p78g`](https://github.com/codenlighten/smartledger-bsv/security/advisories/GHSA-9r95-pq7h-p78g) | **published**, critical (CVSS 9.1) |
| `draft-ltp-disclosure-commitment.md` | [`GHSA-xc2p-cffw-qm3j`](https://github.com/codenlighten/smartledger-bsv/security/advisories/GHSA-xc2p-cffw-qm3j) | **published**, high (CVSS 7.5) |
| `draft-ltp-salt-derivation.md` | [`GHSA-5f36-cmq3-37xg`](https://github.com/codenlighten/smartledger-bsv/security/advisories/GHSA-5f36-cmq3-37xg) | **published**, high (CVSS 7.5) |
| `draft-ageproof-hardcoded-birthdate.md` | [`GHSA-2j2f-5v2f-pvpq`](https://github.com/codenlighten/smartledger-bsv/security/advisories/GHSA-2j2f-5v2f-pvpq) | **published**, high (CVSS 7.5) — 2026-10-14 |
| `draft-sighash-scriptcode-tail.md` | [`GHSA-j884-5pmj-6wqp`](https://github.com/codenlighten/smartledger-bsv/security/advisories/GHSA-j884-5pmj-6wqp) | **DRAFT — not published**, medium (CVSS 5.9) — 2026-10-15 |

Each was created from the committed payload and then read back from the API: all six store a
description **byte-identical** to what was sent, and affected products matching exactly. None
has a CVE.

**`GHSA-j884-5pmj-6wqp` is a draft, which is private to maintainers, and publishing it is a
separate deliberate step** — it is the only one that names `@smartledger/bsv-core`, and the only
one whose range covers *every version ever published* on all three package names. GitHub computed
5.9 medium from the vector sent, which matches the score derived by hand before sending. The
deliberate `AC:H` is the shape of the defect: it needs a prevout script ending in a push the node
cannot decode **and** a hash type that selects the original digest algorithm, so `0x41` — what
current BSV wallets sign with — is unaffected.

## Measured: `npm audit` does not flag these versions, and the cause is now established

Two separate findings, kept separate because the first is solid and the second is not.

**The gap is real.** `GHSA-gw63-x79h-mhjc` has been published on this repository since
**2026-08-07**. On 2026-10-14, in a fresh project with a lockfile, npm 10.9.9:

```
npm install @smartledger/bsv@7.0.0     # 7.0.0 is INSIDE that advisory's "< 7.5.1" range
npm audit                              # exit 0 — "found 0 vulnerabilities"
```

`auditReportVersion: 2`, every total zero, no `error` field. And the instrument works: the same
command on `minimist@1.2.0` in the same session exits 1 and reports both of its advisories with
their GHSA links. So the zero is a real negative and not a failed lookup.

The first version of this test used `@smartledger/bsv@9.31.0`, which is **outside** the
`< 7.5.1` range — so it measured nothing about the two-month-old advisory and only said that two
advisories published ten minutes earlier had not propagated. A review caught that; the test
above is the replacement, and it is the one that matters.

Also absent from the public global API: `GET api.github.com/advisories/GHSA-gw63-x79h-mhjc`
returns **404**, and `?ecosystem=npm&affects=@smartledger/bsv` returns zero.

**A fifth advisory, 2026-10-14, repeats the result — but this data point is weak on its own and
is recorded as such.** `GHSA-2j2f-5v2f-pvpq` covers `>= 3.3.2, < 9.36.0`, so `9.35.0` is inside
it. Two minutes after publishing:

```
npm install @smartledger/bsv@9.35.0
npm audit                              # found 0 vulnerabilities
```

with `minimist@1.2.0` added to the same project reporting both of its advisories in the same
run, so the lookup works. **But two minutes is not a propagation test.** This only says the
advisory had not propagated yet, which is unsurprising, and it is exactly the mistake the first
version of the test above made. The evidence that matters remains the **two-month-old**
`GHSA-gw63-x79h-mhjc`. Re-run this one after a few days; until then it is consistent with the
gap and proves nothing by itself.

**The cause, established 2026-10-15.** None of the five advisories exists in the GitHub
Advisory Database at all — not as an unreviewed entry, not under another id:

```
# the database cannot resolve the id, including the two-month-old one
gh api graphql -f query='{ securityAdvisory(ghsaId: "GHSA-gw63-x79h-mhjc") { ghsaId } }'
#   NOT_FOUND: Could not resolve to a Security Advisory with ID 'GHSA-gw63-x79h-mhjc'

# and the package has no vulnerabilities as far as the database is concerned
gh api graphql -f query='{ securityVulnerabilities(ecosystem: NPM,
    package: "@smartledger/bsv", first: 20) { totalCount } }'
#   totalCount: 0        (control: minimist -> 5)
```

All five read `state: published`, `cve_id: null`, **`submission: null`**.

Stated precisely, because the distinction matters: these advisories are published at
**repository** level and are **not present in the global and npm vulnerability results GitHub's
API returns**, and `npm audit` does not flag a version inside their ranges. A repository
advisory and a global advisory are different objects, and publishing the first does not create
the second. (`NOT_FOUND` could in principle reflect query visibility rather than literal
absence; together with the zero package result and the working control, absence from the
queried global feed is the well-supported reading. What is *not* established here is npm
audit's exact data path, or GitHub's internal review status for each advisory.)

GitHub's own documentation gives the mechanism: *"Every repository advisory is reviewed by the
GitHub Security Lab curation team for consideration as a global advisory."* Three things
follow:

1. **No additional submission step was identified.** Publishing already enqueued all five for
   review, and there is no maintainer-side submit action to perform. That is not the same as
   "nothing could be done" — see below.
2. **Inclusion is not guaranteed** — the word is "consideration" — and no timeline is
   published. The one documented criterion is that the ecosystem is supported by the dependency
   graph, which npm is.
3. **The queue is visibly backlogged.** Other maintainers are reporting the same thing now:
   `github/advisory-database` issue **#9152** (four repository advisories, published 10–13 days
   earlier, still absent) and community discussion **#209436** (published 2026-08-28, CVE
   request accepted but never assigned, never reached the database). `GHSA-gw63-x79h-mhjc` is
   older than either.

**The earlier guess is still worth recording as a guess.** A previous draft of this page said a
CVE request is "likely the only way these reach `npm audit`". That was a leap, and it was wrong
in the way that matters: the CVE request is optional and is not the promotion mechanism — review
is, and it happens whether or not a CVE is requested. A CVE remains worth having on its own
merits, as a durable cross-system identifier, and not as a fix for this gap.

**What is left, and it is the user's call** — both are outward-facing requests to a third
party and neither is done:

* **Worth doing, not merely a courtesy:** ask GitHub to check `GHSA-gw63-x79h-mhjc`'s review
  status **and its npm package mapping**. Automatic consideration does not rule out a mapping
  or eligibility problem on a scoped package name, and `submission: null` does not settle that
  either; at two months this one is well past the delays others are filing issues about.
  `security-advisories@github.com` is the address other maintainers report using.
* **On its own merits:** whether to request CVEs. Optional, and not the promotion mechanism.

**The only consumer-facing signal we have verified** is the install-time deprecation warning,
on 150 of the 151 published versions across both package names. The measurements above cover
`npm audit` and the GitHub advisory APIs, not every scanner or channel, so that is a statement
about what was tested. Users should not assume `npm audit` or Dependabot currently warns about
the affected versions.

## Why these exist at all

148 of the 149 published versions across both npm package names were deprecated on 2026-10-13
(see `../NPM_RELEASES.md`). **A deprecation warning prints at install time and never reaches
`npm audit`.** A security advisory is the only mechanism here that *can* reach it — but only
once GitHub's curation team promotes it to a global advisory, which is what `npm audit`,
Dependabot and every scanner downstream of it actually read. As measured above, none of these
five has been promoted yet.

So the deprecations tell a human who is watching their install output. These are *addressed* to
the tooling, and will reach it if and when they are reviewed.

## The structural point, which cost a draft to learn

The first version of the amendment tried to warn, in the published advisory's **prose**, that
its recommended `>= 7.5.3` is unsafe because 7.5.1 – 7.5.4 carry a different critical defect.

That is useless where it matters. The advisory's machine-readable part says
`@smartledger/bsv` is patched at `7.5.1`, so a scanner treats 7.5.1 – 7.5.4 as **not affected by
that advisory**, whatever the text says. **Prose cannot change audit results.**

Hence the split: the published advisory keeps its own scope and gains the affected package it
was missing, and each other defect gets its own advisory with its own range. Only the ranges are
read by tooling.

## Ranges, and why each bound is where it is

Every bound below was established by installing the published version from the registry and
running it — not from `CHANGELOG.md`. The probes are in `../../scripts/published-version-probes/`.

**The anchor key disclosure** (published advisory, amended). `@smartledger/bsv < 7.5.1`,
unchanged. Adding `smartledger-bsv <= 4.4.0` with **no** patched version: 14 of its 22 versions
reproduce the defect through both methods, 22 of 22 leak via `JSON.stringify`, and no release on
that name fixes either, so the fix is changing package rather than version.

**The `fromObject` key substitution.** `>= 7.5.1, < 7.5.5`. Both bounds are measured, not
inferred: 7.5.0 round-trips **correctly**, because the `'[REDACTED]'` marker that the parser
misreads did not exist before 7.5.1 — so a range opening earlier would be wrong. 7.5.5 throws.
The unscoped package is **not** affected, for the same reason: it predates the marker and its
`toJSON` emits the real scalar, so its round trip returns the correct key.

**The selective-disclosure commitment.** `>= 3.3.2, < 9.32.0`, and the lower bound took two
corrections to get right. The first draft said `>= 7.5.5, < 9.32.0`, because that is the set of
*live* versions the forgery was executed against — all 63 of them. But a range opening at 7.5.5
tells a 7.0.0 user they are unaffected, so earlier versions were measured: 3.3.2, 3.4.0, 4.4.0,
5.4.0, 6.0.0, 7.0.0, 7.4.0 and 7.5.0 all accept the forged disclosure. The second draft then
said simply `< 9.32.0` — which over-claims in the other direction, since no scoped version
before 3.3.2 has `lib/ltp/proof` at all. `>= 3.3.2, < 9.32.0` is the honest range. On the
unscoped name the module appears first in 3.3.1 and in all 14 versions through 4.4.0.

**The salt derivation.** `>= 3.3.2, < 9.34.0` scoped, `>= 3.3.1, <= 4.4.0` unscoped — the same
module-presence boundary, because every version that has the module has the defect, including
9.33.2, which was the current release when it was found.

Module presence was established twice over, independently: from the CDN that serves the npm
tarballs, for `lib/ltp/proof.js` in each of the 149 published versions, and by installing the
versions at each boundary and loading it. The two agree.

**The scriptCode tail.** `< 9.37.0` scoped, `< 1.6.0` on `@smartledger/bsv-core`, `<= 4.4.0`
unscoped — every range open at the bottom, because **the first published version on each name is
affected and that was measured, not assumed**: `@smartledger/bsv@1.5.6-fix1`,
`smartledger-bsv@3.0.0` and `@smartledger/bsv-core@1.0.0` each give the wrong digest for a
short-data push while answering correctly on the control. 25 published artifacts were installed
and executed in all, and the control `6a0401020304` matched the reference node in every one of
them, so the failures are the defect and not a harness that moved.

Two shapes with different histories sit inside that one range, which is why the prose spells them
out: a push whose *data* is short always parsed, so its digest was always wrong, while a push
whose *length prefix* is cut off used to make the parser throw — no digest at all — until 9.35.0
and core 1.6.0 made those scripts parseable. The range is the same either way, since neither
shape was ever handled correctly before the fix.

That lower bound was drawn wrong twice in two days, both times around whatever versions happened
to be in the sweep. The fix both times was to measure outside it.

## Severity

Each new advisory carries a CVSS vector rather than a bare label, so the label is derived from a
stated model that a reader can disagree with, and each one's text names the precondition the
vector assumes. The amendment sends no severity at all — it changes only the fields it needs to,
and the published advisory keeps its own.

## Checking them

    npm run check:advisories

rebuilds the two payloads that need no network and fails if they have drifted from the markdown.
The amendment is skipped there, because building it needs the live advisory text:

    gh api repos/codenlighten/smartledger-bsv/security-advisories/GHSA-gw63-x79h-mhjc > /tmp/live.json
    node scripts/build-advisories.js --from /tmp/live.json
