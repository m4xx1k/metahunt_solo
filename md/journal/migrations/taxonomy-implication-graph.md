# taxonomy — finishing the `kind` split, then the implication graph

**Linear:** MET-145 (`kind`), MET-121 (map UI), MET-27 (implication graph)
**Status:** design. kind-map steps 0–3 landed (`beac7b8`, `8a0c30b`, `e6335ba`);
step 4 (map page) built, uncommitted. Steps 5–7 + the pieces that make `kind`
actually pay off are this doc, in order. The implication graph is the last phase.
**Written:** 2026-09-05.
**Read `taxonomy-kind-map.md` first** — this is its continuation, not a replacement.

---

## 0. Are we done? No.

Step 4 shipped a working map. It does **not** finish the initiative. What is
actually left, cheapest first:

| # | Piece | State | Why it blocks |
|---|---|---|---|
| A | `repairSubscriptions` on the live merge path | **missing** | the map's shift+click merge silently breaks saved filters (§4) |
| A | `excludedSkillIds` repair | **missing** | a merged excluded skill stops being excluded — user sees what they hid (§4) |
| A | mutation journal (`taxonomy-kind-map.md` step 6 says it exists — it does not) | **missing** | no audit trail, no way to replay local curation to prod |
| B | `backend` classified to zero grey tiles | not started | it's the DoD, one evening on the map |
| B | the mis-seeded protocols (`MCP`, `REST-API`, `gRPC`, `WebSockets`, `LLM`) | seeded CONCEPT, are TECH | §2.2 |
| C | extractor allowed to emit concepts | **the extractor is told to drop them** | recovered concepts only score on old data otherwise (§ Phase C) |
| D | filter-rail composition decision | open | un-hiding concepts floods the rail unless decided first (§ Phase D) |
| D | `set-kind` plan op + prod replay | not built | `kind` never reaches prod without it |
| E | implication graph | design only | the "DynamoDB should match AWS" problem (§3) |

`grep -c repairSubscriptions apps/etl/src/admin/taxonomy/taxonomy.service.ts` → `0`.
`grep -c "appendFile\|jsonl" …/taxonomy.service.ts` → `0`.
`grep -c excludedSkillIds …/taxonomy-migrate.cli.ts` → `0`.

---

## 1. The finishing sequence

Five phases. A blocks everything. B and C can run in parallel once A lands. D is
the release. E is a separate later initiative that this doc specs so the seams
are cut right now.

```
A  make the map safe on prod data        ← blocks the map touching prod
B  classify backend on the map (step 5)   ┐ parallel
C  extraction emits concepts (new rules)  ┘
D  ship kind to prod (steps 6–7)          ← one release: un-hide + rail filter
E  implication graph (MET-27)             ← later
```

---

### Phase A — make the map safe on prod data

Everything here is a bug the map's new merge entry point exposes. All local, all
revertible, no product decision.

**A1. Lift `repairSubscriptions` into a service both merge paths call.**

Today `repairSubscriptions()` lives inside `taxonomy-migrate.cli.ts` and runs
only on the plan-file path. `TaxonomyService.mergeInto()` — the admin API, and
now the map — re-points aliases, `vacancy_nodes`, `vacancies.role/domain_node_id`,
`candidate_nodes`, `track_nodes`, `node_tech_meta`, `node_slug_aliases`… and
stops. `subscriptions.params` is `jsonb` with no FK, so the merged-away uuid just
sits there and that filter arm silently stops matching.

- New `SubscriptionRepairService.repointMergedNodes(remap: Map<uuid,uuid>, tx)`.
- `mergeInto` calls it inside its transaction with `{ [sourceId]: targetId }`.
- The CLI calls the same service instead of its private copy.
- Keep the CLI's `wouldSilence` guard (refuse to empty an active sub's arm,
  report it for a human) — move it into the service too.

**A2. Add `excludedSkillIds` to the repair.**

