# DRAFT advisory — LTP selective disclosure verifies a value the issuer never committed to

**Not created.** This is the text for a new repository security advisory. Creating it as a
*draft* on GitHub is private to maintainers; publishing it is what puts it in the GitHub
Advisory Database and therefore into `npm audit`.

    gh api --method POST repos/codenlighten/smartledger-bsv/security-advisories \
      --input docs/advisories/draft-ltp-disclosure-commitment.json

---

**Summary**
`LTP.Proof` selective disclosure accepts a disclosed value the issuer never committed to

**Severity** high
**CWE** CWE-345 (Insufficient Verification of Data Authenticity)

**Affected**

| ecosystem | package | vulnerable | patched |
|---|---|---|---|
| npm | `@smartledger/bsv` | `>= 3.3.2, < 9.32.0` | `9.32.0` |
| npm | `smartledger-bsv` | `>= 3.3.1, <= 4.4.0` | none — migrate to `@smartledger/bsv@9.35.0` |

Each bound is the first or last published version measured to behave that way, not the edge of
a sweep; the Measurement section below gives the readings.

**Severity** `AV:N/AC:L/PR:N/UI:N/S:U/C:N/I:H/A:N` — 7.5, high. `AC:L` is for the first
direction in the table below, where a consumer verifies a disclosure object it assembled
itself and an attacker who influences that assembly substitutes the value. The second
direction travels over plain JSON but additionally requires an issuer that committed a
non-finite value.

---

### Impact

`lib/ltp/proof.js` committed to a disclosed field as

```
path + ':' + JSON.stringify(value) + ':' + salt
```

and `JSON.stringify` renders `null`, `NaN`, `Infinity` and `-Infinity` **all** as `"null"`. Four
distinct values therefore share one commitment, so a verifier cannot tell which one the issuer
actually committed to. It returns `valid: true` for a value that was never committed.

The same encoding defect was found and fixed in `lib/gdaf/zk-prover.js` in 9.22.0. This module
kept its own copy of the code and so kept the defect, which is why the permitted domain now
lives in one shared module that both require.

### Which direction is exploitable depends on the transport

| direction | reachable over plain JSON? |
|---|---|
| the issuer commits `null`, an attacker presents `NaN` | **no** — `JSON.stringify` does not emit `NaN`, so this needs in-process access, which is the case when a consumer calls `verify` with an object it built itself |
| the issuer commits a non-finite number, a holder presents `null` | **yes** — `null` survives JSON intact and the proof needs no tampering at all |

The second direction requires an issuer whose claim holds a JavaScript `NaN` or `Infinity`.
That cannot arrive from `JSON.parse`, but it arrives easily from arithmetic: `Number(undefined)`
is `NaN`, as is any computation over a missing field. 9.32.0 closes both — it refuses to *mint*
an ambiguous commitment and validates the domain at verification.

### Measurement

The forgery was executed through the public API against versions installed from the registry
(`scripts/published-version-probes/ltp-forgery.js`): build an honest disclosure of `null`,
substitute `NaN` and then `Infinity` for the disclosed value, and re-verify.

* **All 63** live versions from 7.5.5 to 9.31.0 accept the forged value, with the honest proof
  also verifying in all 63.
* Below that sweep, 3.3.2, 3.4.0, 4.4.0, 5.4.0, 6.0.0, 7.0.0, 7.4.0 and 7.5.0 accept it too.
  The range therefore opens at the **first published version that has the module at all**: every
  scoped version from 1.5.6-fix1 to 3.2.2 has no `lib/ltp/proof`, and 3.3.2 is the first that
  does. A range drawn around the versions that happened to be in the first sweep would have told
  users of 7.0.0 they were unaffected.
* On the unscoped name the module first appears in 3.3.1 and is present in all 14 versions from
  there to 4.4.0; 3.0.0 – 3.2.2 do not have it. 3.3.1, 3.4.5, 4.1.0 and 4.4.0 were run and all
  accept the forged value.
* 9.32.0, 9.33.2 and 9.34.0 refuse it, and report it as a verdict rather than throwing.
* Module presence was established twice over, independently: by asking the CDN that serves the
  npm tarballs for `lib/ltp/proof.js` in each of the 149 published versions, and by installing
  the versions at the boundary and loading it. The two agree.

### Patches

Fixed in **9.32.0**. The permitted value domain lives in `lib/util/field-commit.js` and both
`lib/ltp/proof.js` and `lib/gdaf/zk-prover.js` require it. Validating the domain closes the
forgery while leaving every commitment **byte-identical**, because RFC 8785 agrees with
`JSON.stringify` on every value that can legitimately reach a leaf — so no published commitment
moves.

A second defect was fixed in the same release: `_generateMerkleProof` emitted nothing for a last
odd node that `_buildMerkleTree` had paired with itself, so an **honest** proof failed at any
non-power-of-two field count. That is an availability defect rather than a soundness one and is
not part of this advisory.

A third, unrelated defect in the same module was fixed in **9.34.0** and has its own advisory.
The release to move to is **9.35.0** or later, which carries all of them.

### Upgrading the verifier does not repair a commitment already minted

The fix works in two places: 9.32.0 refuses to **mint** an ambiguous commitment, and it
validates the disclosed value at **verification**. Only the second helps a proof that already
exists, and it is not enough — because a commitment minted over `NaN` is byte-identical to one
minted over `null`, and `null` is inside the permitted domain, so no domain check can reject
it.

Measured across versions rather than argued
(`scripts/published-version-probes/ltp-stale-commitment.js`), with 9.31.0 as the issuer and
9.33.2 as the verifier:

| presented to the patched verifier | result |
|---|---|
| the `NaN` the issuer believes it committed | **invalid** — the domain check, working |
| `null`, which that issuer never committed | **valid** — the forgery survives the upgrade |
| an honestly committed `null` from the same issuer | valid — interoperation holds |

A control in the same run confirms the patched version refuses to mint over `NaN` at all
(`claim.x must be a finite number`), so new commitments cannot be ambiguous.

### Workarounds

On an affected version, reject any disclosure whose value is not a string, a finite number, a
boolean or `null` before calling the verifier, and do not issue credentials whose claim values
can be `NaN` or `Infinity`.

### Action required

Upgrade to `9.35.0` or later. On the unscoped `smartledger-bsv` there is nothing to upgrade
to — migrate to `@smartledger/bsv@9.35.0` or later, reviewing migration requirements first.

A proof issued by an affected version **whose committed values were all inside the permitted
domain** — a string, a finite number, a boolean or `null` — does not need reissuing. Its
commitments are byte-identical and interoperate in both directions, and what changes is only
that the verifier no longer accepts a value outside the domain.

A proof issued by an affected version over a **non-finite** value is a different matter, and
upgrading does not fix it (see above). Identify any credential issued on an affected version
whose claim values could have held `NaN` or `Infinity` — arithmetic over a missing field is the
usual source, `Number(undefined)` being `NaN` — and reissue it from a patched version, or stop
relying on it. A verifier-side upgrade cannot establish what such a commitment meant.
