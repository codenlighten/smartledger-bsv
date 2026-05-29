'use strict'

// End-to-end smoke test for `bin/cli.js`.
//
// Exercises every subcommand advertised in the README quickstart:
//   didweb init  → vc issue → vc verify
//   status create → status set → status check
//   anchor hash  → anchor build
//
// Each test runs the CLI in an isolated temp directory so the files it
// drops (.well-known/did.json, issuer-key-<kid>.json, etc.) don't pollute
// the repo. We assert on stdout/stderr/exit-code only — the CLI's primary
// output is stdout, status messages go to stderr.

var expect = require('chai').expect
var spawnSync = require('child_process').spawnSync
var fs = require('fs')
var os = require('os')
var path = require('path')

var REPO_ROOT = path.resolve(__dirname, '..', '..')
var CLI = path.join(REPO_ROOT, 'bin', 'cli.js')
var PKG_VERSION = require(path.join(REPO_ROOT, 'package.json')).version

function runCli(args, opts) {
  opts = opts || {}
  var result = spawnSync(process.execPath, [CLI].concat(args), {
    cwd: opts.cwd || REPO_ROOT,
    encoding: 'utf8',
    timeout: 15000,
    env: Object.assign({}, process.env, opts.env || {})
  })
  return {
    stdout: result.stdout || '',
    stderr: result.stderr || '',
    code: result.status,
    signal: result.signal
  }
}

