# Phase 3 — views

Three files: `src/views/SkillDossier.tsx`, `src/views/Map.tsx`, `src/views/Relations.tsx`.
Every "replace" quotes text that exists verbatim today; if it does not, stop (rule 8).
Keep existing class names and components; do not restyle anything.

The one idea behind all three: **"asked together" means "and" only.** A pair the data
calls `SUBSTITUTE` is shown as an alternative, never as a companion.

---

## 3.1 `SkillDossier.tsx`

**(a) Companion cards exclude alternatives.** Replace

```ts
  const core = neighbours.filter((n) => n.p >= 0.6).slice(0, companionLimit);
  const periphery = neighbours.filter((n) => n.p >= 0.2 && n.p < 0.6).slice(0, companionLimit);
```

with

```ts
  const companions = neighbours.filter((n) => n.observed !== "SUBSTITUTE");
  const core = companions.filter((n) => n.p >= 0.6).slice(0, companionLimit);
  const periphery = companions.filter((n) => n.p >= 0.2 && n.p < 0.6).slice(0, companionLimit);
```

**(b) Forks come from data first, hand labels second.** Replace

```ts
  const forks = relations.filter((r) => r.relation === "SUBSTITUTE");
```

with

```ts
  const observedForks = neighbours
    .filter((n) => n.observed === "SUBSTITUTE")
    .sort((a, b) => b.substitutePairs - a.substitutePairs)
    .map((n): DossierRelation => ({
      name: n.node.name,
      relation: "SUBSTITUTE",
      note: `“or” in ${pct(n.substituteRate)} · ${fmt(n.substitutePairs)} positions`,
    }));
  const forks = [
    ...observedForks,
    ...relations
      .filter((r) => r.relation === "SUBSTITUTE" && !observedForks.some((f) => f.name === r.name))
      .map((r) => ({ ...r, note: r.note ? `reviewed · ${r.note}` : "reviewed" })),
  ];
```

**(c) Card copy.** In the two `CompanionCard` usages replace the `note` props:

- `note="in at least 60% of positions that ask for this skill"` →
  `note="required alongside it in at least 60% of its positions"`
- `note="in 20–59% of positions that ask for this skill"` →
  `note="required alongside it in 20–59% of its positions"`

In the first `RelationCard` (title `Where the market asks you to choose`) replace:

- `note="hand-reviewed SUBSTITUTE labels; one is enough"` →
  `note="offered as alternatives in the same vacancy; one is enough"`
- `empty="No reviewed substitute pair for this skill yet."` →
  `empty="No alternative observed for this skill."`

Do not touch the `Implied foundations` card.

**(d) Companion rows count "and" positions.** In `CompanionCard`, replace

```tsx
              {pct(row.p)} · {fmt(row.pairs)} positions
```

with

```tsx
              {pct(row.p)} · {fmt(row.together)} positions
```

**(e) Table gets an "or" column.** In the `All observed companions` table:

- after `<th className={th}>Asked alongside</th>` add `<th className={th}>Offered as “or”</th>`;
- after `<td className={td}>{pct(neighbour.p)}</td>` add
  `<td className={td}>{pct(neighbour.substituteRate)}</td>`.

**(f) HowItWorks text.** Replace the whole text inside `<HowItWorks onOpenFaq={onOpenFaq}>`
… `</HowItWorks>` with:

```
        The first two cards count only positions that require both skills; a pair the vacancy
        offered as “A or B” is listed under “choose” instead. The cutoffs are display labels,
        not a claim of causation. “Implied foundations” appear only when a pair has been
        reviewed by hand.
```

---

## 3.2 `Map.tsx`

**(a) Imports.** Change

```ts
import type { Graph } from "../types";
import { fmt } from "../lib/graph";
import { input, label, panel, panelHead, panelNote, panelTitle } from "../ui";
```

to

```ts
import type { Edge, Graph } from "../types";
import { fmt, togetherShare } from "../lib/graph";
import { input, label, panel, panelHead, panelNote, panelTitle, tab } from "../ui";
```

**(b) State.** After `const [minNpmi, setMinNpmi] = useState(0.3);` add:

```ts
  const [mode, setMode] = useState<"together" | "alternatives">("together");
  const [hideGeneric, setHideGeneric] = useState(true);
```

**(c) Edge weight.** Inside the `model` `useMemo`, replace

