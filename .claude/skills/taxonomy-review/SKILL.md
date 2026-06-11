---
name: taxonomy-review
description: Review metahunt taxonomy nodes (skills, roles, domains) — shortlist junk, duplicates and misnamed canonicals among VERIFIED/NEW nodes, recommend HIDE / MERGE / RENAME / VERIFY verdicts with reasons, and apply them only after the user confirms. Use when the user asks "що там по скілам", "почисти таксономію", after an auto-verify run, or before/after a prod deploy that touches taxonomy.
---

# Taxonomy review

Curation pass over `nodes` / `node_aliases` / `vacancy_nodes`. The auto-verify
schedule (`taxonomy-autoverify`, see `apps/etl/src/admin/taxonomy/`) promotes
by usage only — quality review is THIS skill, run by a human on demand.

## Ground rules

- **Never touch HIDDEN nodes.** An operator's hide is final; don't propose un-hiding.
- **Propose first, apply only after explicit user confirmation.** Show the full verdict table; the user may edit it.
- **MERGE and RENAME go through the admin API only** — `TaxonomyService.mergeInto` repoints `vacancy_nodes`, `candidate_nodes` and aliases in one transaction. Raw SQL merges WILL orphan candidate links and trip FKs.
- VERIFY / HIDE may use the API or a plain `UPDATE nodes SET status=… WHERE id=…`.
- Constraint: a NEW source can only merge into a VERIFIED target (service enforces it).

## 1. Pick the environment

Ask the user (or infer from their wording): **local** or **prod**.

- Local: `DATABASE_URL` from repo `.env`; admin API at `http://localhost:3000`.
- Prod: see `md/runbook/railway-deploy.md#day-2-ops` — get `DATABASE_URL` via Railway, admin API at the Railway service domain.

## 2. Gather (read-only)

Pull these sets and read them yourself — the lists are small enough to scan in full:

```sql
-- A. All VERIFIED skills with usage (scan for junk that slipped through)
SELECT n.id, n.canonical_name, count(vn.vacancy_id) AS vacs
FROM nodes n LEFT JOIN vacancy_nodes vn ON vn.node_id = n.id
WHERE n.type='SKILL' AND n.status='VERIFIED'
GROUP BY n.id ORDER BY n.canonical_name;

-- B. NEW skills at/near the auto-verify threshold (next candidates)
SELECT n.id, n.canonical_name, count(DISTINCT vn.vacancy_id) AS vacs
FROM nodes n JOIN vacancy_nodes vn ON vn.node_id = n.id
WHERE n.type='SKILL' AND n.status='NEW'
GROUP BY n.id HAVING count(DISTINCT vn.vacancy_id) >= 3
ORDER BY vacs DESC;

-- C. Near-duplicate pairs among VERIFIED+NEW skills (pg_trgm)
SELECT a.id, a.canonical_name, a.status, b.id, b.canonical_name, b.status,
       similarity(lower(a.canonical_name), lower(b.canonical_name)) AS sim
FROM nodes a JOIN nodes b
  ON a.type='SKILL' AND b.type='SKILL' AND a.id < b.id
 AND a.status <> 'HIDDEN' AND b.status <> 'HIDDEN'
 AND similarity(lower(a.canonical_name), lower(b.canonical_name)) > 0.55
ORDER BY sim DESC;

-- D. NEW roles (each hides its vacancies entirely) + the VERIFIED role list
SELECT n.id, n.canonical_name, count(v.id) AS vacs
FROM nodes n LEFT JOIN vacancies v ON v.role_node_id = n.id
WHERE n.type='ROLE' AND n.status='NEW'
GROUP BY n.id ORDER BY vacs DESC;
SELECT id, canonical_name FROM nodes WHERE type='ROLE' AND status='VERIFIED' ORDER BY 2;
```

## 3. Judge

Apply the same taste as the extraction prompt's EXCLUDE rules
(`apps/etl/baml_src/extract-vacancy.baml`, `Skills` class). Flag as:

- **HIDE** — soft skills; generic categories ("AI tools", "Web Frameworks", "Cloud"); process methodologies; universal protocols/formats; document/standard names used as skills ("OWASP Top 10"); tools every developer uses; non-skills ("Issue Resolution").
- **MERGE → target** — spelling/granularity variants of an existing canonical (RestAssured → REST Assured, "RF" → "RF Design"); for roles: non-umbrella dupes (QA Automation Engineer → Automation QA Engineer). High similarity from query C is a hint, not a verdict — check meaning (Java ≠ JavaScript, C ≠ C++).
- **RENAME** — legit skill, wrong canonical form (casing, vendor spelling). Use the market-standard English form.
- **VERIFY** — legit NEW skill below auto-threshold the user wants visible now.
- **OK** — everything else; don't list it.

When unsure, say so and lean toward leaving as-is — a wrong HIDE on a niche
hardware tool is worse than a day of one junk facet.

## 4. Propose

One table, grouped by action, with: node name, status, vacancy count, verdict,
target (for merges), one-line reason. Then ask the user to confirm/edit.

## 5. Apply (after confirmation)

```bash
# verify / hide
curl -X PATCH "$ADMIN/admin/taxonomy/nodes/$ID/verify"
curl -X PATCH "$ADMIN/admin/taxonomy/nodes/$ID/hide"
# rename
curl -X PATCH "$ADMIN/admin/taxonomy/nodes/$ID/rename" -H 'content-type: application/json' -d '{"name":"REST Assured"}'
# merge (source → target)
curl -X POST  "$ADMIN/admin/taxonomy/nodes/$SRC/merge-into/$DST"
```

Report what was applied vs skipped. If anything failed (409 conflict etc.),
show the response and stop — don't improvise around the service's checks.

## 6. Close the loop

After applying, re-run query A/D counts and show the before/after one-liner
(e.g. "VERIFIED skills 1260 → 1248, NEW roles 95 → 12, vacancies unblocked +137").
