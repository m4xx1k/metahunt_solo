import { Badge, Card } from "@/components/ui-kit";
import type { UniqueVacancyListItem } from "@/lib/api/dedup";
import { WhyMerged } from "./WhyMerged";

// One unique-vacancy group, with collapsible member list. Uses native
// <details>/<summary> instead of useState so the card stays a server
// component and there's no hydration cost on page load.
export function GroupCard({ group }: { group: UniqueVacancyListItem }) {
  const isCrossSource = group.sourceCount >= 2;
  const edges = group.members.filter((m) => m.dedupReason !== null);
  const tier =
    edges.length === 0
      ? null
      : edges.every((m) => m.dedupReason?.confidence === "gold")
        ? "gold"
        : "confirmed";
  return (
    <Card className={isCrossSource ? "!border-accent" : undefined}>
      <header className="flex flex-col gap-3">
        <div className="flex flex-wrap items-baseline justify-between gap-3">
          <h3 className="font-display text-lg font-bold text-text-primary md:text-xl">
            {group.title}
          </h3>
          <div className="flex flex-wrap items-center gap-2">
            {group.sources.map((s) => (
              <Badge key={s.id}>{s.displayName}</Badge>
            ))}
            <Badge variant="dark">
              {group.vacancyCount} {group.vacancyCount === 1 ? "post" : "posts"}
            </Badge>
            {tier ? (
              <span
                className={
                  tier === "gold"
                    ? "inline-flex items-center bg-amber-300 px-2 py-1 font-mono text-[11px] font-bold uppercase tracking-wider text-bg"
                    : "inline-flex items-center bg-accent px-2 py-1 font-mono text-[11px] font-bold uppercase tracking-wider text-bg"
                }
              >
                {tier}
              </span>
            ) : null}
          </div>
        </div>
        <div className="flex flex-wrap gap-x-4 gap-y-1 font-mono text-xs text-text-muted">
          {group.companyName ? <span>company: {group.companyName}</span> : null}
          {group.role ? <span>role: {group.role}</span> : null}
          {group.seniority ? <span>seniority: {group.seniority}</span> : null}
          {group.workFormat ? <span>format: {group.workFormat}</span> : null}
          {group.salaryRange &&
          (group.salaryRange.min !== null || group.salaryRange.max !== null) ? (
            <span>
              salary: {fmtSalary(group.salaryRange)}
            </span>
          ) : null}
          <span>posted: {fmtDateRange(group.firstSeenAt, group.lastSeenAt)}</span>
        </div>
      </header>

      <details className="group/details">
        <summary className="flex cursor-pointer list-none items-center justify-between border-t border-border pt-4 font-mono text-[11px] uppercase tracking-wider text-text-muted hover:text-text-primary">
          <span>
            {group.vacancyCount === 1
              ? "view canonical →"
              : `view ${group.vacancyCount} members + why merged →`}
          </span>
          <span className="font-mono text-base group-open/details:rotate-90">›</span>
        </summary>

        <div className="mt-4 flex flex-col gap-4">
          {group.members.map((m) => (
            <div
              key={m.vacancyId}
              className="flex flex-col gap-3 border-t border-border pt-4"
            >
              <div className="flex flex-wrap items-baseline justify-between gap-2">
                <div className="flex flex-wrap items-baseline gap-2">
                  <Badge variant={m.isCanonical ? "accent" : "dark"}>
                    {m.source.displayName}
                  </Badge>
                  {m.isCanonical ? (
                    <span className="font-mono text-[10px] uppercase tracking-wider text-accent">
                      canonical
                    </span>
                  ) : null}
                  <span className="text-sm text-text-primary">{m.title}</span>
                </div>
                <div className="flex items-center gap-3 font-mono text-[11px] text-text-muted">
                  {m.publishedAt ? (
                    <span>{fmtDate(m.publishedAt)}</span>
                  ) : null}
                  {m.externalUrl ? (
                    <a
                      href={m.externalUrl}
                      target="_blank"
                      rel="noreferrer"
                      className="text-accent underline-offset-2 hover:underline"
                    >
                      open original ↗
                    </a>
                  ) : null}
                </div>
              </div>
              {m.dedupReason ? <WhyMerged reason={m.dedupReason} /> : null}
            </div>
          ))}
        </div>
      </details>
    </Card>
  );
}

function fmtSalary({
  min,
  max,
  currency,
}: {
  min: number | null;
  max: number | null;
  currency: string | null;
}): string {
  const c = currency ?? "";
  if (min !== null && max !== null) return `${min}-${max} ${c}`.trim();
  if (min !== null) return `from ${min} ${c}`.trim();
  if (max !== null) return `up to ${max} ${c}`.trim();
  return "—";
}

function fmtDate(iso: string): string {
  return new Date(iso).toISOString().slice(0, 10);
}

function fmtDateRange(firstIso: string, lastIso: string): string {
  const first = fmtDate(firstIso);
  const last = fmtDate(lastIso);
  return first === last ? first : `${first} → ${last}`;
}
