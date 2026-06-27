import type { VacancyAggregates } from "@/lib/api/aggregates";
import { SENIORITY_VALUES, WORK_FORMAT_VALUES } from "@/lib/api/vacancies";
import {
  SENIORITY_LABELS,
  WORK_FORMAT_LABELS,
} from "@/lib/extracted-vacancy";
import type {
  FilterAggregates,
  OptionRow,
} from "@/features/vacancy-filters/types";

// Maps the /market/aggregates headline snapshot into the filter shapes for the
// closed-enum sections (sources, seniority, format). Role/skill options come
// from the full /feed catalog instead (facetsApi), not from this snapshot.

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
