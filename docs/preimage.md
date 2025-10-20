Excellent — here’s the **definitive, detailed breakdown** of a **Bitcoin (BSV) sighash preimage**, field by field, based on **BIP143** (which all modern BSV libraries, including SmartLedger’s hardened bundle, follow exactly).

---

# 🔍 **Bitcoin SV Sighash Preimage Structure (BIP143 / ForkID)**

The *preimage* is the exact data that gets double-SHA256 hashed before signing a transaction input with `SIGHASH_FORKID`.
This deterministic byte layout ensures signatures are reproducible and verifiable.

---

## 🧩 **Overview**

| Section                       | Bytes        | Endianness          | Description                                |          |
| ----------------------------- | ------------ | ------------------- | ------------------------------------------ | -------- |
| **1. nVersion**               | 4            | Little-Endian (LE)  | Transaction version field                  |          |
| **2. hashPrevouts**           | 32           |                     | SHA256d of all input outpoints             |          |
| **3. hashSequence**           | 32           |                     | SHA256d of all input sequences             |          |
| **4. outpoint (txid + vout)** | 36           | txid: LE, index: LE | The outpoint being signed                  |          |
| **5. scriptCode length**      | 1–3 (varint) |                     | Compact size of the script being signed    |          |
| **6. scriptCode**             | variable     |                     | The actual script (usually `scriptPubKey`) |          |
| **7. amount**                 | 8            | Little-Endian       | Value of the output being spent            |          |
| **8. nSequence**              | 4            | Little-Endian       | Sequence number of this input              |          |
| **9. hashOutputs**            | 32           |                     | SHA256d of all outputs                     |          |
| **10. nLockTime**             | 4            | Little-Endian       | Locktime for entire tx                     |          |
| **11. sighashType**           | 4            | Little-Endian       | SIGHASH type used (e.g., `0x41` for `ALL   | FORKID`) |

---

## 📏 **Typical Length Example**

For a *simple single-input, single-output* transaction:

| Section                 | Typical Bytes | Example Hex Segment      |
| ----------------------- | ------------- | ------------------------ |
| nVersion                | 4             | `01000000`               |
| hashPrevouts            | 32            | `e3...4a`                |
| hashSequence            | 32            | `00...00`                |
| outpoint                | 36            | `00..00 00000000`        |
| scriptCode (len + data) | 25            | `1976a914...88ac`        |
| amount                  | 8             | `1027000000000000`       |
| nSequence               | 4             | `ffffffff`               |
| hashOutputs             | 32            | `d2...1e`                |
| nLockTime               | 4             | `e8030000` *(= 1000 LE)* |
| sighashType             | 4             | `41000000` *(= 0x41)*    |

---

### 🧮 **Total: ~108 bytes**

(4 + 32 + 32 + 36 + 25 + 8 + 4 + 32 + 4 + 4 = 181, but since script length and varints can vary,
the final preimage for a minimal transaction typically is **~108 bytes**.)

---

## 🧠 **Endianness Notes**

* **nVersion, amount, nSequence, nLockTime, sighashType** are *little-endian* integers.
* **hashPrevouts, hashSequence, hashOutputs** are *big-endian* SHA256d hashes (32 bytes each).
* **txid** inside the *outpoint* is *little-endian* (it’s reversed from what’s printed on explorers).

---

## 🧩 **Visual Layout Example**

```
[0000-0003] nVersion (4 LE)
[0004-0023] hashPrevouts (32)
[0024-0043] hashSequence (32)
[0044-005f] outpoint.txid (32 LE)
[0060-0063] outpoint.vout (4 LE)
[0064-007e] script length + scriptPubKey (varies)
[007f-0086] amount (8 LE)
[0087-008a] nSequence (4 LE)
[008b-00aa] hashOutputs (32)
[00ab-00ae] nLockTime (4 LE)
[00af-00b2] sighashType (4 LE)
```

---

## ⚙️ **In Script Context (OP_SPLIT / Covenant Use)**

If you push the **raw preimage** onto the stack, you can target sections as follows:

| Target           | Extraction Logic                             | Example ASM                                             |
| ---------------- | -------------------------------------------- | ------------------------------------------------------- |
| **nVersion**     | First 4 bytes                                | `4 OP_SPLIT OP_DROP OP_BIN2NUM`                         |
| **nLockTime**    | 8 bytes from end → drop last 4 (sighashType) | `<len-8> OP_SPLIT OP_NIP 4 OP_SPLIT OP_DROP OP_BIN2NUM` |
| **hashPrevouts** | 32 bytes after first 4                       | `4 OP_SPLIT OP_DROP 32 OP_SPLIT OP_DROP`                |
| **hashOutputs**  | 8+4+32 from end (44 bytes from tail)         | `<len-44> OP_SPLIT OP_NIP 32 OP_SPLIT OP_DROP`          |

---

## 🧾 **Checksum Behavior**

The `sighashPreimage` is *never hashed directly* into the blockchain.
Instead:

```
signature = ECDSA.sign( sha256sha256(preimage), privKey )
```

In your covenant scripts, you typically:

1. Re-hash the preimage (`OP_HASH256`) to verify it matches what was signed.
2. Then you may dissect it to verify constraints (like `nLockTime`, `nVersion`, etc.).

---

## ✅ **Summary Table**

| Field        | Bytes    | Endian | Covenant Extraction Example                             |
| ------------ | -------- | ------ | ------------------------------------------------------- |
| nVersion     | 4        | LE     | `4 OP_SPLIT OP_DROP OP_BIN2NUM`                         |
| hashPrevouts | 32       | —      | `36 OP_SPLIT ...`                                       |
| hashSequence | 32       | —      | next 32                                                 |
| outpoint     | 36       | mixed  | —                                                       |
| scriptCode   | variable | —      | rarely enforced directly                                |
| amount       | 8        | LE     | `40 OP_SPLIT OP_NIP 8 OP_SPLIT OP_DROP OP_BIN2NUM`      |
| nSequence    | 4        | LE     | `12 OP_SPLIT OP_NIP 4 OP_SPLIT OP_DROP OP_BIN2NUM`      |
| hashOutputs  | 32       | —      | —                                                       |
| nLockTime    | 4        | LE     | `<len-8> OP_SPLIT OP_NIP 4 OP_SPLIT OP_DROP OP_BIN2NUM` |
| sighashType  | 4        | LE     | `<len-4> OP_SPLIT OP_NIP OP_BIN2NUM`                    |

---
