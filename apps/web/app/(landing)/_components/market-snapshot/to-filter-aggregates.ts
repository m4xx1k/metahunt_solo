import type { VacancyAggregates } from "@/lib/api/aggregates";
import { SENIORITY_VALUES, WORK_FORMAT_VALUES } from "@/lib/api/vacancies";
import {
  SENIORITY_LABELS,
  WORK_FORMAT_LABELS,
} from "@/lib/extracted-vacancy";
import type {
  FilterAggregates,
  OptionRow,
} from "@/components/data/vacancy-filters";

// Maps the real /vacancies/aggregates response into the shape the filter
// widgets expect. Counts are intentionally dropped — the widgets render
// labels only; the count field is kept solely so skills can sort by
// popularity in SkillsSection.

// Distribution → option rows in canonical enum order (not by count:
// seniority has an inherent progression), dropping empty buckets so the
// sidebar never offers a filter that yields zero results.
function distToOptions<T extends string>(
  order: readonly T[],
  labels: Record<T, string>,
  dist: Record<T, number>,
): OptionRow[] {
  return order
    .filter((v) => dist[v] > 0)
    .map((v) => ({ id: v, label: labels[v], count: dist[v] }));
}

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
    seniorities: distToOptions(
      SENIORITY_VALUES,
      SENIORITY_LABELS,
      a.seniorityDist,
    ),
    workFormats: distToOptions(
      WORK_FORMAT_VALUES,
      WORK_FORMAT_LABELS,
      a.workFormatDist,
    ),
  };
}
