'use strict'

require('chai').should()

var deprecate = require('../../lib/util/deprecate')

describe('deprecate', function () {
  var warned

  beforeEach(function () {
    deprecate.reset()
    deprecate.setEnabled(true)
    warned = []
    this.origWarn = console.warn
    console.warn = function (m) { warned.push(m) }
  })

  afterEach(function () {
    console.warn = this.origWarn
    deprecate.reset()
    deprecate.setEnabled(true)
  })

  describe('the contract that makes a long-lived 9.x possible', function () {
    it('never throws, however it is called', function () {
      ;(function () {
        deprecate({ what: 'A#b', since: '9.1.0', removeIn: '10.0.0', use: 'A#c' })
      }).should.not.throw()
    })

    it('names the replacement so the warning is actionable', function () {
      deprecate({ what: 'A#b', since: '9.1.0', removeIn: '10.0.0', use: 'A#c', why: 'it enforces nothing' })
      warned[0].should.contain('A#b')
      warned[0].should.contain('9.1.0')
      warned[0].should.contain('A#c')
      warned[0].should.contain('10.0.0')
      warned[0].should.contain('It enforces nothing')
    })

    it('states that an un-scheduled API is safe for all of 9.x', function () {
      deprecate({ what: 'A#b', since: '9.1.0' })
      warned[0].should.contain('will not be removed in a 9.x release')
    })
  })

  describe('noise control', function () {
    it('warns once per API per process', function () {
      for (var i = 0; i < 50; i++) deprecate({ what: 'A#b', since: '9.1.0' })
      warned.length.should.equal(1)
    })

    it('warns separately for distinct APIs', function () {
      deprecate({ what: 'A#b' })
      deprecate({ what: 'A#c' })
      warned.length.should.equal(2)
    })

    it('reports whether it emitted', function () {
      deprecate({ what: 'A#b' }).should.equal(true)
      deprecate({ what: 'A#b' }).should.equal(false)
    })

    it('can be silenced but still records, so tooling keeps working', function () {
      deprecate.setEnabled(false)
      deprecate({ what: 'A#b', since: '9.1.0' })
      warned.length.should.equal(0)
      deprecate.fired().length.should.equal(1)
      deprecate.fired()[0].what.should.equal('A#b')
    })
  })

  describe('deprecate.fn', function () {
    it('warns once, then behaves exactly as the original', function () {
      var calls = []
      var wrapped = deprecate.fn(function add (a, b) {
        calls.push([a, b])
        return a + b
      }, { what: 'add()', since: '9.1.0', removeIn: '10.0.0', use: 'sum()' })

      wrapped(1, 2).should.equal(3)
      wrapped(3, 4).should.equal(7)
      warned.length.should.equal(1)
      calls.length.should.equal(2)
    })

    it('preserves name and arity so introspection is unchanged', function () {
      var wrapped = deprecate.fn(function add (a, b) { return a + b }, { what: 'add()' })
      wrapped.name.should.equal('add')
      wrapped.length.should.equal(2)
    })

    it('preserves `this` on prototype methods', function () {
      function Klass (v) { this.v = v }
      Klass.prototype.get = function () { return this.v }
      Klass.prototype.get = deprecate.fn(Klass.prototype.get, { what: 'Klass#get' })
      new Klass(42).get().should.equal(42)
    })

    it('propagates the original error, not a deprecation error', function () {
      var wrapped = deprecate.fn(function () { throw new Error('original') }, { what: 'x()' })
      ;(function () { wrapped() }).should.throw('original')
    })

    it('exposes the wrapped fn and its notice for tooling', function () {
      var orig = function () {}
      var wrapped = deprecate.fn(orig, { what: 'x()', removeIn: '10.0.0' })
      wrapped.__wrapped.should.equal(orig)
      wrapped.__deprecation.removeIn.should.equal('10.0.0')
    })
  })

  describe('deprecate.property', function () {
    it('warns on first read and caches the value', function () {
      var built = 0
      var host = {}
      deprecate.property(host, 'Legacy', function () { built++; return { ok: true } },
        { what: 'bsv.Legacy', since: '9.1.0', removeIn: '10.0.0', use: 'bsv.Current' })

      host.Legacy.ok.should.equal(true)
      host.Legacy.ok.should.equal(true)
      warned.length.should.equal(1)
      built.should.equal(1)
    })

    it('does not warn if the property is never read', function () {
      deprecate.property({}, 'Legacy', function () { return 1 }, { what: 'bsv.Legacy' })
      warned.length.should.equal(0)
    })
  })

  describe('input validation', function () {
    it('requires a `what`', function () {
      ;(function () { deprecate({}) }).should.throw(TypeError)
    })

    it('requires a function', function () {
      ;(function () { deprecate.fn(null, { what: 'x' }) }).should.throw(TypeError)
    })
  })
})
