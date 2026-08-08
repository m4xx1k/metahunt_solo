# 003 — Confounders and the GRILL

**Question.** Is an edge an ecosystem relationship, or is it just role composition? And can any of the headline findings be broken?

**Run.**
```bash
analytics/lab.sh -f analytics/experiments/003-confounders/query.sql
analytics/lab.sh -f analytics/experiments/003-confounders/grill.sql
```
**Raw output.** [`results.txt`](results.txt) · [`grill-results.txt`](grill-results.txt)

---

## The headline result

**Role conditioning destroys most of the apparent strength of the most intuitive edges.** This is the single most important thing learned in this run, and it changes how the graph should be read.

| edge | global lift | dominant role | pairs in role | **lift within role** | share of edge from that role |
|---|---|---|---|---|---|
| DAST / SAST | 315.1 | — | <10 | **untestable** | — |
| TensorFlow / PyTorch | 43.5 | AI Engineer | 37 | **6.62** | 23% |
| I2C / SPI | 43.1 | Embedded Engineer | 187 | **3.14** | 75% |
| CAN / UART | 38.1 | Embedded Engineer | 110 | **2.96** | 74% |
| Prometheus / Grafana | 24.4 | DevOps Engineer | 209 | **2.94** | 74% |
| .NET / C# | 13.2 | Backend Engineer | 256 | **6.86** | 47% |
| TypeScript / React | 4.13 | Full Stack Engineer | 593 | **1.19** | 62% |
| Redis / PostgreSQL | 4.01 | Backend Engineer | 335 | **1.67** | 60% |
| Docker / Kubernetes | 3.63 | DevOps Engineer | 304 | **1.19** | 37% |
| SQL / Python | 1.28 | Data Engineer | 259 | **1.05** | 30% |

Read the last two columns together. **Every edge stays above lift 1 inside its role — none of them is pure artifact — but the global number overstates the ecosystem effect by 3× to 13×.** "Docker and Kubernetes go together" turns out to be mostly "DevOps postings ask for both", not a bond between the two tools: within DevOps the lift is 1.19, barely above independence.

The two that survive conditioning best are **TensorFlow/PyTorch (6.62)** and **.NET/C# (6.86)** — and they survive for opposite reasons, which the GRILL below unpacks.

Note the honest gap: **DAST/SAST cannot be role-tested at all.** No role segment carries 10 of its 31 pairs, so the within-role number would be noise. It is reported as untestable rather than given a fake number.

## Role segments used

Roles with ≥300 positions carrying at least one eligible skill (11 of them):

```
Backend Engineer 2233   QA Engineer         760   Data Engineer           455
Full Stack       1327   Embedded Engineer   668   AI Engineer             405
DevOps Engineer   925   Software Engineer   618   Automation QA Engineer  300
                        Frontend Engineer   561   Manual QA Engineer      510
```

Role coverage is 99.75% of positions (001, §6), so conditioning costs essentially no sample.

## The popularity trap

The pairs a naive co-occurrence-count graph would put on top, next to what they are actually worth:

| pair | pair positions | lift | NPMI |
|---|---|---|---|
| TypeScript / React | 964 | 4.13 | 0.557 |
| **SQL / Python** | **850** | **1.28** | **0.091** |
| Docker / PostgreSQL | 824 | 2.31 | 0.309 |
| Docker / Kubernetes | 812 | 3.63 | 0.475 |
| **PostgreSQL / Python** | **662** | **1.14** | **0.046** |

SQL/Python is the second-largest pair count in the corpus and is **very nearly statistically independent**. PostgreSQL/Python is worse: lift 1.14. They co-occur constantly because both are everywhere, not because they relate. This is the concrete justification for never ranking edges by raw count.

## The sparse-tail trap

Highest lift among pairs *below* the support floor:

| pair | pair positions | lift |
|---|---|---|
| Debian / OpenVPN | 7 | 118.0 |
| Alembic / Pydantic | 9 | 116.4 |
| RS-485 / PWM | 7 | 114.7 |
| RF Engineering / VNA | 9 | 112.2 |

Lift above 100 on 7 observations. Every one of these would be a headline finding in a graph without a support floor, and none of them is trustworthy. This is why `min_pair_support = 10`.

---

# GRILL — how these results may be wrong

Ten edges, each chosen to test a distinct failure mode.

### 1. Popularity artifact?

**Caught, and it is the biggest one.** SQL/Python (850 pairs, lift 1.28, NPMI 0.091) and PostgreSQL/Python (662, 1.14, 0.046) are effectively independent. Mitigated by never sorting on raw count and by showing counts next to every normalized metric in the UI.

