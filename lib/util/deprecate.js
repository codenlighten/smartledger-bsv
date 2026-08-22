'use strict'

/**
 * Runtime deprecation notices.
 *
 * A semver major is a promise that the consumer's code breaks. Between 4.0.0
 * (2026-05-31) and 9.0.0 (2026-08-21) this library made that promise six times,
 * and the mechanism was almost always the same: an API that had become wrong was
 * changed to `throw`, in the same release that decided it was wrong. Correct
 * diagnosis, no warning period. `HDPrivateKey#derive` and
 * `MerkleBlock#filterdTxsHash` still throw that way today.
 *
 * The fix is not to keep bad APIs. It is to separate the moment we say "this is
 * wrong" from the moment we break callers:
 *
 *   minor    mark it. Callers see a warning naming the replacement, and keep
 *            working. `removeIn` states the version that will break them.
 *   major    remove it, on a schedule announced at least one minor in advance.
 *
 * Deprecating is therefore a NON-breaking act and belongs in a minor. That is
 * what makes a long-lived 9.x possible: correctness fixes ship continuously,
 * breakage batches into one planned major with a migration path already in the
 * consumer's logs.
 *
 * Nothing here ever throws. A deprecation that throws is just a breaking change
 * wearing a warning's name.
 */

var seen = Object.create(null)

/** Every notice fired this process, for tests and for `--audit`-style tooling. */
var fired = []

/**
 * Warnings are on unless explicitly silenced. Consumers who have logged the
 * migration and do not want the noise set BSV_NO_DEPRECATION_WARNINGS=1; the
 * record in `fired` is kept either way so tooling still sees it.
 */
var enabled = process.env.BSV_NO_DEPRECATION_WARNINGS !== '1'

function format (opts) {
  var msg = '[@smartledger/bsv] ' + opts.what + ' is deprecated'
  if (opts.since) msg += ' since ' + opts.since
  msg += '.'
  if (opts.why) msg += ' ' + opts.why.charAt(0).toUpperCase() + opts.why.slice(1) + '.'
  if (opts.use) msg += ' Use ' + opts.use + ' instead.'
  msg += opts.removeIn
    ? ' It will be removed in ' + opts.removeIn + '.'
    : ' A removal version has not been set; it will not be removed in a 9.x release.'
  return msg
}

/**
 * Emit a deprecation notice at most once per `what` per process.
 *
 * @param {object} opts
 * @param {string} opts.what      the API being deprecated, as a caller writes it
 * @param {string} [opts.since]   version that deprecated it
 * @param {string} [opts.removeIn] version that will remove it (a major)
 * @param {string} [opts.use]     the replacement, as a caller would write it
 * @param {string} [opts.why]     one clause; why it is wrong, not what to do
 * @returns {boolean} true if this call emitted (false if already seen)
 */
function deprecate (opts) {
  if (!opts || !opts.what) throw new TypeError('deprecate() requires { what }')
  if (seen[opts.what]) return false
  seen[opts.what] = true

  var message = format(opts)
  fired.push({
    what: opts.what,
    since: opts.since || null,
    removeIn: opts.removeIn || null,
    use: opts.use || null,
    message: message
  })
  if (enabled) console.warn(message)
  return true
}

/**
 * Wrap a function so calling it warns once, then behaves exactly as before.
 * Preserves name, arity and `this`, so it is safe on prototype methods.
 *
 *   Klass.prototype.old = deprecate.fn(Klass.prototype.old, {
 *     what: 'Klass#old', since: '9.1.0', removeIn: '10.0.0', use: 'Klass#new'
 *   })
 */
deprecate.fn = function (fn, opts) {
  if (typeof fn !== 'function') throw new TypeError('deprecate.fn() requires a function')
  var wrapper = function () {
    deprecate(opts)
    return fn.apply(this, arguments)
  }
  Object.defineProperty(wrapper, 'name', { value: fn.name, configurable: true })
  Object.defineProperty(wrapper, 'length', { value: fn.length, configurable: true })
  wrapper.__wrapped = fn
  wrapper.__deprecation = opts
  return wrapper
}

/**
 * Deprecate a property access (an alias namespace, a renamed field).
 * Warns on first read; the value is computed once and cached.
 */
deprecate.property = function (target, name, get, opts) {
  var cached
  var loaded = false
  Object.defineProperty(target, name, {
    configurable: true,
    enumerable: true,
    get: function () {
      deprecate(opts)
      if (!loaded) { cached = get(); loaded = true }
      return cached
    }
  })
  return target
}

/** Notices fired this process, in order. */
deprecate.fired = function () { return fired.slice() }

/** Silence output. The `fired` record is still kept. */
deprecate.setEnabled = function (v) { enabled = !!v }
deprecate.isEnabled = function () { return enabled }

/** Test hook: forget what has been warned about. */
deprecate.reset = function () {
  seen = Object.create(null)
  fired.length = 0
}

module.exports = deprecate
