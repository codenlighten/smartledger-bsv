'use strict'

/* global describe, it */

// 1Sat Ordinals inscription build/parse round-trip + output construction.

require('chai').should()
var bsv = require('../..')
var Ord = bsv.Ordinals

describe('Ordinals inscriptions', function () {
  var key = bsv.PrivateKey.fromRandom()
  var address = key.toAddress()

  it('builds a P2PKH inscription and round-trips through parse', function () {
    var s = Ord.buildInscription({
      address: address, contentType: 'text/plain', content: 'hello ordinals'
    })
    var parsed = Ord.parseInscription(s)
    parsed.should.be.an('object')
    parsed.contentType.should.equal('text/plain')
    parsed.contentText.should.equal('hello ordinals')
    // The base lock is exactly the P2PKH for the address.
    parsed.lock.toHex().should.equal(bsv.Script.buildPublicKeyHashOut(address).toHex())
  })

  it('preserves binary content and content-type exactly', function () {
    var content = bsv.crypto.Random.getRandomBuffer(64)
    var s = Ord.buildInscription({ address: address, contentType: 'image/png', content: content })
    var parsed = Ord.parseInscription(s)
    parsed.contentType.should.equal('image/png')
    parsed.content.equals(content).should.equal(true)
  })

  it('round-trips through hex serialization', function () {
    var s = Ord.buildInscription({ address: address, contentType: 'application/json', content: '{"a":1}' })
    var parsed = Ord.parseInscription(s.toHex())
    parsed.contentText.should.equal('{"a":1}')
    parsed.contentType.should.equal('application/json')
  })

  it('accepts a custom base lock script', function () {
    var lock = bsv.Script.buildPublicKeyHashOut(address)
    var s = Ord.buildInscription({ lock: lock, contentType: 'text/plain', content: 'x' })
    Ord.isInscription(s).should.equal(true)
    Ord.parseInscription(s).lock.toHex().should.equal(lock.toHex())
  })

  it('isInscription is false for a plain P2PKH script', function () {
    var p2pkh = bsv.Script.buildPublicKeyHashOut(address)
    Ord.isInscription(p2pkh).should.equal(false)
    var isNull = Ord.parseInscription(p2pkh) === null
    isNull.should.equal(true)
  })

  it('createInscriptionOutput is a 1-sat output carrying the inscription', function () {
    var out = Ord.createInscriptionOutput({ address: address, contentType: 'text/plain', content: 'hi' })
    out.satoshis.should.equal(1)
    Ord.isInscription(out.script).should.equal(true)
  })

  it('batchInscriptionOutputs builds one output per item', function () {
    var outs = Ord.batchInscriptionOutputs([
      { address: address, contentType: 'text/plain', content: 'a' },
      { address: address, contentType: 'text/plain', content: 'b' }
    ])
    outs.length.should.equal(2)
    Ord.parseInscription(outs[0].script).contentText.should.equal('a')
    Ord.parseInscription(outs[1].script).contentText.should.equal('b')
  })

  // The 1Sat spec allows the locking script to be prepended OR appended to the
  // envelope. The parser only ever looked before it, so an appended lock was dropped
  // and an owned ordinal was reported as carrying no locking script at all.
  describe('recovers the lock wherever the spec allows it to sit', function () {
    var p2pkh = bsv.Script.buildPublicKeyHashOut(address)

    function concat () {
      var out = new bsv.Script()
      Array.prototype.slice.call(arguments).forEach(function (part) {
        part.chunks.forEach(function (c) { out.chunks.push(c) })
      })
      return out
    }

    function envelope () {
      return Ord.buildInscription({
        lock: new bsv.Script(), allowEmptyLock: true, contentType: 'text/plain', content: 'hello'
      })
    }

    it('recovers a lock that precedes the envelope', function () {
      var parsed = Ord.parseInscription(concat(p2pkh, envelope()))
      parsed.lock.toHex().should.equal(p2pkh.toHex())
      parsed.contentText.should.equal('hello')
    })

    it('recovers a lock that follows the envelope', function () {
      var parsed = Ord.parseInscription(concat(envelope(), p2pkh))
      parsed.lock.toHex().should.equal(p2pkh.toHex())
      parsed.contentText.should.equal('hello')
    })

    it('keeps a separating OP_CODESEPARATOR, which really does run', function () {
      var sep = concat(p2pkh, new bsv.Script().add(bsv.Opcode.OP_CODESEPARATOR), envelope())
      var parsed = Ord.parseInscription(sep)
      parsed.lock.chunks.length.should.equal(p2pkh.chunks.length + 1)
      parsed.contentText.should.equal('hello')
    })

    it('still reports no lock when there genuinely is none', function () {
      Ord.parseInscription(envelope()).lock.chunks.length.should.equal(0)
    })
  })

  // Every case below used to succeed and emit a well-formed script that inscribed
  // something other than what the caller asked for. An inscription is permanent, so
  // each one now fails loudly at build time instead of on-chain.
  describe('rejects arguments that would silently inscribe the wrong thing', function () {
    it('throws when content is omitted rather than inscribing an empty payload', function () {
      (function () {
        Ord.buildInscription({ address: address, contentType: 'text/plain' })
      }).should.throw(/requires `content`/)
    })

    it('names the field the caller actually passed', function () {
      // The real-world report: a wallet whose own builder calls the field `data`.
      (function () {
        Ord.buildInscription({ address: address, contentType: 'text/plain', data: 'hello world' })
      }).should.throw(/received `data`, which is not read/)
    })

    it('still allows an explicitly empty payload', function () {
      var s = Ord.buildInscription({ address: address, contentType: 'text/plain', content: '' })
      Ord.parseInscription(s).content.length.should.equal(0)
    })

    it('throws rather than stringifying an object into the payload', function () {
      // String({}) is '[object Object]' — permanent, and never intended.
      (function () {
        Ord.buildInscription({ address: address, contentType: 'text/plain', content: { a: 1 } })
      }).should.throw(/content must be a string or Buffer, got an object/)
    })

    it('throws on any non-string, non-Buffer content', function () {
      [42, true, null, ['a'], undefined].forEach(function (v) {
        (function () {
          Ord.buildInscription({ address: address, contentType: 'text/plain', content: v })
        }).should.throw(Error)
      })
    })

    it('requires a contentType for Buffer content instead of labelling it text/plain', function () {
      var png = Buffer.from([0x89, 0x50, 0x4e, 0x47])
      ;(function () {
        Ord.buildInscription({ address: address, content: png })
      }).should.throw(/contentType is required when content is a Buffer/)
      // Declared explicitly, it builds.
      var s = Ord.buildInscription({ address: address, contentType: 'image/png', content: png })
      Ord.parseInscription(s).contentType.should.equal('image/png')
    })

    it('keeps the text/plain default for string content', function () {
      var s = Ord.buildInscription({ address: address, content: 'hi' })
      Ord.parseInscription(s).contentType.should.equal('text/plain')
    })

    it('throws on an empty or non-string contentType', function () {
      (function () {
        Ord.buildInscription({ address: address, contentType: '', content: 'x' })
      }).should.throw(/contentType must not be empty/)
      ;(function () {
        Ord.buildInscription({ address: address, contentType: {}, content: 'x' })
      }).should.throw(/contentType must be a string or Buffer/)
    })

    it('throws on an empty base lock, which would be anyone-can-spend', function () {
      // With no base lock the script is just the inert envelope: OP_FALSE OP_IF skips
      // to OP_ENDIF, so whatever the spender pushed is the final stack and any spender
      // succeeds. Proven below rather than asserted.
      (function () {
        Ord.buildInscription({ lock: Buffer.alloc(0), contentType: 'text/plain', content: 'x' })
      }).should.throw(/spendable by anyone/)
    })

    it('proves the empty-lock script really is anyone-can-spend', function () {
      var envelope = Ord.buildInscription({
        lock: new bsv.Script(), allowEmptyLock: true, contentType: 'text/plain', content: 'x'
      })
      // An unlocking script from a key unrelated to `address` satisfies it.
      var unlock = new bsv.Script().add(bsv.Opcode.OP_1)
      var interp = new bsv.Script.Interpreter()
      var ok = interp.verify(unlock, envelope, new bsv.Transaction(), 0, 0)
      ok.should.equal(true)
    })

    it('permits an empty lock only when the caller opts in', function () {
      var s = Ord.buildInscription({
        lock: new bsv.Script(), allowEmptyLock: true, contentType: 'text/plain', content: 'x'
      })
      Ord.isInscription(s).should.equal(true)
    })

    it('throws when both lock and address are given instead of ignoring one', function () {
      var lock = bsv.Script.buildPublicKeyHashOut(address)
      var other = bsv.PrivateKey.fromRandom().toAddress()
      ;(function () {
        Ord.buildInscription({ lock: lock, address: other, contentType: 'text/plain', content: 'x' })
      }).should.throw(/not both/)
    })

    it('rejects a satoshi amount that carries no ordinal', function () {
      [0, '1', 1.5, -1].forEach(function (v) {
        (function () {
          Ord.createInscriptionOutput({
            address: address, contentType: 'text/plain', content: 'x', satoshis: v
          })
        }).should.throw(Error)
      })
      Ord.createInscriptionOutput({
        address: address, contentType: 'text/plain', content: 'x'
      }).satoshis.should.equal(1)
    })
  })

  // Transferring a large inscription. The envelope is inert, so the spend is an
  // ordinary P2PKH — but under pre-Genesis rules the interpreter could not even load
  // the script, because total script size was capped at 10,000 bytes.
  describe('transferring a large inscription', function () {
    var I = bsv.Script.Interpreter
    var Sighash = bsv.Transaction.Sighash
    var BN = bsv.crypto.BN
    var SIGHASH = bsv.crypto.Signature.SIGHASH_ALL | bsv.crypto.Signature.SIGHASH_FORKID
    // Pre-Genesis: no era bit, so the 520-byte element cap and the 10,000-byte script
    // cap both still apply. Kept deliberately, to show what they reject.
    var FLAGS = I.SCRIPT_VERIFY_STRICTENC | I.SCRIPT_ENABLE_SIGHASH_FORKID
    // Current mainnet, where Genesis lifted both.
    var MAINNET = I.mainnetFlags()
    var saved

    beforeEach(function () { saved = I.getLimits() })
    afterEach(function () { I.setLimits(saved) })

    // A signed transfer of a `kb`-sized inscription to a new owner.
    function transfer (kb) {
      var owner = bsv.PrivateKey.fromBuffer(Buffer.alloc(32, 11))
      var recipient = bsv.PrivateKey.fromBuffer(Buffer.alloc(32, 22))
      var lock = Ord.buildInscription({
        address: owner.toAddress(),
        contentType: 'image/png',
        content: bsv.crypto.Random.getRandomBuffer(kb * 1024)
      })
      var spend = new bsv.Transaction()
      spend.addInput(new bsv.Transaction.Input({
        prevTxId: 'aa'.repeat(32), outputIndex: 0, script: bsv.Script.empty()
      }), lock, 1)
      spend.addOutput(new bsv.Transaction.Output({
        script: bsv.Script.buildPublicKeyHashOut(recipient.toAddress()), satoshis: 1
      }))
      // Sign over the FULL previous locking script — envelope included. That is the
      // script code the network uses; signing the base lock alone yields a signature
      // that verifies against its own preimage and nothing else.
      var sig = Sighash.sign(spend, owner, SIGHASH, 0, lock, new BN(1), FLAGS)
      var unlock = new bsv.Script()
        .add(Buffer.concat([sig.toDER(), Buffer.from([SIGHASH])]))
        .add(owner.toPublicKey().toBuffer())
      spend.inputs[0].setScript(unlock)
      return { lock: lock, unlock: unlock, spend: spend, sig: sig, owner: owner }
    }

    // Both caps are derived from the ERA flags, not from the limit statics: see
    // Interpreter#maxScriptElementSize and #maxScriptSize, each of which branches on
    // isAfterGenesis(). Passing the era is therefore the whole fix — these tests used
    // to call SmartContract.enableGenesis(), which raised process-wide statics instead
    // and had to be undone in an afterEach or it changed the rules for every test that
    // ran later.
    function evaluate (t, flags) {
      var interp = new I()
      var ok = interp.verify(t.unlock, t.lock, t.spend, 0,
        flags === undefined ? MAINNET : flags, new BN(1))
      return { ok: ok, err: interp.errstr }
    }

    it('cannot be evaluated under pre-Genesis limits — two separate caps bite', function () {
      // Explicitly pre-Genesis: FLAGS carries no era bit, so both caps still apply.
      // Under 10 KB the script loads and the 520-byte push cap rejects the content...
      var small = evaluate(transfer(3), FLAGS)
      small.ok.should.equal(false)
      small.err.should.equal('SCRIPT_ERR_PUSH_SIZE')
      // ...over 10 KB it never gets that far: evaluate() refuses the script outright.
      var big = evaluate(transfer(50), FLAGS)
      big.ok.should.equal(false)
      big.err.should.equal('SCRIPT_ERR_SCRIPT_SIZE')
    })

    it('evaluates under mainnet consensus, with the limit statics untouched', function () {
      var before = JSON.stringify(I.getLimits())
      var t = transfer(50)
      t.lock.toBuffer().length.should.be.above(10000) // past the pre-Genesis cap
      evaluate(t).ok.should.equal(true)
      // The point of the change: no process-wide mutation was needed to get here.
      JSON.stringify(I.getLimits()).should.equal(before)
    })

    it('agrees with a direct signature check against the sighash', function () {
      // The fallback used when the interpreter cannot run: verify the signature over
      // the sighash directly. It must agree with the interpreter where both work.
      var t = transfer(50)
      var hash = Sighash.sighash(t.spend, SIGHASH, 0, t.lock, new BN(1), FLAGS)
      var sigOk = bsv.crypto.ECDSA.verify(hash, t.sig, t.owner.toPublicKey(), 'little')
      sigOk.should.equal(true)
      evaluate(t).ok.should.equal(true)
    })

    it('rejects a signature made over the base lock instead of the full script', function () {
      var t = transfer(50)
      var baseLock = bsv.Script.buildPublicKeyHashOut(t.owner.toAddress())
      var wrong = Sighash.sign(t.spend, t.owner, SIGHASH, 0, baseLock, new BN(1), FLAGS)
      var hash = Sighash.sighash(t.spend, SIGHASH, 0, t.lock, new BN(1), FLAGS)
      // Verifies against its own (wrong) preimage, but not the one the network checks.
      bsv.crypto.ECDSA.verify(hash, wrong, t.owner.toPublicKey(), 'little').should.equal(false)
      t.spend.inputs[0].setScript(new bsv.Script()
        .add(Buffer.concat([wrong.toDER(), Buffer.from([SIGHASH])]))
        .add(t.owner.toPublicKey().toBuffer()))
      var interp = new I()
      interp.verify(t.spend.inputs[0].script, t.lock, t.spend, 0, FLAGS, new BN(1)).should.equal(false)
    })
  })
  describe('envelope fields', function () {
    // Tag 5 is `metadata`, the spec's own home for an object's own record.
    // Until this existed the only way to write one was to assemble envelope
    // bytes by hand, which is the single most dangerous thing an integrator
    // can do here: wrong bytes are permanent, paid for, and silent.
    var manifest = Buffer.from('{"grade":9.5}', 'utf8')

    it('writes a field and reads it back', function () {
      var s = Ord.buildInscription({
        address: address,
        contentType: 'image/jpeg',
        content: Buffer.from('img'),
        fields: { 5: manifest }
      })
      var parsed = Ord.parseInscription(s)
      parsed.contentType.should.equal('image/jpeg')
      parsed.content.toString().should.equal('img')
    })

    it('emits tags 1..16 as opcodes and larger tags as data pushes', function () {
      // OP_16 is the largest numeric opcode, so tag 21 has no opcode form at
      // all. An indexer reads the stack element either way, but a non-minimal
      // push of a small number is non-standard, so both forms must be used
      // where they belong.
      var s = Ord.buildInscription({
        address: address,
        contentType: 'text/plain',
        content: 'x',
        fields: { 5: manifest, 21: Buffer.from('wide') }
      })
      var asm = s.toASM().split(' ')
      asm.should.include('OP_5')
      asm.should.not.include('OP_21') // does not exist
      asm.should.include('15') // tag 21, pushed as one byte
    })

    it('orders fields by tag, whatever order they were written in', function () {
      var a = Ord.buildInscription({
        address: address,
        contentType: 'text/plain',
        content: 'x',
        fields: { 21: Buffer.from('b'), 5: Buffer.from('a') }
      })
      var b = Ord.buildInscription({
        address: address,
        contentType: 'text/plain',
        content: 'x',
        fields: { 5: Buffer.from('a'), 21: Buffer.from('b') }
      })
      a.toHex().should.equal(b.toHex())
    })

    it('refuses an unrecognized even tag', function () {
      // The spec: an inscription with an unrecognized even field "must be
      // displayed as unbound, that is, without a location". Nothing local
      // reports it, so refusing at build time is the only moment it can be
      // caught before the money is spent.
      ;(function () {
        Ord.buildInscription({
          address: address,
          contentType: 'text/plain',
          content: 'x',
          fields: { 20: manifest }
        })
      }).should.throw(/unrecognized even tag/)
    })

    it('allows an unrecognized even tag when asked explicitly', function () {
      // Not a hard wall: the named-tag set grows with the protocol, and a
      // library that could never be overridden would eventually be both wrong
      // and unbypassable — sending people back to hand-written bytes, which is
      // worse than the thing being prevented.
      var s = Ord.buildInscription({
        address: address,
        contentType: 'text/plain',
        content: 'x',
        fields: { 20: manifest },
        allowUnknownEvenFields: true
      })
      // 20 is above 16, so it has no opcode form: it is pushed as the byte 0x14.
      s.toASM().split(' ').should.include('14')
    })

    it('allows an unrecognized ODD tag with no ceremony', function () {
      Ord.buildInscription({
        address: address,
        contentType: 'text/plain',
        content: 'x',
        fields: { 21: manifest }
      }).should.be.an('object')
    })

    it('refuses tag 0, which opens the body', function () {
      // Everything after tag 0 IS the body, so a field there does not fail —
      // it silently becomes part of the file.
      ;(function () {
        Ord.buildInscription({
          address: address,
          contentType: 'text/plain',
          content: 'x',
          fields: { 0: manifest }
        })
      }).should.throw(/opens the inscription body/)
    })

    it('refuses tag 1, which is the content type', function () {
      ;(function () {
        Ord.buildInscription({
          address: address,
          contentType: 'text/plain',
          content: 'x',
          fields: { 1: Buffer.from('text/plain') }
        })
      }).should.throw(/is the content type/)
    })

    it('refuses an empty field value', function () {
      ;(function () {
        Ord.buildInscription({
          address: address,
          contentType: 'text/plain',
          content: 'x',
          fields: { 5: Buffer.alloc(0) }
        })
      }).should.throw(/empty value/)
    })

    it('leaves the script unchanged when no fields are given', function () {
      var without = Ord.buildInscription({
        address: address, contentType: 'text/plain', content: 'x'
      })
      var withEmpty = Ord.buildInscription({
        address: address, contentType: 'text/plain', content: 'x', fields: {}
      })
      withEmpty.toHex().should.equal(without.toHex())
    })
  })
})