describe('CLI smoke', function () {
  this.timeout(20000) // crypto + JWT signing can be slow on cold start

  var tmpDir

  beforeEach(function () {
    tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'bsv-cli-smoke-'))
  })

  afterEach(function () {
    try {
      fs.rmSync(tmpDir, { recursive: true, force: true })
    } catch (e) { /* best-effort cleanup */ }
  })

  describe('meta', function () {
    it('--version prints package.json version', function () {
      var r = runCli(['--version'])
      expect(r.code).to.equal(0)
      expect(r.stdout.trim()).to.equal(PKG_VERSION)
    })

    it('-v is an alias for --version', function () {
      var r = runCli(['-v'])
      expect(r.code).to.equal(0)
      expect(r.stdout.trim()).to.equal(PKG_VERSION)
    })

    it('no args prints the help banner with the current version', function () {
      var r = runCli([])
      expect(r.code).to.equal(0)
      expect(r.stdout).to.include('SmartLedger BSV CLI v' + PKG_VERSION)
      expect(r.stdout).to.include('didweb init')
      expect(r.stdout).to.include('vc issue')
      expect(r.stdout).to.include('status create')
      expect(r.stdout).to.include('anchor hash')
    })

    it('--help prints the help banner', function () {
      var r = runCli(['--help'])
      expect(r.code).to.equal(0)
      expect(r.stdout).to.include('Usage:')
    })

    it('unknown top-level command exits non-zero', function () {
      var r = runCli(['nope'])
      expect(r.code).to.not.equal(0)
      expect(r.stderr).to.match(/Unknown command/i)
    })
  })

  describe('didweb', function () {
    it('init --domain creates .well-known files and an issuer key', function () {
      var r = runCli(['didweb', 'init', '--domain', 'example.com', '--alg', 'ES256'], { cwd: tmpDir })
      expect(r.code, r.stderr).to.equal(0)

      var didPath = path.join(tmpDir, '.well-known', 'did.json')
      var jwksPath = path.join(tmpDir, '.well-known', 'jwks.json')
      expect(fs.existsSync(didPath), 'did.json missing').to.equal(true)
      expect(fs.existsSync(jwksPath), 'jwks.json missing').to.equal(true)

      var didDoc = JSON.parse(fs.readFileSync(didPath, 'utf8'))
      expect(didDoc.id).to.equal('did:web:example.com')

      var jwks = JSON.parse(fs.readFileSync(jwksPath, 'utf8'))
      expect(jwks.keys).to.be.an('array').with.length.greaterThan(0)
      expect(jwks.keys[0].kty).to.be.a('string')

      // Issuer key file is named issuer-key-<kid>.json
      var keyFiles = fs.readdirSync(tmpDir).filter(function (f) {
        return f.startsWith('issuer-key-') && f.endsWith('.json')
      })
      expect(keyFiles, 'issuer key not written').to.have.length(1)

      var keyData = JSON.parse(fs.readFileSync(path.join(tmpDir, keyFiles[0]), 'utf8'))
      expect(keyData.did).to.equal('did:web:example.com')
      expect(keyData.privateJwk).to.be.an('object')
      expect(keyData.publicJwk).to.be.an('object')
      expect(keyData.alg).to.equal('ES256')
    })

    it('init --alg ES256K produces a secp256k1 key', function () {
      var r = runCli(['didweb', 'init', '--domain', 'example.org', '--alg', 'ES256K'], { cwd: tmpDir })
      expect(r.code, r.stderr).to.equal(0)

      var keyFiles = fs.readdirSync(tmpDir).filter(function (f) {
        return f.startsWith('issuer-key-')
      })
      var keyData = JSON.parse(fs.readFileSync(path.join(tmpDir, keyFiles[0]), 'utf8'))
      expect(keyData.alg).to.equal('ES256K')
    })

    it('init without --domain exits non-zero', function () {
      var r = runCli(['didweb', 'init'], { cwd: tmpDir })
      expect(r.code).to.not.equal(0)
      expect(r.stderr).to.match(/--domain is required/)
    })
  })

  describe('vc → status → anchor end-to-end', function () {
    // One big sequenced test that uses didweb init's output to issue,
    // verify, anchor, and revoke a credential — mirrors the README's
    // quickstart exactly.
    it('full credential lifecycle', function () {
      // 1. Init a DID:web issuer
      var initRes = runCli(['didweb', 'init', '--domain', 'example.com', '--alg', 'ES256'], { cwd: tmpDir })
      expect(initRes.code, initRes.stderr).to.equal(0)

      // The CLI writes the key file as issuer-key-<kid>.json but `vc issue`
      // looks for `issuer-key.json` by default. Rename so we can use the
      // default --key path.
      var keyFile = fs.readdirSync(tmpDir).filter(function (f) {
        return f.startsWith('issuer-key-')
      })[0]
      fs.renameSync(path.join(tmpDir, keyFile), path.join(tmpDir, 'issuer-key.json'))

      // 2. Issue a credential
      var issueRes = runCli([
        'vc', 'issue',
        '--issuer', 'did:web:example.com',
        '--subject', 'did:example:alice',
        '--types', 'VerifiableCredential,AgeCredential',
        '--claims', JSON.stringify({ ageOver: 18, country: 'US' })
      ], { cwd: tmpDir })
      expect(issueRes.code, issueRes.stderr).to.equal(0)

      // JWT format: three base64url segments separated by `.`
      var jwt = issueRes.stdout.trim()
      expect(jwt.split('.')).to.have.length(3)

      // 3. Verify the credential
      fs.writeFileSync(path.join(tmpDir, 'cred.jwt'), jwt)
      var verifyRes = runCli(['vc', 'verify', 'cred.jwt'], { cwd: tmpDir })
      expect(verifyRes.code, verifyRes.stderr).to.equal(0)
      expect(verifyRes.stderr).to.match(/VALID/)
      // Verified payload echoed on stdout
      var payload = JSON.parse(verifyRes.stdout)
      expect(payload.iss).to.equal('did:web:example.com')

      // 4. Anchor the credential hash
      var anchorRes = runCli(['anchor', 'hash', 'cred.jwt'], { cwd: tmpDir })
      expect(anchorRes.code, anchorRes.stderr).to.equal(0)
      var hash = anchorRes.stdout.trim()
      expect(hash).to.match(/^[0-9a-f]{64}$/)

      // 5. Build an anchor payload around that hash
      var buildRes = runCli([
        'anchor', 'build',
        '--kind', 'VC_ANCHOR_SHA256',
        '--hash', hash,
        '--issuer', 'did:web:example.com'
      ], { cwd: tmpDir })
      expect(buildRes.code, buildRes.stderr).to.equal(0)
      var payloadJson = JSON.parse(buildRes.stdout)
      expect(payloadJson.hash).to.equal(hash)

      // 6. Create a status list
      var statusCreateRes = runCli([
        'status', 'create',
        '--issuer', 'did:web:example.com'
      ], { cwd: tmpDir })
      expect(statusCreateRes.code, statusCreateRes.stderr).to.equal(0)
      var listJwt = statusCreateRes.stdout.trim()
      expect(listJwt.split('.')).to.have.length(3)

      // 7. Revoke index 42
      fs.writeFileSync(path.join(tmpDir, 'list.jwt'), listJwt)
      var statusSetRes = runCli([
        'status', 'set',
        '--list', 'list.jwt',
        '--index', '42',
        '--status', 'revoked'
      ], { cwd: tmpDir })
      expect(statusSetRes.code, statusSetRes.stderr).to.equal(0)
      var updatedListJwt = statusSetRes.stdout.trim()
      expect(updatedListJwt.split('.')).to.have.length(3)

      // 8. Check the new status at index 42
      fs.writeFileSync(path.join(tmpDir, 'list-updated.jwt'), updatedListJwt)
      var statusCheckRes = runCli([
        'status', 'check',
        '--list', 'list-updated.jwt',
        '--index', '42'
      ], { cwd: tmpDir })
      expect(statusCheckRes.code, statusCheckRes.stderr).to.equal(0)
      expect(statusCheckRes.stdout.trim()).to.equal('revoked')

      // 9. A different index should still report valid
      var statusCheckValidRes = runCli([
        'status', 'check',
        '--list', 'list-updated.jwt',
        '--index', '0'
      ], { cwd: tmpDir })
      expect(statusCheckValidRes.code, statusCheckValidRes.stderr).to.equal(0)
      expect(statusCheckValidRes.stdout.trim()).to.equal('valid')
    })
  })

  describe('error handling', function () {
    it('vc issue without --issuer exits non-zero', function () {
      var r = runCli(['vc', 'issue', '--subject', 'x', '--claims', '{}'], { cwd: tmpDir })
      expect(r.code).to.not.equal(0)
      expect(r.stderr).to.match(/--issuer/)
    })

    it('vc verify on a missing file exits non-zero', function () {
      var r = runCli(['vc', 'verify', 'no-such-file.jwt'], { cwd: tmpDir })
      expect(r.code).to.not.equal(0)
    })

    it('status set without --list exits non-zero', function () {
      var r = runCli(['status', 'set', '--index', '1', '--status', 'revoked'], { cwd: tmpDir })
      expect(r.code).to.not.equal(0)
    })

    it('anchor build without --kind exits non-zero', function () {
      var r = runCli(['anchor', 'build', '--hash', 'x', '--issuer', 'y'], { cwd: tmpDir })
      expect(r.code).to.not.equal(0)
    })
  })
})
