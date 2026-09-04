"use client";

import { useCallback, useMemo, useState } from "react";
import { useSearchParams } from "next/navigation";

import { cn, STICKY_RAIL } from "@/lib/utils";
import { FilterRail } from "@/features/vacancy-filters/FilterRail";
import { SENIORITY_OPTIONS, WORK_FORMAT_OPTIONS } from "@/features/vacancy-filters/enum-options";
import { useResults } from "@/features/vacancy-filters/use-results";
import { useUrlFilters } from "@/features/vacancy-filters/use-url-filters";
import type { OptionRow } from "@/features/vacancy-filters/types";
import { useShallowSearchParams } from "@/lib/hooks/use-shallow-search-params";
import { isUuid } from "@/lib/uuid";
import type { SampleCandidate } from "@/lib/api/cv";
import { Pagination } from "@/ui/navigation/Pagination";
import { VacancyMatchCard } from "@/entities/vacancy/VacancyMatchCard";

import { FeedListControls } from "@/features/vacancy-filters/FeedListControls";
import { LAB_PAGE_SIZE, toLabColdQuery } from "./lab-query";

// The lab feed's one island — the unified path, always (MET-144 step 7: this
// route never had a UI entry point into the warm lens, only "try <sample>"
// buttons, so there was nothing to collapse here — the lab was already the
// prototype for the unified shape). `?sample=` scores the page against an
// allowlisted seeded sample; there's no `?cv=` — a real CV is a production
// concern (login, upload, the CV switcher), not this dev/QA route's.
export function FeedLabShell({
  roleOptions,
  domainOptions,
  samples,
}: {
  roleOptions?: OptionRow[];
  domainOptions?: OptionRow[];
  samples: SampleCandidate[];
}) {
  const api = useUrlFilters();
  const searchParams = useSearchParams();
  const push = useShallowSearchParams();
  const [page, setPage] = useState(1);

  const rawSample = searchParams.get("sample");
  const sample =
    rawSample && isUuid(rawSample) && samples.some((s) => s.candidateId === rawSample)
      ? rawSample
      : null;
  const hasViewer = sample != null;

  const setSample = useCallback(
    (id: string | null) => {
      setPage(1);
      push((n) => (id ? n.set("sample", id) : n.delete("sample")));
    },
    [push],
  );

  // A filter change makes the current page number meaningless.
  const [prevFilters, setPrevFilters] = useState(api.filters);
  if (prevFilters !== api.filters) {
    setPrevFilters(api.filters);
    setPage(1);
  }

  const coldQuery = useMemo(
    () => toLabColdQuery(api.filters, page, sample ?? undefined),
    [api.filters, page, sample],
  );
  const cold = useResults({ query: coldQuery });

  const busy = cold.isFetching;
  const total = cold.data?.total ?? 0;
  const offStackHidden = cold.data?.offStackHidden ?? 0;
  // The scored viewer's skills for the card's ✅/❌/➕ counts (via skillDiff).
  const viewerSkills = cold.data?.viewerSkills ?? [];
  const goToOffset = useCallback(
    (offset: number) => setPage(Math.floor(offset / LAB_PAGE_SIZE) + 1),
    [],
  );

  return (
    <div className="flex flex-col gap-4">
      <div className="flex flex-wrap items-center gap-3 border border-border bg-bg-card px-4 py-2.5 font-mono text-2xs uppercase tracking-wider">
        <span className="text-text-muted">
          {hasViewer ? "scored against the sample CV" : "no CV — scores locked"}
        </span>
        {sample ? (
          <button
            type="button"
            onClick={() => setSample(null)}
            className="border border-border px-2 py-1 text-text-secondary transition-colors hover:border-accent hover:text-accent"
          >
            browse without a CV
          </button>
        ) : (
          samples.map((s) => (
            <button
              key={s.candidateId}
              type="button"
              onClick={() => setSample(s.candidateId)}
              className="border border-border px-2 py-1 text-text-secondary transition-colors hover:border-accent hover:text-accent"
            >
              try {s.label}
            </button>
          ))
        )}
      </div>

      <div className="grid grid-cols-1 gap-6 xl:grid-cols-[300px_minmax(0,1fr)] xl:items-start">
        <aside className={cn("flex flex-col border border-border bg-bg-card", STICKY_RAIL)}>
          <FilterRail
            api={api}
            lens="cold"
            hideFreshness
            seniorityOptions={SENIORITY_OPTIONS}
            workFormatOptions={WORK_FORMAT_OPTIONS}
            domainOptions={domainOptions}
            roleOptions={roleOptions}
          />
        </aside>

        <div className="flex flex-col gap-4">
          <div className="flex flex-wrap items-center justify-between gap-x-4 gap-y-2">
            <FeedListControls api={api} hasViewer={hasViewer} offStackHidden={offStackHidden} />
            <p className="font-mono text-xs text-text-muted">
              <span className="text-text-secondary">{total}</span> jobs
              {busy ? " · loading…" : ""}
            </p>
          </div>

          <div className={cn("flex flex-col gap-4 transition-opacity", busy && "opacity-60")}>
            {cold.data?.items.map((vacancy) => (
              // hasViewer: no sample → locked CTA; a seeded sample → real Fit
              // badge + ✅/❌/➕ counts from `viewerSkills`.
              <VacancyMatchCard
                key={vacancy.id}
                vacancy={vacancy}
                hasViewer={hasViewer}
                viewerSkills={viewerSkills}
              />
            ))}
          </div>

          {total === 0 && !busy ? (
            <p className="border border-border bg-bg-card px-4 py-6 text-center font-mono text-sm text-text-muted">
              Nothing here with the current filters.
            </p>
          ) : null}

          <Pagination
            total={total}
            limit={LAB_PAGE_SIZE}
            offset={(page - 1) * LAB_PAGE_SIZE}
            onNavigate={goToOffset}
          />
        </div>
      </div>
    </div>
  );
}
