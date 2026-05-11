import { extractionCostApi } from "@/lib/api/extraction-cost";
import { InvestigationHeader } from "../../_components/InvestigationHeader";
import { Tag } from "@/components/ui-kit";
import {
  formatCount,
  formatPercent,
  formatRelative,
  formatTokens,
  formatUsd,
} from "@/lib/format";
import { KpiCard } from "../_components/KpiCard";
import { cn } from "@/lib/utils";

export const dynamic = "force-dynamic";

export default async function ExtractionCostPage() {
  const summary = await extractionCostApi.summary();
  const { total, last24h, byPromptVersion, byModel, recent } = summary;

  return (
    <main className="flex min-h-screen flex-col bg-bg">
      <InvestigationHeader title="dashboard / extraction cost" />

      <div className="mx-auto flex w-full max-w-[1280px] flex-col gap-12 px-6 py-10 md:px-20">
        <Section
          tag="> spend"
          title="how much we burned on LLM extraction"
          subtitle="reads from the extraction_cost SQL view (rss_records._usage sidecar). cost_usd is NULL for rows extracted before the model field landed."
        >
          <div className="grid auto-rows-fr gap-4 md:grid-cols-2 lg:grid-cols-4">
            <KpiCard label="cost · all time">
              <span className="font-display text-4xl font-bold leading-none text-accent">
                {formatUsd(total.costUsd)}
              </span>
              <span className="mt-auto font-mono text-[10px] uppercase tracking-wider text-text-muted">
                {formatCount(total.count)} extractions · {formatCount(total.failures)} failed
              </span>
            </KpiCard>
            <KpiCard label="cost · last 24h">
              <span className="font-display text-4xl font-bold leading-none text-text-primary">
                {formatUsd(last24h.costUsd)}
              </span>
              <span className="mt-auto font-mono text-[10px] uppercase tracking-wider text-text-muted">
                {formatCount(last24h.count)} extractions · {formatCount(last24h.failures)} failed
              </span>
            </KpiCard>
            <KpiCard label="tokens in · all time">
              <span className="font-display text-4xl font-bold leading-none text-text-primary">
                {formatTokens(total.tokensIn)}
              </span>
              <span className="mt-auto font-mono text-[10px] uppercase tracking-wider text-text-muted">
                cached {formatTokens(total.tokensCached)} ·{" "}
                {formatPercent(total.tokensCached, total.tokensIn)} hit rate
              </span>
            </KpiCard>
            <KpiCard label="tokens out · all time">
              <span className="font-display text-4xl font-bold leading-none text-text-primary">
                {formatTokens(total.tokensOut)}
              </span>
              <span className="mt-auto font-mono text-[10px] uppercase tracking-wider text-text-muted">
                avg{" "}
                {total.count > 0
                  ? formatCount(Math.round(total.tokensOut / total.count))
                  : "—"}
                {" "}/ extraction
              </span>
            </KpiCard>
          </div>
        </Section>

        <Section
          tag="> by prompt version"
          title="which prompt cost what"
          subtitle="bump apps/etl/src/extraction/baml.extractor.ts:PROMPT_VERSION when you edit baml_src/extract-vacancy.baml."
        >
          {byPromptVersion.length === 0 ? (
            <EmptyState message="No extractions recorded yet." />
          ) : (
            <BreakdownTable
              headers={["version", "count", "fails", "tokens in", "tokens out", "cached", "cost"]}
              rows={byPromptVersion.map((r) => ({
                key: String(r.promptVersion ?? "n/a"),
                cells: [
                  r.promptVersion == null ? "—" : `v${r.promptVersion}`,
                  formatCount(r.count),
                  r.failures > 0 ? formatCount(r.failures) : "0",
                  formatTokens(r.tokensIn),
                  formatTokens(r.tokensOut),
                  formatTokens(r.tokensCached),
                  formatUsd(r.costUsd),
                ],
                danger: r.failures > 0,
              }))}
            />
          )}
        </Section>

        <Section
          tag="> by model"
          title="model breakdown"
          subtitle="pricing comes from MODEL_PRICING_USD_PER_MTOK; rows with unknown model show NULL cost."
        >
          {byModel.length === 0 ? (
            <EmptyState message="No extractions recorded yet." />
          ) : (
            <BreakdownTable
              headers={["model", "count", "fails", "tokens in", "tokens out", "cached", "cost"]}
              rows={byModel.map((r) => ({
                key: r.model ?? "unknown",
                cells: [
                  r.model ?? "unknown",
                  formatCount(r.count),
                  r.failures > 0 ? formatCount(r.failures) : "0",
                  formatTokens(r.tokensIn),
                  formatTokens(r.tokensOut),
                  formatTokens(r.tokensCached),
                  formatUsd(r.costUsd),
                ],
                danger: r.failures > 0,
              }))}
            />
          )}
        </Section>

        <Section
          tag="> recent"
          title="last 50 extractions"
          subtitle="newest first. failures highlighted in red."
        >
          {recent.length === 0 ? (
            <EmptyState message="No recent extractions." />
          ) : (
            <BreakdownTable
              headers={["when", "v", "model", "in", "out", "cached", "cost", "status"]}
              rows={recent.map((r) => ({
                key: r.id,
                cells: [
                  formatRelative(r.extractedAt),
                  r.promptVersion == null ? "—" : `v${r.promptVersion}`,
                  r.model ?? "—",
                  formatTokens(r.tokensIn),
                  formatTokens(r.tokensOut),
                  formatTokens(r.tokensCached),
                  formatUsd(r.costUsd),
                  r.isFailure ? "fail" : "ok",
                ],
                danger: r.isFailure,
              }))}
            />
          )}
        </Section>
      </div>
    </main>
  );
}

function Section({
  tag,
  title,
  subtitle,
  children,
}: {
  tag: string;
  title: string;
  subtitle?: string;
  children: React.ReactNode;
}) {
  return (
    <section className="flex flex-col gap-6">
      <div className="flex flex-col gap-2">
        <Tag>{tag}</Tag>
        <h2 className="font-display text-2xl font-bold text-text-primary md:text-3xl">
          {title}
        </h2>
        {subtitle ? (
          <p className="font-mono text-xs text-text-muted">{subtitle}</p>
        ) : null}
      </div>
      {children}
    </section>
  );
}

function BreakdownTable({
  headers,
  rows,
}: {
  headers: string[];
  rows: Array<{ key: string; cells: string[]; danger?: boolean }>;
}) {
  return (
    <div className="overflow-x-auto border border-border bg-bg-card shadow-[6px_6px_0_0_#000]">
      <table className="w-full border-collapse text-left">
        <thead>
          <tr className="border-b border-border bg-bg">
            {headers.map((h) => (
              <th
                key={h}
                className="px-4 py-3 font-mono text-[10px] uppercase tracking-wider text-text-muted"
              >
                {h}
              </th>
            ))}
          </tr>
        </thead>
        <tbody>
          {rows.map((row) => (
            <tr
              key={row.key}
              className={cn(
                "border-b border-border last:border-b-0",
                row.danger && "bg-danger/5",
              )}
            >
              {row.cells.map((c, i) => (
                <td
                  key={i}
                  className={cn(
                    "px-4 py-3 font-mono text-sm",
                    i === 0 ? "text-text-primary" : "text-text-secondary",
                    row.danger && i === headers.length - 1 && "text-danger",
                  )}
                >
                  {c}
                </td>
              ))}
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

function EmptyState({ message }: { message: string }) {
  return (
    <div className="border border-dashed border-border bg-bg-card p-6 text-center font-mono text-sm text-text-muted">
      {message}
    </div>
  );
}
