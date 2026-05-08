# TODO — Tune BAML extraction prompt to reduce taxonomy noise

**Target file:** `apps/etl/baml_src/extract-vacancy.baml`
**Current branch:** `feat/loader-pipeline`
**Last commit on this thread:** `eaf46ac` (Tier 1 nodes.json expansion)
**Estimated time:** one focused session (~1–2 hours, no schema changes)

---

## Why this exists

Most of the taxonomy moderation queue isn't real long-tail tech — it's the LLM
extracting variant spellings (`Fullstack Developer` / `Full-Stack Developer` /
`Full Stack Engineer` for one role), generic categories (`Networking`,
`Scripting`, `AI Tools`, `Relational Databases`), or fluff that shouldn't be
skills at all (`HTTP`, `JSON`, `XML`, `Unit Testing`, `Web Testing`).

The seed + admin endpoints handle these after the fact. But the prompt is
upstream — fixing it shrinks the moderation queue at source. After Tier 1
seed iteration, current coverage is:

- ROLE: 97.2% verified
- DOMAIN: 88.0%
- SKILL: 63.4% ← most of the remaining gap is LLM noise, not real long tail
- Fully-verified vacancies: 13/142 = 9.2%

Goal: push SKILL to ~80%, push fully-verified to ~30%, with a single
prompt edit.

---

## Read first

In order:

1. `apps/etl/baml_src/extract-vacancy.baml` — the whole file (228 lines).
   The actual prompt body is just lines 190–200; everything else is the
   schema, which BAML renders into the LLM call via `{{ ctx.output_format }}`.
2. `apps/etl/scripts/fill-vacancies.ts` — the instrumented driver that
   reports taxonomy coverage. You will run this to measure before/after.
3. `apps/etl/src/loader/services/node-resolver.service.ts` — for context
   on how alias matching works downstream.
4. The four commits this thread produced (`git log --oneline | head -10`):
   `51223fc` (seed schema) → `921b4e1` (script + dedup) → `b6e1052`
   (admin endpoints) → `eaf46ac` (Tier 1 nodes.json).

---

## What to change (ranked by ROI)

Do them in this order and re-measure between each step. **One edit at a
time** so you can attribute coverage gains.

### 1. Inject the live taxonomy as soft constraints (highest ROI)

Right now the LLM has zero awareness of what canonical names exist. Pull
the VERIFIED nodes at extraction time and render them into the prompt.

Concrete: change the `prompt #"..."#` block in `ExtractVacancy` to accept
extra inputs and include them as hints:

```baml
function ExtractVacancy(
  text: string,
  knownRoles: string,
  knownDomains: string,
) -> ExtractedVacancy {
  client OpenAIClient
  prompt #"
    You extract structured data from job postings for the Ukrainian IT market.

    PREFER these canonical role names when applicable. Use the EXACT spelling.
    If none fit, use a clear role name; do not invent variant spellings:
    {{ knownRoles }}

    PREFER these canonical domain names. Use null if no good fit:
    {{ knownDomains }}

    ... existing instructions ...
  "#
}
```

Then in `apps/etl/src/extraction/` (or wherever the BAML function is called
from), fetch the lists at call time:

```ts
const roles = await db.select({ name: schema.nodes.canonicalName })
  .from(schema.nodes)
  .where(and(eq(schema.nodes.type, 'ROLE'), eq(schema.nodes.status, 'VERIFIED')));
const knownRoles = roles.map(r => r.name).sort().join(', ');
// same for domains
await b.ExtractVacancy(text, knownRoles, knownDomains);
```

For SKILL the list is 250+ entries — too long to inline. Skip injecting it
for skills; per-field anti-rules (step 3) handle the SKILL noise better.

**Expected impact:** ROLE/DOMAIN variance drops to near-zero. The
`Fullstack Developer` vs `Full-Stack Developer` vs `Full Stack Engineer`
gap stops being a thing.

