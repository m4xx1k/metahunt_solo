"use client";

import { CandidateProfile } from "@/app/reverse-ats/_components/CandidateProfile";
import { SkillRecommendations } from "@/app/reverse-ats/_components/SkillRecommendations";
import { MatchFilters } from "@/app/reverse-ats/_components/MatchFilters";
import { Pagination } from "@/ui/navigation/Pagination";
import type { FiltersApi, OptionRow } from "@/features/vacancy-filters/types";
import { useMergedWarm } from "../_hooks/use-merged-warm";
import { WarmCard } from "./WarmCard";

// Warm lens body: ranked list under the active CV. Filters (warm) on the left,
// ranked WarmCards in the centre, CV profile + recommendations on the right.
// Reverse-ATS widgets are reused via import — a temporary coupling that
// dissolves at the PR4 flip. Uploaded CVs (not demo samples) get recommendations.
export function WarmBody({
  api,
  candidateId,
  domainOptions,
  profileTitle,
  profileRole,
  profileSeniority,
  showRecs,
}: {
  api: FiltersApi;
  candidateId: string;
  domainOptions?: OptionRow[];
  profileTitle: string;
  profileRole?: string | null;
  profileSeniority?: string | null;
  showRecs: boolean;
}) {
  const { data, rec, page, pageSize, busy, errorMsg, goToOffset } = useMergedWarm(
    candidateId,
    api.filters,
  );

  const candidateSkillIds = data?.resolved.matched.map((s) => s.id) ?? [];

  return (
    <div className="grid grid-cols-1 gap-6 xl:grid-cols-[240px_minmax(0,1fr)_300px] xl:items-start">
      <div className="flex flex-col gap-4 xl:sticky xl:top-24">
        <MatchFilters api={api} domainOptions={domainOptions} disabled={busy} />
      </div>

      <div className="flex flex-col gap-5">
        {errorMsg ? (
          <p className="border border-danger/40 bg-danger/5 px-4 py-3 font-mono text-sm text-danger">
            помилка: {errorMsg}
          </p>
        ) : null}
        {busy ? <p className="font-mono text-sm text-text-muted">ранжуємо…</p> : null}
        {!busy && data && data.items.length === 0 ? (
          <p className="border border-border bg-bg-card px-4 py-6 text-center font-mono text-sm text-text-muted">
            Немає збігів під це резюме — спробуй зняти фільтри або завантажити інше CV.
          </p>
        ) : null}

        {data?.items.map((item, i) => (
          <WarmCard
            key={item.vacancy.id}
            item={item}
            rank={(page - 1) * pageSize + i + 1}
            candidateSkillIds={candidateSkillIds}
          />
        ))}

        {data && data.total > pageSize ? (
          <div className="mt-2 border-t border-border pt-5">
            <Pagination
              total={data.total}
              limit={pageSize}
              offset={(page - 1) * pageSize}
              onNavigate={goToOffset}
            />
          </div>
        ) : null}
      </div>

      {data ? (
        <div className="order-first flex flex-col gap-4 xl:order-none xl:sticky xl:top-24">
          <CandidateProfile
            title={profileTitle}
            role={profileRole}
            seniority={profileSeniority}
            matched={data.resolved.matched}
            unmatched={data.resolved.unmatched}
            totalVacancies={data.total}
          />
          {showRecs && rec ? <SkillRecommendations rec={rec} /> : null}
        </div>
      ) : null}
    </div>
  );
}
