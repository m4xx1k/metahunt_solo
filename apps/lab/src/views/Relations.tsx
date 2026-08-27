import { useMemo } from "react";
import { useState } from "react";
import type { Graph, LabelledPair, PairRelations, Relation } from "../types";
import { fmt } from "../lib/graph";
import { label, panel, panelHead, panelNote, panelTitle, td, tdName, th, thLeft } from "../ui";
import { Constellation, type ConLink } from "./Constellation";

const token = (name: string) =>
  getComputedStyle(document.documentElement).getPropertyValue(name).trim() || "#888";

const ORDER: Relation[] = ["COMPLEMENT", "SUBSTITUTE", "IMPLIES", "CONTESTED"];

const MEANING: Record<Relation, string> = {
  COMPLEMENT: "both are genuinely needed",
  SUBSTITUTE: "one is enough — the posting meant “or”",
  IMPLIES: "the first implies the second — directional",
  CONTESTED: "depends on the vacancy; no single answer is honest",
};

/** CONTESTED is deliberately not a series colour. It is the absence of a verdict,
 *  so it reads as muted ink; a fourth hue was tried and failed CVD separation on
 *  the dark surface. See the palette note in index.css. */
const hue = (r: Relation) =>
  r === "COMPLEMENT"
    ? token("--color-signal")
    : r === "SUBSTITUTE"
      ? token("--color-trap")
      : r === "IMPLIES"
        ? token("--color-relation-implies")
        : token("--color-ink-3");

// A separator that cannot occur inside a skill name, so ["a b","c"] and
// ["a","b c"] never collide. String.fromCharCode(0), never a literal NUL
// byte: a raw NUL in the source made binary-skipping searches miss this file (T1).
const SEP = String.fromCharCode(0);
const key = (a: string, b: string) => [a, b].sort((x, y) => x.localeCompare(y)).join(SEP);

const EMPTY_COMMUNITY = new Map<number, number>();

