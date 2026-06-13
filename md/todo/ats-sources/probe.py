#!/usr/bin/env python3
"""probe.py — read TSV lines `ats<TAB>slug<TAB>company` on stdin, probe each ATS
public job-board API concurrently, print TSV hits:
ats slug company total_jobs ua_jobs remote_jobs
"""
import sys, json, re, urllib.request, urllib.error
from concurrent.futures import ThreadPoolExecutor

UA_RE = re.compile(r'Ukraine|Kyiv|Kiev|Lviv|Kharkiv|Dnipro|Odesa|Odessa', re.I)
REMOTE_RE = re.compile(r'remote', re.I)
HDRS = {'User-Agent': 'Mozilla/5.0 (slug-probe)', 'Accept': 'application/json'}

def get(url):
    try:
        req = urllib.request.Request(url, headers=HDRS)
        with urllib.request.urlopen(req, timeout=15) as r:
            return json.loads(r.read().decode('utf-8', 'replace'))
    except Exception:
        return None

def probe(ats, slug):
    """return (total, ua, remote) or None on miss"""
    if ats == 'ashby':
        d = get(f'https://api.ashbyhq.com/posting-api/job-board/{slug}')
        if not isinstance(d, dict) or 'jobs' not in d: return None
        jobs = d['jobs']
        loc = lambda j: (j.get('location') or '') + ' ' + ' '.join(s.get('location','') for s in (j.get('secondaryLocations') or []))
        return (len(jobs),
                sum(1 for j in jobs if UA_RE.search(loc(j))),
                sum(1 for j in jobs if j.get('isRemote') or REMOTE_RE.search(loc(j))))
    if ats == 'greenhouse':
        d = get(f'https://boards-api.greenhouse.io/v1/boards/{slug}/jobs')
        if not isinstance(d, dict) or 'jobs' not in d: return None
        jobs = d['jobs']
        loc = lambda j: (j.get('location') or {}).get('name', '')
        return (len(jobs),
                sum(1 for j in jobs if UA_RE.search(loc(j))),
                sum(1 for j in jobs if REMOTE_RE.search(loc(j))))
    if ats == 'lever':
        d = get(f'https://api.lever.co/v0/postings/{slug}?mode=json')
        if not isinstance(d, list): return None
        loc = lambda j: ((j.get('categories') or {}).get('location') or '') + ' ' + ' '.join((j.get('categories') or {}).get('allLocations') or [])
        return (len(d),
                sum(1 for j in d if UA_RE.search(loc(j))),
                sum(1 for j in d if j.get('workplaceType') == 'remote' or REMOTE_RE.search(loc(j))))
    if ats == 'workable':
        d = get(f'https://apply.workable.com/api/v1/widget/accounts/{slug}')
        if not isinstance(d, dict) or 'jobs' not in d: return None
        jobs = d['jobs']
        loc = lambda j: (j.get('city') or '') + ' ' + (j.get('country') or '')
        return (len(jobs),
                sum(1 for j in jobs if UA_RE.search(loc(j))),
                sum(1 for j in jobs if j.get('telecommuting') or (j.get('workplace') == 'remote') or REMOTE_RE.search(loc(j))))
    if ats == 'recruitee':
        d = get(f'https://{slug}.recruitee.com/api/offers/')
        if not isinstance(d, dict) or 'offers' not in d: return None
        jobs = d['offers']
        loc = lambda j: (j.get('location') or '') + ' ' + (j.get('country') or '')
        return (len(jobs),
                sum(1 for j in jobs if UA_RE.search(loc(j))),
                sum(1 for j in jobs if j.get('remote') or REMOTE_RE.search(loc(j))))
    if ats == 'smartrecruiters':
        d = get(f'https://api.smartrecruiters.com/v1/companies/{slug}/postings?limit=100')
        if not isinstance(d, dict): return None
        total = d.get('totalFound') or 0
        if total == 0: return None  # SR gives 200+0 for unknown slugs
        jobs = d.get('content') or []
        loc = lambda j: ((j.get('location') or {}).get('city') or '') + ' ' + ((j.get('location') or {}).get('country') or '')
        return (total,
                sum(1 for j in jobs if UA_RE.search(loc(j))),
                sum(1 for j in jobs if (j.get('location') or {}).get('remote') or REMOTE_RE.search(loc(j))))
    return None

def work(line):
    parts = line.rstrip('\n').split('\t')
    if len(parts) < 2: return None
    ats, slug = parts[0].strip(), parts[1].strip()
    company = parts[2].strip() if len(parts) > 2 else slug
    if not slug: return None
    r = probe(ats, slug)
    if r is None: return None
    return f'{ats}\t{slug}\t{company}\t{r[0]}\t{r[1]}\t{r[2]}'

lines = [l for l in sys.stdin if l.strip()]
with ThreadPoolExecutor(max_workers=24) as ex:
    for res in ex.map(work, lines):
        if res:
            print(res, flush=True)
