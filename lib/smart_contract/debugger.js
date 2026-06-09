'use strict'
/**
 * SmartContract.trace — a covenant stack debugger.
 *
 * Step-traces a locking/unlocking pair through Script.Interpreter and records the
 * stack + alt-stack after every opcode, so you can watch an OP_PUSH_TX covenant
 * build its signature and enforce its constraints. Uses the interpreter's
 * stepListener hook. Call SmartContract.enableGenesis() first for OP_PUSH_TX
 * covenants (their preimage element / opcode count exceed pre-Genesis limits).
 */

var bsv = require('../..')
var helpers = require('./covenant_helpers')

function opLabel (opcodenum) {
  if (opcodenum === 0) return 'OP_0'
  if (opcodenum >= 1 && opcodenum <= 75) return 'PUSH(' + opcodenum + ')'
  if (opcodenum === 76) return 'OP_PUSHDATA1'
  if (opcodenum === 77) return 'OP_PUSHDATA2'
  if (opcodenum === 78) return 'OP_PUSHDATA4'
  try { return bsv.Opcode.fromNumber(opcodenum).toString() } catch (e) { return '0x' + opcodenum.toString(16) }
}

function hex (buf, max) {
  max = max || 16
  var h = Buffer.from(buf).toString('hex')
  return h.length <= max * 2 ? (h || '0') : h.slice(0, max * 2) + '...(' + buf.length + 'B)'
}

/**
 * @returns {{ ok:boolean, err:string, steps:Array<{phase,op,stack,altstack}> }}
 */
function trace (unlock, lock, opts) {
  opts = opts || {}
  var interp = new bsv.Script.Interpreter()
  var steps = []
  interp.stepListener = function (step, stack, altstack) {
    steps.push({
      phase: interp.script === lock ? 'lock' : 'unlock',
      op: opLabel(step.opcode && typeof step.opcode.toNumber === 'function' ? step.opcode.toNumber() : step.opcode.num),
      stack: stack.map(function (b) { return hex(b) }),
      altstack: altstack.map(function (b) { return hex(b) })
    })
  }
  var ok = interp.verify(
    unlock, lock,
    opts.tx || new bsv.Transaction(),
    opts.inputIndex || 0,
    typeof opts.flags === 'number' ? opts.flags : helpers.flags(),
    new bsv.crypto.BN(opts.satoshis || 0)
  )
  return { ok: ok, err: interp.errstr || '', steps: steps }
}

/** Pretty-print a trace result to a string. */
function format (result) {
  var lines = []
  var phase = null
  result.steps.forEach(function (s, i) {
    if (s.phase !== phase) { lines.push('-- ' + s.phase + ' script --'); phase = s.phase }
    var stk = s.stack.length ? s.stack.join(' | ') : '(empty)'
    var alt = s.altstack.length ? '   alt:[' + s.altstack.join(' | ') + ']' : ''
    lines.push(String(i).padStart(3) + '  ' + s.op.padEnd(16) + ' -> [' + stk + ']' + alt)
  })
  lines.push((result.ok ? 'VALID' : 'INVALID') + (result.err ? ' (' + result.err + ')' : ''))
  return lines.join('\n')
}

function print (result) { console.log(format(result)); return result } // eslint-disable-line no-console

module.exports = { trace: trace, format: format, print: print, opLabel: opLabel }
