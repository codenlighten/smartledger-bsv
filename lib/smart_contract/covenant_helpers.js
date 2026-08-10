'use strict'
// Moved to lib/covenant/helpers.js.
//
// lib/ordinals needs these primitives too, and importing them from
// lib/smart_contract was the only dependency from core code into the
// application layer. This path is retained because deep imports
// (require('@smartledger/bsv/lib/smart_contract/covenant_helpers')) are public
// API via the package.json exports map.
module.exports = require('../covenant/helpers')
