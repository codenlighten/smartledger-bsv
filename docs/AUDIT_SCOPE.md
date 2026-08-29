# External security audit — scope and request for quote

This document scopes an independent security review of the `@smartledger/bsv`
cryptographic core, and carries the enquiry text to send to vendors. It exists so that
every vendor prices the *same* thing, and so that the reasoning behind the scope
boundary survives past the engagement that prompted it.

Measured against **v8.3.0**, 2026-08-16. Re-measure before sending if the version has
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

The boundary is drawn by **where defects have actually occurred**, not by how core a
module sounds. That is a deliberate revision: an earlier version of this document
scoped Tier 1 as "the cryptographic core" and would have excluded four of the six real
defects this codebase has produced. See §2.1.

### Tier 1 — 11,247 lines

| Module | Lines | Why it matters |
| --- | ---: | --- |
| `lib/transaction/` | 2,779 | Sighash construction and signing — both BIP-143 and the Original Transaction Digest Algorithm. |
| `lib/script/interpreter.js` | 2,684 | **Scoped to the flag and era surface, not opcode execution.** Consensus-flag selection and defaults, era derivation (Genesis/Chronicle), the limits derived from them, and the semantics of the exported `verify()`. Opcode execution is excluded — see §2.2. |
| `lib/crypto/` | 2,519 | ECDSA, nonce derivation, signature encoding, the script-number type. **Scope this for an architectural judgement as well as for bugs** — see §2.3. |
| `lib/notaryhash/` | 1,436 | BRC-220 signing and verification. Publicly reachable and relied on downstream. |
| `lib/privatekey.js`, `lib/publickey.js` | 843 | Key construction, serialisation, WIF. Recent defects here produced a *different* key without error. |
| `lib/smart_contract/` (targeted) | 472 | `locks.js` and the covenant-facing entrypoints in `index.js`: CLTV and HTLC locking semantics, flag plumbing, and any wrapper claiming mainnet-equivalent verification. Not the whole 6,908-line module. |
| `lib/covenant/` | 409 | The verification harness. Its flag word is what made covenants verify under 2019 rules while claiming to mirror mainnet. |
| `lib/util/jcs.js` | 105 | RFC 8785 canonicalization, now a public export and the estate's single implementation. |

### Tier 2 — optional, 1,607 lines

| Module | Lines | Why it may belong in scope |
| --- | ---: | --- |
| `lib/encoding/` | 708 | Base58Check, varint and buffer readers — the parsing surface untrusted bytes hit first. |
| `lib/mnemonic/` | 591 | BIP-39 seed derivation. Small, but a weakness here compromises every key beneath it. |
| `lib/ecies/` | 308 | Encryption built on audited primitives; the composition is ours. |

Tier 2 is cryptographic rather than application code, so excluding it is a **budget
decision, not a risk judgement**. Priced as an add-on it is cheap; discovered later it
is not.

### 2.1 Why the boundary moved

Six defects have been found in this codebase and fixed. Four of them were in code the
previous version of this scope **excluded**:

| Defect | Module | Was it in the old scope? |
| --- | --- | --- |
| Covenant verification applied pre-Genesis limits while claiming to mirror mainnet | `lib/covenant`, `lib/smart_contract` | no |
| `timeLockCLTV` and the HTLC timeout enforced nothing on mainnet — Genesis reverted `OP_CLTV` to a NOP, so the funds were spendable immediately | `lib/smart_contract` | no |
| A BRC-220 suite verified against a byte-reversed digest, rejecting every conformant signature | `lib/notaryhash` | no |
| The reachable RFC 8785 canonicalizer was non-conformant while a correct one sat private; three downstream packages copied the wrong one | `lib/util/jcs.js`, `lib/ltp` | partly |
| `ECDSA.verify()` returned the instance, so `if (verify())` was always truthy — a fail-open accepting forged signatures | `lib/crypto` | yes |
| ECDSA nonce reuse across two signings on one instance, leaking the private key | `lib/crypto` | yes |

The pattern is not "the primitives are weak". It is that **code making claims about
consensus behaviour was wrong about it**, and the tests agreed because they shared the
same assumption. Scope has been moved onto that surface.

### 2.2 Why `lib/script` shrinks rather than leaves

`lib/script` has the strongest external evidence in the repository: 1,483/1,483 of the
reference node's own consensus vectors, zero false accepts and zero false rejects. That
is evidence about **opcode execution**, and re-auditing it by hand is the least
productive money in this engagement.

