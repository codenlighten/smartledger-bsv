# DRAFT advisory — `PrivateKey.fromObject` returns a derivable key from a JSON round-trip

**Not created.** This is the text for a new repository security advisory. Creating it as a
*draft* on GitHub is private to maintainers; publishing it is what puts it in the GitHub
Advisory Database and therefore into `npm audit`.

    gh api --method POST repos/codenlighten/smartledger-bsv/security-advisories \
      --input docs/advisories/draft-fromobject-key-substitution.json

---

**Summary**
`PrivateKey.fromObject` silently returns a different, publicly derivable private key when given
a redacted JSON round-trip

**Severity** critical
**CWE** CWE-20 (Improper Input Validation), CWE-340 (Generation of Predictable Numbers or Identifiers)

**Affected**

| ecosystem | package | vulnerable | patched |
|---|---|---|---|
| npm | `@smartledger/bsv` | `>= 7.5.1, < 7.5.5` | `7.5.5` |

The unscoped `smartledger-bsv` package is **not** affected: it predates the redaction marker
this defect misreads, so its round trip returns the correct key. It is affected by other
defects — see GHSA-gw63-x79h-mhjc.

---

### Impact

7.5.1 added a redaction to `PrivateKey.prototype.toJSON`, so `JSON.stringify(key)` emits
`bn: '[REDACTED]'` instead of the secret scalar. The matching guard on the way back in was
missing until 7.5.5.

`bn.js@4` **skips** characters it cannot parse rather than failing, so parsing the marker
`'[REDACTED]'` does not raise — it yields whatever the surviving characters encode. The most
natural persist-and-restore round trip

```js
PrivateKey.fromObject(JSON.parse(JSON.stringify(key)))
```

therefore returns a **valid-looking private key of about 40 bits**, with no error, a different
WIF and a different address. Any funds sent to that address are spendable by anyone, because the
substituted value does not depend on the original key: it is `768491671261` for every caller, so
every affected round trip in the world lands on the **same** address.

There is no attacker in this. A developer who persists a key as JSON and restores it funds an
address that a stranger can sweep.

### Measurement

Each version was installed from the registry and run
(`scripts/published-version-probes/json-roundtrip.js`):

| version | result |
|---|---|
| 7.5.0 | round-trips **correctly** — the redaction marker did not exist yet |
| 7.5.1, 7.5.2, 7.5.3, 7.5.4 | silent wrong key, `bn = 768491671261`, 40 bits, same address every time |
| 7.5.5 | throws, naming the marker and pointing at `toObject()` / `toWIF()` |

So the window is exactly those four versions, bounded by measurement at both ends.

As of 2026-10-13 the four derivable addresses — livenet and testnet, compressed and
uncompressed — have **zero transactions and zero balance** on BSV mainnet and testnet
(WhatsOnChain) and on BTC (Blockstream). That is an observation about two providers at one
moment, not a guarantee that any particular deployment is safe.

### Patches

Fixed in **7.5.5**. `_transformObject` now validates before parsing: `bn` must be a non-empty
hexadecimal string, must not be the redaction marker, and must fall inside the valid key range.
`toObject()` round-trips exactly, as before.

7.5.5 does not address later security fixes. **Upgrade to `>= 9.33.2`.**

### Workarounds

Use `key.toObject()` or `key.toWIF()` for persistence, never `JSON.stringify(key)`, on an
affected version. `toObject()` was always the deliberate export and round-trips exactly.

### Action required

Upgrade to `>= 9.33.2`. Then, if any key in your system was ever restored through
`fromObject(JSON.parse(JSON.stringify(key)))` on 7.5.1 – 7.5.4, the address you derived from it
was **not** derived from your key. Check whether you funded
`1JGwrQuvMBkEt3SgYko5M2Vuncfi7JRyze` (livenet, compressed) or its testnet and uncompressed
equivalents; treat anything sent there as spendable by anyone, and re-derive from the original
key material.
