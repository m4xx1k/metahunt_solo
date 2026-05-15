// Tier-2 vacancy filter widgets. Consumers (lab mock, landing real API)
// map their own aggregate source into FilterAggregates and drive the
// sections with a FiltersApi implementation (local React state via
// useFilters, or a URL-backed hook).

export type {
  OptionRow,
  SourceOption,
  SkillStat,
  FlagDistribution,
  FilterAggregates,
  FilterState,
} from "./types";
export { EMPTY_FILTERS } from "./types";

export { useFilters, type FiltersApi } from "./useFilters";

export { Section } from "./Section";
export { SelectRow } from "./SelectRow";
export { RoleSection } from "./RoleSection";
export { SkillsSection } from "./SkillsSection";
export { SourceSection } from "./SourceSection";
export { FlagSection } from "./FlagSection";
export { ActiveFiltersBar } from "./ActiveFiltersBar";
export { FilterSidebar } from "./FilterSidebar";
