import Link from "next/link";

import type { MetalabNode, MetalabRole, Neighborhood, SortMetric } from "@/lib/metalab/graph";
import { Panel } from "@/ui/layout/Panel";

// Raw evidence sits to the left of every normalized number on purpose: a lift
// of 300 means nothing until you can see it rests on 31 positions.
export function NeighborTable({
  view,
  sort,
  focus,
  role,
  minPairs,
}: {
  view: Neighborhood;
  sort: SortMetric;
  focus: MetalabNode;
  role: MetalabRole | null;
  minPairs: number;
}) {
  return (
    <Panel
      title="Neighbours"
      meta={`${view.neighbors.length}${view.truncated ? "+" : ""} · sorted by ${sort}`}
      footer={
        <span className="font-mono text-[11px] text-text-muted">
          {focus.name} appears in {view.focusSupport.toLocaleString("en-US")} of{" "}
          {view.denominator.toLocaleString("en-US")} positions in this scope (
          {((view.focusSupport / view.denominator) * 100).toFixed(1)}%). Pair floor ≥ {minPairs}.
        </span>
      }
    >
      <div className="overflow-x-auto">
        <table className="w-full min-w-[560px] border-collapse font-mono text-xs">
          <thead>
            <tr className="border-b border-border text-left text-text-muted">
              <th className="py-1.5 pr-3 font-normal">skill</th>
              <th className="py-1.5 pr-3 text-right font-normal">pair positions</th>
              <th className="py-1.5 pr-3 text-right font-normal">P(B|{abbrev(focus.name)})</th>
              <th className="py-1.5 pr-3 text-right font-normal">P({abbrev(focus.name)}|B)</th>
              <th className="py-1.5 pr-3 text-right font-normal">lift</th>
              <th className="py-1.5 text-right font-normal">NPMI</th>
            </tr>
          </thead>
          <tbody>
            {view.neighbors.map((n) => (
              <tr key={n.node.id} className="border-b border-border/40 last:border-0">
                <td className="py-1.5 pr-3">
                  <Link
                    href={{
                      pathname: "/dashboard/metalab",
                      query: cleanQuery({
                        skill: n.node.slug ?? n.node.name,
                        role: role?.id,
                        sort,
                        minPairs,
                      }),
                    }}
                    className="text-text-primary hover:underline"
                  >
                    {n.node.name}
                  </Link>
                  <span className="ml-2 text-text-muted">
                    {n.node.support.toLocaleString("en-US")}
                  </span>
                </td>
                <td className="py-1.5 pr-3 text-right tabular-nums text-text-primary">{n.pairs}</td>
                <td className="py-1.5 pr-3 text-right tabular-nums">{n.pGiven.toFixed(3)}</td>
                <td className="py-1.5 pr-3 text-right tabular-nums">{n.pReverse.toFixed(3)}</td>
                <td className="py-1.5 pr-3 text-right tabular-nums">{n.lift.toFixed(2)}</td>
                <td className="py-1.5 text-right tabular-nums">
                  {n.npmi === undefined ? "—" : n.npmi.toFixed(3)}
                </td>
              </tr>
            ))}
            {view.neighbors.length === 0 ? (
              <tr>
                <td colSpan={6} className="py-3 text-text-muted">
                  No neighbour clears ≥ {minPairs} pair positions in this scope.
                </td>
              </tr>
            ) : null}
          </tbody>
        </table>
      </div>
    </Panel>
  );
}

function abbrev(name: string): string {
  return name.length > 10 ? `${name.slice(0, 9)}…` : name;
}

function cleanQuery(q: Record<string, string | number | undefined>) {
  return Object.fromEntries(Object.entries(q).filter(([, v]) => v !== undefined && v !== ""));
}
