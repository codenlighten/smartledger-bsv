# Cross-version compatibility harness

**Not ours.** Written by the `vg-wallet` session, which owns
github.com/codenlighten/vg-wallet (wallet.verifiedgrades.com), and vendored here with permission
because it was generated in temporary session scratch and this copy is the durable one. They are
committing the same harness into their repo when the bump work is approved.

```
gen.cjs                  node gen.cjs <versionDir>            -> writes <versionDir>/artifacts.json
check.cjs                node check.cjs <verifierDir> <artifacts.json>
artifacts-7.5.5.json     generated under @smartledger/bsv 7.5.5
artifacts-8.1.0.json     generated under 8.1.0
artifacts-9.26.2.json    generated under 9.26.2
```

Each `check.cjs` run makes **14 assertions** over the surface a real wallet uses: Shamir 2-of-3
(all three subsets recombine, a single share does not, `combine` returns a Buffer), HD derivation
on `m/44'/236'/0'/0/0` and `m/44'/236'/2'/0/0`, `createDID`, `Message.sign`/`verify` (right signer
accepted, wrong signer and altered challenge rejected, verify is a synchronous boolean), and
`createEmailCredential`/`verifyCredential` (cross-version verification, tampered subject rejected,
removed proof rejected, and that `verifyCredential` returns a **Promise**).

## Running it against this working tree

`check.cjs` resolves `@smartledger/bsv` from the directory it is given, so point it at a folder
whose `node_modules/@smartledger/bsv` is this repo:

```sh
W=$(mktemp -d); mkdir -p $W/node_modules/@smartledger
ln -s "$PWD" $W/node_modules/@smartledger/bsv
for v in 7.5.5 8.1.0 9.26.2; do
  node test/data/cross-version/check.cjs $W test/data/cross-version/artifacts-$v.json
done
```

All three files pass 14/14 against the current tree — **42 of 42**.

## Why it is kept

Every other test here is written by the people who wrote the library, against artifacts the same
code just produced. This one checks that **artifacts made by an older published version still work**,
which nothing else did. The `vg-wallet` session independently reproduced the four compatibility
answers given from this repo and agreed on 56 of 56 checks across four directions, which is what
makes the agreement worth anything.

## Honest limits, theirs

The artifacts were generated from **fresh random mnemonics**, not from shares customers actually
hold. The test mnemonics are throwaway and were never funded, which is why they are safe to commit.
A share a customer printed in 2026 is still only covered by inference from these.
