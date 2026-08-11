'use strict'

var bsv = require('../..')
var Random = bsv.crypto.Random

describe('Random', function () {
  describe('@getRandomBuffer', function () {
    it('should return a buffer', function () {
      var bytes = Random.getRandomBuffer(8)
      bytes.length.should.equal(8)
      Buffer.isBuffer(bytes).should.equal(true)
    })

    it('should not equate two 256 bit random buffers', function () {
      var bytes1 = Random.getRandomBuffer(32)
      var bytes2 = Random.getRandomBuffer(32)
      bytes1.toString('hex').should.not.equal(bytes2.toString('hex'))
    })

    it('should generate 100 8 byte buffers in a row that are not equal', function () {
      var hexs = []
      for (var i = 0; i < 100; i++) {
        hexs[i] = Random.getRandomBuffer(8).toString('hex')
      }
      for (i = 0; i < 100; i++) {
        for (var j = i + 1; j < 100; j++) {
          hexs[i].should.not.equal(hexs[j])
        }
      }
    })

    // WebCrypto refuses more than 65,536 bytes per call. Before chunking, a request
    // above that limit threw; a naive implementation that ignored the return size
    // instead would hand back a zero-filled tail, which is far worse than throwing.
    it('fills requests larger than the 65536-byte getRandomValues limit', function () {
      var buf = Random.getRandomBuffer(70000)
      buf.length.should.equal(70000)
      // The tail comes from a second call — assert it is real entropy, not zero padding.
      var tail = buf.subarray(65536)
      tail.some(function (b) { return b !== 0 }).should.equal(true)
      buf.subarray(0, 32).toString('hex').should.not.equal(tail.subarray(0, 32).toString('hex'))
    })

    it('handles the exact limit and one past it', function () {
      Random.getRandomBuffer(65536).length.should.equal(65536)
      Random.getRandomBuffer(65537).length.should.equal(65537)
    })

    // The backend is chosen by feature detection. This used to branch on
    // `process.browser`, which is undefined in React Native, Deno, Workers and Bun —
    // all of which then fell through to require('crypto').randomBytes. Where a partial
    // crypto shim supplies a weak randomBytes, that produced guessable keys silently.
    it('does not depend on process.browser', function () {
      var saved = process.browser
      try {
        process.browser = undefined
        Random.getRandomBuffer(16).length.should.equal(16)
        process.browser = true
        Random.getRandomBuffer(16).length.should.equal(16)
      } finally {
        process.browser = saved
      }
    })

    it('prefers globalThis.crypto.getRandomValues when present', function () {
      var calls = 0
      var real = Object.getOwnPropertyDescriptor(globalThis, 'crypto')
      try {
        Object.defineProperty(globalThis, 'crypto', {
          configurable: true,
          value: {
            getRandomValues: function (arr) {
              calls++
              for (var i = 0; i < arr.length; i++) arr[i] = (i * 7 + 3) & 0xff
              return arr
            }
          }
        })
        var buf = Random.getRandomBuffer(4)
        calls.should.equal(1)
        buf.toString('hex').should.equal('030a1118')
      } finally {
        if (real) Object.defineProperty(globalThis, 'crypto', real)
      }
    })

    // The throw matters as much as the detection: a key library must never return bytes
    // it cannot vouch for. Verified in a child process because it has to remove both
    // backends, which cannot be undone safely in-process.
    it('throws rather than returning bytes when no CSPRNG exists', function () {
      var out = require('child_process').spawnSync(process.execPath, ['-e', [
        'var Module = require("module"), orig = Module._load',
        'delete globalThis.crypto',
        'Module._load = function (r) {',
        '  if (r === "crypto") { var e = new Error("no crypto"); e.code = "MODULE_NOT_FOUND"; throw e }',
        '  return orig.apply(this, arguments)',
        '}',
        'var R = require(' + JSON.stringify(require.resolve('../../lib/crypto/random.js')) + ')',
        'try { R.getRandomBuffer(32); console.log("RETURNED") }',
        'catch (e) { console.log("THREW") }'
      ].join('\n')], { encoding: 'utf8' })
      out.stdout.trim().should.equal('THREW')
    })
  })
})
