#!/usr/bin/env node
'use strict'

/**
 * SmartLedger BSV CLI
 * Command-line tools for DID:web, VC-JWT, and StatusList2021
 */

var fs = require('fs')
var path = require('path')
var didweb = require('../lib/didweb')
var vcjwt = require('../lib/vcjwt')
var statuslist = require('../lib/statuslist')
var anchor = require('../lib/anchor')

var args = process.argv.slice(2)
var command = args[0]
var subcommand = args[1]

// Helper to parse command-line arguments
function parseArgs(args) {
  var opts = {}
  for (var i = 0; i < args.length; i++) {
    if (args[i].startsWith('--')) {
      var key = args[i].slice(2)
      var value = args[i + 1]
      opts[key] = value
      i++
    }
  }
  return opts
}

// Helper to read JSON file
function readJsonFile(filepath) {
  var content = fs.readFileSync(filepath, 'utf8')
  return JSON.parse(content)
}

// Helper to write JSON file
function writeJsonFile(filepath, data) {
  fs.writeFileSync(filepath, JSON.stringify(data, null, 2))
}

async function main() {
  if (!command) {
    console.log('SmartLedger BSV CLI v3.4.0')
    console.log('')
    console.log('Usage:')
    console.log('  smartledger-bsv didweb <subcommand> [options]')
    console.log('  smartledger-bsv vc <subcommand> [options]')
    console.log('  smartledger-bsv status <subcommand> [options]')
    console.log('  smartledger-bsv anchor <subcommand> [options]')
    console.log('')
    console.log('DID:web Commands:')
    console.log('  didweb init --domain <domain> [--alg ES256|ES256K]')
    console.log('  didweb rotate --domain <domain> --key <key-file>')
    console.log('')
    console.log('VC Commands:')
    console.log('  vc issue --issuer <did> --subject <did> --types <types> --claims <json>')
    console.log('  vc verify <jwt-file>')
    console.log('')
    console.log('Status List Commands:')
    console.log('  status create --issuer <did>')
    console.log('  status set --list <file> --index <n> --status <revoked|suspended|valid>')
    console.log('  status check --list <file> --index <n>')
    console.log('')
    console.log('Anchor Commands:')
    console.log('  anchor hash <data-file>')
    console.log('  anchor build --kind <type> --hash <hash> --issuer <did>')
    process.exit(0)
  }

  var opts = parseArgs(args.slice(2))

  try {
    if (command === 'didweb') {
      await handleDidWeb(subcommand, opts)
    } else if (command === 'vc') {
      await handleVc(subcommand, opts)
    } else if (command === 'status') {
      await handleStatus(subcommand, opts)
    } else if (command === 'anchor') {
      await handleAnchor(subcommand, opts)
    } else {
      console.error('Unknown command:', command)
      process.exit(1)
    }
  } catch (error) {
    console.error('Error:', error.message)
    process.exit(1)
  }
}

async function handleDidWeb(subcommand, opts) {
  if (subcommand === 'init') {
    if (!opts.domain) {
      console.error('--domain is required')
      process.exit(1)
    }

    var alg = opts.alg || 'ES256'
    console.error('Generating ' + alg + ' keys for domain: ' + opts.domain)

    // Generate keys
    var keys = await didweb.generateIssuerKeys({ alg: alg })
    
    // Build DID documents
    var docs = didweb.buildDidWebDocuments({
      domain: opts.domain,
      p256: alg === 'ES256' ? { jwk: keys.publicJwk, kid: keys.kid } : undefined,
      k1: alg === 'ES256K' ? { jwk: keys.publicJwk, kid: keys.kid } : undefined,
      controllerName: opts.name || 'SmartLedger Issuer'
    })

    // Create .well-known directory
    var wellKnownDir = path.join(process.cwd(), '.well-known')
    if (!fs.existsSync(wellKnownDir)) {
      fs.mkdirSync(wellKnownDir, { recursive: true })
    }

    // Write did.json
    var didPath = path.join(wellKnownDir, 'did.json')
    writeJsonFile(didPath, docs.didDocument)
    console.error('✅ Created:', didPath)

    // Write jwks.json
    var jwksPath = path.join(wellKnownDir, 'jwks.json')
    writeJsonFile(jwksPath, docs.jwks)
    console.error('✅ Created:', jwksPath)

    // Write private key to secure file
    var keyPath = path.join(process.cwd(), 'issuer-key-' + keys.kid + '.json')
    writeJsonFile(keyPath, {
      kid: keys.kid,
      alg: keys.alg,
      privateJwk: keys.privateJwk,
      publicJwk: keys.publicJwk,
      did: docs.did
    })
    console.error('✅ Created private key:', keyPath)
    console.error('⚠️  KEEP THIS FILE SECURE AND ENCRYPTED!')
    
    console.error('')
    console.error('DID:', docs.did)
    console.error('')
    console.error('Next steps:')
    console.error('1. Host .well-known/did.json and .well-known/jwks.json at https://' + opts.domain)
    console.error('2. Encrypt and securely store ' + keyPath)
    console.error('3. Issue credentials with: smartledger-bsv vc issue ...')

  } else if (subcommand === 'rotate') {
    console.error('Key rotation coming soon')
  } else {
    console.error('Unknown didweb subcommand:', subcommand)
    process.exit(1)
  }
}

