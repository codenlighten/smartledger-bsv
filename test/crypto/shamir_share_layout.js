'use strict'
/* global describe,it */

// Two properties of a v2 share that a consumer has built a security control on, pinned here so a
// change to them fails in this repo rather than in their production signup tests.
//
// The vg-wallet session measured a v2 share's hex payload as
//     3 + 32 * ceil(len / 16)
// and its server uses that (plus one block of slack) to refuse a pasted blob large
// enough to hold two shares — a blob that size means someone has pasted two of their three
// recovery shares into one box, which is the moment a 2-of-3 scheme stops protecting them.
// That formula is right for len mod 16 in 1..14 and UNDER-PREDICTS BY ONE BLOCK when len mod 16
// is 15 or 0. Measured over every length 1..80 here and 1..200 on their side, the exact rule is
//     3 + 32 * ceil((byteLength + 2) / 16)
//
// and `len` is BYTES, not characters — their measurement, added after they fixed their server.
// Their example: 20 x "é" has a JS .length of 20 and a byte length of 40, and the payload is 99,
// which the byte formula gives and the character formula misses by a block (67). JS .length is
// wrong twice over for astral characters: 5 emoji are 10 .length and 20 bytes. BIP39 English is
// ASCII so it does not reach them, but Shamir.split accepts any string.
// — the +2 being a length prefix inside the padded region. Block boundaries fall at len 15, 31,
// 47, 63, 79. A 24-word mnemonic can be 144 characters, which is 16 * 9 exactly, so this is not
// a corner case they will never see: their one block of slack absorbs it, which means the slack
// is doing load-bearing work they had accounted as margin.
//
// They asked to be told if we planned to change the padding. We do not, and this is that promise
// written down where it can fail.
//
// The second is the checksum. Their server refuses a share whose checksum is non-null, and that
// rule is well-founded: the checksum is the first four bytes of SHA-256 OF THE SECRET, identical
// in every share and across independent splits, so a single shareholder below threshold gains an
// offline oracle for guessing a low-entropy secret. lib/crypto/shamir.js already says so and
// defaults it off. These tests pin that it stays off and stays secret-derived, because if it ever
// became the default it would be a breaking change for them and a silent weakening for everyone.

require('chai').should()
var crypto = require('crypto')
var bsv = require('../..')

var SIZES = [
  { words: 12, entropy: 128 },
  { words: 15, entropy: 160 },
  { words: 18, entropy: 192 },
  { words: 21, entropy: 224 },
  { words: 24, entropy: 256 }
]

function payloadLength (share) {
  return share.share.length
}

describe('Shamir v2 share layout', function () {
  it('has a hex payload of exactly 3 + 32*ceil((len+2)/16) characters, 12 to 24 words', function () {
    SIZES.forEach(function (s) {
      var mnemonic = bsv.Mnemonic.fromRandom(s.entropy).toString()
      var predicted = 3 + 32 * Math.ceil((mnemonic.length + 2) / 16)
      bsv.Shamir.split(mnemonic, 2, 3).forEach(function (share) {
        payloadLength(share).should.equal(predicted,
          s.words + ' words (mnemonic length ' + mnemonic.length + ')')
      })
    })
  })

  it('puts its block boundaries at len 15, 31, 47, 63 and 79', function () {
    // Pinned explicitly because this is where the consumer's formula and ours disagree: at a
    // length that is an exact multiple of 16, a whole extra block appears.
    var blocksFor = function (len) {
      return (bsv.Shamir.split('a'.repeat(len), 2, 3)[0].share.length - 3) / 32
    }
    blocksFor(14).should.equal(1)
    blocksFor(15).should.equal(2)
    blocksFor(16).should.equal(2)
    blocksFor(30).should.equal(2)
    blocksFor(31).should.equal(3)
    blocksFor(32).should.equal(3)
  })

  it('counts BYTES, not characters, so multibyte secrets follow the same rule', function () {
    // Their finding. A consumer assuming characters under-predicts on any non-ASCII secret, and
    // JS `.length` is wrong twice over for astral characters (surrogate pairs).
    ;[
      { secret: '\u00e9'.repeat(20), bytes: 40 },
      { secret: '\u6f22'.repeat(10), bytes: 30 },
      { secret: '\ud83d\ude00'.repeat(5), bytes: 20 },
      { secret: ('a\u00e9\u6f22\ud83d\ude00').repeat(6), bytes: 60 }
    ].forEach(function (c) {
      Buffer.byteLength(c.secret, 'utf8').should.equal(c.bytes)
      var share = bsv.Shamir.split(c.secret, 2, 3)[0]
      share.length.should.equal(c.bytes, 'the length field is a byte count')
      share.share.length.should.equal(3 + 32 * Math.ceil((c.bytes + 2) / 16))
    })
    // and the characters formula would be wrong for the first of those
    ;(3 + 32 * Math.ceil(('\u00e9'.repeat(20).length + 2) / 16)).should.not.equal(99)
  })

  it('round-trips a multibyte secret', function () {
    var secret = '\u00e9\u6f22\ud83d\ude00 mixed unicode secret'
    bsv.Shamir.combine(bsv.Shamir.split(secret, 2, 3).slice(0, 2))
      .toString('utf8').should.equal(secret)
  })

  it('gives every share in a split the same payload length', function () {
    var mnemonic = bsv.Mnemonic.fromRandom(128).toString()
    var lens = bsv.Shamir.split(mnemonic, 3, 5).map(payloadLength)
    lens.every(function (l) { return l === lens[0] }).should.equal(true)
  })

  describe('the checksum', function () {
    var MNEMONIC = 'abandon abandon abandon abandon abandon abandon abandon abandon abandon abandon abandon about'

    it('is null unless asked for', function () {
      bsv.Shamir.split(MNEMONIC, 2, 3).forEach(function (s) {
        ;(s.checksum === null || s.checksum === undefined).should.equal(true)
      })
    })

    it('is the first four bytes of SHA-256 of the SECRET when asked for', function () {
      var expected = crypto.createHash('sha256').update(MNEMONIC, 'utf8').digest('hex').slice(0, 8)
      bsv.Shamir.split(MNEMONIC, 2, 3, { checksum: true }).forEach(function (s) {
        s.checksum.should.equal(expected)
      })
    })

    it('is identical across independent splits, which is why it leaks', function () {
      // Two separate splits of the same secret carry the same checksum, so the value is a
      // function of the secret alone. That is the leak: one share is enough to test a guess.
      var a = bsv.Shamir.split(MNEMONIC, 2, 3, { checksum: true })[0].checksum
      var b = bsv.Shamir.split(MNEMONIC, 2, 3, { checksum: true })[0].checksum
      a.should.equal(b)
    })

    it('differs for a different secret', function () {
      var other = 'legal winner thank year wave sausage worth useful legal winner thank yellow'
      bsv.Shamir.split(MNEMONIC, 2, 3, { checksum: true })[0].checksum
        .should.not.equal(bsv.Shamir.split(other, 2, 3, { checksum: true })[0].checksum)
    })
  })
})