### 2. Add 2–3 few-shot examples inline in the prompt

BAML `test` blocks are for `baml-cli test` only — the production prompt
sees none of them. LLMs follow examples 10× better than rules. Add inline:

```baml
prompt #"
  ... existing instructions ...

  Example:
    Input: "Senior React Developer at Bolt fintech, $5k-7k/mo,
            remote, must know TypeScript, GraphQL is a plus."
    Output:
      role: "Frontend Developer"          ← canonical, NOT "React Developer"
      seniority: SENIOR
      skills.required: ["React", "TypeScript"]   ← NOT ["React.js"]
      skills.optional: ["GraphQL"]
      domain: "Fintech"
      salary: { min: 5000, max: 7000, currency: USD }
      workFormat: REMOTE
      companyName: "Bolt"

  Counter-example — DO NOT output:
    role: "React Developer"               ← too specific, use Frontend Developer
    skills.required: ["Communication"]    ← soft skill, exclude
    skills.required: ["HTTP", "JSON"]     ← protocols, not skills
    skills.required: ["Unit Testing"]     ← process, not a skill
    domain: "Web Development"             ← not a business domain

  ... {{ ctx.output_format }} ...
"#
```

Pick examples that match the failure modes you've seen.

### 3. Add anti-extraction rules to per-field descriptions

Edit `Skills.required.@description` (currently lines 67–72) — append:

```
EXCLUDE:
  - Soft skills (communication, leadership, ownership, problem solving)
  - Generic categories (networking, scripting, relational databases,
    web testing, ai tools, technical documentation)
  - Process methodologies (Scrum, Agile, SDLC, STLC, unit testing,
    integration testing, regression testing)
  - Universal protocols/formats (HTTP, JSON, XML, REST as a concept —
    but DO extract specific tools like Postman or specific REST frameworks)
  - Tools every developer uses (git, terminal, IDE)

DEDUPLICATE: if a skill appears in two forms (react + react.js, node + node.js),
output one, the form most commonly used in the Ukrainian IT market.
```

Edit `domain.@description` (currently lines 152–157) — append:

```
NOT a domain — return null instead:
  - Tech stacks (DevOps, Microservices, Web Development, Cloud)
  - Generic terms (Industrial, Deep Tech, Recruitment, Web Dev)
  - Roles dressed as domains (Software Development, Engineering)
```

Edit `role.@description` (currently lines 89–94) — replace the
"If unclear → 'Software Engineer'" cop-out with:

```
PREFER umbrella roles over hyper-specific ones:
  "Senior React Developer"  → "Frontend Developer"
  "Python/Django Engineer"  → "Backend Developer"
  "Node.js Full Stack"      → "Full Stack Developer"
  "iOS Engineer"            → "Mobile Developer (iOS)"

If genuinely a niche role with no umbrella fit → use a clear role name.
If posting is not a software/tech job at all → null.
```

### 4. Add a UA market context header

Currently the prompt mentions "Ukrainian IT market" once and that's it.
Add a one-paragraph header at the top of the prompt body:

```
Context: Ukrainian IT market job postings. Specifics to recognize:
  - Postings are mixed-language (UA + RU + EN). Translate skill/role
    names to English; keep canonical English forms.
  - "Бронь" / "бронювання" → military reservation benefit (hasReservation).
  - "ФОП" → contractor (sole-proprietor) employment, ignored at extraction.
  - "Дія Сіті" / "Diia City" → tax regime, not a domain.
  - Salary is usually monthly in USD; bare "$" defaults to USD/month.
```

### 5. Optional polish

- Lift `MAX 8 required` cap to 10 (some senior roles legitimately have more).
- Strengthen `seniority`: "If title contains Junior/Middle/Senior/Lead,
  that wins over body text."
- Add a `confidence` field on the most-guessed values (`domain`, `seniority`,
  `companyName`) — `"high" | "medium" | "low"`. Lets you log low-confidence
  extractions for review.
