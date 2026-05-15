import type { VacancyAggregates } from "@/lib/api/aggregates";
import type { FilterAggregates } from "@/components/data/vacancy-filters";

// Maps the real /vacancies/aggregates response into the shape the filter
// widgets expect. Only role / skills / source are surfaced on the landing
// page because those are the only filters the list endpoint accepts
// (ListVacanciesQuery has no has_test_assignment / has_reservation params).
//
// `test` / `reservation` are zeroed — the shared FilterAggregates type
// carries them for the lab's 5-section sandbox, but the landing sidebar
// never renders those sections, so no fake numbers leak to users.

const EMPTY_FLAG = { yes: 0, no: 0, unknown: 0 } as const;

export function toFilterAggregates(a: VacancyAggregates): FilterAggregates {
  return {
    total: a.total,
    roles: a.topRoles.map((r) => ({
      id: r.id,
      label: r.name,
      count: r.count,
    })),
    skills: a.topSkills.map((s) => ({
      id: s.id,
      label: s.name,
      count: s.count,
    })),
    sources: a.sources.map((s) => ({
      id: s.id,
      code: s.code,
      label: s.displayName,
      count: s.count,
    })),
    test: { ...EMPTY_FLAG },
    reservation: { ...EMPTY_FLAG },
  };
}
