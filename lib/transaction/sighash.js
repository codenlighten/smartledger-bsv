'use strict'

var buffer = require('buffer')

var Signature = require('../crypto/signature')
var Script = require('../script')
var Output = require('./output')
var BufferReader = require('../encoding/bufferreader')
var BufferWriter = require('../encoding/bufferwriter')
var BN = require('../crypto/bn')
var Hash = require('../crypto/hash')
var ECDSA = require('../crypto/ecdsa')
var $ = require('../util/preconditions')
var Interpreter = require('../script/interpreter')
var _ = require('../util/_')
var Opcode = require('../opcode')

var SIGHASH_SINGLE_BUG = Buffer.from('0000000000000000000000000000000000000000000000000000000000000001', 'hex')
var BITS_64_ON = 'ffffffffffffffff'

// By default, we sign with sighash_forkid
var DEFAULT_SIGN_FLAGS = Interpreter.SCRIPT_ENABLE_SIGHASH_FORKID

var sighashPreimageForForkId = function (transaction, sighashType, inputNumber, subscript, satoshisBN) {
  var input = transaction.inputs[inputNumber]
  $.checkArgument(
    satoshisBN instanceof BN,
    'For ForkId=0 signatures, satoshis or complete input must be provided'
  )

  function GetPrevoutHash (tx) {
    var writer = new BufferWriter()

    _.each(tx.inputs, function (input) {
      writer.writeReverse(input.prevTxId)
      writer.writeUInt32LE(input.outputIndex)
    })

    var buf = writer.toBuffer()
    var ret = Hash.sha256sha256(buf)
    return ret
  }

  function GetSequenceHash (tx) {
    var writer = new BufferWriter()

    _.each(tx.inputs, function (input) {
      writer.writeUInt32LE(input.sequenceNumber)
    })

    var buf = writer.toBuffer()
    var ret = Hash.sha256sha256(buf)
    return ret
  }

  function GetOutputsHash (tx, n) {
    var writer = new BufferWriter()

    if (_.isUndefined(n)) {
      _.each(tx.outputs, function (output) {
        output.toBufferWriter(writer)
      })
    } else {
      tx.outputs[n].toBufferWriter(writer)
    }

    var buf = writer.toBuffer()
    var ret = Hash.sha256sha256(buf)
    return ret
  }

  var hashPrevouts = Buffer.alloc(32)
  var hashSequence = Buffer.alloc(32)
  var hashOutputs = Buffer.alloc(32)

  // These three digests are the same for EVERY input of a transaction, and computing them
  // costs a pass over all the inputs or all the outputs. Recomputing them per input made
  // signing quadratic: measured on 9.22.0, 100 inputs took 0.9 s and 5,000 took 194 s —
  // 50x the inputs for 216x the time.
  //
  // `Transaction.prototype.getSignatures` opens a cache for the duration of its pass and
  // closes it afterwards. That window is safe without any invalidation logic, because
  // `sign()` collects every signature BEFORE applying any of them, so no input or output
  // changes while the cache is open. Outside that window there is no cache and nothing is
  // remembered, which is why this cannot go stale.
  //
  // The SIGHASH_SINGLE branch is deliberately NOT cached: it hashes one output chosen by
  // `inputNumber`, so it differs per input and is O(1) anyway.
  var midstates = transaction && transaction._sighashMidstates

  if (!(sighashType & Signature.SIGHASH_ANYONECANPAY)) {
    if (midstates) {
      if (!midstates.prevouts) midstates.prevouts = GetPrevoutHash(transaction)
      hashPrevouts = midstates.prevouts
    } else {
      hashPrevouts = GetPrevoutHash(transaction)
    }
  }

  if (!(sighashType & Signature.SIGHASH_ANYONECANPAY) &&
    (sighashType & 31) !== Signature.SIGHASH_SINGLE &&
    (sighashType & 31) !== Signature.SIGHASH_NONE) {
    if (midstates) {
      if (!midstates.sequence) midstates.sequence = GetSequenceHash(transaction)
      hashSequence = midstates.sequence
    } else {
      hashSequence = GetSequenceHash(transaction)
    }
  }

  if ((sighashType & 31) !== Signature.SIGHASH_SINGLE && (sighashType & 31) !== Signature.SIGHASH_NONE) {
    if (midstates) {
      if (!midstates.outputsAll) midstates.outputsAll = GetOutputsHash(transaction)
      hashOutputs = midstates.outputsAll
    } else {
      hashOutputs = GetOutputsHash(transaction)
    }
  } else if ((sighashType & 31) === Signature.SIGHASH_SINGLE && inputNumber < transaction.outputs.length) {
    hashOutputs = GetOutputsHash(transaction, inputNumber)
  }

  var writer = new BufferWriter()

  // Version
  writer.writeInt32LE(transaction.version)

  // Input prevouts/nSequence (none/all, depending on flags)
  writer.write(hashPrevouts)
  writer.write(hashSequence)

  //  outpoint (32-byte hash + 4-byte little endian)
  writer.writeReverse(input.prevTxId)
  writer.writeUInt32LE(input.outputIndex)

  // scriptCode of the input (serialized as scripts inside CTxOuts)
  var scriptCode = subscript.toBuffer()
  writer.writeVarintNum(scriptCode.length)
  writer.write(scriptCode)

  // value of the output spent by this input (8-byte little endian)
  writer.writeUInt64LEBN(satoshisBN)

  // nSequence of the input (4-byte little endian)
  var sequenceNumber = input.sequenceNumber
  writer.writeUInt32LE(sequenceNumber)

  // Outputs (none/one/all, depending on flags)
  writer.write(hashOutputs)

  // Locktime
  writer.writeUInt32LE(transaction.nLockTime)

  // sighashType
  writer.writeUInt32LE(sighashType >>> 0)

  var buf = writer.toBuffer()
  return buf
}

