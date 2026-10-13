"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import {
  taxonomyApi,
  type FuzzyMatch,
  type MoveAliasesResult,
  type MoveTarget,
  type NodeLinkDelta,
  type NodeMentions,
} from "@/lib/api/taxonomy";
import { cn } from "@/lib/utils";

const DEBOUNCE_MS = 250;
const MIN_QUERY_LEN = 2;

type Target = { kind: "new"; name: string } | { kind: "existing"; id: string; name: string };

const errorMessage = (e: unknown) => (e instanceof Error ? e.message : String(e));

// Aliases with the spellings seen in vacancies. Checked aliases move to a new or
// existing node in one transaction; the preview is that transaction rolled back.
export function MoveAliases({ nodeId, mentions }: { nodeId: string; mentions: NodeMentions }) {
  const router = useRouter();
  const [checked, setChecked] = useState<Set<string>>(new Set());
  const [query, setQuery] = useState("");
  const [suggestions, setSuggestions] = useState<FuzzyMatch[]>([]);
  const [target, setTarget] = useState<Target | null>(null);
  const [preview, setPreview] = useState<MoveAliasesResult | null>(null);
  const [outcome, setOutcome] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const q = query.trim();
  useEffect(() => {
    if (target || q.length < MIN_QUERY_LEN) return;
    const ctl = new AbortController();
    const handle = window.setTimeout(() => {
      taxonomyApi
        .searchVerified("SKILL", q, 5)
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
  }, [q, target, nodeId]);

  const chooseTarget = (next: Target | null) => {
    setTarget(next);
    setQuery("");
    setSuggestions([]);
    setPreview(null);
    setError(null);
  };

  // The node's own name moves only with every other alias (backend rule).
  const others = mentions.aliases.filter((a) => a.alias !== mentions.nameAlias);
  const allOthersChecked = others.every((a) => checked.has(a.alias));

  const toggle = (alias: string) => {
    const next = new Set(checked);
    if (next.has(alias)) next.delete(alias);
    else next.add(alias);
    if (!others.every((a) => next.has(a.alias))) next.delete(mentions.nameAlias);
    setChecked(next);
    setPreview(null);
    setOutcome(null);
  };

  const run = async (dryRun: boolean) => {
    if (!target) return;
    const body: MoveTarget = target.kind === "new" ? { name: target.name } : { nodeId: target.id };
    setBusy(true);
    setError(null);
    setOutcome(null);
    try {
      const result = await taxonomyApi.moveAliases(nodeId, [...checked], body, dryRun);
      if (dryRun) {
        setPreview(result);
        return;
      }
      setPreview(null);
      setChecked(new Set());
      setTarget(null);
      setOutcome(`moved ${result.aliases.length} alias(es) to ${result.target.name}`);
      router.refresh();
    } catch (e: unknown) {
      setError(errorMessage(e));
    } finally {
      setBusy(false);
    }
  };

  const exactMatch = suggestions.some((m) => m.canonicalName.toLowerCase() === q.toLowerCase());

  return (
    <div className="flex flex-col gap-3 font-mono text-xs">
      <ul className="flex flex-col divide-y divide-border border border-border bg-bg-elev">
        {mentions.aliases.map((a) => {
          const isName = a.alias === mentions.nameAlias;
          const [top, ...rest] = a.variants;
          return (
            <li key={a.alias}>
              <label
                className={cn(
                  "flex items-baseline gap-2 px-3 py-2",
                  isName && !allOthersChecked ? "cursor-default" : "cursor-pointer",
                )}
                title={`alias key: ${a.alias}`}
              >
                <input
                  type="checkbox"
                  checked={checked.has(a.alias)}
                  disabled={(isName && !allOthersChecked) || busy}
                  onChange={() => toggle(a.alias)}
                  className="accent-accent"
                />
                <span className="flex min-w-0 flex-1 flex-col">
                  <span className="truncate text-text-primary">
                    {top?.raw ?? a.alias}
                    {isName ? (
                      <span className="ml-2 text-text-muted">
                        · node name{allOthersChecked ? "" : " (tick all others first)"}
                      </span>
                    ) : null}
                  </span>
                  {rest.length > 0 ? (
                    <span className="truncate text-2xs text-text-muted">
                      also written: {rest.map((v) => v.raw).join(", ")}
                    </span>
                  ) : null}
                </span>
                <span className="shrink-0 text-text-muted">{a.vacancies}</span>
              </label>
            </li>
          );
        })}
      </ul>

      {checked.size > 0 ? (
        <div className="flex flex-col gap-2">
          <span className="text-2xs uppercase tracking-wider text-text-muted">
            move {checked.size} checked to
          </span>
          {target ? (
            <div className="flex items-center justify-between gap-2 border border-accent px-3 py-2">
              <span className="truncate text-text-primary">
                {target.kind === "new" ? `new skill “${target.name}”` : target.name}
              </span>
              <button
                type="button"
                disabled={busy}
                onClick={() => chooseTarget(null)}
                className="text-text-muted hover:text-text-primary"
              >
                change
              </button>
            </div>
          ) : (
            <>
              <input
                type="text"
                value={query}
                onChange={(e) => {
                  setQuery(e.target.value);
                  if (e.target.value.trim().length < MIN_QUERY_LEN) setSuggestions([]);
                }}
                placeholder="search a skill, or type a new name…"
                aria-label="move target"
                className="border border-border bg-bg-card px-3 py-2 text-sm text-text-primary outline-none focus:border-accent"
              />
              {q.length >= MIN_QUERY_LEN ? (
                <ul className="flex flex-col border border-border bg-bg-elev">
                  {suggestions.map((m) => (
                    <TargetOption
                      key={m.id}
                      onClick={() =>
                        chooseTarget({ kind: "existing", id: m.id, name: m.canonicalName })
                      }
                    >
                      {m.canonicalName}
                    </TargetOption>
                  ))}
                  {exactMatch ? null : (
                    <TargetOption onClick={() => chooseTarget({ kind: "new", name: q })}>
                      + create new skill “{q}”
                    </TargetOption>
                  )}
                </ul>
              ) : null}
            </>
          )}
        </div>
      ) : null}

      {error ? (
        <p role="alert" className="border border-danger p-2 text-2xs text-danger">
          {error}
        </p>
      ) : null}

      <div aria-live="polite" className="contents">
        {preview ? <MovePreview preview={preview} /> : null}
        {outcome ? <p className="border border-success p-2 text-success">{outcome}</p> : null}
      </div>

      {checked.size > 0 && target ? (
        <div className="flex flex-wrap gap-2">
          {preview ? (
            <ActionButton disabled={busy} onClick={() => run(false)} tone="danger">
              {busy ? "moving…" : "confirm move"}
            </ActionButton>
          ) : (
            <ActionButton disabled={busy} onClick={() => run(true)}>
              {busy ? "previewing…" : "preview"}
            </ActionButton>
          )}
        </div>
      ) : null}
    </div>
  );
}

function TargetOption({ onClick, children }: { onClick: () => void; children: React.ReactNode }) {
  return (
    <li>
      <button
        type="button"
        onClick={onClick}
        className="w-full px-3 py-1 text-left text-text-secondary hover:bg-bg-card hover:text-text-primary"
      >
        {children}
      </button>
    </li>
  );
}

const vacancyDelta = (l: NodeLinkDelta) => l.vacanciesAfter - l.vacanciesBefore;
const signed = (n: number) => (n > 0 ? `+${n}` : String(n));

// Source and target first; any other node only changes because its old links
// had drifted from the current aliases, and the move rebuilt them.
function MovePreview({ preview }: { preview: MoveAliasesResult }) {
  const main = [preview.source.id, preview.target.id];
  const rows = main.map((id) => preview.links.find((l) => l.nodeId === id) ?? null);
  const drift = preview.links.filter((l) => !main.includes(l.nodeId));
  const names = [preview.source.name, preview.target.name];

  return (
    <div className="flex flex-col gap-1 border border-accent p-3 text-text-secondary">
      <p className="text-text-primary">
        preview · nothing saved · {preview.vacancies.changed} vacancies and{" "}
        {preview.candidates.changed} CVs change
      </p>
      {rows.map((l, i) => (
        <p key={main[i]} className="flex justify-between gap-3">
          <span className="truncate">
            {names[i]}
            {i === 1 && preview.target.created ? " (new)" : ""}
          </span>
          <span className="shrink-0">
            {signed(l ? vacancyDelta(l) : 0)} vacancies ·{" "}
            {signed(l ? l.candidatesAfter - l.candidatesBefore : 0)} CVs
          </span>
        </p>
      ))}
      {drift.length > 0 ? (
        <p
          className="text-2xs text-text-muted"
          title={drift.map((l) => `${l.name} ${signed(vacancyDelta(l))}`).join("\n")}
        >
          also rebuilds stale links on {drift.length} other skill(s):{" "}
          {drift
            .slice(0, 5)
            .map((l) => `${l.name} ${signed(vacancyDelta(l))}`)
            .join(", ")}
          {drift.length > 5 ? "…" : ""}
        </p>
      ) : null}
      {preview.vacancies.skipped > 0 ? (
        <p className="text-2xs text-text-muted">
          {preview.vacancies.skipped} vacancies kept as is (no extraction to re-read)
        </p>
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
  tone?: "accent" | "danger";
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
      )}
    >
      {children}
    </button>
  );
}