`repairSubscriptions` reads only `params->'roleIds'` and `params->'skillIds'`.
`excludedSkillIds` is a live key (verified: 1 row in the local restore). A
merged-away excluded skill stops being excluded — worse failure than a missed
match, because the user explicitly asked not to see it. Same `fix()` treatment,
third arm.

**A3. The mutation journal (step 6 infrastructure).**

`taxonomy-kind-map.md` step 6 assumes every mutating `TaxonomyService` call
appends to `.private/journal/taxonomy-curation.jsonl`. It doesn't. Build it now —
D can't ship without it.

- One append per successful mutation, after commit:
  `{ ts, op, type, nodeId, canonicalName, from, to, actor: "map" }`.
  `op ∈ { set-kind, verify, hide, rename, merge-into }`.
- Write through a tiny `CurationJournal` service injected into `TaxonomyService`;
  a no-op when the path isn't set (tests, prod-read-only).
- Path from env, defaulting to `.private/journal/taxonomy-curation.jsonl`
  (already gitignored).
- The journal is append-only and local; it is the audit trail MET-121 asked for,
  earned as a side effect.

**A4. Guard tests.**

- `mergeInto` re-points a subscription's `skillIds`, `roleIds`, `excludedSkillIds`.
- `mergeInto` refuses (reports, doesn't crash) when it would empty an active arm.
- every mutating call writes exactly one journal line; a failed call writes none.

**DoD:** merge from the map leaves no dangling uuid in any `params` arm; every
map action is one journal line.

---

### Phase B — classify `backend` on the map (kind-map step 5)

One evening. The map is the tool; this section is the rulebook. Uses the
`taxonomyApi.setKind` the map already calls — no new code, just the journal from
A3 recording it.

Order of work on the map:

1. Fix the mis-seeds first (§2.2 `backend` row): `MCP`, `REST-API`, `gRPC`,
   `WebSockets`, `LLM` seeded CONCEPT → click to TECH. `CI/CD`, `Microservices`,
   `DDD`, `SOLID`, `Event-Driven Architecture` stay CONCEPT.
2. Grey tiles (NULL kind): classify each. Backend top-150 has 8, all also HIDDEN
   — setting a real kind auto-verifies them (the load-bearing side effect).
3. `h` the genuine junk: `AI tools`, bare `AI`, `GenAI` if it duplicates
   `Generative AI`.
4. `shift+click` merges: **only** true spelling/synonym dupes (§2.3). When in
   doubt, leave it — a wrong merge is not reversible without a restore.

**DoD (from kind-map "Done when"):** `backend` has zero grey tiles in its top 150
by `df`. Repeat per direction: `data-ai`, `devops`, `qa`, then the rest.

---

### Phase C — extraction emits concepts

**The contradiction.** The migration recovers ~150 concepts from HIDDEN so they
score in `node_stats`. But `extract-vacancy.baml` tells the LLM to **drop** them:

> EXCLUDE: … Process methodologies (Scrum, Agile, SDLC, STLC, unit testing…),
> Universal protocols / formats (HTTP, JSON, XML, REST as a concept)…
> `skills` — EXCLUDE: … methodologies (Scrum/Agile), domain knowledge…

So a recovered `Microservices` or `RAG` node scores only against **historical**
extractions that predate the current EXCLUDE rules. New vacancies won't link to
it. The recovery is half-dead on arrival.

The extractor vocab (`knownSkills`) is already every VERIFIED skill
(`baml.extractor.ts` `loadTaxonomy` → all `status='VERIFIED'`), so a recovered
concept is *in the prompt* — it's the EXCLUDE instructions that kill it.

**C1. Split the EXCLUDE list into "never" and "only if verified".**

- **Never** (real noise, keep excluding): soft skills, generic categories
  ("networking" as a word, "web testing", "ai tools", "technical documentation"),
  raw protocols nobody lists as a skill (`HTTP`, `JSON`, `XML`), tools every dev
  uses (`git`, `terminal`, `IDE`).
- **Allow when it's a VERIFIED node**: architectural styles and named practices —
  `Microservices`, `Event-Driven Architecture`, `CQRS`, `RAG`, `Prompt
  Engineering`, `CI/CD`, `TDD`, `ETL`, `MLOps`. The prompt already receives the
  verified list; change the instruction from "exclude methodologies" to "include
  a methodology **only if it appears verbatim in `knownSkills`**".

This makes the map the single control surface: a concept scores from new
vacancies **iff** it's verified, and verifying it is one click on the map.

**C2. Keep the "don't invent" rule strict.** The extractor may emit a concept
only when it's an exact `knownSkills` entry — never a free-form concept. Free-form
stays TECH-only (a new library is fine to mint; a new "methodology" is almost
always a rephrase of one that exists). This stops the long tail of
`event driven design` / `event-driven` / `EDA` spawning three NEW nodes.

**C3. Re-extraction is not required.** The rule change is forward-only. Historical
`vacancy_nodes` already hold whatever concepts old runs captured; `node_stats`
refresh picks them up the moment the node leaves HIDDEN. A backfill re-extract is
a separate, expensive, out-of-scope call (MET-24 territory).

**DoD:** a JD that says "event-driven microservices, CI/CD, RAG pipeline"
produces `vacancy_nodes` rows for `Event-Driven Architecture`, `Microservices`,
`CI/CD`, `RAG` — each only because that exact node is VERIFIED.

---

### Phase D — ship `kind` to prod (kind-map steps 6–7)

**D1. Decide the filter rail. This blocks the release.**

`taxonomy-kind-map.md` step 6 says ship `AND kind = 'TECH'` on the rail. Measured
on the local restore, that deletes the working vocabulary of AI roles:

| `data-ai` node | df | kind |
|---|---|---|
| LLM | 375 | CONCEPT |
| RAG | 320 | CONCEPT |
| Machine Learning | 247 | CONCEPT |
| Computer Vision | 218 | CONCEPT |
| Prompt Engineering | 131 | CONCEPT |

Options, preferred first:

1. **Rail = TECH + CONCEPT, sorted TECH-first.** The noise worry is mostly a sort
   problem; the rail is already search-driven. One-line change in
   `facets.service.ts` — drop the `kind` filter, add `ORDER BY kind = 'TECH' DESC`.
2. **TECH default + "practices" toggle.** Honest, one more control, more UI.
3. **TECH only**, as written. Wrong for `data-ai`, `qa`, `security`.

Leaning (1).

**D2. Build the `set-kind` plan op.**

`taxonomy-migrate.cli.ts` `PlanOp` today: `rename | merge | hide | verify`. Add
`{ op: "set-kind"; type; name; kind: "TECH"|"CONCEPT"|"SOFT"|null; why? }`.
`TaxonomyService.setKind` already exists and already auto-verifies HIDDEN — the
CLI op is a thin wrapper, same shape as `verify`.

**D3. Journal → plan → apply.**

```
1. curate locally on the map               → .private/journal/taxonomy-curation.jsonl   (Phase A3)
2. scripts/journal-to-plan.mjs <jsonl>      → apps/etl/src/admin/taxonomy/plans/kind-v1.plan.json
3. pnpm taxonomy:migrate --plan … (dry-run) → review verdicts
4. DATABASE_URL=$(scripts/prod-db-url.sh) pnpm taxonomy:migrate --plan … --apply --yes-prod
   └─ runs repairSubscriptions (Phase A) + node_stats refresh in the same pass
```

The journal→plan script is new (~40 lines): dedupe (last write per node wins),
map uuids back to canonical names (plan files are name-keyed), emit phases.

**D4. One release.** The rail change (D1) and the un-hiding (D3) ship in the
**same deploy**, or every concept recovered from HIDDEN appears as a filter chip
for users between the two deploys.

**D5. Guard tests that run in CI:** the rail query filters/sorts on `kind`;
`node_stats` does **not** reference `kind`; `/match` have/missing does **not**
reference `kind`.

**DoD (kind-map "Done when"):** `nodes.kind` populated for the curated
directions; prod rail selects on `kind`; concepts recovered from HIDDEN score in
`node_stats`; no dangling subscription arms post-apply.

---

### Phase E — the implication graph (MET-27)

Separate initiative. Specced in §3 so Phase A/D cut the seams (edge table
cascades, merge re-point) correctly now.

---

## 2. Domain rules — the reference

### 2.1 What `kind` is

Three values, no fourth (locked in kind-map). The line:

> **TECH** = a named thing you pick up and *use / operate / integrate*.
> **CONCEPT** = a technique, practice, or architectural style you *apply or reason with*.
> **SOFT** = communication / process / language (2 nodes; kept out of the click cycle).

Corollaries that catch 90% of the borderline cases:

- **Protocols, wire formats, standards, query-language categories are TECH** —
  `MCP`, `gRPC`, `REST-API`, `WebSockets`, `GraphQL`, `OAuth 2.0`, `JWT`,
  `Protobuf`, `MQTT`, `SOAP`, `TCP/IP`, `DNS`, `DHCP`, `I2C`, `SPI`, `MAVLink`,
  `ONNX`, `NoSQL`, `Vector Databases`. Concrete even when not one product.
  kind-map step 1 pre-warns the bus/protocol seeds are wrong.
- **A model-as-tool category is TECH** — `LLM` like `NoSQL`.
- **"Generic vs specific" is a different axis** (`node_tech_meta.generic`, scoring
  multiplier, out of scope here). `NoSQL` and `Redis` are **both** TECH; one is
  later flagged `generic`. Do not encode genericness in `kind`.
- **CI/CD is a practice → CONCEPT.** The tools are `Jenkins` / `GitHub Actions` /
  `GitLab CI/CD` (TECH). Corrects an earlier call in chat.
- **`kind` ≠ visibility.** A CONCEPT is VERIFIED, scored, matched, shown on cards.
  It is only kept off the *chip rail* (Phase D). Recovering concepts from HIDDEN
  is the entire point of the split — never conflate CONCEPT with "hidden" or
  "skip".
- **`h` (hide) is for noise only** — `AI tools`, bare `AI`, buzzword dups. Not
  `RAG`, not `Prompt Engineering`, not `MCP`.

### 2.2 Per-track rules

Real data from the local restore. "fix" = seeded wrong, correct it on the map.

**backend** (and the generic `Software Engineer` role — there is no
`software-engineer` track; it curates through `backend`):

| → TECH | → CONCEPT |
|---|---|
| langs, frameworks, libs, datastores, clouds, tools | Microservices, Event-Driven Architecture, Clean Architecture, DDD, SOLID |
| REST-API, gRPC, WebSockets, GraphQL, OAuth 2.0, JWT, Protobuf, SOAP, MQTT | Distributed Systems, System Design, Design Patterns, CQRS, Event Sourcing |
| NoSQL, Vector Databases, MCP, LLM | CI/CD, Multithreading, Concurrency, OOP, Algorithms, TDD |

fix: `REST-API`, `gRPC`, `WebSockets`, `MCP`, `LLM` (seeded CONCEPT → TECH).

**devops:**

| → TECH | → CONCEPT |
|---|---|
| Linux, Kubernetes, Terraform, Docker, Ansible, Helm, ArgoCD, Prometheus, Grafana, Zabbix, Nginx | CI/CD, GitOps, Infrastructure as Code, SRE, Observability, Monitoring, Incident Response |
| Jenkins, GitLab CI/CD, GitHub Actions, Azure DevOps, Bash, PowerShell | Networking, Network Security |
| **TCP/IP, DNS, DHCP** (protocols) | |

fix: `TCP/IP`, `DNS`, `DHCP` (seeded CONCEPT → TECH — protocols, "as concrete as
PostgreSQL"). `Networking` stays CONCEPT — it is the umbrella, an
implication-graph parent (`DHCP → Networking`), **not** a merge target.

**data-ai** (and `data-ml`, `data-ai-eng`, `data-science`, `data-cv`,
`data-engineering`):

| → TECH | → CONCEPT |
|---|---|
| PyTorch, TensorFlow, scikit-learn, XGBoost, LangChain, LangGraph, LlamaIndex | RAG, Prompt Engineering, AI Agents, Fine-tuning, Feature Engineering |
| OpenAI, Claude API, Gemini, AWS Bedrock, Hugging Face, MLflow, vLLM, n8n | MLOps, Machine Learning, Deep Learning, NLP, Computer Vision, Generative AI |
| Vector Databases, Pinecone, Qdrant, Weaviate, ONNX, TensorRT | ETL, ELT, Data Warehousing, Data Modeling, Data Pipelines, A/B Testing, Statistics |
| dbt, Airflow, Spark, Snowflake, Databricks, LLM, MCP | Reinforcement Learning, Recommendation Systems, Quantization, Pruning, SLAM |

fix: `MCP`, `REST-API`, `LLM` (→ TECH). `Embeddings` borderline — lean TECH (an
artifact you generate and store). **Rail here must be TECH + CONCEPT** (D1).

**qa:**

| → TECH | → CONCEPT |
|---|---|
| Postman, Playwright, Selenium, Cypress, Appium, JMeter, REST Assured, PyTest | Manual Testing, API Testing, Test Automation, Test Design, Test Planning |
| TestRail, Swagger, Charles Proxy, Chrome DevTools, Jira, Confluence | Performance Testing, Regression Testing, Exploratory Testing, BDD, CI/CD |

note: `REST-API` is seeded TECH here (correct) but CONCEPT in backend/data — the
seed is inconsistent; fix backend/data, leave qa. `API Testing` stays CONCEPT
(it's a practice; `Postman`/`REST Assured` are the tools).

**security:**

| → TECH | → CONCEPT |
|---|---|
| SIEM, SOAR, IAM, EDR, WAF, IDS/IPS, Splunk, Burp Suite, Microsoft Entra ID | Penetration Testing, Threat Modeling, Incident Response, DevSecOps, Cloud Security |
| SAST, DAST, SCA (tool categories) | ISO 27001, SOC 2, NIST, GDPR, CISSP, MITRE ATT&CK, OWASP Top 10 |

note: compliance frameworks and knowledge bases (ISO 27001, MITRE ATT&CK, OWASP)
are CONCEPT. `OWASP Top 10` is HIDDEN+NULL → CONCEPT + verify.

**mobile:** clean seed. TECH: Kotlin, Swift, the SDKs, React Native, Flutter,
Jetpack Compose, Coroutines, Combine, Bloc, Riverpod, Hilt, Room, Retrofit,
fastlane, Expo. CONCEPT: MVVM, MVI, Clean Architecture, CI/CD.

### 2.3 Merging — especially concepts

The service already handles the mechanics (aliases, `vacancy_nodes`,
`candidate_nodes`, `track_nodes`, `node_tech_meta`, slugs; Phase A adds
subscriptions). The judgement:

**Merge only when two names are one concept.** A spelling or synonym dupe:

- `API Testing` ← `API Test`, `Testing APIs`
- `Manual Testing` ← `Manual QA`
- `Test Automation` ← `Automation QA`, `QA Automation`
- `RAG` ← `Retrieval Augmented Generation`
- `LLM` ← `Large Language Models`, `LLMs`
- `Generative AI` ← `GenAI`
- `Machine Learning` ← `ML`

**Never merge a specific concept into a general one.** That is subsumption, and a
flat taxonomy cannot express it — [ADR-0014](../decisions/0014-skill-graph-and-the-lab.md)
measured that the 87 flagged "duplicate" edges are mostly legitimate subsumption
(`SQLAlchemy → Python` at P=1.00) and merging them **destroys information**.

- `Test Design` ✗→ `Test Documentation` — related, not equal
- `DHCP` ✗→ `Networking` — protocol under an umbrella
- `Event-Driven Architecture` ✗→ `Microservices` — co-occur, distinct
- `ERC-20` ✗→ `Smart Contracts` — the `skill-dupes-v2.plan.json` FLAG: reads as
  subsumption, left for human review

These pairs are **implication-graph edges** (§3), not merges. If you feel the
urge to merge a specific concept upward, that's the signal to add an `IMPLIES`
edge instead — once the graph exists.

**Concept merges are more dangerous than tech merges** because the seed dumped
every `PRACTICE` into CONCEPT and practices have dense near-synonym clusters. Bias
hard toward leaving them separate; the cost of two near-duplicate CONCEPT tiles
is one extra chip, the cost of a wrong merge is a restore.

### 2.4 Aliases

**How resolution works today** (`NodeResolverService.resolve`):

1. `normalizeAliasName(name)` — lowercase, strip `\s _ . / -`. So `REST Assured`,
   `rest-assured`, `RestAssured` → one key. `C++`, `C#`, `Node.js` survive
   (only separators stripped).
2. Look up `node_aliases` by `(type, normalized_key)`. Hit → that node.
3. Miss → create a `status='NEW'` node, link the alias.

Rename keeps the old canonical as an alias. Merge folds source canonical + its
aliases into the target. The BAML extractor gets every VERIFIED name as
`knownSkills` and is told to use exact canonical for listed skills, free-form
English otherwise.

**What changes for `kind` / concepts:**

- **Nothing structural.** The normalizer + `node_aliases` already carry concepts.
- **Concepts need more hand-seeded aliases than tech**, because they're written
  more variably and the normalizer only kills punctuation — it does not know
  `EDA` = `Event-Driven Architecture` (acronym) or `event-driven design` =
  `…architecture` (synonym). During Phase B curation, per verified concept, add
  2–4 aliases: the acronym (`EDA`, `DDD`, `TDD`, `CQRS`), the `design`/`architecture`
  swap, the plural. This is manual and belongs in the same map pass — a small
  "add alias" affordance on the tile is a reasonable step-4.1 follow-up, or it
  goes in the plan file as `rename`-adjacent ops.
- **The "don't invent" extractor rule (C2) is the other half.** Tight vocab on
  the emit side + hand-seeded aliases on the resolve side = concepts converge to
  one node instead of fragmenting.
- **Acronym collisions are real** — `EDA` is Event-Driven Architecture *and*
  Electronic Design Automation (hardware). Aliases are `(name, type)`-unique but
  not context-aware. Rule: only alias an acronym when it's unambiguous **within
  the tracks that node appears in**; `EDA`→EDArch is safe on backend, unsafe if
  the hardware EDA node shares a track. Check `track_node_stats` before adding.

---

## 3. The implication graph (MET-27) — full design

### The example conflates three relations

`DynamoDB` sits under `AWS`, `Cloud`, `NoSQL` — differently:

| Pair | Relation | Store? |
|---|---|---|
| DynamoDB → AWS | vendor / platform membership | direct edge |
| DynamoDB → NoSQL | category membership | direct edge |
| DynamoDB → Cloud | via AWS → Cloud | **derive** — never store |

One edge type: **`IMPLIES`, directional**. Multi-parent is natural. Depth is
transitive closure at read time. Storing `DynamoDB → Cloud` explicitly is how the
graph rots — retire `AWS → Cloud` and the orphan survives.

### The rule everything hangs on

> **Implication credits upward, never downward.**

- CV has `DynamoDB`, JD wants `AWS` → **credit**.
- CV has `AWS`, JD wants `DynamoDB` → **no credit**.

A partial order, not a similarity. Get the asymmetry wrong and the feature goes
from "recognises a strong candidate" to "everyone matches everything".

### What qualifies as an edge

Antecedent is **unusable without** the consequent — not merely *usually with* it.

- `Spring → Java` ✅ — Spring is JVM-only.
- `Alembic → SQLAlchemy` ✅ — Alembic is SQLAlchemy's migration tool.
- `RAG → LLM` ✅ — crosses CONCEPT → TECH, and that's fine: `kind` says "what
  sort of thing", the edge says "does having this prove having that".
- `Microservices → Docker` ❌ — common together, but microservices run on VMs.
  COMPLEMENT, belongs to co-occurrence, not here.
- `RAG → Vector Databases` ⚠️ already hand-labelled `IMPLIES`; borderline (RAG
  over BM25 exists). Passed owner review — the point is this call can't be
  automated.

### Data model

```sql
CREATE TYPE node_relation AS ENUM ('IMPLIES','SUBSTITUTE','COMPLEMENT','CONTESTED');
CREATE TYPE edge_source   AS ENUM ('MINED','CURATED','SEED');
CREATE TYPE edge_status   AS ENUM ('PROPOSED','ACTIVE','REJECTED');

node_edges (
  from_node_id uuid NOT NULL REFERENCES nodes(id) ON DELETE CASCADE,  -- antecedent
  to_node_id   uuid NOT NULL REFERENCES nodes(id) ON DELETE CASCADE,  -- consequent
  relation     node_relation NOT NULL,
  source       edge_source   NOT NULL,
  status       edge_status   NOT NULL DEFAULT 'PROPOSED',
  confidence   real,
  evidence     jsonb,   -- {npmi, p_b_given_a, support, corpus_n, mined_at}
  decided_at   timestamptz,
  PRIMARY KEY (from_node_id, to_node_id, relation),
  CHECK (from_node_id <> to_node_id)
)
```

Only `relation='IMPLIES' AND status='ACTIVE'` touches scoring. `PROPOSED` is the
miner's queue and the adjudication surface — same shape as the map is for `kind`.
`SUBSTITUTE`/`COMPLEMENT` stored because labelling produces them anyway and
ADR-0010's substitute gate can eventually read them instead of re-deriving from
npmi. The `evidence` snapshot makes re-mining safe: an edge gets *flagged* on
drift, never silently flipped.

### Edge cases

| # | Case | Rule |
|---|---|---|
| 1 | **Cycles** — `LangGraph→LangChain` + later `LangChain→LangGraph` | Enforce a DAG: on activate, reject if consequent already reaches antecedent. Recursive check |
| 2 | **Diamond** — CV has DynamoDB *and* S3, both ⇒ AWS | Credit AWS **once**. Free if expansion is a set union before intersection |
| 3 | **Depth dilution** — `Alembic ⇒ SQLAlchemy ⇒ Python ⇒ …` | Cap closure depth (`D=2`) **and** decay per hop (`IMPLIED_CREDIT^depth`, start 0.6) |
| 4 | **IDF feedback (the dangerous one)** | Expand the **candidate side only, at query time**. `node_stats` keeps counting literal links. Never expand the corpus side |
| 5 | **Substitutes leaking in** — `p(PyTorch\|TensorFlow)` high, directionless | Only `IMPLIES` scores. Whole reason the labelled vocab keeps 4 values |
| 6 | **Direction drift** — `p(AWS\|DynamoDB)≈1.0` today; corpora move | Re-mine vs `evidence`; decayed edge → review queue. Never auto-deactivate |
| 7 | **Merges** — DynamoDB merged away | `ON DELETE CASCADE` on both cols **plus** explicit re-point in `mergeInto` (Phase A shape) — cascade alone *deletes* the edge instead of moving it |
| 8 | **Exclusions propagate the other way** — user excludes `PHP`, `Laravel⇒PHP` | Exclusion expands **downward**: everything implying PHP is excluded too. Mirror of credit. Miss it and `excludedSkillIds` leaks |
| 9 | **Umbrella-only JD** — asks only "Cloud" | Works cheaply: umbrellas are high-df → low IDF weight → an implied hit is worth little. Economics already right |
| 10 | **`type` boundary** | v1 is SKILL→SKILL only. Role implication is a different model; `track_nodes` covers browse |

### Where it plugs into scoring

One place — the candidate's resolved node set, shared by `ranking.service.ts`
(`rankByRefs`) and `recommendation.service.ts`:

```
effective_candidate = literal ∪ closure(literal, IMPLIES, depth ≤ D)
implied hit scores  weight × IMPLIED_CREDIT^depth
```

Corpus side untouched. One revertible, feature-flaggable change — ships dark.

**Display rule:** an implied hit is *labelled* in `/match` ("AWS — via
DynamoDB"), never rendered as a direct hit. The explanation is the product.

### The maintenance loop (self-running, steerable)

1. **Mine** (scheduled with the stats refresh). Scan `node_skill_cooc` for
   asymmetric conditionals — `p_b_given_a ≥ 0.85 AND p_a_given_b ≤ 0.5 AND
   a_support ≥ 25`. Insert `PROPOSED`, never `ACTIVE`.
2. **Adjudicate.** A map-like screen: proposed edges + evidence columns, three
   verdicts (implies / not / substitute). Keyboard, one evening per batch. This
   is the "я міг щось міняти" half.
3. **Seed.** Import the 33 hand-labelled `IMPLIES` from
   `apps/lab/src/data/pair-relations.json` as `source='SEED', status='ACTIVE'` on
   day one — useful before any adjudication.
4. **Drift.** Re-mine flags `ACTIVE` edges whose evidence decayed → review queue.

Automating step 1 is the 90% win. Automating step 2 is what ADR-0014 measured and
rejected — co-occurrence cannot tell "TensorFlow **or** PyTorch" from "I2C
**and** SPI" because the distinguishing word is discarded at extraction. The only
honest new signal is keeping the `and`/`or` word at extraction time — an
extractor change, not a graph change. Don't relitigate without it.

---

## 4. The identity substrate

Two identifier planes.

**Public / URL — merge-safe.** `nodes.slug` minted once, immutable on rename;
`node_slug_aliases` keeps retired slugs so a merged `/role/<slug>` 308s and a
saved `?roles=<old-slug>` keeps resolving. `facets.service.ts` returns the *slug*
as `id`, resolved to uuid at the controller boundary.

**Internal — merge-safe because Postgres enforces it.** `nodes.id` uuid, real FKs
from `vacancy_nodes`, `candidate_nodes`, `track_nodes`, `node_aliases`,
`node_tech_meta`, `node_slug_aliases`. `mergeInto` walks every one — the comments
show each was learned the hard way.

**The hole:** `subscriptions.params` is `jsonb` holding **raw uuids** (`roleIds`,
`skillIds`, `excludedSkillIds`) with **no FK**:

> "`params` is JSONB with no FK, so nothing else in the system would ever notice a
> dead uuid — the filter arm just silently stops matching."
> — `taxonomy-migrate.cli.ts:368`

Phase A fixes the acute bug (live merge path + `excludedSkillIds`). **The
structural fix, follow-up:** store **slugs, not uuids** in `subscriptions.params`.
Then merges self-heal through `node_slug_aliases` exactly as public URLs already
do, the repair becomes a no-op, and `params` finally agrees with what the facets
API hands the frontend. Needs a backfill + a read-path resolve.

Also promote the integrity query (`taxonomy-migrate.cli.ts:483`, counts
subscriptions holding a dead uuid) to a health check that runs outside the
migration path.

---

## Not in scope

- Re-extracting historical vacancies for the new concept rules (MET-24 territory)
- Role/domain implication — SKILL→SKILL only in v1
- Replacing IDF with substitutability (`feed-scoring-merge.md` "Future path" #2)
- Learned weights / MET-104's hybrid ranker
- `is_core` / `generic` scoring multipliers (matching module)
- Keeping the `and`/`or` word at extraction — the only route to an automatic
  substitute classifier, and an extractor change

## Open decisions

- **Rail composition (D1) — blocks the prod release.** TECH-only vs TECH+CONCEPT
  sorted.
- `IMPLIED_CREDIT` and depth `D` — need a ranking golden set, which
  `feed-scoring-merge.md` flags as missing (MET-104 blocker).
- Whether `SUBSTITUTE`/`COMPLEMENT` edges replace ADR-0010's npmi gate or sit
  beside it.
- Does §4's slug-in-`params` migration ride MET-27 or get its own ticket.
- The "add alias" affordance on the map tile — step 4.1 follow-up, or plan-file
  only.
