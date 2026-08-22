# Role + seniority contract — open decision

**Status:** analysis, not an approved contract. Re-baselined 2026-08-22 after
rejecting both extremes: Architect-as-role everywhere and collapsing every
upper-senior title into Senior. The current recommendation below is informed by
a read-only review of 22 live production postings (11 cross-source pairs), not
only by title-framework theory.

**Implementation:** the executable, data-backed plan is
[p1-role-seniority-implementation-plan.md](./p1-role-seniority-implementation-plan.md).
Where this open research document differs from that plan, the implementation
plan is the operational source of truth.

## Problem to solve

MetaHunt needs a small, internationally useful classification for browse,
matching, dedup, CV recommendations, and analytics. The current model mixes:

- a job family (`Backend Engineer`, `Data Engineer`);
- an advertised career level (`Senior`, `Staff`, `Principal`);
- a leadership assignment (`Tech Lead`, `Team Lead`);
- an architecture occupation or responsibility (`Solutions Architect`,
  `Backend Architect`);
- organizational authority (`Head`, `VP`, `CTO`).

The upper-senior tail is relatively small but creates most mapping ambiguity.
The goal is not to reproduce every employer's job architecture. It is to retain
useful distinction above Senior without making extraction and downstream logic
fragile.

No option below is approved yet.

## How it works today

There are not five persisted axes today. A vacancy effectively has:

- raw source `title`;
- one `role_node_id` pointing at the flat role taxonomy;
- one nullable enum `seniority`:
  `INTERN | JUNIOR | MIDDLE | SENIOR | LEAD | PRINCIPAL | C_LEVEL`.

The apparent extra concepts are currently compressed into those two normalized
fields, and different parts of the code compress them differently:

- production vacancy extraction asks the LLM to choose exactly one VERIFIED
  role from the runtime taxonomy. Its prose says Lead and Architect should keep
  an underlying discipline, but the same allowed taxonomy includes VERIFIED
  `Team Lead`, `Tech Lead`, `QA Team Lead`, `Software Architect`, and `Solutions
Architect`, so several outputs are simultaneously plausible;
- production vacancy seniority is also emitted by the LLM. The current prompt
  says to use only explicit title tokens: Lead -> `LEAD`, Principal ->
  `PRINCIPAL`, technical C-suite -> `C_LEVEL`, and Architect by itself -> null;
- candidate/CV extraction uses the same enum with incompatible semantics:
  Architect -> `PRINCIPAL`, Head/VP/CTO -> `C_LEVEL`, and 7+ total years ->
  `LEAD`;
- the Requirements v2 eval has a different closed role vocabulary with no
  architecture occupations. It maps AI/Cloud/Hardware Architect into an
  underlying engineering discipline and then overrides model seniority with a
  deterministic title parser. That parser returns null when a title contains
  more than one level, so `Senior / Principal` is not resolved;
- recommendation code orders all seven enum values as one ladder and selects
  the candidate's `level +/- 1`; that makes `LEAD -> PRINCIPAL -> C_LEVEL` look
  like universal adjacent promotions;
- dedup first tries an exact `Title + Description` fingerprint, then ANN with
  exact role and seniority gates when both sides are non-null.

The holes are therefore contractual, not merely prompt wording:

1. the role vocabulary says Lead/Architect are both modifiers and selectable
   roles;
2. vacancy, CV, and Requirements v2 assign different meanings to the same enum;
3. a flat role id cannot express compatible broad/specialist pairs;
4. a multi-level title has no deterministic single-value policy;
5. dedup treats fallible classifier output as an identity prerequisite;
6. recommendation treats categorical upper-tail labels as a linear ladder.

## External evidence

International frameworks do not expose one universal title ladder:

