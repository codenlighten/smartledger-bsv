# SmartLedger-BSV

Bitcoin SV library with an interpreter-verified script engine.

[![Version](https://img.shields.io/badge/version-9.0.0-blue.svg)](https://www.npmjs.com/package/@smartledger/bsv)
[![License](https://img.shields.io/badge/license-MIT-green.svg)](LICENSE)
[![Stability](https://img.shields.io/badge/9.x%20stable%20until-2027--09--01-brightgreen.svg)](STABILITY.md)

Its defaults describe BSV as the network actually runs it. `verify()` with no
flags means current mainnet consensus, not "no rules"; the interpreter is
measured against the reference node's own vectors (1483/1483, zero false
accepts) rather than the Bitcoin Core vectors inherited from the upstream fork;
and all secp256k1 work runs on the audited, constant-time
[`@noble`](https://github.com/paulmillr/noble-curves) suite with `elliptic`
removed.

> **9.x will not break your code until at least 2027-09-01.** Patch and minor
> releases only. This library published six majors in the 82 days before that
> commitment; [STABILITY.md](STABILITY.md) explains what changed and how
> correctness fixes now ship without breaking callers.

```bash
npm install @smartledger/bsv
```

## Covenants that actually enforce

A covenant constrains the transaction that spends it. The script has no opcode
for reading its own spend, so OP_PUSH_TX fixes the private key `a = 1` and
ephemeral key `k = 1`, collapsing ECDSA to `s = (z + Gx) mod n` — plain
arithmetic the script can do on a BIP-143 preimage sitting on the stack.
`OP_CHECKSIG` against the generator `G` then proves that data really is this
transaction's preimage. No trusted signer is involved.

```javascript
const bsv = require('@smartledger/bsv')
const { Script, Transaction, crypto } = bsv
const P = bsv.SmartContract.PushTx

// Commit to the only outputs this coin may ever be spent to.
const dest = Script.fromASM('OP_FALSE OP_RETURN 636f76656e616e74')
const allowed = [new Transaction.Output({ script: dest, satoshis: 99000 })]
const lock = P.valueCovenant(P.hashOutputs(allowed))   // ~419 bytes

// Spend it. `grind` nudges nLockTime until the script-derived signature is
// canonical (low-S); the cost falls on the spender, not on script size.
const g = P.grind(spendingTx, 0, lock, 100000)
const unlock = new Script().add(g.preimage)            // the preimage IS the unlock

new Script.Interpreter().verify(unlock, lock, spendingTx, 0, undefined, new crypto.BN(100000))
// => true, and false for any transaction that redirects the outputs
```

Every locking script in `bsv.SmartContract` ships with both a must-accept and a
must-reject test. Higher-level pieces built on the same core:

```javascript
const SC = bsv.SmartContract
SC.perpetualCovenant(500)          // every spend recreates the same script (value − fee)
SC.ownershipToken(500, ownerHash)  // NFT; transfer needs the owner's signature over the spend
SC.policy({ /* ... */ })           // declarative front-end over OP_PUSH_TX
```

## The one thing that will bite you

Flags and **limits** are separate mechanisms. The era bits (`SCRIPT_GENESIS`,
`SCRIPT_UTXO_AFTER_GENESIS`, and the Chronicle pair) are what the interpreter
derives its element-size, script-size, opcode-count and script-number caps from.

Hand-assemble a flag word out of named constants — the idiom every pre-Genesis
tutorial teaches — and you get the feature opcodes you asked for while silently
keeping the 2019 caps. The script *runs*, so nothing looks wrong until a
586-byte preimage is rejected against a 520-byte limit and the error blames the
push instead of the flags.

```javascript
// Correct — resolves to current mainnet:
interp.verify(unlock, lock, tx, 0, undefined, satoshisBN)
interp.verify(unlock, lock, tx, 0, Script.Interpreter.mainnetFlags(), satoshisBN)

// Silently pre-Genesis, and the reason your covenant "doesn't work":
interp.verify(unlock, lock, tx, 0, SCRIPT_ENABLE_MONOLITH_OPCODES | ..., satoshisBN)
```

Since 9.1.0 a failure caused this way sets `interp.eraHint` and prints one
explanatory warning per process. Deliberate pre-Genesis testing is legitimate
and stays silent unless it trips an era-derived limit; set
`Interpreter.eraDiagnostics = false` or `BSV_NO_ERA_HINT=1` to turn the notice
off entirely.

## Core Bitcoin API

Drop-in compatible with the classic `bsv` 1.5.6 surface.

```javascript
const { PrivateKey, Transaction, Script, Address, HDPrivateKey } = require('@smartledger/bsv')

const key = PrivateKey.fromRandom()
const tx = new Transaction()
  .from(utxos)
  .to(address, 50000)
  .change(key.toAddress())
  .sign(key)
```

Custom locking scripts need the subscript and amount passed explicitly — BIP-143
signs both, and `tx.sign()` only knows P2PKH:

```javascript
const sig = Transaction.sighash.sign(
  tx, privateKey, sighashType, inputIndex, lockingScript, new crypto.BN(satoshis)
)
const push = Buffer.concat([sig.toDER(), Buffer.from([sighashType])])  // flag byte required
```

Also included: `Block`, `MerkleBlock`, `SPV`, `Mnemonic` (BIP-39), `ECIES`,
`Message`, `Shamir`, `Ordinals`, `NotaryHash` (BRC-220).

## Credentials and legal tokens

Standards-based issuance and verification, ES256/ES256K, with on-chain BSV
anchoring. These are substantial subsystems; each has its own guide.

```javascript
const { createDID, createEmailCredential, verifyCredential } = require('@smartledger/bsv')
```

| Area | Entry point | Guide |
|---|---|---|
| DID:web + VC-JWT | `bsv.DIDWeb`, `bsv.VcJwt` | [docs/technical/GDAF_DEVELOPER_INTERFACE.md](docs/technical/GDAF_DEVELOPER_INTERFACE.md) |
| Revocation (StatusList2021) | `bsv.StatusList` | [docs/MODULE_REFERENCE_COMPLETE.md](docs/MODULE_REFERENCE_COMPLETE.md) |
| Legal Token Protocol | `bsv.LTP` | [docs/advanced/LEGAL_TOKEN_PROTOCOL.md](docs/advanced/LEGAL_TOKEN_PROTOCOL.md) |
| Attestation (GDAF) | `bsv.GDAF` | [docs/technical/GDAF_IMPLEMENTATION_COMPLETE.md](docs/technical/GDAF_IMPLEMENTATION_COMPLETE.md) |
| Blockchain anchoring | `bsv.Anchor` | [docs/MODULE_REFERENCE_COMPLETE.md](docs/MODULE_REFERENCE_COMPLETE.md) |

A CLI covers the common credential workflow end to end:

```bash
npx smartledger-bsv didweb:init --domain example.com
npx smartledger-bsv vc:issue --subject did:web:example.com:alice --type EmailCredential
npx smartledger-bsv vc:verify --token ./credential.jwt
```

## Loading options

Node and bundlers get tree-shakeable subpaths; browsers can take a single file
from a CDN. Importing the package root pulls in every subsystem, so prefer a
subpath when you only need part of it:

```javascript
const Script = require('@smartledger/bsv/lib/script')   // 24 modules
const bsv = require('@smartledger/bsv')                 // 128 modules
```

### **Core Modules**
| Module | Size | Use Case | CDN |
|--------|------|----------|-----|
| **bsv.min.js** | 1037KB | Core BSV + SmartContract | `unpkg.com/@smartledger/bsv@9.0.0/bsv.min.js` |
| **bsv.bundle.js** | 1037KB | Everything in one file | `unpkg.com/@smartledger/bsv@9.0.0/bsv.bundle.js` |

### **W3C Verifiable Credentials**
| Module | Size | Use Case | CDN |
|--------|------|----------|-----|
| **🟢 bsv-didweb.min.js** | 166KB | **DID:web generation** | `unpkg.com/@smartledger/bsv@9.0.0/bsv-didweb.min.js` |
| **🟢 bsv-vcjwt.min.js** | 166KB | **VC-JWT issue/verify** | `unpkg.com/@smartledger/bsv@9.0.0/bsv-vcjwt.min.js` |
| **🟢 bsv-statuslist.min.js** | 256KB | **StatusList2021 revocation** | `unpkg.com/@smartledger/bsv@9.0.0/bsv-statuslist.min.js` |
| **🟢 bsv-anchor.min.js** | 164KB | **BSV anchoring (hash-only)** | `unpkg.com/@smartledger/bsv@9.0.0/bsv-anchor.min.js` |

### **Smart Contract & Development**
| Module | Size | Use Case | CDN |
|--------|------|----------|-----|
| **bsv-smartcontract.min.js** | 138KB | Complete covenant framework | `unpkg.com/@smartledger/bsv@9.0.0/bsv-smartcontract.min.js` |
| **bsv-covenant.min.js** | 35KB | Covenant operations | `unpkg.com/@smartledger/bsv@9.0.0/bsv-covenant.min.js` |
| **bsv-script-helper.min.js** | 33KB | Custom script tools | `unpkg.com/@smartledger/bsv@9.0.0/bsv-script-helper.min.js` |
| **bsv-security.min.js** | 32KB | Security enhancements | `unpkg.com/@smartledger/bsv@9.0.0/bsv-security.min.js` |

### **Legal & Compliance**
| Module | Size | Use Case | CDN |
|--------|------|----------|-----|
| **bsv-ltp.min.js** | 534KB | Legal Token Protocol | `unpkg.com/@smartledger/bsv@9.0.0/bsv-ltp.min.js` |
| **bsv-gdaf.min.js** | 1037KB | Digital Identity & Attestation | `unpkg.com/@smartledger/bsv@9.0.0/bsv-gdaf.min.js` |

### **Advanced Cryptography**
| Module | Size | Use Case | CDN |
|--------|------|----------|-----|
| **bsv-shamir.min.js** | 177KB | Threshold Cryptography | `unpkg.com/@smartledger/bsv@9.0.0/bsv-shamir.min.js` |

### **Utilities**
| Module | Size | Use Case | CDN |
|--------|------|----------|-----|
| **bsv-ecies.min.js** | 137KB | Encryption | `unpkg.com/@smartledger/bsv@9.0.0/bsv-ecies.min.js` |
| **bsv-message.min.js** | 34KB | Message signing | `unpkg.com/@smartledger/bsv@9.0.0/bsv-message.min.js` |
| **bsv-mnemonic.min.js** | 320KB | HD wallets | `unpkg.com/@smartledger/bsv@9.0.0/bsv-mnemonic.min.js` |
```html
<script src="https://unpkg.com/@smartledger/bsv@9.0.0/bsv.min.js"></script>
<script>
  const key = bsv.PrivateKey.fromRandom()
</script>
```

Pin the version in CDN URLs. A floating `@latest` will move under you even
within 9.x.

## Documentation

| | |
|---|---|
| [STABILITY.md](STABILITY.md) | release policy, deprecation process, what's covered |
| [docs/advanced/ADVANCED_COVENANT_DEVELOPMENT.md](docs/advanced/ADVANCED_COVENANT_DEVELOPMENT.md) | covenant patterns beyond the basics |
| [docs/advanced/CUSTOM_SCRIPT_DEVELOPMENT.md](docs/advanced/CUSTOM_SCRIPT_DEVELOPMENT.md) | signing arbitrary locking scripts |
| [docs/preimage.md](docs/preimage.md) | BIP-143 preimage field layout |
| [docs/pushtx-key-insights.md](docs/pushtx-key-insights.md) | the nChain OP_PUSH_TX construction and its security claims |
| [docs/api/SCRIPTS.md](docs/api/SCRIPTS.md) | script API reference |
| [docs/migration/FROM_BSV_1_5_6.md](docs/migration/FROM_BSV_1_5_6.md) | migrating from classic `bsv` |
| [SECURITY.md](SECURITY.md) | reporting vulnerabilities |
| [CHANGELOG.md](CHANGELOG.md) | release history |

## Verifying this library yourself

Consensus behavior is pinned by vectors generated against the reference
implementation, not by this library's own opinion:

```bash
npm test           # unit + integration
npm run conformance    # 452 cases against the reference corpus
npm run vectors:sv     # SV consensus vector report
```

## Contributing

Issues and pull requests: <https://github.com/codenlighten/smartledger-bsv>

Two rules matter more than the rest. Consensus changes need a conformance vector
in the same commit. Removing or breaking a public API needs a deprecation notice
that has shipped in an earlier minor — see [STABILITY.md](STABILITY.md).

## License

MIT

---

**SmartLedger-BSV v9.0.0**
