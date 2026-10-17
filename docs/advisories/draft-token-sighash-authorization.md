# DRAFT advisory — the Token covenant accepts an authorization that commits to no outputs

**Not created.** Nothing here has been filed. 9.40.0, the version that adds the mitigation this
names, reached the registry on 2026-10-17, so the prerequisite is met. Creating it as a *draft*
on GitHub is private to maintainers; publishing submits it to the GitHub Advisory Database —
which, measured on 2026-10-14 and still true, does **not** by itself make `npm audit` flag a
version in its range (see `README.md`).

    gh api --method POST repos/codenlighten/smartledger-bsv/security-advisories \
      --input docs/advisories/draft-token-sighash-authorization.json

Whether to file this at all is a judgement about a defect whose prerequisite the library's own
API cannot produce; the measurement that bounds it is under **Measurement** below, so the
decision can be made from the evidence rather than from the summary.

---

**Summary**
`SmartContract.Token`'s security argument is that authorization is a signature over the spend, so
`SIGHASH_ALL`'s `hashOutputs` commits to the recreated output. The covenant never checked the
mode, so an authorization signed `SIGHASH_NONE` is accepted and can be reused to redirect the
token.

**CWE** CWE-347 (Improper Verification of Cryptographic Signature), CWE-345 (Insufficient
Verification of Data Authenticity)

**Affected**

| ecosystem | package | vulnerable | patched |
|---|---|---|---|
| npm | `@smartledger/bsv` | `>= 5.5.0, < 9.40.0` | none — `9.40.0` adds an **opt-in** pin; the default changes in `10.0.0` |

Two packages that would normally appear here are **not affected**, checked rather than assumed by
reading their published tarballs:

- **`@smartledger/bsv-core`** ships no Token covenant at any version — `token.js` and
  `authorizers.js` are absent from 1.0.0, 1.5.0 and 1.8.1, and `SmartContract`, `Token` and
  `Authorizers` are absent from its built surface.
- **`smartledger-bsv`** (unscoped, last release 4.4.0) ships the *hash-lock* Token, whose owner
  id is `SHA256(ownerSecret)` and whose unlock reveals the secret. There is no authorization
  signature, so this class cannot apply. That design has its own, worse weakness — the revealed
  secret is front-runnable in the mempool — which is why it was replaced.

**Severity** `CVSS:3.1/AV:N/AC:H/PR:N/UI:R/S:U/C:N/I:H/A:N` — 5.3, medium.

`UI:R` and `AC:H` carry the whole shape of this one and are deliberate. The owner must produce an
authorization in a mode that commits to no outputs, and **this library's own API never does**:
`Authorizers.*.unlockArgs` and `Token.unlockTransfer` sign `SIGHASH_ALL | SIGHASH_FORKID` with no
override at every affected version. Producing the vulnerable shape requires a hand-built
unlocking script or an explicit sighash type passed to the signing helper. The attacker then
needs the signature **before** the transaction is broadcast, or must win a double-spend race
against it. `I:H` scores the outcome where the prerequisite is met: the token is redirected to an
attacker-chosen owner, which for a token representing an asset is theft of that asset. `C:N`
because no key material is exposed.

### Impact

The covenant authenticates its spending transaction with OP_PUSH_TX and asserts `0x41` on **that
preimage**. The authorization the authorizer verifies is a *separate* ECDSA signature, and
`OP_CHECKSIG` derives its sighash from the flag byte **the signer chose**. Nothing in the script
checked it.

An authorization signed `SIGHASH_NONE | SIGHASH_FORKID` therefore verifies, while committing to
no outputs at all. Because it commits to nothing about the destination, it is reusable: an
attacker holding it keeps the input, `nVersion`, `nSequence` and the victim's `nLockTime` — every
sighash mode commits to `nLockTime` — and grinds its **own destination keys**. Each candidate key
is a different 20-byte owner id, hence a different single output, hence a different preimage, so
the attacker sweeps until the OP_PUSH_TX s-value condition holds again and the spend verifies
with the victim's signature **byte-for-byte unchanged**.

What that establishes, stated as what was measured: **script verification under mainnet consensus
flags**, which is not relay, mempool policy or confirmation. The redirect and the victim's
transaction spend the same prevout, so they are competing double-spends and which confirms depends
on propagation and miner selection. Relayability was not tested against a node.

