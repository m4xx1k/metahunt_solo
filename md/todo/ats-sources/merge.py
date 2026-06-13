#!/usr/bin/env python3
import sys
best = {}
for line in sys.stdin:
    p = line.rstrip('\n').split('\t')
    if len(p) != 6: continue
    ats, slug, name, total, ua, remote = p[0], p[1], p[2], int(p[3]), int(p[4]), int(p[5])
    key = (ats, slug.lower())
    if key not in best or total > best[key][3]:
        best[key] = (ats, slug, name, total, ua, remote)
rows = sorted(best.values(), key=lambda r: (-r[4], -r[3]))
for r in rows:
    print('\t'.join(map(str, r)))
