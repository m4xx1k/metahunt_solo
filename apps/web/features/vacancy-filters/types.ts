// Shared filter-widget types (tier-2). Decoupled from lib/api/aggregates on
// purpose: the widgets project only what the filter categories need, so
// any consumer (market feed, reverse-ATS) maps its own source into these
// shapes via an adapter.
//
// Skills are filtered as must-have by default — people search for what they
// need (must), not what's optional, so nice-to-have stays out of the way. The
// SkillScopeToggle (?nice=true → includeOptionalSkills) is the opt-in escape
// hatch that also matches nice-to-have. The `count` on a skill is the
// must-have count.

export interface OptionRow {
  id: string;
  label: string;
  count: number;
}

export interface SourceOption extends OptionRow {
  code: string;
}

// Derived from the /market/aggregates headline snapshot. Role/skill options
// are NOT here — they come from the full /feed catalog (facetsApi), so search
// can reach every node, not just the snapshot's top-N.
export interface FilterAggregates {
  total: number;
  sources: SourceOption[];
  /** Enum-keyed: `id` is the raw API value (e.g. `SENIOR`). */
  seniorities: OptionRow[];
  /** Enum-keyed: `id` is the raw API value (e.g. `REMOTE`). */
  workFormats: OptionRow[];
}

export interface FilterState {
  /** IDs of roles to match (OR-combined). */
  roleIds: string[];
  /** IDs of required (must-have) skills. */
  skillIds: string[];
  /** IDs of domains to match (OR-combined). */
  domainIds: string[];
  sourceCode: string | null;
  /** Raw API enum value or null. The widget layer stays string-typed; the
   *  API client narrows it before the request. */
  seniority: string | null;
  workFormat: string | null;
  /** Selected experience tokens ("0".."5" exact, "6+" = ≥6), OR-combined. */
  experienceYears: string[];
  test: boolean | null;
  reservation: boolean | null;
}

export const EMPTY_FILTERS: FilterState = {
  roleIds: [],
  skillIds: [],
  domainIds: [],
  sourceCode: null,
  seniority: null,
  workFormat: null,
  experienceYears: [],
  test: null,
  reservation: null,
};

// The contract every filter-state backend satisfies (URL-backed on the feed;
// a local-useState backend could implement the same shape). Sections are
// driven through this, never through a concrete hook.
export interface FiltersApi {
  filters: FilterState;
  toggleRole: (id: string) => void;
  toggleSkill: (id: string) => void;
  toggleDomain: (id: string) => void;
  setSource: (code: string | null) => void;
  setSeniority: (v: string | null) => void;
  setWorkFormat: (v: string | null) => void;
  /** Toggle one experience token ("0".."5" or "6+") in the OR-set. */
  toggleExperience: (value: string) => void;
  setTest: (v: boolean | null) => void;
  setReservation: (v: boolean | null) => void;
  clear: () => void;
  activeCount: number;
}