```ts
        g.addEdge(String(e.a), String(e.b), { weight: e.npmi });
```

with

```ts
        g.addEdge(String(e.a), String(e.b), { weight: weightOf(e) });
```

and directly above `const build = (edges: typeof graph.edges) => {` add:

```ts
    const weightOf = (e: Edge) => (mode === "together" ? (e.complementNpmi ?? 0) : e.substituteRate);
```

**(d) Which edges are drawn.** Replace

```ts
    const kept = graph.edges.filter((e) => e.npmi >= minNpmi);
```

with

```ts
    const hidden = (i: number) => hideGeneric && graph.nodes[i].generic === true;
    const kept = graph.edges.filter((e) => {
      if (hidden(e.a) || hidden(e.b)) return false;
      if (mode === "alternatives") return e.observed === "SUBSTITUTE";
      return e.observed !== "SUBSTITUTE" && e.complementNpmi !== null && e.complementNpmi >= minNpmi;
    });
```

Replace the memo's dependency list `}, [graph, minNpmi, focus]);` with
`}, [graph, minNpmi, focus, mode, hideGeneric]);`

**(e) Highlighting the selected skill's neighbours.** In the rendering `useEffect`, replace

```ts
      const other = edge.a === selected ? edge.b : edge.a;
      const p = edge.a === selected ? edge.pBgivenA : edge.pAgivenB;
```

with

```ts
      const other = edge.a === selected ? edge.b : edge.a;
      if (mode === "alternatives") {
        if (edge.observed === "SUBSTITUTE") relation.set(String(other), "core");
        continue;
      }
      if (edge.observed === "SUBSTITUTE") continue;
      const p = togetherShare(graph, edge, selected);
```

Replace that effect's dependency list
`}, [graph.edges, model, focus, onSelectSkill, selected, showLabels]);` with
`}, [graph, mode, model, focus, onSelectSkill, selected, showLabels]);`

**(f) Controls.** In the controls row (`<div className="flex flex-wrap gap-x-5 gap-y-3 items-end pb-5">`):

1. As the **first** child, add the mode switch:

   ```tsx
        <div className="flex flex-col gap-1">
          <span className={label}>Links</span>
          <div className="flex gap-1.5">
            {(["together", "alternatives"] as const).map((m) => (
              <button
                key={m}
                type="button"
                className={tab(mode === m)}
                aria-pressed={mode === m}
                onClick={() => {
                  setMode(m);
                  setFocus(null);
                }}
              >
                {m === "together" ? "Asked together" : "Alternatives"}
              </button>
            ))}
          </div>
        </div>
   ```

2. Wrap the existing `Minimum NPMI` block (the `<div className="flex flex-col gap-1">` that
   contains `htmlFor="npmi"`) in `{mode === "together" ? ( … ) : null}`. Do not change
   anything inside it.

3. Directly after the existing `Show skill labels` `<label>…</label>`, add:

   ```tsx
        <label className="flex cursor-pointer items-center gap-2 text-sm text-ink-2">
          <input
            type="checkbox"
            className="accent-signal"
            checked={hideGeneric}
            onChange={(event) => {
              setHideGeneric(event.target.checked);
              setFocus(null);
            }}
          />
          Hide generic practices
        </label>
   ```

4. Replace the legend paragraph content

   ```tsx
          <span className="text-trap">Selected</span> · thick teal = often requested together · thin teal = sometimes requested together
   ```

   with

   ```tsx
          <span className="text-trap">Selected</span> ·{" "}
          {mode === "together"
            ? "thick teal = often required together · thin teal = sometimes required together"
            : "teal = offered as an alternative to it"}
   ```

**(g) Empty state.** Replace

```tsx
              No edge clears NPMI {minNpmi.toFixed(2)}.
```

with

```tsx
              {mode === "together" ? `No edge clears NPMI ${minNpmi.toFixed(2)}.` : "No alternatives in this snapshot."}
```

**(h) HowItWorks text.** Replace the whole text inside `<HowItWorks onOpenFaq={onOpenFaq}>`
… `</HowItWorks>` with:

```
        “Asked together” draws pairs that vacancies require at the same time, ranked by NPMI
        over those positions only; “Alternatives” draws pairs that vacancies offer as “A or B”.
        Generic practices such as CI/CD connect every stack, so they are hidden by default.
        Canvas position means only “connected things sit together”.
```

---

