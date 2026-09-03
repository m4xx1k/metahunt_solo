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

// Freshness is always applied (no "any" window): the feed defaults to the last
// month. `freshness` is one of these tokens; the days map is the wire value.
export const FRESHNESS_DAYS: Record<string, number> = {
  month: 30,
  "2weeks": 14,
  week: 7,
};
export const DEFAULT_FRESHNESS = "month";

// Page size for the feed list (both the home feed and the /feed lab).
export const FEED_PAGE_SIZE = 20;

// Off-stack has no single default: the home feed has always shown those matches
// and has no toggle to bring them back, while the /feed lab hides them until
// asked (that opt-in IS the lab's point). So each route states its default and
// the filter only overrides it once the user has an opinion (MET-120).
export const HOME_INCLUDE_OFF_STACK = true;
export const LAB_INCLUDE_OFF_STACK = false;

// One superset shared by the feed (cold) and reverse-ATS (warm). Every field is
// cold-available except `minFitTier`, which needs a ranked result — so it is the
// only warm-only field. Enum arrays stay string-typed; the API client narrows
// them before the request.
export interface FilterState {
  /** IDs of roles to match (OR-combined). */
  roleIds: string[];
  /** IDs of required (must-have) skills. */
  skillIds: string[];
  excludedSkillIds: string[];
  /** IDs of domains to match (OR-combined). */
  domainIds: string[];
  sourceCode: string | null;
  /** Raw API enum values (OR-combined). */
  seniorities: string[];
  workFormats: string[];
  englishLevels: string[];
  employmentTypes: string[];
  /** Selected experience tokens ("0".."5" exact, "6+" = ≥6), OR-combined. */
  experienceYears: string[];
  /** Freshness window token (see FRESHNESS_DAYS); always set, defaults to month. */
  freshness: string;
  test: boolean | null;
  reservation: boolean | null;
  /** Warm-only: minimum coverage tier; needs a ranked (CV) result. */
  minFitTier: string | null;
  /**
   * Page order. `null` = untouched, so each lens applies its own locked
   * default (warm → Fit score, cold → freshest per unified-feed-score.md
   * §8.1). `"score"` = the user explicitly asked for best-fit (the full
   * path); `"date"` = explicitly freshest. The `null`/`"score"` split is
   * what lets the cold lens keep freshest-by-default while still offering a
   * working best-fit toggle.
   */
  sort: string | null;
  /** Warm-only: undefined = no stated preference, so the route's own default wins. */
  includeOffStack: boolean | undefined;
}

export const EMPTY_FILTERS: FilterState = {
  roleIds: [],
  skillIds: [],
  excludedSkillIds: [],
  domainIds: [],
  sourceCode: null,
  seniorities: [],
  workFormats: [],
  englishLevels: [],
  employmentTypes: [],
  experienceYears: [],
  freshness: DEFAULT_FRESHNESS,
  test: null,
  reservation: null,
  minFitTier: null,
  sort: null,
  includeOffStack: undefined,
};

export function countActiveFilters(filters: FilterState): number {
  return (
    filters.roleIds.length +
    filters.skillIds.length +
    filters.excludedSkillIds.length +
    filters.domainIds.length +
    (filters.sourceCode ? 1 : 0) +
    filters.seniorities.length +
    filters.workFormats.length +
    filters.englishLevels.length +
    filters.employmentTypes.length +
    filters.experienceYears.length +
    (filters.freshness !== DEFAULT_FRESHNESS ? 1 : 0) +
    (filters.test !== null ? 1 : 0) +
    (filters.reservation !== null ? 1 : 0) +
    (filters.minFitTier ? 1 : 0) +
    // Sort is an ordering, not a filter — only off-stack changes the result set,
    // and only once the user states a preference (undefined = the route default).
    (filters.includeOffStack === true ? 1 : 0)
  );
}

// FilterState keeps enum fields string-typed; narrow to the wire enum at the API
// boundary (values only ever come from the closed option sets). Empty → undefined
// so the request omits the key entirely.
export const asEnums = <T extends string>(v: string[]): T[] | undefined =>
  v.length > 0 ? (v as T[]) : undefined;

// The contract every filter-state backend satisfies (URL-backed on the feed;
// a local-useState backend could implement the same shape). Sections are
// driven through this, never through a concrete hook.
export interface FiltersApi {
  filters: FilterState;
  toggleRole: (id: string) => void;
  toggleSkill: (id: string) => void;
  toggleExcludedSkill: (id: string) => void;
  toggleDomain: (id: string) => void;
  setSource: (code: string | null) => void;
  toggleSeniority: (v: string) => void;
  toggleWorkFormat: (v: string) => void;
  toggleEnglishLevel: (v: string) => void;
  toggleEmploymentType: (v: string) => void;
  /** Toggle one experience token ("0".."5" or "6+") in the OR-set. */
  toggleExperience: (value: string) => void;
  setFreshness: (v: string) => void;
  setTest: (v: boolean | null) => void;
  setReservation: (v: boolean | null) => void;
  /** Warm-only coverage gate; a no-op source on the cold feed. */
  setMinFitTier: (v: string | null) => void;
  /** Page order: "score" | "date"; null clears it back to the lens default. */
  setSort: (v: string | null) => void;
  /** Warm-only: unhide vacancies outside the candidate's stack. */
  setIncludeOffStack: (v: boolean) => void;
  clear: () => void;
  activeCount: number;
}
