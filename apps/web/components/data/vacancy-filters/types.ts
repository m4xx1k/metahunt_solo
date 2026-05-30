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

export interface FilterAggregates {
  total: number;
  roles: OptionRow[];
  skills: SkillStat[];
  sources: SourceOption[];
  /** Enum-keyed: `id` is the raw API value (e.g. `SENIOR`). */
  seniorities: OptionRow[];
  /** Enum-keyed: `id` is the raw API value (e.g. `REMOTE`). */
  workFormats: OptionRow[];
}

export interface FilterState {
  roleId: string | null;
  /** IDs of required (must-have) skills. */
  skillIds: string[];
  sourceCode: string | null;
  /** Raw API enum value or null. The widget layer stays string-typed; the
   *  API client narrows it before the request. */
  seniority: string | null;
  workFormat: string | null;
  test: boolean | null;
  reservation: boolean | null;
}

export const EMPTY_FILTERS: FilterState = {
  roleId: null,
  skillIds: [],
  sourceCode: null,
  seniority: null,
  workFormat: null,
  test: null,
  reservation: null,
};

// The contract every filter-state backend satisfies (URL-backed today;
// a local-useState backend could implement the same shape). Sections are
// driven through this, never through a concrete hook.
export interface FiltersApi {
  filters: FilterState;
  setRole: (id: string | null) => void;
  toggleSkill: (id: string) => void;
  setSource: (code: string | null) => void;
  setSeniority: (v: string | null) => void;
  setWorkFormat: (v: string | null) => void;
  setTest: (v: boolean | null) => void;
  setReservation: (v: boolean | null) => void;
  clear: () => void;
  activeCount: number;
}
