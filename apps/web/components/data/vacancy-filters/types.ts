// Shared filter-widget types. Decoupled from lib/api/aggregates on
// purpose: the widgets project only what the filter categories need, so
// any consumer (lab mock, landing real API) maps its own source into
// these shapes via an adapter.
//
// Skills are filtered as must-have only. We don't expose nice-to-have to
// users: it's noise — people search for what they need (must), not what's
// optional. The `count` on a skill is the must-have count.

export interface OptionRow {
  id: string;
  label: string;
  count: number;
}

export interface SourceOption extends OptionRow {
  code: string;
}

export type SkillStat = OptionRow;

/** Distribution of a boolean flag across vacancies (e.g. has_test_assignment). */
export interface FlagDistribution {
  yes: number;
  no: number;
  unknown: number;
}

export interface FilterAggregates {
  total: number;
  roles: OptionRow[];
  skills: SkillStat[];
  sources: SourceOption[];
  test: FlagDistribution;
  reservation: FlagDistribution;
}

export interface FilterState {
  roleId: string | null;
  /** IDs of required (must-have) skills. */
  skillIds: string[];
  sourceCode: string | null;
  test: boolean | null;
  reservation: boolean | null;
}

export const EMPTY_FILTERS: FilterState = {
  roleId: null,
  skillIds: [],
  sourceCode: null,
  test: null,
  reservation: null,
};
