# Releasing `@smartledger/bsv`

Releases are **published automatically from CI with npm provenance** — pushing a
`vX.Y.Z` tag runs `.github/workflows/release.yml`, which gates the tag and publishes
to npm. Provenance gives npmjs.com a verifiable link proving the tarball was built
from that exact commit ("published package == audited source", publicly checkable).

> **Status (2026-07):** the tokenless provenance workflow is verified working through the
> OIDC / Sigstore signing step, but the final publish is authorized by npm's **Trusted
> Publisher**, which must be registered on npmjs.com — a **2FA-gated** setting. Until that
> one-time registration is done, releases go out via the **fallback below** (no provenance).
> Registering the trusted publisher (needs 2FA once) permanently switches releases to the
> tokenless, provenance-by-default path.

## One-time setup (repo admin)

Auth is **tokenless** via npm **OIDC Trusted Publishing** — no secret to manage. On
npmjs.com, open the `@smartledger/bsv` package → **Settings → Trusted Publisher →
GitHub Actions** and register repository `codenlighten/smartledger-bsv`, workflow
`release.yml`. The workflow's OIDC identity is then exchanged for a short-lived publish
token at release time, and provenance is automatic. The repo must be public.

(npm removed classic/automation tokens in Nov 2025; trusted publishing is the modern
replacement and avoids granular-token scoping issues. The workflow installs npm ≥ 11.5.1,
which OIDC trusted publishing requires.)

## Cutting a release

1. Bump the version (this also syncs the CDN URLs in README/docs via the `version` hook):

   ```
   npm version <patch|minor|major> --no-git-tag-version
   ```

2. Rebuild the bundles — they embed the version string, so a bump requires it. No
   `--openssl-legacy-provider` and no Node pin any more (webpack hashes with xxhash64):

   ```
   npm run build-all
   ```

3. Move the `## [Unreleased]` CHANGELOG section under a new `## [X.Y.Z] - <date>`.

4. Commit everything, open a PR, and merge once CI is green (bundle-parity, tests on
   Node 20/22, hygiene).

5. Tag the merge commit on `main` and push the tag:

   ```
   git tag -a vX.Y.Z -m "vX.Y.Z"
   git push origin vX.Y.Z
   ```

   The **Release** workflow then verifies the tag matches `package.json`, re-runs the
   suite + scoped lint + bundle-parity gate, and publishes with `--provenance`. It is a
   no-op if that version is already on npm, so re-pushing a tag is safe.

## Verifying

```
npm view @smartledger/bsv version          # latest
npm view @smartledger/bsv dist.attestations # provenance present
```

The build is byte-deterministic across Node 20 and 22, so the CI-built bundles match a
local `npm run build-all`.

## Fallback publish (until the trusted publisher is registered)

Provenance requires 2FA one way or another (real 2FA at publish, or the one-time
2FA-gated trusted-publisher registration). Until that's set up, publish from a granular
token — build on Node 20 (no `--openssl-legacy-provider`) so the tarball matches the
committed, CI-verified bundles:

```
docker run --rm -e NPM_TOKEN="$NPM_TOKEN" -v "$PWD":/w -w /w node:20 bash -c '
  npm ci
  printf "//registry.npmjs.org/:_authToken=%s\n" "$NPM_TOKEN" > ~/.npmrc
  npm publish --access public
'
```

Do steps 1–3 above (bump, build, changelog, merge) first; this replaces steps 4–5.
This path has **no provenance** — the published `.js` is still a byte-for-byte
reproducible build of the tagged source (enforced by the CI bundle-parity gate), just
without the cryptographic npm attestation.