/**
 * Returns a buffer with the which is hashed with sighash that needs to be signed
 * for OP_CHECKSIG.
 *
 * @name Signing.sighash
 * @param {Transaction} transaction the transaction to sign
 * @param {number} sighashType the type of the hash
 * @param {number} inputNumber the input index for the signature
 * @param {Script} subscript the script that will be signed
 * @param {satoshisBN} input's amount (for  ForkId signatures)
 *
 */
// The node's own scriptCode walk, over the BYTES, because that is what the node parses.
//
// `CTransactionSignatureSerializer::SerializeScriptCode` writes
// `WriteCompactSize(scriptCode.size() - nCodeSeparators)` and then the bytes up to the iterator
// left by the LAST, FAILED `GetOp`, with each separator excised — and `GetOp2` advances `pc`
// past the opcode, and past a complete length field, BEFORE it tests whether the rest is there:
//
//     unsigned int opcode = *pc++;
//     ...
//     } else if (opcode == OP_PUSHDATA2) { if (end() - pc < 2) return false; nSize = ReadLE16(&pc[0]); pc += 2; }
//     if (end() - pc < 0 || (unsigned int)(end() - pc) < nSize) return false;
//
// So the opcode and whatever length field it managed to read ARE written, the partial operand
// after them is not, and the length prefix still counts it. The node hashes a field that
// declares more bytes than it contains.
//
// This walks the serialized bytes rather than reading our chunk list, which matters for a
// HAND-ASSEMBLED script: in a parsed script an undecodable push is always the final chunk, but
// a chunk list built by hand can put one in the middle, and then the node stops there and drops
// everything after it. Asking the bytes is the only way to get that right, and it is also
// exactly what the node does.
//
// Measured against a compiled bitcoin-sv v1.2.3 on 2026-10-15: with this correction all 55 rows
// of the reference corpus in test/data/sighash-scriptcode-tail.json agree on the preimage AND
// the digest, where before 10 differed. `6a4c` is not among them — its partial prefix is empty,
// so the walk reaches the end and nothing is dropped.
//
// Returns where the walk stopped and how many separators it passed on the way.
function nodeScriptCodeWalk (buf) {
  var pos = 0
  var separators = 0
  while (pos < buf.length) {
    var start = pos
    var opcode = buf[pos++]
    if (opcode <= Opcode.OP_PUSHDATA4) {
      var size = 0
      if (opcode < Opcode.OP_PUSHDATA1) {
        size = opcode
      } else if (opcode === Opcode.OP_PUSHDATA1) {
        if (buf.length - pos < 1) { pos = start + 1; break }
        size = buf[pos++]
      } else if (opcode === Opcode.OP_PUSHDATA2) {
        if (buf.length - pos < 2) { pos = start + 1; break }
        size = buf.readUInt16LE(pos)
        pos += 2
      } else {
        if (buf.length - pos < 4) { pos = start + 1; break }
        size = buf.readUInt32LE(pos)
        pos += 4
      }
      // `pos` is already past the length field, which is why it is the stop position
      if (buf.length - pos < size) break
      pos += size
    } else if (opcode === Opcode.OP_CODESEPARATOR) {
      separators++
    }
  }
  return { stop: pos, separators: separators }
}

