"use client";

import Link from "next/link";
import { useCallback, useState, type ChangeEvent, type FormEvent } from "react";

import {
  coverageApi,
  type CoverageLookupResponse,
  type CoverageRow,
  type CoverageVerdict,
} from "@/lib/api/coverage";
import { formatRelative } from "@/lib/format";
import { cn } from "@/lib/utils";
import { Button } from "@/ui";
import { EmptyState } from "@/ui/feedback/EmptyState";
import { Panel } from "@/ui/layout/Panel";
import { StatCard } from "@/ui/data/StatCard";
import { StatGrid } from "@/ui/data/StatGrid";

type State =
  | { status: "idle" }
  | { status: "busy" }
  | { status: "error"; message: string }
  | { status: "done"; result: CoverageLookupResponse };

const PLACEHOLDER = [
  "https://jobs.dou.ua/companies/acme/vacancies/350774/",
  "https://djinni.co/jobs/821163-blockchain-developer/",
  "…up to 100 lines, one URL each",
].join("\n");

// This page's input is a 100-line paste, which doesn't fit a URL query
// string — every other dashboard screen serializes its state there, this one
// intentionally doesn't.
export function CoverageForm() {
  const [input, setInput] = useState("");
  const [state, setState] = useState<State>({ status: "idle" });

  const handleInput = useCallback(
    (e: ChangeEvent<HTMLTextAreaElement>) => setInput(e.target.value),
    [],
  );

  const handleSubmit = useCallback(
    async (e: FormEvent) => {
      e.preventDefault();
      if (!input.trim()) return;
      setState({ status: "busy" });
      try {
        const result = await coverageApi.lookup(input);
        setState({ status: "done", result });
      } catch (err: unknown) {
        setState({ status: "error", message: err instanceof Error ? err.message : String(err) });
      }
    },
    [input],
  );

  const busy = state.status === "busy";

  return (
    <div className="flex flex-col gap-6">
      <Panel title="paste vacancy URLs">
        <form onSubmit={handleSubmit} className="flex flex-col gap-3">
          <textarea
            value={input}
            onChange={handleInput}
            placeholder={PLACEHOLDER}
            rows={8}
            disabled={busy}
            aria-label="vacancy URLs, one per line"
            className="w-full resize-y border border-border bg-bg-elev px-3 py-2 font-mono text-xs text-text-primary outline-none focus:border-accent disabled:opacity-60"
          />
          <div className="flex items-center gap-3">
            <Button type="submit" size="sm" disabled={busy || !input.trim()}>
              {busy ? "checking…" : "check coverage"}
            </Button>
            {state.status === "error" ? (
              <span className="font-mono text-xs text-danger">{state.message}</span>
            ) : null}
          </div>
        </form>
      </Panel>

      {state.status === "done" ? <Result result={state.result} /> : null}
    </div>
  );
}

function Result({ result }: { result: CoverageLookupResponse }) {
  const { summary, sourceHealth, rows, supportedHosts } = result;
  const degraded = sourceHealth.filter(
    (h) => h.lastIngestStatus !== "completed" || h.postingsLast24h === 0,
  );

  return (
    <div className="flex flex-col gap-6">
      <StatGrid cols={4}>
        <StatCard
          label="coverage"
          value={summary.coveragePct == null ? "—" : `${summary.coveragePct}%`}
          hint={`${summary.found} of ${summary.checked} checked`}
          tone={
            summary.coveragePct == null
              ? "default"
              : summary.coveragePct >= 98
                ? "success"
                : "danger"
          }
        />
        <StatCard
          label="median ingest lag"
          value={summary.medianLagMinutes == null ? "—" : `${summary.medianLagMinutes}m`}
          hint="publish → loaded"
          tone={
            summary.medianLagMinutes == null
              ? "default"
              : summary.medianLagMinutes <= 90
                ? "success"
                : "danger"
          }
        />
        <StatCard label="pasted" value={summary.total} />
        <StatCard
          label="unsupported / unparseable"
          value={summary.byVerdict.source_not_supported + summary.byVerdict.url_not_parseable}
          hint={supportedHosts.length ? `we poll: ${supportedHosts.join(", ")}` : undefined}
        />
      </StatGrid>

      {degraded.length > 0 ? (
        <Panel title="source health" tone="danger">
          <ul className="flex flex-col gap-1 font-mono text-xs text-text-secondary">
            {degraded.map((h) => (
              <li key={h.sourceCode}>
                <span className="text-danger">{h.sourceCode}</span> — last ingest{" "}
                {h.lastIngestStatus ?? "never ran"}
                {h.lastIngestFinishedAt ? ` (${formatRelative(h.lastIngestFinishedAt)})` : ""},{" "}
                {h.postingsLast24h} postings/24h, {h.postingsLast7d}/7d
                {h.lastIngestError ? ` — ${h.lastIngestError}` : ""}
              </li>
            ))}
          </ul>
        </Panel>
      ) : null}

      {rows.length === 0 ? (
        <EmptyState title="nothing to show" />
      ) : (
        <ul className="flex flex-col gap-2">
          {rows.map((row, i) => (
            <RowCard key={`${row.input}-${i}`} row={row} />
          ))}
        </ul>
      )}
    </div>
  );
}

const VERDICT_LABEL: Record<CoverageVerdict, string> = {
  found: "found",
  found_not_visible: "found, not visible",
  seen_but_not_loaded: "seen, not loaded",
  not_found: "not found",
  source_not_supported: "unsupported source",
  url_not_parseable: "unparseable",
};

const VERDICT_TONE: Record<CoverageVerdict, string> = {
  found: "border-success text-success",
  found_not_visible: "border-accent text-accent",
  seen_but_not_loaded: "border-danger text-danger",
  not_found: "border-danger text-danger",
  source_not_supported: "border-border text-text-muted",
  url_not_parseable: "border-border text-text-muted",
};

function RowCard({ row }: { row: CoverageRow }) {
  const { match } = row;
  return (
    <li className="flex flex-col gap-2 border border-border bg-bg-card p-4">
      <div className="flex flex-wrap items-start justify-between gap-2">
        <span className="break-all font-mono text-xs text-text-secondary">{row.input}</span>
        <span
          className={cn(
            "shrink-0 border px-2 py-1 font-mono text-2xs font-bold uppercase tracking-wider",
            VERDICT_TONE[row.verdict],
          )}
        >
          {VERDICT_LABEL[row.verdict]}
        </span>
      </div>

      {row.detail ? <p className="font-mono text-xs text-text-muted">{row.detail}</p> : null}

      {match ? (
        <div className="flex flex-wrap items-center gap-x-4 gap-y-1 font-mono text-2xs text-text-muted">
          <span className="text-text-secondary">{match.title}</span>
          {match.companyName ? <span>@ {match.companyName}</span> : null}
          {match.ingestLagMinutes != null ? <span>lag {match.ingestLagMinutes}m</span> : null}
          {match.wasBumpedSincePublish ? (
            <span className="text-accent">bumped since first publish</span>
          ) : null}
          {match.postingCount > 1 ? <span>{match.postingCount} postings in group</span> : null}
          {match.legacyExternalIdForm ? (
            <span className="text-accent">legacy external_id form</span>
          ) : null}
          <Link href={match.vacancyPath} className="text-accent underline">
            vacancy →
          </Link>
        </div>
      ) : null}

      {row.recordPath ? (
        <Link href={row.recordPath} className="font-mono text-2xs text-accent underline">
          rss record →
        </Link>
      ) : null}
    </li>
  );
}
