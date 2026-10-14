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
| npm | `@smartledger/bsv` | `< 9.32.0` | `9.32.0` |
| npm | `smartledger-bsv` | `>= 3.3.1, <= 4.4.0` | none — migrate to `@smartledger/bsv@9.33.2` |

---

### Impact

`lib/ltp/proof.js` committed to a disclosed field as

```
path + ':' + JSON.stringify(value) + ':' + salt
```

and `JSON.stringify` renders `null`, `NaN` and `Infinity` **all** as `"null"`. Three distinct
values therefore share one commitment, so a verifier cannot tell which one the issuer actually
committed to. It returns `valid: true` for a value that was never committed.

The same encoding defect was found and fixed in `lib/gdaf/zk-prover.js` in 9.22.0. This module
kept its own copy of the code and so kept the defect, which is why the permitted domain now
lives in one shared module that both require.

### Which direction is exploitable depends on the transport

| direction | reachable over plain JSON? |
|---|---|
| the issuer commits `null`, an attacker presents `NaN` | **no** — `JSON.stringify` does not emit `NaN`, so this needs in-process access, which is the case when a consumer calls `verify` with an object it built itself |
| the issuer commits `NaN` or `Infinity`, a holder presents `null` | **yes** — `null` survives JSON intact and the proof needs no tampering at all |

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
* 4.4.0, 5.4.0, 6.0.0, 7.0.0, 7.4.0 and 7.5.0 accept it as well, which is why the range opens at
  `< 9.32.0` rather than at 7.5.5 — a range drawn around the versions that happened to be in the
  first sweep would have told users of those versions they were unaffected.
* On the unscoped name, 3.3.1 and 4.4.0 accept it; 3.0.0 – 3.2.2 have no `lib/ltp/proof` module.
* 9.32.0 and 9.33.2 refuse it, and report it as a verdict rather than throwing.

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

### Workarounds

On an affected version, reject any disclosure whose value is not a string, a finite number, a
boolean or `null` before calling the verifier, and do not issue credentials whose claim values
can be `NaN` or `Infinity`.

### Action required

Upgrade to `>= 9.33.2`. On the unscoped `smartledger-bsv` there is nothing to upgrade to —
migrate to `@smartledger/bsv@9.33.2` or later, reviewing migration requirements before
switching.

Proofs issued by an affected version do not need reissuing: the commitments are byte-identical
and interoperate in both directions. What changes is that the verifier no longer accepts a value
outside the permitted domain.
