# DRAFT advisory — an undisclosed field can be recovered from an LTP selective-disclosure proof

**Not created.** 9.34.0, the patched version this names, reached the registry on 2026-10-14, so
the prerequisite is met. Creating it as a *draft* on GitHub is private to maintainers;
publishing is what puts it in the GitHub Advisory Database and therefore into `npm audit`.

    gh api --method POST repos/codenlighten/smartledger-bsv/security-advisories \
      --input docs/advisories/draft-ltp-salt-derivation.json

---

**Summary**
LTP selective disclosure derives its salts from the proof's own nonce, so an undisclosed field's
value can be brute-forced from the proof

**CWE** CWE-330 (Use of Insufficiently Random Values), CWE-200 (Exposure of Sensitive
Information to an Unauthorized Actor)

**Affected**

| ecosystem | package | vulnerable | patched |
|---|---|---|---|
| npm | `@smartledger/bsv` | `>= 3.3.2, < 9.34.0` | `9.34.0` |
| npm | `smartledger-bsv` | `>= 3.3.1, <= 4.4.0` | none — migrate to `@smartledger/bsv@9.35.0` |

**Severity** `AV:N/AC:L/PR:N/UI:N/S:U/C:H/I:N/A:N` — 7.5, high. The only thing an attacker needs
is a proof they were legitimately given, and a field whose value comes from a small set. Nothing
is forged and no integrity is lost: what fails is the confidentiality the disclosure exists to
provide.

---

### Impact

A selective disclosure reveals the fields it names and is supposed to hide the rest. The salt is
the only thing hiding the rest. `lib/ltp/proof.js` derived it as

```
sha256(nonce + path + index)
```

Every input there is public. The **nonce ships inside the proof** (`proof.nonce`), the path comes
from the credential schema, and the index is a small integer. No secret enters the derivation, so
anyone holding a proof can recompute the salt of *every* field in the credential — including
fields that were never disclosed.

That is enough to recover their values. The Merkle path of a disclosed field carries its sibling
hashes, and a depth-0 sibling is an undisclosed field's leaf commitment. An attacker derives that
field's salt, hashes a candidate value, and compares.

A field whose value comes from a small set falls immediately: a date, a postcode, a status, a
boolean, a name from a list, an amount in round numbers. A nine-digit national identifier is a few
billion hashes — hours on one machine, not a protection.

### Measurement

Executed through the public API against the published artifact installed from the registry
(`scripts/published-version-probes/ltp-salt-brute.js`), not against a working tree. A credential
with four fields disclosing only `claim.name`:

* `@smartledger/bsv@9.33.2`, the current release at the time of writing: the undisclosed
  `claim.dob` was **recovered** from the proof alone in under 100,000 hashes, well under a second.
* **Sixteen versions were executed**, spread across the range: scoped 3.3.2, 3.4.0, 4.4.0,
  5.4.0, 6.0.0, 7.0.0, 7.5.0, 7.5.5, 9.0.0, 9.31.0, 9.32.0 and 9.33.2, and unscoped 3.3.1,
  3.4.5, 4.1.0 and 4.4.0. All sixteen give up the field.
* The other 118 were **read rather than executed**, so that "every version in the range" is a
  reading and not an extrapolation from those sixteen. `lib/ltp/proof.js` was fetched for each
  of the 134 published versions that have it and its salt-assignment line extracted: all 134
  carry the identical line, `var salt = Hash.sha256(Buffer.from(nonce + path + index))`, with no
  fetch failures and no version lacking the assignment. The per-version listing is in
  `docs/npm-deprecations/ltp-salt-line-by-version.txt`.
* Scoped versions 1.5.6-fix1 through 3.2.2, and unscoped 3.0.0 through 3.2.2, have no
  `lib/ltp/proof` module; that is where each range opens. Presence was established **three times
  over, by three different methods**, which agree exactly on the same 15 versions without it: a
  CDN request per version for `lib/ltp/proof.js` across all 149 published versions; installing
  the versions at each boundary and loading the module; and, by a second reviewer, fetching all
  149 tarballs from the registry and listing their contents without extracting them.
* The ranges above are semver intervals, but the registry is not continuous: there is no scoped
  3.3.0 or 3.3.1, no unscoped 3.4.1 – 3.4.3, and no unscoped 4.3.x. Read each range as *the
  published versions* it contains.
* After the fix the same run returns nothing, while an honest disclosure still verifies and the
  separate value-substitution defect is still refused.

The recovery uses only `proof.nonce`, the field paths, and the library's own hashing. Nothing a
holder would withhold.

### Patches

Fixed in **9.34.0**. Each field's salt is now `HMAC-SHA256` under a 32-byte master salt that is
fresh per disclosure and never travels in a proof, over a length-prefixed message so that no two
`(path, index)` pairs can collide.

`lib/gdaf/zk-prover.js` in this same library already did it this way, and its comments state the
reason: *"the MASTER salt. Never put this in a proof — it re-derives every leaf salt and reopens
the whole credential."* `lib/ltp/proof.js` kept its own copy of the commitment code and so kept
the hazard. It is the second defect that module held for that reason.

**The Merkle root moves.** Two disclosures of one credential no longer share a root, and a root
can no longer be re-derived from `(credential, nonce)`. Every proof already issued still verifies:
a proof carries its own root and its own disclosed salts, and verification re-derives neither.
What stops working is re-deriving a root and comparing it — which is the reproducibility this
recovery is built on. Nothing in the library signs or anchors this root, so no signature it
produces is invalidated; a consumer that pinned one itself cannot reproduce it after 9.34.0,
under any option.

A caller that needs a stable root passes `options.saltSeed` and keeps that seed secret. It must
come from a CSPRNG: a guessable seed loses the undisclosed fields exactly as a public one does,
with one extra guess in front of it. The nonce is refused outright.

### Workarounds

On an affected version, do not put a field in a credential unless every holder of any disclosure
from it may read that field. In practice that means the module provides no selective
confidentiality on an affected version, and a high-entropy value is the only kind it hides.

### Action required

Upgrade to `9.35.0` or later. On the unscoped `smartledger-bsv` there is nothing to upgrade to
— migrate to `@smartledger/bsv@9.35.0` or later, reviewing migration requirements first.

Then treat any undisclosed field with a guessable value, in a proof already handed out, as
**potentially exposed** to whoever holds that proof — most directly where its leaf is the
sibling of a disclosed leaf, which is the case measured above. A field deeper in a wholly
undisclosed subtree is not individually testable from one proof: recovering it means guessing
every leaf under the ancestor the proof exposes, jointly. So this is per-proof, and proofs that
share a root should be assessed together.

Re-issuing the credential on 9.34.0 protects fields in *future* disclosures. It cannot withdraw a
proof already given out, and that proof stays exactly as brute-forceable as it was.
