# Legacy sanity scripts

Pre-mocha standalone scripts kept here for historical reference. They are not
part of the test suite (no `describe`/`it`). Run with:

```bash
node examples/legacy/<file>.js
```

`smart_contract_test_integration.js` was previously in `lib/smart_contract/`
but is an integration script (calls `process.exit`), not library code.