## 3.3 `Relations.tsx`

**(a) Imports.** Change

```ts
import type { Graph, LabelledPair, PairRelations, Relation } from "../types";
import { fmt } from "../lib/graph";
```

to

```ts
import type { Graph, LabelledPair, ObservedRelation, PairRelations, Relation } from "../types";
import { fmt, pct } from "../lib/graph";
```

**(b) Clash helper.** Directly above `export function RelationsView(` add:

```ts
/** The hand label and the anyOf data reach opposite verdicts — one of them is wrong. */
const clash = (hand: Relation, observed: ObservedRelation) =>
  (hand === "SUBSTITUTE" && observed === "COMPLEMENT") ||
  (hand === "COMPLEMENT" && observed === "SUBSTITUTE");

```

**(c) Orphans use the vocabulary.** In the **first** `useMemo` (the one returning
`{ rows, tally, orphans }`):

- replace `const byName = new Map(graph.nodes.map((n, i) => [n.name, i]));` (the one on the
  first line of that memo — **not** the one in the second `model` memo) with
  `const vocabulary = new Set(graph.vocabulary);`
- replace `const orphans = curated.pairs.filter((p) => p.pair.some((n) => !byName.has(n)));`
  with `const orphans = curated.pairs.filter((p) => p.pair.some((n) => !vocabulary.has(n)));`
- replace the two comment lines above it with:
  ```ts
      // A label naming a skill the taxonomy no longer has is the failure mode the
      // name-keying buys: it must be visible here, not only in lab:relations.
  ```

In the orphan warning paragraph, replace `name a skill this graph no longer has` with
`name a skill the taxonomy no longer has`.

**(d) Header note.** Replace

```tsx
              {curated.pairs.length} pairs, labelled by hand. Co-occurrence cannot tell these apart:
              a pair meaning “or” and a pair meaning “and” produce identical counts, because the
              distinguishing word is discarded at extraction.
```

with

```tsx
              {curated.pairs.length} pairs, labelled by hand, next to what the vacancies themselves
              say: extraction now keeps “A or B” as one requirement, so every pair carries the share
              of positions that offered it as alternatives.
```

**(e) Observed column.** In the table:

- after `<th className={thLeft}>Relation</th>` add `<th className={thLeft}>Observed</th>`;
- after the `Relation` cell (the `<td className={tdName}>` containing `r.relation.toLowerCase()`)
  add:

  ```tsx
                    <td className={tdName}>
                      {e ? (
                        <span
                          className={`font-mono text-[0.72rem] ${clash(r.relation, e.observed) ? "text-trap" : "text-ink-2"}`}
                        >
                          {e.observed.toLowerCase()} · {pct(e.substituteRate)} “or”
                        </span>
                      ) : (
                        "—"
                      )}
                    </td>
  ```

**(f) Footer paragraph.** Replace the whole text of the last `<p>` (starting
`These labels are judgement, not measurement.` and ending
`Disagree with any row by editing src/data/pair-relations.json.`) with:

```
        These labels are judgement, written from domain knowledge over the strongest edges of
        an earlier snapshot. The “Observed” column is measurement: the share of positions whose
        vacancy offered the pair as “A or B”, from the LLM’s requirement groups. Red marks a
        pair where the two disagree outright. IMPLIES stays hand-made — “or” groups cannot
        express a direction. Disagree with any label by editing src/data/pair-relations.json.
```

---

## 3.4 Verify

```bash
pnpm --filter @metahunt/lab lab:build
pnpm --filter @metahunt/lab lab:check
```

Both exit 0. Then check the dossier logic against the artifact:

```bash
node apps/lab/redesign/files/dossier-check.mjs apps/lab/src/data/graph.json
```

Expected: 7 lines, all starting with `ok`, exit code 0.

**Do not start the dev server** (`pnpm ... lab` runs forever and will block you). The owner
checks the UI by eye after you finish — list in your report the four things to look at:
AWS dossier ("choose" shows Azure and Google Cloud), Docker dossier (Kubernetes is a
companion), Map → Alternatives (slider disappears), Relations table (Observed column, no
orphan warning).

## 3.5 Commit

```bash
git add apps/lab/src/views/SkillDossier.tsx apps/lab/src/views/Map.tsx apps/lab/src/views/Relations.tsx
git commit -m "feat(lab): show alternatives apart from companions in dossier, map and relations"
```
