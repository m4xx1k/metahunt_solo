import { skillDiff } from "@/entities/vacancy/skill-diff";
import type { MatchResponse, RankedVacancy, ScoreBreakdown, SkillRef } from "@/lib/api/ranking";
import type { ListVacanciesResponse, NodeRef, VacancyDto } from "@/lib/api/vacancies";

// Adapts the unified GET /feed response into the shape the warm lens's UI
// (WarmBody/WarmCard/CandidateProfile/MatchFilters) already expects, so none
// of that UI had to change when its data source moved off /ranking/match,
// /cv/:id/matches and /cv/samples/:id/matches (MET-144 step 7 — those
// endpoints are retiring; the unified path is what warm-query.ts's
// fetchMatch calls now). `unmatched` isn't part of the feed response at all
// — it's the candidate's own extraction gap, not a per-vacancy thing — so
// the caller supplies it separately, from GET /cv/:id.
//
// `RankedVacancy`'s per-skill weight is gone in every field this derives —
// `viewerSkills`/`vacancy.skills` (NodeRef, no weight) already lost it in
// MET-144 R4's skillDiff() move; `matched`/`diff.*` below carry `weight: 0`
// to satisfy `SkillRef`'s shape, not a real IDF weight. `CandidateProfile`'s
// sort-by-weight degrades to insertion order as a result — the same
// trade-off R4 already accepted for the cold/sample lens.
export function toMatchResponse(feed: ListVacanciesResponse, unmatched: string[]): MatchResponse {
  const viewerSkills = feed.viewerSkills ?? [];
  const matched: SkillRef[] = viewerSkills.map((s) => ({ ...s, weight: 0 }));
  return {
    resolved: { matched, unmatched },
    items: feed.items.map((v) => toRankedVacancy(v, viewerSkills)),
    page: feed.page,
    pageSize: feed.pageSize,
    total: feed.total,
    offStackHidden: feed.offStackHidden,
  };
}

const noWeight = (skills: NodeRef[]): SkillRef[] => skills.map((s) => ({ ...s, weight: 0 }));

function toRankedVacancy(vacancy: VacancyDto, viewerSkills: readonly NodeRef[]): RankedVacancy {
  const match = vacancy.match;
  const diff = skillDiff(vacancy.skills, viewerSkills);
  const requiredTotal = vacancy.skills.required.length;
  const matchedRequired = requiredTotal - diff.missing.length;
  // Same single-signal shape buildScoreBreakdown() builds server-side
  // (score.contract.ts) — coverage IS the score today, weight 1.
  const coverage = match?.coverage ?? 0;
  const breakdown: ScoreBreakdown = {
    total: coverage,
    signals: [{ kind: "skill-overlap", raw: coverage, weight: 1, contribution: coverage }],
  };
  return {
    vacancy,
    relevance: match?.relevance ?? 0,
    onStack: match?.onStack ?? true,
    fit: {
      tier: match?.tier ?? "STRETCH",
      percent: match?.percent ?? 0,
      matchedRequired,
      requiredTotal,
    },
    breakdown,
    diff: {
      have: noWeight(diff.have),
      missing: noWeight(diff.missing),
      bonus: noWeight(diff.bonus),
    },
  };
}
