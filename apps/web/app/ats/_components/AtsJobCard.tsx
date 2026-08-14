import Link from "next/link";

import type { AtsJob } from "@/lib/api/ats";
import { formatAtsDate, formatAtsLocations, formatAtsSalary } from "@/lib/ats-format";
import { Badge } from "@/ui";

const FORMAT_LABEL: Record<NonNullable<AtsJob["workFormat"]>, string> = {
  REMOTE: "remote",
  HYBRID: "hybrid",
  OFFICE: "office",
};

export function AtsJobCard({ job }: { job: AtsJob }) {
  const salary = formatAtsSalary(job);
  const locations = formatAtsLocations(job.locations);
  const flags = [
    job.needsReview ? "needs review" : null,
    job.hasDuplicate ? "possible duplicate" : null,
    job.isUa ? "UA" : null,
  ].filter(Boolean) as string[];

  return (
    <article className="flex flex-col gap-4 border border-accent bg-bg-card p-5 shadow-brut-sm md:p-6">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div className="min-w-0">
          <div className="mb-2 flex flex-wrap items-center gap-2 font-mono text-2xs uppercase tracking-wider text-text-muted">
            <Badge>{job.atsType}</Badge>
            <span>{job.status === "OPEN" ? "open" : "closed"}</span>
            <span>·</span>
            <span>
              {job.status === "OPEN"
                ? `posted ${formatAtsDate(job.publishedAt)}`
                : `closed ${formatAtsDate(job.closedAt)}`}
            </span>
          </div>
          <h2 className="break-words font-display text-lg font-bold text-text-primary md:text-xl">
            {job.title}
          </h2>
          <div className="mt-1 flex flex-wrap items-center gap-x-2 gap-y-1 font-body text-sm text-text-secondary">
            {job.companySlug ? (
              <Link
                className="hover:text-accent hover:underline"
                href={`/company/${job.companySlug}`}
              >
                {job.companyName}
              </Link>
            ) : (
              <span>{job.companyName}</span>
            )}
            {job.boardSlug ? (
              <span className="font-mono text-2xs text-text-muted">[{job.boardSlug}]</span>
            ) : null}
          </div>
        </div>

        {job.link ? (
          <a
            href={job.link}
            target="_blank"
            rel="noreferrer noopener"
            className="inline-flex shrink-0 items-center gap-2 border border-accent bg-bg px-3 py-2 font-mono text-xs uppercase tracking-wider text-text-primary shadow-brut-sm transition-[transform,box-shadow] hover:translate-x-[2px] hover:translate-y-[2px] hover:shadow-brut-2xs"
          >
            ↗ original
          </a>
        ) : (
          <span className="border border-danger/60 px-3 py-2 font-mono text-xs text-danger">
            no original URL
          </span>
        )}
      </div>

      <div className="flex flex-wrap gap-x-5 gap-y-2 border-y border-border py-3 font-mono text-xs text-text-secondary">
        <span>{locations ?? "location missing"}</span>
        {job.workFormat ? (
          <span className="text-accent">{FORMAT_LABEL[job.workFormat]}</span>
        ) : (
          <span className="text-danger">work mode missing</span>
        )}
        {job.seniority ? <span>{job.seniority.toLowerCase()}</span> : null}
        {salary ? (
          <span className={job.salarySource === "ATS_STRUCTURED" ? "text-text-primary" : ""}>
            {salary}
            {job.salarySource === "ATS_STRUCTURED" ? " · stated" : " · parsed"}
          </span>
        ) : (
          <span>salary not stated</span>
        )}
      </div>

      {flags.length ? (
        <div className="flex flex-wrap gap-2 font-mono text-2xs uppercase tracking-wider">
          {flags.map((flag) => (
            <span
              key={flag}
              className={
                flag === "needs review"
                  ? "border border-danger/60 px-2 py-1 text-danger"
                  : "border border-border px-2 py-1 text-text-muted"
              }
            >
              {flag}
            </span>
          ))}
        </div>
      ) : null}
    </article>
  );
}
