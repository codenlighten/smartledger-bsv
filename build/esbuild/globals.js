// esbuild inject shim: provide the Node `Buffer` and `process` globals in browser
// bundles (webpack did this via ProvidePlugin). esbuild replaces unbound references
// to `Buffer` / `process` with these imports.
import process from 'process/browser'
export { Buffer } from 'buffer'
export { process }
