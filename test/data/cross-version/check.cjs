// usage: node check.cjs <verifierVersionDir> <artifacts.json>
const path = require('path'); const dir = path.resolve(process.argv[2]);
const bsv = require(require.resolve('@smartledger/bsv', { paths: [dir] })); console.error = () => {};
const a = JSON.parse(require('fs').readFileSync(process.argv[3]));
const ver = require(require.resolve('@smartledger/bsv/package.json', { paths: [dir] })).version;
let fail = 0; const ok = (n, c) => { if (!c) fail++; console.log((c ? 'PASS ' : 'FAIL ') + n); };
(async () => {
  console.log(`== made on ${a.version}, checked on ${ver}`);
  const sh = a.shares.map((s) => JSON.parse(s));
  for (const [i, j] of [[0, 1], [0, 2], [1, 2]]) {
    const r = bsv.Shamir.combine([sh[i], sh[j]]);
    ok(`shares ${i}+${j} recombine to the mnemonic (Buffer=${Buffer.isBuffer(r)})`, r.toString() === a.mnemonic);
  }
  let single; try { single = bsv.Shamir.combine([sh[0]]).toString(); } catch { single = null; }
  ok('a single share does not yield the mnemonic', single !== a.mnemonic);
  const hd = bsv.Mnemonic.fromString(a.mnemonic).toHDPrivateKey('', bsv.Networks.livenet);
  ok('identity address derives identically', hd.deriveChild("m/44'/236'/0'/0/0").privateKey.toAddress().toString() === a.identityAddress);
  ok('token address derives identically', hd.deriveChild("m/44'/236'/2'/0/0").privateKey.toAddress().toString() === a.tokenAddress);
  ok('DID derives identically', bsv.createDID(hd.deriveChild("m/44'/236'/0'/0/0").privateKey.toPublicKey()) === a.identityDid);
  const v = new bsv.Message(a.challenge).verify(a.identityAddress, a.signature);
  ok(`Message.verify accepts the right signer (sync boolean: ${v === true})`, v === true);
  let w; try { w = new bsv.Message(a.challenge).verify(a.otherAddress, a.signature); } catch { w = false; }
  ok('Message.verify rejects a wrong signer', w === false);
  let m; try { m = new bsv.Message(a.challenge + 'x').verify(a.identityAddress, a.signature); } catch { m = false; }
  ok('Message.verify rejects a changed challenge', m === false);
  const p = bsv.verifyCredential(a.credential);
  ok('verifyCredential returns a Promise (must be awaited)', typeof p.then === 'function');
  const r = await p; ok('credential verifies', r.valid === true && r.issuerDID === a.issuerDid);
  const t = JSON.parse(JSON.stringify(a.credential)); t.credentialSubject.email = 'evil@x.y';
  ok('tampered credential is rejected', (await bsv.verifyCredential(t)).valid === false);
  const np = JSON.parse(JSON.stringify(a.credential)); delete np.proof;
  let npr; try { npr = (await bsv.verifyCredential(np)).valid; } catch { npr = false; }
  ok('credential with proof removed is rejected', npr === false);
  process.exitCode = fail ? 1 : 0;
})();
