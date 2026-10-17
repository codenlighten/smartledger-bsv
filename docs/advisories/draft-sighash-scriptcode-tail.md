# DRAFT advisory — the original-algorithm signature digest covers bytes the node does not sign

**FILED AND PUBLISHED as [GHSA-j884-5pmj-6wqp](https://github.com/codenlighten/smartledger-bsv/security/advisories/GHSA-j884-5pmj-6wqp)** on 2026-10-15.

This file is the source the payload was built from; the advisory itself is the one at
that link, and `scripts/build-advisories.js --check` keeps the two in step. Publishing it
enqueued it for GitHub's curation review — it did **not** place it in the global advisory
database, measured by requesting `api.github.com/advisories/GHSA-j884-5pmj-6wqp` and getting **404**,
so `npm audit` does not flag a version in its range. That is the same result every one of
these has had; it is a property of repository advisories, not of this one.

---

**Summary**
The original transaction digest algorithm serializes the whole scriptCode where the node stops at
an undecodable push, so signatures over such a script disagree with the network on validity

**CWE** CWE-436 (Interpretation Conflict), CWE-347 (Improper Verification of Cryptographic
Signature)

**Affected**

| ecosystem | package | vulnerable | patched |
|---|---|---|---|
| npm | `@smartledger/bsv` | `< 9.37.0` | `9.37.0` |
| npm | `@smartledger/bsv-core` | `< 1.6.0` | `1.6.0` |
| npm | `smartledger-bsv` | `<= 4.4.0` | none — migrate to `@smartledger/bsv@9.37.0` |

**Severity** `AV:N/AC:H/PR:N/UI:N/S:U/C:N/I:H/A:N` — 5.9, medium. `AC:H` is deliberate and is
the whole shape of this one: it needs a prevout script that ends in a push the node cannot
decode, and a signature made at a hash type that selects the original algorithm. Neither is what
ordinary wallet code does. What is lost where it applies is integrity: this library's verdict on
a signature differs from the network's, in both directions.

---

### Impact

For a scriptCode that ends in a push the node cannot decode, the node does **not** hash all of
it. `CTransactionSignatureSerializer::SerializeScriptCode` writes

    ::WriteCompactSize(s, scriptCode.size() - nCodeSeparators);

and then the bytes up to the iterator the **last, failed** `GetOp` left behind. `GetOp2` advances
`pc` past the opcode, and past a complete length field, *before* it tests whether the operand is
present:

    unsigned int opcode = *pc++;
    ...
    } else if (opcode == OP_PUSHDATA2) { if (end() - pc < 2) return false; nSize = ReadLE16(&pc[0]); pc += 2; }
    if (end() - pc < 0 || (unsigned int)(end() - pc) < nSize) return false;

So the opcode and whatever length field it managed to read are written, the partial operand after
them is dropped, and the length prefix still counts it. The node hashes a field that declares more
bytes than it contains.

These libraries serialized the scriptCode in full, and so computed a different digest. Both
directions follow, stated as what was measured — **script verification under the tested consensus
rules**, which is not the same as relay, mempool policy or confirmation:

* a signature that **passes** the node's script verification **fails** here, so a relying party
  refuses a spend the network would validate;
* a signature this library produces or accepts **fails** the node's script verification, so a
  service that treats its own `verify` as authoritative can accept a transaction that will not
  validate on the network.

The second is the one that could cost something, and only under a specific arrangement: a service
that accepts an attacker-supplied transaction spending such a prevout, verifies it with this
library, and acts on that verdict — releasing goods, credit or a second transaction — **before**
seeing the spend confirmed on chain. That is the scenario `I:H` in the vector below is scored
against, and `PR:N` assumes the attacker can present such a transaction to that service without
an account or other privilege, which is the usual case for a public payment endpoint. A service
that waits for confirmation loses nothing here, because the chain is the authority and this
library's verdict never becomes one.

