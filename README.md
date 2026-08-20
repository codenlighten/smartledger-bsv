# SmartLedger-BSV

**🚀 Complete Bitcoin SV Development Framework with W3C Verifiable Credentials, DID:web, Legal Compliance, and 16 Flexible Loading Options**

[![Version](https://img.shields.io/badge/version-8.3.1-blue.svg)](https://www.npmjs.com/package/@smartledger/bsv)
[![License](https://img.shields.io/badge/license-MIT-green.svg)](LICENSE)
[![BSV](https://img.shields.io/badge/BSV-Compatible-orange.svg)](https://bitcoinsv.com/)
[![Modular](https://img.shields.io/badge/Loading-Modular-purple.svg)](#-16-loading-options---choose-your-approach)
[![W3C](https://img.shields.io/badge/W3C-Compliant-blueviolet.svg)](#-legally-recognizable-credentials-v34x)

A comprehensive Bitcoin SV library whose **defaults describe BSV as the network
actually runs it**. Since 8.0.0 the script interpreter is measured against the
reference node's own consensus vectors — 1483/1483, with zero false accepts —
rather than against the Bitcoin Core vectors inherited from the upstream fork.
All secp256k1 cryptography runs on the audited, constant-time
[`@noble`](https://github.com/paulmillr/noble-curves) suite with `elliptic`
removed, on top of the interpreter-verified covenant stack (OP_PUSH_TX, PELS,
ownership tokens), a legally-recognizable DID:web + VC-JWT toolkit, and 16
distribution methods.

> **8.3.0 (latest)**: BRC-220 **NotaryHash** — privacy-preserving signed-hash
> notarization with SPV-verifiable certificates, including RFC 6962 Merkle trees
> for batch mode. See [NotaryHash](#-notaryhash-brc-220) and the
> [CHANGELOG](./CHANGELOG.md).
>
> **8.0.0 was a breaking release.** `verify()` with no flags now means BSV
> mainnet rather than "no rules", and two flag constants changed value. Read
> [Upgrading to v8.0.0](#upgrading-to-v800-breaking-changes) before moving from
> 7.x or earlier.

## **Interpreter-Verified Covenants**

The full covenant stack lives at `bsv.SmartContract` and verifies end-to-end
through `Script.Interpreter`. Every locking script has both a positive
(must-accept) and negative (must-reject) test.

```javascript
const bsv = require('@smartledger/bsv')
const SC = bsv.SmartContract
SC.enableGenesis()   // OP_PUSH_TX needs the lifted element cap — but note this is
                     // process-wide and weakens pre-Genesis validation. See
                     // "Consensus defaults" below before calling it in an app.

// Self-replicating covenant — every spend recreates the same script (value − fee).
const lock = SC.perpetualCovenant(500)

// Stateful ownership token (NFT) — transfer requires the owner's ECDSA signature
// over the spend, rewrites state, perpetuates the token code.
const token = SC.ownershipToken(500, ownerHash) // ownerHash = SC.Token.ownerId(ownerKey)

// Value covenant — forces spend outputs to match a specific hashOutputs.
const vlock = SC.valueCovenant(SC.PushTx.hashOutputs(requiredOutputs))

// Verify any locking script end-to-end through Script.Interpreter.
// Returns { ok, err } — `err` names the interpreter error when ok is false.
const { ok, err } = SC.verifyScript(unlockScript, lockingScript, { tx, inputIndex, satoshis })
```

**Available primitives under `bsv.SmartContract`:**

| Namespace | Purpose |
|---|---|
| `PushTx` | nChain WP1605 OP_PUSH_TX — `authenticator()`, `valueCovenant()`, `hashOutputs()`, `extractHashOutputs()`, `grind()` |
| `PELS` | Perpetually Enforcing Locking Scripts — `perpetualCovenant(fee)` |
| `Token` | Stateful ownership token (NFT) — `ownershipToken(fee, owner[, auth])`, `ownershipTokenMulti(owner[, auth])`, `ownerId(key)`, `unlockTransfer(...)`, `unlockTransferMulti(...)` |
| `Authorizers` | Pluggable token ownership — `singleKey()`, `multisig(m, n)`, `predicate({...})` |
| `Locks` | Hash-lock, P2PKH, CLTV time-lock, m-of-n multisig, HTLC |
| `CovenantHelpers` | Consensus-flag `verify()` harness, raw BIP-143 preimage, signing, fund/spend scaffolding |

> ⚠️ Research-grade. Review carefully before mainnet value: the OP_PUSH_TX key
> is the intentionally public `a=k=1` construction, and low-S malleability is
> left unenforced for the in-script signature.

## 🔏 NotaryHash (BRC-220)

[BRC-220](https://github.com/bitcoin-sv/BRCs/blob/master/apps/0220.md) notarizes a
document by publishing a signed hash of it. The document itself never leaves your
hands — what goes on chain is an `OP_FALSE OP_RETURN` record, and what a verifier
receives is a certificate they can check offline plus an SPV proof they can check
against block headers obtained independently.

Available as `bsv.NotaryHash`, or `require('@smartledger/bsv/lib/notaryhash')`.

```javascript
const bsv = require('@smartledger/bsv')
const NotaryHash = bsv.NotaryHash

// 1. Hash the document. Only the hash is ever published.
const payloadHash = bsv.crypto.Hash.sha256(Buffer.from(documentBytes))

// 2. Sign the payloadHash DIRECTLY — no second hash, no Bitcoin sighash, and no
//    `endian` option. The 32-byte digest is the scalar, big-endian, which is what
//    every other ECDSA implementation does. Passing `endian: 'little'` here is
//    Bitcoin's message-signing convention and produces a signature no conformant
//    BRC-220 verifier will accept.
const ecdsa = bsv.crypto.ECDSA().set({ hashbuf: payloadHash, privkey: key })
ecdsa.sign()
const signatureBuffer = Buffer.concat([          // 64 raw bytes, r || s
  ecdsa.sig.r.toArrayLike(Buffer, 'be', 32),
  ecdsa.sig.s.toArrayLike(Buffer, 'be', 32)
])
const publicKeyBuffer = key.toPublicKey().toBuffer()

// 3. Build the certificate. `build` computes proofHash over
//    the canonical bytes — the protocol prefix, version and timestamp are inside
//    proofHash but never on chain, so the record alone cannot reconstruct it.
const certificate = NotaryHash.Certificate.build({
  mode: NotaryHash.MODE.FULL,
  algorithm: 'ECDSA-secp256k1',
  hashAlgorithm: 'SHA-256',
  payloadHash: payloadHash,
  publicKey: publicKeyBuffer,
  signature: signatureBuffer,
  createdAt: new Date().toISOString(),
  anchor: { txid: txid, blockHeight: height }
})

// 4. The output that goes on chain.
const script = NotaryHash.Script.build({
  mode: NotaryHash.MODE.FULL,
  algorithm: 'ECDSA-secp256k1',
  hashAlgorithm: 'SHA-256',
  payloadHash: payloadHash,
  proofHash: Buffer.from(certificate.proofHash, 'hex'),
  publicKey: publicKeyBuffer,
  signature: signatureBuffer
})

// 5. Checks. Every verify entry point returns a STRICT boolean.
NotaryHash.Certificate.proofHashMatches(certificate)  // proof integrity, offline
NotaryHash.Script.isNotaryHash(script)                // is this a NotaryHash output
NotaryHash.isValid(certificate, options)              // all three spec checks
```

**Three modes**, chosen by how much you can afford on chain:

| Mode | On chain | Use when |
|---|---|---|
| `MODE.FULL` | public key and signature in full | ECDSA, where both are small |
| `MODE.HYBRID` | `sha256` of each instead | post-quantum signatures, which run to tens of KB |
| `MODE.BATCH` | a 32-byte Merkle root and a `u32be` leaf count | notarizing many documents in one output |

Batch mode uses **RFC 6962** Merkle trees — domain-separated leaves
(`sha256(0x00‖d)`), internal nodes (`sha256(0x01‖L‖R)`), and a rightmost leaf that
is *never* duplicated. This is deliberately not the Bitcoin tree in `lib/spv` nor
the one in `lib/gdaf`; reusing either would produce a root no other BRC-220
implementation computes. The batch leaf is a certificate's `proofHash` — see
[`docs/BRC220_BATCH_LEAF_AMENDMENT.md`](./docs/BRC220_BATCH_LEAF_AMENDMENT.md).

**Post-quantum signatures are supported but not bundled.** `ECDSA-secp256k1` is
registered by default; ML-DSA and SLH-DSA are reached by registering a suite, so
callers who do not need them pay nothing in bundle size or audit surface:

```javascript
NotaryHash.registerSuite('ML-DSA-65', {
  verify: function (payloadHash, signature, publicKey) { /* ... */ }
})
```

An unregistered `algorithm` fails; it never falls through to a default suite.

## 🆕 **Legally-Recognizable Credentials (v3.4.x+)**

### **Why This Matters**
- ✅ **W3C Standards**: Full VC-JWT and DID:web compliance for legal recognition
- ✅ **Enterprise Ready**: ES256 (P-256 NIST curve) for regulated industries
- ✅ **Blockchain Native**: ES256K (secp256k1) for BSV integration
- ✅ **Revocation Built-in**: StatusList2021 standard for credential management
- ✅ **Privacy Preserving**: Hash-only BSV anchoring (no PII on-chain)
- ✅ **CLI Tools**: Complete command-line interface for credential operations

### **Quick Start - Issue Your First Verifiable Credential**

```bash
# Install SmartLedger BSV
npm install @smartledger/bsv

# Initialize DID:web issuer (generates ES256 keys)
npx smartledger-bsv didweb init --domain example.com --alg ES256

# Issue a credential
npx smartledger-bsv vc issue \
  --issuer did:web:example.com \
  --subject did:example:alice \
  --types "VerifiableCredential,DriversLicense" \
  --claims '{"licenseNumber":"DL123456","class":"C"}' \
  > credential.jwt

# Verify the credential
npx smartledger-bsv vc verify credential.jwt

# Anchor hash to BSV (privacy-preserving)
npx smartledger-bsv anchor hash credential.jwt

# Create revocation list
npx smartledger-bsv status create --issuer did:web:example.com > status-list.jwt

# Revoke a credential
npx smartledger-bsv status set --list status-list.jwt --index 42 --status revoked
```

### **Programmatic Usage**

```javascript
const bsv = require('@smartledger/bsv')

// Generate DID:web issuer keys
const keys = await bsv.DIDWeb.generateIssuerKeys({ alg: 'ES256' })

// Build DID documents (.well-known/did.json and jwks.json)
const docs = bsv.DIDWeb.buildDidWebDocuments({
  domain: 'example.com',
  p256: { jwk: keys.publicJwk, kid: keys.kid },
  controllerName: 'Example Corp'
})
// Deploy docs.didDocument to https://example.com/.well-known/did.json
// Deploy docs.jwks to https://example.com/.well-known/jwks.json

// Issue a Verifiable Credential as JWT
const result = await bsv.VcJwt.issueVcJwt({
  issuerDid: docs.did,
  subjectId: 'did:example:alice',
  types: ['VerifiableCredential', 'AgeCredential'],
  credentialSubject: {
    ageOver: 18,
    country: 'US'
  },
  privateJwk: keys.privateJwk,
  alg: 'ES256',
  kid: keys.kid
})

console.log('VC-JWT:', result.jwt)

// Verify the credential
const verification = await bsv.VcJwt.verifyVcJwt(result.jwt, {
  didResolver: async (did) => {
    // In production, fetch https://example.com/.well-known/jwks.json
    return { jwks: docs.jwks }
  },
  expectedIssuerDid: docs.did
})

console.log('Valid:', verification.valid)

// Anchor hash to BSV (no PII on-chain)
const hash = bsv.Anchor.sha256Hex(result.jwt)
const anchorPayload = bsv.Anchor.buildAnchorPayload({
  kind: 'VC_ANCHOR_SHA256',
  hash: hash,
  issuerDid: docs.did
})

// Include anchorPayload.json in OP_RETURN
// Later: verify with bsv.Anchor.verifyAnchorHash(originalData, anchorHash)

// Create revocation list (100k credentials)
const statusList = await bsv.StatusList.createStatusList({
  issuerDid: docs.did,
  privateJwk: keys.privateJwk
})

// Revoke a credential
const updated = await bsv.StatusList.updateStatusList({
  listVcJwt: statusList.listVcJwt,
  index: 42,
  status: 'revoked',
  privateJwk: keys.privateJwk
})

// Check revocation status
const status = bsv.StatusList.getCredentialStatusEntry({
  listVcJwt: updated.listVcJwt,
  index: 42
})

console.log('Status:', status) // 'revoked'
```

## 🎯 **16 Loading Options - Choose Your Approach**

### **Core Modules**
| Module | Size | Use Case | CDN |
|--------|------|----------|-----|
| **bsv.min.js** | 1039KB | Core BSV + SmartContract | `unpkg.com/@smartledger/bsv@8.3.1/bsv.min.js` |
| **bsv.bundle.js** | 1039KB | Everything in one file | `unpkg.com/@smartledger/bsv@8.3.1/bsv.bundle.js` |

### **W3C Verifiable Credentials**
| Module | Size | Use Case | CDN |
|--------|------|----------|-----|
| **🟢 bsv-didweb.min.js** | 166KB | **DID:web generation** | `unpkg.com/@smartledger/bsv@8.3.1/bsv-didweb.min.js` |
| **🟢 bsv-vcjwt.min.js** | 166KB | **VC-JWT issue/verify** | `unpkg.com/@smartledger/bsv@8.3.1/bsv-vcjwt.min.js` |
| **🟢 bsv-statuslist.min.js** | 256KB | **StatusList2021 revocation** | `unpkg.com/@smartledger/bsv@8.3.1/bsv-statuslist.min.js` |
| **🟢 bsv-anchor.min.js** | 164KB | **BSV anchoring (hash-only)** | `unpkg.com/@smartledger/bsv@8.3.1/bsv-anchor.min.js` |

### **Smart Contract & Development**
| Module | Size | Use Case | CDN |
|--------|------|----------|-----|
| **bsv-smartcontract.min.js** | 140KB | Complete covenant framework | `unpkg.com/@smartledger/bsv@8.3.1/bsv-smartcontract.min.js` |
| **bsv-covenant.min.js** | 35KB | Covenant operations | `unpkg.com/@smartledger/bsv@8.3.1/bsv-covenant.min.js` |
| **bsv-script-helper.min.js** | 33KB | Custom script tools | `unpkg.com/@smartledger/bsv@8.3.1/bsv-script-helper.min.js` |
| **bsv-security.min.js** | 32KB | Security enhancements | `unpkg.com/@smartledger/bsv@8.3.1/bsv-security.min.js` |

### **Legal & Compliance**
| Module | Size | Use Case | CDN |
|--------|------|----------|-----|
| **bsv-ltp.min.js** | 534KB | Legal Token Protocol | `unpkg.com/@smartledger/bsv@8.3.1/bsv-ltp.min.js` |
| **bsv-gdaf.min.js** | 1039KB | Digital Identity & Attestation | `unpkg.com/@smartledger/bsv@8.3.1/bsv-gdaf.min.js` |

### **Advanced Cryptography**
| Module | Size | Use Case | CDN |
|--------|------|----------|-----|
| **bsv-shamir.min.js** | 177KB | Threshold Cryptography | `unpkg.com/@smartledger/bsv@8.3.1/bsv-shamir.min.js` |

### **Utilities**
| Module | Size | Use Case | CDN |
|--------|------|----------|-----|
| **bsv-ecies.min.js** | 137KB | Encryption | `unpkg.com/@smartledger/bsv@8.3.1/bsv-ecies.min.js` |
| **bsv-message.min.js** | 34KB | Message signing | `unpkg.com/@smartledger/bsv@8.3.1/bsv-message.min.js` |
| **bsv-mnemonic.min.js** | 320KB | HD wallets | `unpkg.com/@smartledger/bsv@8.3.1/bsv-mnemonic.min.js` |

## ⚡ **2-Minute Quick Start**

Get started with Bitcoin SV development in under 2 minutes:

```bash
# Install via npm
npm install @smartledger/bsv

# Or include in HTML
<script src="https://unpkg.com/@smartledger/bsv@8.3.1/bsv.min.js"></script>
```

> **🔒 Upgrading?** 8.0.0 changed what `verify()` means with no flags, and moved
> two flag constants. Read [Upgrading to v8.0.0](#upgrading-to-v800-breaking-changes)
> before moving from 7.x or earlier; the older
> [v5.0.0 notes](#upgrading-to-v500-breaking-changes) still apply if you are coming
> from 4.x.

**Basic Transaction (30 seconds):**
```javascript
const bsv = require('@smartledger/bsv'); // Node.js
// const bsv = window.bsv; // Browser

// 1. Generate keys
const privateKey = new bsv.PrivateKey();
const address = privateKey.toAddress();

// 2. Create transaction
const tx = new bsv.Transaction()
  .from(utxo)                    // Add input
  .to(targetAddress, 50000)      // Send 50,000 satoshis
  .change(address)               // Send change back
  .sign(privateKey);             // Sign transaction

console.log('Transaction ID:', tx.id);
```

**🆕 Legal Token Development (60 seconds):**
```javascript
// Create a legal property-title token
const result = bsv.LTP.createRightToken({
  type: bsv.LTP.Right.RightTypes.PROPERTY_TITLE,
  owner: ownerDID,
  jurisdiction: 'us_delaware',
  legalDescription: 'Lot 15, Block 3, Subdivision ABC'
}, issuerPrivateKey);
console.log(result.success, result.token.tokenHash);

// Generate W3C Verifiable Credential
const credential = bsv.createEmailCredential(
  issuerDID, subjectDID, 'user@example.com', issuerPrivateKey
);

// Threshold cryptography — split(secret, threshold, shares)
const shares = bsv.Shamir.split('private_key_backup', 3, 5); // 3 of 5 needed
```

**🆕 Smart Contract Development (90 seconds):**
```javascript
// Generate authentic UTXOs for testing
const utxoGenerator = new bsv.SmartContract.UTXOGenerator();
const utxos = utxoGenerator.createRealUTXOs(2, 100000);

// Create BIP-143 preimage and extract fields
const preimage = new bsv.SmartContract.Preimage(preimageHex);
const amount = preimage.getField('amount');

// Build covenant with JavaScript-to-Script translation
const covenant = bsv.SmartContract.createCovenantBuilder()
  .extractField('amount')
  .push(50000)
  .greaterThanOrEqual()
  .verify()
  .build();
```

**Next Steps:**
- 📖 [SmartContract Guide](docs/advanced/SMART_CONTRACT_GUIDE.md)
- ⚖️ [Legal Token Protocol Guide](docs/advanced/LEGAL_TOKEN_PROTOCOL.md)  
- 🌐 [Digital Identity Guide](docs/technical/GDAF_DEVELOPER_INTERFACE.md)
- 🔐 [Threshold Cryptography Guide](docs/technical/SHAMIR_INTEGRATION_SUMMARY.md)
- 🗃️ [UTXO Manager Guide](docs/advanced/UTXO_MANAGER_GUIDE.md)
- 💡 [Examples Directory](https://github.com/codenlighten/smartledger-bsv/tree/main/examples)

## 🔧 **API Reference**

| Component | Method | Purpose | Example |
|-----------|--------|---------|---------|
| **Core** | `new PrivateKey()` | Generate private key | `const key = new bsv.PrivateKey()` |
| | `new Transaction()` | Create transaction | `const tx = new bsv.Transaction()` |
| | `Script.fromASM()` | Parse script | `const script = bsv.Script.fromASM('OP_DUP')` |
| **Covenant** | `SmartContract.perpetualCovenant()` | Self-replicating covenant | `SC.perpetualCovenant(500)` |
| | `SmartContract.verifyScript()` | Verify a script pair; returns `{ ok, err }` | `SC.verifyScript(unlock, lock, { tx, satoshis })` |
| | `CustomScriptHelper.getPreimage()` | BIP143 preimage | `bsv.CustomScriptHelper.getPreimage(tx, 0, script, sats)` |
| **Custom Scripts** | `CustomScriptHelper` | Script utilities — **all methods are static**, do not instantiate | `bsv.CustomScriptHelper.createDataScript(data)` |
| | `createSignature()` | Manual signature | `bsv.CustomScriptHelper.createSignature(tx, key, 0, script, sats)` |
| | `createMultisigScript()` | Multi-signature | `bsv.CustomScriptHelper.createMultisigScript(2, [pk1, pk2])` |
| **Debug Tools** | `SmartContract.examineStack()` | Analyze script | `SmartContract.examineStack(script)` |
| | `interpretScript()` | Execute script | `SmartContract.interpretScript(script)` |
| | `getScriptMetrics()` | Performance data | `SmartContract.getScriptMetrics(script)` |
| **Security (opt-in)** | `SmartVerify.smartVerify()` | Hardened verify with strict input validation — call explicitly; default `signature.verify()` does NOT route through this | `bsv.SmartVerify.smartVerify(msgHash, sig, pubkey)` |
| | `EllipticFixed.sign()` | Canonicalized signing wrapper over the `@noble` secp256k1 backend | `bsv.EllipticFixed.sign(hash, privateKey)` |

> 💡 **Tip:** All methods include comprehensive error handling and validation. See [documentation links](#documentation) for detailed guides.

## 📚 **Quick Start Examples**

### 🔧 **Basic Development** (~1.05MB total)
```html
<script src="https://unpkg.com/@smartledger/bsv@8.3.1/bsv.min.js"></script>
<script src="https://unpkg.com/@smartledger/bsv@8.3.1/bsv-script-helper.min.js"></script>
<script>
  const privateKey = new bsv.PrivateKey();
  const utxos = new bsv.SmartContract.UTXOGenerator().createRealUTXOs(2, 100000);
</script>
```

### 🔒 **Smart Contract Development** (~1.2MB total — each bundle re-embeds core BSV)
```html
<script src="https://unpkg.com/@smartledger/bsv@8.3.1/bsv.min.js"></script>
<script src="https://unpkg.com/@smartledger/bsv@8.3.1/bsv-covenant.min.js"></script>
<script src="https://unpkg.com/@smartledger/bsv@8.3.1/bsv-smartcontract.min.js"></script>
<script>
  const covenant = bsv.SmartContract.createCovenantBuilder()
    .extractField('amount').push(50000).greaterThanOrEqual().verify().build();
  const debugInfo = bsv.SmartContract.examineStack(script);
</script>
```

### 🆕 **Legal & Identity Development** (~2.55MB total — each bundle re-embeds core BSV)
```html
<script src="https://unpkg.com/@smartledger/bsv@8.3.1/bsv.min.js"></script>
<script src="https://unpkg.com/@smartledger/bsv@8.3.1/bsv-ltp.min.js"></script>
<script src="https://unpkg.com/@smartledger/bsv@8.3.1/bsv-gdaf.min.js"></script>
<script>
  // Legal Token Protocol
  const result = bsv.LTP.createRightToken({
    type: bsv.LTP.Right.RightTypes.PROPERTY_TITLE,
    owner: ownerDID, jurisdiction: 'us_delaware'
  }, key);
  
  // Digital Identity
  const credential = bsv.createEmailCredential(issuerDID, subjectDID, 'user@example.com', key);
</script>
```

### 🆕 **Security & Cryptography** (~1.22MB total)
```html
<script src="https://unpkg.com/@smartledger/bsv@8.3.1/bsv.min.js"></script>
<script src="https://unpkg.com/@smartledger/bsv@8.3.1/bsv-security.min.js"></script>
<script src="https://unpkg.com/@smartledger/bsv@8.3.1/bsv-shamir.min.js"></script>
<script>
  // Threshold Cryptography
  const shares = bsv.Shamir.split('my_secret_key', 3, 5); // 5 shares, any 3 recover
  
  // Enhanced Security
  const verified = bsvSecurity.SmartVerify.smartVerify(hash, signature, publicKey);
</script>
```

### 🎯 **Everything Bundle** (~1.02MB)
```html
<script src="https://unpkg.com/@smartledger/bsv@8.3.1/bsv.bundle.js"></script>
<script>
  // Everything available immediately
  const shares = bsv.Shamir.split('secret', 3, 5);            // Shamir Secret Sharing
  const did = bsv.createDID(publicKey);                       // Digital Identity
  const token = bsv.LTP.createRightToken({ /* ... */ }, key); // Legal Tokens
  const covenant = bsv.SmartContract.createCovenantBuilder(); // Smart Contracts
</script>
```

## 🎯 **Key Features**

### 🚀 **Unique Capabilities** (Only Bitcoin Library with These Features)
- ✅ **Legal Token Protocol**: Compliant tokenization of real-world assets → [Legal Guide](docs/advanced/LEGAL_TOKEN_PROTOCOL.md)
- ✅ **Digital Identity Framework**: W3C Verifiable Credentials and DIDs → [Identity Guide](docs/technical/GDAF_DEVELOPER_INTERFACE.md)
- ✅ **Threshold Cryptography**: Shamir Secret Sharing for secure key management → [Cryptography Guide](docs/technical/SHAMIR_INTEGRATION_SUMMARY.md)
- ✅ **Complete Smart Contract Suite**: 23+ production-ready covenant features → [SmartContract Guide](docs/advanced/SMART_CONTRACT_GUIDE.md)

### 💼 **Core Library Excellence**
- ✅ **Complete BSV API**: Full Bitcoin SV blockchain operations → [API Reference](#-api-reference)  
- ✅ **Opt-in security helpers**: `bsv.SmartVerify` and `bsv.EllipticFixed` add input validation and low-`s` canonicalization on top of standard verification — **not on the default verify path**, see [Security](#-security)
- ✅ **Browser + Node.js**: Universal compatibility with proper polyfills → [Loading Options](#-16-loading-options---choose-your-approach)
- ✅ **TypeScript Ready**: Complete type definitions included
- ✅ **Ultra-Low Fees**: 0.01 sats/byte configuration (91% fee reduction)

### 🛠️ **Advanced Development Tools**
- 🔧 **JavaScript-to-Script**: High-level covenant development with 121 opcode mapping → [Covenant Guide](docs/advanced/ADVANCED_COVENANT_DEVELOPMENT.md)
- 🔧 **UTXO Generator**: Create authentic test UTXOs for development → [UTXO Guide](docs/advanced/UTXO_MANAGER_GUIDE.md)
- 🔧 **Preimage Parser**: Complete BIP-143 field extraction and manipulation → [Preimage Tools](https://github.com/codenlighten/smartledger-bsv/tree/main/examples/preimage)
- 🔧 **Debug Framework**: Script interpreter, stack examiner, and optimizer → [Debug Examples](https://github.com/codenlighten/smartledger-bsv/blob/main/tests/smartcontract-test.html)
- 🔧 **PUSHTX Integration**: nChain techniques for advanced covenant patterns → [PUSHTX Insights](docs/pushtx-key-insights.md)

### 📦 **Flexible Architecture** 
- 📦 **16 Modular Options**: Load only what you need (32KB to 1039KB) → [Loading Strategy](#-16-loading-options---choose-your-approach)
- 📦 **Standalone Modules**: Independent legal, identity, and crypto modules → [Standalone Test](https://github.com/codenlighten/smartledger-bsv/blob/main/tests/standalone-modules-test.html)
- 📦 **Complete Bundle**: Everything in one file for convenience → [Bundle Demo](https://github.com/codenlighten/smartledger-bsv/blob/main/tests/bundle-demo.html)
- 📦 **CDN Ready**: All modules available via unpkg and jsDelivr
- 📦 **Webpack Optimized**: Tree-shakeable and build-tool friendly

## ⚡ **Installation & Usage**

> 💡 **Quick Start**: Jump to [2-Minute Quick Start](#-2-minute-quick-start) for instant setup examples

### NPM Installation
```bash
npm install @smartledger/bsv
```

> 📖 **Next Steps**: After installation, see [Loading Options](#-16-loading-options---choose-your-approach) to choose your distribution method

### Upgrading to v8.0.0 (Breaking Changes)

8.0.0 moved the defaults onto BSV as the network actually runs it. Two changes
need action.

**1. `verify()` with no flags now means BSV mainnet, not "no rules".**

```javascript
interp.verify(sig, pubkey, tx, nin)          // was: Bitcoin 2015; now: current mainnet
interp.verify(sig, pubkey, tx, nin, 0)       // the old behaviour, stated explicitly

// Spending a pre-Chronicle output — state the era of the output being spent,
// because that is the input the caller knows and the library cannot infer.
bsv.Script.Interpreter.mainnetFlags({ afterChronicle: false })
```

**2. Two flag constants changed numeric value.** The node assigns `1<<18` and
`1<<19` to `SCRIPT_GENESIS` and `SCRIPT_UTXO_AFTER_GENESIS`, so ours had to move:

```
SCRIPT_ENABLE_MONOLITH_OPCODES   1<<18 → 1<<11
SCRIPT_ENABLE_MAGNETIC_OPCODES   1<<19 → 1<<12
```

Code using the **named constants** is unaffected. Code that **persisted or
hardcoded the numbers** must be updated: `262144` no longer means "Monolith
opcodes", it now means `SCRIPT_GENESIS`, so a stored value silently selects a
different era model.

Also in 8.0.0: a signature carrying `SIGHASH_CHRONICLE` outside Chronicle is
rejected rather than reinterpreted, and `MAX_OPS_PER_SCRIPT` is BSV's 500 rather
than Bitcoin Core's 201. Full details in the
[CHANGELOG](./CHANGELOG.md#800---2026-08-13).

### Upgrading to v5.0.0 (Breaking Changes)

v5.0.0 hardens the cryptography. Most apps need **no code changes** — the
breaking changes only affect data produced by older versions:

- **Shamir shares.** `Shamir.split()` now returns the **v2 share format**
  (backed by a vetted GF(2⁸) engine). Shares created with ≤ 4.x still
  reconstruct — `Shamir.combine()` and `Shamir.verifyShare()` auto-detect and
  accept legacy shares for recovery. No flag needed.
- **VC-JWT signatures.** Tokens are now signed and verified as JOSE-standard
  **IEEE P1363** (`r||s`) instead of DER, so they interoperate with `jose`,
  `jsonwebtoken`, etc. Tokens **issued by ≤ 4.6.0 are DER-encoded** and will
  fail verification by default — pass `{ allowLegacyDER: true }` while you
  re-issue:
  ```javascript
  const result = await bsv.VcJwt.verifyVcJwt(oldToken, {
    didResolver,
    allowLegacyDER: true // accept ≤ 4.6.0 DER-signed tokens during migration
  });
  ```
- **VC-JWT algorithm pinning.** `verifyVcJwt` rejects any token whose `alg` is
  outside `['ES256','ES256K']` (override via `opts.allowedAlgs`) and binds the
  key's curve to the algorithm — defense against alg-substitution attacks.
- **Browser bundles changed size.** The full bundles ship a real `crypto`
  polyfill so Shamir can source a CSPRNG. Sizes have moved since; `bsv.min.js` is
  ~1039KB at 8.3.0, after the ~20% reduction in 8.0.0. The dedicated
  single-feature module bundles are unaffected.

Full details in the [CHANGELOG](./CHANGELOG.md#500---2026-06-13).

### Node.js Usage
```javascript
const bsv = require('@smartledger/bsv');

// Basic transaction
const privateKey = new bsv.PrivateKey();
const publicKey = privateKey.toPublicKey();
const address = privateKey.toAddress();

// SmartContract debugging
const script = bsv.Script.fromASM('OP_1 OP_2 OP_ADD OP_3 OP_EQUAL');
const metrics = bsv.SmartContract.getScriptMetrics(script);
const stackInfo = bsv.SmartContract.examineStack(script);

// Covenant development — see bsv.SmartContract for the covenant stack
const lock = bsv.SmartContract.perpetualCovenant(500);
const { ok, err } = bsv.SmartContract.verifyScript(unlockScript, lock, { tx, satoshis });
```

### Browser CDN (Choose Your Loading Strategy)

#### 1. **Minimal Setup** - Core + Script Helper (~1.05MB)
```html
<script src="https://unpkg.com/@smartledger/bsv@8.3.1/bsv.min.js"></script>
<script src="https://unpkg.com/@smartledger/bsv@8.3.1/bsv-script-helper.min.js"></script>
<script>
  const tx = new bsv.Transaction();
  const sig = bsvScriptHelper.createSignature(tx, privateKey, 0, script, satoshis);
</script>
```

#### 2. **DeFi Development** - Core + Covenants + Debug (~1.2MB — each bundle re-embeds core BSV)
```html
<script src="https://unpkg.com/@smartledger/bsv@8.3.1/bsv.min.js"></script>
<script src="https://unpkg.com/@smartledger/bsv@8.3.1/bsv-covenant.min.js"></script>
<script src="https://unpkg.com/@smartledger/bsv@8.3.1/bsv-smartcontract.min.js"></script>
<script>
  const lock = bsv.SmartContract.perpetualCovenant(500);
  const debugInfo = bsv.SmartContract.interpretScript(script);
  const optimized = bsv.SmartContract.optimizeScript(script);
</script>
```

#### 3. **Security First** - Core + Enhanced Security (~1.05MB)
```html
<script src="https://unpkg.com/@smartledger/bsv@8.3.1/bsv.min.js"></script>
<script src="https://unpkg.com/@smartledger/bsv@8.3.1/bsv-security.min.js"></script>
<script>
  const verified = bsvSecurity.SmartVerify.smartVerify(hash, signature, publicKey);
  const enhanced = bsvSecurity.EllipticFixed.sign(hash, privateKey);
</script>
```

#### 4. **Everything Bundle** - One File Solution (~1.02MB)
```html
<script src="https://unpkg.com/@smartledger/bsv@8.3.1/bsv.bundle.js"></script>
<script>
  // Everything available under the bsv namespace
  const key = bsv.PrivateKey.fromRandom();
  const lock = bsv.SmartContract.perpetualCovenant(500);
  const message = new bsv.Message('Hello BSV');
  const encrypted = new bsv.ECIES()
    .privateKey(key)
    .publicKey(recipientPublicKey)
    .encrypt('secret');
</script>
```

## 🔨 Basic Usage

### Creating Transactions
```javascript
const bsv = require('@smartledger/bsv');

// Create transaction with optimized fees
const transaction = new bsv.Transaction()
  .from({
    txId: 'prev_tx_id',
    outputIndex: 0,
    script: 'prev_locking_script',
    satoshis: 100000
  })
  .to('1A1zP1eP5QGefi2DMPTfTL5SLmv7DivfNa', 95000)
  .feePerKb(10) // Ultra-low fee: 0.01 sats/byte
  .sign(privateKey);

console.log('Transaction ID:', transaction.id);
console.log('Fee rate: 0.01 sats/byte (91% reduction)');
```

### UTXO Management
```javascript
// Advanced UTXO state management
const utxoManager = {
  createWithChange: (inputs, outputs, changeAddress) => {
    const tx = new bsv.Transaction()
      .from(inputs)
      .to(outputs.address, outputs.amount)
      .change(changeAddress)
      .feePerKb(10);
    
    // Automatic change output creation and UTXO state update
    return tx;
  }
};
```

## 🆕 **Advanced Features** (Unique to SmartLedger-BSV)

### ⚖️ Legal Token Protocol (LTP)
```javascript
const bsv = require('@smartledger/bsv');

// Create a property-rights token. `type` must be one of LTP.Right.RightTypes —
// an unrecognized type is rejected rather than silently accepted.
const result = bsv.LTP.createRightToken({
  type: bsv.LTP.Right.RightTypes.PROPERTY_TITLE,
  owner: ownerDID,
  jurisdiction: 'us_delaware',
  legalDescription: 'Lot 15, Block 3, Subdivision ABC'
}, issuerPrivateKey);

console.log(result.success);            // true
console.log(result.token.tokenHash);    // hash committed by the token's proof

// Obligation tokens
const obligation = bsv.LTP.Obligation.prepareObligationToken({
  obligationType: 'payment',
  amount: 100000, // satoshis
  dueDate: '2026-12-31',
  creditor: creditorDID,
  debtor: debtorDID
});

// Validate claim data against a registered schema
// (schema names come from bsv.LTP.Claim.getSchemaNames())
const validation = bsv.validateLegalClaim(claimData, schemaType);
```

### 🌐 Global Digital Attestation Framework (GDAF)
```javascript
// Simple Interface - Direct from bsv object
const issuerDID = bsv.createDID(privateKey.toPublicKey());

// Create W3C Verifiable Credentials
const emailCredential = bsv.createEmailCredential(
  issuerDID, subjectDID, 'user@example.com', issuerPrivateKey
);

// Generate zero-knowledge proofs
const proof = bsv.generateSelectiveProof(
  emailCredential,
  ['credentialSubject.verified'], 
  nonce
);

// Verify age without revealing exact age
const ageProof = bsv.generateAgeProof(credential, 18);
const isAdult = bsv.verifyAgeProof(ageProof, 18, issuerDID);

// Advanced Interface for complex applications
const gdaf = new bsv.GDAF({
  anchor: { network: 'mainnet' },
  attestationSigner: { customConfig: true }
});
```

### 🔐 Shamir Secret Sharing
```javascript
// Split a secret into threshold shares.
// Signature is split(secret, threshold, shares) — THRESHOLD FIRST.
const secret = 'my_private_key_backup';
const shares = bsv.Shamir.split(secret, 3, 5); // 5 shares, any 3 reconstruct

console.log('Generated', shares.length, 'shares');

// Reconstruct from any 3 shares
const reconstructed = bsv.Shamir.combine([shares[0], shares[2], shares[4]]);
console.log('Secret recovered:', reconstructed === secret); // true

// Validate share integrity
shares.forEach((share, i) => {
  console.log(`Share ${i + 1} valid:`, bsv.Shamir.verifyShare(share));
});

// Use cases: Key backup, multi-party security, recovery systems
```

## 🔒 Covenant Framework

### JavaScript-to-Bitcoin Script Translation
```javascript
const { CovenantBuilder, CovenantTemplates } = require('@smartledger/bsv/lib/smart_contract');

// Write covenant logic in JavaScript
const valueLock = CovenantTemplates.valueLock('50c3000000000000');
const script = valueLock.build();
console.log(script.cleanedASM); 
// Output: OP_SIZE 34 OP_SUB OP_SPLIT OP_DROP OP_8 OP_SPLIT OP_DROP 50c3000000000000 OP_EQUALVERIFY OP_1

// Custom covenant builder
const custom = new CovenantBuilder()
  .comment('Validate preimage value field')
  .extractField('value')
  .push('50c3000000000000')
  .equalVerify()
  .push(1);
```

### Complete Opcode Mapping (116 Opcodes)
```javascript
const SmartContract = require('@smartledger/bsv/lib/smart_contract');

// Simulate script execution in JavaScript
const result = SmartContract.simulateScript(['OP_1', 'OP_2', 'OP_ADD', 'OP_3', 'OP_EQUAL']);
console.log(result.finalStack); // ['01'] - TRUE

// Get comprehensive opcode information
const opcodes = SmartContract.getOpcodeMap();
console.log(Object.keys(opcodes).length); // 116 opcodes mapped
```

### BIP143 Preimage Parsing
```javascript
const { CovenantPreimage } = require('@smartledger/bsv/lib/covenant-interface');

// Enhanced preimage parsing with field-by-field access
const preimage = new CovenantPreimage(preimageHex);

console.log('Version:', preimage.nVersionValue);      // uint32 accessor
console.log('Amount:', preimage.amountValue);         // BigInt accessor  
console.log('Valid structure:', preimage.isValid);    // Boolean validation
```

### PUSHTX Covenants (nChain WP1605)
```javascript
const bsv = require('@smartledger/bsv')
const SC = bsv.SmartContract
SC.enableGenesis()                              // OP_PUSH_TX needs post-Genesis limits

// Bare OP_PUSH_TX authenticator: unlocks only with the (grindable) preimage of
// THIS transaction. Built from the nChain `a=k=1` public-key construction —
// the script generates an ECDSA signature in-script from the pushed preimage
// (r=Gx, s=(e+Gx) mod n) and verifies it with OP_CHECKSIG, which only passes
// if the preimage matches this very spend.
const authLock = SC.PushTx.authenticator()

// Value covenant — force spend outputs to match a specific hashOutputs.
const requiredOutputs = [/* bsv.Transaction.Output objects */]
const valueLock = SC.PushTx.valueCovenant(SC.PushTx.hashOutputs(requiredOutputs))
```

### Perpetually Enforcing Locking Scripts (PELS)
```javascript
// Self-replicating covenant: every spend must recreate the same script
// (value − fee), reading its own code out of the authenticated preimage's
// scriptCode field. No self-hash circularity.
const pels = SC.perpetualCovenant(500)   // fee in satoshis deducted each hop
```

### Ownership Tokens (NFT)
```javascript
// Stateful ownership token. Owner is carried as on-chain state (HASH160 of the
// owner's public key); transfer requires the current owner's ECDSA SIGNATURE over
// the spend (OP_CHECKSIG) and rewrites state, perpetuating the token code across
// the chain of spends. The signature commits to the chosen next owner, so a
// mempool watcher cannot redirect a pending transfer (no hash-lock front-running).
const ownerHash = SC.Token.ownerId(currentOwnerKey) // = HASH160(pubkey)
const token = SC.ownershipToken(500, ownerHash)
// To spend it forward to `nextOwnerHash`, the current owner signs:
//   tokenInput.setScript(SC.Token.unlockTransfer(currentOwnerKey, nextOwnerHash, spendTx, sats, token))

// Pluggable ownership — the SAME covenant, owned by an m-of-n group. Ownership is
// committed as a 20-byte hash either way, so the transfer plumbing is identical.
const ms = SC.Authorizers.multisig(2, 3)
const groupToken = SC.Token.ownershipToken(500, ms.commit([pkA, pkB, pkC]), ms)
// transfer requires any 2 of the 3 keys:
//   SC.Token.unlockTransfer({ keys: [pkA, pkB, pkC], signWith: [skA, skC] },
//                           nextOwnerHash, spendTx, sats, groupToken, { auth: ms })
// Custom schemes: SC.Authorizers.predicate({ commit, emit, unlockArgs }).

// N-output: recreate the token alongside other outputs (payments, change, data).
// The spender reveals the surrounding output bytes; the covenant binds them all.
const multi = SC.Token.ownershipTokenMulti(ownerHash)
//   SC.Token.unlockTransferMulti(currentOwnerKey, nextOwnerHash, spendTx, sats, multi,
//     { before: serializedOutputsBeforeToken, after: serializedOutputsAfterToken, tokenValue: le8(value) })
```

### End-to-end verification

```javascript
// Any locking script can be verified end-to-end through Script.Interpreter,
// with the consensus flags this library was tested against.
const ok = SC.verifyScript(unlockScript, lockingScript, tx, inputIndex, satoshis)
```

### Consensus defaults — BSV mainnet, no flags required (8.0.0+)

**Since 8.0.0 you do not opt in to BSV.** `verify()` with no flags means
current BSV mainnet consensus, and `MAX_OPS_PER_SCRIPT` is BSV's 500 rather
than Bitcoin Core's 201. Earlier versions defaulted to a 2015-era Bitcoin
rule set and required an explicit call to reach post-Genesis behaviour; that
is no longer the case.

```javascript
const bsv = require('@smartledger/bsv');
const interp = new bsv.Script.Interpreter();

// Current BSV mainnet — this is the default.
const ok = interp.verify(unlockScript, lockScript, tx, 0, undefined, satoshisBN);

// Spending a pre-Chronicle output: state the era of the output you are spending,
// because the library cannot infer it.
const flags = bsv.Script.Interpreter.mainnetFlags({ afterChronicle: false });
const ok2 = interp.verify(unlockScript, lockScript, tx, 0, flags, satoshisBN);

// The pre-8.0.0 "no rules" behaviour, if you genuinely want it, is now explicit:
const ok3 = interp.verify(unlockScript, lockScript, tx, 0, 0, satoshisBN);
```

**Covenants need no special setup.** The element and script-number caps are
derived from the era flags, not from the `MAX_SCRIPT_ELEMENT_SIZE` static — which
still reads 520 because it is only the pre-Genesis fallback. An OP_PUSH_TX
covenant pushing a ~585-byte preimage verifies under the defaults:

```javascript
const interp = new bsv.Script.Interpreter();
const ok = interp.verify(unlockScript, lockScript, tx, 0, undefined, satoshisBN);
```

> ⚠️ **`Interpreter.useGenesisLimits()` is legacy and should not be used to enable
> covenants.** It cannot enable post-Genesis arithmetic — that comes from the era
> flags — and because it mutates process-wide statics it *weakens* pre-Genesis
> validation: raising `MAXIMUM_ELEMENT_SIZE` turns 15 of the reference node's 22
> `SCRIPTNUM_OVERFLOW` vectors into false accepts. If you must call it, capture
> and restore the caps around it with `Interpreter.getLimits()` /
> `Interpreter.setLimits()`.

## 🛠️ Custom Scripts

### Multi-signature Scripts
```javascript
const { CustomScriptHelper } = require('@smartledger/bsv/lib/custom-script-helper');
const helper = new CustomScriptHelper();

// Create 2-of-3 multisig script
const multisigScript = helper.createMultisigScript([
  publicKey1, publicKey2, publicKey3
], 2);
```

### Timelock Contracts
```javascript
// Create timelock script (block height)
const timelockScript = helper.createTimelockScript(
  publicKey,
  750000, // block height
  'block'
);
```

## 📁 Examples

### Basic Examples
- **[Advanced Covenant Demo](advanced_covenant_demo.js)**: Complete covenant showcase
- **[Custom Script Tests](test/custom_script_signature_test.js)**: Script development examples
- **[Covenant Resolution](covenant_manual_signature_resolved.js)**: Working covenant patterns

### Documentation
- **[Advanced Covenant Development](ADVANCED_COVENANT_DEVELOPMENT.md)**: Complete BIP143 + PUSHTX guide
- **[Custom Script Development](CUSTOM_SCRIPT_DEVELOPMENT.md)**: Script creation patterns
- **[Covenant Development Resolved](COVENANT_DEVELOPMENT_RESOLVED.md)**: Problem solutions

## 🔧 CDN Bundles

See the **[16 Loading Options](#-16-loading-options---choose-your-approach)**
table near the top for the full list of bundles with current sizes and
canonical `unpkg.com/@smartledger/bsv@8.3.1/...` URLs.

## 🔐 Security

### What's actually in the box

| Surface | Status | Notes |
|---------|--------|-------|
| secp256k1 primitives | `@noble/curves` | `elliptic` was removed entirely — it is not a dependency and is not in the bundles. The Noble suite carries a published Cure53 audit. |
| Default `transaction.verify()` / `signature.verify()` / `Message().verify()` | uses BSV's own `lib/crypto/ecdsa.js` | This path does **not** import elliptic and is **not** routed through `SmartVerify` or `EllipticFixed`. |
| `bsv.SmartVerify` (opt-in helper) | available | Hardened standalone verify: rejects `r=0`, `s=0`, `r≥n`, `s≥n`; canonicalizes `s` to low half. Built on BSV's own `BN`/`ECDSA`. You must call it explicitly. |
| `bsv.EllipticFixed` (opt-in helper) | available | An elliptic-*compatible* secp256k1 surface — the name is kept for API compatibility, but it is backed by `@noble/curves`. Adds the same input checks plus low-`s` on sign. |
| `signature.validate()` / `isCanonical()` / `toCanonical()` | available | Real methods on `bsv.Signature`. |
| DER canonicalization on TX signing | available | BSV's signature path produces low-`s` DER by default. |
| BIP143 preimage utilities | available | `lib/smart_contract/preimage.js` and `examples/preimage/`. |

### Using the opt-in helpers

```js
const bsv = require('@smartledger/bsv')

// Hardened verify (recommended if you accept signatures from untrusted sources):
const ok = bsv.SmartVerify.smartVerify(msgHashBuffer, derSigBuffer, publicKey)

// Or call BSV's own ECDSA via the standard API (no SmartVerify hardening):
const okDefault = bsv.crypto.ECDSA.verify(msgHashBuffer, signature, publicKey)
```

### What this library does **not** claim

- It does not silently route every `verify()` call through `SmartVerify`. If you want the strict input validation on every verification, call `SmartVerify` explicitly or wrap `bsv.crypto.ECDSA.prototype.verify`.
- It no longer depends on `elliptic` at all. `lib/crypto/elliptic-fixed.js` keeps the name for API compatibility but is backed by `@noble/curves`; it adds input validation and low-`s` canonicalization on top of that.
- It does not turn `bsv.isHardened = true` into an automatic guarantee. That property indicates the hardening helpers ship; whether they're used is up to your code.

v4.0.0 fixed three critical, exploitable vulnerabilities in the GDAF
credential-verification path (`_canonicalizeJSON` excluded nested claims
from the signed hash; `_verifySignature` always returned truthy regardless
of validity; `verificationMethod` was not bound to the credential issuer)
and removed a live mainnet WIF that had been shipping inside the
package. **All ≤ 3.4.5 releases should be considered untrustworthy for
credential verification and must be upgraded to 4.x.** See
[CHANGELOG `## [4.0.0]`](./CHANGELOG.md#400---2026-05-31) for details
and [SECURITY.md](./SECURITY.md) for the supported-versions policy.

## 📝 Changelog

The authoritative version history lives in [CHANGELOG.md](./CHANGELOG.md).
Highlights of the current line:

- **[8.3.0](./CHANGELOG.md#830---2026-08-16)** — BRC-220 **NotaryHash**:
  signed-hash notarization, SPV-verifiable certificates, a pluggable signature
  suite registry, and RFC 6962 Merkle trees for batch mode.
- **[8.2.0](./CHANGELOG.md#820---2026-08-15)** — RFC 8785 (JCS) canonical JSON
  extracted to `lib/util/jcs.js`, so GDAF signatures verify under other
  implementations.
- **[8.1.0](./CHANGELOG.md#810---2026-08-13)** — `useGenesisLimits()` edge-case
  fix.
- **[8.0.0](./CHANGELOG.md#800---2026-08-13)** — **breaking.** Measured against
  the reference node's own consensus vectors (1483/1483, from an initial
  1426/1483 with 21 false accepts). `verify()` with no flags now means BSV
  mainnet; `SCRIPT_ENABLE_MONOLITH_OPCODES` and `SCRIPT_ENABLE_MAGNETIC_OPCODES`
  changed numeric value. See [Upgrading](#upgrading-to-v800-breaking-changes).
- **[4.0.0](./CHANGELOG.md#400---2026-05-31)** — **security release.** Fixed
  three exploitable credential-verification flaws in GDAF/VC-JWT and removed a
  live mainnet WIF that shipped inside prior versions. All ≤ 3.4.5 should be
  considered untrustworthy.

Earlier entries are preserved in `CHANGELOG.md`.

---

## 📚 **Complete Documentation**

### 🚀 Getting Started
- **[2-Minute Quick Start](#-2-minute-quick-start)** — npm, CDN, browser setup
- **[16 Loading Options](#-16-loading-options---choose-your-approach)** — pick the bundles you need
- **[API Reference](#-api-reference)** — quick method lookup
- **[CHANGELOG](./CHANGELOG.md)** — version history (current line: 4.x)
- **[SECURITY.md](./SECURITY.md)** — supported-versions policy + how to report

### 🔒 Smart Contracts & Covenants
- **[Smart Contract Guide](docs/advanced/SMART_CONTRACT_GUIDE.md)** — comprehensive covenant development
- **[Advanced Covenant Development](docs/advanced/ADVANCED_COVENANT_DEVELOPMENT.md)** — full BIP-143 + OP_PUSH_TX guide
- **[Custom Script Development](docs/advanced/CUSTOM_SCRIPT_DEVELOPMENT.md)** — multi-sig, timelock, conditional patterns
- **[UTXO Manager Guide](docs/advanced/UTXO_MANAGER_GUIDE.md)** — UTXO management + mock generation
- **[Covenant Development Resolved](docs/COVENANT_DEVELOPMENT_RESOLVED.md)** — solutions to common issues
- **[PUSHTX Key Insights](docs/pushtx-key-insights.md)** — nChain WP1605 implementation notes
- **[SmartContract Development Guide](docs/SMART_CONTRACT_DEVELOPMENT_GUIDE.md)** — end-to-end workflow

### 🆕 Advanced Features
- **[Legal Token Protocol](docs/advanced/LEGAL_TOKEN_PROTOCOL.md)** — property rights & obligation tokens (LTP)
- **[GDAF Developer Interface](docs/technical/GDAF_DEVELOPER_INTERFACE.md)** — Global Digital Attestation Framework
- **[Shamir Integration Summary](docs/technical/SHAMIR_INTEGRATION_SUMMARY.md)** — threshold cryptography & key backup

### 📊 Technical References
- **[Module Reference](docs/MODULE_REFERENCE_COMPLETE.md)** — every shipped module
- **[Documentation Review Report](docs/DOCUMENTATION_REVIEW_REPORT.md)** — internal doc audit (historical)
- **[API Reference (docs/api/)](https://github.com/codenlighten/smartledger-bsv/tree/main/docs/api)** — per-module API docs

### 📋 Examples & Demos
- **[Examples Directory](https://github.com/codenlighten/smartledger-bsv/tree/main/examples)** — runnable code samples
- **[Demos Directory](https://github.com/codenlighten/smartledger-bsv/tree/main/demos)** — interactive HTML & Node demos
- **[Test Suite](https://github.com/codenlighten/smartledger-bsv/tree/main/test)** — covenant verification specs, CLI smoke, full mocha suite

> **Note:** `examples/` and `demos/` live in the repo but are not shipped
> in the npm tarball (as of v3.4.4). Browse them on GitHub.

```bash
# Try the interactive demo:
npm run demo               # terminal walkthrough
npm run demo:web           # open demos/smart_contract_demo.html
npm run demo:covenant      # covenant builder example
```

### 🔗 Recommended learning path

1. **Start** — [2-Minute Quick Start](#-2-minute-quick-start)
2. **Practice** — [Examples Directory](https://github.com/codenlighten/smartledger-bsv/tree/main/examples)
3. **Build** — [Custom Script Development](docs/advanced/CUSTOM_SCRIPT_DEVELOPMENT.md)
4. **Advanced** — [Advanced Covenant Development](docs/advanced/ADVANCED_COVENANT_DEVELOPMENT.md)
5. **Production** — [SECURITY.md](./SECURITY.md) + [v4.0.0 CHANGELOG](./CHANGELOG.md#400---2026-05-31) (mandatory read before mainnet credentials)

---

## 📄 **License**

This project is licensed under the MIT License — see the [LICENSE](LICENSE) file for details.

## 🤝 **Contributing**

Issues, PRs, and security reports welcome at
[github.com/codenlighten/smartledger-bsv](https://github.com/codenlighten/smartledger-bsv).
For security vulnerabilities, follow the disclosure process in
[SECURITY.md](./SECURITY.md) rather than opening a public issue.

## 🏢 **Enterprise Support**

- **GitHub**: [github.com/codenlighten/smartledger-bsv](https://github.com/codenlighten/smartledger-bsv)
- **NPM (scoped)**: [@smartledger/bsv](https://www.npmjs.com/package/@smartledger/bsv)
- **NPM (unscoped)**: [smartledger-bsv](https://www.npmjs.com/package/smartledger-bsv)
- **Issues**: [GitHub Issues](https://github.com/codenlighten/smartledger-bsv/issues)
- **Security**: [SECURITY.md](./SECURITY.md)

---

**SmartLedger-BSV v8.3.1** — *Complete Bitcoin SV Development Framework*

Built with ❤️ for the Bitcoin SV ecosystem • 16 Loading Options • Interpreter-Verified Covenants
