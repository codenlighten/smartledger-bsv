'use strict'

var Random = require('../crypto/random')

/**
 * RFC 4122 version 4 UUID, drawn from the CSPRNG.
 *
 * The engine's built-in PRNG is not an acceptable source here: V8 implements it
 * with xorshift128+, whose internal state is recoverable from a handful of
 * outputs, so one emitted identifier can expose every later id from the same
 * process.
 *
 * @returns {String} e.g. '1b4e28ba-2fa1-4d9b-b6f7-1e3c9a8d5c02'
 */
function uuid4 () {
  var bytes = Random.getRandomBuffer(16)

  bytes[6] = (bytes[6] & 0x0f) | 0x40 // version 4
  bytes[8] = (bytes[8] & 0x3f) | 0x80 // variant 10x

  var hex = bytes.toString('hex')
  return [
    hex.substring(0, 8),
    hex.substring(8, 12),
    hex.substring(12, 16),
    hex.substring(16, 20),
    hex.substring(20, 32)
  ].join('-')
}

/**
 * Opaque identifier of `length` hex characters, drawn from the CSPRNG.
 * Entropy is 4 bits per character, so callers choose `length` to bound
 * collision probability across the population of ids they expect to mint.
 *
 * @param {Number} length - number of hex characters
 * @returns {String}
 */
function randomHex (length) {
  return Random.getRandomBuffer(Math.ceil(length / 2))
    .toString('hex')
    .substring(0, length)
}

module.exports = {
  uuid4: uuid4,
  randomHex: randomHex
}
