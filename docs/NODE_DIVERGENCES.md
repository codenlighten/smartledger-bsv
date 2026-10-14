# Known divergences from the reference implementation

Every entry here is a case where this library and a compiled `bitcoin-sv` node answer
differently about the same script. Open ones come first; a closed one keeps its entry when the
measurements behind it are worth reading, with the resolution at the top. Fixed ones are also
in `CHANGELOG.md`; this file is for what is known, so that a divergence
cannot be quietly forgotten between releases.

A divergence is recorded here only once it has been reproduced against node source or a
node-judged vector set, with the mechanism read rather than inferred.

## Classes, worst first

1. **FALSE ACCEPT** — the library verifies a script the network refuses. This is the
   dangerous direction: a lock the library calls spendable, that the network will not let
   you spend, leaves coins stranded behind it. None are open.
2. **FALSE REJECT** — the library refuses a script the network accepts. Costly but visible:
   you find out before you commit funds. One is open, below.
3. **DIFFERENT REASON** — both reject, but with different error names or in a different
   check order. Invisible to an accept/reject comparison, which is why these are found by
   comparing error *names* against a node. None are open.
4. **NO ANSWER** — the library cannot produce a verdict at all. One is open, below — the same
   entry, because a throw where the node accepts is both at once.

## Open

Nothing. The one entry below was closed in 9.35.0. The sections under it are kept because the
measurements are what made the fix small, and because the reasoning that argued against fixing
it is worth reading next to what the fix turned out to cost.

## Closed

### A push whose LENGTH FIELD is truncated has no verdict — and after OP_RETURN the node ACCEPTS

**Class:** no answer, and false reject where the node accepts. **Found:** 2026-10-13, by the
op-codes lab. **Status:** CLOSED in 9.35.0.

**How it was closed.** The parser keeps the bytes it did read in a `lenPrefix` field on the
chunk, with no `len` and no `buf` because there is no declared length to record, and
`toBuffer` writes them back unchanged. The shared `isUndecodablePush` predicate answers true
for that shape, so both of the node's `GetOp` callers get the answer they already got for
truncated data: not-push-only from `IsPushOnly`, `BAD_OPCODE` from the instruction read.

**The interpreter was not touched**, and that was a prediction before it was a result. Of the
22 rows the op-codes lab had judged on a compiled bitcoin-sv v1.2.3, **16 already agreed**; all
6 that did not were the three top-level shapes, in both eras, and all 6 failed inside
`Script.fromBuffer` without ever reaching the interpreter. The rows inside an `IF` already
agreed, so "leniency only at a top-level OP_RETURN" needed no new logic — it is enforced by
those scripts parsing and the interpreter deciding, which is also why the parser can be
unconditionally permissive without granting leniency where the node gives none. All 22 rows
now agree, pinned in `test/script/optrue_return_truncated_tail.js`.

**What the fix cost, against the paragraph below that argued it would be expensive.** Four
call sites: the parser, `toBuffer`, `serializesCleanly`, and the chunk renderer. The warning
in "Why it is not fixed yet" was right that a loosened parser must then be rejected correctly
everywhere downstream — but wrong that this needed its own release of design work, because the
downstream rejection already existed and was already shared in one predicate. The 9.29.2 work
that moved that predicate into `lib/script/push-decode.js` is what made this a four-line
change instead of a design problem.

**One consequence worth stating:** `Script.fromBuffer` is now **total** — every byte string
parses and round-trips byte for byte, fuzzed over 282,400 sequences with zero throws and zero
mismatches. That matches the node, where `CScript` is a byte vector and decoding is on demand,
so a decode failure surfaces at use. It also means `Output#setScriptFromBuffer`'s null-script
path is unreachable from bytes; the guards that depend on it are kept deliberately, and the
state is now constructed directly in the test rather than through a parse failure.

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

**What was pinned meanwhile:** that the failure is a typed, catchable `Script.InvalidBuffer`
at the API boundary rather than an internal error, and exactly which operations still work.
Superseded — `input.script` no longer throws, and that test now pins the agreement instead.

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

#### After OP_RETURN, the node ACCEPTS — so this is a false reject, not only a silence

Confirmed 2026-10-13 by two independent harnesses and the mechanism read at that tag. The
op-codes lab judged 336 rows against a compiled v1.2.3 (18 of them these shapes: 12 Chronicle
cells across both flag words and tx versions 1 and 2, plus 6 pre-Chronicle). The
locking-script-legos lab judged the same three locks against reference `VerifyScript` under two
flag words with Chronicle bits set and cleared, and then **funded each lock on two live nodes
(pre-Chronicle and Chronicle-era), broadcast the spends and mined them** — so these outputs are
not merely consensus-valid, they are creatable and were created, and a wallet reading such an
output back is a real scenario rather than a hypothetical one. No non-accept row in either
harness. Post-Genesis a top-level `OP_RETURN` terminates evaluation as
SUCCESSFUL and the rest of the script is never read — the node says so in its own comment:

```cpp
case OP_RETURN: {
    if (utxo_after_genesis) {
        if (conditionals.empty()) {
            // Terminate the execution as successful. The remaining of the script does not
            // affect the validity (even in presence of unbalanced IFs, invalid opcodes etc)
            return SCRIPT_ERR_OK;
```

So `6a4c`, `6a4d01` and `6a4e0100` — `OP_RETURN` followed by a cut-off length field — are
**valid locking scripts** that any truthy scriptSig spends. This library cannot parse them, so
it produces no verdict, and a caller that reads the throw as "invalid" refuses a spend the
network allows. That is a FALSE REJECT: the safe direction, and visible rather than silent,
but a divergence on the accept side rather than only on a name.

Where the shape IS representable the two agree. Measured here with scriptSig `51`:

| locking script | here | node |
|---|---|---|
| `6a4c`, `6a4d01`, `6a4e0100` | **unparseable** | `ACCEPT` |
| `6a4c50`+10 bytes | `ACCEPT` | `ACCEPT` |
| `6a4b`+10 bytes, `6a01` | `ACCEPT` | `ACCEPT` |

Whether anything real produces such an output is unknown — most plausibly a data carrier with
a damaged tail. It is recorded because it is an accept-side case, not because it is common.

**On the output side the refusal is a `null`, not a throw, and that had consequences.**
`Output#setScriptFromBuffer` catches `Script.InvalidBuffer` and sets `_script = null`, keeping
the raw bytes in `_scriptBuffer`. So a transaction carrying such an output constructs, round-
trips byte-exact, and reports the raw script in `toObject()` and `inspect()` — but
`output.script` is `null` for an output read from a valid, mined transaction. Two call sites
dereferenced it without asking and threw a raw, untyped `TypeError` that a consumer's
`instanceof` check could not classify: `Transaction#_hasDustOutputs` (reached from
`getSerializationError()` and `serialize()`) and `Output#getSize` (reached from
`_estimateSize()`, the fee path). Both were fixed in 9.33.2 / 1.5.2 without changing any
verdict. The underlying `null` remains, and is the thing the parser change would remove.

#### The proposed fix produces the node's answer in every position tested

Simulating the `OP_INVALIDOPCODE` tail as a chunk, with no change to the interpreter:

| script | simulated chunks | here | node |
|---|---|---|---|
| `6a4c` | `[OP_RETURN, {0xff, <4c>}]` | `ACCEPT` | `ACCEPT` |
| `4c` | `[{0xff, <4c>}]` | `BAD_OPCODE` | `BAD_OPCODE` |
| `634c` | `[OP_IF, {0xff, <4c>}]` | `BAD_OPCODE` | `BAD_OPCODE` |

Including the accept-side case, which it gets right for the right reason: `OP_RETURN` returns
before the tail is ever reached, exactly as in the node. The error name also tracks the
push-only gate's era-and-version condition correctly, because that condition is upstream of
the representation.

It also tracks the node across the TX-VERSION axis, which matters because the node's answer for
these three shapes is itself version-dependent — confirmed on a compiled v1.2.3 over 292 rows
at both versions. As the whole scriptSig, against lock `51`:

| shape | v1, SIGPUSHONLY on | v2, on | v1, off | v2, off |
|---|---|---|---|---|
| `4c` | `SIG_PUSHONLY` | `BAD_OPCODE` | `BAD_OPCODE` | `BAD_OPCODE` |
| `4d01` | `SIG_PUSHONLY` | `BAD_OPCODE` | `BAD_OPCODE` | `BAD_OPCODE` |
| `4e0100` | `SIG_PUSHONLY` | `BAD_OPCODE` | `BAD_OPCODE` | `BAD_OPCODE` |

The simulated representation gives all twelve cells identically, and for the structural reason
rather than by coincidence: the gate's era-and-version condition is evaluated before
`IsPushOnly` is consulted, and the chunk is an undefined opcode either way.

**The serialization obstacle now has an existence proof, so no axis is left unmeasured.**
`[OP_RETURN, {0xff, <4c>}].toHex()` gives `6aff`, not `6a4c`, so the fix must emit the raw
remainder for this chunk kind in `toBuffer` rather than re-encode the opcode number. That is
exactly what go-sdk does, and it is lossless there:

* the engine parser stores `ParsedOpcode{op: opcodeMalformed (0xff), Data: scr[i:]}` — the
  raw script bytes from the undecodable instruction to end-of-script;
* `opcodeparser.go:581` opens `bytes()` with `if o.isMalformed() { return o.Data, nil }`, so
  the carried remainder is re-emitted verbatim and the `0xff` is **never serialized**. It is
  internal identity only, which is what makes `IsPushOnly` and `FindAndDelete` treat the tail
  as non-push and undeletable.

Measured on go-sdk v1.7.2 through `Parse(nodeExact) -> Unparse`, bytes compared: `6a4c`,
`4c51`, `4c`, `4d01`, `4e0100` and `514c51` all round-trip **byte-exact**, including the
mid-script case where the tail swallows the following instruction. Both halves are required —
a raw-remainder carry alone, serialized through the opcode number, would still give `ff`.

So the representation is implementable without fidelity loss. What remains is to implement
and prove it here, not to establish that it can be done.
