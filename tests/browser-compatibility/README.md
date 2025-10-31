# Browser Compatibility Tests

This directory contains test files for verifying browser compatibility fixes.

## Test Files

### `test-cdn-vs-local.html`
Comprehensive test that compares CDN bundles vs local bundles to verify the `createHmac` fix.

**Usage:**
1. Open in browser
2. Click "Test CDN Version" - should show `createHmac` error (if using unfixed CDN)
3. Click "Test Local Version" - should work with fixed bundles
4. View summary to confirm fix effectiveness

### `test-pbkdf2.html`
Simple test focused specifically on PBKDF2 functionality.

**Usage:**
1. Open in browser
2. Tests mnemonic generation using PBKDF2
3. Shows detailed error information if PBKDF2 fails

## Background

These tests were created to verify the fix for issue where CDN users experienced:
- `createHmac is not a function` errors
- Failed mnemonic generation
- Failed HD wallet key derivation

The fix implemented browser-compatible PBKDF2 using BSV's crypto modules instead of Node.js crypto.

## Fix Details

See `docs/FIX_CREATEHMAC_ISSUE.md` for complete technical details.