- [SFIA 9](https://sfia-online.org/en/sfia-9/responsibilities) uses seven levels
  of responsibility based on autonomy, influence, complexity, knowledge, and
  accountability rather than Staff/Lead/Principal title words.
- [GitLab](https://handbook.gitlab.com/handbook/company/structure/) explicitly
  separates IC and people-manager tracks; Staff aligns with Manager, Principal
  with Senior Manager, and Distinguished with Director by scope.
- [Dropbox](https://dropbox.github.io/dbx-career-framework/promotion_guidelines.html)
  uses IC5 Staff, IC6 Principal, and a separate M3–M7 management ladder.
- The [UK Government Digital and Data framework](https://ddat-capability-framework.service.gov.uk/)
  treats Data, Enterprise, Network, Security, Solution, and Technical Architect
  as real architecture job families, not merely seniority words.

The evidence supports two conclusions: upper levels are primarily scope/impact,
and `Architect` can be either a real job family or a discipline-specific title.
Neither title alone nor years alone gives a universal exact level.

## Production evidence: 22 postings / 11 cross-source pairs

This is a deliberately selected boundary-case review, not a statistically
representative quality score. Each row below is one DOU + Djinni pair whose
descriptions are identical or near-identical after removing source markup. The
descriptions and responsibilities were reviewed, not just the titles.

Production currently contains 16,604 vacancies. Titles containing an upper-tail
token (`lead`, `architect`, `principal`, `staff`, `head`, `chief`, or technical
C-suite variants) account for 1,859 rows, or 11.2%. Current stored seniority is
7.4% `LEAD`, 1.8% `PRINCIPAL`, and 0.6% `C_LEVEL`.

| Pair                                     | What the body actually describes                                                                | Current DOU / Djinni output                                        | Reviewed mapping under the provisional contract                    |
| ---------------------------------------- | ----------------------------------------------------------------------------------------------- | ------------------------------------------------------------------ | ------------------------------------------------------------------ |
| AI Solutions Architect                   | Enterprise AI solution and platform architecture across teams                                   | `Solutions Architect / LEAD` vs `Software Architect / PRINCIPAL`   | `Solutions Architect / null`                                       |
| Senior / Principal ML Engineer           | Hands-on ML and Big Data engineering; 6+ years                                                  | same role; `SENIOR` vs `PRINCIPAL`                                 | `Machine Learning Engineer / SENIOR` as the lower advertised bound |
| Backend Tech Lead                        | Backend/platform strategy plus explicit management of leads and engineers                       | `Backend Engineer / LEAD` vs `Team Lead / LEAD`                    | `Backend Engineer / LEAD`                                          |
| Solution Architect (.NET, Node.js)       | Domain architecture, roadmaps, HLA, transition plans, coordination of architects                | `Software Architect / PRINCIPAL` vs `Solutions Architect / LEAD`   | `Solutions Architect / null`                                       |
| Tech Lead / Solution Architect           | Cross-team system, integration, security, and solution architecture with hands-on critical work | `Solutions Architect / LEAD` vs `Software Architect / LEAD`        | `Solutions Architect / LEAD`                                       |
| Senior BPM Developer / Camunda Architect | Architecture plus hands-on Java/Camunda development and mentoring                               | same role; `SENIOR` vs `PRINCIPAL`                                 | `Software Architect / SENIOR`                                      |
| Principal RF / Microwave Engineer        | Hands-on RF ownership, architecture, bring-up, validation, and mentoring                        | `RF / Microwave Engineer` vs `Hardware Engineer`; both `PRINCIPAL` | `RF / Microwave Engineer / PRINCIPAL`                              |
| QA Manual Team Lead                      | QA-function ownership plus explicit 1:1, performance, and team development                      | `QA Engineer / LEAD` vs `Manual QA Engineer / LEAD`                | `Manual QA Engineer / LEAD`                                        |
| Solution Architect — BPM / Camunda       | Solution and integration architecture; 3–5 years in architect or lead-developer work            | same role; `PRINCIPAL` vs `SENIOR`                                 | `Solutions Architect / null`                                       |
| Senior / Principal Android Engineer      | Hands-on Android/AAOS implementation, refactoring, reviews, and occasional mentoring            | same role; `PRINCIPAL` vs `SENIOR`                                 | `Android Engineer / SENIOR` as the lower advertised bound          |
| Data Architect — DWH / dashboards        | Data architecture, DWH modelling, governance, and platform standards                            | same underlying data role; `PRINCIPAL` vs `LEAD`                   | proposed `Data Architect / null`                                   |

The reviewed values are contract proposals, not a request to edit these rows in
production now.

### What this sample proves

1. The original failure mode is real and repeatable. Near-identical source
   observations can receive different roles, different seniorities, and
   different dedup groups.
2. `Tech Lead` is not reliably people management. One reviewed Backend Tech
   Lead explicitly manages leads and engineers; another reviewed hands-on Tech
   Lead owns architecture and critical code without people-management duties.
   `Team Lead` is a stronger management signal, but the job still has a useful
   underlying discipline such as Manual QA or Backend.
3. `Architect` is neither a level nor one universal role. The sample contains
   genuine Solution, Software/BPM, Data, AI-solution, and RF architecture work.
4. Role granularity is itself unstable. `RF / Microwave Engineer` versus its
   broader parent `Hardware Engineer`, and `Manual QA Engineer` versus `QA
Engineer`, are semantically compatible but fail the current exact role gate.
5. Slash titles expose a missing deterministic rule. The same `Senior /
Principal` title was independently mapped both ways. A single-value field
   must choose one documented bound rather than ask the model to improvise.

There is also clear historical contract debt beyond these pairs:

- 168 current Architect-title rows are stored as `PRINCIPAL` despite having no
  Senior, Lead, Principal, Staff, Head, Chief, Director, VP, or C-suite token in
  the title;
- Head/Director is inconsistent: in a small explicit engineering/QA/data-head
  slice, 28 rows are `C_LEVEL` and 10 are `LEAD` even though Head is not C-suite;
- the verified generic role nodes currently hold 163 `Team Lead`, 117 `Tech
Lead`, and 62 `QA Team Lead` rows, many of whose titles state a more useful
  Backend, Java, Embedded, ML, or QA discipline.

### The remembered Lead Data Engineer / Architect case

The exact historical extraction result is not recoverable from the current
vacancy row: production stores the latest extraction, and durable extraction
artifacts only cover recent runs. The closest current records are now
consistently `Data Engineer / LEAD`:

- `Lead Data Engineer / Data Architect` explicitly says “We are looking for
  Data Engineer”, requires hands-on Azure data-platform work, and asks for at
  least one year in a Lead/Architect position;
- `Lead Data Engineer / Solution Architect` explicitly calls the position a
  hands-on architect who designs and personally builds the data platform.

Their current descriptions are materially different, so they should not be
force-merged merely because their titles resemble each other. This does not
invalidate the remembered bug: the 11 reviewed pairs provide current examples
of the same classifier-instability mechanism.

## Rules that should hold under every option

### Role and seniority remain independent

Role answers **what job family is this?** Seniority answers **what broad level is
the advertised position?** Neither field should repeat the full title.

Examples:

| Advertised title        | Role                                               | Seniority signal          |
| ----------------------- | -------------------------------------------------- | ------------------------- |
| Senior Backend Engineer | `Backend Engineer`                                 | explicit Senior           |
| Staff Data Engineer     | `Data Engineer`                                    | explicit Staff            |
| Backend Tech Lead       | `Backend Engineer`                                 | explicit Lead             |
| Head of Engineering     | `Engineering Manager`                              | explicit upper leadership |
| CTO                     | `Engineering Manager` or approved executive family | explicit executive        |

### Evidence precedence

Use the following order:

1. explicit level in the advertised title;
2. explicit statement that the position is junior/mid/senior/lead-level;
3. numeric minimum experience as a conservative fallback;
4. otherwise `null`.

Responsibilities such as mentoring, ownership, architecture, strategy, or
leading a project may confirm an explicit level but must not independently
manufacture Staff, Principal, Lead, or executive seniority.

### Years may infer only Junior, Middle, or Senior

Years are correlated with experience, not organizational scope. They may fill a
missing lower-level label, but must never produce `LEAD`, `STAFF`, `PRINCIPAL`,
or `C_LEVEL`.

A candidate policy for vacancy minimum requirements is:

```text
0–1 years minimum -> JUNIOR
2–4 years minimum -> MIDDLE
5+ years minimum  -> SENIOR
```

This is a hypothesis to validate against current vacancies before approval. The
title always wins, so `Junior ... 3+ years` stays Junior and `Senior ... 3+
years` stays Senior. Qualitative phrases such as “extensive experience” do not
count as numeric evidence.

Do not apply the years fallback when the title itself is an upper-tail or
non-linear boundary case: Architect, Lead, Staff, Principal, Head, Director,
VP, or C-suite. For example, an unlevelled `Solution Architect` asking for 3+
years stays `null`, not `MIDDLE`; a `Data Architect` asking for 5+ years stays
`null`, not automatically `SENIOR`. Years may describe time in a specialist
occupation without defining the employer's grade.

When a title explicitly advertises a level range or alternatives, store the
lower accepted bound: `Senior / Principal Engineer` becomes `SENIOR` regardless
of source formatting. The raw title preserves the full offer. This mirrors the
existing lower-bound rule for experience ranges and avoids source-dependent
model choices.

CV total experience is a different measure from a vacancy's minimum. It may use
separately calibrated Junior/Middle/Senior thresholds, but it must share the
same prohibition against inferring upper-senior levels from years.

### Architect is context-dependent

Do not use either blanket rule “Architect is always a role” or “Architect is
never a role”:

- an explicit Architect title is presumptively an architecture job when solution
  design, governance, standards, advisory work, and cross-system decisions are
  the primary duties;
- `Backend Architect` may therefore be `Software Architect` when architecture is
  the job, but `Backend Engineer` when the posting is primarily hands-on delivery
  and architecture is only one responsibility;
- `Solutions Architect`, `Enterprise Architect`, and `Technical Architect` are
  established architecture occupations, not aliases for Engineering Manager;
- Architect never automatically means Principal;
- an Architect title may support an upper-senior bucket, depending on the chosen
  option, but it does not choose the role by itself.

The approved ROLE vocabulary should include only architecture families with
enough supply and a real browse/matching consumer. Avoid a bare generic
`Architect` node that mixes unrelated disciplines. Production currently has 128
Solution Architect, 35 Data Architect, 33 Software Architect, and 12 Cloud
Architect title rows. That supports keeping `Solutions Architect` and `Software
Architect` and evaluating one bounded addition, `Data Architect`; it does not
support generating a new role for every `<technology> Architect` phrase.

Because the taxonomy is flat, a small code-owned compatibility map must keep
specialists inside useful browse families without adding another stored axis:
`Data Architect <-> Data Engineer`, `Manual QA Engineer <-> QA Engineer`, and
`RF / Microwave Engineer <-> Hardware Engineer`. This map can be shared by
dedup and filters; it is not a new extracted field.

Architecture role and seniority stay independent. The UK framework itself has
Associate, regular, Senior, Lead, and Principal Solution Architect levels. That
is direct evidence that `Solution Architect` can be the role while Senior/Lead/
Principal is a separate level.

### Downstream code must not assume a false ladder

The current `seniority ±1` recommendation band treats enum order as a universal
career path. That must change under every option. Dedup and recommendations
should use an explicit compatibility map rather than array adjacency.

### Lead must not decide the role

For the KISS model, Lead is an advertised level/category and the role remains
the most useful discipline:

- `Backend Tech Lead` -> `Backend Engineer / LEAD`, even when the body includes
  people management;
- `QA Manual Team Lead` -> `Manual QA Engineer / LEAD`;
- `ML Technical Lead` -> `Machine Learning Engineer / LEAD`;
- `Head/Director of Engineering` -> `Engineering Manager / LEAD` because the
  management function is explicit in the title;
- bare `Tech Lead` or `Team Lead` uses the body to recover a discipline, then a
  generic `Software Engineer / LEAD` fallback if none is recoverable.

Do not infer `Engineering Manager` merely from 1:1s, mentoring, hiring, or
delivery ownership in a Lead posting. Mixed player-coach positions are common,
and that inference is exactly where two model calls can choose different valid
interpretations. If MetaHunt later needs a normalized “people management”
filter, it should be introduced as one deliberate product field with evidence,
not smuggled into `role`.

## Option A — categorical upper levels + Architect roles

Stored values:

```text
INTERN | JUNIOR | MIDDLE | SENIOR | LEAD | PRINCIPAL | C_LEVEL | null
```

The three values above Senior are parallel categories, not adjacent steps on one
promotion ladder:

- `LEAD` means an explicitly advertised lead assignment/position;
- `PRINCIPAL` is the compact Staff+ IC bucket;
- `C_LEVEL` is an explicitly advertised technical C-suite position.

`PRINCIPAL` may be labelled `Staff / Principal` in the UI while retaining the
existing internal enum. The exact Staff, Principal, Distinguished, or Fellow
word remains in the source title.

Suggested mapping:

| Advertised title                                   | Role                          | Seniority   |
| -------------------------------------------------- | ----------------------------- | ----------- |
| Senior Backend Engineer                            | `Backend Engineer`            | `SENIOR`    |
| Backend Tech Lead / Lead Engineer                  | `Backend Engineer`            | `LEAD`      |
| Backend / QA / Data Team Lead                      | underlying discipline         | `LEAD`      |
| Staff / Principal / Distinguished Backend Engineer | `Backend Engineer`            | `PRINCIPAL` |
| Software Architect                                 | `Software Architect`          | `null`      |
| Senior Software Architect                          | `Software Architect`          | `SENIOR`    |
| Lead Software Architect                            | `Software Architect`          | `LEAD`      |
| Principal Solutions Architect                      | `Solutions Architect`         | `PRINCIPAL` |
| Head / Director of Engineering                     | `Engineering Manager`         | `LEAD`      |
| CTO / CIO / CISO                                   | appropriate management family | `C_LEVEL`   |

This resolves the apparent Lead contradiction. `Lead` is not a job family:

- for Team Lead, Tech Lead, and Lead Engineer, role stays Backend/QA/DevOps/etc.;
- an explicit Manager, Head, or Director title maps to the management family;
- `LEAD` preserves the advertised lead/organizational-leadership category, but
  does not claim that every such vacancy manages people.

It does not claim that both positions perform the same work. Role provides that
difference.

Architect is independent from this upper-level classification. Keep:

- `Software Architect` for internal product/system/software architecture;
- `Solutions Architect` for customer/problem/integration-oriented solution
  design;
- provisionally `Data Architect` for DWH/data modelling/governance architecture,
  subject to reviewing the 35 current title rows.

More specific architecture families should be added only when supply and a
consumer justify them. The architecture role does not imply Senior, Lead, or
Principal; only an independently explicit level does.

Advantages:

- keeps Lead meaningful instead of turning it into an upper-tail dumpster;
- keeps Architect discoverable as a job family;
- reuses the existing enum and current VERIFIED Software/Solutions Architect
  supply;
- preserves a useful Staff+/Principal and C-suite distinction without new
  persisted axes;
- most mappings are deterministic from title tokens.

Costs:

- the field becomes categorical rather than linearly ordered above Senior;
- `PRINCIPAL` intentionally groups several Staff+ IC titles;
- bare Lead titles still require discipline recovery from the body;
- recommendations and dedup need an explicit compatibility map.

This is the current provisional favorite, not an approved decision.

## Option B — pure IC ladder; Lead is projected into role/title

Stored IC values:

```text
INTERN | JUNIOR | MIDDLE | SENIOR | STAFF | PRINCIPAL | null
```

Rules:

- Staff and Principal are emitted only from explicit titles;
- Tech Lead is the underlying engineering role; `Lead` remains only in the raw
  title and does not create a seniority value;
- Team Lead keeps its underlying engineering discipline; only an explicit
  Manager, Head, Director, or VP title selects a management role;
- Engineering Manager, Head, VP, and CTO use management roles and do not receive
  a fabricated IC level;
- Software/Solutions Architect remain roles and receive only an independently
  supported IC level.

So under this option Lead is neither a universal seniority nor a separate
`Team Lead`/`Tech Lead` role. It is an advertised assignment that is projected
onto the actual job family and preserved verbatim in `title`.

Advantages:

- semantically clean for IC careers;
- preserves Staff and Principal demand;
- does not force management authority into an IC ladder.

Costs:

- management vacancies have `seniority=null` unless a second management ladder
  is later introduced;
- Lead titles lose a normalized Lead filter entirely;
- requires adding Staff and changing substantially more contracts and data;
- Staff-versus-Principal conventions still differ among employers.

## Option C — one broad `LEAD+` top bucket

Stored values:

```text
INTERN | JUNIOR | MIDDLE | SENIOR | LEAD | null
```

`LEAD` means a broad Lead+ band and absorbs explicit Lead, Staff, Principal,
management, and executive titles. Architect remains an independent role and
does not enter this bucket unless the title also explicitly contains one of
those upper-level signals.

Advantages:

- smallest public filter and matching model;
- trivial deterministic upper-tail backfill.

Costs:

- makes Lead mean too many unrelated things;
- incorrectly hides the difference between IC Staff+, people leadership,
  architecture occupations, and executives;
- makes Architect less discoverable unless it is independently retained as a
  role.

This remains the simplest implementation but is no longer the preferred
direction.

## Comparison

| Criterion                  | A. Categorical upper  | B. Pure IC ladder | C. Lead+ bucket  |
| -------------------------- | --------------------- | ----------------- | ---------------- |
| Product simplicity         | good                  | medium            | best             |
| International portability  | good                  | good for IC only  | coarse           |
| Upper-level fidelity       | balanced              | strongest for IC  | weakest          |
| Management handling        | explicit Lead/C-level | incomplete        | collapsed        |
| Architect handling         | independent roles     | independent roles | easily conflated |
| Schema/contract change     | low                   | high              | low              |
| Extraction ambiguity       | medium                | medium            | low              |
| Targeted backfill possible | yes                   | yes               | yes              |

## Best decisions regardless of option

1. Keep Senior distinct; do not collapse the entire upper tail into it.
2. Keep Lead as an explicit signal, not a dumpster for every upper-level title.
3. Never infer an upper-senior level from years alone.
4. Use explicit title tokens deterministically before asking an LLM.
5. Never map Architect to Principal by default.
6. Do not make Head of Engineering C-level; reserve C-level for actual C-suite
   titles if that category survives.
7. Replace enum-adjacency matching with an explicit compatibility table.
8. Align vacancy, candidate, and Requirements v2 extraction in one change; they
   currently contradict each other.
9. Preserve the source title exactly and let it carry distinctions the normalized
   filter intentionally does not model.
10. Avoid full-corpus LLM re-extraction: deterministically migrate explicit
    seniority tokens, then run role-only classification for disputed role nodes
    and genuinely ambiguous titles.
11. Keep Software Architect and Solutions Architect as roles while production
    evidence supports them; do not let the role itself manufacture seniority.
12. Stop exposing generic `Team Lead`, `Tech Lead`, and `QA Team Lead` as normal
    role outputs when an underlying discipline is available.
13. Treat an explicit Senior/Principal range deterministically as `SENIOR`, not
    as a model judgment.
14. Make dedup robust to classification disagreement; role and seniority may be
    corroborating signals, but must not veto an otherwise gold cross-source
    match.
15. Prefer one small reviewed role-compatibility map over `responsibility_flags`
    or `organizational_scope` columns that most postings cannot support.

## Dedup contract: classification cannot be an identity key

The current pipeline violates this rule in three places:

1. the exact content fingerprint hashes `Title + Description`, so identical
   bodies with DOU/Djinni title wrappers do not take the exact-content path;
2. the ANN embedding itself includes extracted Role and Seniority, so extraction
   jitter changes the identity vector;
3. ANN candidate retrieval hard-requires exact role and seniority whenever both
   are present, before semantic similarity is allowed to decide.

That means one classifier disagreement both moves the vectors apart and removes
the candidate from consideration. The user-visible role model should not have
that much authority over posting identity.

Required invariants:

- exact same normalized source observation must reuse one extraction artifact;
- exact same cleaned body plus compatible normalized core title, company, and
  date must bypass role/seniority disagreement;
- a calibrated gold near-duplicate path may bypass role/seniority disagreement
  only with strong independent evidence such as same company plus strong raw
  title/body similarity;
- parent/specialist role pairs such as QA/Manual QA and Hardware/RF must be
  compatible evidence, not automatic conflicts;
- conflicting role/seniority remains visible in the dedup reason for audit and
  can trigger a later canonical-field repair.

This is not “make dedup ignore role”. The ordinary ANN path keeps structural
precision gates. It adds a stricter override for evidence stronger than the
fallible classifier.

## Validation needed before choosing

Run a read-only distribution over current production:

- counts by current seniority and advertised upper-title token;
- cross-tab of Staff/Principal/Lead/Architect/Manager/Head/VP/CTO against role;
- how often title and numeric experience disagree;
- how many Architect vacancies are implementation-specialized versus genuine
  architecture occupations;
- how many recommendation cohorts or dedup pairs change under each option;
- whether users have enough supply for separate Principal/C-level filters.

Create 25–40 reviewed boundary cases across Ukrainian, English, European, and US
title conventions. Score all three policies deterministically first; use live
model evaluation only for role ambiguity, not for title tokens that code can
parse.

## Bounded migration shape

Whichever option wins:

1. turn the 11 reviewed source pairs into regression fixtures with one expected
   role/seniority result per pair;
2. add source-aware core-title normalization while preserving the raw title;
3. move explicit seniority and level-range parsing into deterministic code, with
   the LLM unable to override it;
4. add the strict dedup override above and prove it against both true-duplicate
   and same-company boilerplate counterexamples;
5. deploy compatible readers and the new writer/prompt rules;
6. dry-run a targeted migration: the 168 unsupported Architect->Principal rows,
   explicit Head/Director misclassified as C-level, and generic Lead role nodes;
7. reclassify only unresolved Lead/Architect rows with a closed-vocabulary
   role-only call; do not re-extract unrelated fields;
8. repoint role nodes before hiding obsolete generic Lead nodes;
9. recompute embeddings and dedup state only for affected rows/groups;
10. verify public eligibility, tracks, subscriptions, filters,
    recommendations, and zero new legacy writes.

Full-corpus extraction of requirements, salary, company, skills, or other fields
is not part of this role/seniority migration.
