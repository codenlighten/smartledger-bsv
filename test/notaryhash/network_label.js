'use strict'

/* global describe, it, before */

// `anchor.network` is the last field in a certificate that no signature covers.
//
// BRC-220 calls it descriptive — the headers decide the chain, not the label — so accepting any
// value is conformant, and a mainnet certificate relabelled "bsv-testnet" verified, as did one
// relabelled "not-a-chain". A page shown such a certificate presents it as a verified record.
//
// So the check is OPT-IN: a default would break a testnet caller for no gain. And it is worth
// exactly what it claims — it compares a label against the CALLER'S OWN setting, and proves
// nothing about which chain the header source serves. A caller who needs that must obtain its
// headers from a source it trusts for the chain it means.
//
// Raised by the NotaryHash SDK session after a third session relabelled a mainnet certificate and
// both verifiers accepted it.

require('chai').should()
const bsv = require('../..')
const NotaryHash = bsv.NotaryHash

describe('anchor.network is checked only when the caller names a chain', function () {
  let cert, opts

  before(function () {
    const fixture = require('../data/notaryhash-mainnet-certificate.json')
    cert = fixture.certificate
    const b = fixture.block
    const bw = new bsv.encoding.BufferWriter()
    bw.writeUInt32LE(b.version)
    bw.write(Buffer.from(b.previousblockhash, 'hex').reverse())
    bw.write(Buffer.from(b.merkleroot, 'hex').reverse())
    bw.writeUInt32LE(b.time); bw.writeUInt32LE(parseInt(b.bits, 16)); bw.writeUInt32LE(b.nonce)
    opts = { header: bw.toBuffer().toString('hex'), blockHeight: b.height, blockHashAtHeight: b.hash }
  })

  function relabelled (network) {
    const c = JSON.parse(JSON.stringify(cert))
    c.anchor.network = network
    return c
  }

  it('accepts the certificate as issued', function () {
    NotaryHash.verify(cert, opts).valid.should.equal(true)
  })

  it('without opts.network, a relabelled certificate is still accepted', function () {
    // Unchanged behaviour. The field is descriptive per BRC-220 and a default would break
    // every testnet caller.
    NotaryHash.verify(relabelled('bsv-testnet'), opts).valid.should.equal(true)
    NotaryHash.verify(relabelled('not-a-chain'), opts).valid.should.equal(true)
  })

  it('with opts.network, a mismatching label is refused and named', function () {
    const r = NotaryHash.verify(relabelled('bsv-testnet'),
      Object.assign({}, opts, { network: 'bsv-mainnet' }))
    r.valid.should.equal(false)
    r.errors.join(' ').should.contain('anchor.network is "bsv-testnet"')
    r.errors.join(' ').should.contain('expects "bsv-mainnet"')
  })

  it('with opts.network matching, it passes', function () {
    NotaryHash.verify(cert, Object.assign({}, opts, { network: 'bsv-mainnet' }))
      .valid.should.equal(true)
  })

  it('a testnet caller is not broken by the check', function () {
    NotaryHash.verify(relabelled('bsv-testnet'),
      Object.assign({}, opts, { network: 'bsv-testnet' })).valid.should.equal(true)
  })

  it('an absent anchor.network is not a mismatch', function () {
    const c = JSON.parse(JSON.stringify(cert))
    delete c.anchor.network
    NotaryHash.verify(c, Object.assign({}, opts, { network: 'bsv-mainnet' }))
      .valid.should.equal(true)
  })
})
