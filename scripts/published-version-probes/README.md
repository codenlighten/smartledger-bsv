# Probes against published versions

These scripts measure a **published artifact** — a version installed from the npm registry
exactly as a consumer would get it — rather than this working tree or `CHANGELOG.md`.

They exist because `docs/NPM_RELEASES.md` was first assembled from the changelog, and when the
same claims were checked against the artifacts three of them were wrong: the 9.33.0 deprecation
text would have told its users they might accept scripts the network rejects (they do not), the
unscoped `smartledger-bsv` package turned out to carry a live private-key disclosure in
fourteen versions, and the operand-width defect guessed to be in unscoped 4.4.0 is not there.
A changelog records intent. These record behaviour.

They are **not** part of the test suite and are not run by CI: each one needs a version
installed from the network, which a test must not depend on. Run them by hand when a claim
about a published version needs to be established or re-established.

## Running one

    bash scripts/published-version-probes/run.sh <probe> <package> <version>

    bash scripts/published-version-probes/run.sh ltp-forgery @smartledger/bsv 9.31.0
    bash scripts/published-version-probes/run.sh anchor-leak smartledger-bsv 4.4.0

`run.sh` installs the version into a throwaway directory under `/tmp` (with
`--ignore-scripts`), runs the probe against it, and leaves the install in place so repeated
probes against the same version are cheap.

## The probes

| probe | question |
|---|---|
| `stringify-leak` | does `JSON.stringify(privateKey)` emit the secret scalar, and can the exact WIF be recovered from it? |
| `anchor-leak` | do `GDAF#anchorCredential` and `#anchorBatch` return a signed transaction whose OP_RETURN contains the caller's private key? (GHSA-gw63-x79h-mhjc) |
| `json-roundtrip` | does `PrivateKey.fromObject(JSON.parse(JSON.stringify(key)))` silently return a *different* key? |
| `ltp-forgery` | does an LTP selective disclosure of `null` still verify after the disclosed value is changed to `NaN` or `Infinity`? |
| `interpreter-divergences` | three measured divergences: the `OP_RSHIFTNUM` shift count, a truncated push under `mainnetFlags()`, and an output script this library cannot decode |
| `operand-width` | is an `OP_RIGHT` length operand bounded on its *encoded width*, as the node bounds it? |
| `ltp-sweep` | all four LTP questions at once, one line per version: is the module there, does an honest disclosure verify, is a substituted value accepted, can an undisclosed field be recovered? |
| `ltp-salt-brute` | can an **undisclosed** field be recovered from a selective-disclosure proof alone? |
| `ltp-stale-commitment` | does upgrading the *verifier* repair a commitment an affected issuer already minted? (it does not) |

`ltp-stale-commitment` takes **two** install directories, an issuer and a verifier, so it needs
its own invocation rather than `run.sh`:

    node scripts/published-version-probes/ltp-stale-commitment.js <issuerDir> <verifierDir>

Nothing here broadcasts a transaction, and nothing writes to the registry. `anchor-leak`
serialises the signed transaction locally and inspects its bytes.

## Two rules these probes follow, both learned the hard way

**Every sweep includes a version where the defect is fixed.** A probe that answers
"vulnerable" everywhere it is pointed is measuring nothing. Two of these did exactly that on
their first run — one compared a zero-padded hex string against an unpadded one and so missed
the leak in one key in sixteen, and one assembled a flag word by hand that omitted the gate's
era condition, so it reported the pre-fix error name at every version including the fixed one.
Both were instrument bugs, and both were caught only because a known-fixed version was in the
sweep.

**Flag words come from the installed library, never from a constant here.** An older artifact
may not define a flag at all, and `undefined` ORed into a flag word yields `NaN`, which looks
exactly like a defect. The probes check `typeof === 'number'` and say "flags absent" instead of
reporting a verdict they cannot support.