var sighashPreimage = function sighashPreimage (transaction, sighashType, inputNumber, subscript, satoshisBN, flags) {
  var Transaction = require('./transaction')
  var Input = require('./input')

  if (_.isUndefined(flags)) {
    flags = DEFAULT_SIGN_FLAGS
  }

  // Copy transaction
  var txcopy = Transaction.shallowCopy(transaction)

  // The BIP-143 path below only reads the script. The original algorithm
  // modifies it, so it takes its own copy there; copying a large script up
  // front cost more than the whole digest. Anything that is not a Script yet
  // is converted, as the copy did.
  if (!(subscript instanceof Script)) {
    subscript = new Script(subscript)
  }

  if (flags & Interpreter.SCRIPT_ENABLE_REPLAY_PROTECTION) {
    // Legacy chain's value for fork id must be of the form 0xffxxxx.
    // By xoring with 0xdead, we ensure that the value will be different
    // from the original one, even if it already starts with 0xff.
    var forkValue = sighashType >> 8
    var newForkValue = 0xff0000 | (forkValue ^ 0xdead)
    sighashType = (newForkValue << 8) | (sighashType & 0xff)
  }

  // Chronicle: SIGHASH_CHRONICLE selects the Original Transaction Digest Algorithm —
  // the path below — in preference to BIP-143.
  //
  // It has to OVERRIDE SIGHASH_FORKID rather than merely coexist with it. FORKID is
  // set on essentially every BSV signature written since 2018, so a CHRONICLE bit that
  // only took effect when FORKID was absent could never select OTDA in practice, and
  // the flag would mean nothing.
  //
  // Routed on the bit alone, not on whether Chronicle is enabled, which is what
  // the node does:
  //
  //   if(enabledSighashForkid && sigHashType.hasForkId() && !sigHashType.hasChronicle())
  //       return SignatureHashBIP143(...);
  //   return SignatureHashOriginal(...);
  //
  // The concern that made this gated is real — before the upgrade the 0x20 bit
  // meant nothing, so BIP-143 signatures exist whose type byte happens to set
  // it, and reinterpreting those as OTDA would be a disaster. The node answers
  // it in a different place: CheckSignatureEncoding rejects a signature
  // carrying the bit outside Chronicle as SCRIPT_ERR_ILLEGAL_CHRONICLE, so
  // such a signature never reaches this function. Gating here instead made 260
  // of the node's 1000 digest vectors disagree, because the digest for a given
  // transaction and hash type then depends on a flag the node does not consult.
  //
  // Note the sighash type byte is committed INSIDE the preimage either way, so setting
  // this bit changes the digest even where it does not change the algorithm.
  if ((sighashType & Signature.SIGHASH_FORKID) &&
      !(sighashType & Signature.SIGHASH_CHRONICLE) &&
      (flags & Interpreter.SCRIPT_ENABLE_SIGHASH_FORKID)) {
    return sighashPreimageForForkId(txcopy, sighashType, inputNumber, subscript, satoshisBN)
  }

  // For no ForkId sighash, separators need to be removed — from a copy. The bytes BEFORE
  // removal are what the node's walk is defined over.
  var codeBytes = subscript.toBuffer()
  subscript = new Script(subscript)
  subscript.removeCodeseparators()

  var i

  for (i = 0; i < txcopy.inputs.length; i++) {
    // Blank signatures for other inputs
    txcopy.inputs[i] = new Input(txcopy.inputs[i]).setScript(Script.empty())
  }

  var signedInput = new Input(txcopy.inputs[inputNumber]).setScript(subscript)

  // Where the node's walk stops, the field it writes declares more bytes than it carries; see
  // nodeScriptCodeWalk. `codeBytes` is taken BEFORE separator removal, because the node counts
  // only the separators its own walk reaches.
  var walk = nodeScriptCodeWalk(codeBytes)
  if (walk.stop < codeBytes.length) {
    var reached = new Script(codeBytes.slice(0, walk.stop))
    reached.removeCodeseparators()
    signedInput.setScript(reached.toBuffer())
    signedInput._scriptCodeLength = codeBytes.length - walk.separators
  }

  txcopy.inputs[inputNumber] = signedInput

  if ((sighashType & 31) === Signature.SIGHASH_NONE ||
    (sighashType & 31) === Signature.SIGHASH_SINGLE) {
    // clear all sequenceNumbers
    for (i = 0; i < txcopy.inputs.length; i++) {
      if (i !== inputNumber) {
        txcopy.inputs[i].sequenceNumber = 0
      }
    }
  }

  if ((sighashType & 31) === Signature.SIGHASH_NONE) {
    txcopy.outputs = []
  } else if ((sighashType & 31) === Signature.SIGHASH_SINGLE) {
    // The SIGHASH_SINGLE bug.
    // https://bitcointalk.org/index.php?topic=260595.0
    if (inputNumber >= txcopy.outputs.length) {
      return SIGHASH_SINGLE_BUG
    }

    txcopy.outputs.length = inputNumber + 1

    for (i = 0; i < inputNumber; i++) {
      txcopy.outputs[i] = new Output({
        satoshis: BN.fromBuffer(buffer.Buffer.from(BITS_64_ON, 'hex')),
        script: Script.empty()
      })
    }
  }

  if (sighashType & Signature.SIGHASH_ANYONECANPAY) {
    txcopy.inputs = [txcopy.inputs[inputNumber]]
  }

  var buf = new BufferWriter()
    .write(txcopy.toBuffer())
    .writeInt32LE(sighashType)
    .toBuffer()
  return buf
}

