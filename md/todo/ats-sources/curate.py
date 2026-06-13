#!/usr/bin/env python3
"""curate.py — rank merged.tsv into a curated list.
Tiers: UA (has Ukraine jobs) > REMOTE (remote share >= 30% and >= 5 remote jobs) > GLOBAL.
Aggregators/agencies flagged separately. Outputs ranked TSV with tier column.
"""
import sys

AGGREGATORS = {'jobgether', 'tsmg', 'weloglobal', 'toogeza', 'oowlish', 'g2i', 'mercor',
               'smart-working-solutions', 'jobleads', 'workwhilejobs', 'remofirst'}
# boards that are likely name-collisions with the intended UA company
SUSPECT = {('ashby', 'genesis'), ('ashby', 'ajax'), ('lever', 'genesis')}

rows = []
for line in open(sys.argv[1]):
    p = line.rstrip('\n').split('\t')
    if len(p) != 6: continue
    ats, slug, name, total, ua, remote = p[0], p[1], p[2], int(p[3]), int(p[4]), int(p[5])
    if total == 0: continue
    flag = ''
    if slug.lower() in AGGREGATORS: flag = 'aggregator'
    if (ats, slug.lower()) in SUSPECT: flag = 'name-collision?'
    if ua > 0:
        tier = 'UA'
    elif remote >= 5 and remote / total >= 0.3:
        tier = 'REMOTE'
    else:
        tier = 'GLOBAL'
    score = ua * 100 + remote + total * 0.05
    rows.append((tier, score, ats, slug, name, total, ua, remote, flag))

order = {'UA': 0, 'REMOTE': 1, 'GLOBAL': 2}
rows.sort(key=lambda r: (order[r[0]], -r[1]))
print('tier\tats\tslug\tcompany\tjobs\tua_jobs\tremote_jobs\tflag')
for r in rows:
    print(f'{r[0]}\t{r[2]}\t{r[3]}\t{r[4]}\t{r[5]}\t{r[6]}\t{r[7]}\t{r[8]}')
