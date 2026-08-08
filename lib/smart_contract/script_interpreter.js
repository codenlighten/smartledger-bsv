/**
 * script_interpreter_debugger.js
 * ---------------------------------------------------------------
 * Universal Bitcoin Script Interpreter Debugger for BSV
 * Browser + Node.js compatible
 * ---------------------------------------------------------------
 * Usage:
 *   node script_interpreter_debugger.js [options]
 *
 * Options:
 *   --unlocking <hex|asm>     Unlocking script (input scriptSig)
 *   --locking <hex|asm>       Locking script (output scriptPubKey)
 *   --combined <hex|asm>      Combined script (unlocking + locking)
 *   --step                    Step through opcode-by-opcode
 *   --truth                   Run full verification (TRUE/FALSE)
 *
 * Examples:
 *   node script_interpreter_debugger.js --locking "76a91489abcdefabbaabbaabbaabbaabbaabbaabbaabba88ac" --unlocking "4104abcd1234...ac" --truth
 *   node script_interpreter_debugger.js --combined "OP_DUP OP_HASH160 <pubKeyHash> OP_EQUALVERIFY OP_CHECKSIG" --step
 */

// Browser-safe requires
let readline = null
try {
  // Only require readline in Node.js environment
  if (typeof window === 'undefined' && typeof require !== 'undefined') {
    readline = require('readline')
  }
} catch (err) {
  // Gracefully handle missing readline in browser
  readline = null
}

const _global = (typeof window !== 'undefined' && window.bsv) ? window.bsv : null
const Script = _global ? _global.Script : require('../script')
const Interpreter = _global ? _global.Script.Interpreter : require('../script/interpreter')
const Opcode = _global ? _global.Opcode : require('../opcode')
const BN = _global ? _global.crypto.BN : require('../crypto/bn')
const Transaction = _global ? _global.Transaction : require('../transaction')
const Input = _global ? _global.Transaction.Input : require('../transaction/input')
const Output = _global ? _global.Transaction.Output : require('../transaction/output')

// Debug: Show Script Interpreter module structure (uncomment to inspect)
// const ScriptInterpreter = Interpreter;
// console.log("Script Interpreter Module:", ScriptInterpreter);
/**
 * Parse input as either ASM or HEX.
 */
function parseScript (input) {
  if (!input) return new Script()
  const trimmed = input.trim()
  const isHex = /^[0-9a-fA-F]+$/.test(trimmed.replace(/\s+/g, ''))
  try {
    return isHex
      ? Script.fromHex(trimmed)
      : Script.fromASM(trimmed)
  } catch (err) {
    console.error('❌ Error parsing script:', err.message)
    process.exit(1)
  }
}

/**
 * Display stack contents in readable format.
 */
function printStack (stack, altstack = []) {
  const fmt = (b) => (b.length ? b.toString('hex') : '(empty)')
  const top = stack.map(fmt)
  console.log('Stack:', top.length ? top : ['(empty)'])
  if (altstack.length) console.log('AltStack:', altstack.map(fmt))
}

/**
 * Execute script step-by-step with optional interactivity.
 */
async function stepThroughScript (combinedScript, tx, verbose = true) {
  const interpreter = new Interpreter()
  interpreter.script = combinedScript
  interpreter.tx = tx
  interpreter.nIn = 0
  interpreter.flags = Interpreter.SCRIPT_ENABLE_SIGHASH_FORKID

  const chunks = combinedScript.chunks

  // Browser compatibility check for readline
  let rl = null
  if (readline && typeof process !== 'undefined' && process.stdin) {
    rl = readline.createInterface({
      input: process.stdin,
      output: process.stdout
    })
  }

  console.log('===========================================')
  console.log('🔍 SCRIPT INTERPRETER DEBUGGER (STEP MODE)')
  console.log('===========================================\n')
  console.log('Script:', combinedScript.toASM())
  console.log('-------------------------------------------')

  for (let i = 0; i < chunks.length; i++) {
    const chunk = chunks[i]
    const opname = Opcode.reverseMap[chunk.opcodenum] || 'PUSH'

    if (verbose && rl) {
      await new Promise((resolve) =>
        rl.question(`\n[${i + 1}/${chunks.length}] Step (${opname}) — press Enter to execute...`, resolve)
      )
    } else if (verbose) {
      console.log(`\n[${i + 1}/${chunks.length}] Step (${opname})`)
    }

    try {
      // Check if step method exists (compatibility check)
      if (typeof interpreter.step === 'function') {
        interpreter.step()
      } else {
        console.log('⚠️ Step-by-step execution not supported in this BSV version')
        console.log('💡 Consider using runFullEvaluation instead')
        break
      }

      console.log(`🧩 Executed: ${opname}`)
      printStack(interpreter.stack, interpreter.altstack)
    } catch (err) {
      console.log(`⚠️  Error executing ${opname}: ${err.message}`)
      break
    }
  }

  if (rl) rl.close()
  console.log('\n===========================================')
  console.log('✅ Final Stack State:')
  printStack(interpreter.stack || [], interpreter.altstack || [])
  console.log('===========================================')
}

