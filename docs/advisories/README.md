# Prepared security advisories

Three pieces of advisory work, **none of it sent**. Each is ready to apply with one API call.

| file | what it is | state |
|---|---|---|
| `GHSA-gw63-amendment.md` | an amendment to the one published advisory, adding the unscoped package as a second affected product | **prepared, not sent** |
| `draft-fromobject-key-substitution.md` | a new advisory for the 7.5.1 – 7.5.4 fund-loss defect | **drafted, not created** |
| `draft-ltp-disclosure-commitment.md` | a new advisory for the selective-disclosure commitment defect | **drafted, not created** |

## Why these exist at all

148 of the 149 published versions across both npm package names were deprecated on 2026-10-13
(see `../NPM_RELEASES.md`). **A deprecation warning prints at install time and never reaches
`npm audit`.** A security advisory is the only mechanism here that does — it is what puts an
entry in the GitHub Advisory Database, which is what `npm audit`, Dependabot and every scanner
downstream of it read.

So the deprecations tell a human who is watching their install output. These tell the tooling.

## The structural point, which cost a draft to learn

The first version of the amendment tried to warn, in the published advisory's **prose**, that
its recommended `>= 7.5.3` is unsafe because 7.5.1 – 7.5.4 carry a different critical defect.

That is useless where it matters. The advisory's machine-readable part says
`@smartledger/bsv` is patched at `7.5.1`, so a scanner treats 7.5.1 – 7.5.4 as **not affected by
that advisory**, whatever the text around it says. **Prose cannot change audit results.**

Hence the split: the published advisory keeps its own scope and gains the affected package it
was missing, and the two other defects get their own advisories with their own ranges. Only the
ranges are read by tooling.

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

**The selective-disclosure commitment.** `< 9.32.0`, and the lower bound matters. The obvious
range was `>= 7.5.5, < 9.32.0`, because that is the set of *live* versions the forgery was
executed against — all 63 of them. But a range opening at 7.5.5 tells a 7.0.0 user they are
unaffected, so the earlier versions were measured too: 5.4.0, 6.0.0, 7.0.0, 7.4.0, 7.5.0 and
4.4.0 all accept the forged disclosure. `< 9.32.0` is the honest range. On the unscoped name,
3.3.1 and 4.4.0 accept it and 3.0.0 has no `lib/ltp/proof` module at all.

That is the same mistake twice in one day in two different places — a range drawn around the
versions that happened to be in the sweep. The fix both times was to measure outside it.
