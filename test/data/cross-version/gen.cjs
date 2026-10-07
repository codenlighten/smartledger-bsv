// Capture what THIS version of @smartledger/bsv produces, as a fixture for later versions.
//
//   node compat/gen.cjs            -> compat/fixtures/bsv-<installed version>.json
//   node compat/gen.cjs <dir>      -> same, using the copy of the library installed under <dir>
//
// Run it BEFORE upgrading the library, then commit the fixture. A customer's recovery share
// is a thing they print and keep for years; the only honest test that a new library version
// can still read it is a share the OLD version actually made. One made after the upgrade
// proves nothing — which is exactly how the 7.5.5 -> 8.1.0 check was done once, by hand, and
// then lost. Everything here goes through the same calls the wallet makes
// (web/src/lib/wallet/keys.ts, shamir.ts; server issuer.ts).
//
// The mnemonic is generated for the fixture and stored in it in the clear. It has never held
// anything and never will; do not fund its addresses.
const path = require("path");
const fs = require("fs");
const from = path.resolve(process.argv[2] || path.join(__dirname, ".."));
const bsv = require(require.resolve("@smartledger/bsv", { paths: [from] }));
const version = require(require.resolve("@smartledger/bsv/package.json", { paths: [from] })).version;
console.error = () => {}; // 8.x logs a stack trace on every Message.sign

(async () => {
  const mnemonic = bsv.Mnemonic.fromRandom().toString();
  const hd = bsv.Mnemonic.fromString(mnemonic).toHDPrivateKey("", bsv.Networks.livenet);
  const idKey = hd.deriveChild("m/44'/236'/0'/0/0").privateKey;
  const tokKey = hd.deriveChild("m/44'/236'/2'/0/0").privateKey;
  const issuer = bsv.PrivateKey.fromRandom();
  const other = bsv.PrivateKey.fromRandom();
  const challenge = "vg-wallet recovery challenge 1234";
  const out = {
    version,
    mnemonic,
    shares: bsv.Shamir.split(mnemonic, 2, 3).map((s) => JSON.stringify(s)),
    identityAddress: idKey.toAddress().toString(),
    tokenAddress: tokKey.toAddress().toString(),
    identityDid: bsv.createDID(idKey.toPublicKey()),
    challenge,
    signature: new bsv.Message(challenge).sign(idKey),
    otherAddress: other.toAddress().toString(),
    issuerDid: bsv.createDID(issuer.toPublicKey()),
    credential: await bsv.createEmailCredential(
      bsv.createDID(issuer.toPublicKey()),
      bsv.createDID(idKey.toPublicKey()),
      "a@b.c",
      issuer,
    ),
  };
  const file = path.join(__dirname, "fixtures", `bsv-${version}.json`);
  if (fs.existsSync(file) && !process.argv.includes("--overwrite")) {
    console.log(`${file} already exists — a fixture is a record of what that version made; not overwriting.`);
    process.exit(1);
  }
  fs.writeFileSync(file, JSON.stringify(out, null, 1) + "\n");
  console.log(`wrote ${file}`);
})();
