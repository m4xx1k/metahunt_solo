"use client";

import { useCallback, useMemo, useState } from "react";
import { useSearchParams } from "next/navigation";

import { cn, STICKY_RAIL } from "@/lib/utils";
import { FilterRail } from "@/features/vacancy-filters/FilterRail";
import { SENIORITY_OPTIONS, WORK_FORMAT_OPTIONS } from "@/features/vacancy-filters/enum-options";
import { useResults } from "@/features/vacancy-filters/use-results";
import { useUrlFilters } from "@/features/vacancy-filters/use-url-filters";
import { LAB_INCLUDE_OFF_STACK } from "@/features/vacancy-filters/warm-query";
import type { OptionRow } from "@/features/vacancy-filters/types";
import { useShallowSearchParams } from "@/lib/hooks/use-shallow-search-params";
import { isUuid } from "@/lib/uuid";
import type { SampleCandidate } from "@/lib/api/cv";
import { Pagination } from "@/ui/navigation/Pagination";

import { LabColdCard } from "./LabColdCard";
import { LabControls } from "./LabControls";
import { LabWarmCard } from "./LabWarmCard";
import { LAB_PAGE_SIZE, toLabColdQuery } from "./lab-query";

// The lab feed's one island. Lens comes from ?cv (same convention as the home
// feed): cold shows locked score slots, warm shows the real Fit %. Both lenses
// run through the shared FiltersApi, so the sort and off-stack knobs are just
// two more URL params.
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

  const rawCv = searchParams.get("cv");
  const cv = rawCv && isUuid(rawCv) ? rawCv : null;
  // A seeded sample goes through the unified cold path (GET /feed?sample=) —
  // real Fit on every card, score/date toggle, off-stack unhide. An arbitrary
  // uploaded CV id can't (§8: /feed?sample= 404s on non-samples), so it stays
  // on the warm /ranking/match path until step 7 retires it.
  const isSample = cv != null && samples.some((s) => s.candidateId === cv);
  const lens = cv != null && !isSample ? "warm" : "cold";

  const setCv = useCallback(
    (id: string | null) => {
      setPage(1);
      push((n) => (id ? n.set("cv", id) : n.delete("cv")));
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
    () => toLabColdQuery(api.filters, page, isSample ? (cv ?? undefined) : undefined),
    [api.filters, page, cv, isSample],
  );
  const cold = useResults({ lens: "cold", query: coldQuery, enabled: lens === "cold" });
  const warm = useResults({
    lens: "warm",
    candidateId: cv ?? "",
    isSample,
    filters: api.filters,
    page,
    defaultIncludeOffStack: LAB_INCLUDE_OFF_STACK,
    enabled: lens === "warm",
  });

  const busy = lens === "warm" ? warm.isFetching : cold.isFetching;
  const total = (lens === "warm" ? warm.data?.total : cold.data?.total) ?? 0;
  const offStackHidden =
    (lens === "warm" ? warm.data?.offStackHidden : cold.data?.offStackHidden) ?? 0;
  const candidateSkillIds = warm.data?.resolved.matched.map((s) => s.id) ?? [];
  // The scored viewer's skills for the cold card's ✅/❌/➕ counts — parity
  // with the warm card, which reads the same set off `resolved.matched`.
  const coldViewerSkillIds = cold.data?.viewerSkills?.map((s) => s.id) ?? [];
  const hasViewer = cv != null;
  const goToOffset = useCallback(
    (offset: number) => setPage(Math.floor(offset / LAB_PAGE_SIZE) + 1),
    [],
  );

  return (
    <div className="flex flex-col gap-4">
      <div className="flex flex-wrap items-center gap-3 border border-border bg-bg-card px-4 py-2.5 font-mono text-2xs uppercase tracking-wider">
        <span className="text-text-muted">
          {lens === "warm"
            ? "scored against your CV"
            : hasViewer
              ? "scored against the sample CV"
              : "no CV — scores locked"}
        </span>
        {cv ? (
          <button
            type="button"
            onClick={() => setCv(null)}
            className="border border-border px-2 py-1 text-text-secondary transition-colors hover:border-accent hover:text-accent"
          >
            browse without a CV
          </button>
        ) : (
          samples.map((s) => (
            <button
              key={s.candidateId}
              type="button"
              onClick={() => setCv(s.candidateId)}
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
            lens={lens}
            seniorityOptions={SENIORITY_OPTIONS}
            workFormatOptions={WORK_FORMAT_OPTIONS}
            domainOptions={domainOptions}
            roleOptions={lens === "warm" ? roleOptions : undefined}
          />
        </aside>

        <div className="flex flex-col gap-4">
          {/* Both lenses now: the cold lens is freshest-by-default (§8.1) and
              its "best fit" button opts into the full path. Off-stack only
              hides on the full path, so the toggle self-suppresses at 0. */}
          <LabControls
            api={api}
            defaultSort={lens === "warm" ? "score" : "date"}
            offStackHidden={offStackHidden}
            disabled={busy}
          />

          <p className="font-mono text-xs text-text-muted">
            <span className="text-text-secondary">{total}</span> jobs
            {busy ? " · loading…" : ""}
          </p>

          <div className={cn("flex flex-col gap-4 transition-opacity", busy && "opacity-60")}>
            {lens === "warm"
              ? warm.data?.items.map((item) => (
                  <LabWarmCard
                    key={item.vacancy.id}
                    item={item}
                    candidateSkillIds={candidateSkillIds}
                  />
                ))
              : cold.data?.items.map((vacancy) => (
                  // hasViewer: no CV/sample → locked CTA; a seeded sample →
                  // real Fit badge + ✅/❌/➕ counts from `viewerSkills`, at
                  // parity with LabWarmCard.
                  <LabColdCard
                    key={vacancy.id}
                    vacancy={vacancy}
                    hasViewer={hasViewer}
                    viewerSkillIds={coldViewerSkillIds}
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