/**
 * Returns a buffer of length 32 bytes with the hash that needs to be signed
 * for OP_CHECKSIG.
 *
 * @name Signing.sighash
 * @param {Transaction} transaction the transaction to sign
 * @param {number} sighashType the type of the hash
 * @param {number} inputNumber the input index for the signature
 * @param {Script} subscript the script that will be signed
 * @param {satoshisBN} input's amount (for  ForkId signatures)
 *
 */
var sighash = function sighash (transaction, sighashType, inputNumber, subscript, satoshisBN, flags) {
  var preimage = sighashPreimage(transaction, sighashType, inputNumber, subscript, satoshisBN, flags)
  if (preimage.compare(SIGHASH_SINGLE_BUG) === 0) return preimage
  var ret = Hash.sha256sha256(preimage)
  ret = new BufferReader(ret).readReverse()
  return ret
}

/**
 * Create a signature
 *
 * @name Signing.sign
 * @param {Transaction} transaction
 * @param {PrivateKey} privateKey
 * @param {number} sighash
 * @param {number} inputIndex
 * @param {Script} subscript
 * @param {satoshisBN} input's amount
 * @return {Signature}
 */
function sign (transaction, privateKey, sighashType, inputIndex, subscript, satoshisBN, flags) {
  var hashbuf = sighash(transaction, sighashType, inputIndex, subscript, satoshisBN, flags)

  var sig = ECDSA.sign(hashbuf, privateKey, 'little').set({
    nhashtype: sighashType
  })
  return sig
}

/**
 * Verify a signature
 *
 * @name Signing.verify
 * @param {Transaction} transaction
 * @param {Signature} signature
 * @param {PublicKey} publicKey
 * @param {number} inputIndex
 * @param {Script} subscript
 * @param {satoshisBN} input's amount
 * @param {flags} verification flags
 * @return {boolean}
 */
function verify (transaction, signature, publicKey, inputIndex, subscript, satoshisBN, flags) {
  $.checkArgument(!_.isUndefined(transaction))
  $.checkArgument(!_.isUndefined(signature) && !_.isUndefined(signature.nhashtype))
  var hashbuf = sighash(transaction, signature.nhashtype, inputIndex, subscript, satoshisBN, flags)
  return ECDSA.verify(hashbuf, signature, publicKey, 'little')
}

/**
 * @namespace Signing
 */
module.exports = {
  sighashPreimage: sighashPreimage,
  sighash: sighash,
  sign: sign,
  verify: verify
}
