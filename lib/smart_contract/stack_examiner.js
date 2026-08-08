/**
 * Stack Examination Tool (Browser + Node.js compatible)
 * -----------------------------------------
 * Run with:
 *   node stack_examiner.js <locking_script_hex> <unlocking_script_hex>
 *
 * Example:
 *   node stack_examiner.js "76a91489abcdefabbaabbaabbaabbaabbaabbaabbaabba88ac" "512103abcdef..."
 *
 * Browser usage:
 *   const examiner = require('./stack_examiner.js');
 *   examiner.runScript(lockingHex, unlockingHex);
 */

// Browser-safe require
const _global = (typeof window !== 'undefined' && window.bsv) ? window.bsv : null
const Script = _global ? _global.Script : require('../script')
const Interpreter = _global ? _global.Script.Interpreter : require('../script/interpreter')
const Opcode = _global ? _global.Opcode : require('../opcode')
const Transaction = _global ? _global.Transaction : require('../transaction')
const Input = _global ? _global.Transaction.Input : require('../transaction/input')
const Output = _global ? _global.Transaction.Output : require('../transaction/output')
const BN = _global ? _global.crypto.BN : require('../crypto/bn')
const util = require('util')

function bufferToHexArray (stack) {
  return stack.map((buf) => buf.toString('hex'))
}

/**
 * Executes a locking/unlocking script and prints intermediate stack states.
 */
function runScript (lockingHex, unlockingHex) {
  console.log('===========================================')
  console.log('🔍 STACK EXAMINATION TOOL')
  console.log('===========================================\n')

  console.log('🔐 Locking Script:', lockingHex)
  console.log('🔓 Unlocking Script:', unlockingHex)
  console.log('-------------------------------------------')

  try {
    const lockingScript = Script.fromHex(lockingHex)
    const unlockingScript = Script.fromHex(unlockingHex)

    const combined = Script.fromBuffer(
      Buffer.concat([unlockingScript.toBuffer(), lockingScript.toBuffer()])
    )

    const interpreter = new Interpreter()
    const tx = new Transaction()

    // Create proper transaction context
    const dummyInput = new Input({
      prevTxId: '0'.repeat(64),
      outputIndex: 0,
      script: Script.empty()
    })

    tx.addInput(dummyInput)
    tx.addOutput(new Output({
      satoshis: 100000,
      script: lockingScript
    }))

    const scriptChunks = combined.chunks
    const sandbox = new Interpreter()
    sandbox.script = combined
    sandbox.tx = tx
    sandbox.nIn = 0
    sandbox.flags = Interpreter.SCRIPT_ENABLE_SIGHASH_FORKID

    // Step through each opcode
    for (let i = 0; i < scriptChunks.length; i++) {
      const chunk = scriptChunks[i]
      try {
        // Check if step method exists (compatibility check)
        if (typeof sandbox.step === 'function') {
          sandbox.step()
        } else {
          console.log('⚠️ Step-by-step execution not supported in this BSV version')
          break
        }

        console.log(`\n🧩 Step ${i + 1}: ${Opcode.reverseMap[chunk.opcodenum] || 'PUSH'}`)
        console.log('Stack:', bufferToHexArray(sandbox.stack))
        console.log('AltStack:', bufferToHexArray(sandbox.altstack))
      } catch (err) {
        console.log(`⚠️ Error executing opcode ${i + 1}:`, err.message)
        break
      }
    }

    // Final verification with proper satoshis parameter
    const satoshisBN = new BN(100000)
    const verified = interpreter.verify(
      unlockingScript,
      lockingScript,
      tx,
      0,
      Interpreter.SCRIPT_ENABLE_SIGHASH_FORKID,
      satoshisBN
    )

    console.log('\n===========================================')
    console.log('✅ Final Result:', verified ? 'TRUE (Success)' : '❌ FALSE (Failure)')
    console.log('Final Stack:', bufferToHexArray(sandbox.stack || []))
    console.log('AltStack:', bufferToHexArray(sandbox.altstack || []))
    console.log('===========================================')

    return verified
  } catch (err) {
    console.error('❌ Error in script execution:', err.message)
    return false
  }
}

// ============================================
// CLI Entrypoint
// ============================================
if (typeof require !== 'undefined' && require.main === module) {
  if (process.argv.length < 4) {
    console.log('Usage: node stack_examiner.js <locking_script_hex> <unlocking_script_hex>')
    process.exit(1)
  }

  const locking = process.argv[2]
  const unlocking = process.argv[3]
  runScript(locking, unlocking)
}

// Export for module usage
module.exports = {
  runScript,
  bufferToHexArray
}
