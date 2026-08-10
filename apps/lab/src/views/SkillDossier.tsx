import { useMemo, useState } from "react";
import type { Edge, Graph, PairRelations, Relation } from "../types";
import { fmt, neighboursOf, pct, searchSkills } from "../lib/graph";
import { input, label, panel, panelHead, panelNote, panelTitle, td, tdName, th, thLeft } from "../ui";
import { HowItWorks } from "./HowItWorks";

type DossierRelation = { name: string; relation: Relation; note?: string };

const companionLimit = 6;

export function SkillDossier({
  graph,
  curated,
  adj,
  selected,
  onSelect,
  onOpenFaq,
  variant = "full",
}: {
  graph: Graph;
  curated: PairRelations;
  adj: Map<number, Edge[]>;
  selected: number;
  onSelect: (index: number) => void;
  onOpenFaq: () => void;
  variant?: "full" | "sidebar";
}) {
  const sidebar = variant === "sidebar";
  const [query, setQuery] = useState("");
  const skill = graph.nodes[selected];
  const byName = useMemo(() => new Map(graph.nodes.map((node, index) => [node.name, index])), [graph.nodes]);
  const neighbours = useMemo(
    () => neighboursOf(graph, adj, selected, graph.contract.minPairSupport).sort((a, b) => b.p - a.p),
    [adj, graph, selected],
  );
  const core = neighbours.filter((n) => n.p >= 0.6).slice(0, companionLimit);
  const periphery = neighbours.filter((n) => n.p >= 0.2 && n.p < 0.6).slice(0, companionLimit);
  const relations = useMemo(() => {
    const matching: DossierRelation[] = [];
    for (const pair of curated.pairs) {
      const selectedAt = pair.pair.indexOf(skill.name);
      if (selectedAt < 0) continue;
      matching.push({ name: pair.pair[1 - selectedAt], relation: pair.relation, note: pair.note });
    }
    return matching;
  }, [curated.pairs, skill.name]);
  const forks = relations.filter((r) => r.relation === "SUBSTITUTE");
  const prerequisites = curated.pairs
    .filter((pair) => pair.relation === "IMPLIES" && pair.pair[0] === skill.name)
    .map((pair) => ({ name: pair.pair[1], relation: pair.relation, note: pair.note }));
  const roles = graph.roles
    .flatMap((role) => {
      const row = role.skills.find((entry) => entry.n === selected);
      return row ? [{ name: role.name, positions: role.positions, share: row.share }] : [];
    })
    .sort((a, b) => b.share - a.share)
    .slice(0, companionLimit);

  const pick = (name: string) => {
    const index = byName.get(name);
    if (index !== undefined) {
      onSelect(index);
      setQuery("");
    }
  };

  return (
    <>
      <div className="flex flex-wrap items-end gap-x-5 gap-y-3 pb-4">
        <div className="flex flex-col gap-1">
          <label className={label} htmlFor="skill-query">
            Skill
          </label>
          <input
            id="skill-query"
            className={input}
            value={query}
            placeholder={skill.name}
            list="skills"
            onChange={(event) => setQuery(event.target.value)}
            onKeyDown={(event) => event.key === "Enter" && pick(query)}
            onBlur={() => query && pick(query)}
          />
          <datalist id="skills">
            {searchSkills(graph.nodes, query).map((node) => (
              <option key={node.id} value={node.name} />
            ))}
          </datalist>
        </div>
      </div>

      <section className={`${panel} mb-5`}>
        <div className={panelHead}>
          <h2 className={panelTitle}>
            {skill.name} <span className="font-normal text-ink-3">· {fmt(skill.support)} positions</span>
          </h2>
          <p className={panelNote}>{pct(skill.prevalence)} of this corpus explicitly requires it</p>
        </div>
      </section>

      <div className={sidebar ? "grid gap-3" : "grid gap-5 lg:grid-cols-2"}>
        <CompanionCard
          title="Often requested together"
          note="in at least 60% of positions that ask for this skill"
          rows={core}
          empty="No companion clears 60% in this snapshot."
          onSelect={onSelect}
        />
        <CompanionCard
          title="Sometimes requested together"
          note="in 20–59% of positions that ask for this skill"
          rows={periphery}
          empty="No companion falls in this range."
          onSelect={onSelect}
        />
        <RelationCard
          title="Where the market asks you to choose"
          note="hand-reviewed SUBSTITUTE labels; one is enough"
          rows={forks}
          empty="No reviewed substitute pair for this skill yet."
          onSelect={(name) => pick(name)}
        />
        <RelationCard
          title="Implied foundations"
          note="hand-reviewed directional labels; this skill implies the other"
          rows={prerequisites}
          empty="No reviewed implied foundation for this skill yet."
          onSelect={(name) => pick(name)}
        />
        <section className={panel}>
          <div className={panelHead}>
            <h3 className={panelTitle}>Roles where it appears</h3>
            <p className={panelNote}>share of positions inside each role</p>
          </div>
          <List empty="This skill does not clear the role reporting floor." rows={roles}>
            {(role) => (
              <div className="flex items-baseline justify-between gap-3 px-4 py-2">
                <span className="text-sm text-ink-2">{role.name}</span>
                <span className="font-mono text-xs text-ink-3">
                  {pct(role.share)} · {fmt(role.positions)} positions
                </span>
              </div>
            )}
          </List>
        </section>
      </div>

      <details className={`${panel} mt-5`}>
        <summary className="cursor-pointer px-4 py-3 text-sm font-semibold text-ink-2">
          All observed companions ({neighbours.length})
        </summary>
        <div className="overflow-x-auto border-t border-rule">
          <table className="w-full min-w-[32rem] text-[0.83rem] border-collapse">
            <thead>
              <tr>
                <th className={thLeft}>Skill</th>
                <th className={th}>Shared positions</th>
                <th className={th}>Asked alongside</th>
                <th className={th}>Association</th>
              </tr>
            </thead>
            <tbody>
              {neighbours.map((neighbour) => (
                <tr
                  key={neighbour.node.id}
                  className="cursor-pointer border-b border-rule last:border-0 hover:bg-panel-2"
                  onClick={() => onSelect(neighbour.index)}
                >
                  <td className={tdName}>{neighbour.node.name}</td>
                  <td className={td}>{fmt(neighbour.pairs)}</td>
                  <td className={td}>{pct(neighbour.p)}</td>
                  <td className={td}>{neighbour.npmi.toFixed(3)} NPMI</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </details>

      <HowItWorks onOpenFaq={onOpenFaq}>
        The first two cards group every companion by the share of this skill&apos;s positions where it
        also appears; the cutoffs are display labels, not a claim of causation. “Choose” and
        “implied foundations” appear only when a pair has been reviewed by hand.
      </HowItWorks>
    </>
  );
}

function CompanionCard({
  title,
  note,
  rows,
  empty,
  onSelect,
}: {
  title: string;
  note: string;
  rows: ReturnType<typeof neighboursOf>;
  empty: string;
  onSelect: (index: number) => void;
}) {
  return (
    <section className={panel}>
      <div className={panelHead}>
        <h3 className={panelTitle}>{title}</h3>
        <p className={panelNote}>{note}</p>
      </div>
      <List empty={empty} rows={rows}>
        {(row) => (
          <button
            type="button"
            className="flex w-full cursor-pointer items-baseline justify-between gap-3 px-4 py-2 text-left hover:bg-panel-2"
            onClick={() => onSelect(row.index)}
          >
            <span className="text-sm text-ink-2">{row.node.name}</span>
            <span className="font-mono text-xs text-ink-3">
              {pct(row.p)} · {fmt(row.pairs)} positions
            </span>
          </button>
        )}
      </List>
    </section>
  );
}

function RelationCard({
  title,
  note,
  rows,
  empty,
  onSelect,
}: {
  title: string;
  note: string;
  rows: DossierRelation[];
  empty: string;
  onSelect: (name: string) => void;
}) {
  return (
    <section className={panel}>
      <div className={panelHead}>
        <h3 className={panelTitle}>{title}</h3>
        <p className={panelNote}>{note}</p>
      </div>
      <List empty={empty} rows={rows}>
        {(row) => (
          <button
            type="button"
            className="flex w-full cursor-pointer items-baseline justify-between gap-3 px-4 py-2 text-left hover:bg-panel-2"
            onClick={() => onSelect(row.name)}
          >
            <span className="text-sm text-ink-2">{row.name}</span>
            {row.note ? <span className="text-right text-xs text-ink-3">{row.note}</span> : null}
          </button>
        )}
      </List>
    </section>
  );
}

function List<T>({
  rows,
  empty,
  children,
}: {
  rows: T[];
  empty: string;
  children: (row: T) => React.ReactNode;
}) {
  return rows.length ? (
    <div>{rows.map((row, index) => <div key={index}>{children(row)}</div>)}</div>
  ) : (
    <p className="px-4 py-3 text-sm text-ink-3">{empty}</p>
  );
}
