'use strict'

/* global describe, it */

// BRC-220 certificate. This is validity check 2 of the three the spec requires — proof
// integrity — plus the object a verifier is actually handed.
//
// The tests below concentrate on three things the spec makes explicit and that would fail
// silently if got wrong: the certificate carries FULL blobs even when the chain carries
// digests; the SPV envelope never disturbs proofHash; and proofHash is over the binary
// proof bytes, NOT over the certificate JSON.
//
// The JSON is the reference implementation's. test/notaryhash/reference_certs.js checks
// it against certificates the reference produced; the tests here pin each field's value,
// so a change to one fails by name rather than as a deep-equal diff.

require('chai').should()
var Certificate = require('../../lib/notaryhash/certificate')
var Encoding = require('../../lib/notaryhash/encoding')
var Merkle = require('../../lib/notaryhash/merkle')
var NS = require('../../lib/notaryhash/script')
var Hash = require('../../lib/crypto/hash')
var JCS = require('../../lib/util/jcs')
var deprecate = require('../../lib/util/deprecate')
var golden = require('../data/notaryhash-9.8.0-certs.json')

var PARAMS = {
  format: 'reference',
  mode: 'full',
  algorithm: 'ECDSA-secp256k1',
  hashAlgorithm: 'SHA-256',
  payloadHash: Buffer.alloc(32, 0x11),
  publicKey: Buffer.alloc(33, 0x02),
  signature: Buffer.alloc(64, 0x30),
  createdAt: '2026-08-16T00:00:00.000Z',
  anchor: { txid: 'ab'.repeat(32), blockHeight: 800000 }
}

var SPV = {
  rawTx: 'deadbeef',
  blockHash: 'cc'.repeat(32),
  blockHeight: 800000,
  merkleProof: { index: 0, nodes: ['aa'.repeat(32), '*'] }
}

// An eight-proof batch, and the inclusion proof for leaf 2 of it.
var LEAVES = [0, 1, 2, 3, 4, 5, 6, 7].map(function (i) { return Hash.sha256(Buffer.from('leaf ' + i)) })
var MERKLE = {
  root: Merkle.root(LEAVES),
  leafIndex: 2,
  leafCount: 8,
  path: Merkle.auditPath(LEAVES, 2)
}

function params (overrides) { return Object.assign({}, PARAMS, overrides) }

