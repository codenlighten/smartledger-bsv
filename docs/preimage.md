# The BIP-143 sighash preimage

The preimage is the byte string that is double-SHA256'd and then signed. Its layout is
what makes covenants possible on BSV: a script that can prove it was handed *this*
transaction's preimage can read the transaction's own fields out of it, which is why
BSV needs no `OP_TXLOCKTIME` or `OP_INPUTVALUE` opcode.

Every offset and every script fragment on this page is asserted in
`test/covenant/preimage_doc.js` against a preimage this library actually produces. If
you change the layout, that test fails before this page goes stale.

> **Two digest algorithms, not one.** BIP-143 with `SIGHASH_FORKID` is what this page
> describes and what almost everything uses. Chronicle restored the **Original
> Transaction Digest Algorithm**, selected by `SIGHASH_CHRONICLE` (`0x20`), which has a
> different layout entirely — see `Signature.SIGHASH_CHRONICLE` and
> `lib/transaction/sighash.js`. Do not assume a signature is BIP-143 without checking
> its sighash byte.

---

## Field layout

| # | Field | Bytes | Encoding |
| --: | --- | --: | --- |
| 1 | `nVersion` | 4 | little-endian int32 |
| 2 | `hashPrevouts` | 32 | HASH256 digest, as the hash function returns it |
| 3 | `hashSequence` | 32 | HASH256 digest, as the hash function returns it |
| 4 | `outpoint` | 36 | 32-byte txid in **serialized order** + 4-byte LE index |
| 5 | `scriptCode` | varint + N | length prefix then the script |
| 6 | `amount` | 8 | little-endian **uint64** — satoshis in the output being spent |
| 7 | `nSequence` | 4 | little-endian **uint32** |
| 8 | `hashOutputs` | 32 | HASH256 digest, as the hash function returns it |
| 9 | `nLockTime` | 4 | little-endian **uint32** |
| 10 | `sighashType` | 4 | little-endian uint32 (`0x41` for `ALL｜FORKID`) |

**The three 32-byte hashes have no endianness worth naming.** They are the bytes
`HASH256()` returns, inserted as-is. Calling them "big-endian" invites someone to
reverse them; the only field in the preimage that is genuinely reversed relative to how
you normally read it is the **txid inside the outpoint**, which appears here in
serialized order — the reverse of the string an explorer shows.

### Length

```
4 + 32 + 32 + 36 + 8 + 4 + 32 + 4 + 4  =  156 fixed bytes
                    + varint(len(scriptCode)) + len(scriptCode)
```

A 25-byte P2PKH `scriptCode` needs a 1-byte length prefix, so the whole preimage is
**182 bytes** — not ~108, and not 181. There is no "typical" length beyond that,
because `scriptCode` is whatever locking script is being spent.

### Offsets, for a 25-byte scriptCode

| Field | From start | From end |
| --- | --: | --: |
| `nVersion` | 0 | — |
| `hashPrevouts` | 4 | — |
| `hashSequence` | 36 | — |
| `outpoint` | 68 | — |
| `scriptCode` (len + data) | 104 | — |
| `amount` | 130 | **52** |
| `nSequence` | 138 | **44** |
| `hashOutputs` | 142 | **40** |
| `nLockTime` | 174 | **8** |
| `sighashType` | 178 | **4** |

**Use the from-end column in scripts.** Everything before `amount` sits behind a
variable-length `scriptCode`, so its absolute offset changes with the contract. The
five tail fields are at fixed distances from the end whatever the script contains,
which is why every extraction this library ships is written with `OP_RIGHT`.

---

## When the hashes are zero

`hashPrevouts`, `hashSequence` and `hashOutputs` are not always populated. Measured:

| Sighash type | `hashPrevouts` | `hashSequence` | `hashOutputs` |
| --- | --- | --- | --- |
| `ALL｜FORKID` (`0x41`) | set | set | set |
| `NONE｜FORKID` (`0x42`) | set | **zero** | **zero** |
| `SINGLE｜FORKID` (`0x43`) | set | **zero** | set (the one matching output) |
| `ALL｜ANYONECANPAY｜FORKID` (`0xc1`) | **zero** | **zero** | set |
| `SINGLE｜ANYONECANPAY｜FORKID` (`0xc3`) | **zero** | **zero** | set |

