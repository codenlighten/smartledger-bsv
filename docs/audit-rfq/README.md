# Audit RFQ — ready to send

Three per-vendor copies of the enquiry in [`../AUDIT_SCOPE.md`](../AUDIT_SCOPE.md) §6.

| File | Vendor | Route |
| --- | --- | --- |
| `cure53.txt` | Cure53 | `mail@cure53.de` |
| `ncc-group.txt` | NCC Group — Cryptography Services | enquiry form |
| `trail-of-bits.txt` | Trail of Bits | contact form |

**Verify each route on the vendor's own site before sending.** They are recorded here
as the commonly published ones, not as confirmed current addresses.

## What differs between them

Only the greeting. The scope section — everything from *"We maintain
@smartledger/bsv"* to the sign-off — is byte-identical in all three, checked by hash:

```
cure53          78cfa6aba956d1ed
ncc-group       78cfa6aba956d1ed
trail-of-bits   78cfa6aba956d1ed
```

That is the point of `AUDIT_SCOPE.md`: every vendor prices the same thing, so the
spread in how they scope it back is informative. The one-sentence opener is drawn
from the vendor rationale in §5 and changes nothing priced — delete it if you would
rather they all receive identical text.

## Regenerating

These are generated from `AUDIT_SCOPE.md` §6, never hand-written, so the figures
cannot drift between the scope document and what a vendor receives. If you edit the
enquiry text, regenerate rather than editing these files.

**Before sending, re-run §7 of `AUDIT_SCOPE.md`.** The figures are measured at a
commit and go stale: the previous set was 445 lines light after twelve days, most of
it in `lib/script/interpreter.js`, which is tier 1 and therefore the number a vendor
quotes against. Current figures were measured 2026-08-28 at `aa551a1`.

Reply address in all three: `support@smartledger.technology`.
