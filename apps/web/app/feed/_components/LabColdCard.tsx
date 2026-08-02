"use client";

import Link from "next/link";

import { VacancyCard } from "@/entities/vacancy/VacancyCard";
import { useAnalytics } from "@/lib/analytics/use-analytics";
import type { VacancyDto } from "@/lib/api/vacancies";

// Cold card: the same Fit slot the warm card has, but locked. A cold visitor is
// the majority of the traffic and today sees no score at all — showing the slot
// (rather than hiding it) is what makes the missing number ask for the CV.
export function LabColdCard({ vacancy }: { vacancy: VacancyDto }) {
  const analytics = useAnalytics();

  return (
    <div className="flex flex-col">
      <div className="flex flex-wrap items-center gap-3 border border-b-0 border-border bg-bg-card px-5 py-2.5 font-mono text-xs">
        <span
          aria-hidden
          className="inline-flex items-baseline gap-1.5 border border-dashed border-border-strong px-2 py-[2px] text-text-muted"
        >
          <span className="text-sm font-bold leading-none">— %</span>
          <span className="text-2xs font-bold uppercase tracking-wider">fit · locked</span>
        </span>
        <Link
          href="/match"
          onClick={() => analytics.feedScoreLocked(vacancy.id)}
          className="uppercase tracking-wider text-accent underline underline-offset-2 hover:text-text-primary"
        >
          add your CV to see the fit
        </Link>
      </div>

      <VacancyCard vacancy={vacancy} />
    </div>
  );
}
