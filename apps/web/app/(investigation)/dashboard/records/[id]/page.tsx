import Link from "next/link";
import { notFound } from "next/navigation";
import { monitoringApi } from "@/lib/api/monitoring";
import { InvestigationHeader } from "../../../_components/InvestigationHeader";
import { ExtractedDataView } from "./_components/ExtractedDataView";
import { Badge, Tag } from "@/ui";
import { formatDateTime, formatRelative } from "@/lib/format";
import { displayTitle, extractedSeniority } from "@/lib/extracted-vacancy";
import { SeniorityBadge } from "@/entities/vacancy/SeniorityBadge";

export const dynamic = "force-dynamic";

export default async function RecordDetailPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;

  const record = await monitoringApi.getRecord(id).catch((err) => {
    if (err instanceof Error && err.message.includes(" 404 ")) return null;
    throw err;
  });

  if (!record) notFound();

  return (
    <main className="flex min-h-screen flex-col bg-bg">
      <InvestigationHeader title="запис оголошення" activePath="/dashboard" />

      <div className="mx-auto flex w-full max-w-[1280px] flex-col gap-10 px-6 py-10 md:px-20">
        <header className="flex flex-col gap-4">
          <Tag>{record.sourceDisplayName ?? record.sourceCode ?? "source"}</Tag>
          <div className="flex flex-wrap items-baseline gap-3">
            {(() => {
              const sen = extractedSeniority(record);
              return sen ? <SeniorityBadge seniority={sen} /> : null;
            })()}
            <h1
              className="font-display text-3xl font-bold leading-tight text-text-primary md:text-4xl"
              title={record.title}
            >
              {displayTitle(record)}
            </h1>
          </div>
          {displayTitle(record) !== record.title ? (
            <p className="font-mono text-xs text-text-muted">
              сирий заголовок · {record.title}
            </p>
          ) : null}
          <div className="flex flex-wrap items-center gap-2">
            {record.extracted ? (
              <Badge variant="accent">структуровано</Badge>
            ) : (
              <Badge variant="dark">очікує екстракції</Badge>
            )}
            {record.category ? (
              <Badge variant="dark">{record.category}</Badge>
            ) : null}
            {record.link ? (
              <a
                href={record.link}
                target="_blank"
                rel="noreferrer noopener"
                className="font-mono text-xs uppercase tracking-wider text-accent hover:underline"
              >
                ↗ оригінал
              </a>
            ) : null}
          </div>
        </header>

        <section className="grid gap-6 md:grid-cols-3">
          <Field label="опубліковано" value={formatDateTime(record.publishedAt)} />
          <Field label="створено" value={formatRelative(record.createdAt)} />
          <Field
            label="структуровано"
            value={formatRelative(record.extractedAt)}
          />
          <Field label="зовнішній id" value={record.externalId ?? "—"} />
          <Field
            label="контрольна сума"
            value={record.hash}
            mono
            className="md:col-span-2"
          />
          <Field
            label="запуск збору"
            value={
              <Link
                href={`/dashboard/ingests/${record.rssIngestId}`}
                className="text-accent hover:underline"
              >
                {record.rssIngestId.slice(0, 8)}…
              </Link>
            }
          />
        </section>

        {record.description ? (
          <section className="flex flex-col gap-3">
            <Tag>{"> опис"}</Tag>
            <div className="border border-border bg-bg-card p-6 shadow-[6px_6px_0_0_#000]">
              <p className="whitespace-pre-wrap font-body text-base leading-relaxed text-text-primary">
                {record.description}
              </p>
            </div>
          </section>
        ) : null}

        <section className="flex flex-col gap-3">
          <Tag>{"> структуровані поля"}</Tag>
          <ExtractedDataView data={record.extractedData} />
        </section>
      </div>
    </main>
  );
}

function Field({
  label,
  value,
  mono,
  className,
}: {
  label: string;
  value: React.ReactNode;
  mono?: boolean;
  className?: string;
}) {
  return (
    <div
      className={`flex flex-col gap-1 border border-border bg-bg-card p-4 ${className ?? ""}`}
    >
      <span className="font-mono text-[11px] uppercase tracking-wider text-text-muted">
        {label}
      </span>
      <span
        className={`break-all ${mono ? "font-mono text-xs" : "font-body text-sm"} text-text-primary`}
      >
        {value}
      </span>
    </div>
  );
}
