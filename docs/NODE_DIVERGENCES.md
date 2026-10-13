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

#### What the representation should be, and what the real obstacle is

Updated 2026-10-13 after reading how `go-sdk` v1.7.2 handles the same shapes. The paragraph
above said this needs "a representation for an instruction it could not decode" without
saying what one would look like, which overstated the difficulty. There is a known answer:

`go-sdk`'s `decodeInstruction` (a port of `GetOp2`) returns false when **either** the length
field or the data runs past the end, and its parser then emits a single trailing instruction
at `OP_INVALIDOPCODE` (`0xff`) holding the remaining bytes. Because `0xff > OP_16`, every
opcode-number test rejects it without being told about truncation at all — `go-sdk`'s own
`IsPushOnly` is opcode-number-only, exactly like ours was, and is nonetheless correct. The
condition lives in one decode function, so every caller inherits it.

Measured against this library's existing machinery, that representation needs **no change to
`isPushOnly` and none to the interpreter**:

| chunk | `isPushOnly()` | `verify()` under mainnet flags |
|---|---|---|
| `{opcodenum: 0xff, buf: <4c>}` | `false` | `SCRIPT_ERR_SIG_PUSHONLY` |
| `{opcodenum: 0xff}` | `false` | `SCRIPT_ERR_SIG_PUSHONLY` |

So the risk named above — that loosening the parser "must then be rejected correctly at every
point downstream" — is **not** the real obstacle. The representation is fail-closed by
construction, because it is an undefined opcode above `OP_16`.

**The real obstacle is serialization fidelity.** `toBuffer` writes a chunk as its opcode byte
followed by its buffer, so a `0xff` chunk holding `4c` serializes to `ff` — a byte that was
never in the script, and one byte where there was one byte of something else. This library
currently round-trips a malformed script EXACTLY: `4c50` + ten bytes re-serializes to itself,
and a transaction carrying it re-serializes byte for byte, which is what makes such a
transaction safe to parse, store and relay today. A fix must therefore teach `toBuffer` to
emit the raw remainder for this chunk kind rather than an opcode byte, and prove the
round-trip is still exact for every shape — including a truncated push appearing mid-script,
where the undecodable remainder swallows every following instruction.

That is a bounded, testable piece of work rather than an open-ended one, and the vectors to
prove it are the ones below. It is still a deliberate change to what `Script.fromBuffer` may
return, so it remains Greg's call rather than a patch.

#### Node verdicts for these shapes

From a compiled `bitcoin-sv` v1.2.3 on regtest, post-Chronicle flags, via the op-codes lab:

| position | SIGPUSHONLY on | off |
|---|---|---|
| as the whole scriptSig | `SIG_PUSHONLY` | `BAD_OPCODE` |
| at the end of an executed locking script | `BAD_OPCODE` | `BAD_OPCODE` |

All three shapes behave identically. The locking-script row is not the flag failing: the
push-only gate only ever tests the scriptSig, so for a locking script only the instruction
read can fail.

A third reported row — a truncated push inside an unexecuted `OP_IF` giving
`UNBALANCED_CONDITIONAL` — was refused and has since been retracted at source. It could not
be right, because `EvalScript` calls `GetOp` at the top of its loop and returns `BAD_OPCODE`
before `fExec` is computed (interpreter.cpp:450), while the `conditionals.empty()` test is
only reached once the loop runs to completion (interpreter.cpp:1828). An undecodable
instruction therefore reports `BAD_OPCODE` whether its branch would have executed or not,
which is the behaviour 9.29.2 landed here.

The actual cause was better than the one guessed at from this side, and worth recording
because it is a trap for anyone generating vectors: the row builder gave up before assembling
the scriptSig for rows whose LOCKING script its own parser could not read, and recorded an
EMPTY scriptSig. The node was then judging `''` against `63 4c`, where `OP_IF` meets an empty
stack and returns `SCRIPT_ERR_UNBALANCED_CONDITIONAL` (interpreter.cpp, `case OP_IF`) **before
the `4c` is ever read**. A verdict about a different script entirely. Confirmed here: `''`
against `6351` gives `UNBALANCED_CONDITIONAL`, matching. Once the scriptSig was recorded, all
those rows gave `BAD_OPCODE`. **A vector row's label cannot be trusted without its bytes** —
an off-by-one-byte or missing-field row yields a plausible wrong answer rather than an obvious
failure.

#### How narrow the open divergence actually is

Narrower than the three shapes suggest. The parser only fails when the length field is cut off
at the very END of the script, with nothing following it. The moment any byte follows, that
byte IS the length field, the push decodes with short data, and the chunk lands in the class
9.29.2 already handles — where this library agrees with the node. Measured:

| scriptSig | locking script | here | class |
|---|---|---|---|
| `00` | `634c6851` (`4c` takes `68` as length 104) | `BAD_OPCODE` | already agrees |
| `00` | `634d016851` | `BAD_OPCODE` | already agrees |
| `00` | `634e01006851` | `BAD_OPCODE` | already agrees |
| `00` | `634c05cd`, `6301`, `6305cdcd` | `BAD_OPCODE` | already agrees |
| `''` | `634c` | **unparseable** | the open divergence |

So the "closed conditional" and mid-script positions — the ones expected to be hardest — are
not affected at all. Only a shape sitting at the end of a script, with its length field
truncated away, has no verdict here.