**This is reachable at a hash type in use today, and that hash type was the one tested.**
`SignatureHash` takes the original algorithm unless
`enabledSighashForkid && sigHashType.hasForkId() && !sigHashType.hasChronicle()`, so `0x61` —
`SIGHASH_ALL | FORKID | CHRONICLE`, post-Chronicle — uses it, as does any non-FORKID type. The
spend verification described under Measurement was run at exactly two hash types: **`0x61` under
mainnet-era flags and `0x01` under non-FORKID-era flags**. Taking the original-algorithm branch is
what makes the digest differ; it does not by itself make a signature at some other non-FORKID
type network-valid, and no claim is made about hash types that were not run. **BIP-143 is not affected at all**: its scriptCode goes through the plain `CScript`
serializer with no walk, so `0x41`, which is what essentially every BSV wallet signs with, is
unaffected. That, and the unusual prevout script, are why the severity above is medium and not
high.

It also matters *where* such a push sits. In a lock that is only `OP_RETURN` followed by junk,
post-Genesis evaluation ends before the junk and no signature is ever checked, so the digest is
never used. The shape where this bites is a lock that checks a signature **first** and carries
the undecodable push after a top-level `OP_RETURN` — the tail is signed and never read.

### Measurement

Executed against published artifacts installed from the registry, never a working tree —
**25 of them**, with a control in every run.

The oracle is a 70-row corpus of preimages and digests for one fixed transaction, emitted by a
compiled **bitcoin-sv v1.2.3**; 15 of those rows were also emitted, independently and
byte-identically, by a second node implementation. It is vendored at
`test/data/sighash-scriptcode-tail.json` and asserted by
`test/transaction/sighash_scriptcode_tail.js`.

* **The defect, and the fix.** `@smartledger/bsv@9.36.0` matched the compiled node on **45 of the
  55** rows a parse can produce; `9.37.0`, installed from the registry, matches on **55 of 55**,
  preimage and digest, as does `@smartledger/bsv-core@1.6.0`. The other **15** rows cover three
  scripts whose chunk lists a parse never returns, so no released version could be tested against
  them before the fix; both patched packages, read from the registry, match **15 of 15** against
  the compiled node and against the second implementation independently. **70 of 70 after the
  fix.**
* **Two shapes, with different histories.** A push whose *data* is short (`6a4c050102`,
  `6a4d030001ff`, `6a050102`) always parsed, so its digest has always been wrong. A push whose
  *length prefix* is cut off (`6a4d01`, `6a4e0100`) made the parser **throw** before
  `@smartledger/bsv` 9.35.0 and `@smartledger/bsv-core` 1.6.0, so no digest was produced at all —
  a refusal rather than a wrong answer. Making those scripts parseable is what brought the second
  shape into the defect, and is also what led to its discovery.
* **Every range opens at the first published version on its name**, which is measured rather than
  assumed: `@smartledger/bsv@1.5.6-fix1`, `smartledger-bsv@3.0.0` and
  `@smartledger/bsv-core@1.0.0` are each the earliest release of that package, and each gives the
  wrong digest for the short-data shape while answering correctly on the control.
* **Versions executed.** Scoped: 1.5.6-fix1, 3.0.2, 3.2.2, 3.3.2, 4.4.0, 5.4.0, 6.0.0, 7.0.0,
  7.5.5, 9.0.0, 9.20.0, 9.31.0, 9.33.2, 9.35.0, 9.36.0 — all wrong — and 9.37.0, correct.
  Unscoped: 3.0.0, 3.2.2, 3.3.1, 4.4.0 — all wrong, and no release on that name is correct.
  `@smartledger/bsv-core`: 1.0.0, 1.3.0, 1.5.0, 1.5.2 — all wrong — and 1.6.0, correct.
* **The control.** Every one of those runs also computed the digest for `6a0401020304`, a
  well-formed `OP_RETURN` push, and **every version matched the node on it**. So the failures are
  this defect and not a broken harness, a wrong fixture or an API that moved.
* **Every published version was read, not just the 25 that were executed.** A range that says
  "every version" has to answer for the versions nobody ran, so
  `lib/transaction/sighash.js` — `dist/transaction/sighash.js` for `@smartledger/bsv-core` — was
  fetched for **all 167 published versions** of the three packages from the CDN that serves the
  npm tarballs, and checked for the function that writes only the bytes the node's walk reached.
  It is present in **exactly two of the 167**: `@smartledger/bsv@9.37.0` and
  `@smartledger/bsv-core@1.6.0`. Every other version — 130 scoped, 22 unscoped, 13 core — lacks
  it, every request returned HTTP 200 with the module present, so there is no version where the
  question went unanswered. The per-version listing is in
  `docs/npm-deprecations/sighash-walk-by-version.txt`.
