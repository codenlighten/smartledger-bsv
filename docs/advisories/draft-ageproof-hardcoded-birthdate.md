# DRAFT advisory — `generateAgeProof` ignores its argument and attests a hardcoded birth date

**Published** on 2026-10-14 as
[`GHSA-2j2f-5v2f-pvpq`](https://github.com/codenlighten/smartledger-bsv/security/advisories/GHSA-2j2f-5v2f-pvpq),
high. Read back from the API after creation: description, summary, CVSS vector, CWEs and
affected products all **byte-identical** to the payload beside this file. No CVE.

Being in the GitHub Advisory Database does **not** by itself make `npm audit` flag a version in
its range — measured on 2026-10-14; see the README beside this file.

---

**Summary**
`GDAF#generateAgeProof` discards the credential it is given and commits to a hardcoded birth
date, so an age proof verifies for a subject who does not meet the threshold

**CWE** CWE-1288 (Improper Validation of Consistency within Input), CWE-287 (Improper
Authentication)

**Affected**

| ecosystem | package | vulnerable | patched |
|---|---|---|---|
| npm | `@smartledger/bsv` | `>= 3.3.2, < 9.36.0` | `9.36.0` |
| npm | `smartledger-bsv` | `>= 3.3.1, <= 4.4.0` | none — migrate to `@smartledger/bsv@9.36.0` |

**Severity** `AV:N/AC:L/PR:N/UI:N/S:U/C:N/I:H/A:N` — 7.5, high. What fails is integrity; nothing
is disclosed that was not already in the proof. There is **no attacker**, so see the note under
Impact on how to read that number — it is a conditional worst case for a relying application, not
a demonstrated exploit.

---

### Impact

`GDAF#generateAgeProof(ageCredential, minimumAge, nonce)` and the top-level
`bsv.generateAgeProof` — both declared in `bsv.d.ts` and both shown in
`docs/technical/GDAF_DEVELOPER_INTERFACE.md` — **ignored their first argument**:

```js
GDAF.prototype.generateAgeProof = function (ageCredential, minimumAge, nonce) {
  // For this demo, we'll work with the birth date directly
  // In a real implementation, this would extract from the credential
  var birthDate = new Date('1995-06-15') // This should come from the credential creation
  return this.zkProver.generateAgeProof(birthDate, minimumAge, nonce)
}
```

Every call therefore produced a proof about a person born 1995-06-15, whatever credential or
subject was passed. The proof is internally consistent and `verifyAgeProof` returns `true` for
it, so a relying party sees a valid age proof for a threshold the real subject may not meet.

**What this is not.** It is not a cryptographic forgery and no attacker is involved.
Verification requires the opening, and the opening carries `birthDate` **in plaintext**, so a
verifier that inspects it sees a date with no relation to the subject. This construction also
establishes no issuer authenticity and no subject binding at all — nothing checks an issuer
signature, a subject identifier or a status list — which is a separately documented limit of the
API. The exposure is for a relying party that treats a `true` from `verifyAgeProof` as evidence
about the credential's subject. Our own developer documentation demonstrated precisely that
pattern, down to the same 1995-06-15, which is why the defect survived: the example worked.

**On the 7.5 "high" attached to this advisory.** Read it as a conditional worst case for a
relying application, not as a demonstrated exploit. CVSS models an attacker and there is none
here: the library produces the false attestation on its own, for every caller, with no
adversarial input. `AV:N` / `PR:N` / `UI:N` follow the convention this advisory set already uses
for the other attacker-free defects in this package — `GHSA-9r95-pq7h-p78g`, where a JSON round
trip loses funds with nobody involved — rather than any established remote attack path. `I:H`
depends on the affected application: it holds where a relying party gates something that matters
on a `true` from `verifyAgeProof`, and is lower where nothing is gated on it.

### Measurement

Executed through the public API against published artifacts installed from the registry, not
against a working tree, with the loaded package name and version asserted before any call.

On **`@smartledger/bsv@9.35.0`**, the release immediately before the fix:

* a credential for a subject born **2015-03-01** — about 11 years old — produced a proof that
  `verifyAgeProof` returned **`true`** for at **every `minimumAge` from 1 to 31**. So an 18 or 21
  gate passes. `minimumAge` of 32 or more threw `Age requirement not met` for *every* caller,
  however old the subject, because the hardcoded date fixes the apparent age at 31;
* two credentials, for subjects born **2015** and **1960**, produced **byte-identical**
  `birthDateCommitment` and identical `opening`;
* `proof.opening.birthDate` was `"1995-06-15"` for all of them;
* **ten input shapes** — a `Date`, an ISO string, a credential with a plaintext `birthDate`, a
  credential with only `birthDateHash`, `undefined`, `null`, a number, an empty object, a
  non-date string, and the hardcoded date itself — returned **one** commitment between them and
  **zero** proofs matching what was asked. It was a constant function of its first argument.

**Range, read rather than extrapolated.** `lib/gdaf/index.js` was fetched for every published
version of both package names and `generateAgeProof`'s body extracted: all **136** published versions that have the module carry the identical hardcoded `new Date('1995-06-15')` inside `generateAgeProof` — 122 scoped, from **3.3.2** through **9.35.0**, and all 14 unscoped, from **3.3.1** through **4.4.0** — with **no fetch failures**, no version lacking the method, and no version whose body differs. The **15** versions with no `lib/gdaf/index.js` at all (scoped `1.5.6-fix1` and `3.0.2`–`3.2.2`, unscoped `3.0.0`–`3.2.2`) are where each range opens, and `9.36.0` is the only version of either name that carries the fix. 152 versions were examined and 152 are accounted for. The
per-version listing is in `docs/npm-deprecations/ageproof-by-version.tsv`.

**Two eras, and the affected range deliberately spans both.** The range covers the versions that
contain *this* defect — the hardcoded date — and that is every version with the module, from
3.3.2 (scoped) and 3.3.1 (unscoped). The consequences differ by era, which is why both are
described rather than the range being narrowed:

* `ZKProver.verifyAgeProof` took no opening before **8.2.0** — arity 2 — and **accepted a wholly
  invented proof** (`meetsRequirement: true`, a zero commitment, no opening, no salt, no key),
  measured on 5.4.0, 7.0.0 and 8.1.0. That is the separately recorded forgery fixed in 8.2.0.
* From **8.2.0** the verifier has arity 3 and **refuses that same invented proof**, measured.

Stated narrowly on purpose: one invented proof was tested at each end. That shows the pre-8.2.0
verifier accepted *the tested* proof and the later one refused it. It does **not** establish that
the later verifier is sound in general, nor that every pre-8.2.0 attestation was worthless for
every input. What the two measurements do support is that **8.2.0 through 9.35.0 is the band
where this defect is the distinctive one**, because there the verifier refused the forgery we
tested while the prover still fabricated the date. Below 8.2.0 a second, already-recorded defect
is present as well, so an attestation there fails for more than one reason.

### Patches

Fixed in **9.36.0**. `generateAgeProof` now takes the **birth date** — a `Date`, or a strict
`YYYY-MM-DD` string parsed as UTC and required to round-trip, which rejects `2015-02-30` rather
than rolling it forward to March 2nd. An invalid `Date`, a future date and a non-date are all
refused, and so is a **credential**.

Refusing a credential is deliberate and is the only honest option. `createAgeCredential` stores
only `credentialSubject.birthDateHash = sha256(birthDate.toISOString())`; the credential never
carries the date, while the proof commits to `sha256('YYYY-MM-DD' + ':' + salt)`. There is no
function from the credential to the proof — not a missing one, an impossible one. Reading an
unverified `credentialSubject.birthDate` out of a credential-shaped object would have been the
tempting fix and is worse than the defect it replaces: it swaps a hardcoded date for a
caller-supplied one while still *looking* like a statement about an authenticated credential.

**No working call breaks.** The measurement above is also the compatibility argument: a constant
function of its first argument has no correct behaviour to take away. A caller who passed a
`Date` or a string now gets a proof about that date rather than about 1995-06-15; a caller who
passed a credential now gets an error that says why.

### Workarounds

On an affected version at 8.2.0 or above, do not call `generateAgeProof`. Call
`ZKProver.generateAgeProof(birthDate, minimumAge, salt)` on the module directly — it has always
taken the birth date and committed to it correctly — and pass `proof.opening` to
`verifyAgeProof`. Below 8.2.0 there is no workaround, because the verifier accepts anything.

In either case, do not treat a `true` from `verifyAgeProof` as evidence about a credential's
subject. It is not, on any version.

### Action required

Upgrade to `@smartledger/bsv@9.36.0` or later. On the unscoped `smartledger-bsv` there is nothing
to upgrade to — migrate to `@smartledger/bsv@9.36.0` or later, reviewing migration requirements
first.

Then re-examine any **decision** taken on the strength of an age proof this library produced: the
proof attests nothing about the subject it was requested for, so a record of "age verified" backed
by one is unsupported, and on an affected version it is unsupported even where the subject does
meet the threshold. Proofs already issued cannot be withdrawn, and re-issuing on 9.36.0 does not
change what an old proof says.

Finally, check how your code calls `verifyAgeProof`. Our documentation showed
`bsv.verifyAgeProof(proof, 18, issuerDID)`; the third argument is the **opening**, an object. A
DID is a string, so that call returns `false` — fail-closed, but it never returns `true`, so an
age gate written that way refuses everyone.
