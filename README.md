# SmartLedger BSV v3.0
### Security-Hardened Bitcoin SV Library

[![npm version](https://img.shields.io/npm/v/smartledger-bsv.svg)](https://www.npmjs.com/package/smartledger-bsv)
[![License: MIT](https://img.shields.io/badge/License-MIT-yellow.svg)](https://opensource.org/licenses/MIT)
[![Node.js CI](https://img.shields.io/badge/Node.js-✓-green.svg)]()
[![Browser Compatible](https://img.shields.io/badge/Browser-✓-green.svg)]()
[![Security Hardened](https://img.shields.io/badge/Security-Hardened-red.svg)]()

A **complete drop-in replacement** for BSV@1.5.6 with critical security vulnerabilities resolved. This library eliminates npm security warnings while maintaining 100% API compatibility with the original BSV library.

## 🚀 Quick Start

```bash
npm install smartledger-bsv
```

```javascript
// Drop-in replacement - no code changes required
const bsv = require('smartledger-bsv');

const privateKey = bsv.PrivateKey();
const message = bsv.Message('hello world');
const signature = message.sign(privateKey);
```

## 🔒 Security Enhancements

### Critical Vulnerabilities Fixed
- **Elliptic Curve Vulnerability**: Updated from `elliptic@6.5.4` to `elliptic@6.6.1`
- **Zero Parameter Attack Protection**: Rejects malicious signatures with r=0 or s=0
- **Signature Malleability Prevention**: Enforces canonical signatures (s ≤ n/2)
- **Range Validation**: Validates elliptic curve parameters within proper bounds

### Enhanced Security Features
```javascript
// Access enhanced security validation
const { SmartLedger, SmartVerify } = bsv;

// Strict signature verification
const isValid = SmartVerify.verifySignature(signature, hash, publicKey);

// Check signature properties
const signature = new bsv.Signature(buffer);
console.log(signature.isCanonical()); // true/false
console.log(signature.validate());    // comprehensive validation
```

## 📦 What's Included

### Node.js Support
- Complete BSV library with all modules
- Enhanced security validation
- Zero npm vulnerability warnings
- Full TypeScript definitions included

### Browser Support
- `bsv.min.js` - Main library (349KB)
- `bsv-message.min.js` - Message signing (25KB)  
- `bsv-mnemonic.min.js` - HD wallet support (670KB)
- `bsv-ecies.min.js` - Encryption support (71KB)

### CDN Usage

#### unpkg CDN
```html
<!-- Security-hardened BSV library -->
<script src="https://unpkg.com/smartledger-bsv@3.0.0/bsv.min.js"></script>

<!-- Optional modules -->
<script src="https://unpkg.com/smartledger-bsv@3.0.0/bsv-message.min.js"></script>
<script src="https://unpkg.com/smartledger-bsv@3.0.0/bsv-mnemonic.min.js"></script>
<script src="https://unpkg.com/smartledger-bsv@3.0.0/bsv-ecies.min.js"></script>

<!-- Always latest version -->
<script src="https://unpkg.com/smartledger-bsv/bsv.min.js"></script>
```

#### jsDelivr CDN
```html
<script src="https://cdn.jsdelivr.net/npm/smartledger-bsv@3.0.0/bsv.min.js"></script>
<script src="https://cdn.jsdelivr.net/npm/smartledger-bsv@3.0.0/bsv-message.min.js"></script>
<script src="https://cdn.jsdelivr.net/npm/smartledger-bsv@3.0.0/bsv-mnemonic.min.js"></script>
```

#### ES6 Module CDN
```html
<script type="module">
  import bsv from 'https://unpkg.com/smartledger-bsv@3.0.0/bsv.min.js';
  
  const privateKey = new bsv.PrivateKey();
  console.log('BSV Address:', privateKey.toAddress().toString());
</script>
```

## 🧪 Validation & Testing

### Compatibility Testing ✅
- **All 41 Original Tests**: Pass with 100% compatibility
- **Browser Validation**: 14/14 security tests passing
- **Node.js Validation**: Complete API compatibility verified
- **Performance Impact**: <1% overhead from security enhancements

### Security Validation ✅
- Zero parameter attack protection active
- Canonical signature enforcement working  
- Range validation implemented
- Browser/Node.js cross-compatibility confirmed

## 🔄 Migration Guide

**Zero changes required** - this is a true drop-in replacement:

```javascript
// Before (vulnerable)
const bsv = require('bsv');

// After (security-hardened)  
const bsv = require('smartledger-bsv');

// All existing code works unchanged
const tx = new bsv.Transaction()
  .from(utxos)
  .to(address, amount)
  .sign(privateKey);
```

## 📚 API Documentation

This library maintains **100% API compatibility** with BSV@1.5.6. All existing documentation applies:

- [Official BSV Documentation](https://docs.moneybutton.com/docs/bsv-overview.html)
- [GitHub Repository](https://github.com/codenlighten/smartledger-bsv)
- [TypeScript Definitions](./bsv.d.ts)

### Enhanced Security Methods

```javascript
// Enhanced signature validation
const signature = new bsv.Signature(buffer);

// Security checks
signature.isCanonical();     // Check if s ≤ n/2  
signature.validate();        // Comprehensive validation
signature.toCanonical();     // Convert to canonical form

// SmartLedger security namespace
bsv.SmartLedger.version;     // Security patch version
bsv.SmartVerify.verify(...); // Enhanced verification
```

## 🌐 Browser Compatibility

Full browser support with proper Buffer handling and crypto compatibility:

```html
<!DOCTYPE html>
<html>
<head>
  <!-- Using unpkg CDN -->
  <script src="https://unpkg.com/smartledger-bsv@3.0.0/bsv.min.js"></script>
</head>
<body>
<script>
  // Works in all modern browsers
  const privateKey = new bsv.PrivateKey();
  const address = privateKey.toAddress().toString();
  console.log('BSV Address:', address);
  
  // SmartLedger security features available
  console.log('Security Features:', bsv.SmartLedger.securityFeatures);
  console.log('Hardened by:', bsv.SmartLedger.hardenedBy);
</script>
</body>
</html>
```

## 🛠️ Development

### Building from Source

```bash
git clone https://github.com/codenlighten/smartledger-bsv.git
cd smartledger-bsv
npm install

# Build all minified files
NODE_OPTIONS="--openssl-legacy-provider" npm run build-bsv
NODE_OPTIONS="--openssl-legacy-provider" npm run build-message  
NODE_OPTIONS="--openssl-legacy-provider" npm run build-mnemonic
NODE_OPTIONS="--openssl-legacy-provider" npm run build-ecies
```

### Testing

```bash
# Run test suite
npm test

# Check for linting issues
npm run lint

# Generate coverage report
npm run coverage
```

## 🔍 Security Audit

### Vulnerability Resolution
- **Before**: 1 critical, 2 high severity npm audit issues
- **After**: 0 vulnerabilities, clean security audit
- **Elliptic**: Updated to patched version 6.6.1
- **Dependencies**: All dependencies security-reviewed

### Security Features
- Signature malleability protection
- Zero parameter attack prevention  
- Canonical signature enforcement
- Enhanced parameter validation
- Browser security compatibility

## 📄 License

MIT License - see [LICENSE](./LICENSE) file for details.

## 🤝 Contributing

Contributions welcome! Please read our security guidelines and submit pull requests for review.

## ⚠️ Security Disclosure

For security issues, please email security@smartledger.technology rather than using public issue tracker.

---

## About SmartLedger Technology

[SmartLedger Technology](https://smartledger.technology) is committed to providing secure, professional-grade blockchain libraries. This BSV implementation represents our dedication to eliminating security vulnerabilities while maintaining complete compatibility with existing Bitcoin SV applications.

**Trusted by developers worldwide for secure Bitcoin SV applications.**

Visit us at [smartledger.technology](https://smartledger.technology)

---

## Original BSV Documentation

Javascript Bitcoin SV library.

Documentation is available on the [Money Button Documentation Page](https://docs.moneybutton.com/docs/bsv-overview.html).

Changelog
---------
**1.5.0**
* Add build files into repo.

**1.4.0**
* Change default fee to 0.5 sat/byte

**1.3.0**
* Remove limit on OP_RETURN size

**1.1.0**
* Refactor code related to buffers and get rid of bufferUtil
* Deprecate p2sh
* Add .Mnemonic to bsv object

**1.0.0**
* Bump to 1.0 release as per the suggestion of @mathiasrw

**0.30.2**
* Added addSafeData to Transaction.

**0.30.1**
* Enforce buffer check for Electrum ECIES decryption.
* Clean up script folder (no API breaking changes).
* Documentation improvements.

**0.30.0**
* Fix transaction size calculation.

**0.29.2**
* Throw error on invalid hex strings in script

**0.29.1**
* Add support for new OP_RETURN style: buildSafeDataOut and isSafeDataOut (and getData)

**0.27.2**
* Add support for Stress Test Network (STN).

**v0.27.1**
* Replace lodash methods with inline pure javascript methods.

**v0.27.0**
* Remove version guard. This should fix the "two versions of bsv" error that
  people often get. Note that it is poor practice to use incompatible versions
  of bsv. To send objects from one version of the library to another, always
  serialize to a string or buffer first. Do not send objects from one version to
  another. This due to frequent use of "instanceof" inside the library.

**v0.26.5**
* lodash optimization and overall size optimization of bsv.min.js
* fix isFinal
* fix non-dust amount example
* minor ECIES API issue

**v0.26.4**
* Use ECDSA.signWithCalcI(...) convenience method inside Message.

**v0.26.3**
* Add ECDSA.signWithCalcI(...) convenience method.

**v0.26.2**
* Add Mnemonic.fromString(string).
* Add convenience method for ECDSA.signRandomK (mostly for demo purposes).
* Add convenience methods Message.sign and message.verify.
* Move large portions of the documentation to [docs.moneybutton.com](https://docs.moneybutton.com).

**v0.26.1**
* Add .fromRandom() method for Mnemonic.

**v0.26.0**
* Remove the (already deprecated) .derive() method from HDPrivateKey and HDPublicKey. If you rely on this, please switch to .deriveNonCompliantChild(). If you do not already rely on this, you should use .deriveChild() instead.
* Move large portions of the documentation to [docs.moneybutton.com](https://docs.moneybutton.com).
* HDPrivateKey / HDPublicKey toHex() and fromHex()
* HDPrivateKey.fromRandom()
* Remove Base32 (this was only used for cashaddr and is now obsolete).

**v0.25.0**
* Remove support for cashaddr completely. This saves size in the bundle.
* Private key .toString() method now returns WIF, which makes it compatible with the corresponding .fromString(wif) method.
* Private key and public key classes now have toHex() and fromHex(hex) methods.
* Move large portions of the documentation to [docs.moneybutton.com](https://docs.moneybutton.com).