* **The ranges above are semver intervals and the registry is not continuous.** Read each as *the
  published versions it contains*: 25 executed, all 167 read.
* **It is a verification difference, not only a byte difference.** Established by a separate
  harness rather than here, and reported as theirs: 35 spends of the shape
  `<pubkey> CHECKSIG OP_RETURN <tail>` were judged by **two** independent engines — a compiled
  v1.2.3 `verify_script` and an independent node implementation — which agree on 35/35 that for
  these tails script verification **passes** for a signature over the node-serializer digest and
  **fails** with `SIG_NULLFAIL` for one over the whole-script digest, at `0x61` under mainnet-era
  flags and at `0x01` under non-FORKID-era flags. That is a consensus script-verification result.
  Whether such a transaction would be relayed, accepted into a mempool or mined depends on policy
  rules that were not tested, and nothing here claims otherwise.

### Patches

Fixed in **`@smartledger/bsv@9.37.0`** and **`@smartledger/bsv-core@1.6.0`**. The serializer now
performs the node's own walk over the scriptCode **bytes**, counting the separators it reaches and
recording where it stops, then declares `size - separators reached` while writing only the bytes
up to that point.

Deriving it from the bytes rather than from the parsed chunk list is load-bearing. A first
implementation read the last chunk, on the ground that a parse always leaves an undecodable push
last — true of the parser, and **not** of the public chunk representation, which a caller can
assemble by hand with one in the middle. `4c05aabb51` is that case, and it is one of the 15 rows
the second node implementation judged.

No signature over a scriptCode whose pushes all decode changes — which is every well-formed
script — and no BIP-143 digest changes.

### Workarounds

On an affected version, do not sign or verify a spend of a prevout script that ends in a push
whose declared length exceeds the bytes present, at any hash type other than a FORKID BIP-143 one.

In practice: `SIGHASH_ALL | SIGHASH_FORKID` (`0x41`) and the other BIP-143 types are unaffected,
so code that signs the way current BSV wallets sign is not exposed. Code that sets
`SIGHASH_CHRONICLE`, or signs without `SIGHASH_FORKID`, and handles scripts it did not construct
itself, is.

If you must screen rather than upgrade, screen the **bytes**, and screen the scriptCode that is
actually hashed — which is not always the whole prevout locking script, since `OP_CODESEPARATOR`
trims it and a P2SH redeem script is a different string. Walk it as the node does: read an
opcode; for `0x01`–`0x4b` the opcode is the length, for `0x4c`/`0x4d`/`0x4e` read a 1-, 2- or
4-byte little-endian length after it; if fewer bytes remain than the length field needs, or fewer
than the declared length, that script is affected. A parsed-chunk test is **not** a general
substitute: a chunk list can be assembled by hand with an undecodable push anywhere in it, and on
versions before the fix one of the two shapes throws during parsing instead of returning a chunk
at all.

Upgrading is the real answer; the screen is for code that cannot upgrade yet.

### Action required

Upgrade to `@smartledger/bsv@9.37.0` or `@smartledger/bsv-core@1.6.0` or later. On the unscoped
`smartledger-bsv` there is nothing to upgrade to — migrate to `@smartledger/bsv@9.37.0` or later,
reviewing migration requirements first.

Then, if you signed or verified anything of the shape described above on an affected version:

* a transaction you signed and broadcast that was never mined may have failed script verification
  for this reason, and may pass once re-signed on a patched version — relay and confirmation
  depend on other rules and on policy, so re-signing removes this cause and does not guarantee
  the outcome;
* a signature you **rejected** may have been valid, so any decision taken on a rejection is worth
  revisiting;
* a signature you **accepted** over the whole-script digest is not valid to the network, and
  anything that treated it as settled should be re-checked against the chain rather than against
  this library.

Nothing needs to be rotated: no key material is exposed by this defect, and no signature over a
well-formed script is affected.
