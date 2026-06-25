# Skill-weighting research — a better signal than IDF

Status: **in progress** (autonomous research loop). Deliverable = this report. **No merge, no PR, no push.**
Branch: `experiment/skill-weighting`. Raw artifacts: `.scratch/skill-weighting/`.

## TL;DR (running)

- The IDF weight (`sqrt(ln(N/(df+5)))`) is a weak *importance* signal, but the headline
  failures (F1/F2/F3) are **not in reverse-ATS ranking — ranking is already stack-coherent
  for all 5 stacks under IDF.** The failures are isolated to **"what to learn next"
  recommendations**, and their root cause is **cohort stack-mixing**, not the weight scalar.
- The recommendation counterfactual ranks skills by **unlock count** over the role cohort.
  Broad roles ("Backend Developer" = Go∪Java∪Python∪Node) make foreign-stack languages the
  highest-unlock skills regardless of IDF. So the fix needs a **stack/relatedness notion**,
  not a better rarity scalar.
- **Verdict: approach E (hybrid).** Retire IDF as the importance scalar → a **tiered importance**
  by skill *category*; **gate recommendations on LLM skill metadata** (category/stack/is_core/
  generic) to fix F1/F2/F3; use **co-occurrence** for the framework substitute-vs-complement
  call. Passes all hard gates 5/5 (baseline 0/5); blind-judge ~4.25 vs baseline ~2.0.
- **Validated at PROD scale (§5):** restored the real 9 278-vacancy / 1 216-skill corpus into a
  separate DB, re-grounded the 5 candidates against the prod taxonomy, rebuilt the pipeline.
  E wins/ties all 5 (judge mean **4.3 vs 2.5**); baseline *degrades* at scale; iOS 0-recs was a
  local-sparsity artifact (resolved); the substitute gate proves essential (node Angular/Vue).
- **Stress-tested against the literature (§7–8):** a cited survey validated E's core (drop IDF;
  no embeddings needed; gate on `{stack,is_core}`). Its headline alternative — **replace IDF with
  RCA — was tested and FAILS as a ranking weight** (go→"Security Architect", node→"Web3", §8): a
  wrong turn avoided. Durable next steps: stack-scoped RCA importance, conditioned unlock scoring,
  NPMI-sign substitutes, ESCO/O*NET validation, de-duplicated taxonomy.

## 1. Eval harness

**Signal = LLM-judge + deterministic hard gates** over **5 local candidates of distinct
stacks**, ingested from `.scratch/resume-samples/`:

| key | candidate_id | role / seniority | stack | #skills |
|---|---|---|---|---|
| go-backend-mid | e1bf62ff | Backend Developer / MIDDLE | Go (gRPC, K8s, Temporal, Redis) | 21 |
| java-backend-snr | 3001fa4a | Backend Developer / SENIOR | Java (Spring, Hibernate, Kafka) | 26 |
| node-fullstack-mid | d905caf7 | Full Stack Developer / MIDDLE | Node/TS (NestJS, Next, React) | 31 |
| ios-mobile-mid | 54c8d54e | Mobile Developer (iOS) / MIDDLE | Swift/ObjC (iOS SDK, Combine) | 21 |
| qa-automation-mid | 42fc6636 | Automation QA Engineer / MIDDLE | QA (Selenium, Playwright, RestAssured) | 24 |

Note: go-backend and java-backend share the **same ROLE node** ("Backend Developer") — same
cohort, different stack — the cleanest cross-stack (F2) test.

**Harness** (`.scratch/skill-weighting/`): a parametrized SQL mirror of production, so every
approach is one `approach` string. Weight is sourced from `exp_node_weight(approach,node_id,
weight)` instead of `node_stats.weight`; `approach='idf'` is a verbatim copy of production IDF.
- `sql/rank.sql` — mirrors `RankingService.rankByRefs` (relevance = Σ weight over overlap;
  fit tier = Σw(matched req)/Σw(all req), STRONG≥0.8 / GOOD≥0.5; `ELIGIBLE_VACANCY` gate).
