# A BSV verification adapter for a multi-chain gateway

Written for a gateway whose BSV side calls the NotaryHash service to create records and needs to
**verify** them itself. Two small modules, both offline, both doing no network I/O of their own:

| file | what it does |
|---|---|
| `bsv-verify-adapter.js` | verifies a certificate against a header the caller supplies |
| `header-from-explorer.js` | turns an explorer's header JSON into the 80 bytes, and proves the bytes are right |

Copy them. They are a worked example rather than a supported API, so they live in `examples/` and
carry no stability promise — but every behaviour described below is tested against two real mainnet
certificates.

## The verdict has three states

```js
const { verifyCertificate, VERDICT } = require('./bsv-verify-adapter')
const r = verifyCertificate(certificate, { header, blockHashAtHeight })
// r.verdict: 'valid' | 'invalid' | 'indeterminate'
// r.ok:      true only for 'valid', so `if (!r.ok)` fails closed
// r.reasons: [] for valid, otherwise one sentence per problem
```

`valid` and `invalid` are claims **about the certificate**. `indeterminate` says **"I could not
look"** and is not a rejection.

Keeping them apart is the whole point. Collapse `indeterminate` into `invalid` and a flaky explorer
looks like a forgery; collapse it into `valid` and an outage becomes a silent accept. Nearly every
verification bug found in this library and its siblings came from that distinction being lost
somewhere, so it is the shape of the return value rather than a convention to remember.

## What it does, in order

**Structure and signature first, because they need nothing from the chain.** A malformed or
unsigned certificate is `invalid` even with no header available — answering `indeterminate` there
would let a forgery hide behind a network outage.

**Then the anchor, which is the only part that needs the chain.** No header, or no independent
block hash, gives `indeterminate`: the record's presence in a block is *unchecked*, which is not
the same as absent.

## Why `blockHashAtHeight` is required and not optional

A header carries its own difficulty bits. Supply a header alone and it is only checked against the
proof-of-work limit, which rules out a *free* forgery — difficulty 1 is about 4.3e9 hashes against
a real mainnet header's ~1e20 — and nothing more.

**A header is never believed about its own difficulty.** It is believed because a source you trust
independently puts that hash at that height. So the adapter refuses the header-only form with
`indeterminate` rather than returning a pass that means less than it appears to. The library itself
deprecated the weak form in 9.13.0; this adapter declines it outright.

## Explorer JSON is not a header

Explorers return header *fields*, not the serialised header, and assembling them wrongly is
silent — a byte-order slip gives you 80 plausible bytes that verify nothing.

```js
const { headerFromExplorer } = require('./header-from-explorer')
const header = headerFromExplorer(json)   // throws unless it hashes back to json.hash
```

It hashes the result and refuses to return it unless it equals the block id you asked for. One hash,
and a whole class of quiet bug becomes an exception. Hashes are displayed big-endian and serialised
little-endian, which is where this usually goes wrong.

## Worked example

```js
const { verifyCertificate } = require('./bsv-verify-adapter')
const { headerFromExplorer } = require('./header-from-explorer')

// 1. the certificate, from the service or from the holder
const res  = await fetch('https://notaryhash.com/v1/certificate/' + id)
const cert = (await res.json()).certificate

// 2. the header, from YOUR OWN chain source — not from whoever gave you the certificate
const hj = await (await fetch(
  'https://api.whatsonchain.com/v1/bsv/main/block/' + cert.spv.blockHash + '/header')).json()

// 3. verify
const r = verifyCertificate(cert, {
  header: headerFromExplorer(hj),
  blockHashAtHeight: hj.hash          // what your source has at cert.spv.blockHeight
})

if (r.verdict === 'indeterminate') {
  // retry, or try another source. NOT a rejection, and not something to record as a failure.
} else if (!r.ok) {
  // a real rejection: r.reasons says what failed
}
```

Step 2 is the one that carries the trust. Taking the header from the same party that supplied the
certificate verifies nothing.

## Tested behaviour

Against mainnet certificate `5eb617d8…bf44b` (block 970038):

| input | verdict |
|---|---|
| header + `blockHashAtHeight` | `valid` |
| header alone (weak form) | `indeterminate` — refused, not accepted |
| no header | `indeterminate` |
| tampered signature, no header | `invalid` — a forgery cannot hide behind a missing header |
| wrong header + right hash | `invalid` — "block header failed proof-of-work validation" |
| right header + wrong hash | `invalid` — "may be orphaned" |

## What this does not do

No network I/O, no retry policy, no source selection, no caching — those are the gateway's, and
they are the reason the header is a parameter. If you want agreement across several explorers,
`@smartledger/notaryhash` has a `MultiSourceHeaderProvider` whose quorum defaults to *all* sources,
because one explorer's word is not enough about which block is on the main chain.

**Do not use `bsv.Script.Interpreter` as a BTC or LTC validator.** It implements BSV post-Genesis
consensus, so it accepts scripts those chains reject outright.