It is not evidence about which flags a caller ends up with. Both consensus defects above
were flag-selection and era-derivation failures reachable through `interpreter.js`, and
no vector covers them because every vector states its own flags. So the interpreter stays
in scope, scoped to that surface, and the remaining 1,175 lines of `lib/script` leave.

### 2.3 A specific instruction for `lib/crypto`

Both in-scope defects — a fail-open `verify()` and nonce reuse across signings — are
symptoms of a **stateful object wrapper around a stateless primitive library**. The
curve arithmetic beneath is `@noble/curves`, which is already audited and offers
stateless signing, RFC 6979 nonces and a strict boolean verify.

So do not only ask whether `lib/crypto` has bugs. Ask whether the wrapper should exist:
what would it cost to route the signing and verification paths directly at `@noble`, and
which parts genuinely cannot go? `bn.js`, `Point`, `Signature` and `Shamir` are public
API (`bsv.crypto.*`) and cannot simply be deleted, so this is a question with a real
answer rather than a rhetorical one. An answer either way is worth more than a list of
findings inside code that should not be there.

### 2.4 The requirement that matters most

Whatever the final line count, the statement of work should carry this:

> **Audit exported security claims, defaults, and the tests that assert them as a unit,
> against an independent oracle or specification — not each in isolation.**

Every defect above shares one shape. The code was wrong, and its tests passed, because
the tests were written from the same assumption. A file-by-file review finds none of
them. Checking a claim against something outside this repository finds all of them —
which is exactly how each was eventually caught.

## 3. Out of scope, and why

| Component | Status | Reason |
| --- | --- | --- |
| `@noble/curves`, `@noble/hashes`, `@noble/ciphers` | Already audited | The primitives come from the Noble libraries, which **Cure53 has audited and published on**. We do not implement curve or hash arithmetic ourselves. State this explicitly to vendors — otherwise they price work we do not need. |
| Opcode execution in `lib/script/` (1,175 lines outside `interpreter.js`) | Excluded, with evidence | 1,483/1,483 of the reference node's own consensus vectors pass, with zero false accepts and zero false rejects. See §2.2 — the flag surface stays in, the execution does not. |
| `lib/address.js`, `lib/networks.js`, `lib/opcode.js`, `lib/hdprivatekey.js`, `lib/hdpublickey.js` (2,391 lines) | Cut to pay for §2.1 | Formatting, network constants and BIP-32 derivation. No defect has originated here, and `networks.js` in particular defines addressing constants — pubkey hashes, xpub prefixes, ports, DNS seeds — and contains **no consensus-flag logic at all**. |
| The rest of the application layer — `lib/gdaf/`, `lib/ltp/`, `lib/ordinals/`, `lib/block/`, `lib/didweb/`, `lib/vcjwt/`, `lib/statuslist/`, most of `lib/smart_contract/`, plus assorted top-level files | Excluded | ~26,000 lines. Worth a separate engagement; including it here would blur the question in §1. Note the parts of it with a demonstrated defect history have been pulled *into* Tier 1 rather than left here — see §2.1. |

Totals reconcile against `lib/`, which is 38,879 lines across 131 files:

```
tier 1      11,247
tier 2       1,607
excluded    26,025
            ------
total       38,879
```

Measured 2026-08-29 at `a954c27`. These figures drift as the library changes — an
earlier set was 445 lines light by the time it was read, most of it in
`lib/script/interpreter.js`, which is priced against. **Re-run §7 immediately before
sending**, and update the date above with the commit measured.

Core + optional = 12,854.

## 4. What an auditor gets on day one

Each of these should *reduce* the quote — they remove discovery work.

- **`docs/THREAT_MODEL.md`** — every claimed security property mapped to the adversarial
  test that proves it, with honest known limitations. Test paths are gate-checked by
  `test/security/threat_model_coverage.js`, so the document cannot cite tests that no
  longer exist. Scope that honestly: the gate asserts existence and a minimum citation
  count, not that the cited tests still assert anything — a test gutted in place would
  pass it.
- **The reference node's own consensus vectors**, copied verbatim from
  `bitcoin-sv/bitcoin-sv` v1.2.0 with provenance in `test/data/bitcoin-sv/README.md`, and
  run as gates: 1483/1483 script vectors with zero false accepts and zero false rejects,
  600/600 result codes, 161/161 transaction vectors, 1000/1000 digest vectors on both
  routing columns. This is the single most useful thing here, and it did not exist before
  v8.0.0 — the first run scored 1426/1483 with **21 false accepts**. An auditor can treat
  consensus conformance as measured and spend the engagement on what the vectors cannot
  reach: key handling, nonce generation, encoding, and the composition above the
  interpreter.
