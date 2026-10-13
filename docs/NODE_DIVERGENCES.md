# Known divergences from the reference implementation

Every entry here is a case where this library and a compiled `bitcoin-sv` node answer
differently about the same script, and the divergence is still **open**. Fixed ones live in
`CHANGELOG.md`; this file is for what is known and not yet resolved, so that a divergence
cannot be quietly forgotten between releases.

A divergence is recorded here only once it has been reproduced against node source or a
node-judged vector set, with the mechanism read rather than inferred.

## Classes, worst first

1. **FALSE ACCEPT** — the library verifies a script the network refuses. This is the
   dangerous direction: a lock the library calls spendable, that the network will not let
   you spend, leaves coins stranded behind it. None are open.
2. **FALSE REJECT** — the library refuses a script the network accepts. Costly but visible:
   you find out before you commit funds. None are open.
3. **DIFFERENT REASON** — both reject, but with different error names or in a different
   check order. Invisible to an accept/reject comparison, which is why these are found by
   comparing error *names* against a node. One is open, below.
4. **NO ANSWER** — the library cannot produce a verdict at all. One is open, below.

## Open

### A push whose LENGTH FIELD is truncated has no verdict

**Class:** no answer. **Found:** 2026-10-13, by the op-codes lab. **Status:** open; the fix
is a design decision, not a patch.

A script ending in `4c` (OP_PUSHDATA1 with no length byte), `4d01` (OP_PUSHDATA2 with one of
two) or `4e0100` (OP_PUSHDATA4 with two of four) declares a push whose length the script does
not carry. The node's parser fails at the length read —

```cpp
else if (opcode == OP_PUSHDATA1) { if (end()-pc < 1) return false; nSize = *pc++; }
```

— so `GetOp` returns false, `EvalScript` reports `SCRIPT_ERR_BAD_OPCODE`, and under
`SCRIPT_VERIFY_SIGPUSHONLY` `IsPushOnly` fails first and reports `SCRIPT_ERR_SIG_PUSHONLY`.
Either way the node has a verdict.

This library parses eagerly. A chunk carries the declared length in `len` and the bytes
present in `buf`, and there is no length to put in `len` for these three shapes, so
`Script.fromBuffer` throws `Script.InvalidBuffer` and no Script object exists to evaluate.

**How far it reaches** (measured, not assumed — see
`test/script/sig_pushonly_truncated.js`): transaction script parsing is lazy, so this is
narrower than it first appears. A transaction carrying such a scriptSig still constructs,
`toString()` round-trips it byte for byte, and the raw scriptSig stays readable through
`input._scriptBuffer`. Only `input.script` throws. Such a transaction can be parsed, stored
and relayed; what cannot be done is ask this library whether its script is valid.

**Why it is not fixed yet.** Both sides reject, and a throw is fail-closed, so nothing is
accepted that should not be. Fixing it means giving the parser a representation for an
instruction it could not decode, which changes what `Script.fromBuffer` may return.
Loosening a parser that currently throws converts a fail-closed path into one that must then
be rejected correctly at every point downstream — the push-only gate, evaluation, the
classifiers, serialization. That is the shape of change that introduces a false accept while
fixing a different-reason divergence, so it wants its own release and its own vectors, not a
line in a patch.

**What is pinned meanwhile:** that the failure is a typed, catchable `Script.InvalidBuffer`
at the API boundary rather than an internal error, and exactly which operations still work.