/**
 * Run complete truth evaluation (non-interactive)
 */
function runFullEvaluation (unlockingScript, lockingScript, tx) {
  console.log('===========================================')
  console.log('🔍 SCRIPT INTERPRETER DEBUGGER (FULL RUN)')
  console.log('===========================================\n')

  const interpreter = new Interpreter()

  // For smartledger-bsv, need to provide satoshisBN parameter
  const satoshisBN = new BN(100000) // 100,000 satoshis

  const verified = interpreter.verify(
    unlockingScript,
    lockingScript,
    tx,
    0,
    Interpreter.SCRIPT_ENABLE_SIGHASH_FORKID,
    satoshisBN
  )

  console.log('🔐 Locking Script:', lockingScript.toASM())
  console.log('🔓 Unlocking Script:', unlockingScript.toASM())
  console.log('-------------------------------------------')
  console.log('✅ Result:', verified ? 'TRUE (Success)' : '❌ FALSE (Failure)')
  console.log('Final Stack:', interpreter.stack.map((b) => b.toString('hex')))
  console.log('AltStack:', interpreter.altstack.map((b) => b.toString('hex')))
  console.log('===========================================')
}

/**
 * Main entrypoint
 */
async function main () {
  // Browser compatibility check
  if (typeof process === 'undefined' || !process.argv) {
    console.log('⚙️ CLI mode not available in browser environment')
    return
  }

  const args = process.argv.slice(2)
  const getArg = (name) => {
    const idx = args.indexOf(name)
    return idx !== -1 && args[idx + 1] ? args[idx + 1] : null
  }

  const unlockingInput = getArg('--unlocking')
  const lockingInput = getArg('--locking')
  const combinedInput = getArg('--combined')
  const stepMode = args.includes('--step')
  const truthMode = args.includes('--truth')

  // Build scripts
  let unlockingScript, lockingScript, combinedScript
  if (combinedInput) {
    combinedScript = parseScript(combinedInput)
  } else {
    unlockingScript = parseScript(unlockingInput)
    lockingScript = parseScript(lockingInput)
    const combinedBuf = Buffer.concat([
      unlockingScript.toBuffer(),
      lockingScript.toBuffer()
    ])
    combinedScript = Script.fromBuffer(combinedBuf)
  }

  // Dummy TX context for interpreter
  const tx = new Transaction()

  // Create proper input with UTXO information
  const dummyInput = new Input({
    prevTxId: '0'.repeat(64),
    outputIndex: 0,
    script: Script.empty(),
    satoshis: 100000,
    output: new Output({
      satoshis: 100000,
      script: Script.empty()
    })
  })

  tx.addInput(dummyInput)
  tx.addOutput(new Output({ satoshis: 100000, script: Script.empty() }))

  if (stepMode) {
    await stepThroughScript(combinedScript, tx, true)
  } else if (truthMode) {
    runFullEvaluation(unlockingScript || Script.empty(), lockingScript || Script.empty(), tx)
  } else {
    console.log('⚙️  No mode specified. Use --step or --truth')
  }
}

// Export functions for module usage
module.exports = {
  parseScript,
  printStack,
  stepThroughScript,
  runFullEvaluation,
  main
}

// CLI execution
if (typeof require !== 'undefined' && require.main === module) {
  main()
}