- **`npm run conformance`** — 452 cases across 13 suites, freezing observable behaviour
  so any change surfaces as a diff. A second, independently written implementation
  (`smartledger-bsv-core`, the TypeScript port) agrees on all 452.
- **4,626 passing tests**, plus a reproducible-bundle gate, a require-cycle gate, and a
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
Subject: Audit enquiry — BSV library, consensus and signing surface (~13k LOC JavaScript)

Hello,

We maintain @smartledger/bsv, a Bitcoin SV library published on npm. We are
seeking a quote for an independent security review.

Scope, and we would like these priced separately:

  Tier 1 — 11,247 lines. Sighash construction and signing; ECDSA, nonce
  derivation and signature encoding; the consensus-flag and era-derivation
  surface of the script interpreter; BRC-220 signing and verification;
  key construction and serialisation; the covenant verification harness and
  the locking-script semantics built on it; RFC 8785 canonicalization.

  Tier 2 — 1,607 lines. BIP-39 mnemonics, ECIES, and the Base58Check/varint
  decoding surface.

JavaScript (CommonJS), Node >= 20.19. The code is public.

Two things we would ask you to scope deliberately rather than by line count:

  1. Please audit exported security claims, their defaults, and the tests that
     assert them AS A UNIT, against an independent oracle or specification.
     Every defect we have found shared one shape: the code was wrong and its
     tests passed, because both were written from the same assumption. A
     file-by-file review would have found none of them.

  2. In lib/crypto, we would value a judgement on whether the wrapper should
     exist at all. Our two worst defects there — a verify() that returned a
     truthy object instead of a boolean, and nonce reuse across two signings
     on one instance — are symptoms of a stateful wrapper around a stateless
     primitive library (@noble/curves) that already offers stateless signing,
     RFC 6979 nonces and a strict boolean verify. An answer on the cost of
     removing the wrapper is worth more to us than a list of findings inside it.

Explicitly out of scope: elliptic-curve and hash primitives, supplied by the
Noble libraries and already audited by Cure53; opcode execution in the script
interpreter, which passes 1,483/1,483 of the reference node's own consensus
vectors with zero false accepts; and roughly 26,000 lines of application layer
(credentials, tokens, ordinals), which we would treat as a separate engagement.

Context that should shorten discovery: the core is inherited from bitcore and
has been fixed reactively but never independently reviewed. We can provide a
test-backed threat model, a 452-case behavioural conformance corpus that a
second independent implementation agrees with, the node's own consensus vectors
run as a gate, and a documented history of the defects we have found ourselves.

The failure mode we most want examined is code that reports a check as passed
without performing it — every finding of ours has had that shape.

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
alone.** An early draft did exactly that, double-counted tier 2, and published parts
summing to 37,430 against a 38,322 whole; §7 could not catch it because it reproduced
every figure except the wrong one.

Tier 1 is no longer whole directories. Three entries are partial — the interpreter is
scoped to its flag surface, `smart_contract` to its locking semantics — so those are
counted by file and the reason is in §2. A partial scope that is measured as a whole
directory is how a vendor prices 6,908 lines when you meant 472.

```sh
lines () { find "$@" -name '*.js' -exec cat {} + | wc -l; }

# Whole directories in tier 1
TIER1_DIRS="lib/crypto lib/transaction lib/notaryhash lib/covenant"

# Individual files — including the PARTIAL entries (§2.2, §2.3)
TIER1_FILES="lib/privatekey.js lib/publickey.js \
             lib/script/interpreter.js \
             lib/smart_contract/locks.js lib/smart_contract/index.js \
             lib/util/jcs.js"

TIER2_DIRS="lib/encoding lib/mnemonic lib/ecies"

# Per-module breakdown for the scope tables
for d in $TIER1_DIRS $TIER2_DIRS; do
  printf '%-20s %3s files %6s lines\n' "$d" \
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

# The cut list from §3, so the saving can be stated rather than asserted
wc -l lib/address.js lib/networks.js lib/opcode.js \
      lib/hdprivatekey.js lib/hdpublickey.js

# networks.js carries no consensus-flag logic — the claim §3 rests on.
# Expect 0. A non-zero result means the cut needs re-arguing.
grep -cE 'SCRIPT_|GENESIS|CHRONICLE|consensus' lib/networks.js

find lib -name '*.js' | wc -l   # file count
```
