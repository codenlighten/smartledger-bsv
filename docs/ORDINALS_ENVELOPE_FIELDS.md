# Envelope fields in `buildInscription` — handoff

**Commit:** `0242542` `feat(ordinals): write envelope fields, and refuse the ones that unbind`
**Touched:** `lib/ordinals/inscription.js`, `test/ordinals/inscription.js` — nothing else.
**Suite:** 4768 passing, 0 failing.
**Date:** 29 August 2026

This landed in your repo from the OrdinalSource side. It is finished and tested,
but it is **not releasable as-is** — see *What I did not touch*, which is the
part that needs you.

---

## What it does

`buildInscription` wrote the content type and the body and stopped. Tag 5 —
`metadata`, the spec's own home for an object's own record — could not be
written at all, and neither could any other field.

That mattered beyond convenience. The only way to produce one was to assemble
envelope bytes by hand, which is the most dangerous thing an integrator can do
on this stack: the bytes are permanent, already paid for, and nothing local
reports a mistake, because a builder agreeing with its own parser proves only
that they agree.

```js
bsv.Ordinals.buildInscription({
  address: owner,
  contentType: 'image/jpeg',
  content: image,
  fields: { 5: manifest, 21: thumbnail }
})
```

Fields are emitted between the content type and the body, in **ascending tag
order** so the same input always produces the same bytes. Order carries no
meaning to a parser before the body opens; reproducibility does.

## What it refuses, and why each one is silent otherwise

| Refused | Why it cannot be a warning |
| --- | --- |
| **Tag 0** | Opens the body. Everything after it *is* the body, so a field there does not fail — it silently becomes part of the file, and the inscription still looks fine. |
| **Tag 1** | Is the content type. A second one declares it twice. |
| **Unrecognized even tag** | The spec requires such an inscription to be "displayed as unbound, that is, without a location". It is indexed nowhere, permanently, and nothing local reports it. |
| Negative / non-integer tag | Not expressible as a script number. |
| Empty field value | Inscribes a zero-length field permanently for no reason. |

Build time is the last moment any of these is catchable before the money is
spent, which is why they throw rather than warn.

## The design decision most worth your review

`allowUnknownEvenFields` exists, and I went back and forth on it.

My first instinct was a hard wall — never emit an unrecognized even tag, no
exceptions. I changed my mind. The set of named tags grows as the protocol does,
so a library that can *never* be overridden eventually becomes both wrong and
unbypassable, and the workaround it forces — hand-assembled envelope bytes — is
considerably more dangerous than the thing the check prevents.

So it throws by default and can be overridden by a flag long enough that nobody
passes it by accident. If you disagree, this is the knob to turn; the reasoning
is in the JSDoc on `assertTagIsSafe` so it can be argued with rather than
guessed at.

## Byte-level details, since they are easy to get wrong

- Tags **1–16** are emitted as their opcodes; anything larger as a **minimal
  data push**. `OP_16` is the largest numeric opcode, so tag 21 has no opcode
  form at all.
- An indexer reads the resulting **stack element**, so `OP_5` and a one-byte
  push of `0x05` are the same tag. The distinction still matters, because a data
  push of a small number is non-minimal and non-minimal pushes are non-standard.
- Script numbers carry sign in the high bit of the last byte, so a tag ending
  `>= 0x80` is zero-padded or it reads back **negative**.

## What was verified

Round-tripped through `@smartledger/ordinals` — a **separate** implementation,
not this library's own parser:

```
fields written : { 5: manifest, 21: thumbnail }
keys read back : ["01", "05", "15", ""]     content-type, 5, 21, body
values         : intact
warnings       : []          errors: []          valid: true
```

All five refusals fire with their own messages, and the override builds while
the independent parser correctly warns about the result.

---

## What I did not touch — this is the part that needs you

**`CHANGELOG.md`, `version.js` and `package.json` all have uncommitted changes
in the working tree** — the TypeScript-declarations work, `types-test/`,
`scripts/check-types.js` and the `9.3.0` bump. Staging any of those to write a
changelog entry would have swept up half-finished work that is not mine.

So the feature is committed with **no changelog entry and no version**, which is
deliberate and needs closing out. Two options:

1. **Fold into 9.3.0.** It is already a minor bump and is not published yet
   (npm `latest` is 9.2.0). Cleanest, if the declarations work ships with it.
2. **Hold for 9.4.0**, if you would rather 9.3.0 stay exactly what you scoped.

Ready to paste under whichever heading you choose:

```markdown
### Added — `buildInscription` can write envelope fields

`fields` takes tag numbers to values and emits them between the content type and
the body, in ascending tag order so identical input always produces identical
bytes. Tag 5 is `metadata`, the spec's own home for an object's own record; it
previously could not be written at all, so the only way to produce one was to
assemble envelope bytes by hand.

Three tags are refused at build time because each is silent afterwards. Tag 0
opens the body, so a field there does not fail — it becomes part of the file.
Tag 1 is the content type, and a second one declares it twice. An unrecognized
EVEN tag costs the inscription its location everywhere: the spec requires such
an inscription to be treated as unbound. Odd tags are ignored by an indexer that
does not know them, which is why the spec says it is okay to be odd.

`allowUnknownEvenFields` overrides the last of those. It exists because the
named tag set grows with the protocol, and a library that could never be
overridden would eventually be wrong AND unbypassable — sending people back to
hand-assembled bytes, which is worse than what the check prevents.

Tags 1..16 are emitted as opcodes and anything larger as a minimal data push,
since OP_16 is the largest numeric opcode. Script numbers carry sign in the high
bit of the last byte, so a tag ending >= 0x80 is zero-padded rather than read
back negative.
```

## Related, already shipped

`@smartledger/ordinals@0.1.6` went to npm the same day, fixing a matching blind
spot on the reading side: its parity check opened with `if (key.length !== 2)
return null`, so it only ever inspected single-byte tags. Tag 10 warned; tag
258 — `0x02 0x01`, even and unrecognized — did not, while a conformant indexer
still unbound the inscription.

Worth knowing here because the two are the same rule from opposite ends: this
library now refuses to *write* the hazard, and that one now reports it when it
*reads* one. Parity is settled by the least significant byte, which little-endian
puts first, so the rule holds at any tag width.

## Not investigated, flagged only

`test/smart_contract/ordinal_transfer.js` and `covenants.js` could not be run
from an installed copy of the package — they need dev dependencies that are not
in the published tarball. That is fine for you here in the repo, but it means a
consumer cannot independently confirm that covenants verify under mainnet flags.
Given 9.0.0 disclosed that they previously verified under *pre-Genesis* flags
while the network would have behaved differently, that is a claim worth having
independently checkable.
