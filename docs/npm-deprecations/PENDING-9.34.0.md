# The four sends, in order, once 9.34.0 is authorized

Nothing here has been run. Each step is wrong before the one above it: steps 2–4 all name
9.34.0 as the version to move to, so the publish is a hard prerequisite and not a courtesy.

Every command below uses a temporary npmrc at mode 600 inside a mode 700 directory, written
straight from `.env` with no echo and shredded afterwards, and both Happy Eyeballs flags —
`--dns-result-order` alone is not enough, because Node races the address families and the
verdict flaps. `NPM_TOKEN3` is the token that authenticates from this machine; the other two
return a stable 403.

## 1. Publish

The tarball is already proved reproducible from `v9.34.0` (shasum
`440c41ee98738fb95b75fe01437fc63ea9544aaf`, 283 files), so nothing needs rebuilding.

```sh
cd /home/greg/Documents/CLAUDE_PROJECTS/smartledger-bsv
TD=$(mktemp -d); chmod 700 "$TD"; RC="$TD/npmrc"
T=$(grep -m1 '^NPM_TOKEN3=' .env | cut -d= -f2- | tr -d '"'"'"'[:space:]')
printf '//registry.npmjs.org/:_authToken=%s\n' "$T" > "$RC"; chmod 600 "$RC"; unset T
NODE_OPTIONS="--dns-result-order=ipv4first --no-network-family-autoselection" \
  npm publish --userconfig "$RC" --access public
shred -u "$RC"; rm -rf "$TD"
grep -c '_authToken' ~/.npmrc   # must be 0
```

Then confirm by direct registry read, not `npm view`, which serves a stale cache for minutes:

```sh
curl -s https://registry.npmjs.org/@smartledger%2fbsv \
  | node -e 'let s="";process.stdin.on("data",d=>s+=d).on("end",()=>{const p=JSON.parse(s);
      console.log(p["dist-tags"].latest, p.versions["9.34.0"]?.dist?.shasum)})'
```

Expect `9.34.0 440c41ee98738fb95b75fe01437fc63ea9544aaf`. Propagation takes a minute or two;
do not debug an install until the read shows the version present.

## 2. Deprecate 9.33.2

The only live version with no deprecation message at all. The flag goes **after** the
positionals — before them, `npm deprecate` sends an EMPTY message and exits 0.

```sh
npm deprecate "@smartledger/bsv@9.33.2" "Security: LTP selective disclosure derives each field's salt from the proof's own nonce, so an undisclosed field's value can be recovered from the proof alone - a date of birth came back in under 100,000 hashes. Upgrade to 9.34.0." --userconfig "$RC"
```

Then read it back byte for byte; an exit code is advisory in both directions, and an E422 can
mean the write landed:

```sh
node scripts/npm-deprecations.js verify all
```

## 3. Extend the 9.32.0, 9.33.0 and 9.33.1 messages

Each names only the defect it was deprecated for and now understates what is outstanding: all
three also carry the salt defect. Add the tier to `scripts/npm-deprecations.js` rather than
typing the text at a shell, so the message in the registry and the message in
`docs/NPM_RELEASES.md` stay the same bytes.

## 4. The advisories

```sh
gh api repos/codenlighten/smartledger-bsv/security-advisories/GHSA-gw63-x79h-mhjc > /tmp/live.json
node scripts/build-advisories.js --from /tmp/live.json     # rebuild against the CURRENT text
gh api --method PATCH repos/codenlighten/smartledger-bsv/security-advisories/GHSA-gw63-x79h-mhjc \
  --input docs/advisories/GHSA-gw63-amendment.json
gh api --method POST repos/codenlighten/smartledger-bsv/security-advisories \
  --input docs/advisories/draft-fromobject-key-substitution.json
gh api --method POST repos/codenlighten/smartledger-bsv/security-advisories \
  --input docs/advisories/draft-ltp-disclosure-commitment.json
gh api --method POST repos/codenlighten/smartledger-bsv/security-advisories \
  --input docs/advisories/draft-ltp-salt-derivation.json
```

Rebuild the amendment against the live text first: it is a set of four surgical edits, and the
builder refuses to produce it if any of the four passages has moved, which is what stops it
silently overwriting an edit made elsewhere.

**A created advisory is a private draft.** Publishing each one is a separate, deliberate step,
and publishing is what puts it in the GitHub Advisory Database and so into `npm audit`. No CVE
has been requested for any of them.