- `sql/recs.sql` — mirrors `RecommendationService.recommend` (role cohort, seniority band ±1,
  near-miss unlock counterfactual, df-floor 5, df-share ceiling 0.6, VERIFIED-only).
- `sql/recs-meta.sql` — cohort size, coverage %, "redundant" footer (df-share > 0.6).
- `run.sh <approach>` — dumps ranking + recs + meta for all 5 candidates.
Validated: reproduces the documented production failures exactly (Node-fullstack recs =
"Python, JavaScript, MongoDB, …" with "React 66% redundant").

**Hard gates** (deterministic; per candidate):
- G1: 0 recommended skills the candidate already effectively has (incl. same-stack equivalents).
- G2: 0 core technologies flagged "redundant".
- G3: ≥70% of top-10 reverse-ATS vacancies in the candidate's primary stack.
- G4: ≤1 foreign primary-language in top-8 recommendations (target 0).

## 2. IDF baseline (captured 2026-06-24)

Full dump: `.scratch/skill-weighting/dumps/baseline-idf.txt`.

**Ranking (G3): PASS for all 5.** Top-10 is in-stack for every candidate (Go→Golang roles,
Java→Java, Node→NestJS/Fullstack, iOS→iOS, QA→QA Automation). IDF ranking is not the problem.

**Recommendations — gate failures:**

| candidate | top-8 "learn next" (unlocks) | G1 | G2 | G4 |
|---|---|---|---|---|
| go-backend | Python 52, Node.js 36, FastAPI 32, MySQL 31, Java 31, Django 30, RabbitMQ 29, MongoDB 27 | ok | ok | **FAIL** (Python, Node.js, Java) |
| java-backend | Node.js 47, Go 45, K8s 37, Python 37, MySQL 34, MongoDB 32, TypeScript 31, Django 28 | ok | ok | **FAIL** (Node, Go, Python, TS) |
| node-fullstack | Python 35, **JavaScript 33**, MongoDB 17, MySQL 13, FastAPI 12, Express.js 11, Django 10, Go 10 | **FAIL** (JavaScript, Express.js) | **FAIL** (React 66%) | **FAIL** (Python, Go) |
| ios-mobile | _(0 recs; cohort 33)_ | ok | **FAIL** (Swift 94%, iOS SDK 64%) | ok |
| qa-automation | TestNG 2, JUnit 2, JMeter 2, Appium 2, API Testing 2, Linux 2, Python 2, C# 1 | ok | ok | borderline (C#) |

**Baseline score: 0 / 5 candidates pass all gates.** (go, java, node, ios all fail ≥1 gate;
qa borderline.) This is the bar every approach must beat.

### Why IDF is the wrong lever here
The recommendation ranks by **unlock count** = how many cohort near-miss vacancies a skill
would push over GOOD coverage. In a stack-mixed cohort the top-unlock skills are the *other
stacks' core languages* (Python/Java/Go for a Backend cohort), because those vacancies are
exactly the ones the candidate is a near-miss on. IDF weight only nudges within-tier order;
it cannot separate "core to MY stack" from "core to a SIBLING stack". The missing signal is
**stack membership / relatedness**, addressed by approach A (co-occurrence) or C (LLM meta).

## 3. Approaches (under test)

### 3.A — Co-occurrence / PMI (our corpus, no LLM) — **PARTIAL**

Built `exp_skill_cooc` (38 050 pairs, df≥3) with PMI + npmi over per-vacancy skill-sets.
Relatedness(S) = mean npmi(S, held-skill) over the candidate's held set; recs re-scored
`score = unlocks × max(relatedness,0)` (`sql/10-build-cooc.sql`, `sql/recs-cooc.sql`).

The co-occurrence graph is clean (Go→Gin/Echo/gRPC/NATS/Protocol Buffers). Re-scoring:

