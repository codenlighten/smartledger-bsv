# Differential-fuzz differences, from an independent implementation

`penn-station-9.24.0-differences.jsonl` — **not ours**. Produced by the `block-penn-station`
session's differential fuzzer and vendored here with permission, because the directory it was
generated in is git-ignored on their side and this copy is the durable one.

```
sha256  fe5007e3179fccd9ebec813fe5eaa924e70dccf9ea4ff9a1aee53ee60b9e5fb0
bytes   1,494,064        lines  436
```

## What it is

Every input on which our `examples/gateway` adapter at **9.24.0** disagreed with their Python
verifier, which was written from the NotaryHash specification rather than from our code. The run
was 3,573 inputs: three real mainnet 1.0 certificates with every leaf replaced in turn by 27
wrong-typed or wrong-valued values. Headers and `blockHashAtHeight` came from pinned blocks indexed
by the blocks' own heights, never from the certificate.

436 lines: 408 where we said valid and they said invalid, 25 where we were stricter (`mode` on a
batch certificate), and 3 where we said invalid and they said indeterminate.

One JSON object per line: `base`, `path`, `value`, `certificate`, `header` (160 hex),
`blockHashAtHeight`, `expected` (their verdict), `expectedParts`, `reason` (their first reason),
`adapter_9_24_0` (what we answered then).

## Using it

**`expected` is THEIR verdict**, following NotaryHash's rules plus their envelope's stricter network
label. Where we differ by a stated choice, assert our choice and keep theirs as a comment — their
own caution, and a fair one. The known differences by design are the opt-in `anchor.network` label (27 inputs) and the 6
sealed certificates we refuse by default.

**The `mode` lines are stale, not disputed.** The fixture records their pre-2.4.1 verdict of
`valid` on 25 inputs; notaryhash 2.4.1 made `mode` a form rule and they adopted it the same day, so
all three verifiers now refuse them. Measured against this file: it says valid x25 where all three
of us say invalid.

That is the second time this fixture has been evidence about the past rather than the present — the
first was 9.26.0's replay reporting no undesigned differences while a bypass opened in 9.25.0 was
wide open. **A frozen oracle ages in both directions**: it can miss a path that opened after it was
captured, and it can disagree with a peer who has since moved. Its verdicts are a snapshot, and the
date in its name is load-bearing.

Two soundness defects in this library were found by this run and fixed in **9.25.0**: `anchor.seal`
was never verified, and a false `anchor.blockHeight` verified when `spv.blockHeight` was null. A
1,483-case conformance corpus and 5,276 tests caught neither.
