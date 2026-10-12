"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import {
  taxonomyApi,
  type FuzzyMatch,
  type NodeMentions,
  type ReprojectResult,
  type SplitResult,
  type SplitTarget,
} from "@/lib/api/taxonomy";
import { cn } from "@/lib/utils";

const DEBOUNCE_MS = 250;
const MIN_QUERY_LEN = 2;
const PREVIEW_ROWS = 8;

const errorMessage = (e: unknown) => (e instanceof Error ? e.message : String(e));

// Mentions grouped by alias. Checked aliases move to a new or existing node;
// the preview is a dry-run of the exact same server path the confirm runs.
export function MentionSplit({ nodeId, mentions }: { nodeId: string; mentions: NodeMentions }) {
  const router = useRouter();
  const [checked, setChecked] = useState<Set<string>>(new Set());
  const [targetName, setTargetName] = useState("");
  const [targetNode, setTargetNode] = useState<{ id: string; name: string } | null>(null);
  const [suggestions, setSuggestions] = useState<FuzzyMatch[]>([]);
  const [preview, setPreview] = useState<SplitResult | null>(null);
  const [outcome, setOutcome] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const query = targetName.trim();
  useEffect(() => {
    if (targetNode || query.length < MIN_QUERY_LEN) return;
    const ctl = new AbortController();
    const handle = window.setTimeout(() => {
      taxonomyApi
        .searchVerified("SKILL", query, 5)
        .then((res) => {
          if (!ctl.signal.aborted) setSuggestions(res.matches.filter((m) => m.id !== nodeId));
        })
        .catch(() => {
          if (!ctl.signal.aborted) setSuggestions([]);
        });
    }, DEBOUNCE_MS);
    return () => {
      ctl.abort();
      window.clearTimeout(handle);
    };
  }, [query, targetNode, nodeId]);

  const target: SplitTarget | null = targetNode
    ? { nodeId: targetNode.id }
    : query
      ? { name: query }
      : null;
  const ready = checked.size > 0 && target !== null && !busy;

  const resetPreview = () => {
    setPreview(null);
    setOutcome(null);
  };

  const toggle = (alias: string) => {
    const next = new Set(checked);
    if (next.has(alias)) next.delete(alias);
    else next.add(alias);
    setChecked(next);
    resetPreview();
  };

  const run = async (dryRun: boolean) => {
    if (!target) return;
    setBusy(true);
    setError(null);
    try {
      const result = await taxonomyApi.split(nodeId, [...checked], target, dryRun);
      if (dryRun) {
        setPreview(result);
        return;
      }
      setPreview(null);
      setChecked(new Set());
      setOutcome(
        `moved ${result.aliases.length} alias(es) to ${result.target.name} · ${summary(result)}`,
      );
      router.refresh();
    } catch (e: unknown) {
      setError(errorMessage(e));
    } finally {
      setBusy(false);
    }
  };

  const reproject = async () => {
    setBusy(true);
    setError(null);
    try {
      const result = await taxonomyApi.reproject(nodeId);
      setOutcome(`reprojected · ${summary(result)}`);
      router.refresh();
    } catch (e: unknown) {
      setError(errorMessage(e));
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="flex flex-col gap-3 font-mono text-xs">
      <ul className="flex flex-col divide-y divide-border border border-border bg-bg-elev">
        {mentions.aliases.map((a) => (
          <li key={a.alias}>
            <label className="flex cursor-pointer items-baseline gap-2 px-3 py-2">
              <input
                type="checkbox"
                checked={checked.has(a.alias)}
                onChange={() => toggle(a.alias)}
                className="accent-accent"
              />
              <span className="min-w-0 flex-1 truncate text-text-primary" title={a.alias}>
                {a.variants.length > 0 ? a.variants.map((v) => v.raw).join(" · ") : a.alias}
              </span>
              <span className="shrink-0 text-text-muted">{a.vacancies}</span>
            </label>
          </li>
        ))}
      </ul>

      <div className="flex flex-col gap-2">
        <span className="text-2xs uppercase tracking-wider text-text-muted">split into…</span>
        {targetNode ? (
          <div className="flex items-center justify-between gap-2 border border-accent px-3 py-2">
            <span className="truncate text-text-primary">existing · {targetNode.name}</span>
            <button
              type="button"
              onClick={() => {
                setTargetNode(null);
                resetPreview();
              }}
              className="text-text-muted hover:text-text-primary"
            >
              change
            </button>
          </div>
        ) : (
          <>
            <input
              type="text"
              value={targetName}
              onChange={(e) => {
                setTargetName(e.target.value);
                if (e.target.value.trim().length < MIN_QUERY_LEN) setSuggestions([]);
                resetPreview();
              }}
              placeholder="new name, or search an existing entry…"
              aria-label="split target"
              className="border border-border bg-bg-card px-3 py-2 text-sm text-text-primary outline-none focus:border-accent"
            />
            {suggestions.length > 0 ? (
              <ul className="flex flex-col border border-border bg-bg-elev">
                {suggestions.map((m) => (
                  <li key={m.id}>
                    <button
                      type="button"
                      onClick={() => {
                        setTargetNode({ id: m.id, name: m.canonicalName });
                        resetPreview();
                      }}
                      className="w-full px-3 py-1 text-left text-text-secondary hover:bg-bg-card hover:text-text-primary"
                    >
                      use existing · {m.canonicalName}
                    </button>
                  </li>
                ))}
              </ul>
            ) : null}
          </>
        )}
      </div>

      {error ? (
        <button
          type="button"
          onClick={() => setError(null)}
          className="border border-danger bg-bg p-2 text-left text-2xs text-danger hover:bg-danger hover:text-bg"
        >
          {error} · dismiss
        </button>
      ) : null}

      {preview ? <SplitPreview preview={preview} /> : null}
      {outcome ? <p className="border border-success p-2 text-success">{outcome}</p> : null}

      <div className="flex flex-wrap gap-2">
        <ActionButton disabled={!ready} onClick={() => run(true)}>
          {busy && !preview ? "…" : "preview split"}
        </ActionButton>
        {preview ? (
          <ActionButton disabled={busy} onClick={() => run(false)} tone="danger">
            {busy ? "…" : `confirm · ${preview.vacancies.changed} vacancies`}
          </ActionButton>
        ) : null}
        <ActionButton disabled={busy} onClick={reproject} tone="muted">
          reproject
        </ActionButton>
      </div>
    </div>
  );
}

function summary(r: ReprojectResult): string {
  return `${r.vacancies.changed}/${r.vacancies.scanned} vacancies changed, ${r.vacancies.skipped} skipped, ${r.candidates.changed}/${r.candidates.scanned} CVs changed`;
}

function SplitPreview({ preview }: { preview: SplitResult }) {
  return (
    <div className="flex flex-col gap-2 border border-accent p-3">
      <p className="text-text-primary">
        dry-run · {preview.target.created ? "new" : "existing"} entry “{preview.target.name}” ·{" "}
        {summary(preview)}
      </p>
      {preview.links.length > 0 ? (
        <ul className="flex flex-col gap-1 text-text-secondary">
          {preview.links.slice(0, PREVIEW_ROWS).map((l) => (
            <li key={l.nodeId} className="flex justify-between gap-3">
              <span className="truncate">{l.name}</span>
              <span className="shrink-0 text-text-muted">
                {l.vacanciesBefore} → {l.vacanciesAfter}
              </span>
            </li>
          ))}
        </ul>
      ) : null}
    </div>
  );
}

function ActionButton({
  disabled,
  onClick,
  tone = "accent",
  children,
}: {
  disabled: boolean;
  onClick: () => void;
  tone?: "accent" | "danger" | "muted";
  children: React.ReactNode;
}) {
  return (
    <button
      type="button"
      disabled={disabled}
      onClick={onClick}
      className={cn(
        "border px-3 py-2 text-2xs uppercase tracking-wider transition-colors",
        disabled && "border-border text-text-muted",
        !disabled && tone === "accent" && "border-accent text-accent hover:bg-accent hover:text-bg",
        !disabled && tone === "danger" && "border-danger text-danger hover:bg-danger hover:text-bg",
        !disabled &&
          tone === "muted" &&
          "border-border text-text-secondary hover:text-text-primary",
      )}
    >
      {children}
    </button>
  );
}