describe('BRC-220 certificate', function () {
  describe('build', function () {
    it('carries every field the spec requires', function () {
      var cert = Certificate.build(PARAMS)
      Certificate.REQUIRED_FIELDS.forEach(function (field) {
        ;(cert[field] === undefined).should.equal(false, 'missing ' + field)
      })
    })

    it('writes the reference format, field for field', function () {
      var cert = Certificate.build(PARAMS)
      cert.protocol.should.equal('NotaryHash')
      cert.version.should.equal('1.0')
      cert.mode.should.equal('full')
      cert.encoding.should.equal('hex')
      cert.createdAt.should.equal('2026-08-16T00:00:00.000Z')
      cert.anchor.should.deep.equal({
        type: 'direct',
        network: 'bsv-mainnet',
        txid: 'ab'.repeat(32),
        vout: 0,
        blockHeight: 800000,
        blockTime: null
      })
      ;(cert.merkle === undefined).should.equal(true)
    })

    it('takes createdAtUnix, and writes it as the ISO string proofHash covers', function () {
      var fromUnix = Certificate.build(params({ createdAt: undefined, createdAtUnix: 1786838400 }))
      fromUnix.createdAt.should.equal('2026-08-16T00:00:00.000Z')
      fromUnix.proofHash.should.equal(Certificate.build(PARAMS).proofHash)
    })

    it('keeps anchor fields the caller supplies', function () {
      var cert = Certificate.build(params({
        anchor: { txid: 'ab'.repeat(32), vout: 3, network: 'bsv-testnet', blockHeight: 1, blockTime: 2 }
      }))
      cert.anchor.should.deep.equal({
        type: 'direct', network: 'bsv-testnet', txid: 'ab'.repeat(32), vout: 3, blockHeight: 1, blockTime: 2
      })
    })

    it('defaults encoding to hex', function () {
      Certificate.build(PARAMS).encoding.should.equal('hex')
    })

    // `encoding` says how publicKey and signature are WRITTEN. It changes their spelling
    // and nothing else: not payloadHash, not proofHash, not the bytes underneath.
    it('writes publicKey and signature in base64 when asked, and nothing else', function () {
      var cert = Certificate.build(params({ encoding: 'base64' }))
      cert.encoding.should.equal('base64')
      cert.publicKey.should.equal(PARAMS.publicKey.toString('base64'))
      cert.signature.should.equal(PARAMS.signature.toString('base64'))
      cert.payloadHash.should.equal(PARAMS.payloadHash.toString('hex'))
      cert.proofHash.should.equal(Certificate.build(PARAMS).proofHash)
    })

    it('rejects an unknown encoding rather than passing it through', function () {
      ;(function () {
        Certificate.build(params({ encoding: 'binary' }))
      }).should.throw(/encoding must be/)
    })

    // 8.3.0–9.8.0 took these, meaning the signature's byte format. Both were written as
    // hex, so a caller still passing them gets exactly the certificate they got before.
    it('reads the 8.3.0–9.8.0 values raw and der as hex', function () {
      Certificate.build(params({ encoding: 'raw' })).encoding.should.equal('hex')
      Certificate.build(params({ encoding: 'der' })).encoding.should.equal('hex')
    })

    it('hex-encodes the byte fields', function () {
      var cert = Certificate.build(PARAMS)
      cert.payloadHash.should.equal(PARAMS.payloadHash.toString('hex'))
      cert.publicKey.should.equal(PARAMS.publicKey.toString('hex'))
      cert.signature.should.equal(PARAMS.signature.toString('hex'))
    })

    // proofHash is computed, never accepted. A caller cannot hand in a value that
    // disagrees with the fields beside it — which is precisely the artefact this protocol
    // exists to make impossible.
    it('computes proofHash rather than accepting one', function () {
      var cert = Certificate.build(params({ proofHash: 'ff'.repeat(32) }))
      cert.proofHash.should.not.equal('ff'.repeat(32))
      Certificate.proofHashMatches(cert).should.equal(true)
    })

    it('requires a mode', function () {
      ;(function () {
        Certificate.build(params({ mode: undefined }))
      }).should.throw(/mode is required/)
    })

    // Hybrid puts only digests on chain; the certificate keeps the originals. That
    // asymmetry is the whole point of the mode.
    it('keeps the FULL key and signature in hybrid mode', function () {
      var cert = Certificate.build(params({ mode: 'hybrid' }))
      cert.mode.should.equal('hybrid')
      cert.publicKey.should.equal(PARAMS.publicKey.toString('hex'))
      cert.signature.should.equal(PARAMS.signature.toString('hex'))
      // What goes on chain is the digest of each — different values entirely.
      var onChain = NS.parse(NS.build(params({ mode: 'hybrid', proofHash: Buffer.alloc(32) })))
      onChain.publicKeyHash.toString('hex').should.equal(Hash.sha256(PARAMS.publicKey).toString('hex'))
      onChain.publicKeyHash.toString('hex').should.not.equal(cert.publicKey)
    })
  })

  // In the reference format a batched proof is still full or hybrid. What makes it a
  // batch is that its anchor holds a Merkle root rather than the proof, so the reference
  // marks it on anchor.type. 8.3.0–9.8.0 made batch a third mode.
  describe('batch is an anchor type, not a mode', function () {
    it('a merkle proof makes the anchor a batch anchor and leaves the mode alone', function () {
      var cert = Certificate.build(params({ merkle: MERKLE }))
      cert.mode.should.equal('full')
      cert.anchor.type.should.equal('batch')
      cert.merkle.root.should.equal(MERKLE.root.toString('hex'))
      cert.merkle.leafIndex.should.equal(2)
      cert.merkle.leafCount.should.equal(8)
    })

    it('a hybrid proof can be batched too', function () {
      var cert = Certificate.build(params({ mode: 'hybrid', merkle: MERKLE }))
      cert.mode.should.equal('hybrid')
      cert.anchor.type.should.equal('batch')
    })

    it('refuses mode "batch", and says where batch goes', function () {
      ;(function () {
        Certificate.build(params({ mode: 'batch', merkle: MERKLE }))
      }).should.throw(/batch is an anchor type/)
    })

    it('requires a merkle proof for a batch anchor', function () {
      ;(function () {
        Certificate.build(params({ anchor: { type: 'batch', txid: 'ab'.repeat(32) } }))
      }).should.throw(/merkle/)
    })

    it('refuses a merkle proof on an anchor declared direct', function () {
      ;(function () {
        Certificate.build(params({ anchor: { type: 'direct', txid: 'ab'.repeat(32) }, merkle: MERKLE }))
      }).should.throw(/exactly when/)
    })

    // The numeric mode bytes are still accepted as input, and MODE.BATCH keeps meaning
    // what it meant: a full proof, batched.
    it('reads the numeric NotaryScript.MODE.BATCH as a full proof on a batch anchor', function () {
      var cert = Certificate.build(params({ mode: NS.MODE.BATCH, merkle: MERKLE }))
      cert.mode.should.equal('full')
      cert.anchor.type.should.equal('batch')
      ;(function () {
        Certificate.build(params({ mode: NS.MODE.BATCH }))
      }).should.throw(/merkle/)
    })

    it('writes the path as { hash, side }, leaf upward', function () {
      var hashes = Merkle.path(LEAVES, 2).map(function (b) { return b.toString('hex') })
      Certificate.build(params({ merkle: MERKLE })).merkle.path.should.deep.equal([
        { hash: hashes[0], side: 'right' },
        { hash: hashes[1], side: 'left' },
        { hash: hashes[2], side: 'right' }
      ])
    })

    // A caller holding Merkle.path() output — bare hashes, as 8.3.0–9.8.0 wrote them —
    // gets the same certificate: the sides follow from the index and tree size.
    it('converts a bare-hash path, deriving each side from the index', function () {
      var bare = Object.assign({}, MERKLE, { path: Merkle.path(LEAVES, 2) })
      Certificate.build(params({ merkle: bare }))
        .should.deep.equal(Certificate.build(params({ merkle: MERKLE })))
    })

    it('refuses a bare-hash path of the wrong length for its tree', function () {
      var short = Object.assign({}, MERKLE, { path: Merkle.path(LEAVES, 2).slice(1) })
      ;(function () {
        Certificate.build(params({ merkle: short }))
      }).should.throw(/needs 3/)
    })
  })

  describe('proof integrity (validity check 2)', function () {
    it('matches for a well-formed certificate', function () {
      Certificate.proofHashMatches(Certificate.build(PARAMS)).should.equal(true)
    })

    it('matches for a base64 certificate, decoding before hashing', function () {
      Certificate.proofHashMatches(Certificate.build(params({ encoding: 'base64' }))).should.equal(true)
    })

    // Each field is inside the canonical proof bytes, so tampering with any of them must
    // be detected. This is the certificate-level counterpart of the encoding module's
    // coverage test.
    it('detects tampering with any covered field', function () {
      var cert = Certificate.build(PARAMS)
      var tampers = {
        algorithm: 'ML-DSA-65',
        hashAlgorithm: 'SHA-512',
        payloadHash: 'ff'.repeat(32),
        publicKey: '03' + '11'.repeat(32),
        signature: 'aa'.repeat(64),
        createdAt: '2026-08-17T00:00:00.000Z'
      }
      Object.keys(tampers).forEach(function (field) {
        var bad = Object.assign({}, cert)
        bad[field] = tampers[field]
        Certificate.proofHashMatches(bad)
          .should.equal(false, 'tampering with ' + field + ' was not detected')
      })
    })

    // The label decides how the strings decode, so changing it changes the bytes.
    it('detects an encoding label that does not match how the fields are written', function () {
      var cert = Certificate.build(PARAMS)
      Certificate.proofHashMatches(Object.assign({}, cert, { encoding: 'base64' })).should.equal(false)
    })

    // Fields NOT in the canonical proof bytes must not affect it — otherwise the SPV
    // envelope could not be additive.
    it('is unaffected by fields outside the canonical bytes', function () {
      var cert = Certificate.build(PARAMS)
      var moved = Object.assign({}, cert, {
        anchor: Object.assign({}, cert.anchor, { txid: 'ff'.repeat(32), blockHeight: 999999 }),
        mode: 'hybrid'
      })
      Certificate.proofHashMatches(moved).should.equal(true)
    })

    it('returns a strict boolean, never a truthy object', function () {
      Certificate.proofHashMatches(Certificate.build(PARAMS)).should.be.a('boolean')
      Certificate.proofHashMatches(null).should.equal(false)
      Certificate.proofHashMatches({}).should.equal(false)
      Certificate.proofHashMatches({ proofHash: 'nonsense' }).should.equal(false)
    })

    // The hex fields decode to bytes before hashing. Hashing the strings would be twice
    // as many bytes and produce something that still looks like a hash.
    it('hashes the decoded bytes, not the hex strings', function () {
      var cert = Certificate.build(PARAMS)
      var overHex = Hash.sha256(Encoding.canonicalBytes({
        algorithm: cert.algorithm,
        hashAlgorithm: cert.hashAlgorithm,
        payloadHash: Buffer.from(cert.payloadHash, 'utf8'), // the STRING, wrongly
        publicKey: Buffer.from(cert.publicKey, 'hex'),
        signature: Buffer.from(cert.signature, 'hex'),
        createdAtUnix: Encoding.toUnixSeconds(cert.createdAt)
      })).toString('hex')
      overHex.should.not.equal(cert.proofHash)
    })
  })

  describe('SPV envelope', function () {
    // The spec's explicit guarantee. If it ever broke, every previously issued
    // certificate would become unverifiable.
    it('never changes proofHash', function () {
      var cert = Certificate.build(PARAMS)
      var withSPV = Certificate.attachSPV(cert, SPV)
      withSPV.proofHash.should.equal(cert.proofHash)
      Certificate.proofHashMatches(withSPV).should.equal(true)
    })

    it('does not mutate the certificate it was given', function () {
      var cert = Certificate.build(PARAMS)
      Certificate.attachSPV(cert, SPV)
      ;(cert.spv === undefined).should.equal(true)
    })

    it('defaults format to TSC', function () {
      Certificate.attachSPV(Certificate.build(PARAMS), SPV).spv.format.should.equal('TSC')
    })

    it('keeps an explicit format, for BUMP or BEEF', function () {
      var withSPV = Certificate.attachSPV(Certificate.build(PARAMS),
        Object.assign({}, SPV, { format: 'BUMP' }))
      withSPV.spv.format.should.equal('BUMP')
    })
  })

  describe('validateShape', function () {
    it('passes a well-formed certificate, in either encoding and either anchor type', function () {
      Certificate.validateShape(Certificate.build(PARAMS)).should.deep.equal([])
      Certificate.validateShape(Certificate.build(params({ encoding: 'base64' }))).should.deep.equal([])
      Certificate.validateShape(Certificate.build(params({ merkle: MERKLE }))).should.deep.equal([])
    })

    it('names every missing required field', function () {
      var problems = Certificate.validateShape({})
      problems.length.should.equal(Certificate.REQUIRED_FIELDS.length)
      problems[0].should.match(/missing required field/)
    })

    it('rejects a foreign protocol or version', function () {
      var cert = Certificate.build(PARAMS)
      Certificate.validateShape(Object.assign({}, cert, { protocol: 'Other' }))
        .should.include('protocol must be "NotaryHash"')
      Certificate.validateShape(Object.assign({}, cert, { version: 2 }))
        .should.include('unsupported version: 2')
      // Quoted, so a string version is distinguishable from a number in the message.
      Certificate.validateShape(Object.assign({}, cert, { version: '2.0' }))
        .should.include('unsupported version: "2.0"')
    })

    // A numeric mode is only meaningful in the legacy format, where normalize() maps it.
    // In a "1.0" certificate it is malformed, and so is "batch".
    it('rejects a mode that is not "full" or "hybrid"', function () {
      var cert = Certificate.build(PARAMS)
      Certificate.validateShape(Object.assign({}, cert, { mode: 'batch' }))
        .should.include('mode must be "full" or "hybrid"')
      Certificate.validateShape(Object.assign({}, cert, { mode: NS.MODE.FULL }))
        .should.include('mode must be "full" or "hybrid"')
    })

    it('rejects an encoding outside hex and base64, and fields that do not decode', function () {
      var cert = Certificate.build(PARAMS)
      Certificate.validateShape(Object.assign({}, cert, { encoding: 'raw' }))
        .should.include('encoding must be "hex" or "base64"')
      Certificate.validateShape(Object.assign({}, cert, { publicKey: 'not hex at all' }))
        .should.include('publicKey is not valid hex')
    })

    it('rejects an anchor without a type, or with a malformed txid', function () {
      var cert = Certificate.build(PARAMS)
      Certificate.validateShape(Object.assign({}, cert, { anchor: { txid: 'ab'.repeat(32), blockHeight: 800000 } }))
        .should.include('anchor.type must be "direct" or "batch"')
      Certificate.validateShape(Object.assign({}, cert, { anchor: Object.assign({}, cert.anchor, { txid: 'ab' }) }))
        .should.include('anchor.txid must be a 32-byte hex string')
    })

    it('rejects a batch anchor with no merkle proof', function () {
      var cert = Certificate.build(PARAMS)
      Certificate.validateShape(Object.assign({}, cert, { anchor: Object.assign({}, cert.anchor, { type: 'batch' }) }))
        .should.include('batch certificates require a merkle inclusion proof')
    })

    it('rejects a bare-hash path in a "1.0" certificate', function () {
      var cert = Certificate.build(params({ merkle: MERKLE }))
      var bare = Object.assign({}, cert, {
        merkle: Object.assign({}, cert.merkle, { path: cert.merkle.path.map(function (n) { return n.hash }) })
      })
      Certificate.validateShape(bare).should.include('merkle.path[0] must be { hash, side: "left" | "right" }')
    })

    it('rejects a hash field of the wrong length or that is not hex', function () {
      var cert = Certificate.build(PARAMS)
      Certificate.validateShape(Object.assign({}, cert, { payloadHash: 'ab' }))
        .should.include('payloadHash must be 32 bytes (64 hex chars)')
      Certificate.validateShape(Object.assign({}, cert, { proofHash: 'zz'.repeat(32) }))
        .should.include('proofHash must be a hex string')
    })

    // Shape is not verification, and a test says so — otherwise it gets used as one.
    it('says nothing about whether the proofHash is correct', function () {
      var cert = Certificate.build(PARAMS)
      var lying = Object.assign({}, cert, { proofHash: '00'.repeat(32) })
      Certificate.validateShape(lying).should.deep.equal([])
      Certificate.proofHashMatches(lying).should.equal(false)
    })
  })

  // Certificates already issued in the old format must keep verifying. normalize() maps
  // them onto the reference format; these tests check the mapping is exact, by comparing
  // against what build() writes for the same proof today.
  describe('certificates written by 8.3.0–9.8.0', function () {
    function legacy (overrides) {
      var cert = Certificate.build(PARAMS)
      return Object.assign({}, cert, {
        version: 1,
        mode: NS.MODE.FULL,
        encoding: 'raw',
        anchor: { txid: cert.anchor.txid, blockHeight: 800000 }
      }, overrides)
    }

    it('normalise to exactly the certificate the reference format writes', function () {
      Certificate.normalize(legacy()).should.deep.equal(Certificate.build(PARAMS))
    })

    it('map mode 1 to hybrid and encoding der to hex', function () {
      var n = Certificate.normalize(legacy({ mode: NS.MODE.HYBRID, encoding: 'der' }))
      n.mode.should.equal('hybrid')
      n.encoding.should.equal('hex')
    })

    it('map batch mode 2, with a bare-hash path, to a full proof on a batch anchor', function () {
      var today = Certificate.build(params({ merkle: MERKLE }))
      var old = legacy({
        mode: NS.MODE.BATCH,
        merkle: {
          root: today.merkle.root,
          leafIndex: 2,
          leafCount: 8,
          path: Merkle.path(LEAVES, 2).map(function (b) { return b.toString('hex') })
        }
      })
      Certificate.normalize(old).should.deep.equal(today)
    })

    it('pass shape validation, and keep their proofHash', function () {
      var old = legacy()
      Certificate.validateShape(old).should.deep.equal([])
      Certificate.proofHashMatches(old).should.equal(true)
    })

    it('are not mutated by normalising', function () {
      var old = legacy()
      Certificate.normalize(old)
      old.version.should.equal(1)
      old.mode.should.equal(NS.MODE.FULL)
      old.encoding.should.equal('raw')
    })

    it('a reference-format certificate is returned untouched', function () {
      var cert = Certificate.build(PARAMS)
      Certificate.normalize(cert).should.equal(cert)
    })

    // Only the one version this library wrote is translated. Anything else is judged as
    // given, so an unknown version cannot pass by resembling a known one.
    it('an unknown version is not translated, and is rejected', function () {
      var foreign = legacy({ version: 2 })
      Certificate.normalize(foreign).should.equal(foreign)
      var problems = Certificate.validateShape(foreign)
      problems.should.include('unsupported version: 2')
      problems.should.include('mode must be "full" or "hybrid"')
    })
  })

  // Through 9.x the default is still the 8.3.0–9.8.0 format: STABILITY.md does not let a
  // minor change what an API returns. These pin it against certificates the 9.8.0 code
  // itself built, so "unchanged" is measured rather than assumed.
  describe('the 8.3.0–9.8.0 format, still the default through 9.x', function () {
    var warned

    beforeEach(function () {
      deprecate.reset()
      warned = []
      this.origWarn = console.warn
      console.warn = function (m) { warned.push(m) }
    })

    afterEach(function () {
      console.warn = this.origWarn
      deprecate.reset()
    })

    function paramsFrom (input, extra) {
      return Object.assign({}, input, {
        payloadHash: Buffer.from(input.payloadHash, 'hex'),
        publicKey: Buffer.from(input.publicKey, 'hex'),
        signature: Buffer.from(input.signature, 'hex'),
        createdAt: input.createdAt && input.createdAt.date ? new Date(input.createdAt.date) : input.createdAt
      }, extra)
    }

    it('the fixture was built by 9.8.0, not by this library', function () {
      golden._provenance.should.match(/at v9\.8\.0/)
    })

    Object.keys(golden.certificates).forEach(function (name) {
      var entry = golden.certificates[name]

      // Compared as serialised JSON, key order included: that is what a caller stores.
      it(name + ': the default build writes exactly what 9.8.0 wrote', function () {
        JSON.stringify(Certificate.build(paramsFrom(entry.input)))
          .should.equal(JSON.stringify(entry.certificate))
      })

      it(name + ': format "legacy" writes it too, without a notice', function () {
        JSON.stringify(Certificate.build(paramsFrom(entry.input, { format: 'legacy' })))
          .should.equal(JSON.stringify(entry.certificate))
        warned.should.deep.equal([])
      })

      it(name + ': is recognised, passes shape, and keeps its proofHash', function () {
        Certificate.isLegacy(entry.certificate).should.equal(true)
        Certificate.validateShape(entry.certificate).should.deep.equal([])
        Certificate.proofHashMatches(entry.certificate).should.equal(true)
      })

      // The same proof in the other format: the JSON differs, the proof does not.
      it(name + ': the reference format, from the same inputs, has the same proofHash', function () {
        Certificate.build(paramsFrom(entry.input, { format: 'reference' })).proofHash
          .should.equal(entry.certificate.proofHash)
      })
    })

    it('warns once, naming the format option and the version that flips the default', function () {
      var input = golden.certificates.fullDefaultEncoding.input
      Certificate.build(paramsFrom(input))
      Certificate.build(paramsFrom(input))
      warned.length.should.equal(1)
      warned[0].should.match(/format: 'reference'/)
      warned[0].should.match(/10\.0\.0/)
    })

    it('does not warn when the reference format is chosen', function () {
      Certificate.build(PARAMS)
      warned.should.deep.equal([])
    })

    // A typo quietly selecting the legacy format would recreate the failure the option
    // exists to remove, so an unknown value throws rather than falling back.
    it('refuses an unknown format rather than falling back', function () {
      ;(function () {
        Certificate.build(params({ format: 'Reference' }))
      }).should.throw(/Unknown certificate format/)
    })

    it('keeps the 9.8.0 constants: VERSION is 1, ENCODING keeps RAW and DER', function () {
      Certificate.VERSION.should.equal(1)
      Certificate.REFERENCE_VERSION.should.equal('1.0')
      Certificate.ENCODING.RAW.should.equal('raw')
      Certificate.ENCODING.DER.should.equal('der')
    })

    // 9.8.0 accepted certificate-like objects with no version in verifyBatchInclusion, and
    // a numeric mode is something the reference format never has.
    it('recognises a numeric mode with no version as the old format', function () {
      Certificate.isLegacy({ mode: 2 }).should.equal(true)
      Certificate.isLegacy({ version: '1.0', mode: 'full' }).should.equal(false)
      Certificate.isLegacy({ version: 2, mode: 0 }).should.equal(false)
      Certificate.isLegacy(null).should.equal(false)
    })
  })

  describe('decodeBytes', function () {
    it('takes hex with or without a 0x prefix, as the reference does', function () {
      Certificate.decodeBytes('0xabcd', 'hex').toString('hex').should.equal('abcd')
      Certificate.decodeBytes('ABCD', 'hex').toString('hex').should.equal('abcd')
    })

    it('rejects odd-length or non-hex input rather than truncating it', function () {
      ;(function () { Certificate.decodeBytes('abc', 'hex') }).should.throw(/hex/)
      ;(function () { Certificate.decodeBytes('zz', 'hex') }).should.throw(/hex/)
      // What Buffer.from would have done instead: silently produced fewer bytes.
      Buffer.from('abzz', 'hex').length.should.equal(1)
    })

    // The reference decodes with Buffer.from(value, 'base64'), which also takes the
    // URL-safe alphabet and missing padding. Anything the reference reads, this reads.
    it('takes padded, unpadded and URL-safe base64, as the reference does', function () {
      var bytes = Buffer.from([0xfb, 0xff, 0x01, 0x02])
      Certificate.decodeBytes(bytes.toString('base64'), 'base64').should.deep.equal(bytes)
      Certificate.decodeBytes(bytes.toString('base64').replace(/=+$/, ''), 'base64').should.deep.equal(bytes)
      Certificate.decodeBytes(bytes.toString('base64url'), 'base64').should.deep.equal(bytes)
    })

    // Where this is stricter than the reference: Buffer.from skips characters outside the
    // alphabet, so a corrupted field decodes to DIFFERENT bytes instead of failing.
    it('rejects characters outside the base64 alphabet that Buffer.from would skip', function () {
      Buffer.from('+/8B!!', 'base64').toString('hex').should.equal('fbff01')
      ;(function () { Certificate.decodeBytes('+/8B!!', 'base64') }).should.throw(/base64/)
    })

    // Buffer.from also drops a trailing character that cannot complete a byte, so a
    // truncated field would decode to fewer bytes instead of failing.
    it('rejects a base64 length no byte string encodes, and padding out of place', function () {
      Buffer.from('AAAAA', 'base64').length.should.equal(3)
      ;(function () { Certificate.decodeBytes('AAAAA', 'base64') }).should.throw(/length/)
      ;(function () { Certificate.decodeBytes('AB=', 'base64') }).should.throw(/length/)
      ;(function () { Certificate.decodeBytes('AB=C', 'base64') }).should.throw(/base64/)
    })

    it('accepts every base64 length the writer produces, in either alphabet', function () {
      for (var n = 0; n <= 64; n++) {
        var bytes = Buffer.alloc(n, n)
        Certificate.decodeBytes(bytes.toString('base64'), 'base64').should.deep.equal(bytes)
        Certificate.decodeBytes(bytes.toString('base64url'), 'base64').should.deep.equal(bytes)
      }
    })

    it('rejects an encoding it does not know', function () {
      ;(function () { Certificate.decodeBytes('abcd', 'raw') }).should.throw(/encoding must be/)
    })
  })

  describe('canonicalize', function () {
    it('is RFC 8785 over the certificate', function () {
      var cert = Certificate.build(PARAMS)
      Certificate.canonicalize(cert).should.equal(JCS.stringify(cert))
    })

    it('sorts keys, so transport order does not matter', function () {
      var cert = Certificate.build(PARAMS)
      var reordered = {}
      Object.keys(cert).reverse().forEach(function (k) { reordered[k] = cert[k] })
      Certificate.canonicalize(reordered).should.equal(Certificate.canonicalize(cert))
    })

    // proofHash is over the length-prefixed BINARY proof bytes, not over this JSON.
    // Confusing the two produces a value that looks like a proofHash and is not one.
    it('is not what proofHash is computed over', function () {
      var cert = Certificate.build(PARAMS)
      Hash.sha256(Buffer.from(Certificate.canonicalize(cert), 'utf8')).toString('hex')
        .should.not.equal(cert.proofHash)
    })
  })
})
