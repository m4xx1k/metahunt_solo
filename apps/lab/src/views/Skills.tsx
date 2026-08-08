import { useMemo, useState } from "react";
import type { Edge, Graph, Neighbour } from "../types";
import { fmt, inRoleEdge, neighboursOf, npmiClass, pct, searchSkills } from "../lib/graph";
import { input, label, panel, panelHead, panelNote, panelTitle, td, tdName, th, thLeft } from "../ui";

type SortKey = "npmi" | "pairs" | "lift" | "p";

const SORTS: { key: SortKey; text: string; get: (n: Neighbour) => number }[] = [
  { key: "npmi", text: "NPMI — association strength", get: (n) => n.npmi },
  { key: "lift", text: "Lift — times above chance", get: (n) => n.lift },
  { key: "p", text: "P(B|A) — conditional share", get: (n) => n.p },
  { key: "pairs", text: "Shared positions — raw count", get: (n) => n.pairs },
];

export function Skills({
  graph,
  adj,
  selected,
  onSelect,
}: {
  graph: Graph;
  adj: Map<number, Edge[]>;
  selected: number;
  onSelect: (index: number) => void;
}) {
  const [query, setQuery] = useState("");
  const [minPairs, setMinPairs] = useState(graph.contract.minPairSupport);
  const [sort, setSort] = useState<SortKey>("npmi");
  const [roleId, setRoleId] = useState("");

  const skill = graph.nodes[selected];
  const role = graph.roles.find((r) => r.id === roleId);
  const active = SORTS.find((s) => s.key === sort)!;

  const neighbours = useMemo(
    () =>
      neighboursOf(graph, adj, selected, minPairs)
        .sort((x, y) => active.get(y) - active.get(x))
        .slice(0, 40),
    [graph, adj, selected, minPairs, active],
  );

  const max = neighbours.reduce((m, n) => Math.max(m, active.get(n)), 0) || 1;

  const pick = (name: string) => {
    const i = graph.nodes.findIndex((n) => n.name.toLowerCase() === name.toLowerCase());
    if (i >= 0) {
      onSelect(i);
      setQuery("");
    }
  };

  return (
    <>
      <div className="flex flex-wrap gap-x-5 gap-y-3 items-end pb-5">
        <div className="flex flex-col gap-1">
          <label className={label} htmlFor="q">
            Skill
          </label>
          <input
            id="q"
            className={input}
            value={query}
            placeholder={skill.name}
            list="skills"
            onChange={(e) => setQuery(e.target.value)}
            onKeyDown={(e) => e.key === "Enter" && pick(query)}
            onBlur={() => query && pick(query)}
          />
          <datalist id="skills">
            {searchSkills(graph.nodes, query).map((n) => (
              <option key={n.id} value={n.name} />
            ))}
          </datalist>
        </div>

        <div className="flex flex-col gap-1">
          <label className={label} htmlFor="sort">
            Rank by
          </label>
          <select
            id="sort"
            className={input}
            value={sort}
            onChange={(e) => setSort(e.target.value as SortKey)}
          >
            {SORTS.map((s) => (
              <option key={s.key} value={s.key}>
                {s.text}
              </option>
            ))}
          </select>
        </div>

        <div className="flex flex-col gap-1">
          <label className={label} htmlFor="role">
            Control for role
          </label>
          <select
            id="role"
            className={input}
            value={roleId}
            onChange={(e) => setRoleId(e.target.value)}
          >
            <option value="">— none —</option>
            {graph.roles.map((r) => (
              <option key={r.id} value={r.id}>
                {r.name} ({fmt(r.positions)})
              </option>
            ))}
          </select>
        </div>

        <div className="flex flex-col gap-1">
          <label className={label} htmlFor="minp">
            Min shared positions
          </label>
          <div className="flex items-center gap-2">
            <input
              id="minp"
              type="range"
              className="accent-signal w-36"
              min={graph.contract.minPairSupport}
              max={200}
              value={minPairs}
              onChange={(e) => setMinPairs(Number(e.target.value))}
            />
            <span className="font-mono text-xs text-ink-2 tabular">≥ {minPairs}</span>
          </div>
        </div>
      </div>

      <div className={panel}>
        <div className={panelHead}>
          <span className={panelTitle}>
            {skill.name} — {fmt(skill.support)} positions ({pct(skill.prevalence)} of corpus)
          </span>
          <span className={panelNote}>
            {neighbours.length} neighbours
            {role ? ` · in-role lift measured on ${role.name}, ${fmt(role.positions)} positions` : ""}
          </span>
        </div>

        <div className="overflow-x-auto">
          {neighbours.length === 0 ? (
            <p className="py-10 text-center text-sm text-ink-3">
              Nothing clears {minPairs} shared positions.
            </p>
          ) : (
            <table className="w-full min-w-[38rem] text-[0.83rem] border-collapse">
              <thead>
                <tr>
                  <th className={thLeft}>Skill</th>
                  <th className={th}>Positions</th>
                  <th className={th}>Shared</th>
                  <th className={th}>P(B|A)</th>
                  <th className={th}>Lift</th>
                  <th className={th}>NPMI</th>
                  {role ? <th className={th}>Lift in role</th> : null}
                </tr>
              </thead>
              <tbody>
                {neighbours.map((n) => {
                  const cls = npmiClass(n.npmi);
                  const re = role ? inRoleEdge(role, selected, n.index) : undefined;
                  const sa = role?.skills.find((s) => s.n === selected)?.support;
                  const sb = role?.skills.find((s) => s.n === n.index)?.support;
                  const roleLift =
                    re && role && sa && sb ? (re.pairs * role.positions) / (sa * sb) : undefined;
                  const w = `${(active.get(n) / max) * 100}%`;

                  return (
                    <tr
                      key={n.node.id}
                      className="border-b border-rule last:border-0 hover:bg-panel-2 cursor-pointer"
                      onClick={() => onSelect(n.index)}
                    >
                      <td className={`${tdName} border-b-0`}>{n.node.name}</td>
                      <td className={td}>{fmt(n.node.support)}</td>
                      <td
                        className={`${td} mag`}
                        data-weak={cls === "weak"}
                        style={{ ["--mag" as string]: sort === "pairs" ? w : "0%" }}
                      >
                        <span>{fmt(n.pairs)}</span>
                      </td>
                      <td className={td}>{n.p.toFixed(2)}</td>
                      <td className={`${td} ${n.lift < 1.3 ? "text-trap" : ""}`}>
                        {n.lift.toFixed(2)}
                      </td>
                      <td
                        className={`${td} mag ${cls === "strong" ? "text-signal" : ""} ${
                          cls === "weak" ? "text-trap" : ""
                        }`}
                        data-weak={cls === "weak"}
                        style={{ ["--mag" as string]: sort === "npmi" ? w : "0%" }}
                      >
                        <span>{n.npmi.toFixed(3)}</span>
                      </td>
                      {role ? (
                        <td className={`${td} ${roleLift && roleLift < 1.3 ? "text-trap" : ""}`}>
                          {roleLift ? roleLift.toFixed(2) : "—"}
                        </td>
                      ) : null}
                    </tr>
                  );
                })}
              </tbody>
            </table>
          )}
        </div>
      </div>

      {role ? (
        <p className="mt-3 text-xs text-ink-3 max-w-[68ch] leading-relaxed">
          An em dash in the in-role column means the pair did not clear{" "}
          {graph.contract.minPairSupport} positions inside {role.name} — not that the association is
          zero. Where both numbers exist, the drop from global to in-role lift is how much of the
          link was role composition rather than an ecosystem relationship.
        </p>
      ) : null}
    </>
  );
}