A covenant that reads `hashOutputs` is only meaningful if it *also* pins the sighash
type — otherwise a spender signs with `NONE` and the field it is checking is 32 zero
bytes. `PushTx.assertSighashType()` exists for that.

---

## Reading fields in Script

`OP_RIGHT n` keeps the last `n` bytes; `OP_LEFT n` keeps the first `n`. Together they
take a window at a fixed distance from the end. These are the fragments this library
ships:

| Field | Script |
| --- | --- |
| `sighashType` | `OP_DUP 4 OP_RIGHT` |
| `nLockTime` | `OP_DUP 8 OP_RIGHT 4 OP_LEFT` |
| `hashOutputs` | `OP_DUP 40 OP_RIGHT 32 OP_LEFT` |
| `nSequence` | `OP_DUP 44 OP_RIGHT 4 OP_LEFT` |
| `amount` | `OP_DUP 52 OP_RIGHT 8 OP_LEFT` |
| `nVersion` | `OP_DUP 4 OP_LEFT` |

`OP_DUP` first, because these consume the preimage and you usually want it back.

### `OP_BIN2NUM` will silently corrupt three of these

`amount`, `nSequence` and `nLockTime` are **unsigned**. `OP_BIN2NUM` produces a
**signed** script number. Feeding a raw field straight into it is wrong, and wrong in
the direction that fails quietly:

```
nLockTime   e8030000  ->           1000     correct
            ffffff7f  ->     2147483647     correct — last value before the sign bit
            00000080  ->              0     WRONG, should be 2147483648 (19 Jan 2038)
            01000080  ->             -1     WRONG, should be 2147483649
            ffffffff  ->    -2147483647     WRONG, should be 4294967295 (year 2106)
```

A `nLockTime >= deadline` check written this way stops working on **19 January 2038**,
and a `<=` check starts passing when it should not. The same applies to `amount` above
2³¹ satoshis (21.47 BSV) and to `nSequence` above `0x7fffffff` — which includes
`0xffffffff`, the most common value there is.

**Sign-pad with a zero byte first:**

```
OP_DUP 8 OP_RIGHT 4 OP_LEFT   <00> OP_CAT   OP_BIN2NUM
```

```
nLockTime   00000080  ->     2147483648     correct
            ffffffff  ->     4294967295     correct
            e8030000  ->           1000     correct — OP_BIN2NUM re-minimises the pad
```

That five-byte push is only legal because `OP_BIN2NUM` honours the era's script-number
width — 4 bytes before Genesis, 750,000 after, 32,000,000 after Chronicle. Verify with
`Interpreter.mainnetFlags()` or no flags at all; a hand-assembled flag word with no era
bit applies the 4-byte pre-Genesis cap and rejects the padded value.

---

## Hashing the preimage does not authenticate it

```
<preimage> OP_HASH256
```

gives you `HASH256(preimage)` and **nothing else**. It does not establish that the
bytes on the stack are this transaction's preimage. A spender can hand you any
well-formed 182 bytes, satisfy every field check you wrote, and spend the output on a
transaction that does something entirely different.

The binding has to come from a signature check. `OP_PUSH_TX` — `lib/covenant/pushtx.js`
— gets it by constructing a signature *from the preimage hash itself* and verifying it
with `OP_CHECKSIG` against the generator point:

```
OP_HASH256                     z = HASH256(preimage)
<reverse to LE>                e
<Gx> OP_ADD <n> OP_MOD         s = (e + Gx) mod n
<assemble DER: r = Gx, s>      a signature that is valid for P = G
                               only if e is this input's sighash
<02||Gx> OP_CHECKSIG           the node checks it against the REAL sighash
```

`OP_CHECKSIG` computes the sighash itself, from the transaction being validated. The
signature only verifies if the `e` derived from the supplied preimage equals it. That
is the whole trick, and it is the step that makes every field check downstream mean
something.

Use `PushTx.pushTxCore()` or `SmartContract.policy()` rather than assembling this by
hand.

---

## `scriptCode` is not "the scriptPubKey"

It is the script the signature commits to. For a plain P2PKH spend that happens to be
the 25-byte locking script, but nothing in the format requires it: it is
length-prefixed and variable, `OP_CODESEPARATOR` changes where it starts, and for the
covenants this library builds it is hundreds of bytes.

Any parser that assumes 25 bytes, or that reads fields at absolute offsets past the
`scriptCode`, breaks on the first real contract. Read from the end.
