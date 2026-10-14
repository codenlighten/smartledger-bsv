# Prepared security advisories

Four pieces of advisory work, **none of it sent**. Each is one API call, built by
`node scripts/build-advisories.js` into the `.json` payload beside each markdown file.

| file | what it is | state |
|---|---|---|
| `GHSA-gw63-amendment.json` | an amendment to the one published advisory, adding the unscoped package as a second affected product | **prepared, not sent** |
| `draft-fromobject-key-substitution.md` | a new advisory for the 7.5.1 – 7.5.4 fund-loss defect | **drafted, not created** |
| `draft-ltp-disclosure-commitment.md` | a new advisory for the selective-disclosure commitment defect | **drafted, not created** |
| `draft-ltp-salt-derivation.md` | a new advisory for the salt derivation that exposes undisclosed fields | **drafted, not created; must not be published before 9.34.0 is on the registry** |

The amendment has no markdown of its own: it is a set of surgical edits to the live advisory's
text, held in `scripts/build-advisories.js` and applied to whatever that advisory currently says.
The builder refuses to produce it if any of the four passages it edits is no longer there, so it
cannot silently overwrite someone else's edit.

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
