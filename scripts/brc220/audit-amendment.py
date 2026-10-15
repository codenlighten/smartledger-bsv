# -*- coding: utf-8 -*-
import io, re, subprocess, sys
clone = sys.argv[1]
new = io.open(clone + '/apps/0220.md', encoding='utf-8').read()
up = subprocess.run(['git','-C',clone,'show','upstream/master:apps/0220.md'],
                    capture_output=True, text=True).stdout

added = [l for l in new.splitlines() if l and l not in up.splitlines()]
print("added lines: %d" % len(added))
addtext = u"\n".join(added)
fails = []

# 1. every backticked identifier in the added text must occur in the UPSTREAM spec
idents = sorted(set(re.findall(r'`([^`]+)`', addtext)))
unknown = [i for i in idents if ('`%s`' % i) not in up]
print("\n-- backticked identifiers: %d, not found verbatim upstream: %d" % (len(idents), len(unknown)))
for u_ in unknown:
    # allow dotted/compound forms whose parts are all present
    parts = re.split(r'[.\s]+', u_)
    ok = all(('`%s`' % p) in up or p in up for p in parts if p)
    print("   %-46s %s" % (u_, "parts present" if ok else "*** NOT PRESENT ***"))
    if not ok: fails.append("identifier not in spec: %s" % u_)

# 2. each normative claim the added text leans on must be in the UPSTREAM text
claims = {
 "version MUST-reject": u"A verifier MUST reject a certificate whose `version` it does not implement",
 "encoding MUST-reject": u"A reader MUST reject a value that is not valid in its encoding",
 "ignore unrecognised": u"Verifiers ignore members they do not recognise",
 "mode unchecked in batch": u"In a batched certificate `mode` is not checked against the chain",
 "network descriptive": u"The field is descriptive",
 "spv outside bytes": u"The SPV envelope is **not** part of the canonical proof bytes",
 "signs payloadHash": u"The signer signs the 32-byte `payloadHash` directly",
 "step1 verify args": u"`verify(algorithm, payloadHash, signature, publicKey)` is true",
 "step2 proof integrity": u"the recomputed `proofHash` equals `certificate.proofHash`",
 "txid from rawTx": u"`txid = reverse(SHA256(SHA256(rawTx)))` equals `anchor.txid`",
 "OP_RETURN matches fields": u"the `OP_RETURN` read from `rawTx` matches the certificate fields",
 "root equals on-chain": u"equal to `merkleRoot` in the on-chain batch record",
 "leafCount equals on-chain": u"equal to `leafCount` in the on-chain batch record",
 "path folds to root": u"The result must equal `root`",
 "mode byte 0 or 1": u"corresponding to the on-chain `mode` byte `0` or `1`",
 "protocol constant": u'| `protocol` | the string `"NotaryHash"` |',
 "version constant": u'the string `"1.0"`',
 "spv.format member": u'"format": "TSC"',
 "anchor.type values": u'`"direct"` if the record carries this proof',
 "createdAt advisory": u"`createdAt` is an advisory client field only",
 "hashAlgorithm is SHA-256": u'| `hashAlgorithm` | `"SHA-256"` |',
}
print("\n-- normative claims leaned on (must pre-exist upstream):")
for k, v in claims.items():
    hit = v in up
    print("   %-28s %s" % (k, "PRESENT" if hit else "*** MISSING ***"))
    if not hit: fails.append("claim missing: %s" % k)

# 3. markdown integrity
print("\n-- markdown integrity:")
checks = [
 ("fences balanced", new.count('```') % 2 == 0),
 ("table rows", len([l for l in new.splitlines() if l.startswith('|')]) == len([l for l in up.splitlines() if l.startswith('|')])),
 ("headings unchanged", [l for l in new.splitlines() if l.startswith('#')] == [l for l in up.splitlines() if l.startswith('#')]),
 ("trailing newline", new.endswith('\n') and not new.endswith('\n\n')),
 ("no tabs", '\t' not in new),
 ("no CRLF", '\r' not in new),
 ("no curly quotes", not re.search(u'[“”‘’]', new)),
 ("no new char classes", set(re.findall(u'[^\x00-\x7f]', new)) <= set(re.findall(u'[^\x00-\x7f]', up))),
 ("every added line is a whole paragraph or bullet", all(not l.startswith(' ') for l in added)),
 ("upstream lines all retained", all(l in new.splitlines() for l in up.splitlines() if l.strip())),
]
for k, ok in checks:
    print("   %-46s %s" % (k, "ok" if ok else "*** FAIL ***"))
    if not ok: fails.append("markdown: %s" % k)

print("\n%s (%d problems)" % ("AUDIT PASS" if not fails else "AUDIT FAIL", len(fails)))
for f in fails: print("  !", f)
