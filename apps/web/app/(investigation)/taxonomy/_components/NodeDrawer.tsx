"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
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
  HIDDEN: "border-text-muted text-text-muted",
};

const STATUS_LABEL: Record<NodeDetail["status"], string> = {
  VERIFIED: "підтверджено",
  NEW: "нове",
  HIDDEN: "приховано",
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
  const router = useRouter();
  const [state, setState] = useState<State>({ kind: "loading" });
  const [action, setAction] = useState<{
    busy: boolean;
    error: string | null;
  }>({ busy: false, error: null });

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

  const run = async (fn: () => Promise<unknown>) => {
    setAction({ busy: true, error: null });
    try {
      await fn();
      router.refresh();
      onClose();
    } catch (e: unknown) {
      setAction({
        busy: false,
        error: e instanceof Error ? e.message : String(e),
      });
    }
  };

  return (
    <div
      className="fixed inset-0 z-50 flex justify-end bg-black/60"
      role="dialog"
      aria-modal="true"
      aria-label="деталі поняття"
      onClick={onClose}
    >
      <div
        className="flex h-full w-full max-w-[560px] flex-col gap-5 overflow-y-auto border-l border-border bg-bg-card p-6 shadow-[-8px_0_0_0_#000]"
        onClick={(e) => e.stopPropagation()}
      >
        <header className="flex items-start justify-between gap-4">
          <span className="font-mono text-[11px] uppercase tracking-wider text-text-muted">
            поняття довідника
          </span>
          <button
            type="button"
            onClick={onClose}
            className="border border-border px-3 py-1 font-mono text-xs uppercase tracking-wider text-text-secondary hover:border-accent hover:text-accent"
          >
            закрити [esc]
          </button>
        </header>

        {state.kind === "loading" ? (
          <p className="font-mono text-sm text-text-muted">завантаження…</p>
        ) : null}
        {state.kind === "error" ? (
          <pre className="overflow-x-auto whitespace-pre-wrap border border-danger bg-bg p-3 font-mono text-xs text-danger">
            {state.message}
          </pre>
        ) : null}
        {state.kind === "ok" ? (
          <>
            <ModerationBar
              node={state.node}
              busy={action.busy}
              error={action.error}
              onVerify={() => run(() => taxonomyApi.verify(state.node.id))}
              onHide={() => run(() => taxonomyApi.hide(state.node.id))}
            />
            <DrawerContent
              node={state.node}
              fuzzy={state.fuzzy}
              onMerge={(targetId) =>
                run(() => taxonomyApi.mergeInto(state.node.id, targetId))
              }
              busy={action.busy}
            />
          </>
        ) : null}
      </div>
    </div>
  );
}

function ModerationBar({
  node,
  busy,
  error,
  onVerify,
  onHide,
}: {
  node: NodeDetail;
  busy: boolean;
  error: string | null;
  onVerify: () => void;
  onHide: () => void;
}) {
  return (
    <div className="flex flex-col gap-2 border border-border bg-bg-elev p-3">
      <span className="font-mono text-[11px] uppercase tracking-wider text-text-muted">
        дії модератора
      </span>
      <div className="flex flex-wrap gap-2">
        <button
          type="button"
          disabled={busy || node.status === "VERIFIED"}
          onClick={onVerify}
          className={cn(
            "border px-3 py-1 font-mono text-xs uppercase tracking-wider transition-colors",
            node.status === "VERIFIED" || busy
              ? "border-border text-text-muted"
              : "border-success text-success hover:bg-success hover:text-bg",
          )}
        >
          підтвердити
        </button>
        <button
          type="button"
          disabled={busy || node.status === "HIDDEN"}
          onClick={onHide}
          className={cn(
            "border px-3 py-1 font-mono text-xs uppercase tracking-wider transition-colors",
            node.status === "HIDDEN" || busy
              ? "border-border text-text-muted"
              : "border-danger text-danger hover:bg-danger hover:text-bg",
          )}
        >
          приховати
        </button>
        <span className="ml-auto self-center font-mono text-[11px] text-text-muted">
          об&apos;єднати → оберіть кандидата нижче
        </span>
      </div>
      {error ? (
        <pre className="overflow-x-auto whitespace-pre-wrap border border-danger bg-bg p-2 font-mono text-[11px] text-danger">
          {error}
        </pre>
      ) : null}
    </div>
  );
}

function DrawerContent({
  node,
  fuzzy,
  onMerge,
  busy,
}: {
  node: NodeDetail;
  fuzzy: FuzzyMatchResult;
  onMerge: (targetId: string) => void;
  busy: boolean;
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
            {STATUS_LABEL[node.status]}
          </span>
          <span className="border border-border px-2 py-[2px] uppercase tracking-wider text-text-muted">
            {node.type}
          </span>
          <span className="text-text-muted">
            створено · {formatDateTime(node.createdAt)}
          </span>
        </div>
      </div>

      <Section label={`псевдоніми · ${node.aliases.length}`}>
        {node.aliases.length === 0 ? (
          <p className="font-mono text-xs text-text-muted">немає</p>
        ) : (
          <ul className="flex flex-wrap gap-2 font-mono text-xs">
            {node.aliases.map((a) => (
              <li
                key={a.name}
                className="border border-border bg-bg-elev px-2 py-1 text-text-secondary"
                title={`додано ${formatDateTime(a.createdAt)}`}
              >
                {a.name}
              </li>
            ))}
          </ul>
        )}
      </Section>

      <Section label={`згадується у · ${node.vacancyCount} вакансій`}>
        {node.sampleVacancies.length === 0 ? (
          <p className="font-mono text-xs text-text-muted">прикладів немає</p>
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
      </Section>

      <Section label="схожі поняття">
        <FuzzyMatchList
          matches={fuzzy.matches}
          skippedReason={fuzzy.skippedReason}
          onMerge={onMerge}
          mergeDisabled={busy}
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