export function RelationsView({
  graph,
  curated,
  onSelectSkill,
}: {
  graph: Graph;
  curated: PairRelations;
  onSelectSkill: (index: number) => void;
}) {
  const [only, setOnly] = useState<Relation | null>(null);

  const { rows, tally, orphans, byName } = useMemo(() => {
    const byName = new Map(graph.nodes.map((n, i) => [n.name, i]));
    const edgeByPair = new Map(
      graph.edges.map((e) => [key(graph.nodes[e.a].name, graph.nodes[e.b].name), e]),
    );

    const rows: LabelledPair[] = curated.pairs.map((p) => ({
      ...p,
      edge: edgeByPair.get(key(...p.pair)),
    }));
    rows.sort((x, y) => (y.edge?.npmi ?? 0) - (x.edge?.npmi ?? 0));

    const tally = ORDER.map((r) => ({ r, n: rows.filter((x) => x.relation === r).length }));
    const orphans = curated.pairs.filter((p) => p.pair.some((n) => !byName.has(n)));
    return { rows, tally, orphans, byName };
  }, [graph, curated]);

  const shown = only ? rows.filter((r) => r.relation === only) : rows;

  const links = useMemo<ConLink[]>(() => {
    const out: ConLink[] = [];
    for (const row of shown) {
      const a = byName.get(row.pair[0]);
      const b = byName.get(row.pair[1]);
      if (a === undefined || b === undefined) continue;
      out.push({ source: a, target: b, kind: row.relation });
    }
    return out;
  }, [shown, byName]);

  return (
    <>
      <div className={`${panel} mb-5`}>
        <div className={panelHead}>
          <div>
            <h2 className={panelTitle}>What the strongest edges actually mean</h2>
            <p className={panelNote}>
              {curated.pairs.length} pairs, labelled by hand. Co-occurrence cannot tell these apart:
              a pair meaning “or” and a pair meaning “and” produce identical counts, because the
              distinguishing word is discarded at extraction.
            </p>
          </div>
        </div>
        <div className="px-4 py-3 flex flex-wrap gap-2">
          <button
            type="button"
            onClick={() => setOnly(null)}
            className={`rounded-full border px-3 py-1 text-[0.8rem] cursor-pointer ${
              only === null
                ? "bg-signal border-signal text-ground"
                : "border-rule-strong text-ink-2 hover:border-signal"
            }`}
          >
            All {rows.length}
          </button>
          {tally.map(({ r, n }) => (
            <button
              key={r}
              type="button"
              onClick={() => setOnly(only === r ? null : r)}
              title={MEANING[r]}
              className={`flex items-center gap-2 rounded-full border px-3 py-1 text-[0.8rem] cursor-pointer ${
                only === r ? "border-signal bg-signal-soft" : "border-rule-strong hover:border-signal"
              }`}
            >
              <span
                aria-hidden
                className="inline-block h-0.5 w-4 rounded"
                style={{ background: hue(r) }}
              />
              <span className="text-ink-2">
                {r.toLowerCase()} {n}
              </span>
            </button>
          ))}
        </div>
        <p className="px-4 pb-3 text-xs text-ink-3">
          {only
            ? MEANING[only]
            : "Pick a relation to filter both the map and the table. Arrowheads mark IMPLIES, the only directional one."}
        </p>
      </div>

      {orphans.length > 0 && (
        <p className="mb-5 rounded border border-trap px-4 py-2 text-sm text-trap">
          {orphans.length} label(s) name a skill this graph no longer has — the taxonomy moved under
          them. Re-key before trusting anything below.
        </p>
      )}

      <div className={`${panel} mb-5`}>
        <div className="px-1 py-1">
          <Constellation
            graph={graph}
            selected={-1}
            onSelectSkill={onSelectSkill}
            links={links}
            community={EMPTY_COMMUNITY}
            variant="relations"
            height={480}
          />
        </div>
      </div>

      <div className={panel}>
        <div className={panelHead}>
          <h2 className={panelTitle}>Every label, with the numbers behind it</h2>
          <p className={panelNote}>{curated.method}</p>
        </div>
        <div className="overflow-x-auto">
          <table className="w-full text-sm border-collapse">
            <thead>
              <tr className="border-b border-rule">
                <th className={thLeft}>Pair</th>
                <th className={thLeft}>Relation</th>
                <th className={th}>NPMI</th>
                <th className={th}>Positions</th>
                <th className={th}>P min–max</th>
                <th className={thLeft}>Why</th>
              </tr>
            </thead>
            <tbody>
              {shown.map((r) => {
                const e = r.edge;
                const arrow = r.relation === "IMPLIES" ? "⇒" : "·";
                return (
                  <tr key={r.pair.join("|")} className="border-b border-rule last:border-0">
                    <td className={tdName}>
                      {r.pair[0]} <span className="text-ink-3">{arrow}</span> {r.pair[1]}
                    </td>
                    <td className={tdName}>
                      <span className="inline-flex items-center gap-2">
                        <span
                          aria-hidden
                          className="inline-block h-0.5 w-3.5 rounded"
                          style={{ background: hue(r.relation) }}
                        />
                        <span className="font-mono text-[0.72rem] text-ink-2">
                          {r.relation.toLowerCase()}
                        </span>
                      </span>
                    </td>
                    <td className={td}>{e ? e.npmi.toFixed(3) : "—"}</td>
                    <td className={td}>{e ? fmt(e.pairs) : "—"}</td>
                    <td className={td}>
                      {e
                        ? `${Math.min(e.pAgivenB, e.pBgivenA).toFixed(2)}–${Math.max(e.pAgivenB, e.pBgivenA).toFixed(2)}`
                        : "—"}
                    </td>
                    <td className="px-3.5 py-1.5 text-left text-ink-3 text-[0.8rem]">
                      {r.note ?? ""}
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      </div>

      <p className={`${label} mt-4 normal-case tracking-normal text-[0.75rem] leading-relaxed`}>
        These labels are judgement, not measurement. They were written from domain knowledge over
        the top {curated.pairs.length} edges by NPMI and have no golden set behind them — they are
        the golden set. Two cheap detectors were tested against them and both failed: symmetry of
        the conditionals puts I2C/SPI (complements) at 1.00 and WireGuard/OpenVPN (substitutes) at
        0.93, and node_tech_meta’s category vocabulary lands DHCP/DNS and WireGuard/OpenVPN in the
        same cell. Disagree with any row by editing src/data/pair-relations.json.
      </p>
    </>
  );
}
