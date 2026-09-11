'use strict'

/* global describe, it */

// The certificate-field amendment publishes example certificates as proposed spec text. A
// document that has drifted from the artifact it describes is worse than none, and nothing
// else would notice: the doc is prose and the fixture is JSON, and they are edited
// separately. So the examples are read out of the markdown, compared with the certificates
// the reference implementation produced, and verified.
//
// See docs/BRC220_CERTIFICATE_FIELDS_AMENDMENT.md.

require('chai').should()
var fs = require('fs')
var path = require('path')
var NH = require('../../lib/notaryhash')
var Certificate = require('../../lib/notaryhash/certificate')
var Merkle = require('../../lib/notaryhash/merkle')
var fixture = require('../data/notaryhash-reference-certs.json')
var vector = require('../data/brc220-batch-vector.json')

// The proposed text is blockquoted; strip the quote markers so its tables and JSON read as
// they will in the spec.
var DOC = fs.readFileSync(
  path.join(__dirname, '..', '..', 'docs', 'BRC220_CERTIFICATE_FIELDS_AMENDMENT.md'), 'utf8')
  .split('\n').map(function (l) { return l.replace(/^> ?/, '') }).join('\n')

// The JSON block that follows `<!-- fixture: NAME -->`.
function example (name) {
  var at = DOC.indexOf('<!-- fixture: ' + name + ' -->')
  if (at < 0) throw new Error('no example marked ' + name)
  var m = DOC.slice(at).match(/```json\n([\s\S]*?)\n```/)
  if (!m) throw new Error('no JSON block after the ' + name + ' marker')
  return JSON.parse(m[1])
}

function withoutSpv (c) {
  var o = Object.assign({}, c)
  delete o.spv
  return o
}

function tableRow (name) {
  return new RegExp('^\\| `' + name.replace(/[.*+?^${}()|[\]\\]/g, '\\$&') + '` \\|', 'm')
}

describe('BRC-220 certificate-field amendment', function () {
  describe('the direct-anchored example', function () {
    var cert = example('certificates.fullHex')

    it('is the certificate the reference implementation produced', function () {
      cert.should.deep.equal(withoutSpv(fixture.certificates.fullHex.certificate))
    })

    it('is well-formed, and its signature and proofHash verify', function () {
      Certificate.validateShape(cert).should.deep.equal([])
      NH.verifySignature(cert).should.equal(true)
      Certificate.proofHashMatches(cert).should.equal(true)
    })

    it('writes createdAt with zero milliseconds, as the text says', function () {
      cert.createdAt.should.match(/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}\.000Z$/)
    })

    it('writes hex in lowercase, without a prefix, as the text says', function () {
      ;[cert.payloadHash, cert.publicKey, cert.signature, cert.proofHash, cert.anchor.txid]
        .forEach(function (h) { h.should.match(/^[0-9a-f]+$/) })
    })
  })

  describe('the batch merkle example', function () {
    var merkle = example('batch.certificates[4].merkle')
    var leaf = Buffer.from(fixture.batch.certificates[4].proofHash, 'hex')

    it('is the merkle object the reference produced for leaf 4', function () {
      merkle.should.deep.equal(fixture.batch.certificates[4].merkle)
    })

    it('folds proofHash to root by the side rule the text states', function () {
      Merkle.verifyAuditPath(leaf, merkle.path, Buffer.from(merkle.root, 'hex')).should.equal(true)
    })

    // And the rule as written, by hand, rather than through the library's fold: a "left"
    // sibling goes first.
    it('matches the fold written out by hand', function () {
      var Hash = require('../../lib/crypto/hash')
      var running = Hash.sha256(Buffer.concat([Buffer.from([0x00]), leaf]))
      merkle.path.forEach(function (n) {
        var h = Buffer.from(n.hash, 'hex')
        var pair = n.side === 'left' ? [h, running] : [running, h]
        running = Hash.sha256(Buffer.concat([Buffer.from([0x01])].concat(pair)))
      })
      running.toString('hex').should.equal(merkle.root)
    })

    it('is the root of the BRC-220 batch vector filed as #246', function () {
      merkle.root.should.equal(vector.root)
    })
  })

  describe('the tables', function () {
    it('define every field the spec requires', function () {
      Certificate.REQUIRED_FIELDS.forEach(function (f) {
        DOC.should.match(tableRow(f), 'no row for ' + f)
      })
    })

    it('define every anchor member the reference writes', function () {
      Object.keys(fixture.certificates.fullHex.certificate.anchor).forEach(function (m) {
        DOC.should.match(tableRow(m), 'no row for anchor.' + m)
      })
    })

    it('define every merkle member the reference writes', function () {
      Object.keys(fixture.batch.certificates[0].merkle).forEach(function (m) {
        DOC.should.match(tableRow(m), 'no row for merkle.' + m)
      })
    })
  })

  // The text states two reader rules and two leniencies. Each is asserted here twice: that
  // the sentence is in the text, and that this library does what the sentence says — so
  // the proposal cannot claim behaviour its own implementation lacks.
  describe('the reader rules, as stated and as this library applies them', function () {
    var cert = example('certificates.fullHex')

    it('a verifier rejects a version it does not implement', function () {
      DOC.should.match(/A verifier MUST reject a certificate whose `version` it does not implement\./)
      ;['2.0', '1', '1.0.0'].forEach(function (v) {
        var report = NH.verify(Object.assign({}, cert, { version: v }), { skipAnchor: true })
        report.shape.join(' ').should.match(/unsupported version/, 'version ' + JSON.stringify(v))
      })
    })

    // The rule is about versions a verifier does not implement. This library implements one
    // more than the reference: the numeric version 1 of its own 8.3.0-9.8.0 format, which it
    // reads and reports as legacy. Refusing it would be refusing a version it implements.
    it('does not refuse the one other version this library implements', function () {
      var report = NH.verify(Object.assign({}, cert, { version: 1 }), { skipAnchor: true })
      report.shape.should.deep.equal([])
      report.legacy.should.equal(true)
      report.signature.should.equal(true)
      report.proofIntegrity.should.equal(true)
    })

    it('a reader rejects base64 that is not base64: characters, padding, length', function () {
      DOC.should.match(/A reader MUST reject a value that is not valid in its encoding/)
      ;['+/8B!!', '+/8B AA==', 'AB=C', 'AB=', 'AAAAA'].forEach(function (v) {
        ;(function () { Certificate.decodeBytes(v, 'base64') })
          .should.throw(Error, undefined, JSON.stringify(v) + ' was decoded')
      })
    })

    it('a reader may accept the URL-safe alphabet and missing padding', function () {
      DOC.should.match(/A reader MAY accept the §5 \(URL-safe\) alphabet and missing padding\./)
      var bytes = Buffer.from([0xfb, 0xff, 0x01, 0x02])
      Certificate.decodeBytes('-_8BAg', 'base64').should.deep.equal(bytes)
      Certificate.decodeBytes('+/8BAg', 'base64').should.deep.equal(bytes)
    })

    it('a reader may accept upper-case hex and a 0x prefix', function () {
      DOC.should.match(/a reader\s+MAY accept upper case and the prefix/)
      var upper = Object.assign({}, cert, { proofHash: cert.proofHash.toUpperCase() })
      Certificate.validateShape(upper).should.deep.equal([])
      Certificate.proofHashMatches(upper).should.equal(true)
      Certificate.decodeBytes('0xABCD', 'hex').toString('hex').should.equal('abcd')
    })
  })
})
