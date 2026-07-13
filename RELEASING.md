# Releasing `@smartledger/bsv`

Releases are **published automatically from CI with npm provenance** — pushing a
`vX.Y.Z` tag runs `.github/workflows/release.yml`, which gates the tag and publishes
to npm. Provenance gives npmjs.com a verifiable link proving the tarball was built
from that exact commit ("published package == audited source", publicly checkable).

## One-time setup (repo admin)

Add an npm **Automation** access token as the Actions secret `NPM_TOKEN`
(Settings → Secrets and variables → Actions). Automation tokens bypass 2FA, which
CI/provenance publishing requires. The repo must be public for provenance.

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
