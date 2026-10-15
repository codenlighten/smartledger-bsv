# BRC-220 amendment checks

Two scripts used to prepare the `brc-220-unsigned-region` amendment (see
`docs/BRC-220-UNSIGNED-FIELDS.md`). Both take the path of a clone of the BRCs repository with
the branch checked out and an `upstream` remote pointing at `bsv-blockchain/BRCs`:

    python3 -I scripts/brc220/audit-amendment.py <brcs-clone>
    python3 -I scripts/brc220/sync-draft.py <brcs-clone>

`audit-amendment.py` asserts that every backticked identifier in the added text occurs in the
upstream spec, that each normative rule the added text leans on is already in the upstream spec
(so the amendment never argues from its own text), and that the file's markdown is intact —
heading list and table-row count unchanged, fences balanced, no tabs, no CRLF, no curly quotes,
no character classes the spec does not already use, every upstream line retained.

`sync-draft.py` regenerates the "Proposed text" section of `docs/BRC-220-UNSIGNED-FIELDS.md`
from the branch and then verifies each blockquoted paragraph is a line of `apps/0220.md`
verbatim. It exists because the draft and the branch did drift: the draft kept describing an
earlier version of the text ("the eight fields of §Canonical proof bytes") after the branch had
been corrected to six fields plus two literals. Its line wrapper splits on spaces only, so
unwrapping is its exact inverse — `textwrap` breaks inside `1–2` and the round trip then fails.

They are not wired into CI: they need a clone of another repository.
