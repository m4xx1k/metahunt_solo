import Link from "next/link";
import { notFound } from "next/navigation";

import { monitoringApi } from "@/lib/api/monitoring";
import { formatDateTime, formatRelative } from "@/lib/format";
import { displayTitle, extractedSeniority } from "@/lib/extracted-vacancy";
import { SeniorityBadge } from "@/entities/vacancy/SeniorityBadge";
import { StatRows } from "@/ui/data/StatRows";
import { PageBody } from "@/ui/layout/PageBody";
import { PageHeader } from "@/ui/layout/PageHeader";
import { Panel } from "@/ui/layout/Panel";
import { BackLink } from "@/ui/navigation/BackLink";
import { Badge } from "@/ui";
import { ExtractedDataView } from "./_components/ExtractedDataView";

export const dynamic = "force-dynamic";

const EXTRACTION_BADGE = {
  succeeded: { variant: "accent" as const, label: "structured" },
  failed: { variant: "dark" as const, label: "extraction failed" },
  pending: { variant: "dark" as const, label: "extraction pending" },
};

export default async function RecordDetailPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;

  const record = await monitoringApi.getRecord(id).catch((err) => {
    if (err instanceof Error && err.message.includes(" 404 ")) return null;
    throw err;
  });

  if (!record) notFound();

  const seniority = extractedSeniority(record);
  const title = displayTitle(record);
  const badge = EXTRACTION_BADGE[record.extractionStatus];

  return (
    <>
      <PageHeader
        title={title}
        hint={title === record.title ? undefined : `raw title · ${record.title}`}
        eyebrow={
          <BackLink href={`/dashboard/runs/${record.rssIngestId}`}>
            {record.sourceDisplayName ?? record.sourceCode ?? "source"}
          </BackLink>
        }
        actions={
          <div className="flex flex-wrap items-center gap-2">
            {seniority ? <SeniorityBadge seniority={seniority} /> : null}
            <Badge
              variant={badge.variant}
              className={record.extractionStatus === "failed" ? "bg-danger text-bg" : undefined}
            >
              {badge.label}
            </Badge>
            {record.link ? (
              <a
                href={record.link}
                target="_blank"
                rel="noreferrer noopener"
                className="font-mono text-2xs uppercase tracking-[0.12em] text-accent hover:underline"
              >
                ↗ original
              </a>
            ) : null}
          </div>
        }
      />

      <PageBody>
        <div className="grid gap-3 lg:grid-cols-2">
          <Panel title="Record">
            <StatRows
              rows={[
                { label: "published", value: formatDateTime(record.publishedAt) },
                { label: "collected", value: formatRelative(record.createdAt) },
                { label: "structured", value: formatRelative(record.extractedAt) },
                { label: "category", value: record.category ?? "—" },
                { label: "external id", value: record.externalId ?? "—" },
              ]}
            />
          </Panel>
          <Panel title="Lineage">
            <StatRows
              rows={[
                {
                  label: "run",
                  value: (
                    <Link
                      href={`/dashboard/runs/${record.rssIngestId}`}
                      className="text-accent hover:underline"
                    >
                      {record.rssIngestId.slice(0, 8)}…
                    </Link>
                  ),
                },
                { label: "checksum", value: <span className="break-all">{record.hash}</span> },
              ]}
            />
          </Panel>
        </div>

        {record.description ? (
          <Panel title="Description">
            <p className="whitespace-pre-wrap font-body text-sm leading-relaxed text-text-secondary">
              {record.description}
            </p>
          </Panel>
        ) : null}

        <section className="flex flex-col gap-3">
          <h2 className="font-display text-sm font-bold text-text-primary">Extracted fields</h2>
          <ExtractedDataView data={record.extractedData} />
        </section>
      </PageBody>
    </>
  );
}