### 2. Rare-tail artifact?

**Caught and fenced.** Lift >100 routinely appears at 6–9 pair positions. The floor of 10 removes it; the UI exposes the floor as a control so a reader can watch the tail reappear when they lower it. **DAST/SAST (31 pairs, lift 315) sits just above the floor and remains the weakest-evidenced edge in the top ten** — P(SAST|DAST) = 1.000 is a perfect conditional on 31 observations, which is exactly the shape a threshold cannot fully protect against.

### 3. Role confounding?

**Caught, and it is severe.** See the headline table. Global lift overstates by 3–13×. All ten survive above 1.0 within role, so none is pure composition, but any statement made from a global number alone would be wrong about magnitude. **The UI therefore ships role conditioning as a first-class control, not a nice-to-have.**

### 4. Source bias?

**Tested and clean.** Every one of the ten splits close to the corpus ratio, and P(B|A) agrees across boards:

| pair | P(B\|A) djinni | P(B\|A) dou | gap |
|---|---|---|---|
| CAN / UART | 0.93 | 0.87 | 0.06 |
| Prometheus / Grafana | 0.79 | 0.85 | 0.06 |
| SQL / Python | 0.36 | 0.32 | 0.04 |
| .NET / C# | 0.77 | 0.76 | 0.01 |
| TensorFlow / PyTorch | 0.98 | 0.97 | 0.01 |
| DAST / SAST | 1.00 | 1.00 | 0.00 |

Maximum gap 0.06. **No edge in the ten is carried by one board.** Two edges outside the ten do lean: Liquid/Shopify is 72% djinni and LightGBM/XGBoost 69% djinni (vs a 57% baseline) — worth remembering if either is ever quoted.

### 5. Representative-selection artifact?

**Tested and clean.** Union changes the ten by at most 0.009 NPMI; full result in [002](../002-position-skill-pairs/README.md). ρ = 0.9984 across all 4,140 edges.

### 6. Taxonomy artifact?

**Partially mitigated, not eliminated.** Restricting to VERIFIED skills removes 4,510 NEW tail nodes that would generate sparse-tail edges. What it does **not** remove: parent/child and alias-overlap effects inside the VERIFIED set. `.NET / C#` is the clearest suspect — a platform and its primary language are not really two independent observations, and lift 13.2 partly measures a taxonomy modelling choice rather than a market fact. Same question applies to HTML/CSS as a single node.

### 7. Extraction artifact?

**Unresolved, and it is the deepest limitation.** `is_required` is an LLM output with no golden set behind it (MET-24 / MET-76 / MET-77). Every REQUIRED↔REQUIRED number inherits that. If the extractor systematically marks "nice to have" items as required for certain phrasings, entire edges could be measurement. Nothing in this run can rule it out; the v0 UI states it.

### 8. Version artifact?

**Cannot be tested.** The corpus mixes whatever prompt/taxonomy versions were live over 14 weeks, and the data model does not version them per row. The artifact records the snapshot date as the best available provenance. This is a real gap, not a solved one.

### 9. Semantic nonsense?

**Caught — and it is the most instructive edge in the set.** **TensorFlow / PyTorch: P(PyTorch | TensorFlow) = 0.970, lift 43.5, and it survives role conditioning better than almost anything (6.62).** By every metric this is one of the strongest relationships in the corpus. It is also **two competing frameworks that are substitutes, not a stack.** Postings write "TensorFlow or PyTorch"; the extractor records both as required. The mathematics is correct and the naive reading ("learn both, they go together") is wrong.

This is why the graph must never be turned into "skills to learn together" without a substitute gate. The existing `node_skill_cooc` view was built for exactly that gate — and this shows the gate cannot be NPMI, because NPMI *rewards* substitutes listed in the same breath.

### 10. Claim honesty

**Supported:**

> Among canonical positions in MetaHunt's corpus (12,288 with ≥1 verified required skill, djinni + dou, 2026-05-08 → 2026-08-07), postings that require I2C also require SPI in 93.6% of cases, versus 2.2% baseline prevalence — a lift of 43. Conditioned on Embedded Engineer, the lift falls to 3.1, so most of the global figure reflects both skills belonging to the same role market rather than a bond between the two buses.

**Not supported:**

> I2C and SPI are strongly linked technologies in the labour market, so learning one makes the other valuable.

The second sentence adds a population ("the labour market"), a mechanism ("linked technologies") and a prescription ("makes valuable") that the data supplies none of.