- Numeric guardrails on salary: min/max outside [100, 50000] USD-equivalent
  → null with a logged reason.

---

## How to measure (mandatory before/after)

This is the same loop the seed iteration used — it works, follow it.

```bash
# 1. Capture BEFORE coverage. Note the three pct numbers + fully-verified.
docker exec metahunt-db psql -U metahunt -d metahunt -c "
SELECT 'role' AS axis, COUNT(*) FILTER (WHERE n.status='VERIFIED') AS v, COUNT(*) AS t
FROM vacancies v LEFT JOIN nodes n ON n.id = v.role_node_id
UNION ALL SELECT 'domain', COUNT(*) FILTER (WHERE n.status='VERIFIED'), COUNT(*)
FROM vacancies v LEFT JOIN nodes n ON n.id = v.domain_node_id
UNION ALL SELECT 'skill', COUNT(*) FILTER (WHERE n.status='VERIFIED'), COUNT(*)
FROM vacancy_nodes vn JOIN nodes n ON n.id = vn.node_id;"

# 2. Re-extract all rss_records with the new prompt.
#    The extractor reads from rss_records.html_path / pulls fresh text and
#    writes back to extracted_data. Find the right script — likely:
#    apps/etl/scripts/extract-missing.ts or via /rss/extract-missing endpoint.
#    If extraction is workflow-driven, you may need to clear extracted_at
#    on a sample of records and let the workflow re-process them.

# 3. WIPE → SEED → FILL (in this order — see pitfall below).
docker exec metahunt-db psql -U metahunt -d metahunt -c "
TRUNCATE TABLE vacancies CASCADE;
DELETE FROM nodes WHERE status = 'NEW';"
pnpm db:seed
pnpm exec ts-node --project tsconfig.json apps/etl/scripts/fill-vacancies.ts

# 4. The fill-vacancies output ends with a "=== Taxonomy match coverage ==="
#    block — that's your AFTER. Compare to BEFORE.
```

### Pitfall — order matters

`wipe → seed → fill`, never `seed → wipe → fill`. Seeding before wiping
loses your new aliases because `onConflictDoNothing` on the seed's alias
insert can't beat aliases already claimed by NEW nodes from earlier loader
runs. Burned an iteration on this; don't repeat.

---

## Definition of done

After the prompt edit + re-extract + measure:

- ROLE verified ≥ 95% (currently 97.2%, should stay or improve)
- DOMAIN verified ≥ 92% (currently 88.0%)
- SKILL verified ≥ 75% (currently 63.4% — the big target)
- Fully-VERIFIED vacancies ≥ 25/142 (currently 13)
- `loader-smoke` still passes
- `baml-cli test` still passes (both `senior_backend_remote` and
  `dou_fullstack_talanovyti`)

If you don't hit those targets with the prompt-only changes, the next
investment is closed-enum BAML for ROLE + DOMAIN (not SKILL — keep that
free-form). That's a bigger change; treat as a separate session.

---

## Things to NOT do

- Don't make SKILL a closed BAML enum. 250+ entries, growing constantly,
  and the long tail (drone protocols, niche frameworks) becomes a
  codegen-required change every time. Keep SKILL free-form + soft prompt
  guidance.
- Don't add ten changes at once. The whole point of the measurement loop
  is attributing gains. One change → measure → next.
- Don't touch the loader, resolver, or schema for this. The fix is in the
  prompt.
- Don't commit a change that doesn't pass `loader-smoke` and `baml-cli
  test`.

---

## Commit format

Match the existing convention from `git log --oneline | head`:
```
feat(extraction): tune BAML prompt — taxonomy hints + anti-fluff rules

ROLE  XX% → YY%  (+Zpp)
DOMAIN XX% → YY%
SKILL  XX% → YY%
Fully-VERIFIED N → M

Changes:
- ...
```
