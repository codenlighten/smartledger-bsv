'use strict'

/**
 * Set up prototypal inheritance between two constructors.
 *
 * Replaces the `inherits` dependency, whose modern branch this reproduces exactly:
 * `ctor.super_` is assigned and `ctor.prototype` is REPLACED with an object whose
 * prototype is `superCtor.prototype`.
 *
 * Two details are load-bearing and must not be "simplified" into
 * `Object.setPrototypeOf(ctor.prototype, superCtor.prototype)`:
 *
 *   - `constructor` is redefined as non-enumerable. A plain assignment would make it
 *     enumerable, so it would start showing up in `for…in` and in anything that walks
 *     own+inherited keys — this library's `toObject`/`toJSON` paths among them.
 *   - `ctor.super_` is part of the observable surface; `TransactionSignature` and the
 *     four Input subclasses are public classes, so anything reading `.super_` today
 *     keeps working.
 *
 * The package also carried an `Object.create`-less fallback for pre-ES5 browsers. That
 * branch is unreachable on Node >= 20.19 and in every browser this library targets.
 *
 * @param {Function} ctor - the subclass constructor
 * @param {Function} superCtor - the superclass constructor
 */
module.exports = function inherits (ctor, superCtor) {
  if (!superCtor) return
  ctor.super_ = superCtor
  ctor.prototype = Object.create(superCtor.prototype, {
    constructor: {
      value: ctor,
      enumerable: false,
      writable: true,
      configurable: true
    }
  })
}
