# Prompt: let the extractor emit concepts (Phase C)

Paste the block below into a fresh chat/session to do this work — deliberately
kept separate from the taxonomy-kind-map / rail work already shipped.

Context: [`taxonomy-implication-graph.md`](../journal/migrations/taxonomy-implication-graph.md)
Phase C. Rail (Phase D1) already shipped — `facets.service.ts` returns `kind`,
`FilterRail`'s skill chips color CONCEPT blue.

---

```
Working in metahunt_solo (NestJS + BAML extractor). Read /CLAUDE.md first (Docker-only stack, pnpm-only, branch→PR workflow).

CONTEXT: A separate migration recovered a batch of "concept" skill nodes
(architectural styles / named practices — things like "Microservices",
"RAG", "CI/CD", "Event-Driven Architecture") so they're VERIFIED and score
in node_stats. But the vacancy extractor currently tells the LLM to
actively drop this whole category, so a recovered concept only ever
scores against OLD (already-extracted) vacancies — new postings never
produce a match for it. Full background: md/journal/migrations/
taxonomy-implication-graph.md, section "Phase C — extraction emits
concepts" (read this section before touching anything).

FILE: apps/etl/baml_src/extract-vacancy.baml

Two spots currently exclude the whole category:
1. `class Skills { required string[] @description(...) }` — the block
   listing "Process methodologies (Scrum, Agile, SDLC, STLC, unit
   testing, integration testing, regression testing)" under EXCLUDE.
2. The `skills Skills @description(...)` field on the main extraction
   function — "EXCLUDE: soft skills, methodologies (Scrum/Agile), domain
   knowledge, certifications."
There's also a counter-example block near the bottom of the file showing
"Unit Testing" as an excluded output — revisit it once the rule changes
(may still belong in "never", may not — your call, see below).

TASK — split EXCLUDE into two buckets instead of one blanket rule:

- NEVER extract (keep excluding): soft skills, generic category *words*
  (as opposed to a specific verified node) — "networking", "web testing",
  "ai tools", "technical documentation" — raw protocols nobody lists as a
  skill (HTTP, JSON, XML), and tools every dev uses (git, terminal, IDE).

- ALLOW when — and only when — it is an EXACT match against `knownSkills`
  (the prompt already receives every VERIFIED node's canonical name,
  see `{{ knownSkills }}` further down this same file, sourced by
  `loadTaxonomy` in apps/etl/src/02-enrich/extraction/baml.extractor.ts):
  named architectural styles / practices such as Microservices,
  Event-Driven Architecture, Clean Architecture, DDD, SOLID, CQRS,
  Event Sourcing, Distributed Systems, System Design, Design Patterns,
  CI/CD, TDD, RAG, Prompt Engineering, AI Agents, MLOps, ETL, GitOps,
  SRE, Observability, DevSecOps. (Full per-track "→ CONCEPT" tables are
  in taxonomy-implication-graph.md section 2.2 if you want the complete
  list per domain — backend/devops/data-ai/qa/security each have one.)

  Change the instruction from "exclude methodologies" to something like
  "include a methodology-style term ONLY if it appears verbatim in
  knownSkills — never invent one that isn't listed."

CONSTRAINT — keep the existing "don't invent" discipline strict: this
only relaxes what's allowed for an EXACT knownSkills match. A free-form
skill the LLM has never seen before must still only ever be a TECH-shaped
thing (a library, a tool) — never a made-up "methodology". This stops the
extractor from spawning three near-duplicate nodes for "event driven
design" / "event-driven" / "EDA" instead of resolving to the one verified
node.

OPEN QUESTION, decide and note your reasoning: apps/etl/baml_src/extract-
candidate.baml has the same-shaped EXCLUDE ("soft skills, generic
categories, process methodologies") for CV extraction. Does it need the
same treatment for symmetry (a CV mentioning "RAG" or "Microservices"
should probably resolve the same way a JD does), or is candidate
extraction a deliberately different, narrower vocabulary? Look at how
its output is consumed before deciding — don't just mirror blindly.

NOT in scope: no re-extraction of historical vacancies (forward-only —
node_stats picks up recovered concepts from OLD vacancy_nodes rows the
moment they leave HIDDEN, that already works); no changes to the taxonomy
map/kind column/filter rail (separate, already shipped).

VERIFY before calling it done:
- `pnpm --filter @metahunt/etl baml:generate` (regenerates the BAML
  client from the .baml source — required after any .baml edit)
- `pnpm baml:identity:check`
- the extractor spec(s): apps/etl/src/eval/requirements-v2.baml.extractor.spec.ts,
  apps/etl/src/02-enrich/extraction/baml.extractor.spec.ts — these may
  need new fixtures for the new allowed terms
- manual sanity: a JD body like "event-driven microservices, CI/CD, RAG
  pipeline" should extract skills.required containing Event-Driven
  Architecture, Microservices, CI/CD, RAG — each ONLY because that exact
  node is VERIFIED in taxonomy right now, not invented free-form.
- `pnpm lint`, `pnpm test:etl`

Branch: feat/extractor-concepts (or similar) off main, PR when green —
don't merge/deploy without the owner's go, this touches production
extraction behavior.
```
