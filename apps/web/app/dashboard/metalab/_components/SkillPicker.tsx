import Link from "next/link";

import type { MetalabNode } from "@/lib/metalab/graph";
import { cn } from "@/lib/utils";
import { Panel } from "@/ui/layout/Panel";

// Skill selection. A plain GET form + links, so the whole screen state stays
// in the URL and a finding can be pasted into Linear as-is.
export function SkillPicker({
  query,
  matches,
  focus,
}: {
  query: string;
  matches: MetalabNode[];
  focus: MetalabNode;
}) {
  return (
    <Panel title="Skill" meta={`${matches.length} shown`}>
      <form className="mb-3 flex gap-2">
        <input
          type="search"
          name="q"
          defaultValue={query}
          placeholder="Search skills…"
          className="min-w-0 flex-1 rounded border border-border bg-bg px-2 py-1.5 font-mono text-xs text-text-primary outline-none focus:border-text-muted"
        />
        <button
          type="submit"
          className="rounded border border-border px-2 py-1.5 font-mono text-xs text-text-muted hover:text-text-primary"
        >
          find
        </button>
      </form>

      <ul className="flex flex-col">
        {matches.map((node) => {
          const active = node.id === focus.id;
          return (
            <li key={node.id}>
              <Link
                href={{ pathname: "/dashboard/metalab", query: { skill: node.slug ?? node.name } }}
                className={cn(
                  "flex items-baseline justify-between gap-2 rounded px-2 py-1 font-mono text-xs",
                  active
                    ? "bg-surface text-text-primary"
                    : "text-text-muted hover:bg-surface hover:text-text-primary",
                )}
              >
                <span className="truncate">{node.name}</span>
                <span className="shrink-0 tabular-nums">
                  {node.support.toLocaleString("en-US")}
                </span>
              </Link>
            </li>
          );
        })}
        {matches.length === 0 ? (
          <li className="px-2 py-1 font-mono text-xs text-text-muted">
            nothing above the support floor
          </li>
        ) : null}
      </ul>
    </Panel>
  );
}