The case with **no race in it** is the one to design against: any workflow where an authorization
signature exists before the transaction is assembled or broadcast — an owner signing and handing
the signature to a service, a partially-signed hand-off, an escrow or marketplace facilitator, a
retried broadcast. There whoever holds the signature chooses the destination and the covenant
does not object.

### Measurement

Executed against artifacts installed from the registry, with the version asserted before anything
was measured.

* **The acceptance.** On published `9.39.1`, an authorization signed `SIGHASH_NONE | FORKID`
  verifies against an unpinned `Token.ownershipToken` lock under mainnet consensus flags.
* **The redirect.** Reusing that signature unchanged, a spend redirecting the token to an
  attacker-controlled owner verifies after grinding candidate destination keys: **4** and **67**
  keys on two runs here, and **35** in an independently written harness run by a second session
  against the registry artifact. All three are consistent with the ~2% acceptance rate of the
  OP_PUSH_TX s-value condition.
* **The isolating control**, contributed by that second session: the identical redirect built with
  an `ALL`-signed victim signature **fails**. So the missing flag check is the specific enabler
  and not some other weakness of the covenant.
* **The range, read rather than inferred.** `signInput` call sites were parsed out of the whole
  shipped `lib/` of 4.1.0, 5.4.1, 5.4.2, 5.5.0, 7.5.1, 9.0.0, 9.20.0, 9.36.0 and 9.39.1. **No
  call site anywhere hands the signing helper an explicit sighash type**, except two in
  `lib/ordinals/ordlock.js` — a documented `params.sighashType` pass-through on the cancel path,
  and one that is explicitly `SIGHASH_ALL_FORKID` — and the helper's default is
  `SIGHASH_ALL | SIGHASH_FORKID` at every version. The lower bound is **5.5.0**, the release that
  introduced signature-based `Authorizers`: 5.4.1 and 5.4.2 ship the hash-lock Token, and 4.1.0
  ships no Token at all.
* **A harness bug caught by a known answer.** The first version of that scan reported zero
  sixth-argument call sites at *every* version, including one where the answer was known to be
  two. Its regular expression excluded method-style calls (`H.signInput(...)`). The result above
  is from the corrected scan, whose control is that it finds the two known `ordlock` sites.

### Patches

**There is no version where the default is safe.** `9.40.0` adds
`Authorizers.singleKey({ pinSighash: true })` and `Authorizers.multisig(m, n, { pinSighash: true })`,
which require the authorization signature's flag byte to be `0x41` in script before the signature
check — every one of the *m* signatures for multisig, since checking only the topmost would leave
the rest free. With the pin, the `SIGHASH_NONE` transfer does not verify at all, so there is
nothing to reuse.

It is opt-in rather than the default because **the pin changes the locking script**, and a token's
successor output must carry the code the covenant rebuilds from the authenticated `scriptCode`.
Flipping the default would make an in-flight lineage unspendable: the holder would build a
successor with the new code while the covenant demands the old. `10.0.0` makes it the default, and
`docs/RELEASE-10.0.0.md` carries the commitment as `authorizer-unpinned-sighash`.

**An already-issued lineage cannot be migrated, and no library change can secure it.** Measured: a
spend of an unpinned token whose successor output carries the pinned code is **refused**, because
the covenant forces its own code forward. A lineage cannot change its own rules.

### Workarounds

On any affected version, and for any already-issued lineage on any version:

* **Sign the authorization `SIGHASH_ALL | SIGHASH_FORKID` (`0x41`), always.** Using
  `Token.unlockTransfer` or `Authorizers.*.unlockArgs` does this and offers no way not to; the
  exposure is in hand-built unlocking scripts and in passing an explicit sighash type to the
  signing helper.
* **Do not let an authorization signature exist before the transaction it authorizes is final.**
  The signature commits to the destination only in `SIGHASH_ALL`; a pre-broadcast hand-off in any
  other mode hands over the choice of destination.
* For **newly created** tokens, pass `{ pinSighash: true }` and the script enforces it for you.

### Action required

Create new tokens with `Authorizers.singleKey({ pinSighash: true })` on `9.40.0` or later.

For tokens already issued under an unpinned lock, the lock cannot be changed — audit instead:
if any authorization for such a token was ever signed in a mode other than `SIGHASH_ALL`, treat
that token as having been redirectable from the moment the signature existed, and check the
current owner on chain against the owner you expect. No key material is exposed by this defect, so
nothing needs to be rotated.