async function handleVc(subcommand, opts) {
  if (subcommand === 'issue') {
    if (!opts.issuer || !opts.subject || !opts.claims) {
      console.error('--issuer, --subject, and --claims are required')
      process.exit(1)
    }

    // Load issuer key
    var keyFile = opts.key || 'issuer-key.json'
    if (!fs.existsSync(keyFile)) {
      console.error('Issuer key file not found:', keyFile)
      console.error('Use --key to specify the key file')
      process.exit(1)
    }

    var keyData = readJsonFile(keyFile)
    var claims = JSON.parse(opts.claims)
    var types = opts.types ? opts.types.split(',') : ['VerifiableCredential']

    console.error('Issuing credential...')
    console.error('  Issuer:', opts.issuer)
    console.error('  Subject:', opts.subject)
    console.error('  Types:', types.join(', '))

    var result = await vcjwt.issueVcJwt({
      issuerDid: opts.issuer,
      subjectId: opts.subject,
      types: types,
      credentialSubject: claims,
      privateJwk: keyData.privateJwk,
      alg: keyData.alg || 'ES256',
      kid: keyData.kid
    })

    console.log(result.jwt)
    console.error('✅ Credential issued successfully')

  } else if (subcommand === 'verify') {
    var jwtFile = opts.jwt || args[2]
    if (!jwtFile) {
      console.error('JWT file required')
      process.exit(1)
    }

    var jwt = fs.readFileSync(jwtFile, 'utf8').trim()
    
    console.error('Verifying credential...')
    
    // Simple resolver that reads from .well-known
    var didResolver = async function(did) {
      var domain = did.replace('did:web:', '').replace(/%3A/g, ':')
      var jwksPath = path.join(process.cwd(), '.well-known', 'jwks.json')
      
      if (fs.existsSync(jwksPath)) {
        return readJsonFile(jwksPath)
      }
      
      throw new Error('Cannot resolve DID: ' + did)
    }

    var result = await vcjwt.verifyVcJwt(jwt, { didResolver: didResolver })
    
    if (result.valid) {
      console.error('✅ Credential is VALID')
      console.log(JSON.stringify(result.payload, null, 2))
    } else {
      console.error('❌ Credential is INVALID')
      console.error('Error:', result.error)
      process.exit(1)
    }

  } else {
    console.error('Unknown vc subcommand:', subcommand)
    process.exit(1)
  }
}

async function handleStatus(subcommand, opts) {
  if (subcommand === 'create') {
    if (!opts.issuer) {
      console.error('--issuer is required')
      process.exit(1)
    }

    var keyFile = opts.key || 'issuer-key.json'
    if (!fs.existsSync(keyFile)) {
      console.error('Issuer key file not found:', keyFile)
      process.exit(1)
    }

    var keyData = readJsonFile(keyFile)
    
    console.error('Creating status list...')
    
    var result = await statuslist.createStatusList({
      issuerDid: opts.issuer,
      privateJwk: keyData.privateJwk
    })

    console.log(result.listVcJwt)
    console.error('✅ Status list created')
    console.error('List ID:', result.listId)

  } else if (subcommand === 'set') {
    if (!opts.list || opts.index === undefined || !opts.status) {
      console.error('--list, --index, and --status are required')
      process.exit(1)
    }

    var listJwt = fs.readFileSync(opts.list, 'utf8').trim()
    var keyFile = opts.key || 'issuer-key.json'
    var keyData = readJsonFile(keyFile)

    console.error('Updating status list...')
    console.error('  Index:', opts.index)
    console.error('  Status:', opts.status)

    var result = await statuslist.updateStatusList({
      listVcJwt: listJwt,
      index: parseInt(opts.index),
      status: opts.status,
      privateJwk: keyData.privateJwk
    })

    console.log(result.listVcJwt)
    console.error('✅ Status list updated')

  } else if (subcommand === 'check') {
    if (!opts.list || opts.index === undefined) {
      console.error('--list and --index are required')
      process.exit(1)
    }

    var listJwt = fs.readFileSync(opts.list, 'utf8').trim()
    
    var status = statuslist.getCredentialStatusEntry({
      listVcJwt: listJwt,
      index: parseInt(opts.index)
    })

    console.log(status)
    console.error('Status at index', opts.index + ':', status)

  } else {
    console.error('Unknown status subcommand:', subcommand)
    process.exit(1)
  }
}

async function handleAnchor(subcommand, opts) {
  if (subcommand === 'hash') {
    var dataFile = args[2]
    if (!dataFile) {
      console.error('Data file required')
      process.exit(1)
    }

    var data = fs.readFileSync(dataFile)
    var hash = anchor.sha256Hex(data)
    
    console.log(hash)
    console.error('SHA-256 hash:', hash)

  } else if (subcommand === 'build') {
    if (!opts.kind || !opts.hash || !opts.issuer) {
      console.error('--kind, --hash, and --issuer are required')
      process.exit(1)
    }

    var payload = anchor.buildAnchorPayload({
      kind: opts.kind,
      hash: opts.hash,
      issuerDid: opts.issuer,
      issuedAt: opts.timestamp
    })

    console.log(payload.json)
    console.error('✅ Anchor payload created')
    console.error('Size:', payload.json.length, 'bytes')

  } else {
    console.error('Unknown anchor subcommand:', subcommand)
    process.exit(1)
  }
}

main().catch(function(error) {
  console.error('Fatal error:', error)
  process.exit(1)
})
