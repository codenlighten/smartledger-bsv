// usage: node gen.cjs <versionDir>  -> writes <versionDir>/artifacts.json
const path = require('path'); const dir = path.resolve(process.argv[2]);
const bsv = require(require.resolve('@smartledger/bsv', { paths: [dir] })); console.error = () => {};
(async () => {
  const mnemonic = bsv.Mnemonic.fromRandom().toString();
  const shares = bsv.Shamir.split(mnemonic, 2, 3).map((s) => JSON.stringify(s));
  const hd = bsv.Mnemonic.fromString(mnemonic).toHDPrivateKey('', bsv.Networks.livenet);
  const idKey = hd.deriveChild("m/44'/236'/0'/0/0").privateKey, tokKey = hd.deriveChild("m/44'/236'/2'/0/0").privateKey;
  const issuer = bsv.PrivateKey.fromRandom(), other = bsv.PrivateKey.fromRandom();
  const challenge = 'vg-wallet recovery challenge 1234';
  const out = { version: require(require.resolve('@smartledger/bsv/package.json', { paths: [dir] })).version, mnemonic, shares,
    identityAddress: idKey.toAddress().toString(), tokenAddress: tokKey.toAddress().toString(),
    identityDid: bsv.createDID(idKey.toPublicKey()), challenge,
    signature: new bsv.Message(challenge).sign(idKey), otherAddress: other.toAddress().toString(),
    issuerDid: bsv.createDID(issuer.toPublicKey()),
    credential: await bsv.createEmailCredential(bsv.createDID(issuer.toPublicKey()), bsv.createDID(idKey.toPublicKey()), 'a@b.c', issuer) };
  require('fs').writeFileSync(path.join(dir, 'artifacts.json'), JSON.stringify(out));
  console.log('generated on', out.version);
})();