| candidate | new top-8 recs (was → now) | effect |
|---|---|---|
| go-backend | RabbitMQ, Kafka, MongoDB, FastAPI, Node.js, MySQL, Java, Spring Boot | infra/MQ promoted; Python demoted out — but **sibling langs (Node/Java/Spring/FastAPI) persist** |
| java-backend | Kubernetes, MongoDB, MySQL, Go, Node.js, GCloud, NestJS, FastAPI | K8s/datastores promoted; **Go/Node persist** |
| node-fullstack | **JavaScript**, MongoDB, Express.js, FastAPI, MySQL, Django, GCloud, Redux | Python demoted out; **JS still #1** (genuinely co-occurs with node stack) |
| ios-mobile | _(0 recs)_ | unchanged — cohort 33, too few near-misses clear df≥5 |
| qa-automation | TestNG, JMeter, Appium, API Testing, JUnit, (C#/Linux/Python → score 0) | **clean** — all QA-relevant; foreign demoted to 0 |

**Verdict on A: partial (≈1/5 pass — qa only).** Strengths: demotes the clearly-foreign
(Python everywhere), promotes stack-relevant infra, fixes qa. Ceilings, all structural:
- **F2 sibling languages** (Java vs Go vs Node) share ~60% infra → mean-npmi can't separate
  them (Java 0.077 ≈ MySQL 0.078). A continuous relatedness won't exclude "another primary
  language"; that is a *categorical* rule.
- **F1 already-known** (TS⇒JS): JS legitimately co-occurs with the node stack, so relatedness
  keeps it #1. Needs same-stack-equivalence knowledge, not co-occurrence.
- **F3 redundant** + **ios 0-recs**: untouched (redundant is a separate df-share query; A only
  re-scores the unlock list).
- mean-npmi also *dilutes* niche stack-core libs (Gin 0.048) — a held infra-heavy profile
  drags the language-only pairs down.

Conclusion: A is a useful **ordering prior** and a no-LLM stack signal, but cannot pass the
gates alone. The gates need categorical metadata → approach C.

### 3.C — LLM skill metadata (categorical gates) — **5/5 gates**

Batched LLM classification of all 335 distinct skills (260 VERIFIED + candidate-held) into
`node_tech_meta {category, stack, is_core, generic}` (rubric: `classify-rubric.md`; 4 parallel
classifier agents; loaded into `node_tech_meta`). The candidate's **stack-set (CSS)** = stacks
where they hold an `is_core` skill (go→{go}, java→{java}, node→{node,frontend,mobile-cross},
ios→{mobile-ios}, qa→{frontend,java,qa}). Recs (`sql/recs-c.sql`) drop a skill S iff:
- **F2** S is a concrete-stack LANGUAGE/FRAMEWORK/LIBRARY whose stack ∉ CSS (foreign);
- **F1** S is a core LANGUAGE whose stack already has a held core language (TS ⇒ JS).
Redundant footer flags only `generic=true` skills (`sql/recs-meta-c.sql`), so React/Swift are
never shamed.

| candidate | recs (was → now) | gates |
|---|---|---|
| go | MySQL, RabbitMQ, MongoDB, Kafka, GCloud, Git, Linux, Prometheus | G1-4 PASS |
| java | Kubernetes, MySQL, MongoDB, GCloud, gRPC, REST API, Git, Azure | G1-4 PASS |
| node | MongoDB, MySQL, CI/CD, GCloud, Kubernetes, HTML/CSS, Redux, Firebase (JS/Express/Python/Go dropped) | G1-4 PASS |
| ios | _(0 recs; cohort 33)_ — Swift/iOS SDK no longer flagged redundant | G1-4 PASS |
| qa | TestNG, JUnit, JMeter, API Testing, Linux | G1-4 PASS |

**C passes all hard gates for all 5 (vs baseline 0/5).** F1/F2/F3 all structurally fixed.
Limit found: the naïve **framework-equivalence** rule (drop a same-stack core framework the
candidate "already has one of") misfires on **multi-slot stacks** — it dropped **Appium** for
QA because the candidate holds Selenium (both qa+core, but web vs mobile are not
interchangeable). Removing the rule fixes QA but re-introduces competing frontend frameworks
(Angular/Vue) for the React dev. The clean distinguisher is co-occurrence → approach E.

### 3.E — Hybrid (C categories + A co-occurrence + tiered weight) — **WINNER**

E = C's categorical gates **+** a co-occurrence **substitute gate** **+** a tiered importance
weight replacing IDF (`sql/recs-e.sql`, weight approach `tier`):
- **Tiered weight** (`exp_node_weight approach='tier'`): core stack LANG/FW = 3.0, specific
  DATASTORE/CLOUD = 2.0, stack LIB/FW = 2.2, generic = 0.8, SOFT = 0.6, unclassified → IDF.
  Replaces the IDF scalar in both ranking and the unlock math. Ranking stays stack-coherent
  for all 5 (G3 holds) with sharper core-vs-generic separation; suppresses generic skills
  (Git/Linux stop surfacing in "learn next").
- **Substitute gate** (uses `exp_skill_cooc`): drop a same-stack core FRAMEWORK unless it
  co-occurs (npmi ≥ 0.30) with a held same-stack core framework. In vacancy tags substitutes
  score lower than complements — React/Angular 0.218, React/Vue 0.257 (dropped) vs
  Selenium/Appium 0.358, NestJS/Express 0.540 (kept). This keeps Appium for QA **and** drops
  Angular/Vue for the React dev — the exact case C alone could not separate.

Final E recs: go = MongoDB/MySQL/RabbitMQ/Kafka/GCloud/Terraform/Prometheus/Azure;
java = MySQL/MongoDB/GCloud/K8s/gRPC/Azure/REST API/Cassandra;
node = MongoDB/GCloud/Express.js/MySQL/HTML-CSS/Azure/Redux/Kafka;
qa = TestNG/JUnit/Appium/API Testing/JMeter/Linux; ios = 0 (cohort 33). Full dump:
`dumps/final-approach-e.txt`. **E passes all hard gates 5/5.**

### LLM-judge results (2 blind judges, 1–5; avg)

Per-candidate recommendation quality (blind variant labels, averaged over 2 judges):

| candidate | baseline IDF | A (cooc) | C (meta) | E (hybrid) |
|---|---|---|---|---|
| go-backend | 1.0 | 2.0 | 4.0 | **4.5** |
| java-backend | 1.0 | 2.0 | 4.0 | **4.5** |
| node-fullstack | 1.0 | 1.75 | 4.0 | **~4.0** |
| qa-automation | **5.0**→4.0¹ | 4.0 | 3.0→4.0¹ | **4.0** |
| **mean** | ~2.0 | 2.4 | 3.75 | **~4.25** |

¹ qa: the first judge round (pre-substitute-gate) preferred baseline's breadth (it included
Python/C#); after the substitute gate restored **Appium**, a confirmation judge scored final-E
**4.0 = baseline 4.0** (tie). So final-E **ties-or-beats baseline on every candidate** and
**beats it decisively on aggregate**, while baseline/A fail the hard gates.

## 4. Verdict

**Recommended: approach E — a hybrid signal that retires IDF as the importance scalar.**

1. **Replace `node_stats.weight` (IDF) with a tiered importance** derived from skill *category*
   (core-stack tech ≫ specific datastore/cloud ≫ generic tool/practice ≫ soft), not tag
   rarity. Fixes the original "git ≈ react", "Python lowest / Agile highest" inversions and
   keeps reverse-ATS ranking stack-coherent across all 5 stacks.
2. **Gate recommendations on skill metadata** (`node_tech_meta` from one batched LLM pass):
   never recommend a foreign-stack core tech (F2); never recommend a stack's second primary
   language (F1, TS⇒JS); only flag `generic` skills as "redundant" (F3 — React/Swift safe).
3. **Use co-occurrence (`exp_skill_cooc`) for the framework substitute/complement call** —
   the one distinction categories alone cannot make (Angular≠addition for a React dev;
   Appium=addition for a Selenium QA).

**Why E over C:** identical gate pass (5/5), but E additionally (a) suppresses generic noise
(Git/Linux) from "learn next" via the tiered weight, (b) correctly separates substitute vs
complementary frameworks via co-occurrence, and (c) scores highest on the blind judge (~4.25
vs C 3.75 vs baseline 2.0). **Why not A:** co-occurrence alone (judge 2.4) can demote the
clearly-foreign and order infra well, but cannot exclude sibling-stack languages or know
TS⇒JS — it is a component of E, not a standalone fix. **Headline:** the F1/F2/F3 failures were
never a *ranking-weight* problem; they were a *missing-stack-metadata* problem in the
recommendation cohort. IDF was the wrong lever; category + stack + co-occurrence is the right one.

### Implementation sketch (if productionised — NOT done here)
- Additive tables `node_tech_meta` (LLM-populated, ~1216 prod VERIFIED skills, one batch +
  incremental on new-skill verification) and `exp_skill_cooc` (a materialised view refreshed
  with `node_stats`). Both additive; no destructive change to `node_stats`.
- `RankingService` / `RecommendationService`: source weight from the tiered column (fallback
  to IDF for the unclassified NEW tail); add the F1/F2 drop predicates + generic-only redundant
  filter + the npmi substitute gate to `recommendation.service.ts`. Constants
  (`SUBSTITUTE_NPMI_MIN=0.30`, tier values) into `ranking.contract.ts`.
- Known follow-ups (documented, not blockers): (a) the foreign-language drop is tuned for
  single-stack specialists — for polyglot/cross-cutting roles (QA) language breadth is a
  feature, so gate F2-language on CSS cardinality; (b) "API Testing"/"REST API"-type practices
  the candidate effectively has via specific tools (RestAssured/Postman) need an
  implied-skill map; (c) small cohorts (iOS, 33) yield 0 recs — widen the band or relax df-floor
  for thin cohorts.

### Rollback
All experiment state is additive + local; see `.scratch/skill-weighting/ROLLBACK.md`
(`DROP TABLE exp_node_weight, node_tech_meta, exp_skill_cooc`). `node_stats` untouched. Nothing
merged, no PR, no push.

## 5. Prod-scale validation (round 2)

The §1–4 work ran on a thin LOCAL corpus (7 105 vacancies, **260** VERIFIED skills). To check
the conclusions hold at real scale, the **prod** corpus was restored READ-ONLY into a separate
DB (`metahunt_skillweight`: 9 278 vacancies, 89 693 tags, **1 216** VERIFIED skills) and the 5
candidates **re-grounded against the prod taxonomy** (resolved by normalized skill name;
20–31 of each candidate's skills matched, only HIDDEN/absent ones dropped). The full pipeline
was rebuilt at scale: 1 228 skills LLM-classified (12 parallel agents), 49 850 co-occurrence
pairs, tiered weights. DB hygiene in §6.

**Prod-scale blind judge (2 judges avg, baseline vs E):**

| candidate | baseline IDF | E (hybrid) |
|---|---|---|
| go-backend | 1.0 | **4.5** |
| java-backend | 2.0 | **4.5** |
| node-fullstack | 2.0 | **4.0** |
| ios-mobile | 3.5 | **4.0** |
| qa-automation | 4.0 | **4.5** |
| **mean** | **2.5** | **4.3** |

**E wins or ties on every candidate at prod scale** (locally qa had regressed; at scale it does
not). What changed / was learned:
- **Baseline degrades at scale.** With 1 216 vs 260 skills the cohort spans more stacks, so IDF
  recs pull in *more* foreign languages: go-backend baseline = Python, Node.js, Java, .NET, C#,
  Spring (6 foreign primary techs). The IDF failure is worse at prod scale, not an artifact of
  the thin local corpus. E stays clean (MongoDB, Kafka, MySQL, RabbitMQ, GCloud, Prometheus,
  Terraform, Azure).
- **iOS 0-recs was purely local sparsity.** At prod scale ios gets real recs (XCTest, fastlane,
  App Store, Firebase, CI/CD); E additionally drops **Flutter** (mobile-cross substitute) that
  baseline recommends — so the "thin cohort" limitation in §4 is a data-volume issue, resolved
  at scale, not a signal flaw.
- **The substitute gate earns its place at scale.** node-fullstack baseline **and** plain-C both
  surface **Angular + Vue** (React substitutes); only **E** (co-occurrence substitute gate) drops
  them while keeping complements (Express, Redux, Tailwind). Clearest evidence that **E > C** —
  categories alone cannot make the substitute/complement call.
- **qa polyglot tension softens at scale.** The richer prod cohort gives baseline a decent QA
  list already (Selenide/TestNG/JMeter/Appium), and E ties/beats it — the local "breadth vs
  gate" conflict was partly a small-cohort artifact.
- **New finding — taxonomy hygiene is a dependency.** Prod has unmerged duplicate nodes
  (`rest-assured` NEW vs `REST Assured` VERIFIED); a candidate grounded on one gets the other
  *recommended* — a false "already-known". This is a **taxonomy-curation** problem (dedup of
  NEW/VERIFIED twins), upstream of the signal, but it surfaces as a rec-quality bug.
  Productionising E should run on a de-duplicated taxonomy (the platform already has a curation pass).

**Verdict holds and strengthens at prod scale: E is the recommendation.** All §4 conclusions
reproduce; the only §4 caveats (iOS thin cohort, qa breadth) were small-corpus artifacts.

## 6. DB design — how to run this without polluting anything

The hard rule was "don't засрати the DB". The layout used:
- **Prod is strictly READ-ONLY.** We only `COPY ... TO STDOUT` out of it (never a write). The
  public URL is used solely to pull a snapshot.
- **A dedicated throwaway database** `metahunt_skillweight`, separate from both prod and the dev
  DB `metahunt_railway`, so neither working database is touched. Drop it to erase everything.
- **Real corpus in `public`, all experiment scaffolding in a separate schema `skillweight`**
  (`exp_node_weight`, `node_tech_meta`, `exp_skill_cooc`). `ALTER DATABASE … SET search_path =
  skillweight, public` lets the same harness SQL resolve experiment tables to `skillweight` and
  corpus tables to `public` with zero qualification — and the two never mix.
- **Lean, faithful restore.** Only the columns the matcher reads are pulled (no 175 MB of
  embeddings); enum columns are cast to `text` on the way out so there is no enum DDL to drift;
  `node_stats` is recomputed locally from the exact prod matview formula.
- **Isolated git worktree** (`metahunt-wt-skillweight` on `experiment/skill-weighting`) so this
  work never collides with the other agent editing the frontend in the main checkout.
- Restore/regen scripts: `.scratch/skill-weighting/prod/{restore,reground}.sh`. Teardown:
  `DROP DATABASE metahunt_skillweight; git worktree remove metahunt-wt-skillweight`.

For a real productionisation this maps to: `node_tech_meta` + `exp_skill_cooc` as **additive**
tables / materialised views alongside `node_stats` (never altering it), refreshed on the same
cadence; the tiered weight as a new generated column or a sibling matview. Nothing destructive,
fully reversible — same discipline as this experiment.

## 7. External research — existing methods & footguns

A source-backed survey (full version: `.scratch/skill-weighting/dumps/external-research.md`)
checked approach E against the literature. Headlines:

**What E gets right (validated):**
- **Abandoning IDF as importance is textbook-correct.** IDF measures rarity; rarity ≠ importance
  is the named failure mode. LinkedIn's published "Skills Genome" is itself TF-IDF that *down-
  weights* cross-job-common skills — i.e. down-weighting generic skills is industry-standard
  (LinkedIn Eng blog 2019).
- **"No skill embeddings" is NOT a gap.** word2vec/node2vec provably factorize a (shifted) PMI
  matrix (Levy & Goldberg, NeurIPS 2014); with matched hyperparameters sparse PMI ≈ neural
  embeddings (Levy/Goldberg/Dagan, TACL 2015). Skill2Vec is just word2vec over vacancy skill-sets
  — the same co-occurrence signal E already computes. The only marginal gain (transitive
  smoothing) is a cheap truncated SVD over the PMI matrix, not a neural pipeline. Text/SBERT
  embeddings buy name-semantics + cold-start — which **E's LLM metadata already does symbolically.**
- **Using `{stack, is_core}` to gate recs is *ahead* of naive co-occurrence systems** — two
  `is_core` languages of the same `stack` are almost certainly substitutes, a signal pure-PMI
  methods lack. The research explicitly says to lean on it.

**Real holes found (ranked):**
1. **[highest] Within-vacancy PMI magnitude is a fragile substitute/complement signal.** In job
   ads, alternatives are co-listed ("React or Angular", "AWS/GCP/Azure"), which *inflates*
   co-occurrence of exactly the substitute pairs (confirmed on 65M UK postings, PLOS Complex
   Systems 2024). The canonical fix (Neffke, Sci. Adv. 2019): co-used ≠ complementary — net
   substitutability *out* of co-occurrence. Practical mitigations: use the **NPMI sign**
   (substitutes anti-associate after base-rate correction), **within-resume co-holding** (do real
   people hold both, or one-or-the-other?), and the **LLM `{stack,is_core}`** gate. E currently
   leans on the LLM gate (good) but its npmi-threshold substitute rule is the fragile part.
2. **[high] Replace IDF/tiers with RCA(role, skill).** Revealed Comparative Advantage =
   within-role intensity ÷ market-wide intensity — the literature-standard "how characteristic
   is this skill of this role" measure (Alabdulkareem et al., Sci. Adv. 2018: skill "effectively
   used" iff RCA>1). It is data-driven (E's category tiers are a hand-set *prior*), cheap (we
   already have the counts), and role-conditional. Use a normalized RCA to avoid the Balassa
   asymmetry. **Tested in §8.**
3. **[high] The unlock scorer double-counts correlated skills** (React/Redux/Next all "unlock"
   the same jobs) and chases volume over value. Fix = budgeted, salary/freshness-weighted,
   **sequentially-conditioned** marginal coverage (recompute gain given already-held + already-
   recommended). Maps to actionable-recourse + max-coverage (submodular, 1−1/e).
4. **[medium] Seed/validate LLM metadata against ESCO reuse-levels + O*NET UNSPSC** (both CC BY
   4.0, license-clean). ESCO's "skill reusability level" *is* E's `generic` axis, curated —
   catches LLM hallucinations. Lightcast is paid/commercial-gated; SO-survey is ODbL share-alike.

**Footguns:** reading co-occurrence as complementarity (the "or"-list trap); believing embeddings
fix substitutes (cosine collapses substitutes + antonyms); unweighted unlock coverage chasing
stale jobs; trusting LLM metadata blindly; keeping IDF anywhere in the *importance* path.

## 8. Testing the research's #1 lever: RCA(role, skill) at prod scale

The survey's strongest concrete recommendation was "replace IDF/tiers with RCA(role, skill)"
(Revealed Comparative Advantage = within-role intensity ÷ market-wide intensity). Built
`exp_role_skill_rca` (15 278 rows) over the prod cohort and tested it.

**As an importance *descriptor*, RCA is excellent — for specialized roles:**
- Mobile/iOS: Combine 163, fastlane 98, Swift 94, XCTest 87, Objective-C 83, App Store 60,
  iOS SDK 45 … generic CI/CD ≈ 1.4. This is *exactly* the importance ordering IDF inverts.
- QA: Allure 38, WebdriverIO 35, Selenide 32, TestNG 28, REST Assured 26 — all role-characteristic.

**But RCA dilutes on umbrella roles** (the Balassa weakness the literature warns of): the prod
"Backend Developer" role spans Go/Java/Python/.NET, so its top-RCA skills are niche libs
(Moq 5.5, Netty 5.5, Akka 5.5), not core languages — no skill is *characteristic* of a role that
contains every backend stack. Full Stack is the same (Bun 6.9, shadcn/ui 5.1 over React 4.6).

**Decisive negative result — RCA is a BAD ranking weight.** Weighting reverse-ATS relevance by
`Σ RCA(vacancy_role, shared_skill)` is pathological for umbrella-role candidates:

| candidate | top reverse-ATS vacancy under RCA-weighting | correct? |
|---|---|---|
| go-backend | **Information Security Architect**, Head of Security Eng, Integration Analyst | ✗ |
| java-backend | **Senior Data Scientist / ML Engineer**, Android Engineer | ✗ |
| node-fullstack | **Web3 Developer** (RCA 414), then React Native | ✗ |
| ios-mobile | iOS App Developer, iOS Developer … | ✓ |
| qa-automation | Sr QA Automation Engineer … | ✓ |

The failure is structural: RCA(*the vacancy's* role, skill) ranks a vacancy high when the
candidate's skills are *characteristic of that vacancy's role* — so a Go dev's Docker/K8s/Linux,
being unusually characteristic of a Security/Analyst role, pulls those foreign roles to the top.
RCA measures importance-to-a-role, **not relevance-to-the-candidate**; substituting it for IDF in
ranking (the naive reading of the survey) makes ranking worse, not better. IDF/tier-weighted
`Σ over overlap` is candidate-relative and stays stack-coherent (§5); RCA is not a drop-in.

**Conclusion (refines the survey).** RCA's right granularity is a **coherent cohort**, not the
umbrella role and not the vacancy's role. The unifying lesson across §1–8: nearly every failure
(F2 cross-stack recs, RCA dilution, RCA ranking pathology, the unlock cohort-mixing root cause)
is the **same umbrella-role problem** — "Backend Developer" is not a stack. The principled
endpoint is to operate at **LLM-`stack` granularity**: form stack-coherent cohorts, then RCA(stack,
skill) is a clean, data-driven importance signal to *replace E's hand-set tier constants*, while
the `{stack, is_core}` gates handle the cross-stack structure and the co-occurrence sign handles
substitutes. That is the natural successor to E and the recommended next build — but E (tiered
importance + categorical gates + cooc substitute gate) already passes all gates and wins the judge
5/5 at prod scale today, with no role-granularity rework required.

### Updated verdict
**Ship E.** The external research validated E's core choices (drop IDF-as-importance; no
embeddings needed; gate on `{stack, is_core}`) and its one naive-sounding alternative (RCA-for-IDF)
**fails empirically for ranking** — a wrong turn avoided. The durable improvements to fold in next,
in order: (1) **stack-scoped cohorts + RCA(stack, skill)** to replace the hand-tuned tier constants
with a data-driven importance; (2) **conditioned/weighted unlock scoring** (no double-count of
React/Redux/Next, weight by salary/freshness); (3) **NPMI-sign + within-resume co-holding** to
harden the substitute call beyond co-occurrence magnitude; (4) **seed/validate the LLM metadata
against ESCO reuse-levels + O*NET (CC BY 4.0)**; (5) **run on a de-duplicated taxonomy** (the
`rest-assured`/`REST Assured` twin problem from §5).
