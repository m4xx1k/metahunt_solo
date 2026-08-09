import { useMemo, useState } from "react";
import type { Graph } from "../types";
import { fmt, pct } from "../lib/graph";
import { input, label, panel, panelHead, panelNote, panelTitle, td, tdName, th, thLeft } from "../ui";
import { HowItWorks } from "./HowItWorks";

/** What a role actually asks for, on its own denominator — and which pairs
 *  inside it are more than composition. */
export function Roles({
  graph,
  onSelectSkill,
  onOpenFaq,
}: {
  graph: Graph;
  onSelectSkill: (i: number) => void;
  onOpenFaq: () => void;
}) {
  const [roleId, setRoleId] = useState(graph.roles[0]?.id ?? "");
  // A role is a smaller denominator than the corpus, so the global pair floor of
  // 10 lets the sparse tail back in: sorting by lift under it surfaces pairs
  // seen a dozen times at lift 60. This floor is the fix, not a nicer formula.
  const [minShared, setMinShared] = useState(25);
  const role = graph.roles.find((r) => r.id === roleId) ?? graph.roles[0];

  const skills = useMemo(
    () => [...role.skills].sort((a, b) => b.support - a.support).slice(0, 25),
    [role],
  );

  /** In-role lift needs the role's own marginals, not the global ones. */
  const edges = useMemo(() => {
    const support = new Map(role.skills.map((s) => [s.n, s.support]));
    return role.edges
      .filter((e) => e.pairs >= minShared)
      .map((e) => {
        const sa = support.get(e.a) ?? 0;
        const sb = support.get(e.b) ?? 0;
        return {
          ...e,
          lift: sa && sb ? (e.pairs * role.positions) / (sa * sb) : 0,
          nameA: graph.nodes[e.a].name,
          nameB: graph.nodes[e.b].name,
        };
      })
      .sort((x, y) => y.lift - x.lift)
      .slice(0, 25);
  }, [role, graph.nodes, minShared]);

  const maxShare = skills[0]?.share ?? 1;

  return (
    <>
      <div className="flex flex-wrap gap-x-5 gap-y-3 items-end pb-5">
        <div className="flex flex-col gap-1">
          <label className={label} htmlFor="role-pick">
            Role
          </label>
          <select
            id="role-pick"
            className={input}
            value={roleId}
            onChange={(e) => setRoleId(e.target.value)}
          >
            {graph.roles.map((r) => (
              <option key={r.id} value={r.id}>
                {r.name} — {fmt(r.positions)} positions
              </option>
            ))}
          </select>
        </div>
        <div className="flex flex-col gap-1">
          <label className={label} htmlFor="min-shared">
            Min shared positions
          </label>
          <div className="flex items-center gap-2">
            <input
              id="min-shared"
              type="range"
              className="accent-signal w-36"
              min={graph.contract.minPairSupport}
              max={80}
              value={minShared}
              onChange={(e) => setMinShared(Number(e.target.value))}
            />
            <span className="font-mono text-xs text-ink-2 tabular">≥ {minShared}</span>
          </div>
        </div>
        <p className="text-xs text-ink-3 max-w-[42ch] leading-relaxed">
          Only roles with at least {graph.contract.minRolePositions} positions are segmented — below
          that, in-role rates are too noisy to read.
        </p>
      </div>

      <div className="grid gap-5 lg:grid-cols-2">
        <div className={panel}>
          <div className={panelHead}>
            <span className={panelTitle}>Most demanded in {role.name}</span>
            <span className={panelNote}>share of {fmt(role.positions)} positions</span>
          </div>
          <div className="overflow-x-auto">
            <table className="w-full min-w-[22rem] text-[0.83rem] border-collapse">
              <thead>
                <tr>
                  <th className={thLeft}>Skill</th>
                  <th className={th}>Positions</th>
                  <th className={th}>Share</th>
                </tr>
              </thead>
              <tbody>
                {skills.map((s) => (
                  <tr
                    key={s.n}
                    className="border-b border-rule last:border-0 hover:bg-panel-2 cursor-pointer"
                    onClick={() => onSelectSkill(s.n)}
                  >
                    <td className={tdName}>{graph.nodes[s.n].name}</td>
                    <td className={td}>{fmt(s.support)}</td>
                    <td
                      className={`${td} mag`}
                      style={{ ["--mag" as string]: `${(s.share / maxShare) * 100}%` }}
                    >
                      <span>{pct(s.share)}</span>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>

        <div className={panel}>
          <div className={panelHead}>
            <span className={panelTitle}>Strongest pairs inside {role.name}</span>
            <span className={panelNote}>
              lift on the role&apos;s own denominator · ≥ {minShared} shared
            </span>
          </div>
          <div className="overflow-x-auto">
            <table className="w-full min-w-[24rem] text-[0.83rem] border-collapse">
              <thead>
                <tr>
                  <th className={thLeft}>Pair</th>
                  <th className={th}>Shared</th>
                  <th className={th}>Lift in role</th>
                </tr>
              </thead>
              <tbody>
                {edges.map((e) => (
                  <tr key={`${e.a}-${e.b}`} className="border-b border-rule last:border-0 hover:bg-panel-2">
                    <td className={tdName}>
                      {e.nameA} <span className="text-ink-3">+</span> {e.nameB}
                    </td>
                    <td className={td}>{fmt(e.pairs)}</td>
                    <td className={`${td} ${e.lift < 1.3 ? "text-trap" : "text-signal"}`}>
                      {e.lift.toFixed(2)}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      </div>

      <HowItWorks onOpenFaq={onOpenFaq}>
        Every share and lift here uses this role&apos;s positions as its denominator, so role composition
        is already controlled for. A lift near 1 means a common pair is no more linked than the
        role&apos;s separate skill popularity predicts.
      </HowItWorks>
      {edges.length === 0 ? (
        <p className="mt-2 text-xs text-trap">
          No pair inside {role.name} clears {minShared} shared positions — lower the floor, but read
          what appears as a hint rather than a finding.
        </p>
      ) : null}
    </>
  );
}
