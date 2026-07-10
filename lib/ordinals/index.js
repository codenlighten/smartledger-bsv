'use strict'
/**
 * Ordinals — 1Sat Ordinals inscriptions for BSV.
 *
 * Build/parse inscription scripts, create the 1-sat inscription output, batch many
 * inscriptions into one transaction, and (see ./ordlock) list an ordinal for sale
 * behind an OP_PUSH_TX "pay the seller or cancel" covenant.
 */
var inscription = require('./inscription')
var ordlock = require('./ordlock')

/**
 * Build the 1-sat output(s) for one or more inscriptions.
 * @param {Array<object>} items  each: { contentType, content, address|lock, satoshis? }
 * @returns {Transaction.Output[]}
 */
function batchInscriptionOutputs (items) {
  if (!Array.isArray(items) || !items.length) {
    throw new Error('batchInscriptionOutputs requires a non-empty array of items')
  }
  return items.map(function (it) { return inscription.createInscriptionOutput(it) })
}

module.exports = {
  buildInscription: inscription.buildInscription,
  parseInscription: inscription.parseInscription,
  isInscription: inscription.isInscription,
  createInscriptionOutput: inscription.createInscriptionOutput,
  batchInscriptionOutputs: batchInscriptionOutputs,

  // Marketplace: list an ordinal for sale behind a "pay the seller or cancel" covenant.
  ORDLOCK_SIGHASH: ordlock.ORDLOCK_SIGHASH,
  buildOrdLock: ordlock.buildOrdLock,
  listInscriptionOutput: ordlock.listInscriptionOutput,
  payOutputFor: ordlock.payOutputFor,
  purchaseOrdLock: ordlock.purchase,
  cancelOrdLock: ordlock.cancel
}
