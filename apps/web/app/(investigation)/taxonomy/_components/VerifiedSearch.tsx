"use client";

import { useCallback, useEffect, useState, type ChangeEvent } from "react";
import {
  taxonomyApi,
  type FuzzyMatch,
  type NodeType,
} from "@/lib/api/taxonomy";
import { FuzzyMatchList } from "./FuzzyMatchList";

const DEBOUNCE_MS = 250;
const MIN_LEN = 2;

type State =
  | { kind: "idle" }
  | { kind: "loading" }
  | { kind: "ok"; matches: FuzzyMatch[] }
  | { kind: "error"; message: string };

export function VerifiedSearch({
  sourceId,
  type,
}: {
  sourceId: string;
  type: NodeType;
}) {
  const [q, setQ] = useState("");
  const trimmed = q.trim();
  const active = trimmed.length >= MIN_LEN;
  const [state, setState] = useState<State>({ kind: "idle" });

  useEffect(() => {
    if (!active) return;
    const ctl = new AbortController();
    const handle = window.setTimeout(() => {
      if (ctl.signal.aborted) return;
      setState({ kind: "loading" });
      taxonomyApi
        .searchVerified(type, trimmed)
        .then((res) => {
          if (ctl.signal.aborted) return;
          setState({ kind: "ok", matches: res.matches });
        })
        .catch((e: unknown) => {
          if (ctl.signal.aborted) return;
          setState({
            kind: "error",
            message: e instanceof Error ? e.message : String(e),
          });
        });
    }, DEBOUNCE_MS);
    return () => {
      ctl.abort();
      window.clearTimeout(handle);
    };
  }, [active, trimmed, type]);

  const handleChange = useCallback(
    (e: ChangeEvent<HTMLInputElement>) => setQ(e.target.value),
    [],
  );

  return (
    <div className="flex flex-col gap-2">
      <input
        type="search"
        value={q}
        onChange={handleChange}
        placeholder="ім'я або псевдонім (мін. 2 символи)…"
        aria-label="пошук підтвердженого поняття для об'єднання"
        className="border border-border bg-bg-card px-3 py-2 font-mono text-sm text-text-primary outline-none focus:border-accent"
      />
      {active && state.kind === "loading" ? (
        <p className="font-mono text-xs text-text-muted">пошук…</p>
      ) : null}
      {active && state.kind === "error" ? (
        <pre className="overflow-x-auto whitespace-pre-wrap border border-danger bg-bg p-2 font-mono text-[11px] text-danger">
          {state.message}
        </pre>
      ) : null}
      {active && state.kind === "ok" ? (
        <FuzzyMatchList
          sourceId={sourceId}
          matches={state.matches}
          emptyLabel="за запитом нічого не знайдено"
        />
      ) : null}
    </div>
  );
}
