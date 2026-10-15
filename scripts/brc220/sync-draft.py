# -*- coding: utf-8 -*-
"""Regenerate docs/BRC-220-UNSIGNED-FIELDS.md's 'Proposed text' from the prepared branch,
then verify every blockquoted paragraph is a line of apps/0220.md verbatim."""
import io, re, sys, subprocess
clone = sys.argv[1]
cur = io.open(clone + '/apps/0220.md', encoding='utf-8').read().splitlines()
up = subprocess.run(['git', '-C', clone, 'show', 'upstream/master:apps/0220.md'],
                    capture_output=True, text=True).stdout.splitlines()
added = [l for l in cur if l.strip() and l not in up]
assert len(added) == 4, "expected 4 added lines, got %d" % len(added)
paras, bullet = added[:3], added[3]

def wrap(t, width=94):            # splits on spaces ONLY, so ' '.join is its exact inverse
    out, line = [], ''
    for w in t.split(' '):
        if line and len(line) + 1 + len(w) > width:
            out.append(line); line = w
        else:
            line = w if not line else line + ' ' + w
    if line: out.append(line)
    return out

def bq(t, b=False):
    w = wrap(t)
    if b: return '\n'.join(('> ' + l) if i == 0 else ('>   ' + l) for i, l in enumerate(w))
    return '\n'.join('> ' + l for l in w)

block = (u"## Proposed text\n\n"
 u"Reproduced from the prepared branch (`apps/0220.md` on `brc-220-unsigned-region`), so this\n"
 u"section and the commit cannot drift apart. Added to **§What a certificate proves**, after the\n"
 u"existing paragraph:\n\n"
 + '\n>\n'.join(bq(p) for p in paras)
 + u"\n\nAdded to **§Security considerations**:\n\n" + bq(bullet, True) + u"\n")

p = 'docs/BRC-220-UNSIGNED-FIELDS.md'
s = io.open(p, encoding='utf-8').read()
io.open(p, 'w', encoding='utf-8').write(
    s[:s.index('## Proposed text')] + block + "\n" + s[s.index('## What this does not change'):])

# verify
s = io.open(p, encoding='utf-8').read()
sec = s.split('## Proposed text', 1)[1].split('## What this does not change')[0]
got, cur_p = [], []
for l in sec.splitlines():
    if l.startswith('>'):
        t = l[1:].strip()
        if t == '':
            if cur_p: got.append(' '.join(cur_p)); cur_p = []
        else: cur_p.append(t)
    else:
        if cur_p: got.append(' '.join(cur_p)); cur_p = []
if cur_p: got.append(' '.join(cur_p))
norm = lambda t: re.sub(r'\s+', ' ', re.sub(r'^[-*]\s+', '', t.strip()))
spec = set(norm(l) for l in cur if l.strip())
bad = [i for i, g in enumerate(got, 1) if norm(g) not in spec]
print("SYNC OK (%d paragraphs)" % len(got) if not bad and len(got) == 4
      else "SYNC FAIL: paragraphs %s" % bad)
