# Proposed BRC-220 amendment: define the `encoding` field

`encoding` is listed among the certificate's required fields, but its values are never
enumerated. This proposes the definition, with the reasoning that led to it.

Prepared 2026-08-16 while implementing BRC-220 in `@smartledger/bsv`. The gap surfaced
because an implementation cannot emit a required field whose values are undefined.

---

## Proposed text

Insert into **§Certificate**, after the sentence listing the required fields.

> #### `encoding`
>
> `encoding` names the byte representation of `publicKey` and `signature` as they appear
> in the certificate and in the canonical proof bytes.
>
> Implementations **MUST** support `"raw"` and **SHOULD** emit it:
>
> - **`"raw"`** — the scheme's native fixed-length byte string.
>   - For `ECDSA-secp256k1`, a signature is exactly **64 bytes**: `r ‖ s`, each a 32-byte
>     big-endian unsigned integer, zero-padded on the left. A public key is the 33-byte
>     compressed SEC1 form.
>   - For `ML-DSA-*` and `SLH-DSA-*`, the signature and public key are the byte strings the
>     scheme itself defines (FIPS 204, FIPS 205). No further framing is applied.
> - **`"der"`** — ECDSA signatures in ASN.1 DER, as produced by Bitcoin tooling.
>   Accepted for compatibility with existing Bitcoin-native signers; **SHOULD NOT** be
>   emitted by new implementations, for the reason given below. Undefined for post-quantum
>   algorithms, which have no DER form.
>
> For `ECDSA-secp256k1`, `s` **MUST** be in the lower half of the curve order
> (`s ≤ n/2`). A signature with a high `s` **MUST** be rejected rather than normalised on
> receipt: normalising changes the signature bytes, and the signature bytes are inside
> `proofHash`.

---

## Why `"raw"` rather than DER

### 1. DER is not canonical, and `proofHash` covers the signature bytes

The canonical proof bytes include `lp(signature)`, so the signature's exact byte
representation determines `proofHash`. DER does not have one representation per signature.
Measured over 200 signatures from a single key with `@smartledger/bsv`:

```
DER lengths:  { "69": 1, "70": 108, "71": 91 }
raw lengths:  { "64": 200 }
```

The variance is ordinary leading-zero handling in the two INTEGERs, and it is entirely
legal DER. But it means the same signing act can yield different `proofHash` values
depending on which library encoded it — and a certificate re-encoded in transit no longer
matches its own integrity root.

That is the property §Motivation names first: *"any implementation in any language
reproduces identical bytes"*, and the reason the spec already rejects `JSON.stringify`.
A non-canonical signature encoding reintroduces exactly the problem the binary encoding was
chosen to avoid.

### 2. Every other algorithm in the spec is already raw

ML-DSA-65 signatures are 3,309 bytes; SLH-DSA-SHA2-128s are 7,856. Both are fixed-length
byte strings with no DER form. With ECDSA on DER and the post-quantum schemes on raw,
every verifier needs per-algorithm branching on `encoding`. With ECDSA on raw, all sixteen
algorithm identifiers share one representation and the branch disappears.

### 3. It matches what the signature actually is

§Algorithms specifies that the signer signs the 32-byte `payloadHash` **directly**. This is
a detached signature over a digest, not a Bitcoin script signature — the case ES256K
(RFC 7515) and WebCrypto both address, and both use `r ‖ s`, not DER.

### 4. Low-S is a separate malleability, and raw does not fix it

For any ECDSA signature, `s` and `n − s` both verify. They are different bytes, so they
produce different `proofHash` values. Without a normative rule, two valid certificates
exist for one signing act — an ambiguity a notarization protocol should not carry.

Requiring low-S at signing, and **rejecting** rather than normalising on receipt, keeps
`proofHash` a function of the certificate as issued.

---

## Note on `toCompact`

Some Bitcoin libraries expose a 65-byte "compact" signature. That is not this format: it
carries a leading recovery byte for public-key recovery. `"raw"` is the bare 64 bytes,
with no recovery byte, because the public key is already a certificate field.

---

## Impact on existing certificates

None, if no certificate has yet been issued with `encoding: "der"`. If any have, they
remain valid — `"der"` stays an accepted value, and the SPV envelope and `proofHash`
semantics are untouched. This amendment defines a field that was previously unspecified;
it does not change any field that was.
