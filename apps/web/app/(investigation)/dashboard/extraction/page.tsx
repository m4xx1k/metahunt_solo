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
      <InvestigationHeader title="облік витрат на екстракцію" activePath="/dashboard/extraction" />

      <div className="mx-auto flex w-full max-w-[1280px] flex-col gap-12 px-6 py-10 md:px-20">
        <Section
          tag="> витрати"
          title="вартість роботи мовної моделі"
          subtitle="облік ведеться за метаданими кожного виклику (модель, токени вхід/вихід, кешовані токени, час, помилка)."
        >
          <div className="grid auto-rows-fr gap-4 md:grid-cols-2 lg:grid-cols-4">
            <KpiCard label="за весь час">
              <span className="font-display text-4xl font-bold leading-none text-accent">
                {formatUsd(total.costUsd)}
              </span>
              <span className="mt-auto font-mono text-[10px] uppercase tracking-wider text-text-muted">
                {formatCount(total.count)} викликів · {formatCount(total.failures)} помилок
              </span>
            </KpiCard>
            <KpiCard label="за 24 години">
              <span className="font-display text-4xl font-bold leading-none text-text-primary">
                {formatUsd(last24h.costUsd)}
              </span>
              <span className="mt-auto font-mono text-[10px] uppercase tracking-wider text-text-muted">
                {formatCount(last24h.count)} викликів · {formatCount(last24h.failures)} помилок
              </span>
            </KpiCard>
            <KpiCard label="вхідних токенів · всього">
              <span className="font-display text-4xl font-bold leading-none text-text-primary">
                {formatTokens(total.tokensIn)}
              </span>
              <span className="mt-auto font-mono text-[10px] uppercase tracking-wider text-text-muted">
                кешовано {formatTokens(total.tokensCached)} ·{" "}
                {formatPercent(total.tokensCached, total.tokensIn)} попадань
              </span>
            </KpiCard>
            <KpiCard label="вихідних токенів · всього">
              <span className="font-display text-4xl font-bold leading-none text-text-primary">
                {formatTokens(total.tokensOut)}
              </span>
              <span className="mt-auto font-mono text-[10px] uppercase tracking-wider text-text-muted">
                у середньому{" "}
                {total.count > 0
                  ? formatCount(Math.round(total.tokensOut / total.count))
                  : "—"}
                {" "}на виклик
              </span>
            </KpiCard>
          </div>
        </Section>

        <Section
          tag="> за версією промпта"
          title="витрати в розрізі версій промпта"
          subtitle="кожна суттєва зміна шаблону запиту до моделі підвищує номер версії; це дає змогу відстежувати витрати й якість у часі."
        >
          {byPromptVersion.length === 0 ? (
            <EmptyState message="Викликів ще не зафіксовано." />
          ) : (
            <BreakdownTable
              headers={["версія", "викликів", "помилок", "токенів·вхід", "токенів·вихід", "кеш", "витрати"]}
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
          tag="> за моделлю"
          title="розподіл за моделями"
          subtitle="прайс моделей зафіксовано у вихідному коді; вартість для невідомої моделі не обчислюється."
        >
          {byModel.length === 0 ? (
            <EmptyState message="Викликів ще не зафіксовано." />
          ) : (
            <BreakdownTable
              headers={["модель", "викликів", "помилок", "токенів·вхід", "токенів·вихід", "кеш", "витрати"]}
              rows={byModel.map((r) => ({
                key: r.model ?? "unknown",
                cells: [
                  r.model ?? "невідомо",
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
          tag="> останні"
          title="останні 50 викликів"
          subtitle="у зворотному хронологічному порядку; помилки підсвічені червоним."
        >
          {recent.length === 0 ? (
            <EmptyState message="Нещодавніх викликів немає." />
          ) : (
            <BreakdownTable
              headers={["коли", "версія", "модель", "вхід", "вихід", "кеш", "витрати", "статус"]}
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
                  r.isFailure ? "помилка" : "ok",
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
