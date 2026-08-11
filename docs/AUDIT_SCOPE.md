# External security audit — scope and request for quote

This document scopes an independent security review of the `@smartledger/bsv`
cryptographic core, and carries the enquiry text to send to vendors. It exists so that
every vendor prices the *same* thing, and so that the reasoning behind the scope
boundary survives past the engagement that prompted it.

Measured against **v7.12.0**, 2026-08-10 (`lib/` is byte-identical to v7.11.0, where these
figures were first taken). Re-measure before sending if the version has
moved (`docs/AUDIT_SCOPE.md` is not covered by a drift gate).

## 1. The question we are asking

The core is inherited from bitcore via moneybutton and has only ever been fixed
reactively. Every hardening effort to date — the threat model, the conformance corpus,
the adversarial suites, the bundle and type-drift gates — has been applied **at the
boundary or to new code**. The inherited layer underneath has never been independently
reviewed.

So: *is it sound?*

The failure mode we most want examined is **code that reports a check as passed without
performing it**. Several of the defects found so far have had exactly that shape,
including assertions written by the maintainers that could not fail. See
`SECURITY.md` → 6.0.0 and `docs/THREAT_MODEL.md` for the fail-closed principle this is
testing.

## 2. Scope

Two tiers, to be **priced separately** so the boundary can be drawn against a number
rather than before seeing one.

### Tier 1 — core, 11,739 lines across 33 files

| Module | Lines | Why it matters |
| --- | ---: | --- |
| `lib/script/` | 3,375 | Consensus script interpreter. Divergence from the node means accepting a transaction the network rejects, or the reverse. |
| `lib/transaction/` | 2,767 | Sighash construction and signing — both BIP-143 and the Original Transaction Digest Algorithm. |
| `lib/crypto/` | 2,378 | ECDSA, nonce derivation, signature encoding, the script-number type. |
| `lib/hdprivatekey.js`, `lib/hdpublickey.js` | 1,168 | BIP-32 derivation, including hardened paths. |
| `lib/privatekey.js`, `lib/publickey.js` | 843 | Key construction, serialisation, WIF. Recent defects here produced a *different* key without error. |
| `lib/address.js` | 543 | Address derivation and network binding. |
| `lib/networks.js`, `lib/opcode.js` | 665 | Network parameters and the opcode table, which BSV upgrades have reassigned. |

### Tier 2 — optional, 1,496 lines

| Module | Lines | Why it may belong in scope |
| --- | ---: | --- |
| `lib/encoding/` | 644 | Base58Check, varint and buffer readers — the parsing surface untrusted bytes hit first. |
| `lib/mnemonic/` | 544 | BIP-39 seed derivation. Small, but a weakness here compromises every key beneath it. |
| `lib/ecies/` | 308 | Encryption built on audited primitives; the composition is ours. |

Tier 2 is cryptographic rather than application code, so excluding it is a **budget
decision, not a risk judgement**. Priced as an add-on it is cheap; discovered later it
is not.

## 3. Out of scope, and why

| Component | Status | Reason |
| --- | --- | --- |
| `@noble/curves`, `@noble/hashes`, `@noble/ciphers` | Already audited | The primitives come from the Noble libraries, which **Cure53 has audited and published on**. We do not implement curve or hash arithmetic ourselves. State this explicitly to vendors — otherwise they price work we do not need. |
| `lib/smart_contract/`, `lib/ltp/`, `lib/gdaf/`, `lib/ordinals/`, `lib/block/`, plus 9 further directories and 6 top-level files | Excluded | Application layer, 22,699 lines — 18,435 in the five named modules and 4,264 in the remainder. Written in-house and covered by adversarial tests. Worth a separate engagement; including it here would blur the question in §1. |

Totals reconcile against `lib/`, which is 35,934 lines across 122 files:

```
tier 1      11,739
tier 2       1,496
excluded    22,699
            ------
total       35,934
```

Core + optional = 13,235.

## 4. What an auditor gets on day one

Each of these should *reduce* the quote — they remove discovery work.

- **`docs/THREAT_MODEL.md`** — every claimed security property mapped to the adversarial
  test that proves it, with honest known limitations. Test paths are gate-checked by
  `test/security/threat_model_coverage.js`, so the document cannot cite tests that no
  longer exist. Scope that honestly: the gate asserts existence and a minimum citation
  count, not that the cited tests still assert anything — a test gutted in place would
  pass it.
- **`npm run conformance`** — 452 cases across 13 suites, freezing observable behaviour
  so any change surfaces as a diff. A second, independently written implementation
  (`smartledger-bsv-core`, the TypeScript port) agrees on all 452.
- **4,647 passing tests**, plus a reproducible-bundle gate, a require-cycle gate, and a
  type-drift gate that parses the published types against the runtime.
- **`SECURITY.md`** — a published advisory (GHSA-gw63-x79h-mhjc) and a changelog of
  security fixes with the reasoning for each.
