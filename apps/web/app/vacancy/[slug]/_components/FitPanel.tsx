"use client";

import { useQuery } from "@tanstack/react-query";

import { FitBadge } from "@/entities/vacancy/FitBadge";
import { skillDiff } from "@/entities/vacancy/skill-diff";
import { useSession } from "@/features/auth/use-session";
import { vacanciesApi, type NodeRef } from "@/lib/api/vacancies";

// The vacancy detail page is `force-static` on purpose (crawl budget — it
// renders identically for everyone, so cookies() is empty there). The Fit
// badge + skill diff are per-viewer, so they can't come from that render:
// this island fetches `/feed/vacancy/:id` again on the client, where the
// localStorage Bearer token is available, and shows the panel only when the
// signed-in viewer has an active CV that scored this Position. The diff
// itself is computed here, off `viewerSkills` + the vacancy's own skills —
// same `skillDiff` every list card uses (MET-144 R4).
export function FitPanel({ vacancyId }: { vacancyId: string }) {
  const { isLoggedIn } = useSession();

  const { data } = useQuery({
    queryKey: ["vacancy-detail", vacancyId, "scored"],
    queryFn: () => vacanciesApi.byId(vacancyId),
    enabled: isLoggedIn,
    staleTime: 60_000,
  });

  const match = data?.match ?? null;
  const diff = data && data.viewerSkills ? skillDiff(data.skills, data.viewerSkills) : null;
  if (!match) return null;

  return (
    <section className="flex flex-col gap-3 border border-border bg-bg-card p-4">
      <div className="flex flex-wrap items-center gap-2 font-mono text-xs">
        <FitBadge
          tier={match.tier}
          percent={match.percent}
          tooltip={<span className="font-bold">Fit {match.percent}%</span>}
        />
        {!match.onStack ? (
          <span className="border border-text-muted px-2 py-[2px] uppercase tracking-wider text-text-muted">
            off-stack
          </span>
        ) : null}
      </div>

      {diff ? (
        <dl className="flex flex-col gap-2">
          <DiffRow tone="have" label="you have" skills={diff.have} />
          <DiffRow tone="missing" label="you're missing" skills={diff.missing} />
          <DiffRow tone="bonus" label="extra" skills={diff.bonus} />
        </dl>
      ) : null}
    </section>
  );
}

const TONE = {
  have: "border-success text-success",
  missing: "border-danger text-danger",
  bonus: "border-border text-text-muted",
} as const;

function DiffRow({
  tone,
  label,
  skills,
}: {
  tone: keyof typeof TONE;
  label: string;
  skills: NodeRef[];
}) {
  if (skills.length === 0) return null;
  return (
    <div className="flex flex-col gap-1">
      <dt className="font-mono text-2xs uppercase tracking-wider text-text-muted">
        {label} · {skills.length}
      </dt>
      <dd className="flex flex-wrap gap-1">
        {skills.map((s) => (
          <span key={s.id} className={`border px-1.5 py-[1px] font-mono text-2xs ${TONE[tone]}`}>
            {s.name}
          </span>
        ))}
      </dd>
    </div>
  );
}
