'use strict'

/* global describe, it, before, after */

// OrdLock marketplace covenant — list a 1Sat ordinal for sale behind a trustless
// "pay the seller or cancel" covenant. Every locking/unlocking pair below is driven
// through the consensus interpreter (the "if it emits Script, it's interpreter-
// verified" operating principle), including adversarial spends that MUST be rejected.

require('chai').should()
var bsv = require('../..')
var Ord = bsv.Ordinals
var SC = bsv.SmartContract
var Script = bsv.Script
var PrivateKey = bsv.PrivateKey
var Transaction = bsv.Transaction

var help = SC.CovenantHelpers
var verify = help.verify
var p2pkhOutput = help.p2pkhOutput

var ORD_SATS = 1
var PRICE = 100000

describe('Ordinals OrdLock marketplace', function () {
  this.timeout(20000)
  var I = bsv.Script.Interpreter
  var saved

  before(function () {
    saved = { el: I.MAX_SCRIPT_ELEMENT_SIZE, num: I.MAXIMUM_ELEMENT_SIZE, ops: I.MAX_OPS_PER_SCRIPT }
    SC.enableGenesis()
  })
  after(function () {
    I.MAX_SCRIPT_ELEMENT_SIZE = saved.el
    I.MAXIMUM_ELEMENT_SIZE = saved.num
    I.MAX_OPS_PER_SCRIPT = saved.ops
  })

  var seller = PrivateKey.fromRandom()
  var buyer = PrivateKey.fromRandom()

  // A funding tx that pays the listing UTXO, plus a spend consuming it at input 0.
  function fundListing (lock) {
    return help.fundAndSpend(lock, ORD_SATS, {}).spend
  }

  // Build the buyer's outputs: [ ordinal->buyer (index 0), payment->seller (index 1) ].
  function buyerOutputs (payTo, price) {
    return [
      p2pkhOutput(buyer, ORD_SATS), // the ordinal goes to the buyer at output 0
      Ord.payOutputFor(payTo || seller, price == null ? PRICE : price) // seller payment at 1
    ]
  }

  it('verifies a purchase that pays the seller', function () {
    var lock = Ord.buildOrdLock({ seller: seller.toAddress(), price: PRICE })
    var spend = fundListing(lock)
    buyerOutputs().forEach(function (o) { spend.addOutput(o) })
    Ord.purchaseOrdLock({ spend: spend, lockingScript: lock, satoshis: ORD_SATS })
    verify(spend.inputs[0].script, lock, { tx: spend, satoshis: ORD_SATS }).ok.should.equal(true)
  })

  it('stays valid when the buyer adds a funding input and a change output', function () {
    var lock = Ord.buildOrdLock({ seller: seller.toAddress(), price: PRICE })
    var spend = fundListing(lock)
    // outputs: [ordinal->buyer, payment->seller, change->buyer]
    spend.addOutput(p2pkhOutput(buyer, ORD_SATS))
    spend.addOutput(Ord.payOutputFor(seller, PRICE))
    spend.addOutput(p2pkhOutput(buyer, 40000)) // buyer change, trailing

    // Grind + build the unlock BEFORE adding the (ANYONECANPAY) funding input.
    Ord.purchaseOrdLock({ spend: spend, lockingScript: lock, satoshis: ORD_SATS })
    spend.addInput(new Transaction.Input({
      prevTxId: '22'.repeat(32), outputIndex: 0, script: Script.empty()
    }), p2pkhOutput(buyer, PRICE + 50000).script, PRICE + 50000)

    verify(spend.inputs[0].script, lock, { tx: spend, satoshis: ORD_SATS }).ok.should.equal(true)
  })

  it('rejects a purchase that underpays the seller', function () {
    var lock = Ord.buildOrdLock({ seller: seller.toAddress(), price: PRICE })
    var spend = fundListing(lock)
    spend.addOutput(p2pkhOutput(buyer, ORD_SATS))
    spend.addOutput(Ord.payOutputFor(seller, PRICE))
    Ord.purchaseOrdLock({ spend: spend, lockingScript: lock, satoshis: ORD_SATS })

    // Tamper: shave the seller's payment after grinding → committed outputs change.
    spend.outputs[1] = Ord.payOutputFor(seller, PRICE - 1)
    verify(spend.inputs[0].script, lock, { tx: spend, satoshis: ORD_SATS }).ok.should.equal(false)
  })

  it('rejects a purchase that redirects the payment to someone else', function () {
    var lock = Ord.buildOrdLock({ seller: seller.toAddress(), price: PRICE })
    var spend = fundListing(lock)
    spend.addOutput(p2pkhOutput(buyer, ORD_SATS))
    spend.addOutput(Ord.payOutputFor(seller, PRICE))
    Ord.purchaseOrdLock({ spend: spend, lockingScript: lock, satoshis: ORD_SATS })

    spend.outputs[1] = Ord.payOutputFor(PrivateKey.fromRandom(), PRICE) // thief's address
    verify(spend.inputs[0].script, lock, { tx: spend, satoshis: ORD_SATS }).ok.should.equal(false)
  })

  it('pays a distinct payTo recipient while the seller keeps cancel rights', function () {
    var payee = PrivateKey.fromRandom()
    var lock = Ord.buildOrdLock({ seller: seller.toAddress(), payTo: payee.toAddress(), price: PRICE })
    var spend = fundListing(lock)
    spend.addOutput(p2pkhOutput(buyer, ORD_SATS))
    spend.addOutput(Ord.payOutputFor(payee, PRICE))
    Ord.purchaseOrdLock({ spend: spend, lockingScript: lock, satoshis: ORD_SATS })
    verify(spend.inputs[0].script, lock, { tx: spend, satoshis: ORD_SATS }).ok.should.equal(true)
  })

  it('purchase() fail-fasts (throws) when the payout output is wrong', function () {
    var lock = Ord.buildOrdLock({ seller: seller.toAddress(), price: PRICE })
    var spend = fundListing(lock)
    spend.addOutput(p2pkhOutput(buyer, ORD_SATS))
    spend.addOutput(Ord.payOutputFor(seller, PRICE - 1)) // underpay
    var pinned = Ord.payOutputFor(seller, PRICE)
    ;(function () {
      Ord.purchaseOrdLock({ spend: spend, lockingScript: lock, satoshis: ORD_SATS, payOutput: pinned })
    }).should.throw(/would not be paid/)
  })

  it('lets the seller CANCEL the listing with their key', function () {
    var lock = Ord.buildOrdLock({ seller: seller.toAddress(), price: PRICE })
    var spend = fundListing(lock)
    spend.addOutput(p2pkhOutput(seller, ORD_SATS)) // seller reclaims the ordinal
    Ord.cancelOrdLock({ privateKey: seller, spend: spend, lockingScript: lock, satoshis: ORD_SATS })
    verify(spend.inputs[0].script, lock, { tx: spend, satoshis: ORD_SATS }).ok.should.equal(true)
  })

  it('rejects a CANCEL signed by the wrong key', function () {
    var lock = Ord.buildOrdLock({ seller: seller.toAddress(), price: PRICE })
    var spend = fundListing(lock)
    spend.addOutput(p2pkhOutput(buyer, ORD_SATS))
    Ord.cancelOrdLock({ privateKey: buyer, spend: spend, lockingScript: lock, satoshis: ORD_SATS })
    verify(spend.inputs[0].script, lock, { tx: spend, satoshis: ORD_SATS }).ok.should.equal(false)
  })

  it('listInscriptionOutput is a 1-sat output whose script cancels + purchases', function () {
    var out = Ord.listInscriptionOutput({ seller: seller.toAddress(), price: PRICE })
    out.satoshis.should.equal(1)
    // Purchase path round-trips through the interpreter.
    var lock = out.script
    var spend = fundListing(lock)
    spend.addOutput(p2pkhOutput(buyer, ORD_SATS))
    spend.addOutput(Ord.payOutputFor(seller, PRICE))
    Ord.purchaseOrdLock({ spend: spend, lockingScript: lock, satoshis: ORD_SATS })
    verify(spend.inputs[0].script, lock, { tx: spend, satoshis: ORD_SATS }).ok.should.equal(true)
  })

  it('can inscribe + list in one output; the envelope is inert and parseable', function () {
    var lock = Ord.buildOrdLock({
      seller: seller.toAddress(),
      price: PRICE,
      inscription: { contentType: 'text/plain', content: 'for sale' }
    })
    // The inscription rides along and is recoverable.
    Ord.isInscription(lock).should.equal(true)
    Ord.parseInscription(lock).contentText.should.equal('for sale')
    // ...and the covenant still enforces payment.
    var spend = fundListing(lock)
    spend.addOutput(p2pkhOutput(buyer, ORD_SATS))
    spend.addOutput(Ord.payOutputFor(seller, PRICE))
    Ord.purchaseOrdLock({ spend: spend, lockingScript: lock, satoshis: ORD_SATS })
    verify(spend.inputs[0].script, lock, { tx: spend, satoshis: ORD_SATS }).ok.should.equal(true)
  })
})