- **`docs/BN_JS_V5_REVIEW.md`** — an 11,071-check differential review, included so a
  reviewer can calibrate the depth we work at.

Known limitation worth disclosing up front: a frozen corpus detects a *change*, never a
pre-existing wrong assumption, and is silent on paths it does not cover. It is a
regression net, not a correctness oracle. Two independent implementations agreeing is
only evidence when they were derived independently — both this library and the TS port
guessed "fail closed" on the Chronicle shift opcodes, and both were wrong.

## 5. Vendors

| Vendor | Indicative | Rationale |
| --- | --- | --- |
| **Cure53** | €40–90k | Audited the Noble libraries we depend on, so they already know the layer beneath our core. Boutique, cryptography-literate, publishes its reports. Best fit on substance. |
| **NCC Group — Cryptography Services** | $60–150k | A dedicated cryptography team rather than a general pentest arm, with protocol and design review as a stated specialism. Good fit for the sighash and key-derivation portions. |
| **Trail of Bits** | $80–200k | Strongest name and an explicitly exploit-oriented methodology, which suits the §1 failure mode. Most expensive, and their blockchain practice leans toward smart contracts over wallet-library internals. |

Figures are published market ranges for an engagement of this size, **not offers**.
Expect re-audit of fixes to be quoted separately, typically 20–30% of the original.

Send to all three. The spread in how they scope it back is usually more informative than
any single number.

## 6. Enquiry text

```text
Subject: Audit enquiry — BSV cryptographic library core (~13k LOC JavaScript)

Hello,

We maintain @smartledger/bsv, a Bitcoin SV library published on npm. We are
seeking a quote for an independent security review of its cryptographic core.

Scope, and we would like these priced separately:

  Tier 1 — 11,739 lines, 33 files. Script interpreter, sighash and signing,
  ECDSA and signature encoding, BIP-32 derivation, key and address
  construction.

  Tier 2 — 1,496 lines. BIP-39 mnemonics, ECIES, and the Base58Check/varint
  decoding surface.

JavaScript (CommonJS), Node >= 20.19. The code is public.

Explicitly out of scope: elliptic-curve and hash primitives, which are supplied
by the Noble libraries and already audited; and our 22,699-line application
layer (credentials, tokens, ordinals), which we would treat as a separate
engagement.

Context that should shorten discovery: the core is inherited from bitcore and
has been fixed reactively but never independently reviewed. We can provide a
test-backed threat model, a 452-case behavioural conformance corpus that a
second independent implementation agrees with, and a documented history of the
defects we have found ourselves.

The failure mode we most want examined is code that reports a check as passed
without performing it — several of our own findings have had that shape.

Could you indicate availability, an approximate cost range, and what you would
need from us to firm that up?

Repository: https://github.com/codenlighten/smartledger-bsv
Package:    https://www.npmjs.com/package/@smartledger/bsv

Thank you,
SmartLedger Technology
```

## 7. Reproducing the measurements

Every figure in this document, including the excluded total, must come out of this
script. **Derive the excluded count as the complement — never by subtracting tier 1
alone.** The first draft did exactly that, double-counted tier 2, and published parts
summing to 37,430 against a 35,934 whole; §7 could not catch it because it reproduced
every figure except the wrong one.

```sh
lines () { find "$@" -name '*.js' -exec cat {} + | wc -l; }

TIER1_DIRS="lib/crypto lib/transaction lib/script"
TIER1_FILES="lib/privatekey.js lib/publickey.js lib/address.js \
             lib/hdprivatekey.js lib/hdpublickey.js lib/opcode.js lib/networks.js"
TIER2_DIRS="lib/encoding lib/mnemonic lib/ecies"

# Per-module breakdown for the scope tables
for d in $TIER1_DIRS $TIER2_DIRS; do
  printf '%-18s %3s files %6s lines\n' "$d" \
    "$(find $d -name '*.js' | wc -l)" "$(lines $d)"
done
wc -l $TIER1_FILES

# Totals, with the excluded count derived as the complement
TOTAL=$(lines lib)
T1=$(( $(lines $TIER1_DIRS) + $(cat $TIER1_FILES | wc -l) ))
T2=$(lines $TIER2_DIRS)
EXCLUDED=$(( TOTAL - T1 - T2 ))

printf 'tier 1    %6s\ntier 2    %6s\nexcluded  %6s\n          ------\ntotal     %6s\n' \
  "$T1" "$T2" "$EXCLUDED" "$TOTAL"

# Fails loudly if the three tiers stop reconciling. The non-zero check matters:
# run from the wrong directory every figure is 0, and 0+0+0 reconciles vacuously.
[ "$TOTAL" -gt 0 ] || echo "MISMATCH — run this from the repo root"
[ $(( T1 + T2 + EXCLUDED )) -eq "$TOTAL" ] || echo "MISMATCH — do not send"

find lib -name '*.js' | wc -l   # file count
```
