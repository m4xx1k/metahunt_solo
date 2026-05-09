"use client";

import { useEffect, useState } from "react";
import {
  taxonomyApi,
  type FuzzyMatchResult,
  type NodeDetail,
} from "@/lib/api/taxonomy";
import { cn } from "@/lib/utils";
import { formatDateTime } from "@/lib/format";
import { FuzzyMatchList } from "./FuzzyMatchList";

const STATUS_PILL: Record<NodeDetail["status"], string> = {
  VERIFIED: "border-success text-success",
  NEW: "border-accent text-accent",
  REJECTED: "border-text-muted text-text-muted",
};

type State =
  | { kind: "idle" }
  | { kind: "loading" }
  | { kind: "ok"; node: NodeDetail; fuzzy: FuzzyMatchResult }
  | { kind: "error"; message: string };

export function NodeDrawer({
  nodeId,
  onClose,
}: {
  nodeId: string;
  onClose: () => void;
}) {
  const [state, setState] = useState<State>({ kind: "loading" });

  useEffect(() => {
    let cancelled = false;
    Promise.all([taxonomyApi.node(nodeId), taxonomyApi.fuzzyMatches(nodeId)])
      .then(([node, fuzzy]) => {
        if (!cancelled) setState({ kind: "ok", node, fuzzy });
      })
      .catch((e: unknown) => {
        if (!cancelled)
          setState({
            kind: "error",
            message: e instanceof Error ? e.message : String(e),
          });
      });
    return () => {
      cancelled = true;
    };
  }, [nodeId]);

  useEffect(() => {
    function onKey(e: KeyboardEvent) {
      if (e.key === "Escape") onClose();
    }
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [onClose]);

  return (
    <div
      className="fixed inset-0 z-50 flex justify-end bg-black/60"
      role="dialog"
      aria-modal="true"
      aria-label="node detail"
      onClick={onClose}
    >
      <div
        className="flex h-full w-full max-w-[560px] flex-col gap-5 overflow-y-auto border-l border-border bg-bg-card p-6 shadow-[-8px_0_0_0_#000]"
        onClick={(e) => e.stopPropagation()}
      >
        <header className="flex items-start justify-between gap-4">
          <span className="font-mono text-[11px] uppercase tracking-wider text-text-muted">
            node detail
          </span>
          <button
            type="button"
            onClick={onClose}
            className="border border-border px-3 py-1 font-mono text-xs uppercase tracking-wider text-text-secondary hover:border-accent hover:text-accent"
          >
            close [esc]
          </button>
        </header>

        {state.kind === "loading" ? (
          <p className="font-mono text-sm text-text-muted">fetching…</p>
        ) : null}
        {state.kind === "error" ? (
          <pre className="overflow-x-auto whitespace-pre-wrap border border-danger bg-bg p-3 font-mono text-xs text-danger">
            {state.message}
          </pre>
        ) : null}
        {state.kind === "ok" ? (
          <DrawerContent node={state.node} fuzzy={state.fuzzy} />
        ) : null}

        <p className="mt-auto border-t border-border pt-4 font-mono text-[11px] text-text-muted">
          moderation actions land in Phase 2 — see{" "}
          <code className="text-text-secondary">taxonomy-curation.md</code>.
        </p>
      </div>
    </div>
  );
}

function DrawerContent({
  node,
  fuzzy,
}: {
  node: NodeDetail;
  fuzzy: FuzzyMatchResult;
}) {
  return (
    <>
      <div className="flex flex-col gap-2">
        <h2 className="break-words font-display text-2xl font-bold text-text-primary">
          {node.canonicalName}
        </h2>
        <div className="flex flex-wrap items-center gap-2 font-mono text-xs">
          <span
            className={cn(
              "border px-2 py-[2px] uppercase tracking-wider",
              STATUS_PILL[node.status],
            )}
          >
            {node.status}
          </span>
          <span className="border border-border px-2 py-[2px] uppercase tracking-wider text-text-muted">
            {node.type}
          </span>
          <span className="text-text-muted">
            created · {formatDateTime(node.createdAt)}
          </span>
        </div>
        <span className="font-mono text-xs text-text-muted">
          id · <span className="text-text-secondary">{node.id}</span>
        </span>
      </div>

      <Section label={`aliases · ${node.aliases.length}`}>
        {node.aliases.length === 0 ? (
          <p className="font-mono text-xs text-text-muted">none</p>
        ) : (
          <ul className="flex flex-wrap gap-2 font-mono text-xs">
            {node.aliases.map((a) => (
              <li
                key={a.name}
                className="border border-border bg-bg-elev px-2 py-1 text-text-secondary"
                title={`added ${formatDateTime(a.createdAt)}`}
              >
                {a.name}
              </li>
            ))}
          </ul>
        )}
      </Section>

      <Section label={`used by · ${node.vacancyCount} vacancies`}>
        {node.sampleVacancies.length === 0 ? (
          <p className="font-mono text-xs text-text-muted">no samples</p>
        ) : (
          <ul className="flex flex-col gap-1 font-mono text-xs">
            {node.sampleVacancies.map((v) => (
              <li
                key={v.id}
                className="flex items-baseline gap-2 truncate"
                title={v.title}
              >
                <span className="text-text-muted">[{v.sourceCode}]</span>
                <span className="truncate text-text-secondary">{v.title}</span>
              </li>
            ))}
          </ul>
        )}
        <p className="font-mono text-[11px] text-text-muted">
          per-vacancy filter link blocked by D2 — see operator-dashboard tracker.
        </p>
      </Section>

      <Section label="fuzzy matches">
        <FuzzyMatchList
          matches={fuzzy.matches}
          skippedReason={fuzzy.skippedReason}
        />
      </Section>
    </>
  );
}

function Section({
  label,
  children,
}: {
  label: string;
  children: React.ReactNode;
}) {
  return (
    <section className="flex flex-col gap-2">
      <span className="font-mono text-[11px] uppercase tracking-wider text-text-muted">
        {label}
      </span>
      {children}
    </section>
  );
}
