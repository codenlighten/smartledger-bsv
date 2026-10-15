'use strict'

var _ = require('../util/_')
var BN = require('../crypto/bn')
var buffer = require('buffer')
var JSUtil = require('../util/js')
var BufferWriter = require('../encoding/bufferwriter')
var Varint = require('../encoding/varint')
var Script = require('../script')
var $ = require('../util/preconditions')
var errors = require('../errors')

var MAX_SAFE_INTEGER = 0x1fffffffffffff

function Output (args) {
  if (!(this instanceof Output)) {
    return new Output(args)
  }
  if (_.isObject(args)) {
    this.satoshis = args.satoshis
    if (Buffer.isBuffer(args.script)) {
      this._scriptBuffer = args.script
    } else {
      var script
      if (_.isString(args.script) && JSUtil.isHexa(args.script)) {
        script = buffer.Buffer.from(args.script, 'hex')
      } else {
        script = args.script
      }
      this.setScript(script)
    }
  } else {
    throw new TypeError('Unrecognized argument for Output')
  }
}

Object.defineProperty(Output.prototype, 'script', {
  configurable: false,
  enumerable: true,
  get: function () {
    if (this._script) {
      return this._script
    } else {
      this.setScriptFromBuffer(this._scriptBuffer)
      return this._script
    }
  }
})

Object.defineProperty(Output.prototype, 'satoshis', {
  configurable: false,
  enumerable: true,
  get: function () {
    return this._satoshis
  },
  set: function (num) {
    if (num instanceof BN) {
      this._satoshisBN = num
      this._satoshis = num.toNumber()
    } else if (_.isString(num)) {
      this._satoshis = parseInt(num)
      this._satoshisBN = BN.fromNumber(this._satoshis)
    } else {
      $.checkArgument(
        JSUtil.isNaturalNumber(num),
        'Output satoshis is not a natural number'
      )
      this._satoshisBN = BN.fromNumber(num)
      this._satoshis = num
    }
    $.checkState(
      JSUtil.isNaturalNumber(this._satoshis),
      'Output satoshis is not a natural number'
    )
  }
})

Output.prototype.invalidSatoshis = function () {
  if (this._satoshis > MAX_SAFE_INTEGER) {
    return 'transaction txout satoshis greater than max safe integer'
  }
  if (this._satoshis !== this._satoshisBN.toNumber()) {
    return 'transaction txout satoshis has corrupted value'
  }
  if (this._satoshis < 0) {
    return 'transaction txout negative'
  }
  return false
}

Object.defineProperty(Output.prototype, 'satoshisBN', {
  configurable: false,
  enumerable: true,
  get: function () {
    return this._satoshisBN
  },
  set: function (num) {
    this._satoshisBN = num
    this._satoshis = num.toNumber()
    $.checkState(
      JSUtil.isNaturalNumber(this._satoshis),
      'Output satoshis is not a natural number'
    )
  }
})

Output.prototype.toObject = Output.prototype.toJSON = function toObject () {
  var obj = {
    satoshis: this.satoshis
  }
  obj.script = this._scriptBuffer.toString('hex')
  return obj
}

Output.fromObject = function (data) {
  return new Output(data)
}

Output.prototype.setScriptFromBuffer = function (buffer) {
  // Checked BEFORE the assignment, and that order is the point. This used to assign first, so a
  // caller passing a string or undefined left the output holding a non-Buffer `_scriptBuffer`:
  // the throw came from deep inside the parser, and every LATER read of `.script` threw too,
  // with a message ('Invalid hex string', or a property of undefined) that named neither this
  // method nor the bad argument. The null-script guards elsewhere in the library also read
  // `_scriptBuffer.length` and `_scriptBuffer.toString('hex')`, so they assume what this now
  // enforces: every `_scriptBuffer` in a live object is a Buffer.
  $.checkArgument(Buffer.isBuffer(buffer), 'Output script buffer must be a Buffer')
  this._scriptBuffer = buffer
  try {
    this._script = Script.fromBuffer(this._scriptBuffer)
    this._script._isOutput = true
  } catch (e) {
    // Since 9.35.0 `Script.fromBuffer` is total: every byte string parses, because the parser
    // keeps a cut-off length prefix instead of throwing and a decode failure surfaces at USE,
    // as it does in the node. So this branch is unreachable from real bytes today.
    //
    // It stays. A guard deleted because nothing currently reaches it is how the next parse
    // failure becomes an uncaught throw at transaction construction, and the whole point of
    // this one is that a transaction carrying an output we cannot read must still be
    // constructible, stored and relayed.
    if (e instanceof errors.Script.InvalidBuffer) {
      this._script = null
    } else {
      throw e
    }
  }
}

Output.prototype.setScript = function (script) {
  if (script instanceof Script) {
    this._scriptBuffer = script.toBuffer()
    this._script = script
    this._script._isOutput = true
  } else if (_.isString(script)) {
    this._script = Script.fromString(script)
    this._scriptBuffer = this._script.toBuffer()
    this._script._isOutput = true
  } else if (Buffer.isBuffer(script)) {
    this.setScriptFromBuffer(script)
  } else {
    throw new TypeError('Invalid argument type: script')
  }
  return this
}

Output.prototype.inspect = function () {
  var scriptStr
  if (this.script) {
    scriptStr = this.script.inspect()
  } else {
    scriptStr = this._scriptBuffer.toString('hex')
  }
  return '<Output (' + this.satoshis + ' sats) ' + scriptStr + '>'
}

Output.fromBufferReader = function (br) {
  var obj = {}
  obj.satoshis = br.readUInt64LEBN()
  var size = br.readVarintNum()
  if (size !== 0) {
    obj.script = br.read(size)
  } else {
    obj.script = buffer.Buffer.from([])
  }
  return new Output(obj)
}

Output.prototype.toBufferWriter = function (writer) {
  if (!writer) {
    writer = new BufferWriter()
  }
  writer.writeUInt64LEBN(this._satoshisBN)
  var script = this._scriptBuffer
  writer.writeVarintNum(script.length)
  writer.write(script)
  return writer
}

// 8    value
// ???  script size (VARINT)
// ???  script
Output.prototype.getSize = function () {
  // `this.script` is null when the raw bytes could not be decoded (see setScriptFromBuffer),
  // which happens for outputs the node accepts and mines, so the size must still be
  // answerable. ONLY that case falls back to the raw buffer. A parsed script keeps the
  // existing calculation, because a caller may have mutated the Script object in place and
  // getSize() has always measured the object — `_scriptBuffer` is what actually serializes,
  // and the two disagree after such a mutation. Making them agree is a separate change with
  // its own behaviour consequences; both sides are pinned in
  // test/transaction/output_unparseable_script.js.
  var scriptSize = this.script === null
    ? this._scriptBuffer.length
    : this.script.toBuffer().length
  var varintSize = Varint(scriptSize).toBuffer().length
  return 8 + varintSize + scriptSize
}

module.exports = Output
